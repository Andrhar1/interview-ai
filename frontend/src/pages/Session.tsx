import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest, ApiError } from '../lib/api';
import { createLiveInterview, type ConnState, type LiveInterview } from '../lib/gemini/liveClient';
import { createMicCapture, type MicCapture } from '../lib/audio/capture';
import { createAudioPlayback, type AudioPlayback } from '../lib/audio/playback';
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

  const [connState, setConnState] = useState<ConnState>('connecting');
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [micState, setMicState] = useState<MicState>('disabled');
  const [speaker, setSpeaker] = useState<SpeakerState>('idle');
  const [transcript, setTranscript] = useState<TranscriptBubbleData[]>([]);
  const [questionsDone, setQuestionsDone] = useState(0);
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
    try {
      captureRef.current?.stop();
    } catch {
      /* best effort */
    }
    const closes: Promise<unknown>[] = [];
    if (liveRef.current) closes.push(liveRef.current.close());
    if (playbackRef.current) closes.push(playbackRef.current.close());
    await Promise.allSettled(closes);
    liveRef.current = null;
    playbackRef.current = null;
    captureRef.current = null;
  }, []);

  const startMic = useCallback(() => {
    if (captureRef.current) return; // already created (e.g. after a reconnect)
    const capture = createMicCapture((pcm) => liveRef.current?.sendAudio(pcm));
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

  // --- connect (used at mount and by the manual "Coba sekarang" retry).
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
          setSpeaker('user');
          setTranscript((prev) => appendOrOpen(prev, 'user', delta));
        },
        onOutputTranscript: (delta) => {
          if (myGen !== connectGenRef.current) return;
          setSpeaker('ai');
          setTranscript((prev) => appendOrOpen(prev, 'ai', delta));
        },
        onAudioChunk: (b64) => {
          if (myGen !== connectGenRef.current) return;
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
          setQuestionsDone((n) => n + 1);
          setSpeaker(micStateRef.current === 'unmuted' ? 'user' : 'idle');
        },
        onInterrupted: () => {
          if (myGen !== connectGenRef.current) return;
          playbackRef.current?.clear();
        },
        onError: (err) => {
          if (myGen !== connectGenRef.current) return;
          setConnectError(err.message || 'Koneksi Gemini bermasalah.');
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
      setConnState('error');
      setConnectError(err instanceof Error ? err.message : 'Gagal terhubung ke pewawancara AI.');
    }
  }, [id, startMic, startTimer]);

  // --- mount: fetch session meta, create playback, connect. Cleanup on
  // unmount and on tab close (beforeunload) — no leaked mic/WS (Reliability NFR).
  useEffect(() => {
    if (!id) return;
    tornRef.current = false;
    isMountedRef.current = true;

    playbackRef.current = createAudioPlayback();
    void connect();

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

  async function retry() {
    if (retryingRef.current) return;
    retryingRef.current = true;
    try {
      await connect();
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

      const exchanges: TranscriptExchange[] = transcript
        .filter((m) => m.text.trim().length > 0)
        .map((m) => ({ role: m.role, text: m.text }));

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

  const lastAiBubble = useMemo(
    () => [...transcript].reverse().find((m) => m.role === 'ai'),
    [transcript],
  );
  const questionText = lastAiBubble?.text || 'Menyiapkan pertanyaan…';
  const aiTyping = speaker === 'ai' && (!lastAiBubble || lastAiBubble.final || lastAiBubble.text.length === 0);

  const statusMap: Record<SpeakerState, { text: string; dot: string }> = {
    ai: { text: 'AI sedang berbicara', dot: '#2563eb' },
    user: { text: 'Mendengarkan jawaban Anda', dot: '#dc2626' },
    idle: { text: 'Menunggu jawaban Anda', dot: '#9aa1ad' },
  };
  const status = statusMap[speaker];

  const showFullConnectingOverlay = !hasConnectedOnce && connState !== 'connected';
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

      {showFullConnectingOverlay ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[18px] px-5 py-16">
          <span className="h-[34px] w-[34px] animate-spin rounded-full border-[3px] border-[#e2e8f0] border-t-blue" />
          <div className="text-center">
            <div className="text-[15px] font-medium text-ink">Menghubungkan ke pewawancara AI…</div>
            <div className="mt-1 text-[13px] text-ink-muted">Menyiapkan koneksi suara</div>
          </div>
          {connectError && <p className="max-w-sm text-center text-[13px] text-danger">{connectError}</p>}
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-wrap items-stretch gap-6 p-6">
          {/* left column */}
          <div className="relative flex min-w-[320px] flex-[1.5] flex-col gap-[18px]">
            {showReconnectOverlay && (
              <ReconnectOverlay
                state={connState as 'connecting' | 'reconnecting' | 'error'}
                onRetry={retry}
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

            <QuestionCard n={questionsDone + 1} text={questionText} />

            <Card className="flex flex-col items-center gap-4 p-7">
              <MicControl micState={micState} onToggle={toggleMic} />
              <div className="flex h-10 w-full items-center justify-center gap-[3px]">
                <AudioVisualizer
                  analyser={captureRef.current?.analyser ?? null}
                  active={micState === 'unmuted' && speaker === 'user'}
                  barCount={40}
                  color="#1e3a5f"
                  barWidthPx={3}
                />
              </div>
            </Card>
          </div>

          {/* right column */}
          <TranscriptPanel messages={transcript} typing={aiTyping} />
        </div>
      )}

      {showEndConfirm && (
        <EndConfirmModal onCancel={() => setShowEndConfirm(false)} onConfirm={confirmEnd} />
      )}
    </div>
  );
}
