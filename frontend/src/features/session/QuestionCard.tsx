import { Card } from '../../components/Card';

interface QuestionCardProps {
  n: number;
  text: string;
}

/**
 * Eyebrow shows a literal "5–7" range (not a fixed total) — the AI decides
 * how many questions to ask within that range, unlike the design prototype's
 * fixed 5-question sample list.
 */
export function QuestionCard({ n, text }: QuestionCardProps) {
  return (
    <Card className="p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.05em] text-ink-muted">
        Pertanyaan {n} dari 5–7
      </div>
      <p className="mt-2.5 text-lg leading-[1.5] text-ink" style={{ textWrap: 'pretty' }}>
        {text}
      </p>
    </Card>
  );
}
