import { Button } from '../../components/Button';

interface EndConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

/** End-session confirm modal (handoff §4). */
export function EndConfirmModal({ onCancel, onConfirm }: EndConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,31,61,.45)] p-4">
      <div className="w-full max-w-[380px] animate-pop rounded-card bg-surface p-7">
        <h3 className="text-lg font-semibold text-ink">Akhiri sesi wawancara?</h3>
        <p className="mt-2 text-sm leading-[1.55] text-ink-secondary">
          Sesi akan dianalisis dan Anda akan melihat hasil serta umpan balik.
        </p>
        <div className="mt-5 flex gap-2.5">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 py-[11px] text-sm">
            Lanjutkan
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} className="flex-1 py-[11px] text-sm">
            Akhiri Sesi
          </Button>
        </div>
      </div>
    </div>
  );
}
