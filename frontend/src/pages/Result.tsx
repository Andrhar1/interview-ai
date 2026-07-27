import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { MetricBar } from '../components/MetricBar';
import { formatDuration, formatTen, scoreLabel, toTen } from '../lib/score';
import { apiRequest, ApiError } from '../lib/api';
import type { Evaluation, SessionDetailResponse } from '../types/session';

/**
 * Result & Feedback (handoff §5). The evaluation is already persisted by
 * /end before Session navigates here, so this fetches the session detail
 * (field name, duration, evaluation); router state acts as a fast fallback.
 */
export function Result() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const stateEvaluation = (location.state as { evaluation?: Evaluation } | null)?.evaluation;

  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<SessionDetailResponse>(`/sessions/${id}`);
        if (active) setDetail(res);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : 'Gagal memuat hasil sesi.');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const evaluation = detail?.evaluation ?? stateEvaluation ?? null;

  if (!detail && !error && !stateEvaluation) {
    return (
      <div className="min-h-full">
        <Navbar />
        <main className="mx-auto w-full max-w-[860px] px-6 pb-20 pt-10">
          <Card className="flex flex-col items-center px-6 py-16 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-track border-t-blue" />
            <p className="mt-4 text-sm text-ink-secondary">Menganalisis jawaban Anda…</p>
          </Card>
        </main>
      </div>
    );
  }

  const session = detail?.session;
  const duration = formatDuration(session?.duration_seconds ?? null);
  const ten = evaluation ? toTen(evaluation.overall_score) : null;

  return (
    <div className="min-h-full">
      <Navbar />
      <main className="mx-auto w-full max-w-[860px] px-6 pb-20 pt-10">
        <p className="text-[13px] font-medium text-ink-secondary">
          Sesi selesai
          {session && ` · ${session.job_field_name}`}
          {duration && ` · ${duration}`}
        </p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">Hasil &amp; Umpan Balik</h1>

        {error && !evaluation && <Card className="mt-6 p-6 text-sm text-danger">{error}</Card>}

        {!evaluation && !error && (
          <Card className="mt-6 p-6 text-sm text-ink-secondary">
            Penilaian belum tersedia untuk sesi ini.
          </Card>
        )}

        {evaluation && ten != null && (
          <>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row">
              <div className="flex w-full flex-col items-center justify-center rounded-card bg-navy px-6 py-7 text-center text-white sm:w-[200px] sm:shrink-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
                  Skor keseluruhan
                </p>
                <p className="mt-1 text-[56px] font-semibold leading-none tabular-nums">
                  {formatTen(ten)}
                </p>
                <p className="mt-1 text-[13px] text-[#94a3b8]">dari 10</p>
                <span className="mt-3 inline-flex items-center rounded-pill bg-white/10 px-3 py-1 text-[12.5px] font-medium">
                  {scoreLabel(ten)}
                </span>
              </div>

              <Card className="flex-1 p-5">
                <h2 className="text-[15px] font-semibold text-ink">Ringkasan</h2>
                <p className="mt-2 text-sm leading-[1.65] text-ink-secondary">
                  {evaluation.summary ??
                    evaluation.feedback_text ??
                    'Ringkasan tidak tersedia untuk sesi ini.'}
                </p>
              </Card>
            </div>

            <Card className="mt-4 p-5">
              <h2 className="text-[15px] font-semibold text-ink">Rincian penilaian</h2>
              <div className="mt-4 flex flex-col gap-4">
                {evaluation.metrics.map((m) => (
                  <MetricBar key={m.key} metric={m} />
                ))}
              </div>
            </Card>

            <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              <div className="rounded-card border border-success-border bg-success-bg p-5">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-success-ink">
                  <CheckCircle2 size={17} strokeWidth={2} />
                  Yang sudah baik
                </h2>
                <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-[1.6] text-[#296a40]">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <Card className="border-warning-border p-5">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-warning-ink">
                  <AlertCircle size={17} strokeWidth={2} />
                  Bisa ditingkatkan
                </h2>
                <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-[1.6] text-ink-secondary">
                  {evaluation.improvements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </Card>
            </div>
          </>
        )}

        <div className="mt-7 flex gap-3">
          <Button
            variant="primary"
            className="px-4 py-2.5 text-sm"
            onClick={() => navigate('/dashboard')}
          >
            Kembali ke Dashboard
          </Button>
          <Button
            variant="outline"
            className="px-4 py-2.5 text-sm"
            onClick={() => navigate('/history')}
          >
            Lihat Riwayat
          </Button>
        </div>
      </main>
    </div>
  );
}
