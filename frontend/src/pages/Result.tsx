import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import type { Evaluation } from '../types/session';

/**
 * MINIMAL Result placeholder (Task 5 scope guardrail — the full Result &
 * Feedback screen per handoff §5 is built in Fase 5). Reads the evaluation
 * passed via router state from Session's end flow; Riwayat/History is also
 * Fase 5, so only a Dashboard action is offered here.
 */
export function Result() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const evaluation = (location.state as { evaluation?: Evaluation } | null)?.evaluation;

  return (
    <div className="min-h-full">
      <Navbar />
      <main className="mx-auto w-full max-w-[1000px] px-6 pb-20 pt-10">
        <Card className="p-6 text-sm text-ink-secondary">
          <p className="text-base font-medium text-ink">Sesi selesai dan tersimpan.</p>
          <p className="mt-1 text-ink-secondary">Sesi {id}.</p>
          {evaluation && (
            <p className="mt-3 text-ink">
              Skor: {Math.round(evaluation.overall_score / 10)}/10
            </p>
          )}
          <Button
            variant="primary"
            className="mt-6 px-4 py-2.5 text-sm"
            onClick={() => navigate('/dashboard')}
          >
            Kembali ke Dashboard
          </Button>
        </Card>
      </main>
    </div>
  );
}
