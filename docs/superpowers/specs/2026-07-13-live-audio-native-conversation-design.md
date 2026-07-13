# Desain — Suara AI & Percakapan Native (perbaikan Fase 3)

Tanggal: 2026-07-13
Branch: `fase-3-gemini-live`
Status: disetujui untuk implementasi

## Masalah

Dua keluhan dari uji manual sesi wawancara live:

1. **AI tidak mengeluarkan suara sama sekali.**
2. **Percakapan tidak terasa native** — pengguna merasa harus menekan tombol mute/unmute.

## Akar masalah

### Bug A — chunk audio dibuang diam-diam — **TIDAK TERBUKTI**

> **Revisi 2026-07-13 (setelah probe sesi Live sungguhan).** Hipotesis awal
> ditolak oleh bukti. Probe terhadap `gemini-2.5-flash-native-audio-latest`
> menghasilkan 265 chunk audio, dan **seluruhnya** membawa
> `mimeType: 'audio/pcm;rate=24000'` (`partsWithoutMime: 0`). Kondisi lama
> karena itu meloloskan semua chunk — ia bukan penyebab AI diam.
>
> Perubahan pemetaan audio tetap dikerjakan, tetapi statusnya turun menjadi
> **hardening**, bukan perbaikan bug: membaca `msg.data` (accessor resmi SDK)
> dengan fallback ke `inlineData.data`, dan sengaja tidak menyaring berdasarkan
> `mimeType` — sebab bila suatu saat ada model yang tidak mengirim `mimeType`,
> filter lama akan membuang seluruh audio tanpa error maupun log.

Hipotesis awal (dipertahankan sebagai catatan): `frontend/src/lib/gemini/liveClient.ts`
hanya meneruskan chunk audio bila `part.inlineData.mimeType` diawali `audio/pcm`:

```ts
if (inline?.data && inline.mimeType?.startsWith('audio/pcm')) {
  handlers.onAudioChunk(inline.data);
}
```

### Bug B — tidak ada pemicu giliran pertama — **PENYEBAB TUNGGAL, TERKONFIRMASI**

Gemini Live tidak bicara sampai menerima input. Saat sesi terhubung, aplikasi
tidak mengirim apa pun, sehingga model menunggu tanpa batas. (Verifikasi Task 3
dahulu berhasil justru karena mengirim text turn secara manual.)

Probe membuktikan ini secara langsung: begitu satu kickoff turn dikirim, model
langsung menghasilkan sapaan + pertanyaan pertama dalam Bahasa Indonesia beserta
265 chunk audio. Tanpa kickoff, tidak ada satu pun pesan yang datang.

### Bug C — audio berpotensi diblokir autoplay policy

`AudioContext` playback dibuat saat render (lewat getter `analyser` yang diakses
di JSX), bukan dari user gesture langsung, sehingga bisa tetap `suspended` di
sebagian browser (khususnya Safari/iOS).

### Bukan bug

Mikrofon sebenarnya sudah auto-start dan streaming kontinu; tombol mic hanya
mute opsional. Persepsi "harus klik" muncul karena AI tidak pernah bicara
duluan, sehingga layar terasa mati dan pengguna mencari tombol.

## Keputusan desain

| Keputusan | Pilihan |
| --- | --- |
| Pembuka percakapan | AI menyapa duluan, otomatis saat terhubung |
| Tombol mic | Tetap ada, murni opsional (bisukan sementara) |
| Unlock audio | Satu tombol "Mulai Wawancara" di layar sesi |
| Voice | `Kore` (prebuilt, eksplisit) |

## Perubahan

### 1. Backend — `backend/src/modules/gemini/gemini.service.ts`

- `speechConfig` menjadi:
  ```ts
  speechConfig: {
    languageCode: 'id-ID',
    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
  }
  ```
  Voice dikunci server-side di dalam `liveConnectConstraints` ephemeral token,
  konsisten dengan postur keamanan yang sudah ada (klien tidak bisa mengubahnya).
- `buildSystemInstruction()` menambah satu aturan: buka wawancara dengan sapaan
  singkat, lalu langsung ajukan pertanyaan pertama tanpa menunggu kandidat.

### 2. Frontend — `frontend/src/lib/gemini/liveClient.ts`

**Pemetaan audio (fix Bug A).** Di `handleMessage`, ambil audio dari `msg.data`
lebih dulu; bila tidak ada, fallback ke `serverContent.modelTurn.parts[]
.inlineData.data` **tanpa** syarat `mimeType`. Kedua jalur diteruskan ke
`onAudioChunk`, dan hanya satu yang dipakai per pesan (tidak dobel).

**Kickoff turn (fix Bug B).** Setelah state `connected` pada koneksi pertama,
kirim satu giliran pemicu:

```ts
session.sendClientContent({
  turns: [{ role: 'user', parts: [{ text: KICKOFF_PROMPT }] }],
  turnComplete: true,
});
```

- `KICKOFF_PROMPT` adalah instruksi tersembunyi berbahasa Indonesia, misalnya:
  "Mulai wawancara sekarang. Sapa kandidat dengan singkat, lalu ajukan
  pertanyaan pertama."
- Teks ini **tidak** dimasukkan ke state transkrip UI dan karenanya tidak ikut
  tersimpan ke MongoDB. `inputAudioTranscription` hanya mentranskrip audio, jadi
  text turn ini tidak muncul sebagai `inputTranscription`.
- Dijaga flag modul `kickoffSent` sehingga **tidak dikirim ulang saat reconnect
  / session resumption** — kalau tidak, AI akan mengulang sapaan di tengah sesi.
- Bila `sendClientContent` melempar, panggil `handlers.onError` dengan pesan yang
  bisa dibaca; koneksi tetap terbuka sehingga pengguna masih bisa bicara duluan.

### 3. Frontend — `frontend/src/lib/audio/playback.ts`

Tambah `resume(): Promise<void>` pada interface `AudioPlayback`. Method ini
membuat `AudioContext` (bila belum ada) dan memanggil `ctx.resume()`, sehingga
bisa dipanggil dari dalam handler klik untuk membuka kunci autoplay policy.
Perilaku `enqueue`/`clear`/`close` tidak berubah.

### 4. Frontend — `frontend/src/pages/Session.tsx` + `features/session/PreSessionCard.tsx`

Layar sesi mendapat state awal baru `pre-session` (sebelum ada koneksi apa pun):

- Komponen baru `PreSessionCard` menampilkan judul bidang + konteks pekerjaan,
  tombol utama **"Mulai Wawancara"**, dan hint: "Gunakan headphone agar suara AI
  tidak tertangkap mikrofon."
- Semua yang membutuhkan user gesture dijalankan **di dalam handler klik**,
  berurutan:
  1. `playback = createAudioPlayback()` lalu `await playback.resume()`
  2. `capture.start()` (izin mikrofon diminta di sini)
  3. `connect()` (mint token + buka WSS)
  4. saat `connected` → kickoff otomatis → AI menyapa dan bertanya
- Karena mic mulai sebelum WSS terbuka, chunk audio yang dihasilkan sebelum
  state `connected` **sengaja dibuang** (`liveRef.current?.sendAudio` no-op saat
  `liveRef` masih null, dan `sendAudio` sendiri sudah menjaga `state !==
  'connected'`). Ini hanya beberapa ratus milidetik keheningan awal.
- Setelah itu sesi 100% hands-free sampai "Akhiri Sesi".
- Bila `capture.start()` ditolak, tetap tampilkan state `denied` yang sudah ada;
  sesi tetap terhubung dan AI tetap bisa menyapa (pengguna bisa mengizinkan mic
  lalu menekan tombol mic untuk melanjutkan).
- `useEffect` mount **tidak lagi** memanggil `connect()` otomatis.

### 5. Kontrol mikrofon

Tidak ada perubahan perilaku selain teks: mic auto-aktif dan streaming kontinu;
tombol hanya untuk membisukan sementara. State `disabled` hanya muncul selagi
`connecting`.

## Risiko yang diterima

**Echo / barge-in palsu.** Dengan mic selalu aktif, suara AI dari speaker bisa
tertangkap mikrofon dan memicu barge-in palsu. `echoCancellation: true` sudah
aktif pada `getUserMedia` dan AEC Chrome umumnya cukup. Auto-mute mic selagi AI
bicara **sengaja tidak dipakai** karena akan merusak barge-in yang natural.
Mitigasi: hint headphone di layar pra-sesi.

## Verifikasi

Proyek ini tidak memakai unit test framework (QA = Black Box Testing di Fase 6).
Gerbang verifikasi:

1. `npm run typecheck -w backend` dan `-w frontend` bersih; `npm run lint` bersih;
   `npm run build -w frontend` sukses.
2. Skrip Node sekali-jalan yang membuka sesi Live dengan token dari endpoint
   `/token`, mengirim kickoff turn, dan memastikan **chunk audio benar-benar
   diterima** melalui jalur pemetaan yang baru (bukti Bug A + Bug B teratasi
   tanpa perlu browser/mikrofon).
3. Uji manual di browser: buka sesi → klik "Mulai Wawancara" → izinkan mic →
   **AI menyapa dengan suara** dalam Bahasa Indonesia → jawab dengan bicara →
   bubble transkrip AI + kandidat muncul, visualizer bergerak → tanpa menekan
   tombol apa pun percakapan berlanjut → "Akhiri Sesi" → "Menganalisis…" →
   halaman Result dengan skor. Konfirmasi mic + WebSocket dilepas saat
   meninggalkan halaman.

## Di luar scope

- CV context (Fase 4), halaman Result penuh & Riwayat (Fase 5).
- Varian layout Imersif/Transkrip (dikunci: Klasik saja).
- Auto-mute mic saat AI bicara (lihat "Risiko yang diterima").
