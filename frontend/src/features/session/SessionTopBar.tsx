import { ChevronLeft } from 'lucide-react';
import type { ConnState } from '../../lib/gemini/liveClient';
import { ConnectionPill } from './ConnectionPill';

interface SessionTopBarProps {
  fieldTitle: string;
  context: string;
  connState: ConnState;
  elapsedFmt: string;
  onBack: () => void;
  onEnd: () => void;
}

/**
 * Session's own sticky navy top bar (handoff §4) — NOT the global Navbar.
 * Back chevron and "Akhiri Sesi" both open the end-confirm modal (owned by
 * the parent Session page).
 */
export function SessionTopBar({
  fieldTitle,
  context,
  connState,
  elapsedFmt,
  onBack,
  onEnd,
}: SessionTopBarProps) {
  return (
    <div className="sticky top-0 z-30 flex h-[58px] items-center justify-between gap-4 bg-navy px-5 text-white">
      <div className="flex min-w-0 items-center gap-3.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali dan akhiri sesi"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] bg-transparent text-white"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{fieldTitle}</div>
          <div className="truncate text-xs opacity-60">{context}</div>
        </div>
      </div>

      <ConnectionPill state={connState} />

      <div className="flex shrink-0 items-center gap-3.5">
        <span className="text-sm font-medium tabular-nums opacity-85">{elapsedFmt}</span>
        <button
          type="button"
          onClick={onEnd}
          className="cursor-pointer whitespace-nowrap rounded-[8px] bg-danger px-3.5 py-2 text-[13.5px] font-medium text-white"
        >
          Akhiri Sesi
        </button>
      </div>
    </div>
  );
}
