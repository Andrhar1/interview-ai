import { useNavigate } from 'react-router-dom';
import { Mic, BarChart3, FileText, ArrowRight } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Card } from '../components/Card';
import { IconTile } from '../components/IconTile';
import { Button } from '../components/Button';

const features = [
  {
    icon: Mic,
    title: 'Percakapan suara nyata',
    body: 'Berbicara langsung dengan AI seperti wawancara sungguhan, bukan sekadar mengetik jawaban.',
  },
  {
    icon: BarChart3,
    title: 'Umpan balik terukur',
    body: 'Dapatkan skor dan masukan per aspek: komunikasi, relevansi, dan struktur jawaban.',
  },
  {
    icon: FileText,
    title: 'Sesuai deskripsi kerja',
    body: 'Tempel deskripsi lowongan agar AI menyesuaikan pertanyaan dengan posisi yang Anda incar.',
  },
];

export function Landing() {
  const navigate = useNavigate();
  const goAuth = () => navigate('/login');

  return (
    <div className="min-h-full flex flex-col">
      {/* Sticky translucent header */}
      <header className="sticky top-0 z-40 border-b border-border bg-[rgba(247,248,249,0.85)] backdrop-blur-[8px]">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-6">
          <Logo />
          <Button variant="outline" className="px-4 py-2 text-sm" onClick={goAuth}>
            Masuk
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[760px] px-6 pb-16 pt-[100px] text-center">
        <div className="mb-7 inline-flex items-center gap-[7px] rounded-pill border border-[#dbe3f1] bg-tint-blue px-3 py-[5px] text-[13px] font-medium text-blue">
          <span className="h-1.5 w-1.5 rounded-full bg-blue" />
          Latihan wawancara berbasis suara
        </div>
        <h1 className="text-[52px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink text-balance">
          Latih wawancara kerja Anda
          <br />
          dengan pewawancara AI
        </h1>
        <p className="mx-auto mt-6 max-w-[540px] text-[18px] leading-[1.6] text-ink-secondary text-pretty">
          Berlatih menjawab pertanyaan secara langsung melalui percakapan suara, lalu dapatkan umpan
          balik terperinci untuk meningkatkan peluang Anda diterima.
        </p>
        <div className="mt-9 flex justify-center">
          <Button variant="accent" className="px-7 py-3.5 text-base" onClick={goAuth}>
            Mulai Sekarang
            <ArrowRight size={17} strokeWidth={2} />
          </Button>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto w-full max-w-[1000px] px-6 pb-[110px] pt-6">
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {features.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-[26px]">
              <IconTile className="mb-4">
                <Icon size={20} color="#061f3d" strokeWidth={1.8} />
              </IconTile>
              <h3 className="mb-[7px] text-base font-semibold text-ink">{title}</h3>
              <p className="text-sm leading-[1.6] text-ink-secondary">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto bg-navy text-[#8aa0bd]">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-7 text-[13px]">
          <span>© 2026 InterviewAI</span>
          <span>Dibuat untuk pencari kerja Indonesia</span>
        </div>
      </footer>
    </div>
  );
}
