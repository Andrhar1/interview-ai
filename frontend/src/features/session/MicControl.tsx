import { Mic, Square } from 'lucide-react';
import type { MicState } from './types';

interface MicControlProps {
  micState: MicState;
  onToggle: () => void;
}

const HINTS: Record<MicState, string> = {
  disabled: 'Menunggu koneksi…',
  unmuted: 'Ketuk untuk membisukan',
  muted: 'Ketuk untuk melanjutkan',
  denied: 'Akses mikrofon ditolak. Izinkan mikrofon lalu coba lagi.',
};

/** Circular 72px mic button (handoff §4) — toggles mute, not push-to-talk. */
export function MicControl({ micState, onToggle }: MicControlProps) {
  const disabled = micState === 'disabled';
  const active = micState === 'unmuted';
  const bg = active ? '#dc2626' : disabled ? '#94a3b8' : '#061f3d';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex h-[84px] w-[84px] items-center justify-center">
        {active && <span className="absolute inset-0 animate-mic-ring rounded-full bg-danger" />}
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          aria-label={active ? 'Bisukan mikrofon' : 'Aktifkan mikrofon'}
          className="relative z-[1] flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-[0_2px_8px_rgba(6,31,61,.18)] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: bg, cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          {active ? (
            <Square size={26} color="#fff" fill="#fff" />
          ) : (
            <Mic size={28} color="#fff" strokeWidth={1.9} />
          )}
        </button>
      </div>
      <div
        className={`max-w-[240px] text-center text-[13.5px] font-medium ${
          micState === 'denied' ? 'text-danger' : 'text-ink-secondary'
        }`}
      >
        {HINTS[micState]}
      </div>
    </div>
  );
}
