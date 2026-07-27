import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MessageSquareText } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { IconTile } from '../components/IconTile';
import { MetricBar } from '../components/MetricBar';
import { ScoreBadge } from '../components/ScoreBadge';
import { TranscriptBubble } from '../features/session/TranscriptBubble';
import { iconFor } from '../lib/fieldIcons';
import { formatDate, formatDuration } from '../lib/score';
import { apiRequest, ApiError } from '../lib/api';
import type { SessionDetailResponse, TranscriptExchange } from '../types/session';

/** Mongo stores exchanges as free JSON — keep only well-formed bubbles. */
function asExchanges(value: unknown): TranscriptExchange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is TranscriptExchange =>
      !!e &&
      typeof e === 'object' &&
      ((e as TranscriptExchange).role === 'ai' || (e as TranscriptExchange).role === 'user') &&
      typeof (e as TranscriptExchange).text === 'string',
  );
}

/** History Detail (handoff §6): metrics + AI feedback on the left, transcript on the right. */
export function HistoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<SessionDetailResponse>(`/sessions/${id}`);
        if (active) setDetail(res);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : 'Gagal memuat detail sesi.');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const session = detail?.session;
  const evaluation = detail?.evaluation;
  const exchanges = asExchanges(detail?.transcript?.exchanges);
  const Icon = iconFor(session?.job_field_slug ?? '');
  const duration = formatDuration(session?.duration_seconds ?? null);

  return (
    <div className="min-h-full">
      <Navbar />
      <main className="mx-auto w-full max-w-[860px] px-6 pb-20 pt-8">
        <Link
          to="/history"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-secondary hover:text-ink"
        >
          <ChevronLeft size={15} strokeWidth={2} />
          Kembali ke Riwayat
        </Link>

        {error && <Card className="mt-5 p-6 text-sm text-danger">{error}</Card>}
        {!error && !detail && (
          <Card className="mt-5 p-6 text-sm text-ink-secondary">Memuat detail sesi…</Card>
        )}

        {session && (
          <>
            <div className="mt-5 flex items-center gap-3.5">
              <IconTile size={44}>
                <Icon size={20} color="#061f3d" strokeWidth={1.8} />
              </IconTile>
              <div className="min-w-0 flex-1">
                <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
                  {session.job_field_name}
                </h1>
                <p className="mt-0.5 text-sm text-ink-secondary">
                  {formatDate(session.created_at)}
                  {duration && ` · ${duration}`}
                  {session.job_title && ` · ${session.job_title}`}
                  {session.company && ` — ${session.company}`}
                </p>
              </div>
              {evaluation && (
                <ScoreBadge
                  score100={evaluation.overall_score}
                  withScale
                  className="px-3.5 py-1.5 text-base"
                />
              )}
            </div>

            <div className="mt-6 grid items-start gap-4 md:[grid-template-columns:1.2fr_1fr]">
              <div className="flex flex-col gap-4">
                <Card className="p-5">
                  <h2 className="text-[15px] font-semibold text-ink">Rincian penilaian</h2>
                  {evaluation?.metrics?.length ? (
                    <div className="mt-4 flex flex-col gap-4">
                      {evaluation.metrics.map((m) => (
                        <MetricBar key={m.key} metric={m} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-ink-secondary">
                      Penilaian belum tersedia untuk sesi ini.
                    </p>
                  )}
                </Card>

                {evaluation?.feedback_text && (
                  <div className="rounded-card border border-success-border bg-success-bg p-5">
                    <h2 className="text-[15px] font-semibold text-success-ink">Umpan balik AI</h2>
                    <p className="mt-2 text-sm leading-[1.6] text-[#296a40]">
                      {evaluation.feedback_text}
                    </p>
                  </div>
                )}
              </div>

              <Card className="flex max-h-[520px] flex-col overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                  <MessageSquareText size={15} color="#5b6471" strokeWidth={2} />
                  <h2 className="text-[13.5px] font-semibold text-ink">Transkrip</h2>
                </div>
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {exchanges.length ? (
                    exchanges.map((e, i) => <TranscriptBubble key={i} role={e.role} text={e.text} />)
                  ) : (
                    <p className="text-[13px] text-ink-muted">
                      Transkrip tidak tersedia untuk sesi ini.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            <Button
              variant="primary"
              className="mt-6 px-4 py-2.5 text-sm"
              onClick={() => navigate('/dashboard')}
            >
              Kembali ke Dashboard
            </Button>
          </>
        )}
      </main>
    </div>
  );
}
