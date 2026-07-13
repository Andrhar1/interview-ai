import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest, ApiError } from '../lib/api';
import { createLiveInterview, type ConnState, type LiveInterview } from '../lib/gemini/liveClient';
import { createMicCapture, type MicCapture } from '../lib/audio/capture';
import { createAudioPlayback, type AudioPlayback } from '../lib/audio/playback';
import { useLocalSpeechDetection } from '../hooks/useLocalSpeechDetection';
import type {
  AnalyzeResponse,
  Evaluation,
  SessionDetailResponse,
  TranscriptExchange,
} from '../types/session';
import type { MicState, SpeakerState, TranscriptBubbleData } from '../features/session/types';
import { SessionTopBar } from '../features/session/SessionTopBar';
import { AudioVisualizer } from '../features/session/AudioVisualizer';
import { QuestionCard } from '../features/session/QuestionCard';
import { MicControl } from '../features/session/MicControl';
import { TranscriptPanel } from '../features/session/TranscriptPanel';
import { ReconnectOverlay } from '../features/session/ReconnectOverlay';
import { EndConfirmModal } from '../features/session/EndConfirmModal';
import { PreSessionCard } from '../features/session/PreSessionCard';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

function fmtElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function appendOrOpen(
  prev: TranscriptBubbleData[],
  role: 'ai' | 'user',
  delta: string,
): TranscriptBubbleData[] {
  const last = prev[prev.length - 1];
  if (last && last.role === role && !last.final) {
    const next = [...prev];
    next[next.length - 1] = { ...last, text: last.text + delta };
    return next;
  }
  // A different (or no) role was open — finalize it before opening the new bubble.
  const closed = last && !last.final ? [...prev.slice(0, -1), { ...last, final: true }] : prev;
  return [...closed, { role, text: delta, final: false }];
}

/**
 * Live Interview Session — Variant "Klasik" (two-column) only, per plan §0.
 * Wires the Live client (Task 3) + audio pipeline (Task 2) into the voice
 * interview UI, then ends the session via analyze → end → Result.
 */
export function Session() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Session meta (top bar title/context) — best-effort, non-blocking.
  const [fieldTitle, setFieldTitle] = useState('Wawancara');
  const [context, setContext] = useState('Konteks umum');

  const [started, setStarted] = useState(false);
  const [connState, setConnState] = useState<ConnState>('idle');
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [micState, setMicState] = useState<MicState>('disabled');
  const [speaker, setSpeaker] = useState<SpeakerState>('idle');
  const [transcript, setTranscript] = useState<TranscriptBubbleData[]>([]);
  // Whether there's unflushed user speech for the CURRENT turn — drives the
  // 3-dot placeholder bubble. The text itself lives in pendingUserTextRef
  // (below), never in state: it must never be rendered as a running bubble
  // (see appendOrOpen's comment for why — that's the lagging-caption promise
  // this whole change removes). flushPendingUser() settles it into one final
  // bubble once the turn is over.
  const [userTyping, setUserTyping] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const liveRef = useRef<LiveInterview | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const playbackRef = useRef<AudioPlayback | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const tornRef = useRef(false);
  const micStateRef = useRef<MicState>('disabled');
  const retryingRef = useRef(false);
  // Accumulates onInputTranscript deltas for the user's current, unflushed
  // turn. A ref (not state) because it's written from handlers created once
  // inside connect() (closed over stale state otherwise) and because
  // confirmEnd() needs a synchronous read of "whatever's pending right now"
  // — see flushPendingUser() and confirmEnd() below.
  const pendingUserTextRef = useRef('');
  // Debounce timer: flush pendingUserTextRef after ~1.2s with no new
  // inputTranscript delta (brief's rule (b) for "turn is over").
  const debounceTimerRef = useRef<number | null>(null);
  // Mirrors the local-speech-detection boolean (see below) for the same
  // stale-closure reason as micStateRef.
  const isUserSpeakingRef = useRef(false);
  // Bumped by every connect() call and by teardown(); lets an in-flight
  // createLiveInterview() detect it has been superseded (a newer connect(),
  // a manual retry, or an unmount/beforeunload) by the time it resolves —
  // notably including React 18 StrictMode's dev-only mount→cleanup→mount,
  // where the effect's cleanup can otherwise run before the first
  // createLiveInterview() promise settles and liveRef gets populated.
  const connectGenRef = useRef(0);

  useEffect(() => {
    micStateRef.current = micState;
  }, [micState]);

  // Zero-lag "is the user speaking right now" signal, read straight off the
  // mic AnalyserNode (see hooks/useLocalSpeechDetection.ts). UI ONLY — never
  // used to gate sendAudio.
  const isUserSpeaking = useLocalSpeechDetection(captureRef.current?.analyser ?? null);

  useEffect(() => {
    isUserSpeakingRef.current = isUserSpeaking;
  }, [isUserSpeaking]);

  // speaker state machine, driven by the local signal (instant), not by
  // server transcript events (laggy — see the Fase 3 liveness brief):
  // user starts speaking -> 'user' immediately, from ANY prior state
  // (including barge-in while speaker === 'ai'). user goes quiet while we
  // were in 'user' -> 'thinking' (waiting on the AI's reply, which the
  // onAudioChunk/onOutputTranscript handlers below will flip to 'ai').
  // Any other transition (idle<->thinking<->ai) is left to those handlers.
  useEffect(() => {
    if (isUserSpeaking) {
      setSpeaker('user');
    } else {
      setSpeaker((prev) => (prev === 'user' ? 'thinking' : prev));
    }
  }, [isUserSpeaking]);

  // Settle the pending user buffer into one final bubble. Called when the
  // user's turn is over: either the AI's reply starts arriving (called from
  // onAudioChunk/onOutputTranscript below), or ~1.2s pass with no new
  // inputTranscript delta (the debounce timer below). Idempotent — a no-op
  // if there's nothing pending.
  const flushPendingUser = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const text = pendingUserTextRef.current.trim();
    pendingUserTextRef.current = '';
    setUserTyping(false);
    if (text.length === 0) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      // Defensive: settle any still-open bubble of a different role first
      // (mirrors appendOrOpen's rule) — in the normal flow the last bubble
      // is already final (the AI's previous turn), so this is a no-op.
      const closed = last && !last.final ? [...prev.slice(0, -1), { ...last, final: true }] : prev;
      return [...closed, { role: 'user', text, final: true }];
    });
  }, []);

  // --- teardown: stop capture, close live socket, close playback, clear timer.
  // Idempotent — safe to call from unmount, beforeunload, and the end flow.
  const teardown = useCallback(async () => {
    connectGenRef.current += 1; // invalidate any in-flight connect()
    if (tornRef.current) return;
    tornRef.current = true;
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const closes: Promise<unknown>[] = [];
    // close() (not stop()) — stop() only suspends the 16kHz AudioContext, and
    // browsers cap the number of live contexts per document, so suspending on
    // every session would eventually make `new AudioContext()` throw.
    if (captureRef.current) closes.push(captureRef.current.close());
    if (liveRef.current) closes.push(liveRef.current.close());
    if (playbackRef.current) closes.push(playbackRef.current.close());
    await Promise.allSettled(closes);
    liveRef.current = null;
    playbackRef.current = null;
    captureRef.current = null;
  }, []);

  const startMic = useCallback(() => {
    if (captureRef.current) return; // already created (e.g. after a reconnect)
    let capture: MicCapture;
    try {
      // `new AudioContext()` inside createMicCapture can throw synchronously
      // (e.g. the browser's per-document context cap).
      capture = createMicCapture((pcm) => liveRef.current?.sendAudio(pcm));
    } catch {
      setMicState('denied');
      return;
    }
    captureRef.current = capture;
    capture
      .start()
      .then(() => setMicState('unmuted'))
      .catch(() => setMicState('denied'));
  }, []);

  const startTimer = useCallback(() => {
    if (timerIntervalRef.current !== null) return;
    startedAtRef.current = Date.now();
    timerIntervalRef.current = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
  }, []);

  // --- connect: creates a NEW live client. Called from the "Mulai Wawancara"
  // click handler, and from retry() only when no client was ever established
  // (the very first connect failed — see the retry affordance on the
  // full-connect overlay). A mid-interview retry must go through
  // LiveInterview.reconnect() instead, so the client's session-resumption
  // handle survives and the interview resumes instead of restarting.
  const connect = useCallback(async () => {
    if (!id) return;
    const myGen = ++connectGenRef.current;
    setConnectError(null);
    try {
      if (liveRef.current) {
        try {
          await liveRef.current.close();
        } catch {
          /* already closed */
        }
        liveRef.current = null;
      }
      if (myGen !== connectGenRef.current) return; // superseded while closing the old client
      setConnState('connecting');
      const live = await createLiveInterview(id, {
        onStateChange: (s) => {
          if (myGen !== connectGenRef.current) return;
          setConnState(s);
          if (s === 'connected') {
            setHasConnectedOnce(true);
            startTimer();
            startMic();
          }
        },
        onInputTranscript: (delta) => {
          if (myGen !== connectGenRef.current) return;
          // Never rendered live (see appendOrOpen's comment) — just buffered
          // until the turn settles. Debounce rule (b): flush after ~1.2s of
          // no new delta.
          pendingUserTextRef.current += delta;
          setUserTyping(true);
          if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = window.setTimeout(() => {
            debounceTimerRef.current = null;
            flushPendingUser();
          }, 1200);
        },
        onOutputTranscript: (delta) => {
          if (myGen !== connectGenRef.current) return;
          // Debounce rule (a): the AI's reply starting is itself proof the
          // user's turn is over — flush immediately rather than waiting out
          // the 1.2s debounce.
          flushPendingUser();
          setSpeaker('ai');
          setTranscript((prev) => appendOrOpen(prev, 'ai', delta));
        },
        onAudioChunk: (b64) => {
          if (myGen !== connectGenRef.current) return;
          flushPendingUser(); // same rule (a) — the AI audio itself is the signal
          setSpeaker('ai');
          playbackRef.current?.enqueue(b64);
        },
        onTurnComplete: () => {
          if (myGen !== connectGenRef.current) return;
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'ai' && !last.final) {
              const next = [...prev];
              next[next.length - 1] = { ...last, final: true };
              return next;
            }
            return prev;
          });
          // Read the LOCAL speech signal (instant), not micState: the user
          // may already be mid-sentence again by the time the AI's turn
          // completes.
          setSpeaker(isUserSpeakingRef.current ? 'user' : 'idle');
        },
        onInterrupted: () => {
          if (myGen !== connectGenRef.current) return;
          playbackRef.current?.clear();
        },
        onError: (err) => {
          if (myGen !== connectGenRef.current) return;
          // Never render the raw SDK error: it can embed the WSS URL, which
          // carries the single-use ephemeral token.
          console.error('[live] session error:', err.name);
          setConnectError('Koneksi ke pewawancara AI bermasalah.');
        },
      });
      if (myGen !== connectGenRef.current) {
        // A newer connect() (retry) or teardown() (unmount/beforeunload —
        // notably including React StrictMode's dev-only double-invoke)
        // superseded this attempt while we were awaiting the socket open.
        // Close it immediately so it doesn't leak.
        void live.close();
        return;
      }
      liveRef.current = live;
    } catch (err) {
      if (myGen !== connectGenRef.current) return; // superseded; ignore stale error
      // Same reason as onError: keep the raw message out of the DOM.
      console.error('[live] connect failed:', err instanceof Error ? err.name : 'unknown');
      setConnState('error');
      setConnectError('Gagal terhubung ke pewawancara AI. Coba lagi.');
    }
  }, [id, startMic, startTimer, flushPendingUser]);

  // --- mount: fetch session meta only. Playback/mic/connect are deferred to
  // handleStart() (the "Mulai Wawancara" user gesture) — this effect only
  // sets up teardown on unmount and on tab close (beforeunload), so no
  // leaked mic/WS whether or not the user ever starts (Reliability NFR).
  useEffect(() => {
    if (!id) return;
    tornRef.current = false;
    isMountedRef.current = true;

    (async () => {
      try {
        const detail = await apiRequest<SessionDetailResponse>(`/sessions/${id}`);
        setFieldTitle(detail.session.job_field_name || 'Wawancara');
        setContext(
          detail.session.job_title
            ? detail.session.job_title + (detail.session.company ? ` · ${detail.session.company}` : '')
            : 'Konteks umum',
        );
      } catch {
        /* non-critical — keep the fallback title/context */
      }
    })();

    function onBeforeUnload() {
      void teardown();
    }
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', onBeforeUnload);
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Everything that needs a user gesture runs INSIDE this click handler:
  // resume() unlocks autoplay, startMic() triggers the mic permission
  // prompt. Do not insert an `await` before either — that would break the
  // gesture chain.
  function handleStart() {
    if (started) return;
    const playback = createAudioPlayback();
    playbackRef.current = playback;
    void playback.resume();
    setStarted(true);
    startMic();
    void connect();
  }

  function toggleMic() {
    const capture = captureRef.current;
    if (!capture) return;
    if (micState === 'unmuted') {
      capture.stop();
      setMicState('muted');
    } else if (micState === 'muted') {
      capture
        .start()
        .then(() => setMicState('unmuted'))
        .catch(() => setMicState('denied'));
    } else if (micState === 'denied') {
      capture
        .start()
        .then(() => setMicState('unmuted'))
        .catch(() => setMicState('denied'));
    }
  }

  // Manual retry. Re-opens the EXISTING live client whenever we have one: that
  // keeps its session-resumption handle, so the interview resumes where it
  // dropped instead of the AI greeting again and re-asking question 1. A fresh
  // connect() is only correct when nothing was ever established — i.e. the very
  // first connect failed, which is reachable from the full-connect overlay's
  // "Coba lagi" button (liveRef is still null there).
  async function retry() {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setConnectError(null);
    try {
      const live = liveRef.current;
      if (live) {
        await live.reconnect();
      } else {
        await connect();
      }
    } finally {
      retryingRef.current = false;
    }
  }

  function openEndConfirm() {
    setShowEndConfirm(true);
  }

  async function confirmEnd() {
    if (!id) return;
    setShowEndConfirm(false);
    setEndError(null);
    setEnding(true);
    try {
      await teardown();
      if (!isMountedRef.current) return;

      // Read pendingUserTextRef directly rather than calling
      // flushPendingUser(): that settles into React state (setTranscript),
      // which wouldn't be visible in the `transcript` read below within this
      // same synchronous function (state updates are async). Reading the ref
      // is synchronous and always current, so the user's last sentence — if
      // they ended the session right after speaking, before either flush
      // trigger fired — still reaches /analyze and /end, appended in order
      // after the already-settled bubbles.
      const trailingUserText = pendingUserTextRef.current.trim();
      pendingUserTextRef.current = '';

      const exchanges: TranscriptExchange[] = transcript
        .filter((m) => m.text.trim().length > 0)
        .map((m) => ({ role: m.role, text: m.text }));
      if (trailingUserText.length > 0) {
        exchanges.push({ role: 'user', text: trailingUserText });
      }

      if (exchanges.length === 0) {
        // Nothing to analyze — calling /analyze would 400 (min(1) exchanges)
        // and land the user in an unrecoverable retry loop. Skip straight
        // to the Dashboard instead.
        navigate('/dashboard');
        return;
      }

      const duration_seconds = elapsedSeconds;

      const { evaluation } = await apiRequest<AnalyzeResponse>(`/sessions/${id}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ exchanges }),
      });
      if (!isMountedRef.current) return;

      await apiRequest(`/sessions/${id}/end`, {
        method: 'POST',
        body: JSON.stringify({
          exchanges,
          summary: evaluation.summary,
          duration_seconds,
          evaluation,
        }),
      });
      if (!isMountedRef.current) return;

      navigate(`/result/${id}`, { state: { evaluation: evaluation as Evaluation } });
    } catch (err) {
      if (!isMountedRef.current) return;
      setEnding(false);
      const message =
        err instanceof ApiError ? err.message : 'Gagal mengakhiri sesi. Coba lagi.';
      setEndError(message);
    }
  }

  const aiBubbles = useMemo(() => transcript.filter((m) => m.role === 'ai'), [transcript]);
  const lastAiBubble = aiBubbles[aiBubbles.length - 1];
  // The number must match the AI turn actually on screen: one bubble per AI
  // turn, and the card always shows the last one. (Counting the closing
  // summary as a "question" is accepted — the eyebrow is a 5–7 range, not an
  // exact total.) Floors at 1 so the placeholder never reads "Pertanyaan 0".
  const questionNumber = Math.max(1, aiBubbles.length);
  const questionText = lastAiBubble?.text || 'Menyiapkan pertanyaan…';
  const aiTyping = speaker === 'ai' && (!lastAiBubble || lastAiBubble.final || lastAiBubble.text.length === 0);

  const statusMap: Record<SpeakerState, { text: string; dot: string }> = {
    ai: { text: 'AI sedang berbicara', dot: '#2563eb' },
    user: { text: 'Mendengarkan…', dot: '#dc2626' },
    thinking: { text: 'AI sedang berpikir…', dot: '#f59e0b' },
    idle: { text: 'Menunggu jawaban Anda', dot: '#9aa1ad' },
  };
  const status = statusMap[speaker];

  const showFullConnectingOverlay = started && !hasConnectedOnce && connState !== 'connected';
  const showReconnectOverlay =
    hasConnectedOnce && (connState === 'connecting' || connState === 'reconnecting' || connState === 'error');

  if (ending) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-page px-6">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-border-input border-t-blue" />
        <p className="text-[15px] font-medium text-ink">Menganalisis jawaban Anda…</p>
      </div>
    );
  }

  if (endError) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-page px-6 text-center">
        <p className="max-w-sm text-sm text-danger">{endError}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Kembali ke Dashboard
          </Button>
          <Button variant="primary" onClick={confirmEnd}>
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-page">
      <SessionTopBar
        fieldTitle={fieldTitle}
        context={context}
        connState={connState}
        elapsedFmt={fmtElapsed(elapsedSeconds)}
        onBack={openEndConfirm}
        onEnd={openEndConfirm}
      />

      {!started ? (
        <PreSessionCard fieldTitle={fieldTitle} context={context} onStart={handleStart} />
      ) : showFullConnectingOverlay ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[18px] px-5 py-16">
          {/* The FIRST connect failed: no live client exists, so there is no
              reconnect overlay to fall back on. Without this button the user
              would sit on a spinner forever and have to reload the page. */}
          {connState === 'error' ? (
            <>
              <div className="text-center">
                <div className="text-[15px] font-medium text-ink">Gagal terhubung</div>
                <p className="mt-1 max-w-sm text-[13px] text-danger">
                  {connectError ?? 'Gagal terhubung ke pewawancara AI. Coba lagi.'}
                </p>
              </div>
              <Button variant="primary" onClick={() => void retry()} className="px-4 py-2 text-[13px]">
                Coba lagi
              </Button>
            </>
          ) : (
            <>
              <span className="h-[34px] w-[34px] animate-spin rounded-full border-[3px] border-[#e2e8f0] border-t-blue" />
              <div className="text-center">
                <div className="text-[15px] font-medium text-ink">
                  Menghubungkan ke pewawancara AI…
                </div>
                <div className="mt-1 text-[13px] text-ink-muted">Menyiapkan koneksi suara</div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-wrap items-stretch gap-6 p-6">
          {/* left column */}
          <div className="relative flex min-w-[320px] flex-[1.5] flex-col gap-[18px]">
            {showReconnectOverlay && (
              <ReconnectOverlay
                state={connState as 'connecting' | 'reconnecting' | 'error'}
                onRetry={retry}
                detail={connectError}
              />
            )}

            <div className="inline-flex w-fit items-center gap-[7px] rounded-pill border border-border bg-surface px-3.5 py-[7px] text-[13px] font-medium text-ink">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.dot }} />
              {status.text}
            </div>

            <Card className="flex h-[150px] items-end justify-center gap-1 px-6 py-[30px]">
              <AudioVisualizer
                analyser={playbackRef.current?.analyser ?? null}
                active={speaker === 'ai'}
                color="#061f3d"
              />
            </Card>

            <QuestionCard n={questionNumber} text={questionText} />

            <Card className="flex flex-col items-center gap-4 p-7">
              <MicControl micState={micState} onToggle={toggleMic} />
              <div className="flex h-10 w-full items-center justify-center gap-[3px]">
                <AudioVisualizer
                  analyser={captureRef.current?.analyser ?? null}
                  active={micState === 'unmuted' && isUserSpeaking}
                  barCount={40}
                  color="#1e3a5f"
                  barWidthPx={3}
                />
              </div>
            </Card>
          </div>

          {/* right column */}
          <TranscriptPanel messages={transcript} typing={aiTyping} userTyping={userTyping} />
        </div>
      )}

      {showEndConfirm && (
        <EndConfirmModal onCancel={() => setShowEndConfirm(false)} onConfirm={confirmEnd} />
      )}
    </div>
  );
}
