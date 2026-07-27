import { formatTen, scoreTone, toTen, TONE_COLOR } from '../lib/score';
import type { EvaluationMetric } from '../types/session';

/**
 * One "Rincian penilaian" row: label + note, color-coded score, and a
 * progress bar (track #eef0f2, fill = score% in the score color).
 */
export function MetricBar({ metric }: { metric: EvaluationMetric }) {
  const ten = toTen(metric.score);
  const color = TONE_COLOR[scoreTone(ten)];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{metric.label}</p>
          {metric.note && (
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-secondary">{metric.note}</p>
          )}
        </div>
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
          {formatTen(ten)}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-[#eef0f2]">
        <div
          className="h-full rounded-pill"
          style={{ width: `${Math.min(100, Math.max(0, metric.score))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
