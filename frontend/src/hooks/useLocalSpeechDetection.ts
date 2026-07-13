import { useEffect, useState } from 'react';

/**
 * Local, zero-network-lag speech detection off a live mic AnalyserNode.
 *
 * Why this exists: Gemini's `inputTranscription` lags the speaker by
 * ~2.5-3.5s and keeps draining for seconds after they stop talking (measured
 * against the real API — see the Fase 3 liveness brief). Any "is the user
 * speaking" signal derived from server transcript events is therefore
 * unusably late for UI feedback. The mic's AnalyserNode has no such lag: it
 * reflects the current audio frame.
 *
 * UI-ONLY. Do NOT use this boolean to gate `sendAudio` — audio must keep
 * streaming to Gemini continuously, including silence, or the server-side
 * VAD starves and the AI never replies (proven empirically; see capture.ts
 * and the brief).
 *
 * Reads `getByteTimeDomainData` on a requestAnimationFrame loop and computes
 * RMS energy. Hysteresis avoids flicker on breath noise / short dips:
 * speech starts the instant RMS crosses the start threshold, and only stops
 * after RMS has stayed below the stop threshold for RELEASE_MS continuously.
 *
 * Thresholds are relative to an observed noise floor rather than fixed: a
 * quiet speaker on a low-gain mic can sit well under any hard-coded level and
 * would then get NO liveness feedback at all. The floor is a slow EMA of the
 * RMS measured while we believe nobody is speaking; the working thresholds are
 * a multiple of it, clamped to a low absolute minimum so a dead-silent input
 * (getUserMedia runs with noiseSuppression, so the floor is often ~0) can't
 * drive them to zero and latch on hiss. Deliberately simple — this signal only
 * drives a badge, a visualizer and the transcript's turn anchor; it is never
 * allowed anywhere near sendAudio.
 */

const MIN_START = 0.02; // absolute floor for the start threshold (RMS 0..1)
const MIN_STOP = 0.012; // absolute floor for the stop threshold (< MIN_START = hysteresis)
const START_OVER_NOISE = 3; // start speaking at 3x the noise floor…
const STOP_OVER_NOISE = 1.8; // …stop below 1.8x it (< START_OVER_NOISE = hysteresis)
const INITIAL_NOISE_FLOOR = 0.005;
const NOISE_EMA = 0.02; // per-frame weight of a new sample (~60fps ⇒ ~1s to adapt)
const RELEASE_MS = 600; // sustained quiet required before flipping back to false

export function useLocalSpeechDetection(analyser: AnalyserNode | null): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!analyser) {
      setIsSpeaking(false);
      return;
    }

    let rafId: number;
    let speaking = false;
    let quietSinceMs: number | null = null;
    let noiseFloor = INITIAL_NOISE_FLOOR;
    const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    function tick() {
      analyser!.getByteTimeDomainData(data);

      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const norm = (data[i] - 128) / 128;
        sumSquares += norm * norm;
      }
      const rms = Math.sqrt(sumSquares / data.length);

      // Only track the floor while quiet, or speech would pull it up after
      // itself and progressively deafen the detector.
      if (!speaking) noiseFloor = (1 - NOISE_EMA) * noiseFloor + NOISE_EMA * rms;
      const startThreshold = Math.max(MIN_START, noiseFloor * START_OVER_NOISE);
      const stopThreshold = Math.max(MIN_STOP, noiseFloor * STOP_OVER_NOISE);

      if (!speaking && rms > startThreshold) {
        speaking = true;
        quietSinceMs = null;
        setIsSpeaking(true);
      } else if (speaking && rms < stopThreshold) {
        const now = performance.now();
        if (quietSinceMs === null) {
          quietSinceMs = now;
        } else if (now - quietSinceMs >= RELEASE_MS) {
          speaking = false;
          quietSinceMs = null;
          setIsSpeaking(false);
        }
      } else {
        // Energy sits between the two thresholds (or a momentary blip above
        // the stop threshold while releasing) — reset the quiet timer so only a
        // *continuous* quiet stretch of RELEASE_MS counts.
        quietSinceMs = null;
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [analyser]);

  return isSpeaking;
}
