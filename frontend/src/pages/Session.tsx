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
 * Bookkeeping for ONE spoken user turn.
 *
 * Why an explicit anchor: Gemini's `inputTranscription` runs ~3s behind the
 * speaker and keeps draining for 2.8–8.4s AFTER they stop, while the Live
 * model starts replying ~1.5s after they stop. So the AI's bubble is routinely
 * opened while the user's own words are still arriving. If those late deltas
 * were appended at the end of the transcript, half the user's sentence would
 * land *after* the AI's reply — a false record of who said what, when.
 *
 * `anchor` is captured from the LOCAL (zero-lag) speech detector at the very
 * instant the user starts talking: it is the transcript length at that moment,
 * i.e. exactly where this turn's bubble belongs. `index` is where the bubble
 * actually got inserted, so every later delta of the SAME spoken turn merges
 * back into it in place, however late it shows up and whatever the AI has
 * streamed in the meantime.
 *
 * `raw` and `startedAt` exist because a NEW turn can start while the previous
 * one is still draining (barge-in: the AI replies ~1.5s after the user stops,
 * the user cuts in a second later, and the first answer's ASR keeps arriving
 * for seconds after that). A delta is therefore attributed to a turn by its
 * ARRIVAL TIME, not by "whichever turn is open" — see turnForDelta(): anything
 * landing within ASR_LAG_MS of a turn's rising edge was physically spoken
 * before that turn began and belongs to `prev`. Without this the tail of
 * answer #1 is re-ordered after the AI's bubble.
 */
interface PendingUserTurn {
  /** Insertion index for this turn's bubble (transcript length when the user began speaking). */
  anchor: number;
  /** Index of this turn's bubble once it exists; null until the first flush with text. */
  index: number | null;
  /** Local (zero-lag) clock at the rising edge that opened this turn. */
  startedAt: number;
  /** The turn spoken immediately before this one — still draining, possibly. */
  prev: PendingUserTurn | null;
  /**
   * Every inputTranscription delta of this turn, concatenated VERBATIM (no
   * trim, no separator: Gemini's deltas already carry their own spacing, and
   * they split mid-word — trimming and re-joining each one turns "pengalaman"
   * into "penga laman" and "kata." into "kata ."). The bubble's text is
   * re-derived from this whole string on every flush, so a flush can never
   * fall on a sub-word boundary.
   */
  raw: string;
  /** raw changed since the last commit ⇒ the bubble needs rewriting. */
  dirty: boolean;
  /**
   * Opened by an arriving delta rather than by the local detector (mic too
   * quiet to trip the RMS floor, or mic denied). Such a turn has no rising
   * edge to end it, so the debounce (ASR quiet ⇒ turn over) closes it instead.
   */
  synthetic: boolean;
  /** A closed synthetic turn never takes new deltas — the next one opens a new turn. */
  closed: boolean;
}

const DEBOUNCE_MS = 1200; // no new inputTranscript delta for this long ⇒ settle the buffer
const THINKING_TIMEOUT_MS = 10000; // give up on 'AI sedang berpikir…' and fall back to 'idle'
// Measured: inputTranscription runs ~3s behind the speaker, but the drain
// after they STOP talking can run up to ~8.4s. There is no single correct
// value here: to keep a turn's own trailing words from leaking forward past
// the AI's bubble, this needs to be >= 8.4s; to keep a genuinely NEW
// utterance (e.g. a barge-in) from being walked backward into the PREVIOUS
// turn, it needs to be <= ~3s. Those two requirements are contradictory, so
// no fixed threshold is correct — this is a heuristic, not a guarantee,
// because Gemini gives no per-delta "spoken at" timestamp, only an ARRIVAL
// time. Widening this toward the drain figure was tried and made things
// worse: on barge-in, the interrupting utterance's own words arrive ~3s
// after it was spoken, which then falls INSIDE the wider window, so
// turnForDelta() walks back and appends the entire interruption onto the
// PREVIOUS answer's bubble — which sits above the AI's reply. That's a
// cross-speaker reorder AND a merge. Keeping this at the base ~3s lag bounds
// the damage to a few trailing words of the previous answer drifting past
// the AI's bubble on the rare slow-drain case — much smaller than a swapped
// turn. The real fix is getting authoritative turn boundaries from the
// server instead of inferring them from arrival time; that redesign is
// tracked separately.
const ASR_LAG_MS = 3000;
// "Akhiri Sesi": no new delta for this long ⇒ ASR is done. Must be >= DEBOUNCE_MS:
// mid-session we need 1.2s of ASR quiet to call a turn settled, so accepting less
// at the highest-stakes moment would cut a still-draining sentence in half.
const DRAIN_IDLE_MS = DEBOUNCE_MS;
// …but never hold the user on the spinner longer than this. Measured worst-case
// drain is 8.4s after the speaker stops; a few extra seconds under a spinner
// beats a truncated answer in the evaluation.
const DRAIN_MAX_MS = 9000;
const DRAIN_POLL_MS = 100;
// Hard cap on the spoken-turn chain (see trimTurnChain) — a safety net
// independent of ASR_LAG_MS timing.
const MAX_TURN_CHAIN = 8;

/** ASR deltas are raw and may split mid-word — normalize the WHOLE turn, once. */
function normalizeSpeech(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Where a user bubble goes when the local detector never gave us a rising edge
 * (synthetic turn). The words are already ~3s old, so if the AI is mid-bubble
 * they were spoken BEFORE that bubble opened: insert in front of it. Appending
 * at the end instead would leave the AI's open bubble stranded behind the user's,
 * and its next delta would open a SECOND ai bubble — one AI turn split in two.
 */
function anchorForLateSpeech(list: TranscriptBubbleData[]): number {
  const last = list.length - 1;
  if (last >= 0 && list[last].role === 'ai' && !list[last].final) return last;
  return list.length;
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
  // The transcript also lives in a ref, kept in lockstep with the state by
  // commitTranscript() below. Two reasons it must exist:
  //  - the flush logic needs to know, SYNCHRONOUSLY, where the current user
  //    turn's bubble sits (see PendingUserTurn) — React state is one render
  //    behind and several deltas can arrive within a single frame;
  //  - confirmEnd() awaits the ASR drain window before building `exchanges`,
  //    so its `transcript` closure is stale by then; the ref is always current.
  const transcriptRef = useRef<TranscriptBubbleData[]>([]);
  // Whether there's unflushed user speech — drives the 3-dot placeholder
  // bubble. The text itself lives on the pending turn (PendingUserTurn.raw),
  // never in state: it must never be rendered as a running bubble (see
  // appendOrOpen's comment for why — that's the lagging-caption promise this
  // whole change removes). flushPendingUser() settles it into one final bubble
  // per spoken turn.
  const [userTyping, setUserTyping] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  // Re-entry guard for confirmEnd(): the modal unmounts on confirm, but the
  // endError screen's "Coba lagi" calls it again and a double-click there would
  // otherwise fire two /analyze + /end pairs.
  const endingRef = useRef(false);

  const isMountedRef = useRef(true);
  const liveRef = useRef<LiveInterview | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const playbackRef = useRef<AudioPlayback | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const tornRef = useRef(false);
  const retryingRef = useRef(false);
  // Head of the spoken-turn chain: the most recent user turn, linked back to
  // the ones before it (which may still be draining). Each turn carries its own
  // raw ASR buffer — see PendingUserTurn, turnForDelta() and flushPendingUser().
  // A ref (not state) because it's written from handlers created once inside
  // connect() (closed over stale state otherwise) and because confirmEnd() needs
  // a synchronous read of "whatever's pending right now".
  const pendingTurnRef = useRef<PendingUserTurn | null>(null);
  // Debounce timer: flush the pending turns after ~1.2s with no new
  // inputTranscript delta (brief's rule (b) for "turn is over").
  const debounceTimerRef = useRef<number | null>(null);
  // Mirrors the local-speech-detection boolean (see below): a ref, not just
  // state, because it's read from handlers created once inside connect()
  // (closed over stale state otherwise) and needs a synchronous read.
  const isUserSpeakingRef = useRef(false);
  // 'AI sedang berpikir…' escape hatch (see the effect below).
  const thinkingTimerRef = useRef<number | null>(null);
  // Timestamp of the last genuine AI activity (an audio chunk or output-
  // transcript delta), used to re-arm the 'ai' escape hatch below. Read
  // instead of the 'ai' state's mount time because onAudioChunk/onOutputTranscript
  // call setSpeaker('ai') with the SAME value on every chunk while a long AI
  // turn is speaking — React bails out of re-rendering on a no-op state
  // update, so an effect keyed on `speaker` alone would never re-run and the
  // timer would never be pushed out, wrongly timing out a still-speaking AI.
  const lastAiActivityRef = useRef(0);
  // --- "Akhiri Sesi" ASR drain window (see drainInputTranscript / confirmEnd).
  const drainingRef = useRef(false);
  const drainIntervalRef = useRef<number | null>(null);
  /** Resolves the in-flight drain immediately; also cleared by teardown(). */
  const drainFinishRef = useRef<(() => void) | null>(null);
  const lastInputDeltaAtRef = useRef(0);
  // Bumped by every connect() call and by teardown(); lets an in-flight
  // createLiveInterview() detect it has been superseded (a newer connect(),
  // a manual retry, or an unmount/beforeunload) by the time it resolves —
  // notably including React 18 StrictMode's dev-only mount→cleanup→mount,
  // where the effect's cleanup can otherwise run before the first
  // createLiveInterview() promise settles and liveRef gets populated.
  const connectGenRef = useRef(0);

  // The ONLY way the transcript is mutated. Keeps transcriptRef and the React
  // state in lockstep, and — unlike a bare setTranscript updater — runs the
  // updater exactly once, so the flush logic below may record the index it
  // inserted at.
  const commitTranscript = useCallback(
    (update: (prev: TranscriptBubbleData[]) => TranscriptBubbleData[]) => {
      const next = update(transcriptRef.current);
      transcriptRef.current = next;
      setTranscript(next);
    },
    [],
  );

  // Zero-lag "is the user speaking right now" signal, read straight off the
  // mic AnalyserNode (see hooks/useLocalSpeechDetection.ts). UI ONLY — never
  // used to gate sendAudio.
  //
  // The analyser is only handed over while the mic is actually live. When the
  // user mutes, capture.stop() suspends the 16kHz AudioContext, so the
  // AnalyserNode stops being clocked and keeps returning its last frame
  // forever — which, if that frame was loud, would pin isUserSpeaking to true
  // for the whole muted period ("Mendengarkan…" with the mic off). Muted is by
  // definition not speaking, so we pass null and the hook reports false.
  // Passing null while `ending` is also what stops its rAF loop for the whole
  // /analyze + /end window (captureRef is nulled by teardown without a
  // re-render, so the hook would otherwise keep polling a closed context).
  const micLive = micState === 'unmuted' && !ending;
  const isUserSpeaking = useLocalSpeechDetection(
    micLive ? (captureRef.current?.analyser ?? null) : null,
  );

  useEffect(() => {
    isUserSpeakingRef.current = isUserSpeaking;
  }, [isUserSpeaking]);

  /** The chain of spoken turns, oldest first. */
  const turnChain = useCallback((): PendingUserTurn[] => {
    const chain: PendingUserTurn[] = [];
    for (let t = pendingTurnRef.current; t; t = t.prev) chain.unshift(t);
    return chain;
  }, []);

  /**
   * Which spoken turn an inputTranscription delta arriving RIGHT NOW belongs to.
   *
   * Gemini's ASR is ~3s behind the speaker, so a delta landing less than
   * ASR_LAG_MS after a turn's rising edge carries words spoken BEFORE that edge
   * — i.e. the tail of the previous turn. Walking back the chain (rather than
   * just taking the head) is what stops a barge-in from re-ordering the first
   * answer's second half after the AI's reply.
   *
   * A closed turn is never walked into: it was closed by DEBOUNCE_MS of ASR
   * quiet, so its drain is provably over and nothing new can belong to it.
   */
  const turnForDelta = useCallback((now: number): PendingUserTurn | null => {
    let t = pendingTurnRef.current;
    while (t && t.prev && !t.prev.closed && now - t.startedAt < ASR_LAG_MS) t = t.prev;
    return t;
  }, []);

  /**
   * Once a turn is older than ASR_LAG_MS, turnForDelta() can no longer walk past
   * it, so nothing below it in the chain is reachable — and callers only trim
   * right after a flush, so those turns are clean too. Cut them loose, or the
   * chain (and the walk over it on every flush) grows for the whole session.
   *
   * The time-based cut alone is not sufficient: if rising edges keep landing
   * less than ASR_LAG_MS apart for a while (choppy detector triggers, a
   * hesitant speaker restarting often), `head` never ages past the window and
   * nothing gets trimmed — the chain grows for as long as that keeps up, and
   * flushPendingUser() walks the whole thing on every AI audio chunk. The hard
   * cap below bounds it regardless of timing.
   */
  const trimTurnChain = useCallback((head: PendingUserTurn | null, now: number) => {
    if (!head) return;
    if (now - head.startedAt >= ASR_LAG_MS) {
      head.prev = null;
      return;
    }
    let t = head;
    for (let i = 0; i < MAX_TURN_CHAIN && t.prev; i++) t = t.prev;
    if (t.prev) t.prev = null;
  }, []);

  /**
   * Settle every dirty turn's buffered `inputTranscription` text into ITS OWN
   * bubble. Idempotent — a no-op when nothing is buffered.
   *
   * Each bubble is located by index (turn.index), never by "the last bubble":
   * by the time a turn's tail deltas arrive the AI has usually opened its own
   * bubble already, and appending there would both misorder the transcript and
   * split the AI's single turn in two. Merging by index instead keeps each
   * speaker's turn contiguous and in the order it was actually spoken — which
   * is exactly what /analyze scores.
   *
   * The bubble's text is REWRITTEN from the turn's whole raw buffer (never
   * appended to with a synthetic separator), so flushing on every AI audio
   * chunk cannot mangle words that a delta boundary happened to split.
   */
  const flushPendingUser = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setUserTyping(false);

    const chain = turnChain();
    const dirty = chain.filter((t) => t.dirty);
    if (dirty.length === 0) return;

    commitTranscript((prev) => {
      const next = [...prev];

      // Oldest turn first: an older turn's insert shifts the newer ones' indices.
      for (const turn of dirty) {
        turn.dirty = false;
        const text = normalizeSpeech(turn.raw);
        if (text.length === 0) continue;

        // (1) This turn already has a bubble → rewrite it in place, wherever it
        //     sits (typically above the AI bubble that opened mid-drain).
        const idx = turn.index;
        if (idx !== null && next[idx]?.role === 'user') {
          next[idx] = { ...next[idx], text };
          continue;
        }

        // (2) First text for this turn → insert at its anchor: the slot reserved
        //     when the user started speaking (detector-driven turn), or in front
        //     of the AI's open bubble (synthetic turn — the words predate it).
        const at = Math.min(turn.anchor, next.length);
        const before = next[at - 1];
        // Whoever spoke immediately before this turn is definitively finished.
        if (before && !before.final) next[at - 1] = { ...before, final: true };
        // User bubbles are born final: they are settled text, never a live
        // caption (the whole point of buffering — see TranscriptPanel).
        next.splice(at, 0, { role: 'user', text, final: true });
        for (const other of chain) {
          if (other === turn) continue;
          if (other.anchor >= at) other.anchor += 1;
          if (other.index !== null && other.index >= at) other.index += 1;
        }
        turn.anchor = at;
        turn.index = at;
      }

      return next;
    });
  }, [commitTranscript, turnChain]);

  // speaker state machine, driven by the local signal (instant), not by
  // server transcript events (laggy — see the Fase 3 liveness brief):
  // user starts speaking -> 'user' immediately, from ANY prior state
  // (including barge-in while speaker === 'ai'). user goes quiet while we
  // were in 'user' -> 'thinking' (waiting on the AI's reply, which the
  // onAudioChunk/onOutputTranscript handlers below will flip to 'ai').
  // Any other transition (idle<->thinking<->ai) is left to those handlers.
  //
  // The rising edge is also the ONLY reliable "a new user turn starts here"
  // marker we have (the server's own signal is ~3s late), so it is where the
  // turn's transcript slot is reserved.
  useEffect(() => {
    if (isUserSpeaking) {
      // Settle what has arrived so far into the turns it belongs to, then open
      // the new turn. Deltas that are still in flight from the PREVIOUS turn
      // (up to ASR_LAG_MS of them, on a barge-in) are not lost: turnForDelta()
      // keeps routing them back down the chain to that turn's own bubble.
      flushPendingUser();
      const now = Date.now();
      trimTurnChain(pendingTurnRef.current, now);
      pendingTurnRef.current = {
        anchor: transcriptRef.current.length,
        index: null,
        startedAt: now,
        prev: pendingTurnRef.current,
        raw: '',
        dirty: false,
        synthetic: false,
        closed: false,
      };
      setSpeaker('user');
    } else {
      setSpeaker((prev) => (prev === 'user' ? 'thinking' : prev));
    }
  }, [isUserSpeaking, flushPendingUser, trimTurnChain]);

  // 'thinking' is entered when the user goes quiet, and only an AI delta
  // leaves it (turnComplete/interrupted, or a new AI delta). 'ai' is entered
  // by the AI actually replying and is meant to be left the same way. Both
  // rely on a server event that can simply never arrive (dropped turn, a
  // cough the model has nothing to say about, a lost turnComplete/interrupted
  // message) — 'ai' has no OTHER escape hatch (unlike 'thinking', nothing
  // else rescues it), so a lost event would pin "AI sedang berbicara" on
  // screen for the rest of the session. Time both out back to 'idle'. The
  // timer is cancelled by this effect's own cleanup on every state change
  // and on unmount, and by teardown().
  useEffect(() => {
    if (speaker === 'thinking') {
      const timer = window.setTimeout(() => {
        thinkingTimerRef.current = null;
        setSpeaker((prev) => (prev === 'thinking' ? 'idle' : prev));
      }, THINKING_TIMEOUT_MS);
      thinkingTimerRef.current = timer;
      return () => {
        window.clearTimeout(timer);
        thinkingTimerRef.current = null;
      };
    }
    if (speaker === 'ai') {
      // Re-arm against lastAiActivityRef rather than a fixed delay from when
      // this effect (re)ran: onAudioChunk/onOutputTranscript call
      // setSpeaker('ai') on every chunk of a long AI turn, which is a no-op
      // state update once already 'ai' — React bails out and this effect
      // does NOT re-run on that call. Polling the activity timestamp instead
      // means the timeout only fires after THINKING_TIMEOUT_MS of genuine AI
      // silence, not after a fixed time in the 'ai' state.
      let timer: number;
      const check = () => {
        const remaining = THINKING_TIMEOUT_MS - (Date.now() - lastAiActivityRef.current);
        if (remaining <= 0) {
          thinkingTimerRef.current = null;
          setSpeaker((prev) => (prev === 'ai' ? 'idle' : prev));
          return;
        }
        timer = window.setTimeout(check, remaining);
        thinkingTimerRef.current = timer;
      };
      check();
      return () => {
        window.clearTimeout(timer);
        thinkingTimerRef.current = null;
      };
    }
  }, [speaker]);

  // --- teardown: stop capture, close live socket, close playback, clear every
  // timer (elapsed clock, transcript debounce, the 'thinking'/'ai' speaker
  // escape hatch, and the "Akhiri Sesi" drain window — which is also an exit
  // path, so it must be released here or an unmount mid-drain would hang
  // confirmEnd on it).
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
    if (thinkingTimerRef.current !== null) {
      window.clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    drainFinishRef.current?.();
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

  /**
   * "Akhiri Sesi" drain window. Gemini's ASR runs ~3s behind the speaker and
   * keeps emitting `inputTranscription` for seconds after they stop, so closing
   * the socket the instant the user confirms (what we used to do) simply lost
   * their final sentence from the evaluation. Instead: keep collecting deltas
   * until the ASR goes quiet for DRAIN_IDLE_MS (the same 1.2s of quiet we
   * require mid-session before calling a turn settled — anything less would end
   * the drain on a pause *inside* a still-arriving sentence), or DRAIN_MAX_MS
   * pass — whichever comes first. The "Menganalisis jawaban Anda…" spinner is
   * already on screen, so the wait is invisible.
   *
   * THE MIC MUST KEEP STREAMING FOR THE WHOLE WINDOW. This is the same trap as
   * gating sendAudio: probe-vad-report.md ("Starving the VAD") measured that
   * when the client stops sending packets, Gemini's server-side VAD starves —
   * it never decides the user's turn ended, so it never fires turnComplete and
   * never finalizes. A real mic keeps streaming ambient near-silence, and that
   * continuing stream is what ends the turn. Stopping capture before the drain
   * would therefore freeze the very ASR we are waiting on: the window would
   * burn its whole budget and collect nothing. Capture is stopped by teardown(),
   * AFTER this resolves.
   *
   * NOT a guarantee: the hard cap can still truncate a pathological drain. It is
   * a mitigation, sized to the measured 8.4s worst case.
   */
  const drainInputTranscript = useCallback(() => {
    return new Promise<void>((resolve) => {
      if (!liveRef.current || tornRef.current) {
        resolve();
        return;
      }
      const startedAt = Date.now();
      lastInputDeltaAtRef.current = startedAt;
      drainingRef.current = true;

      const finish = () => {
        if (drainIntervalRef.current !== null) {
          window.clearInterval(drainIntervalRef.current);
          drainIntervalRef.current = null;
        }
        drainingRef.current = false;
        drainFinishRef.current = null;
        resolve();
      };
      // teardown() (unmount / beforeunload mid-drain) resolves us through this.
      drainFinishRef.current = finish;

      drainIntervalRef.current = window.setInterval(() => {
        const now = Date.now();
        if (now - lastInputDeltaAtRef.current >= DRAIN_IDLE_MS || now - startedAt >= DRAIN_MAX_MS) {
          finish();
        }
      }, DRAIN_POLL_MS);
    });
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
          // Never rendered live (see appendOrOpen's comment) — just buffered on
          // the turn it was SPOKEN in (turnForDelta: ~3s of ASR lag means the
          // newest turn is usually not it) until that turn settles into its
          // bubble (flushPendingUser).
          const now = Date.now();
          lastInputDeltaAtRef.current = now; // feeds the drain window
          let head = pendingTurnRef.current;
          if (!head || head.closed) {
            // The local detector never fired for this speech (mic below the RMS
            // floor, or denied). Open a turn from the delta itself: the words are
            // already ~ASR_LAG_MS old, so date it accordingly and anchor it in
            // front of any AI bubble that opened after they were spoken.
            trimTurnChain(head, now);
            head = {
              anchor: anchorForLateSpeech(transcriptRef.current),
              index: null,
              startedAt: now - ASR_LAG_MS,
              prev: head,
              raw: '',
              dirty: false,
              synthetic: true,
              closed: false,
            };
            pendingTurnRef.current = head;
          }
          const target = turnForDelta(now) ?? head;
          // Verbatim concatenation — see PendingUserTurn.raw.
          target.raw += delta;
          target.dirty = true;
          setUserTyping(true);
          if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
          // Debounce rule (b): flush after ~1.2s of no new delta.
          debounceTimerRef.current = window.setTimeout(() => {
            debounceTimerRef.current = null;
            flushPendingUser();
            // ASR has gone quiet for DEBOUNCE_MS ⇒ this turn is provably over,
            // UNLESS the user is still talking right now: that is the
            // mid-sentence-ASR-stall case (ASR lags/drops out while speech is
            // ongoing), and closing there would let a later delta of the SAME
            // answer be misrouted into a brand-new turn. A synthetic turn has
            // no rising edge to close it at all, so it always closes here once
            // ASR is quiet — the OR below covers both: a detector turn closes
            // when the local signal agrees nobody is talking; a synthetic turn
            // closes unconditionally. Without this, a detector-driven turn
            // could never close on its own (the guard in onInputTranscript
            // only opens a new turn when `head.closed`), so a SECOND, quieter
            // answer that the local detector never trips for (RMS under the
            // start threshold) would merge into the stale head instead of
            // getting its own bubble — landing ABOVE the question it answers.
            const open = pendingTurnRef.current;
            if (open && (open.synthetic || !isUserSpeakingRef.current)) open.closed = true;
          }, DEBOUNCE_MS);
        },
        onOutputTranscript: (delta) => {
          if (myGen !== connectGenRef.current) return;
          if (drainingRef.current) return; // ending: don't reopen bubbles
          // Rule (a): the AI's reply starting means the user's turn is over —
          // settle what we have now instead of waiting out the debounce, so
          // the bubble appears promptly. Tail deltas that arrive afterwards
          // merge back into that same bubble (see flushPendingUser), so this
          // can neither misorder nor fragment the turn.
          flushPendingUser();
          // Not while the user is talking over us (barge-in): the local signal
          // is the truth about who is speaking, and this event may be a chunk
          // that was already in flight when they cut in.
          lastAiActivityRef.current = Date.now();
          if (!isUserSpeakingRef.current) setSpeaker('ai');
          commitTranscript((prev) => appendOrOpen(prev, 'ai', delta));
        },
        onAudioChunk: (b64) => {
          if (myGen !== connectGenRef.current) return;
          if (drainingRef.current) return; // ending: don't play / reopen bubbles
          flushPendingUser(); // same rule (a) — the AI audio itself is the signal
          lastAiActivityRef.current = Date.now();
          if (!isUserSpeakingRef.current) setSpeaker('ai');
          playbackRef.current?.enqueue(b64);
        },
        onTurnComplete: () => {
          if (myGen !== connectGenRef.current) return;
          if (drainingRef.current) return;
          commitTranscript((prev) => {
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
          // Nothing is playing any more, so 'ai' would be a lie — and it is the
          // one speaker state with no escape hatch (the timeout only rescues
          // 'thinking'), so leaving it here can pin "AI sedang berbicara" on
          // screen for good. Barge-in is the usual cause: trust the local signal.
          setSpeaker(isUserSpeakingRef.current ? 'user' : 'idle');
          // The cut-off AI turn is over. Finalize its bubble so the model's next
          // turn opens its own instead of continuing this one.
          commitTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'ai' || last.final) return prev;
            return [...prev.slice(0, -1), { ...last, final: true }];
          });
        },
        onError: (err) => {
          if (myGen !== connectGenRef.current) return;
          // Never render the raw SDK error: it can embed the WSS URL, which
          // carries the single-use ephemeral token.
          console.error('[live] session error:', err.name);
          setConnectError('Koneksi ke pewawancara AI bermasalah.');
          // Nothing else will ever leave 'thinking' if the turn died here.
          setSpeaker('idle');
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
  }, [id, startMic, startTimer, flushPendingUser, commitTranscript, turnForDelta, trimTurnChain]);

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
    if (endingRef.current) return; // already ending (double-click on "Coba lagi")
    endingRef.current = true;
    setShowEndConfirm(false);
    setEndError(null);
    setEnding(true);
    try {
      // Silence the AI immediately: the drain window below keeps the socket open
      // for seconds, and without this its queued audio would keep talking over
      // the "Menganalisis jawaban Anda…" spinner. (Playback is *closed* later,
      // by teardown().) Note this only drops what is already queued — the
      // handlers stop enqueueing as soon as drainingRef is set.
      playbackRef.current?.clear();

      // Order matters. Keep BOTH the mic and the socket running through the
      // drain window: the words the user just said are still ~3s back in
      // Gemini's ASR, and it is the continuing audio stream (ambient silence
      // included) that makes the server VAD end their turn and finalize —
      // stopping capture first would starve it and collect nothing. teardown()
      // then closes mic + socket + playback together, once the drain is done.
      //
      // The mic is therefore hot for up to DRAIN_MAX_MS after the user confirms.
      // They are on the "Menganalisis jawaban Anda…" spinner, and `ending` has
      // already detached the local speech detector — so no new user turn can be
      // opened; every late delta merges into the turn it was spoken in
      // (turnForDelta → flushPendingUser).
      await drainInputTranscript();
      if (!isMountedRef.current) return;

      await teardown();
      if (!isMountedRef.current) return;

      // Settle whatever the drain collected into its turn's bubble. Safe to read
      // the result immediately: commitTranscript writes transcriptRef
      // synchronously (the `transcript` state, and any closure over it, is a
      // render behind). Going through flushPendingUser() — rather than appending
      // the trailing text at the end as we used to — is what keeps the user's
      // final sentence merged into ITS OWN turn's bubble, in the order it was
      // spoken.
      flushPendingUser();

      // Natural speech is full of pauses, and a >600ms one mid-answer (the
      // local detector's RELEASE_MS) or a stray ASR stall closes the turn
      // early (see the debounce callback above), splitting ONE spoken answer
      // into several adjacent `user` bubbles. Coalescing consecutive
      // same-role entries here — exchanges only, the on-screen bubbles are
      // untouched — turns that back into a single exchange before /analyze
      // ever sees it, which is what "one answer" should look like to the
      // evaluator. It also makes any residual boundary-drift between two
      // adjacent same-role bubbles (see ASR_LAG_MS above) harmless: content
      // and order are unchanged, only where a shared boundary fell.
      const exchanges: TranscriptExchange[] = transcriptRef.current
        .filter((m) => m.text.trim().length > 0)
        .reduce<TranscriptExchange[]>((acc, m) => {
          const text = m.text.replace(/\s+/g, ' ').trim();
          const last = acc[acc.length - 1];
          if (last && last.role === m.role) {
            last.text = `${last.text} ${text}`.replace(/\s+/g, ' ').trim();
          } else {
            acc.push({ role: m.role, text });
          }
          return acc;
        }, []);

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
      endingRef.current = false; // let the error screen's "Coba lagi" run again
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
          {/* The user-side placeholder is suppressed once the AI is speaking:
              anything still draining then has already been settled into the
              user bubble ABOVE the AI's (see flushPendingUser), so a trailing
              "capturing…" bubble would point at the wrong turn. */}
          <TranscriptPanel
            messages={transcript}
            typing={aiTyping}
            userTyping={userTyping && speaker !== 'ai'}
          />
        </div>
      )}

      {showEndConfirm && (
        <EndConfirmModal onCancel={() => setShowEndConfirm(false)} onConfirm={confirmEnd} />
      )}
    </div>
  );
}
