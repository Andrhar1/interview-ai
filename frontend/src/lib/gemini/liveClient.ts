/**
 * UI-agnostic wrapper around `@google/genai`'s Live API.
 *
 * Responsibilities:
 * - Mint an ephemeral token from our backend (the interview persona/config is
 *   locked server-side; the long-lived API key never reaches the browser).
 * - Open a WSS **directly to Gemini** (audio never touches our server).
 * - Map raw server messages onto a small handler interface.
 * - Track connection state; reconnect on unexpected drops via session
 *   resumption with a capped backoff; close gracefully with no leaked socket.
 *
 * This module is deliberately free of React and of the audio capture/playback
 * code: it only *produces* base64 PCM to send (from callers) and *emits* the
 * base64 PCM it receives (to callers) through the handler interface.
 *
 * SECURITY: never log the ephemeral token.
 */

import { GoogleGenAI } from '@google/genai';
import type { LiveConnectConfig, LiveServerMessage, Session } from '@google/genai';
import { apiRequest } from '../api';

export type ConnState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

export interface LiveInterviewHandlers {
  onStateChange(state: ConnState): void;
  onInputTranscript(textDelta: string): void; // user speech (may be partial/incremental)
  onOutputTranscript(textDelta: string): void; // AI speech (may be partial/incremental)
  onAudioChunk(pcmBase64: string): void; // 24kHz AI audio → feed AudioPlayback.enqueue
  onTurnComplete(): void;
  onInterrupted(): void; // server barge-in → AudioPlayback.clear()
  onError(err: Error): void;
}

export interface LiveInterview {
  sendAudio(pcmBase64: string): void; // → session.sendRealtimeInput audio
  close(): Promise<void>; // explicit graceful close; no reconnect after
  readonly state: ConnState;
}

const API_VERSION = 'v1alpha';
const INPUT_AUDIO_MIME = 'audio/pcm;rate=16000';
const KICKOFF_PROMPT =
  'Mulai wawancara sekarang. Sapa kandidat dengan singkat, lalu langsung ajukan pertanyaan pertama.';
const MAX_RECONNECT_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 4000;

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createLiveInterview(
  sessionId: string,
  handlers: LiveInterviewHandlers,
): Promise<LiveInterview> {
  let state: ConnState = 'idle';
  let session: Session | null = null;
  // Latest resumption handle from the server; used to resume on reconnect.
  let resumptionHandle: string | undefined;
  // Set once close() is called — permanently disables reconnect.
  let closing = false;
  let reconnectAttempts = 0;
  // Guards against onerror + onclose both firing for the same drop and
  // scheduling two concurrent reconnect attempts.
  let reconnectInFlight = false;
  // Monotonic id: each connection attempt bumps it so callbacks from a
  // superseded (stale/failed) socket are ignored.
  let activeGen = 0;
  // Gemini Live tidak bicara sampai menerima input. Satu giliran pemicu ini
  // membuat pewawancara menyapa + mengajukan pertanyaan pertama sendiri.
  // Teks pemicu TIDAK pernah masuk ke transkrip UI/DB: ia dikirim sebagai text
  // turn, sedangkan transkrip pengguna hanya berasal dari inputAudioTranscription.
  let kickoffSent = false;

  function setState(next: ConnState): void {
    if (state === next) return;
    state = next;
    handlers.onStateChange(next);
  }

  // Audio keluaran model. Diambil dari `msg.data` (accessor bawaan SDK) dengan
  // fallback ke `inlineData.data`. Sengaja TIDAK disaring berdasarkan mimeType:
  // menyaringnya akan membuang seluruh audio diam-diam bila suatu model tidak
  // mengirim mimeType.
  function emitAudio(msg: LiveServerMessage): void {
    if (msg.data) {
      handlers.onAudioChunk(msg.data);
      return;
    }
    for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) handlers.onAudioChunk(part.inlineData.data);
    }
  }

  function handleMessage(msg: LiveServerMessage): void {
    if (msg.sessionResumptionUpdate?.newHandle) {
      resumptionHandle = msg.sessionResumptionUpdate.newHandle;
    }

    emitAudio(msg);

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.inputTranscription?.text) handlers.onInputTranscript(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) handlers.onOutputTranscript(sc.outputTranscription.text);

    // Barge-in first so playback is cleared before the turn is marked done.
    if (sc.interrupted) handlers.onInterrupted();
    if (sc.turnComplete) handlers.onTurnComplete();
  }

  // Hanya untuk koneksi PERTAMA. Saat reconnect (session resumption) riwayat
  // sudah dipulihkan, jadi mengirim ulang pemicu akan membuat AI mengulang
  // sapaannya di tengah sesi.
  function sendKickoff(s: Session): void {
    if (kickoffSent || closing) return;
    try {
      s.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: KICKOFF_PROMPT }] }],
        turnComplete: true,
      });
      kickoffSent = true;
    } catch (e) {
      handlers.onError(toError(e));
    }
  }

  // Called on an unexpected onerror/onclose. Never fires after close(). Both
  // callbacks can fire for the same drop, so this is also guarded against
  // scheduling two concurrent reconnect attempts.
  function handleDrop(err: Error): void {
    if (closing || reconnectInFlight) return;
    void scheduleReconnect(err);
  }

  async function scheduleReconnect(err: Error): Promise<void> {
    if (closing) return;

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      setState('error');
      handlers.onError(err);
      return;
    }

    reconnectInFlight = true;
    reconnectAttempts += 1;
    setState('reconnecting');
    await sleep(backoffDelay(reconnectAttempts));
    if (closing) {
      reconnectInFlight = false;
      return;
    }

    try {
      await openConnection(resumptionHandle);
      reconnectInFlight = false;
    } catch (e) {
      reconnectInFlight = false;
      await scheduleReconnect(toError(e));
    }
  }

  // Mints a fresh single-use token and opens a new socket. Bumps activeGen so
  // that only the newest connection's callbacks are honoured.
  async function openConnection(handle: string | undefined): Promise<void> {
    const myGen = ++activeGen;

    // Tokens are single-use (uses:1), so we re-mint on every (re)connect.
    const { token, model } = await apiRequest<{ token: string; model: string }>(
      `/sessions/${sessionId}/token`,
      { method: 'POST' },
    );

    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: API_VERSION } });

    // The persona/model config is locked into the token server-side; we only
    // supply a resumption handle when reconnecting.
    const config: LiveConnectConfig = handle ? { sessionResumption: { handle } } : {};

    const next = await ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          if (myGen !== activeGen || closing) return;
          reconnectAttempts = 0;
          setState('connected');
        },
        onmessage: (msg: LiveServerMessage) => {
          if (myGen !== activeGen || closing) return;
          handleMessage(msg);
        },
        onerror: (e: ErrorEvent) => {
          if (myGen !== activeGen) return;
          handleDrop(toError(e.error ?? e.message ?? 'Koneksi Gemini bermasalah'));
        },
        onclose: (e: CloseEvent) => {
          if (myGen !== activeGen) return;
          handleDrop(new Error(e.reason || 'Koneksi Gemini terputus'));
        },
      },
      config,
    });

    // Guard against a close()/newer-attempt that landed while we awaited.
    if (myGen !== activeGen || closing) {
      next.close();
      return;
    }
    session = next;
    sendKickoff(next);
  }

  async function close(): Promise<void> {
    if (closing) return; // idempotent
    closing = true;
    // Invalidate any in-flight attempt and pending reconnect callbacks.
    activeGen += 1;
    try {
      session?.close();
    } catch {
      /* already closed / never opened */
    }
    session = null;
    setState('closed');
  }

  setState('connecting');
  try {
    await openConnection(undefined);
  } catch (e) {
    setState('error');
    throw toError(e);
  }

  return {
    sendAudio(pcmBase64: string): void {
      if (state !== 'connected' || !session) return;
      session.sendRealtimeInput({ audio: { data: pcmBase64, mimeType: INPUT_AUDIO_MIME } });
    },
    close,
    get state(): ConnState {
      return state;
    },
  };
}
