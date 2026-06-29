import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { useAuth } from '../features/auth/AuthContext';

/**
 * Placeholder dashboard for Fase 1 — confirms an authenticated session.
 * The full configuration UI (job field, context, CV, start) lands in Fase 2.
 */
export function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(' ')[0] ?? '';

  return (
    <div className="min-h-full">
      <Navbar />
      <main className="mx-auto w-full max-w-[1000px] px-6 pb-20 pt-10">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          Selamat datang, {firstName}
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-secondary">
          Pilih bidang pekerjaan, tambahkan konteks lowongan, lalu mulai sesi latihan.
        </p>

        <Card className="mt-8 p-6 text-sm text-ink-secondary">
          Konfigurasi sesi (pilih bidang, konteks lowongan, unggah CV) akan tersedia di Fase 2.
        </Card>
      </main>
    </div>
  );
}
