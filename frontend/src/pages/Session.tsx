import { useParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';

/**
 * Placeholder session screen for Fase 2 — confirms navigation after a
 * session is created. The real interview interface lands in Fase 3.
 */
export function Session() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="min-h-full">
      <Navbar />
      <main className="mx-auto w-full max-w-[1000px] px-6 pb-20 pt-10">
        <Card className="p-6 text-sm text-ink-secondary">
          Sesi {id} — antarmuka wawancara akan tersedia di Fase 3.
        </Card>
      </main>
    </div>
  );
}
