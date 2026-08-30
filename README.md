# InterviewAI

Aplikasi web untuk simulasi wawancara kerja berbasis **suara real-time** dengan pewawancara AI berbahasa Indonesia. Pengguna dapat memilih bidang pekerjaan, memasukkan konteks lowongan, serta mengunggah CV PDF/DOCX agar pertanyaan lebih personal. Sistem menampilkan transkrip percakapan, menghasilkan evaluasi terstruktur, dan menyimpan hasil wawancara pada riwayat sesi.

## Informasi Pengumpulan Skripsi

- **Nama:** Andri Hari Musyaffa
- **NIM:** 2802607722

Dokumen acuan: [`docs/PRD.md`](./docs/PRD.md) dan [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md).

## Tech Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4
- **Backend:** Node.js + Express + TypeScript
- **DB:** PostgreSQL (relasional) + MongoDB Atlas (transkrip)
- **AI:** Gemini Live API (`gemini-3.1-flash-live-preview`) dan Gemini analysis (`gemini-2.5-flash`) via token-broker pattern

Monorepo dengan npm workspaces: [`frontend/`](./frontend) dan [`backend/`](./backend).

## Prasyarat

- Node.js LTS (dikembangkan dengan Node 22+/25)
- npm 10+

## Memulai (Development)

```bash
# 1. Install semua dependency (root + workspaces)
npm install

# 2. Siapkan env backend
cp .env.example backend/.env   # lalu isi nilai sesuai kebutuhan fase

# 3. Jalankan backend + frontend bersamaan
npm run dev
```

- Frontend: http://localhost:5180
- Backend: http://localhost:4000 (health check: `GET /api/health`)

Vite mem-proxy `/api/*` ke backend, sehingga frontend memanggil API same-origin saat dev.

## Skrip

| Perintah          | Keterangan                                  |
| ----------------- | ------------------------------------------- |
| `npm run dev`     | Jalankan backend + frontend (concurrently)  |
| `npm run build`   | Build kedua workspace                       |
| `npm run lint`    | ESLint seluruh repo                         |
| `npm run format`  | Prettier --write                            |

## Struktur

```
frontend/   React + Vite + TS (UI, audio, koneksi Gemini)
backend/    Express + TS (REST API, token broker, DB)
docs/       PRD, implementation plan, design handoff
deploy/     artefak konfigurasi deployment production (Docker Compose + nginx)
```

## Status

Dibangun bertahap per fase (lihat `docs/IMPLEMENTATION_PLAN.md`). Fitur utama aplikasi dan pengujian black box sudah diimplementasikan.

- ✅ **Fase 0** — Setup & Fondasi (monorepo, design system, Landing)
- ✅ **Fase 1** — Autentikasi (register/login/refresh/logout/me, JWT + argon2, rate limit; layar Login/Register dan protected routes)
- ✅ **Fase 2** — Core backend & DB (PostgreSQL, MongoDB transcripts, job fields, sessions, evaluations, ownership, dan Dashboard konfigurasi sesi)
- ✅ **Fase 3** — Integrasi Gemini Live (token broker, percakapan suara dua arah, AudioWorklet, transkrip real-time, visualizer, reconnect, dan evaluasi otomatis)
- ✅ **Fase 4** — Upload CV (validasi PDF/DOCX dan ukuran, ekstraksi teks, penyimpanan aman, serta injeksi konteks CV ke instruksi AI)
- ✅ **Fase 5** — Result & History (hasil evaluasi, metrik penilaian, umpan balik AI, daftar riwayat, dan detail transkrip sesi)
- ✅ **Fase 6** — Black Box Testing (skenario Playwright untuk alur autentikasi, konfigurasi sesi, wawancara live, upload CV, dan riwayat)
- ✅ **Fase 7** — Deployment Production (aplikasi sudah live di VPS dan dapat diakses melalui [andrihari.my.id](https://andrihari.my.id); artefak Docker Compose, konfigurasi nginx, dan bootstrap environment tersedia)

### Database (development)

Fase 1 memakai PostgreSQL lokal. Buat sekali:

```sql
CREATE ROLE interviewai_app LOGIN PASSWORD '<password>';
CREATE DATABASE interviewai OWNER interviewai_app;
```

Lalu jalankan migrasi:

```bash
npm run migrate -w backend
```

Fase 2 menambah MongoDB (koleksi `transcripts`). Untuk development gunakan MongoDB lokal:

```bash
docker run -d --name interviewai-mongo -p 27017:27017 mongo:7
# backend/.env → MONGODB_URI=mongodb://localhost:27017/interviewai
```

Untuk deployment, gunakan MongoDB Atlas atau instance MongoDB yang dapat diakses server. Backend mewajibkan `MONGODB_URI`.
