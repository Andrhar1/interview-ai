# Suara AI & Percakapan Native — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat pewawancara AI benar-benar bersuara (menyapa duluan) dan percakapan berjalan hands-free setelah satu klik "Mulai Wawancara".

**Architecture:** Empat perubahan berurutan pada jalur audio yang sudah ada: (1) kunci voice `Kore` + persona pembuka di ephemeral token server-side, (2) perbaiki pemetaan chunk audio di `liveClient` yang membuang audio karena filter `mimeType`, dan kirim satu *kickoff turn* agar model bicara duluan, (3) tambah `resume()` pada playback agar `AudioContext` bisa di-unlock dari user gesture, (4) ubah layar Session menjadi gerbang pra-sesi yang memulai audio + mic + koneksi dari dalam handler klik.

**Tech Stack:** `@google/genai` (Live API, v1alpha), Express 4 + TypeScript (ESM), React 18 + Vite + TypeScript, Web Audio API (AudioWorklet).

**Spec:** `docs/superpowers/specs/2026-07-13-live-audio-native-conversation-design.md`

## Global Constraints

- **Tidak ada unit test framework di proyek ini** (QA = Black Box Testing di Fase 6). Gerbang verifikasi setiap task: `npm run typecheck -w backend`, `npm run typecheck -w frontend`, `npm run lint`, `npm run build -w frontend`, **plus verifikasi runtime nyata** (skrip Node terhadap Gemini/endpoint sungguhan). Jangan membuat framework test baru.
- Semua copy UI dalam **Bahasa Indonesia**. **Tanpa emoji, gradient, atau glow** (PRD §14).
- **`GEMINI_API_KEY` tidak pernah meninggalkan server.** Konfigurasi model/persona/voice dikunci server-side di `liveConnectConstraints`. **Jangan pernah mem-log ephemeral token maupun API key.**
- Backend ESM: import antar-modul lokal memakai spesifier `.js` (mis. `from '../../config/env.js'`).
- Branch kerja: `fase-3-gemini-live`. Satu commit per task.
- Skrip verifikasi sementara ditulis ke scratchpad, **bukan** ke dalam repo.

---

## File Structure

| File | Aksi | Tanggung jawab |
| --- | --- | --- |
| `backend/src/modules/gemini/gemini.service.ts` | Modify | Voice `Kore` di `speechConfig`; aturan persona "sapa lalu tanya duluan" |
| `frontend/src/lib/gemini/liveClient.ts` | Modify | Pemetaan chunk audio yang benar; kickoff turn sekali per sesi |
| `frontend/src/lib/audio/playback.ts` | Modify | `resume()` untuk unlock autoplay dari user gesture |
| `frontend/src/features/session/PreSessionCard.tsx` | Create | Kartu pra-sesi + tombol "Mulai Wawancara" |
| `frontend/src/pages/Session.tsx` | Modify | Gerbang pra-sesi; mulai playback + mic + koneksi dari handler klik |

---

### Task 1: Voice + persona pembuka (backend)

**Files:**
- Modify: `backend/src/modules/gemini/gemini.service.ts:33-46` (system instruction), `:64-77` (liveConnectConstraints)

**Interfaces:**
- Consumes: `env.GEMINI_MODEL`, `AppError` (sudah ada).
- Produces: tidak ada API baru. `createEphemeralToken(systemInstruction)` tetap `Promise<{ token: string; model: string }>`. Token yang dihasilkan kini mengunci voice `Kore` dan persona yang membuka wawancara duluan.

- [ ] **Step 1: Tambahkan voice `Kore` ke `speechConfig`**

Di `createEphemeralToken`, ganti baris `speechConfig` di dalam `liveConnectConstraints.config`:

```ts
            speechConfig: {
              languageCode: 'id-ID',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
```

Voice dikunci server-side bersama model dan system instruction — klien tidak bisa menggantinya.

- [ ] **Step 2: Tambahkan aturan pembuka di system instruction**

Di `buildSystemInstruction()`, pada blok "Aturan wawancara", sisipkan aturan berikut **sebagai butir pertama** (sebelum "Ajukan selalu satu pertanyaan per giliran"):

```
- Buka sesi dengan sapaan singkat (satu kalimat), lalu LANGSUNG ajukan pertanyaan pertama tanpa menunggu kandidat berbicara lebih dulu.
```

Jangan ubah butir-butir lain, dan jangan hapus komentar `// TODO(Fase 4): inject {CV_CONTEXT}`.

- [ ] **Step 3: Verifikasi typecheck + lint**

```bash
npm run typecheck -w backend && npm run lint
```
Expected: keduanya keluar tanpa error.

- [ ] **Step 4: Verifikasi token nyata masih bisa dicetak Google**

Pastikan PostgreSQL jalan dan MongoDB jalan (`docker start interviewai-mongo`), lalu jalankan backend (`npm run dev -w backend`) dan buat sesi + mint token dengan `curl`: register/login untuk mendapat access token, `POST /api/sessions` (pilih salah satu `job_field_id` dari `GET /api/job-fields`) lalu `POST /api/sessions/:id/token`.

Expected: HTTP 200 dan body berbentuk `{"token":"...","model":"gemini-2.5-flash-native-audio-latest"}`. Bila Google menolak `voiceName`/`voiceConfig`, endpoint akan mengembalikan 502 — itu berarti nama voice salah dan harus dilaporkan, bukan di-workaround diam-diam.

**JANGAN cetak isi token ke laporan.** Cukup laporkan status HTTP dan panjang string token.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/gemini/gemini.service.ts
git commit -m "Fase 3: kunci voice Kore + persona pembuka di ephemeral token"
```

---

### Task 2: Pemetaan audio + kickoff turn (liveClient)

Ini task yang benar-benar memperbaiki "AI tidak bersuara". Dua bug diperbaiki bersama karena keduanya baru bisa dibuktikan lewat satu sesi Live yang sama.

**Files:**
- Modify: `frontend/src/lib/gemini/liveClient.ts:83-104` (`handleMessage`), `:143-188` (`openConnection`)
- Verifikasi (scratchpad, tidak di-commit): `<scratchpad>/verify-live-audio.mjs`

**Interfaces:**
- Consumes: `apiRequest` dari `../api`; `POST /sessions/:id/token` → `{ token, model }` (Task 1).
- Produces: `createLiveInterview(sessionId, handlers)` — signature dan tipe **tidak berubah** (`LiveInterview = { sendAudio, close, state }`, `LiveInterviewHandlers` tetap sama). Perubahannya murni perilaku: `onAudioChunk` kini benar-benar terpanggil, dan AI berbicara duluan tanpa input pengguna. Task 4 mengandalkan kedua perilaku ini.

- [ ] **Step 1: Buktikan dulu bug-nya dengan sesi Live sungguhan (probe)**

Sebelum mengubah kode, jalankan probe untuk melihat **bentuk pesan yang sebenarnya** dikirim model. Pastikan backend jalan, lalu mint token seperti Task 1 Step 4 dan simpan ke variabel shell `TOKEN` (jangan cetak).

Tulis `<scratchpad>/verify-live-audio.mjs`:

```js
import { GoogleGenAI } from '@google/genai';

const token = process.env.TOKEN;
const model = process.env.MODEL ?? 'gemini-2.5-flash-native-audio-latest';

const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });

let audioViaData = 0;
let audioViaParts = 0;
let partsWithoutMime = 0;
let transcript = '';
let done = false;

const session = await ai.live.connect({
  model,
  callbacks: {
    onopen: () => console.log('open'),
    onmessage: (msg) => {
      if (msg.data) audioViaData++;
      for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) {
          audioViaParts++;
          if (!part.inlineData.mimeType) partsWithoutMime++;
          else console.log('mimeType:', part.inlineData.mimeType);
        }
      }
      if (msg.serverContent?.outputTranscription?.text) {
        transcript += msg.serverContent.outputTranscription.text;
      }
      if (msg.serverContent?.turnComplete) done = true;
    },
    onerror: (e) => console.error('error', e.message),
    onclose: (e) => console.log('close', e.reason),
  },
  config: {},
});

// Kickoff: tanpa ini, model tidak pernah bicara.
session.sendClientContent({
  turns: [
    {
      role: 'user',
      parts: [
        {
          text: 'Mulai wawancara sekarang. Sapa kandidat dengan singkat, lalu langsung ajukan pertanyaan pertama.',
        },
      ],
    },
  ],
  turnComplete: true,
});

const deadline = Date.now() + 30000;
while (!done && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
session.close();

console.log({ audioViaData, audioViaParts, partsWithoutMime, done });
console.log('transcript:', transcript);
```

Run:
```bash
TOKEN=$TOKEN node <scratchpad>/verify-live-audio.mjs
```

Expected: `done: true`, `transcript` berisi sapaan + pertanyaan pertama dalam Bahasa Indonesia, dan `audioViaData` > 0. Catat di laporan apakah `partsWithoutMime` > 0 (itu bukti langsung Bug A) dan `mimeType` apa yang muncul bila ada. Hasil probe ini **wajib dilampirkan di laporan**.

- [ ] **Step 2: Perbaiki pemetaan chunk audio**

Di `handleMessage`, ganti blok loop `for (const part of sc.modelTurn?.parts ?? [])` (baris 94-99) sehingga audio diambil dari `msg.data` lebih dulu, dan fallback ke `inlineData.data` **tanpa** syarat `mimeType`.

Ubah tanda tangan agar `handleMessage` bisa melihat pesan utuh (ia sudah menerima `msg`), lalu:

```ts
  // Audio keluaran model. SDK mengekspos chunk audio langsung lewat `msg.data`;
  // sebagian model native-audio mengirim inlineData TANPA mimeType, jadi jangan
  // pernah menyaring berdasarkan mimeType — itu membuang seluruh audio diam-diam.
  function emitAudio(msg: LiveServerMessage): void {
    if (msg.data) {
      handlers.onAudioChunk(msg.data);
      return;
    }
    for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) handlers.onAudioChunk(part.inlineData.data);
    }
  }
```

dan di dalam `handleMessage`, panggil `emitAudio(msg)` menggantikan loop lama (tetap sebelum penanganan `sc.interrupted` / `sc.turnComplete`):

```ts
  function handleMessage(msg: LiveServerMessage): void {
    if (msg.sessionResumptionUpdate?.newHandle) {
      resumptionHandle = msg.sessionResumptionUpdate.newHandle;
    }

    emitAudio(msg);

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.inputTranscription?.text) handlers.onInputTranscript(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) handlers.onOutputTranscript(sc.outputTranscription.text);

    // Barge-in first so playback is cleared before the turn is marked done.
    if (sc.interrupted) handlers.onInterrupted();
    if (sc.turnComplete) handlers.onTurnComplete();
  }
```

- [ ] **Step 3: Kirim kickoff turn sekali per sesi**

Tambahkan di scope `createLiveInterview` (dekat deklarasi state lain, sekitar baris 63-75):

```ts
  // Gemini Live tidak bicara sampai menerima input. Satu giliran pemicu ini
  // membuat pewawancara menyapa + mengajukan pertanyaan pertama sendiri.
  // Teks pemicu TIDAK pernah masuk ke transkrip UI/DB: ia dikirim sebagai text
  // turn, sedangkan transkrip pengguna hanya berasal dari inputAudioTranscription.
  let kickoffSent = false;
```

dan konstanta di dekat konstanta modul lain (sekitar baris 41-45):

```ts
const KICKOFF_PROMPT =
  'Mulai wawancara sekarang. Sapa kandidat dengan singkat, lalu langsung ajukan pertanyaan pertama.';
```

Lalu fungsi pengirimnya:

```ts
  // Hanya untuk koneksi PERTAMA. Saat reconnect (session resumption) riwayat
  // sudah dipulihkan, jadi mengirim ulang pemicu akan membuat AI mengulang
  // sapaannya di tengah sesi.
  function sendKickoff(s: Session): void {
    if (kickoffSent || closing) return;
    kickoffSent = true;
    try {
      s.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: KICKOFF_PROMPT }] }],
        turnComplete: true,
      });
    } catch (e) {
      handlers.onError(toError(e));
    }
  }
```

Panggil tepat setelah `session` di-assign di akhir `openConnection` (baris 187):

```ts
    session = next;
    sendKickoff(next);
```

Catatan implementasi: panggil di sini, **bukan** di callback `onopen` — saat `onopen` berjalan, `ai.live.connect()` belum resolve sehingga `session` masih `null`.

- [ ] **Step 4: Verifikasi typecheck + lint + build**

```bash
npm run typecheck -w frontend && npm run lint && npm run build -w frontend
```
Expected: ketiganya bersih.

- [ ] **Step 5: Buktikan perbaikan dengan jalur pemetaan yang baru**

Ubah `<scratchpad>/verify-live-audio.mjs` agar memakai **logika `emitAudio` yang persis sama** dengan implementasi baru (salin fungsinya), dan hitung total chunk yang diteruskan:

```js
let emitted = 0;
function emitAudio(msg) {
  if (msg.data) { emitted++; return; }
  for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
    if (part.inlineData?.data) emitted++;
  }
}
```
Panggil `emitAudio(msg)` di `onmessage`, lalu jalankan ulang.

Expected: `emitted` > 0 (idealnya puluhan chunk) dan `transcript` berisi sapaan + pertanyaan pertama. Ini membuktikan Bug A dan Bug B teratasi **tanpa** perlu browser atau mikrofon. Lampirkan angka `emitted` dan cuplikan transcript di laporan.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/gemini/liveClient.ts
git commit -m "Fase 3: perbaiki pemetaan chunk audio + kirim kickoff turn agar AI bicara duluan"
```

---

### Task 3: `resume()` pada AudioPlayback

**Files:**
- Modify: `frontend/src/lib/audio/playback.ts:15-20` (interface), `:95-107` (return object)

**Interfaces:**
- Consumes: `ensureContext()` internal yang sudah ada.
- Produces: `AudioPlayback` bertambah satu method — `resume(): Promise<void>`. Task 4 memanggilnya dari dalam handler klik. `enqueue`, `clear`, `analyser`, `close` tidak berubah.

- [ ] **Step 1: Tambahkan `resume` ke interface**

```ts
export interface AudioPlayback {
  enqueue(pcmBase64: string): void;
  clear(): void;
  /**
   * Membuat + me-resume AudioContext. HARUS dipanggil dari dalam handler user
   * gesture (klik) agar autoplay policy browser tidak membisukan sesi — enqueue()
   * pertama biasanya datang dari WebSocket, jauh dari gesture apa pun.
   */
  resume(): Promise<void>;
  readonly analyser: AnalyserNode;
  close(): Promise<void>;
}
```

- [ ] **Step 2: Implementasikan `resume`**

Tambahkan di dalam `createAudioPlayback()` (setelah `clear`):

```ts
  async function resume(): Promise<void> {
    const { ctx: audioCtx } = ensureContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
  }
```

dan ekspor di objek yang dikembalikan:

```ts
  return {
    enqueue,
    clear,
    resume,
    get analyser() {
      return ensureContext().analyser;
    },
    close,
  };
```
(Pertahankan komentar yang sudah ada di atas getter `analyser`.)

- [ ] **Step 3: Verifikasi typecheck + lint + build**

```bash
npm run typecheck -w frontend && npm run lint && npm run build -w frontend
```
Expected: bersih.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/audio/playback.ts
git commit -m "Fase 3: tambah AudioPlayback.resume() untuk unlock autoplay dari user gesture"
```

---

### Task 4: Gerbang "Mulai Wawancara" (layar Session)

**Files:**
- Create: `frontend/src/features/session/PreSessionCard.tsx`
- Modify: `frontend/src/pages/Session.tsx:61` (state awal), `:221-254` (efek mount), + render

**Interfaces:**
- Consumes: `createAudioPlayback()` + `resume()` (Task 3); `createLiveInterview()` yang kini mengirim kickoff sendiri (Task 2); `createMicCapture()`, `Button`, `Card` (sudah ada).
- Produces: `PreSessionCard` dengan props `{ fieldTitle: string; context: string; onStart: () => void }`.

- [ ] **Step 1: Buat `PreSessionCard.tsx`**

```tsx
import { Headphones } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

interface PreSessionCardProps {
  fieldTitle: string;
  context: string;
  onStart: () => void;
}

/**
 * Gerbang pra-sesi. Tombolnya bukan sekadar UI: klik ini adalah user gesture
 * yang membuka kunci AudioContext (autoplay policy) sekaligus meminta izin
 * mikrofon — tanpa itu suara pewawancara AI bisa tidak pernah terdengar.
 */
export function PreSessionCard({ fieldTitle, context, onStart }: PreSessionCardProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16">
      <Card className="flex w-full max-w-[440px] flex-col items-center gap-5 p-8 text-center">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">{fieldTitle}</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">{context}</p>
        </div>
        <p className="text-[14px] text-ink-secondary">
          Pewawancara AI akan menyapa dan mengajukan pertanyaan pertama begitu sesi dimulai. Jawab
          langsung dengan suara — tidak perlu menekan tombol apa pun.
        </p>
        <Button variant="accent" className="h-11 w-full text-[15px]" onClick={onStart}>
          Mulai Wawancara
        </Button>
        <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
          <Headphones size={15} strokeWidth={1.8} />
          Gunakan headphone agar suara AI tidak tertangkap mikrofon.
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Tambahkan state `started` dan ubah state koneksi awal**

Di `Session.tsx`, ubah baris 61 dan tambahkan `started`:

```ts
  const [started, setStarted] = useState(false);
  const [connState, setConnState] = useState<ConnState>('idle');
```

- [ ] **Step 3: Pindahkan playback + connect dari mount ke handler klik**

Ganti isi `useEffect` mount (baris 221-254) sehingga **tidak lagi** membuat playback maupun memanggil `connect()` — efek itu kini hanya mengambil meta sesi dan memasang teardown:

```ts
  useEffect(() => {
    if (!id) return;
    tornRef.current = false;
    isMountedRef.current = true;

    (async () => {
      try {
        const detail = await apiRequest<SessionDetailResponse>(`/sessions/${id}`);
        setFieldTitle(detail.session.job_field_name || 'Wawancara');
        setContext(
          detail.session.job_title
            ? detail.session.job_title + (detail.session.company ? ` · ${detail.session.company}` : '')
            : 'Konteks umum',
        );
      } catch {
        /* non-critical — keep the fallback title/context */
      }
    })();

    function onBeforeUnload() {
      void teardown();
    }
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', onBeforeUnload);
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
```

Lalu tambahkan handler start (letakkan dekat `toggleMic`):

```ts
  // Semua yang butuh user gesture dijalankan DI DALAM handler klik ini:
  // resume() membuka kunci autoplay, startMic() memicu prompt izin mikrofon.
  // Jangan menyisipkan `await` sebelum keduanya — itu memutus rantai gesture.
  function handleStart() {
    if (started) return;
    const playback = createAudioPlayback();
    playbackRef.current = playback;
    void playback.resume();
    setStarted(true);
    startMic();
    void connect();
  }
```

Catatan: `startMic()` dipanggil sebelum koneksi terbuka. Chunk mikrofon yang dihasilkan sebelum state `connected` sengaja dibuang — `liveRef.current` masih `null` dan `sendAudio` sendiri sudah menjaga `state !== 'connected'`. Ini hanya beberapa ratus milidetik.

- [ ] **Step 4: Render gerbang pra-sesi**

Ubah kondisi overlay (baris 353-355) agar overlay "Menghubungkan…" hanya muncul setelah sesi dimulai:

```ts
  const showFullConnectingOverlay = started && !hasConnectedOnce && connState !== 'connected';
```

dan di dalam JSX, sisipkan cabang pra-sesi **sebelum** cabang `showFullConnectingOverlay` (setelah `<SessionTopBar .../>`):

```tsx
      {!started ? (
        <PreSessionCard fieldTitle={fieldTitle} context={context} onStart={handleStart} />
      ) : showFullConnectingOverlay ? (
        // …blok overlay "Menghubungkan ke pewawancara AI…" yang sudah ada, tidak berubah…
      ) : (
        // …blok dua kolom yang sudah ada, tidak berubah…
      )}
```

Impor `PreSessionCard` dari `../features/session/PreSessionCard`.

- [ ] **Step 5: Pastikan tombol "Akhiri Sesi" tetap aman sebelum sesi dimulai**

`SessionTopBar` tetap tampil di layar pra-sesi. Menekan "Akhiri Sesi" di sana membuka modal konfirmasi; `confirmEnd()` akan memanggil `teardown()` (aman walau `liveRef`/`playbackRef` masih `null`) lalu melihat `exchanges.length === 0` dan menavigasi ke `/dashboard`. Verifikasi jalur ini secara manual — tidak perlu perubahan kode kecuali ada error.

- [ ] **Step 6: Verifikasi typecheck + lint + build**

```bash
npm run typecheck -w frontend && npm run lint && npm run build -w frontend
```
Expected: ketiganya bersih.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Session.tsx frontend/src/features/session/PreSessionCard.tsx
git commit -m "Fase 3: gerbang Mulai Wawancara — unlock audio + mic + koneksi dari user gesture"
```

---

## Uji manual (setelah semua task selesai)

Jalankan `docker start interviewai-mongo`, pastikan PostgreSQL hidup, lalu `npm run dev`. Buka http://localhost:5180.

1. Login → Dashboard → pilih bidang → "Mulai Sesi Wawancara".
2. Layar sesi menampilkan kartu pra-sesi. Klik **"Mulai Wawancara"** → izinkan mikrofon.
3. Pill koneksi: Menghubungkan… → Terhubung. **AI menyapa dengan suara** (voice perempuan `Kore`) lalu mengajukan pertanyaan pertama; bubble transkrip AI muncul; visualizer bergerak.
4. Jawab dengan bicara — **tanpa menekan tombol apa pun** — bubble kandidat muncul dan AI menanggapi.
5. Coba potong AI saat ia sedang bicara (barge-in): suara AI berhenti.
6. "Akhiri Sesi" → "Menganalisis…" → halaman Result dengan skor.
7. DevTools → Network → WS: setelah keluar halaman, WebSocket tertutup dan indikator mikrofon OS mati.
