import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Code,
  Megaphone,
  BarChart3,
  Users,
  GraduationCap,
  LayoutGrid,
  Upload,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { IconTile } from '../components/IconTile';
import { useAuth } from '../features/auth/AuthContext';
import { apiRequest, ApiError } from '../lib/api';
import type { CreateSessionResponse, JobField, JobFieldsResponse } from '../types/session';

const FIELD_ICONS: Record<string, LucideIcon> = {
  'teknologi-informasi': Code,
  pemasaran: Megaphone,
  keuangan: BarChart3,
  sdm: Users,
  pendidikan: GraduationCap,
  lainnya: LayoutGrid,
};

function iconFor(slug: string): LucideIcon {
  return FIELD_ICONS[slug] ?? LayoutGrid;
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.name?.trim().split(' ')[0] ?? '';

  // Step 1 — job fields
  const [jobFields, setJobFields] = useState<JobField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  // Step 2 — context
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobDesc, setJobDesc] = useState('');

  // Step 2 — CV (UI only, no upload)
  const [cvName, setCvName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setFieldsLoading(true);
      setFieldsError(null);
      try {
        const res = await apiRequest<JobFieldsResponse>('/job-fields');
        if (active) setJobFields(res.jobFields);
      } catch (err) {
        if (active) {
          const message =
            err instanceof ApiError ? err.message : 'Gagal memuat bidang pekerjaan.';
          setFieldsError(message);
        }
      } finally {
        if (active) setFieldsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function pickFile(file: File | undefined | null) {
    if (!file) return;
    setCvName(file.name);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  function clearFile(e: React.MouseEvent) {
    e.stopPropagation();
    setCvName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onStart() {
    if (!selectedFieldId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiRequest<CreateSessionResponse>('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          job_field_id: selectedFieldId,
          job_title: jobTitle.trim() || undefined,
          company: company.trim() || undefined,
          job_description: jobDesc.trim() || undefined,
        }),
      });
      navigate(`/session/${res.session.id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Gagal memulai sesi. Coba lagi.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const charCount = jobDesc.length;
  const showConfirmation = jobDesc.trim().length > 40;

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

        {/* Step 1 */}
        <h2 className="mt-8 mb-3 text-lg font-semibold text-ink">1. Pilih bidang pekerjaan</h2>

        {fieldsLoading && (
          <Card className="p-6 text-sm text-ink-secondary">Memuat bidang pekerjaan…</Card>
        )}

        {!fieldsLoading && fieldsError && (
          <Card className="p-6 text-sm text-danger">{fieldsError}</Card>
        )}

        {!fieldsLoading && !fieldsError && (
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {jobFields.map((field) => {
              const Icon = iconFor(field.slug);
              const selected = selectedFieldId === field.id;
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setSelectedFieldId(field.id)}
                  className={`relative flex items-start gap-3.5 rounded-card border p-4 text-left transition-colors ${
                    selected
                      ? 'border-blue bg-[#eff6ff] shadow-[0_0_0_1px_#2563eb]'
                      : 'border-border bg-surface hover:border-border-input'
                  }`}
                >
                  <IconTile className={selected ? 'bg-[#dbeafe]' : ''}>
                    <Icon size={20} color={selected ? '#2563eb' : '#061f3d'} strokeWidth={1.8} />
                  </IconTile>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-ink">{field.name}</h3>
                    <p className="mt-0.5 text-[13px] leading-[1.5] text-ink-secondary">
                      {field.description}
                    </p>
                  </div>
                  {selected && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue text-white">
                      <Check size={13} strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2 */}
        <div className="mt-8 mb-3 flex items-center gap-2.5">
          <h2 className="text-lg font-semibold text-ink">2. Konteks lowongan</h2>
          <span className="inline-flex items-center rounded-pill bg-track px-2.5 py-0.5 text-[12px] font-medium text-ink-secondary">
            Opsional
          </span>
        </div>

        <Card className="p-6">
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <div>
              <label htmlFor="jobTitle" className="mb-1.5 block text-[13px] font-medium text-ink">
                Posisi yang dilamar
              </label>
              <input
                id="jobTitle"
                type="text"
                placeholder="mis. Backend Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full rounded-[8px] border border-border-input bg-surface px-3.5 py-[11px] text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-blue"
              />
            </div>
            <div>
              <label htmlFor="company" className="mb-1.5 block text-[13px] font-medium text-ink">
                Perusahaan
              </label>
              <input
                id="company"
                type="text"
                placeholder="mis. PT Maju Teknologi"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-[8px] border border-border-input bg-surface px-3.5 py-[11px] text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-blue"
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="jobDesc" className="mb-1.5 block text-[13px] font-medium text-ink">
              Deskripsi pekerjaan
            </label>
            <textarea
              id="jobDesc"
              placeholder="Tempel tanggung jawab dan kualifikasi dari iklan lowongan di sini…"
              value={jobDesc}
              onChange={(e) => setJobDesc(e.target.value)}
              className="min-h-[120px] w-full resize-y rounded-[8px] border border-border-input bg-surface px-3.5 py-[11px] text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-blue"
            />
            <div className="mt-1.5 flex items-center justify-between text-[12.5px]">
              <span className="text-ink-muted">{charCount} karakter</span>
              {showConfirmation && (
                <span className="inline-flex items-center gap-1.5 text-success-ink">
                  <Check size={14} strokeWidth={2.5} />
                  Konteks akan dipakai AI
                </span>
              )}
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-1.5 block text-[13px] font-medium text-ink">
              Unggah CV (opsional)
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-tile border border-dashed p-6 text-center transition-colors ${
                dragOver ? 'border-blue bg-[#eff6ff]' : 'border-border-input bg-[#fafbfc]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              {cvName ? (
                <>
                  <FileText size={22} color="#16a34a" strokeWidth={1.8} />
                  <p className="mt-2 text-sm font-medium text-ink">{cvName}</p>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="mt-1 cursor-pointer bg-transparent text-[13px] font-medium text-blue"
                  >
                    hapus
                  </button>
                </>
              ) : (
                <>
                  <Upload size={22} color="#8a929e" strokeWidth={1.8} />
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-medium text-ink">Klik untuk unggah</span> atau seret
                    berkas ke sini
                  </p>
                  <p className="mt-1 text-[12.5px] text-ink-muted">PDF atau DOCX, maks 5MB</p>
                </>
              )}
            </div>
          </div>
        </Card>

        {/* Start */}
        <button
          type="button"
          disabled={!selectedFieldId || submitting}
          onClick={onStart}
          className={`mt-6 w-full rounded-[8px] py-[15px] text-base font-medium transition-colors ${
            selectedFieldId
              ? 'cursor-pointer bg-navy text-white hover:bg-[#0a2b54] disabled:cursor-not-allowed disabled:opacity-70'
              : 'cursor-not-allowed bg-[#e5e7eb] text-[#9aa1ad]'
          }`}
        >
          {submitting
            ? 'Memulai sesi…'
            : selectedFieldId
              ? 'Mulai Sesi Wawancara'
              : 'Pilih bidang untuk mulai'}
        </button>
        {!selectedFieldId && (
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            Pilih bidang pekerjaan terlebih dahulu untuk memulai.
          </p>
        )}
        {submitError && <p className="mt-2 text-[13px] text-danger">{submitError}</p>}
      </main>
    </div>
  );
}
