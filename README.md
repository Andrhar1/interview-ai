# InterviewAI

Aplikasi web simulasi wawancara kerja berbasis **suara real-time** dengan pewawancara AI, untuk pencari kerja Indonesia. UI dalam Bahasa Indonesia.

Dokumen acuan: [`docs/PRD.md`](./docs/PRD.md) dan [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md).

## Tech Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4
- **Backend:** Node.js + Express + TypeScript
- **DB:** PostgreSQL (relasional) + MongoDB Atlas (transkrip)
- **AI:** Gemini Live API (`gemini-live-2.5-flash-preview`) via token-broker pattern

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
deploy/     artefak deploy VPS (menyusul di Fase 7)
```

## Status

Dibangun bertahap per fase (lihat `docs/IMPLEMENTATION_PLAN.md`).

- ✅ **Fase 0** — Setup & Fondasi (monorepo, design system, Landing)
- ✅ **Fase 1** — Autentikasi (register/login/refresh/logout/me, JWT + argon2, rate limit; layar Login/Register, Navbar, dashboard placeholder)
- ✅ **Fase 2** — Core backend & DB (migrasi job_fields/interview_sessions/evaluations + seed, koneksi MongoDB + transcripts, endpoint `GET /api/job-fields` & modul sessions dengan ownership + urutan tulis Mongo→Postgres; layar Dashboard konfigurasi sesi)
- ⏳ **Fase 3** — Integrasi Gemini Live (berikutnya)

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

Fase 2 menambah MongoDB (koleksi `transcripts`). Untuk development pakai MongoDB lokal:

```bash
docker run -d --name interviewai-mongo -p 27017:27017 mongo:7
# backend/.env → MONGODB_URI=mongodb://localhost:27017/interviewai
```

MongoDB Atlas menyusul di Fase 7 (deploy). Backend kini mewajibkan `MONGODB_URI`.
