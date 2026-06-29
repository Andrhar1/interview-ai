# Implementation Plan — InterviewAI

> Rencana implementasi teknis untuk membangun **InterviewAI** sesuai [`PRD.md`](./PRD.md) dan design handoff di [`design_handoff_interviewai/`](./design_handoff_interviewai/).
>
> **Cara pakai:** Kerjakan **satu fase pada satu waktu** (lihat urutan di bawah). Setiap fase punya deliverable, langkah, dan Definition of Done (DoD) yang jelas. Jangan memulai fase lain sebelum fase berjalan selesai & ter-review.

---

## 0. Keputusan yang Sudah Dikunci

Keputusan berikut sudah dikonfirmasi dan menjadi dasar seluruh plan ini. Selain ini, ikuti **Locked Technology Decisions** di PRD §2.

| Topik | Keputusan | Catatan |
|---|---|---|
| Bahasa frontend | **TypeScript** | React + Vite + TS + Tailwind |
| Struktur repo | **Monorepo** | `/frontend` & `/backend` dalam satu repo |
| Konteks lowongan | **Ditambahkan ke schema** | `job_title`, `company`, `job_description` di `interview_sessions`, di-inject ke system instruction Gemini |
| Struktur evaluasi | **Terstruktur (JSONB)** | Metrik per-kategori + strengths/improvements disimpan sebagai JSONB di PostgreSQL |
| Layout sesi | **Varian "Klasik" saja** | Dua kolom: visualizer/question/mic + panel transkrip. Varian Imersif & Transkrip tidak dibangun |

### Perubahan terhadap Data Model PRD (§5)

Plan ini **memperluas** data model PRD pada dua tabel:

**`interview_sessions`** — tambahan kolom:
| field | type | notes |
|---|---|---|
| job_title | VARCHAR(150) | nullable — posisi yang dilamar |
| company | VARCHAR(150) | nullable — nama perusahaan |
| job_description | TEXT | nullable — deskripsi pekerjaan (di-inject ke prompt) |

**`evaluations`** — tambahan kolom (selain `feedback_text` + `overall_score` dari PRD):
| field | type | notes |
|---|---|---|
| metrics | JSONB | `[{ key, label, score, note }]` — Komunikasi, Relevansi, Struktur (STAR), Kepercayaan Diri |
| strengths | JSONB | `string[]` — "Yang sudah baik" |
| improvements | JSONB | `string[]` — "Bisa ditingkatkan" |
| summary | TEXT | ringkasan naratif (juga disimpan di transkrip Mongo) |

> Keputusan altitude: skor disimpan sebagai angka **0–100** di DB (sesuai PRD `overall_score`), namun ditampilkan sebagai skala **0–10** di UI (sesuai design). Konversi dilakukan di layer presentasi (`score / 10`).

---

## 1. Arsitektur Repo & Struktur Folder

```
interview-ai/
├── docs/
│   ├── PRD.md
│   ├── IMPLEMENTATION_PLAN.md          ← dokumen ini
│   └── design_handoff_interviewai/
├── frontend/                            # React + Vite + TS + Tailwind
│   ├── src/
│   │   ├── components/                  # komponen UI reusable (Button, Card, Input, …)
│   │   ├── features/                    # per-domain: auth, dashboard, session, result, history
│   │   ├── lib/                         # api client, audio (Web Audio/AudioWorklet), gemini ws client
│   │   ├── hooks/
│   │   ├── pages/                       # route-level screens (6 layar)
│   │   ├── styles/                      # tokens.css / tailwind config tokens
│   │   ├── types/
│   │   └── App.tsx
│   ├── public/audio-worklet/            # PCM capture worklet
│   └── vite.config.ts
├── backend/                             # Node.js + Express + TS
│   ├── src/
│   │   ├── config/                      # env, db pools (pg + mongo)
│   │   ├── middleware/                  # auth, rateLimit, errorHandler, validate
│   │   ├── modules/                     # auth, jobFields, sessions, cv, gemini, evaluations
│   │   │   └── <module>/                # controller, service, routes, schema (zod)
│   │   ├── db/                          # migrations, seeds, sql helpers
│   │   ├── utils/
│   │   └── server.ts
│   └── tsconfig.json
├── deploy/                              # ecosystem.config.js, nginx.conf, postgresql.conf, DEPLOY.md
├── .env.example
├── package.json                        # workspaces: ["frontend", "backend"]
└── README.md
```

**Tooling lintas-paket:** npm workspaces, ESLint + Prettier, `tsconfig` base bersama. Backend pakai `zod` untuk validasi input setiap endpoint (memenuhi NFR "input validation on every endpoint").

---

## 2. Design System → Implementasi

Ekstrak token dari design handoff menjadi sumber kebenaran tunggal (`frontend/src/styles/tokens` + Tailwind theme extend). Wajib direproduksi presisi.

| Kategori | Nilai kunci (dari handoff) |
|---|---|
| Warna | Navy `#061f3d`, Blue `#2563eb`, page bg `#f7f8f9`, surface `#fff`, border `#ececef`/`#d8dade`, success `#16a34a`, warning `#d97706`, danger `#dc2626` |
| Skor → warna | `≥8` hijau, `6.5–<8` amber, `<6.5` merah (skala 10) |
| Font | Inter (Google Fonts), weight 400/500/600 saja, antialiased |
| Radius | button/input `8`, card `12`, pill `999`, icon tile `9–10` |
| Shadow | minimal; borders > shadows. Modal `0 20px 50px rgba(6,31,61,.25)` |
| Ikon | **Lucide** (mapping di handoff: mic, file-text, code, megaphone, bar-chart, users, graduation-cap, …) |
| Animasi | `barPulse`, `spin`, `blink`, `micRing`, `fadeUp`, `pop` |

**Aturan visual:** tanpa gradient, glow, atau emoji. Semua UI copy **Bahasa Indonesia** (ambil verbatim dari handoff).

**Komponen reusable** yang dibuat lebih dulu: `Button` (primary navy / accent blue / outline / danger), `Card`, `Input`/`Textarea`, `SegmentedControl`, `Badge`/`ScoreBadge`, `IconTile`, `Modal`, `Spinner`, `MetricBar`, `TranscriptBubble` (ai/user/feedback), `AudioVisualizer`, `Navbar`.

---

## 3. Mapping Use Case → Screen → Endpoint

| UC | Screen (design) | Endpoint utama | Fase |
|---|---|---|---|
| UC-01 Register | Login/Register | `POST /api/auth/register` | 1 |
| UC-02 Login | Login/Register | `POST /api/auth/login` | 1 |
| UC-10 Logout | Navbar | `POST /api/auth/logout` | 1 |
| UC-03 Select Job Field | Dashboard step 1 | `GET /api/job-fields` | 2 |
| UC-11 Upload CV | Dashboard step 2 | `POST /api/cv` | 4 |
| UC-04 Start Session | Dashboard → Session | `POST /api/sessions`, `POST /api/sessions/:id/token` | 2 + 3 |
| UC-05 Answer Questions | Session (Klasik) | WSS langsung ke Gemini | 3 |
| UC-06 Receive Feedback | Session + Result | (stream Gemini) + `POST /api/sessions/:id/end` | 3 |
| UC-07 End Session | Session modal → Result | `POST /api/sessions/:id/end` | 3 |
| UC-08 View History | History list | `GET /api/sessions` | 5 |
| UC-09 View Session Detail | History detail | `GET /api/sessions/:id` | 5 |

---

## Fase-Fase Pembangunan

Urutan mengikuti PRD §12. Setiap fase = satu sesi kerja terfokus.

### Fase 0 — Setup & Fondasi

**Tujuan:** Monorepo siap dikembangkan, tooling & token design terpasang.

**Langkah:**
1. Init `git`, npm workspaces (`frontend`, `backend`), `.gitignore`.
2. Scaffold `frontend` (Vite React-TS) + Tailwind; pasang Inter + Lucide; konfigurasi Tailwind theme dari token §2.
3. Scaffold `backend` (Express + TS, `ts-node-dev`/`tsx`), struktur folder modular, error handler, helmet, CORS terkunci ke `CORS_ORIGIN`.
4. Buat `.env.example` (persis PRD §13 + tambahan jika perlu), loader env tervalidasi (zod) di `config/env.ts`.
5. ESLint + Prettier lintas-paket; skrip root `dev`, `build`, `lint`.
6. Komponen UI dasar (§2) + halaman **Landing** (statis) sebagai validasi design system.
7. README skeleton (cara dev lokal).

**DoD:** `npm run dev` menjalankan FE & BE; Landing tampil sesuai design; lint bersih.

---

### Fase 1 — Autentikasi

**Tujuan:** Register/login/refresh/logout/me penuh + layar Auth.

**Backend:**
1. Migration `users` (PRD §5).
2. `POST /register` — validasi email + kekuatan password, hash **argon2** (fallback bcrypt), simpan user.
3. `POST /login` — verifikasi hash; terbitkan **access token JWT ~15m** + **refresh token ~7d**.
4. Refresh token → cookie **httpOnly, Secure, SameSite=Strict**; access token dikembalikan ke body.
5. `POST /refresh`, `POST /logout`, `GET /me`.
6. Middleware `requireAuth` (verifikasi access token, 401 bila gagal).
7. **Rate limit** `/login` & `/register` (`express-rate-limit`); password tak pernah di-log.

**Frontend:**
8. Layar **Login/Register** (segmented toggle Masuk|Daftar) sesuai handoff §"Login/Register": validasi email regex + password ≥ 6, error 12.5px merah, spinner "Memproses…".
9. Auth store (context) + API client dengan interceptor refresh otomatis pada 401.
10. Protected route guard; redirect ke Dashboard setelah sukses.
11. Navbar global (logout via `POST /logout`).

**DoD:** Register → login → akses route terproteksi → refresh saat access token kedaluwarsa → logout, semua jalan. UC-01, UC-02, UC-10.

---

### Fase 2 — Core Backend & Database

**Tujuan:** Job fields, session create/end, koneksi Mongo, endpoint history (struktur).

**Backend:**
1. Migrations: `job_fields`, `interview_sessions` (+ kolom `job_title`, `company`, `job_description`), `evaluations` (+ `metrics`, `strengths`, `improvements`, `summary` JSONB). `cv_documents` boleh dibuat di sini atau Fase 4.
2. Seed `job_fields`: Teknologi Informasi, Pemasaran, Keuangan, SDM, Pendidikan, Lainnya (deskripsi dari handoff Dashboard step 1).
3. `GET /api/job-fields`.
4. Koneksi **MongoDB Atlas** (`config/mongo.ts`), koleksi `transcripts` (schema PRD §5).
5. `POST /api/sessions` `{ job_field_id, cv_id?, job_title?, company?, job_description? }` → buat session `status=in_progress`, kembalikan `session_id`.
6. `POST /api/sessions/:id/end` `{ exchanges[], summary, duration, evaluation }` → **tulis transkrip ke Mongo dulu, lalu evaluation ke PostgreSQL** (urutan sesuai PRD §9), set `status=completed`, `ended_at`, `duration_seconds`.
7. `GET /api/sessions` (metadata list), `GET /api/sessions/:id` (metadata + merge transkrip Mongo), `DELETE /api/sessions/:id`.
8. Semua endpoint: validasi zod + kepemilikan (session milik user yang login).

**Frontend:**
9. Layar **Dashboard**: step 1 (grid 6 field selectable), step 2 (posisi, perusahaan, deskripsi + char count & konfirmasi >40 char), tombol Start (disabled tanpa field). CV dropzone UI dibuat tapi upload di Fase 4.
10. Logika start: `POST /api/sessions` lalu navigate ke Session (placeholder sampai Fase 3).

**DoD:** Dashboard memuat job fields nyata; membuat session menyimpan row + konteks lowongan; end-session menulis ke Mongo + Postgres dengan data dummy. UC-03 (sebagian), dasar UC-04/UC-07.

---

### Fase 3 — Integrasi Gemini Live ⭐ (paling kompleks)

**Tujuan:** Percakapan suara real-time end-to-end via token-broker pattern.

**Backend (token broker):**
1. `POST /api/sessions/:id/token` — backend memanggil Google untuk mint **ephemeral token** singkat. **`GEMINI_API_KEY` tidak pernah keluar server.** Validasi kepemilikan session.
2. Bangun **system instruction**: inject `{JOB_FIELD}`, dan bila ada `{JOB_TITLE}`, `{COMPANY}`, `{JOB_DESCRIPTION}`, `{CV_CONTEXT}`. Persona: HR interviewer Indonesia, satu pertanyaan/giliran, feedback singkat 2–3 kalimat, tutup setelah 5–7 pertanyaan + ringkasan. Bahasa Indonesia formal-ramah.

**Frontend (audio + WSS langsung):**
3. **Capture mic** sebagai PCM 16-bit 16kHz mono via Web Audio API + **AudioWorklet** (`public/audio-worklet/`).
4. Buka **WebSocket Secure langsung ke Gemini Live API** (`gemini-live-2.5-flash-preview`) pakai ephemeral token. Audio **tidak** lewat VPS.
5. Konfig: modalitas `[AUDIO]` + input/output transcription, output PCM 24kHz, bahasa `id-ID`, temperature 0.7, andalkan **VAD bawaan** Gemini + dukung **barge-in**.
6. **Playback** audio respons AI (24kHz) via Web Audio.
7. **Live transcript**: render bubble AI / User / Feedback (radius asimetris, `fadeUp`, typing indicator, auto-scroll) sesuai handoff §"Live transcript".
8. **Audio visualizer**: drive tinggi bar dari amplitudo nyata (`AnalyserNode.getByteFrequencyData`) — bukan keyframe random. Bars beranimasi hanya saat speaker aktif.
9. **Layar Session (Klasik)**: top bar (back→end-confirm, field title, connection pill connecting/connected/lost, timer mm:ss, tombol "Akhiri Sesi"), status badge, visualizer card, question card "Pertanyaan n dari total", mic control (idle navy / recording merah + `micRing`, disabled saat belum connect), panel transkrip kanan.
10. **Connection management**: state idle/connecting/connected/lost + overlay reconnect "Koneksi terputus / Mencoba menghubungkan kembali…" + tombol "Coba sekarang". Graceful WS close saat end (cegah leaked connection — NFR Reliability).
11. **End-session confirm modal** → kumpulkan `exchanges[]`, `summary`, `duration`, hasil scoring → `POST /api/sessions/:id/end` → navigate ke Result.

> **Catatan scoring:** evaluasi/metrik dihasilkan dari percakapan. Pendekatan: minta Gemini menghasilkan ringkasan + skor terstruktur di akhir sesi (atau panggilan analisis terpisah), lalu kirim ke endpoint end. Format metrics sesuai §0.

**DoD:** Wawancara suara penuh bisa diselesaikan; transkrip + evaluasi tersimpan; reconnect berfungsi; tak ada koneksi bocor. UC-04, UC-05, UC-06, UC-07.

---

### Fase 4 — Upload CV (opsional)

**Tujuan:** Upload & parsing CV untuk personalisasi pertanyaan.

**Langkah:**
1. `cv_documents` (jika belum), `multer` simpan ke **filesystem VPS** (`CV_STORAGE_PATH`), akses hanya via backend.
2. Validasi **tipe (PDF/DOCX) + ukuran ≤ 5MB** (NFR Security).
3. Ekstraksi teks: `pdf-parse` (PDF) + `mammoth` (DOCX) → `extracted_text`.
4. `POST /api/cv` (multipart) → `{ cv_id, extracted_text }`; `GET /api/cv/:id`.
5. Frontend: aktifkan **dropzone** Dashboard (drag-over state, filled state filename + "hapus", hidden file input).
6. Teruskan `cv_id` ke `POST /api/sessions`; inject `{CV_CONTEXT}` ke system instruction (Fase 3 step 2).

**DoD:** Upload PDF/DOCX → teks terekstrak → pertanyaan AI mempertimbangkan isi CV. UC-11.

---

### Fase 5 — History & Detail

**Tujuan:** Daftar & detail sesi, gabungan metadata Postgres + transkrip Mongo.

**Langkah:**
1. **History list** (`GET /api/sessions`): kartu per sesi (icon tile, field, "{tanggal} · {durasi}", score badge color-coded, "Lihat Detail"). **Empty state** "Belum ada sesi" + CTA "Mulai sesi pertama".
2. **History Detail** (`GET /api/sessions/:id`): header field + meta + score badge "{skor} / 10"; kiri = "Rincian penilaian" (MetricBar) + card "Umpan balik AI"; kanan = panel "Transkrip" (bubble components, scrollable).
3. **Result & Feedback** screen (pasca end-session): loading "Menganalisis…", score card navy (angka 56px skala 10 + label pill), summary, "Rincian penilaian" (4 metrik + progress bar), panel "Yang sudah baik" / "Bisa ditingkatkan", aksi "Kembali ke Dashboard" / "Lihat Riwayat".
4. Util konversi skor 0–100 ↔ 0–10 + pemetaan warna.

**DoD:** Riwayat tampil dari data nyata; detail menggabungkan Postgres + Mongo; empty state benar. UC-08, UC-09.

---

### Fase 6 — Black Box Testing

**Tujuan:** Validasi seluruh use case, target **≥ 90% lulus**.

**Langkah:**
1. Tulis test case Black Box untuk 11 use case (input, langkah, expected, actual, status) — format tabel untuk lampiran skripsi.
2. Sertakan jalur valid + invalid (email salah, password pendek, CV >5MB, mic ditolak, koneksi terputus, start tanpa field, dst.).
3. Eksekusi manual + catat hasil; perbaiki kegagalan; hitung % lulus.

**DoD:** Dokumen hasil testing ≥ 90% valid mencakup semua kategori fitur.

---

### Fase 7 — Deployment (VPS 2 vCPU / 2 GB RAM)

**Tujuan:** Live di domain via HTTPS, stabil tanpa OOM.

**Langkah (PRD §11):**
1. **Server prep:** user non-root sudo; `ufw` allow 22/80/443 deny lainnya; **swap 4 GB**; install Node LTS, PostgreSQL, nginx, certbot.
2. **PostgreSQL:** buat DB + app user; terapkan `postgresql.conf` tuned (`shared_buffers=256MB`, `effective_cache_size=768MB`, `work_mem=8MB`, `max_connections=40`); jalankan migrations + seed.
3. **MongoDB Atlas:** cluster M0, whitelist IP VPS, `MONGODB_URI` ke `.env`.
4. **Backend:** `npm ci --omit=dev`, `.env`, start **PM2 single instance**, `pm2 save` + startup hook.
5. **Frontend:** build **lokal** (`npm run build`), transfer `dist/` ke `/var/www/interviewai` (jangan build di VPS).
6. **nginx:** serve static FE, reverse-proxy `/api` → port backend, gzip on, redirect HTTP→HTTPS.
7. **TLS:** `certbot --nginx`, auto-renew.
8. **Smoke test:** register → login → start → izin mic → end → history.

**Deliverables (`deploy/`):** `ecosystem.config.js`, `nginx.conf`, `postgresql.conf` snippet, `.env.example`, `DEPLOY.md`.

**DoD (= PRD §15):** 11 use case jalan di domain via HTTPS; wawancara suara penuh tersimpan & dapat dilihat di riwayat; Black Box ≥ 90%; stabil di 2 GB RAM tanpa OOM saat sesi live.

---

## 4. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Audio PCM lewat VPS membebani RAM | **Token-broker**: audio langsung FE↔Gemini, tak lewat server (PRD §3) |
| OOM saat npm install / build di VPS | Swap 4 GB; **build FE lokal**, transfer `dist/` |
| AudioWorklet/Web Audio kompleks lintas-browser | Prototipe kapabilitas mic lebih dulu di Fase 3; fallback transkrip teks (NFR Accessibility) |
| Format scoring Gemini tak konsisten | Minta output terstruktur + validasi/normalisasi di backend sebelum simpan |
| Ephemeral token bocor | Token singkat, mint per sesi, validasi kepemilikan; `GEMINI_API_KEY` server-only |
| Koneksi WS bocor | Graceful close di end + cleanup `beforeunload` |

---

## 5. Catatan Lingkup

Ikuti **Out of Scope** PRD §14: tanpa load/penetration testing, tanpa asesmen bahasa tubuh, UI Bahasa Indonesia saja, tanpa native mobile (responsive web), tanpa admin dashboard. Varian sesi **Imersif & Transkrip tidak dibangun** (hanya Klasik). Link nav "Profil" di navbar di-disable/disembunyikan karena tak ada screen-nya di scope.
