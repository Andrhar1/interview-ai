import { Headphones } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

interface PreSessionCardProps {
  fieldTitle: string;
  context: string;
  onStart: () => void;
}

/**
 * Pre-session gate. The button click is not just UI — it's the user gesture
 * that unlocks the AudioContext (autoplay policy) and requests microphone
 * permission; without it the AI interviewer's voice might never be heard.
 */
export function PreSessionCard({ fieldTitle, context, onStart }: PreSessionCardProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16">
      <Card className="flex w-full max-w-[440px] flex-col items-center gap-5 p-8 text-center">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">{fieldTitle}</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">{context}</p>
        </div>
        <p className="text-[14px] text-ink-secondary">
          Pewawancara AI akan menyapa dan mengajukan pertanyaan pertama begitu sesi dimulai. Jawab
          langsung dengan suara — tidak perlu menekan tombol apa pun.
        </p>
        <Button variant="accent" className="h-11 w-full text-[15px]" onClick={onStart}>
          Mulai Wawancara
        </Button>
        <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
          <Headphones size={15} strokeWidth={1.8} />
          Gunakan headphone agar suara AI tidak tertangkap mikrofon.
        </div>
      </Card>
    </div>
  );
}
