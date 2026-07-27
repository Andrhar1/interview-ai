import { formatTen, scoreTone, toTen, TONE_BADGE } from '../lib/score';

interface ScoreBadgeProps {
  /** Stored 0–100 score. */
  score100: number;
  /** Append " / 10" (History Detail header). */
  withScale?: boolean;
  className?: string;
}

/** Color-coded tinted score pill (handoff §Score color logic). */
export function ScoreBadge({ score100, withScale = false, className = '' }: ScoreBadgeProps) {
  const ten = toTen(score100);
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-2.5 py-0.5 text-[13px] font-semibold tabular-nums ${TONE_BADGE[scoreTone(ten)]} ${className}`}
    >
      {formatTen(ten)}
      {withScale && <span className="ml-1 font-medium opacity-80">/ 10</span>}
    </span>
  );
}
