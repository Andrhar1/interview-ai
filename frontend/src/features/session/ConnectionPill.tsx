import type { ConnState } from '../../lib/gemini/liveClient';

const CONFIG: Record<ConnState, { color: string; text: string }> = {
  idle: { color: '#d97706', text: 'Menghubungkan…' },
  connecting: { color: '#d97706', text: 'Menghubungkan…' },
  connected: { color: '#16a34a', text: 'Terhubung' },
  reconnecting: { color: '#dc2626', text: 'Koneksi terputus' },
  error: { color: '#dc2626', text: 'Koneksi terputus' },
  closed: { color: '#9aa1ad', text: 'Sesi berakhir' },
};

/** Top-bar connection pill (handoff §4: dot + text, states colour-coded). */
export function ConnectionPill({ state }: { state: ConnState }) {
  const cfg = CONFIG[state];
  return (
    <div className="flex items-center gap-[7px] whitespace-nowrap rounded-pill bg-white/[.08] px-[13px] py-[6px] text-[12.5px] font-medium">
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: cfg.color }} />
      {cfg.text}
    </div>
  );
}
