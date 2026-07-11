import { Button } from '../../components/Button';
import type { ConnState } from '../../lib/gemini/liveClient';

interface ReconnectOverlayProps {
  state: Extract<ConnState, 'connecting' | 'reconnecting' | 'error'>;
  onRetry: () => void;
}

/**
 * Classic blur overlay shown over the left column once a session has
 * connected at least once and then drops (handoff §4 "connection-drop
 * demo"). For `error` (reconnect attempts exhausted) the retry button is
 * the primary action; for `reconnecting`/`connecting` (auto-retry already
 * under way, or a manual retry in flight) it's a lower-emphasis outline.
 */
export function ReconnectOverlay({ state, onRetry }: ReconnectOverlayProps) {
  const isError = state === 'error';
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3.5 rounded-card bg-[rgba(247,248,249,.92)] backdrop-blur-[3px]">
      <span className="h-[30px] w-[30px] animate-spin rounded-full border-[3px] border-[#fde0e0] border-t-danger" />
      <div className="text-center">
        <div className="text-[15px] font-semibold text-danger-ink">Koneksi terputus</div>
        <div className="mt-[3px] text-[13px] text-[#7c8493]">
          {isError ? 'Gagal menghubungkan kembali.' : 'Mencoba menghubungkan kembali…'}
        </div>
      </div>
      <Button
        type="button"
        variant={isError ? 'primary' : 'outline'}
        onClick={onRetry}
        className="px-4 py-2 text-[13px]"
      >
        Coba sekarang
      </Button>
    </div>
  );
}
