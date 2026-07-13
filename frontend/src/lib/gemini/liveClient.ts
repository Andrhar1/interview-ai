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
  /**
   * Manual retry ("Coba sekarang"). Re-opens THIS instance, reusing its
   * session-resumption handle, so a mid-interview retry continues the same
   * conversation and the AI does not greet again. Never throws: failures land
   * in onStateChange('error') + onError, so the UI can offer another retry.
   */
  reconnect(): Promise<void>;
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
const MAX_KICKOFF_ATTEMPTS = 3;
const KICKOFF_RETRY_DELAY_MS = 600;

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
}

/**
 * A sleep that can be cut short. Returns the promise plus a `cancel` that
 * resolves it immediately — used so a manual retry during a reconnect backoff
 * fires the pending attempt now instead of leaving the button dead for up to
 * 4 seconds.
 */
function cancellableSleep(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    done = resolve;
    timer = setTimeout(resolve, ms);
  });
  return {
    promise,
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer);
      done?.();
    },
  };
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
  // Set while an auto-reconnect is waiting out its backoff; calling it makes
  // that pending attempt fire immediately (manual "Coba sekarang").
  let pendingBackoff: (() => void) | null = null;
  // Monotonic id: each connection attempt bumps it so callbacks from a
  // superseded (stale/failed) socket are ignored.
  let activeGen = 0;
  // Gemini Live stays silent until it receives input. The kickoff turn is what
  // makes the interviewer greet and ask the first question by itself. It never
  // reaches the UI/DB transcript: it is sent as a text turn, while the user
  // transcript only comes from inputAudioTranscription.
  //
  // INVARIANT: kickoff iff the session we just opened has NO history — which is
  // exactly "we opened it without a resumption handle" (see openConnection).
  // These two flags are therefore per-CONNECTION delivery bookkeeping (did the
  // send land, how many times have we tried), NOT a lifetime "already greeted"
  // latch. Both are reset at the top of every openConnection.
  let kickoffDelivered = false;
  let kickoffAttempts = 0;
  // Has the MODEL ever produced output in this interview? This — not "did our
  // kickoff send return without throwing" — is what proves a resumption handle
  // points at a session with real conversation history.
  //
  // sendClientContent on an open-but-dying socket can buffer the frame and
  // return normally, so a successful local send proves nothing about what the
  // server received. If we treated that as history and a handle had already
  // arrived, a later reconnect would resume a session that never got the
  // kickoff: no history to restore, and — having a handle — no kickoff either.
  // The AI would stay silent forever. Server output is the only honest signal.
  let modelHasSpoken = false;

  // The handle to (re)open with: only a handle from a session the model has
  // actually spoken in carries conversation history.
  function historyHandle(): string | undefined {
    return modelHasSpoken ? resumptionHandle : undefined;
  }

  function setState(next: ConnState): void {
    if (state === next) return;
    state = next;
    handlers.onStateChange(next);
  }

  // Model output audio, read from `msg.data` (the SDK's built-in accessor)
  // with a fallback to `inlineData.data`. Deliberately NOT filtered by
  // mimeType: filtering would silently drop all audio if a model ever omits
  // the mimeType. Returns true if any audio was emitted.
  function emitAudio(msg: LiveServerMessage): boolean {
    if (msg.data) {
      handlers.onAudioChunk(msg.data);
      return true;
    }
    let emitted = false;
    for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        handlers.onAudioChunk(part.inlineData.data);
        emitted = true;
      }
    }
    return emitted;
  }

  function handleMessage(msg: LiveServerMessage): void {
    if (msg.sessionResumptionUpdate?.newHandle) {
      resumptionHandle = msg.sessionResumptionUpdate.newHandle;
    }

    // First server output = this session provably has conversation history.
    if (emitAudio(msg)) modelHasSpoken = true;

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.inputTranscription?.text) handlers.onInputTranscript(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) {
      modelHasSpoken = true;
      handlers.onOutputTranscript(sc.outputTranscription.text);
    }

    // Barge-in first so playback is cleared before the turn is marked done.
    if (sc.interrupted) handlers.onInterrupted();
    if (sc.turnComplete) handlers.onTurnComplete();
  }

  // Only called by openConnection, and only for a session opened WITHOUT a
  // resumption handle (i.e. one with no history — see the invariant above).
  //
  // A throwing send on an otherwise-open socket would leave the model silent
  // forever, so it is retried a few times; if it still fails the session goes
  // to 'error' so the UI can offer a manual retry ("Coba sekarang"), which
  // re-opens the socket and — still having no handle — kicks off again.
  function sendKickoff(s: Session): void {
    if (kickoffDelivered || closing) return;
    const myGen = activeGen;
    try {
      s.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: KICKOFF_PROMPT }] }],
        turnComplete: true,
      });
      // Only records that the local send did not throw, so we don't send it
      // twice. It does NOT mean the server received it — see modelHasSpoken.
      kickoffDelivered = true;
    } catch (e) {
      kickoffAttempts += 1;
      if (kickoffAttempts >= MAX_KICKOFF_ATTEMPTS) {
        setState('error');
        handlers.onError(toError(e));
        return;
      }
      setTimeout(() => {
        if (closing || kickoffDelivered || myGen !== activeGen || session !== s) return;
        sendKickoff(s);
      }, KICKOFF_RETRY_DELAY_MS);
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
    const backoff = cancellableSleep(backoffDelay(reconnectAttempts));
    pendingBackoff = backoff.cancel;
    await backoff.promise;
    pendingBackoff = null;
    if (closing) {
      reconnectInFlight = false;
      return;
    }

    try {
      await openConnection(historyHandle());
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
    // Per-connection kickoff bookkeeping (the decision to kick off at all is
    // made below, from `handle`).
    kickoffDelivered = false;
    kickoffAttempts = 0;

    // Tokens are single-use (uses:1), so we re-mint on every (re)connect.
    const { token, model } = await apiRequest<{ token: string; model: string }>(
      `/sessions/${sessionId}/token`,
      { method: 'POST' },
    );

    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: API_VERSION } });

    // The persona/model/voice config is locked into the token server-side (the
    // token is minted with lockAdditionalFields: [], so sessionResumption is
    // the ONE field we are allowed to set). Always send it: on a brand-new
    // session `{}` is what asks the server to START issuing resumption
    // handles, and a resumed session needs it too — otherwise it would never
    // be handed a fresh handle and a SECOND drop would have nothing to resume.
    const config: LiveConnectConfig = {
      sessionResumption: handle ? { handle } : {},
    };

    const next = await ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          if (myGen !== activeGen || closing) return;
          reconnectAttempts = 0;
          // Don't overwrite an 'error' raised for THIS connection (a kickoff
          // that exhausted its retries): the socket is open but the session is
          // unusable, and 'connected' would hide the overlay that offers the
          // only way out.
          if (state === 'error') return;
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

    // THE invariant: kickoff iff this session has no conversation history.
    // - opened WITH a handle  → history restored → kicking off would make the
    //   AI greet again mid-interview (and re-ask question 1).
    // - opened WITHOUT a handle → brand-new session with no memory → without a
    //   kickoff the model has nothing to respond to and stays silent forever.
    //   This covers the first connect AND a drop that happens before the first
    //   sessionResumptionUpdate arrives — greeting again is correct there,
    //   because the model genuinely remembers nothing.
    if (!handle) sendKickoff(next);
  }

  // Manual retry from the UI. Re-opens the SAME instance so the closure state
  // that makes a mid-interview retry safe survives — above all the resumption
  // handle, which both continues the conversation and (per the invariant in
  // openConnection) suppresses a second greeting.
  async function reconnect(): Promise<void> {
    if (closing) return;
    // An auto-reconnect is already scheduled or under way. Starting a second
    // one would race two sockets, so instead we collapse the remaining backoff
    // (0.5–4s) and let the pending attempt fire NOW — otherwise the button
    // would be visibly dead for the whole wait.
    if (reconnectInFlight) {
      pendingBackoff?.();
      return;
    }
    reconnectInFlight = true;
    reconnectAttempts = 0;
    setState('reconnecting');

    // Invalidate the old socket's callbacks before closing it, so its onclose
    // can't be mistaken for a fresh drop and schedule a competing reconnect.
    activeGen += 1;
    try {
      session?.close();
    } catch {
      /* already closed / never opened */
    }
    session = null;

    try {
      await openConnection(historyHandle());
    } catch (e) {
      if (!closing) {
        setState('error');
        handlers.onError(toError(e));
      }
    } finally {
      reconnectInFlight = false;
    }
  }

  async function close(): Promise<void> {
    if (closing) return; // idempotent
    closing = true;
    // Invalidate any in-flight attempt and pending reconnect callbacks. Also
    // release a backoff that is still sleeping, so it wakes, sees `closing`
    // and unwinds instead of holding a timer past teardown.
    activeGen += 1;
    pendingBackoff?.();
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
    reconnect,
    close,
    get state(): ConnState {
      return state;
    },
  };
}
