import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  /** Nullable because playback/capture analysers may not exist yet. */
  analyser: AnalyserNode | null;
  /** Bars only animate off real amplitude while true; otherwise rest at 0.16. */
  active: boolean;
  barCount?: number;
  color?: string;
  barWidthPx?: number;
}

const REST_SCALE = 0.16;

/**
 * Real-amplitude bar visualizer (handoff §4). Reads `AnalyserNode.getByteFrequencyData`
 * on a requestAnimationFrame loop and writes bar heights directly to DOM refs
 * (bypassing React state) so this can run every frame without re-rendering.
 * The rAF is cancelled on unmount or whenever `analyser`/`active` change.
 */
export function AudioVisualizer({
  analyser,
  active,
  barCount = 28,
  color = '#061f3d',
  barWidthPx = 4,
}: AudioVisualizerProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    let rafId: number;

    function paintRest() {
      for (let i = 0; i < barCount; i++) {
        const el = barRefs.current[i];
        if (el) el.style.transform = `scaleY(${REST_SCALE})`;
      }
    }

    function tick() {
      if (analyser && active) {
        if (!dataRef.current || dataRef.current.length !== analyser.frequencyBinCount) {
          dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        }
        const data = dataRef.current;
        analyser.getByteFrequencyData(data);

        const bucket = Math.max(1, Math.floor(data.length / barCount));
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < bucket; j++) sum += data[i * bucket + j] ?? 0;
          const avg = sum / bucket / 255;
          const scale = REST_SCALE + avg * (1 - REST_SCALE);
          const el = barRefs.current[i];
          if (el) el.style.transform = `scaleY(${scale})`;
        }
      } else {
        paintRest();
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [analyser, active, barCount]);

  return (
    <div className="flex h-full w-full items-end justify-center gap-1">
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          style={{
            width: barWidthPx,
            height: '100%',
            background: color,
            borderRadius: 4,
            transform: `scaleY(${REST_SCALE})`,
            transformOrigin: 'bottom',
            transition: 'transform .35s',
          }}
        />
      ))}
    </div>
  );
}
