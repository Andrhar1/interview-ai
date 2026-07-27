/**
 * Score display utilities. Scores are STORED 0–100 (Postgres/Gemini) and
 * DISPLAYED 0–10 (handoff §Score color logic; thresholds are on the 10-scale).
 */

export type ScoreTone = 'success' | 'warning' | 'danger';

/** 0–100 → 0–10 with one decimal (82 → 8.2). */
export function toTen(score100: number): number {
  return Math.round(score100) / 10;
}

/** "8" stays "8.0" so score displays keep a stable width. */
export function formatTen(score10: number): string {
  return score10.toFixed(1);
}

export function scoreTone(score10: number): ScoreTone {
  if (score10 >= 8) return 'success';
  if (score10 >= 6.5) return 'warning';
  return 'danger';
}

export function scoreLabel(score10: number): string {
  if (score10 >= 8) return 'Sangat baik';
  if (score10 >= 6.5) return 'Cukup baik';
  return 'Perlu latihan';
}

/** Solid score color (progress fills, score numbers). */
export const TONE_COLOR: Record<ScoreTone, string> = {
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
};

/** Tinted badge classes (bg + border + ink) per tone. */
export const TONE_BADGE: Record<ScoreTone, string> = {
  success: 'bg-success-bg border-success-border text-success-ink',
  warning: 'bg-warning-bg border-warning-border text-warning-ink',
  danger: 'bg-danger-bg border-danger-border text-danger-ink',
};

/** "2026-06-14T…" → "14 Jun 2026". */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Seconds → "12 menit" (or "45 detik" under a minute). */
export function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} detik`;
  return `${Math.round(seconds / 60)} menit`;
}
