import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Input } from '../components/Input';
import { useAuth } from '../features/auth/AuthContext';
import { ApiError } from '../lib/api';

type Mode = 'login' | 'register';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function Login() {
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  const setField = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate(): boolean {
    const next: typeof errors = {};
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Masukkan email yang valid.';
    if (form.password.length < 6) next.password = 'Kata sandi minimal 6 karakter.';
    setErrors(next);
    return !next.email && !next.password;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors((prev) => ({ ...prev, form: undefined }));
    try {
      if (isRegister) await register(form.name.trim(), form.email.trim(), form.password);
      else await login(form.email.trim(), form.password);
      navigate('/dashboard');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Terjadi kesalahan. Coba lagi.';
      setErrors((prev) => ({ ...prev, form: message }));
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-12">
      <button
        onClick={() => navigate('/')}
        className="flex cursor-pointer items-center gap-2.5 bg-transparent"
      >
        <Logo />
      </button>

      <div className="w-full max-w-[420px] rounded-card border border-border bg-surface p-8 shadow-[0_1px_3px_rgba(16,24,40,.04)]">
        <h1 className="text-center text-[22px] font-semibold tracking-[-0.01em]">
          {isRegister ? 'Buat akun' : 'Selamat datang kembali'}
        </h1>
        <p className="mt-1.5 text-center text-sm text-ink-secondary">
          {isRegister
            ? 'Mulai berlatih wawancara hari ini.'
            : 'Masuk untuk melanjutkan latihan Anda.'}
        </p>

        {/* Segmented toggle */}
        <div className="my-6 flex rounded-[8px] bg-track p-1">
          {(['login', 'register'] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-[6px] py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(16,24,40,.06)]'
                    : 'bg-transparent text-[#6b7280]'
                }`}
              >
                {m === 'login' ? 'Masuk' : 'Daftar'}
              </button>
            );
          })}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {isRegister && (
            <Input
              label="Nama lengkap"
              name="name"
              placeholder="Nama Anda"
              value={form.name}
              onChange={setField('name')}
              required
            />
          )}
          <Input
            label="Email"
            name="email"
            type="email"
            placeholder="nama@email.com"
            value={form.email}
            onChange={setField('email')}
            error={errors.email}
          />
          <Input
            label="Kata sandi"
            name="password"
            type="password"
            placeholder="Minimal 6 karakter"
            value={form.password}
            onChange={setField('password')}
            error={errors.password}
          />

          {errors.form && <p className="text-[12.5px] text-danger">{errors.form}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-[8px] bg-blue py-3 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-70"
          >
            {loading && (
              <span className="inline-block h-[15px] w-[15px] animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {loading ? 'Memproses…' : isRegister ? 'Daftar' : 'Masuk'}
          </button>
        </form>
      </div>

      <p className="text-[13px] text-ink-muted">
        {isRegister ? 'Sudah punya akun? ' : 'Belum punya akun? '}
        <button
          type="button"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
          className="cursor-pointer bg-transparent font-medium text-blue"
        >
          {isRegister ? 'Masuk' : 'Daftar'}
        </button>
      </p>
    </div>
  );
}
