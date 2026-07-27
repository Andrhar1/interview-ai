import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { IconTile } from '../components/IconTile';
import { ScoreBadge } from '../components/ScoreBadge';
import { iconFor } from '../lib/fieldIcons';
import { formatDate, formatDuration } from '../lib/score';
import { apiRequest, ApiError } from '../lib/api';
import type { SessionListItem, SessionsListResponse } from '../types/session';

/** History list (handoff §6): completed sessions as cards, or the empty state. */
export function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<SessionsListResponse>('/sessions');
        // Abandoned in_progress sessions have no evaluation to review — hide them.
        if (active) setSessions(res.sessions.filter((s) => s.status === 'completed'));
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : 'Gagal memuat riwayat.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-full">
      <Navbar />
      <main className="mx-auto w-full max-w-[920px] px-6 pb-20 pt-10">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Riwayat Sesi</h1>
        <p className="mt-1.5 text-[15px] text-ink-secondary">
          Tinjau sesi latihan Anda sebelumnya.
        </p>

        <div className="mt-8">
          {error && <Card className="p-6 text-sm text-danger">{error}</Card>}

          {!error && sessions === null && (
            <Card className="p-6 text-sm text-ink-secondary">Memuat riwayat…</Card>
          )}

          {!error && sessions?.length === 0 && (
            <Card className="flex flex-col items-center px-6 py-16 text-center">
              <IconTile size={48}>
                <Mic size={22} color="#061f3d" strokeWidth={1.8} />
              </IconTile>
              <h2 className="mt-4 text-lg font-semibold text-ink">Belum ada sesi</h2>
              <p className="mt-1.5 max-w-[380px] text-sm leading-[1.6] text-ink-secondary">
                Anda belum menyelesaikan sesi wawancara. Mulai latihan pertama Anda untuk melihat
                riwayat di sini.
              </p>
              <Button
                variant="accent"
                className="mt-5 px-4 py-2.5 text-sm"
                onClick={() => navigate('/dashboard')}
              >
                Mulai sesi pertama
              </Button>
            </Card>
          )}

          {!error && !!sessions?.length && (
            <div className="flex flex-col gap-3">
              {sessions.map((s) => {
                const Icon = iconFor(s.job_field_slug);
                const duration = formatDuration(s.duration_seconds);
                return (
                  <Card
                    key={s.id}
                    className="flex items-center gap-3.5 px-5 py-[18px] animate-fade-up"
                  >
                    <IconTile size={38}>
                      <Icon size={18} color="#061f3d" strokeWidth={1.8} />
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-ink">
                        {s.job_field_name}
                      </h3>
                      <p className="mt-0.5 text-[13px] text-ink-secondary">
                        {formatDate(s.created_at)}
                        {duration && ` · ${duration}`}
                      </p>
                    </div>
                    {s.overall_score != null && <ScoreBadge score100={s.overall_score} />}
                    <Button
                      variant="outline"
                      className="px-3.5 py-2 text-[13px]"
                      onClick={() => navigate(`/history/${s.id}`)}
                    >
                      Lihat Detail
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
