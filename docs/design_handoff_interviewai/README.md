# Handoff: InterviewAI — AI Job-Interview Simulation

## Overview
InterviewAI is a web app for Indonesian job seekers to practice job interviews with an AI interviewer over **real-time voice**, then receive detailed feedback. This package documents a complete, interactive prototype covering 6 screens plus sub-views and edge states. All UI copy is in **Bahasa Indonesia**.

The app flow:
**Landing → Login/Register → Dashboard (pick field + paste job description + upload CV) → Interview Session (live voice + transcript) → Result & Feedback → History (list + detail).**

---

## About the Design Files
The file in this bundle (`InterviewAI.dc.html`) is a **design reference created in HTML** — a prototype showing intended look and behavior. **It is not production code to copy directly.**

> ⚠️ Note: `InterviewAI.dc.html` uses a proprietary in-house "Design Component" runtime (`support.js`, custom `<x-dc>` / `<sc-if>` / `<sc-for>` tags and a `class Component extends DCLogic`). **Do not try to reuse that runtime.** Treat the file as a visual + behavioral spec only. Open it in a browser to see the live design; read the markup/logic to extract exact values. This README is written to be self-sufficient so you can implement without parsing that runtime.

Your task is to **recreate these designs in the target codebase's environment** (React, Vue, Next.js, etc.) using its established patterns, component library, and conventions. If no codebase exists yet, **React + Vite + TypeScript** is a good default, with a real-time voice layer (see "Voice / Real-time" below).

---

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, states, and interactions are all specified below and should be reproduced precisely. The only things that are *simulated* in the prototype (and must be built for real) are: the voice connection, speech-to-text transcript, AI question generation, and scoring — see "What's simulated" at the end.

---

## Design Tokens

### Colors
| Token | Hex | Usage |
|---|---|---|
| Navy (primary brand / structure) | `#061f3d` | App header, primary dark buttons, AI visualizer bars, score card, immersive session bg |
| Blue (action / accent) | `#2563eb` | Primary CTAs, selected states, links, logo mark, user transcript bubbles |
| Blue hover/darker | `#1e3a5f` | User mic visualizer bars |
| Light blue (accent bar variant) | `#5b9bf5` | AI bars on dark (immersive) background |
| Page background | `#f7f8f9` | App canvas |
| Surface / card | `#ffffff` | Cards, inputs, panels |
| Border (default) | `#ececef` | Card borders |
| Border (input) | `#d8dade` | Inputs, dashed dropzone |
| Border (subtle divider) | `#f0f1f3` | Row dividers inside cards |
| Text primary | `#0f172a` | Headings, body |
| Text secondary | `#5b6471` | Sub-copy, descriptions |
| Text muted | `#8a929e` / `#9aa1ad` / `#aab0ba` | Meta, captions, placeholders |
| Success | `#16a34a` (text `#15803d` / `#296a40`), bg `#f0fdf4`, border `#bbf7d0` | "Strengths", confirmations, good scores |
| Warning | `#d97706` (text `#b45309` / `#7c5212`), bg `#fffbeb`, border `#fde68a` | "Improvements", mid scores |
| Danger | `#dc2626` (text `#b91c1c`), bg `#fef2f2`, border `#fecaca` | End-session, active mic, errors, low scores |
| Chip/segment track | `#f1f3f5` / `#eceef1` | Tab + segmented-control backgrounds |
| Icon tile bg | `#f1f5f9` | Square icon backgrounds |
| Selected field bg | `#eff6ff`, selected border `#2563eb` | Selected job-field card, focused dropzone |
| Navy header inactive nav | `#94a3b8` | Inactive top-nav links |

**Score color logic:** `score ≥ 8` → green `#16a34a`; `6.5 ≤ score < 8` → amber `#d97706`; `score < 6.5` → red `#dc2626`. Score badges use the matching tinted bg + border (green: `#f0fdf4`/`#bbf7d0`, amber: `#fffbeb`/`#fde68a`, red: `#fef2f2`/`#fecaca`).

### Typography
- **Font family:** `Inter` (Google Fonts), weights **400 / 500 / 600** only. Fallback: `-apple-system, system-ui, sans-serif`. Antialiased.
- **Scale (px / weight / line-height / letter-spacing):**
  - Hero H1: `52` / 600 / 1.08 / `-0.03em` (use `text-wrap: balance`)
  - Page H1: `26` / 600 / `-0.02em`
  - Auth title: `22` / 600
  - Detail H1: `24` / 600
  - Section H2: `14` / 600 (used as labelled step headers e.g. "1. Pilih bidang pekerjaan")
  - Card H3: `16` / 600
  - Question text (classic): `18` / 500 / 1.5; (immersive): `24` / 500 / 1.45 — both `text-wrap: pretty`
  - Body: `14`–`15` / 400 / 1.6
  - Small/meta: `12`–`13.5` / 400–500
  - Score number (result card): `56` / 600
  - Uppercase eyebrow labels: `11`–`12` / 600, `text-transform:uppercase`, letter-spacing `.04em`–`.06em`
  - Timer: tabular numerals (`font-variant-numeric: tabular-nums`)

### Spacing & Radii
- Spacing rhythm: multiples of 4 (common: 6, 8, 10, 14, 18, 20, 24, 28, 32, 40).
- Content max-widths: landing `1100px` (hero text `760px`, features `1000px`), dashboard `1000px`, result `860px`, history `920px`, history-detail `860px`, session `1200px`, auth card `420px`, transcript-led session `840px`.
- Page padding: `40px 24px 80px` (desktop content screens); auth `48px 20px`.
- **Border radius:** buttons/inputs `8px`; cards/panels `12px`; icon tiles `9–10px`; pills/badges `999px`; segmented control track `8px` / thumb `6px`; logo mark `7–8px`. Transcript bubbles use asymmetric radii (see Components).
- **Borders over shadows:** the system favors 1px borders. Shadows are minimal: cards optionally `0 1px 3px rgba(16,24,40,.04)`; modals `0 20px 50px rgba(6,31,61,.25)`; drawer `-8px 0 30px rgba(6,31,61,.2)`; mic button `0 2px 8px rgba(6,31,61,.18)`. **No gradients, no glow, no emoji.**

### Icons
All icons are inline **stroke SVGs**, `stroke-width` ~1.7–2.2, `stroke-linecap/linejoin: round`, 24×24 viewBox. In a real codebase use **Lucide** (or equivalent) — the set maps cleanly: mic, bar-chart, file-text, arrow-right, chevron-left/right, check, upload, alert-triangle, message-square, x, code (IT), megaphone (marketing), bar-chart (finance), users (HR), graduation-cap (education), more-horizontal (other).

---

## Screens / Views

### 1. Landing
- **Purpose:** Marketing entry; convert to sign-up.
- **Layout:** Sticky translucent header (64px, `rgba(247,248,249,.85)` + `backdrop-filter: blur(8px)`, bottom border `#ececef`) with logo left ("InterviewAI", navy logo mark) and outline "Masuk" button right. Centered hero (max 760px, padding `100px 24px 64px`). Below: 3-up feature grid (`repeat(auto-fit, minmax(240px,1fr))`, gap 20). Navy footer.
- **Components:**
  - Eyebrow pill: `border #dbe3f1`, bg `#eff6ff`, text `#2563eb`, 13px/500, dot + label "Latihan wawancara berbasis suara".
  - H1 (two lines): "Latih wawancara kerja Anda / dengan pewawancara AI".
  - Sub-copy (max 540px, `#5b6471`, 18px): "Berlatih menjawab pertanyaan secara langsung melalui percakapan suara, lalu dapatkan umpan balik terperinci untuk meningkatkan peluang Anda diterima."
  - Primary CTA: blue `#2563eb`, white text, 16px/500, padding `14px 28px`, radius 8, label "Mulai Sekarang" + arrow icon. → goes to Auth.
  - Feature cards (white, border `#ececef`, radius 12, padding 26): icon tile (40×40, bg `#f1f5f9`, navy icon) + H3 + body. The three: **"Percakapan suara nyata"**, **"Umpan balik terukur"**, **"Sesuai deskripsi kerja"** (copy in file).
  - Footer (navy `#061f3d`, text `#8aa0bd`, 13px): "© 2026 InterviewAI" / "Dibuat untuk pencari kerja Indonesia".

### 2. Login / Register
- **Purpose:** Authenticate; toggle between Masuk (login) and Daftar (register).
- **Layout:** Vertically centered column. Logo (clickable → Landing). Card max 420px (white, border, radius 12, padding 32, subtle shadow). Below card: switch-prompt line.
- **Components:**
  - Title + subtitle change by mode. Login: "Selamat datang kembali" / "Masuk untuk melanjutkan latihan Anda." Register: "Buat akun" / "Mulai berlatih wawancara hari ini."
  - **Segmented toggle** (track `#f1f3f5`, radius 8, padding 4): "Masuk" | "Daftar". Active thumb = white, text `#0f172a`, `0 1px 2px rgba(16,24,40,.06)`; inactive text `#6b7280`.
  - Fields: "Nama lengkap" (register only), "Email", "Kata sandi" (type=password). Inputs: full width, border `#d8dade` (error → `#fca5a5`), radius 8, padding `11px 14px`, 14px.
  - **Validation** (on submit): email must match `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` else "Masukkan email yang valid."; password length ≥ 6 else "Kata sandi minimal 6 karakter." Errors render 12.5px red below the field.
  - Submit button: blue, full width, padding 12, radius 8. Shows a spinner + "Memproses…" while loading (~850ms simulated), then → Dashboard. Label "Masuk" / "Daftar" by mode.
  - Switch prompt: "Belum punya akun? **Daftar**" / "Sudah punya akun? **Masuk**" (blue link toggles mode).

### 3. Dashboard
- **Purpose:** Configure and launch a practice session; see recent sessions.
- **Layout:** App navbar on top (see "Global navbar"). Content max 1000px. Greeting H1 "Selamat datang, {firstName}". Then three labelled steps + recent list.
- **Components:**
  - **Step 1 — "1. Pilih bidang pekerjaan":** grid of 6 selectable cards (`repeat(auto-fill, minmax(280px,1fr))`, gap 14). Each card: icon tile + title + desc, and a check icon when selected. **Selected** state: bg `#eff6ff`, border `#2563eb` + `0 0 0 1px #2563eb` ring, icon tile bg `#dbeafe` / icon `#2563eb`. Fields: **Teknologi Informasi** ("Software, data, infrastruktur"), **Pemasaran** ("Brand, digital, pertumbuhan"), **Keuangan** ("Akuntansi, analis, audit"), **SDM** ("Rekrutmen, people ops"), **Pendidikan** ("Pengajar, kurikulum"), **Lainnya** ("Bidang lain di luar daftar").
  - **Step 2 — "2. Konteks lowongan" + "Opsional" pill:** white card. Two inputs side-by-side (auto-fit minmax 200px): "Posisi yang dilamar" (placeholder "mis. Backend Engineer"), "Perusahaan" (placeholder "mis. PT Maju Teknologi"). Then "Deskripsi pekerjaan" **textarea** (min-height 120px, resizable vertical, placeholder "Tempel tanggung jawab dan kualifikasi dari iklan lowongan di sini…"). Below textarea: live char count "{n} karakter" left; when `jobDesc.trim().length > 40` show green confirmation right: check + "Konteks akan dipakai AI".
  - **CV upload** (within step 2 card): label "Unggah CV (opsional)". **Dropzone**: dashed border `#d8dade` (→ `#2563eb` + bg `#eff6ff` on drag-over), bg `#fafbfc`, radius 10, padding 24, centered. Empty: upload icon + "**Klik untuk unggah** atau seret berkas ke sini" + "PDF atau DOCX, maks 5MB". Filled: file-text icon (green) + filename + "hapus" link (stops propagation, clears). Clicking the zone opens a hidden `<input type=file>`; drag-drop also accepted.
  - **Start button:** full width, margin-top 24, padding 15, radius 8, 16px/500. Enabled (a field is selected): navy `#061f3d` / white, label "Mulai Sesi Wawancara". Disabled (no field): bg `#e5e7eb`, text `#9aa1ad`, `not-allowed`, label "Pilih bidang untuk mulai" + helper line below "Pilih bidang pekerjaan terlebih dahulu untuk memulai."
  - **"Sesi terakhir"** list: white card, rows divided by `#f0f1f3`. Each row: icon tile (38×38) + field name + "{date} · {duration}" + score badge (color-coded) + chevron. Clicking a row opens History Detail. Sample data: Teknologi Informasi · 14 Jun 2026 · 12 menit · 8.2 ; Pemasaran · 10 Jun 2026 · 9 menit · 7.1 ; Keuangan · 2 Jun 2026 · 15 menit · 6.4.

### 4. Interview Session  ⭐ (most important screen — 3 layout variants)
- **Purpose:** Conduct the live voice interview. The prototype offers a **layout switcher** with 3 variants; **pick the one that best fits your product** (or ship the switcher). All share the same top bar, status logic, animated visualizer, mic behavior, transcript data, connection states, and end-confirm modal.
- **Global session top bar** (sticky, height 58, navy `#061f3d` bg / white text; immersive variant uses translucent white-on-navy):
  - Left: back chevron (opens end-confirm) + field title + context subtitle ("{jobTitle} · {company}" or "Konteks umum").
  - Center: **connection pill** (`rgba(255,255,255,.08)`, radius 999): dot + text. States: connecting → amber `#d97706` "Menghubungkan…"; connected → green `#16a34a` "Terhubung"; lost → red `#dc2626` "Koneksi terputus".
  - Right: elapsed timer (mm:ss, tabular) + red "Akhiri Sesi" button.
- **Layout switcher** (top-right, segmented control): "Klasik" | "Imersif" | "Transkrip".
- **Connecting overlay** (~1.3s before connected): centered spinner + "Menghubungkan ke pewawancara AI…" / "Menyiapkan koneksi suara".
- **Status badge** (per speaker state): "AI sedang berbicara" (dot `#2563eb`) / "Mendengarkan jawaban Anda" (dot `#dc2626`) / "Menunggu jawaban Anda" (dot `#9aa1ad`).
- **Audio visualizer** (the brief's centerpiece): a row of vertical bars. **Bars animate only while the AI is actively speaking** (and the user-mic visualizer animates only while recording). Implementation: each bar has a randomized target height (22–100%), animation duration (0.6–1.25s), and delay (0–0.9s); animate `transform: scaleY()` between ~0.16 (idle/rest) and 1 via a `barPulse` keyframe; `transform-origin: bottom`; transition `transform .35s` when toggling active. Bar color: navy `#061f3d` (classic/transcript), light-blue `#5b9bf5` (immersive on navy). Rounded bar caps (radius 4).
  - *In a real build, drive bar heights from actual audio amplitude (Web Audio `AnalyserNode.getByteFrequencyData`) instead of random keyframes.*
- **Question card:** eyebrow "Pertanyaan {n} dari {total}" + the question text. Sample questions (5, Bahasa Indonesia) are in the file (`questions` getter) — e.g. Q1 "Terima kasih sudah hadir. Bisa ceritakan sedikit tentang diri Anda dan latar belakang Anda?"
- **Mic control:** circular button. Idle = navy `#061f3d` + mic icon; **active/recording** = red `#dc2626` + stop (square) icon, with an expanding ring pulse (`micRing` keyframe, scale 1→1.9, fade out, 1.4s). Disabled (not connected) = `#94a3b8`, `not-allowed`, opacity .6. Sizes: classic 72px, immersive 84px, transcript-led 52px. Hint text below: "Ketuk untuk menjawab" / "Ketuk untuk berhenti & kirim" / "Menunggu koneksi…".
  - **Mic interaction cycle:** tap to start (status → "Mendengarkan…", user visualizer animates) → tap to stop (appends the user's answer bubble) → AI "typing" indicator (~300ms in) → AI feedback bubble (~1.9s) → next question after ~1.5s. Repeats through the question list.
- **Live transcript** (3 message roles, distinct bubbles):
  - **AI** ("Pewawancara AI" label, 11px/600 `#9aa1ad`): bg `#f1f3f5`, text `#1f2937`, radius `4px 14px 14px 14px`, left-aligned.
  - **User** (no label): bg `#2563eb`, white, radius `14px 14px 4px 14px`, right-aligned, max-width 86% (74% wide variants).
  - **Feedback** ("Umpan balik" label, green `#16a34a`): bg `#f0fdf4`, border `#bbf7d0`, text `#296a40`, radius `4px 14px 14px 14px`, left-aligned.
  - Bubbles fade-up in (`fadeUp`, 8px/opacity, .25s). A 3-dot **typing indicator** (blink keyframe, staggered .2s) shows while the AI "thinks". Empty state: "Percakapan akan muncul di sini saat sesi dimulai." Transcript auto-scrolls to bottom on update.
- **Variant A — "Klasik" (two-column):** left column (flex 1.5) stacks status badge → visualizer card (height 150) → question card → mic card (with mic + user waveform). Right column (flex 1, min 300, max-height 640) is a persistent transcript panel ("Transkrip langsung" header with message icon).
- **Variant B — "Imersif":** full navy `#061f3d` stage, everything centered: status badge → big light-blue visualizer (height 120) → large question text (24px white) → "Pertanyaan n dari total" → large 96px mic + hint → a button to open a **right-side transcript drawer** (slides in, `translateX`, 380px, white). Drawer toggle label "Lihat transkrip" / "Sembunyikan transkrip".
- **Variant C — "Transkrip":** chat-led, max 840px. Top strip: status badge + current question inline. Transcript fills the middle (auto-scroll). **Bottom control bar** (sticky): a compact mini-visualizer (height 34) + small 52px mic + hint on the right.
- **Connection-drop demo:** ~11s into a connected session the prototype scripts a `lost` state for ~2.6s then auto-recovers — to show the reconnect UI. Classic shows a blur overlay with spinner + "Koneksi terputus / Mencoba menghubungkan kembali…" + "Coba sekarang" button; immersive shows a top toast; transcript-led shows an inline banner.
- **End-session confirm modal:** overlay `rgba(6,31,61,.45)`, centered white card (max 380, radius 12, padding 28, pop-in .15s). Title "Akhiri sesi wawancara?" + body "Sesi akan dianalisis dan Anda akan melihat hasil serta umpan balik." Buttons: "Lanjutkan" (outline, cancels) | "Akhiri Sesi" (red, confirms → Result).

### 5. Result & Feedback
- **Purpose:** Show the analyzed outcome after a session.
- **Loading:** ~1.4s spinner + "Menganalisis jawaban Anda…".
- **Layout:** Max 860px. Meta line "Sesi selesai · {field} · {duration}". H1 "Hasil & Umpan Balik".
- **Components:**
  - **Score card** (navy `#061f3d`, white, width 200, radius 12): eyebrow "Skor keseluruhan" + big number (56px) "8.0" + "dari 10" + a label pill ("Sangat baik" ≥8 / "Cukup baik" ≥6.5 / "Perlu latihan" else).
  - **Summary card** (flex 1): H3 "Ringkasan" + paragraph (in file).
  - **"Rincian penilaian"** — metric list (white card), each row: label + note + score (color-coded) + a progress bar (height 6, track `#eef0f2`, fill = score×10% in the score color). Metrics: **Komunikasi 8.5**, **Relevansi Jawaban 8.0**, **Struktur (STAR) 7.0**, **Kepercayaan Diri 8.2** (notes in file).
  - **Two panels** (auto-fit minmax 280): green "Yang sudah baik" (check icon, bullet list of strengths) + white/amber-accented "Bisa ditingkatkan" (alert icon, bullets). Content lists in file.
  - **Actions:** "Kembali ke Dashboard" (navy, primary) + "Lihat Riwayat" (outline).

### 6. History (list + detail + empty state)
- **History list:** Max 920px. Header "Riwayat Sesi" / "Tinjau sesi latihan Anda sebelumnya." + a **Berisi | Kosong** segmented toggle (demo control to preview empty state).
  - **Filled:** vertical list of cards (border, radius 12, padding `18px 20px`): icon tile + field + "{date} · {duration}" + score badge + "Lihat Detail" outline button → Detail. Sample: 4 items (IT 8.2, Pemasaran 7.1, Keuangan 6.4, SDM 7.8).
  - **Empty state:** centered card (padding `64px 24px`): icon tile + "Belum ada sesi" + body "Anda belum menyelesaikan sesi wawancara. Mulai latihan pertama Anda untuk melihat riwayat di sini." + blue "Mulai sesi pertama" button → Dashboard.
- **History Detail:** Max 860px. Back link "Kembali ke Riwayat". Header: field title + meta + big score badge "{score} / 10". Two columns: **left** = "Rincian penilaian" (same metric-bar component) + green "Umpan balik AI" card; **right** = "Transkrip" panel (scrollable, same bubble components, max-height 520). Bottom: "Kembali ke Dashboard" (navy).

---

## Global navbar (app, post-login)
Shown on Dashboard, History, Result, History Detail. Navy `#061f3d`, height 60, max 1200px. Left: logo mark (blue) + "InterviewAI" (→ Dashboard). Right: nav links "Dashboard" / "Riwayat" / "Profil" (active = white, inactive = `#94a3b8`) + a 34px circular blue avatar with the user's initial. (Landing and Auth have their own simpler headers.)

---

## Interactions & Behavior (summary)
- **Navigation:** Landing→Auth→Dashboard→Session→Result; Dashboard/Result→History→Detail; back links throughout. On every screen change, scroll to top.
- **Animations / keyframes:** `barPulse` (visualizer scaleY), `spin` (loaders), `blink` (typing dots, staggered .2s), `micRing` (mic pulse 1.4s), `fadeUp` (transcript bubbles .25s), `pop` (modal .15s). Drawer slides via `transform: translateX` (.25s ease). Segmented/selected transitions ~.15s.
- **Loading states:** auth submit (~850ms), session connecting (~1.3s), result analysis (~1.4s).
- **Error/edge states:** form validation errors; connection-lost + reconnect; disabled mic until connected; disabled start until a field is selected; empty transcript; empty history.
- **Responsive:** fluid — all grids use `auto-fit`/`auto-fill` minmax and flex-wrap; reflows cleanly from 1200px down to phone width (~360px). The prototype is one responsive layout, not separate mobile/desktop comps. The brief is mobile-first (375px) scaling up — verify mobile breakpoints when implementing (single-column stacks, full-width session, drawer/bottom-bar patterns already mobile-friendly).

## State Management
Per-user / per-session state needed:
- **Auth:** `authMode` (login|register), `form{name,email,password}`, field errors, `authLoading`, `userName`.
- **Dashboard config:** `selectedField`, `jobTitle`, `company`, `jobDesc`, `cvName` (+ file), `dragOver`.
- **Session:** `connection` (idle|connecting|connected|lost), `speaker` (idle|ai|user), `micActive`, `typing`, `qIndex`, `elapsed` (1s tick), `transcript[]` (role: ai|user|feedback), `variant` (1|2|3), `showDrawer`, `showEndConfirm`.
- **Result/History:** `resultLoading`, computed metrics/score, `historyMode` (filled|empty demo), `detail` (selected history item).
- Server data to fetch in production: user profile, history list + detail, and the live session stream (see below).

## Voice / Real-time (what to build for real)
The prototype **simulates** the conversation. In production you need:
1. **Mic capture + streaming STT** (e.g. WebRTC / WebSocket audio to a speech-to-text service) → drives the user transcript + user visualizer amplitude.
2. **LLM interviewer** that generates questions and follow-ups **conditioned on the pasted job description, position, company, and uploaded CV** (this context-injection is a core requested feature). Returns the next question + per-answer feedback.
3. **TTS** for the AI voice → drives the AI visualizer amplitude + "AI sedang berbicara" state.
4. **Connection management** with reconnect (the lost/recover UI is already designed).
5. **Scoring** at session end: per-metric scores (Komunikasi, Relevansi, Struktur/STAR, Kepercayaan Diri), overall, summary, strengths, improvements.
6. **CV parsing** (PDF/DOCX, ≤5MB) to extract context.

## What's simulated in the prototype
Voice/STT/TTS, AI question + feedback generation, scoring, the timed connection-drop demo, the History "Kosong" toggle, and all sample data (questions, answers, feedback, history items) are hard-coded for demonstration. Replace with real services/data.

## Design Tokens recap
See "Design Tokens" above — colors, type scale (Inter 400/500/600), spacing (4px rhythm), radii (8/12/999), minimal shadows, no gradients/glow/emoji.

## Assets
- **Font:** Inter via Google Fonts.
- **Icons:** inline stroke SVGs — replace with **Lucide** (mapping listed under "Icons").
- No raster images or logos are used; the logo is an inline mic-glyph SVG in a rounded square. No external image assets to migrate.

## Files
- `InterviewAI.dc.html` — the full interactive prototype (all 6 screens + sub-views + states). Open in a browser to view; read source for exact copy, sample data, and style values. **Do not reuse its `<x-dc>`/`DCLogic` runtime** — it's an internal authoring format; rebuild in your stack.
- `support.js` — runtime for the prototype only; **not** part of the deliverable.
