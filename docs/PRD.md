# Product Requirements Document (PRD)
## InterviewAI — Job Interview Simulation Web App

> **How to use this document with Claude Code:**
> Save this file as `PRD.md` at the root of your project. Do **not** paste the whole thing into Claude Code at once. Instead, point Claude Code at this file and build **one phase at a time** (see Section 12). At the start of each session say: *"Read PRD.md. We are working on Phase N only. Do not start other phases."* This keeps changes focused and reviewable.

---

## 1. Project Overview

InterviewAI is a web application that lets Indonesian job seekers practice job interviews with an AI interviewer using **real-time voice conversation** (speech-to-speech). The AI asks role-relevant questions, listens to spoken answers, and gives spoken + written feedback. Users can optionally upload a CV to personalize questions.

**Primary goal:** a working, demonstrable system for an undergraduate thesis (skripsi), validated with Black Box Testing, deployed on a self-managed VPS behind a custom domain with HTTPS.

**Target users:** job seekers aged 18–35 in Indonesia. UI language: **Bahasa Indonesia**.

---

## 2. Locked Technology Decisions

These are decided. Do not substitute without explicit instruction.

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Realtime | WebSocket (`ws`) — backend acts as **ephemeral token broker only** |
| Auth | **Self-hosted JWT** (access + refresh tokens), password hashing with **argon2** (fallback bcrypt) |
| Relational DB | **PostgreSQL**, self-hosted on the VPS |
| Document DB | **MongoDB Atlas** (free tier M0) |
| File storage | **Local filesystem on the VPS** (CV uploads), accessed only via backend |
| AI engine | **Gemini Live API**, model `gemini-live-2.5-flash-preview` |
| Reverse proxy + TLS | **nginx** + **Let's Encrypt (certbot)** |
| Process manager | **PM2** (single instance, not cluster — RAM constrained) |
| Deployment target | Single VPS: **2 vCPU / 2 GB RAM**, custom domain available |

---

## 3. Architecture

Three-tier, with **two distinct communication paths**:

1. **REST API path (HTTPS)** — used for auth, session management, history retrieval, CV upload. Frontend → nginx → Node.js/Express → PostgreSQL / MongoDB Atlas / filesystem.

2. **Realtime voice path (WSS)** — used for the live interview. The flow is:
   - Frontend asks backend for an **ephemeral token** (`POST /api/sessions/:id/token`).
   - Backend calls Google to mint a short-lived ephemeral token (the **main Gemini API key never leaves the server**).
   - Frontend uses that ephemeral token to open a **direct WebSocket Secure connection to Gemini Live API** — audio does **not** flow through the VPS.
   - When the session ends, the frontend sends the collected transcript to the backend to persist.

> **Why direct-to-Gemini (token broker pattern):** on a 2 GB VPS, proxying live PCM audio through Node.js would be the single biggest memory/CPU risk. The token-broker pattern keeps audio off the server entirely. This is also Google's recommended approach for client-side Live API use.

---

## 4. Infrastructure & Hard Constraints (2 GB RAM)

The VPS is small. The following are **requirements, not suggestions**:

- **Add swap before anything else:** 4 GB swapfile. Prevents OOM kills during npm installs and traffic spikes.
- **Never run `npm run build` (frontend) on the VPS.** Build the React app locally or in CI, then transfer the static `dist/` output (e.g. `rsync`/`scp`) to `/var/www/interviewai`. nginx serves it directly.
- **PostgreSQL must be memory-tuned for a small box:** e.g. `shared_buffers=256MB`, `effective_cache_size=768MB`, `work_mem=8MB`, `max_connections=40`. Provide a tuned `postgresql.conf` snippet.
- **PM2 runs a single instance** of the backend (no cluster mode).
- **nginx**: enable gzip, serve static frontend, reverse-proxy `/api` to `localhost:<port>`, terminate TLS.
- **Firewall (ufw):** allow only 22 (SSH), 80, 443. Deny everything else inbound.
- Concurrency expectation is low (thesis demo: a handful of concurrent users). Document this; do not over-engineer for scale.

---

## 5. Data Model

### PostgreSQL (relational)

**users**
| field | type | notes |
|---|---|---|
| id | UUID PK | |
| email | VARCHAR(255) UNIQUE NOT NULL | |
| password_hash | VARCHAR(255) NOT NULL | argon2 hash, managed by us |
| name | VARCHAR(100) NOT NULL | |
| created_at | TIMESTAMP NOT NULL | |
| updated_at | TIMESTAMP NOT NULL | |

**job_fields**
| field | type | notes |
|---|---|---|
| id | SERIAL PK | |
| name | VARCHAR(100) NOT NULL | e.g. Teknologi Informasi |
| description | TEXT | nullable |
| is_active | BOOLEAN DEFAULT true | |

**cv_documents**
| field | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id | |
| file_path | VARCHAR(255) | path on VPS filesystem |
| file_type | VARCHAR(10) | pdf / docx |
| extracted_text | TEXT | parsed CV text for prompt injection |
| uploaded_at | TIMESTAMP NOT NULL | |

**interview_sessions**
| field | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id | |
| job_field_id | INTEGER FK → job_fields.id | |
| cv_id | UUID FK → cv_documents.id | **nullable** (CV optional) |
| started_at | TIMESTAMP NOT NULL | |
| ended_at | TIMESTAMP | nullable |
| status | VARCHAR(20) | in_progress / completed / cancelled |
| duration_seconds | INTEGER | nullable |

**evaluations**
| field | type | notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK → interview_sessions.id | one-to-one |
| feedback_text | TEXT NOT NULL | |
| overall_score | INTEGER | 0–100, nullable |
| created_at | TIMESTAMP NOT NULL | |

### MongoDB Atlas (document)

**transcripts**
```json
{
  "_id": "ObjectId",
  "session_id": "UUID string (logical ref to interview_sessions.id)",
  "exchanges": [
    { "question": "string", "answer": "string", "timestamp": "ISODate" }
  ],
  "summary": "string",
  "total_duration": "number (seconds)",
  "created_at": "ISODate"
}
```
> `session_id` is a **logical cross-store reference** enforced at the application layer, not a DB foreign key.

---

## 6. Authentication (Self-Hosted)

- **Registration:** validate email + password strength; hash password with argon2; store user.
- **Login:** verify hash; issue a short-lived **access token (JWT, ~15 min)** and a longer-lived **refresh token (~7 days)**.
- **Refresh token storage:** httpOnly, Secure, SameSite=Strict cookie. Access token returned to client for Authorization headers.
- **Protected routes:** middleware verifies access token; 401 on failure.
- **Security requirements:**
  - Rate-limit `/api/auth/login` and `/api/auth/register` (e.g. express-rate-limit).
  - `helmet` for security headers; HSTS enabled at nginx.
  - CORS locked to the production domain only.
  - JWT secret + all credentials in `.env` (never committed). Provide `.env.example`.
  - Passwords never logged.

---

## 7. Functional Requirements (11 Use Cases)

| ID | Use Case | Description |
|---|---|---|
| UC-01 | Register | Create account with email, password, name |
| UC-02 | Login | Authenticate with credentials |
| UC-03 | Select Job Field | Choose IT / Marketing / Finance / etc. |
| UC-04 | Start Interview Session | Open live voice session with AI interviewer |
| UC-05 | Answer Questions | Speak answers via microphone |
| UC-06 | Receive Feedback | Get automated spoken + written feedback |
| UC-07 | End Session | Stop session; system saves summary |
| UC-08 | View History | List all past sessions |
| UC-09 | View Session Detail | See transcript + feedback for one session |
| UC-10 | Logout | End authenticated session |
| UC-11 | Upload CV (optional) | Upload PDF/DOCX (max 5 MB) to personalize questions |

---

## 8. Gemini Live API Integration

- **Model:** `gemini-live-2.5-flash-preview`
- **Response modalities:** `[AUDIO]` with input + output transcription enabled.
- **Audio formats:** input PCM 16-bit 16 kHz mono; output PCM 16-bit 24 kHz mono.
- **Language:** `id-ID`. **Temperature:** 0.7.
- **VAD:** rely on Gemini's built-in Voice Activity Detection for natural turn-taking; support barge-in.
- **System instruction:** inject `{JOB_FIELD}` and, if present, `{CV_CONTEXT}` (extracted CV text). The AI plays an experienced Indonesian HR interviewer: asks one question at a time, gives short feedback (2–3 sentences) after each answer, wraps up after 5–7 questions with a summary. Formal-but-friendly Bahasa Indonesia.
- **Ephemeral tokens:** backend mints short-lived tokens; main API key stays server-side; frontend connects directly to Gemini over WSS.
- **Frontend audio handling:** capture mic as PCM via Web Audio API / AudioWorklet; play streamed audio responses; render live transcript; show an audio visualizer and mic mute/unmute control.

---

## 9. API Endpoints (REST)

```
Auth
  POST   /api/auth/register      { email, password, name }
  POST   /api/auth/login         { email, password }
  POST   /api/auth/refresh       (refresh cookie)
  POST   /api/auth/logout
  GET    /api/auth/me

Job Fields
  GET    /api/job-fields

Sessions
  POST   /api/sessions                 { job_field_id, cv_id? } -> session_id
  POST   /api/sessions/:id/token       -> ephemeral Gemini token
  POST   /api/sessions/:id/end         { exchanges[], summary, duration } 
  GET    /api/sessions                 -> history list (metadata)
  GET    /api/sessions/:id             -> detail (metadata + transcript)
  DELETE /api/sessions/:id

CV
  POST   /api/cv                       (multipart: file) -> { cv_id, extracted_text }
  GET    /api/cv/:id
```

On `POST /api/sessions/:id/end`, the backend writes the **transcript to MongoDB Atlas** and the **evaluation (score + feedback) to PostgreSQL** in that order.

---

## 10. Non-Functional Requirements

- **Performance:** target small concurrent load (thesis demo). Keep memory footprint low.
- **Security:** HTTPS only; secure cookies; input validation on every endpoint; file-type + size validation on CV upload (PDF/DOCX, ≤ 5 MB); parameterized SQL (no string concatenation); secrets in env.
- **Reliability:** graceful WebSocket close on session end to avoid leaked connections; handle network drop mid-session.
- **Accessibility:** mic permission prompts handled gracefully; provide live text transcript as a non-audio alternative.
- **Maintainability:** clear folder structure; `.env.example`; README with local-dev and deploy steps.

---

## 11. Build & Deployment Plan (VPS)

Target: Ubuntu VPS, 2 vCPU / 2 GB RAM, domain ready.

1. **Server prep:** create non-root sudo user; `ufw` allow 22/80/443; **add 4 GB swap**; install Node.js (LTS), PostgreSQL, nginx, certbot.
2. **PostgreSQL:** create DB + app user; apply low-RAM tuned config; run migrations/seed (seed `job_fields`).
3. **MongoDB Atlas:** create free M0 cluster; whitelist VPS IP; put connection string in `.env`.
4. **Backend:** clone repo; `npm ci --omit=dev`; set `.env`; start with **PM2** (single instance); `pm2 save` + startup hook.
5. **Frontend:** build **locally** (`npm run build`); transfer `dist/` to `/var/www/interviewai`.
6. **nginx:** server block serving static frontend, reverse-proxying `/api` to backend port, gzip on, HTTP→HTTPS redirect.
7. **TLS:** `certbot --nginx` for the domain; auto-renew enabled.
8. **Smoke test:** register → login → start session → mic permission → end → history.

Provide as deliverables: `ecosystem.config.js` (PM2), `nginx.conf` sample, `postgresql.conf` tuning snippet, `.env.example`, and a `DEPLOY.md`.

---

## 12. Build Phases (execute one at a time with Claude Code)

- **Phase 0 — Setup:** repo, monorepo or separate FE/BE folders, linting, `.env.example`, README skeleton.
- **Phase 1 — Auth:** Postgres `users`, register/login/refresh/logout/me, JWT, argon2, rate limiting. Frontend login/register screens.
- **Phase 2 — Core backend & DB:** `job_fields`, `interview_sessions`, `evaluations` tables; Mongo connection; session create/end endpoints; history endpoints.
- **Phase 3 — Gemini Live integration (most complex):** ephemeral token endpoint; frontend Web Audio capture/playback; direct WSS to Gemini; live transcript; visualizer; mic controls. ⭐
- **Phase 4 — CV upload:** multipart upload, PDF/DOCX text extraction, storage on filesystem, inject into system instruction.
- **Phase 5 — History & detail:** list + detail views, merge Postgres metadata with Mongo transcript, empty states.
- **Phase 6 — Black Box Testing:** write and run test cases for all use cases; target ≥ 90% pass.
- **Phase 7 — Deployment:** nginx, PM2, certbot, swap, firewall; smoke test on the domain.

---

## 13. Environment Variables (`.env.example`)

```
NODE_ENV=production
PORT=3000

# Auth
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

# PostgreSQL (self-hosted)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=interviewai
PG_USER=interviewai_app
PG_PASSWORD=

# MongoDB Atlas
MONGODB_URI=

# Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-live-2.5-flash-preview

# App
CORS_ORIGIN=https://yourdomain.com
CV_MAX_SIZE_MB=5
CV_STORAGE_PATH=/var/www/interviewai-uploads
```

---

## 14. Out of Scope (explicitly excluded)

- Load testing / large-scale performance testing.
- Penetration testing / full security audit.
- Psychological or body-language assessment.
- Multi-language UI (Bahasa Indonesia only for now).
- Native mobile apps (responsive web only).
- Admin dashboard (data managed directly in DB for the thesis).

---

## 15. Definition of Done

- All 11 use cases function end-to-end on the deployed domain over HTTPS.
- A full interview can be completed by voice, with transcript + score saved and viewable in history.
- Black Box Testing achieves ≥ 90% valid test cases across all feature categories.
- System runs stably on the 2 GB VPS without OOM during a live session.
