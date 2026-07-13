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
 * speech starts the instant RMS crosses START_THRESHOLD, and only stops
 * after RMS has stayed below STOP_THRESHOLD for RELEASE_MS continuously.
 */

const START_THRESHOLD = 0.06; // RMS (0..1) to declare "started speaking"
const STOP_THRESHOLD = 0.035; // RMS (0..1) to declare "went quiet" (lower than start = hysteresis)
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
    const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    function tick() {
      analyser!.getByteTimeDomainData(data);

      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const norm = (data[i] - 128) / 128;
        sumSquares += norm * norm;
      }
      const rms = Math.sqrt(sumSquares / data.length);

      if (!speaking && rms > START_THRESHOLD) {
        speaking = true;
        quietSinceMs = null;
        setIsSpeaking(true);
      } else if (speaking && rms < STOP_THRESHOLD) {
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
        // STOP_THRESHOLD while releasing) — reset the quiet timer so only a
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
