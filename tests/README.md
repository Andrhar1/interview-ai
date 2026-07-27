# Pengujian Black Box — bahan BAB IV

Skenario pengujian otomatis yang menghasilkan tabel hasil, angka kinerja, dan
tangkapan layar pada [`docs/skripsi/bab4.tex`](../docs/skripsi/bab4.tex).

## Menjalankan

```bash
# 1. Bangkitkan berkas uji (suara kandidat + CV contoh). Sekali saja.
npm run test:fixtures

# 2. Nyalakan basis data dan aplikasi.
docker start interviewai-mongo
npm run migrate -w backend
npm run dev

# 3. Jalankan seluruh skenario.
npm run test:e2e
```

Keluaran:

| Berkas | Isi |
| --- | --- |
| `tests/results/results.json` | Hasil mentah tiap skenario |
| `tests/results/live-metrics.json` | Latensi, jumlah giliran bicara, transkrip, skor |
| `tests/results/html/` | Laporan HTML Playwright |
| `docs/skripsi/gambar/*.png` | Tangkapan layar untuk BAB IV |

## Susunan berkas

Skenario dijalankan berurutan (`workers: 1`) karena saling bergantung: sesi
wawancara yang diselesaikan berkas `03` adalah data yang diperiksa berkas `04`.

| Berkas | Cakupan |
| --- | --- |
| `01-auth.spec.ts` | UC-01 Register, UC-02 Login, UC-10 Logout |
| `02-session-setup.spec.ts` | UC-03 Pilih bidang, UC-11 Unggah CV |
| `03-live-interview.spec.ts` | UC-04 s.d. UC-07 (sesi suara nyata ke Gemini) |
| `04-history.spec.ts` | UC-08 Riwayat, UC-09 Detail riwayat |
| `99-diagnose.spec.ts` | Alat bantu diagnosa, dikecualikan dari suite |

## Dua hal yang perlu diketahui

**Mikrofon disimulasikan lewat Web Audio API, bukan flag Chromium.** Opsi
`--use-file-for-fake-audio-capture` terbukti tidak berpengaruh pada build
Playwright di macOS ARM. Diverifikasi memakai `probe-tone.wav` (nada keras dan
hening bergantian tiap 1 detik): polanya hilang sama sekali pada PCM yang
benar-benar dikirim aplikasi ke Gemini. Karena itu `useSyntheticMicrophone()`
mengoper `getUserMedia` agar mengembalikan `MediaStream` bangkitan Web Audio
API. Yang disimulasikan hanya perangkat kerasnya — AudioWorklet, konversi PCM
16 kHz, dan pengiriman ke Gemini tetap memakai kode aplikasi apa adanya.

Untuk mendiagnosa ulang:

```bash
python3 tests/fixtures/probe_mic.py
node tests/fixtures/probe_mic.mjs        # ukur amplitudo mikrofon per 250 ms
```

**Login nyata hanya diuji pada berkas `01`.** Endpoint register/login dibatasi
20 permintaan per IP tiap 15 menit. Bila setiap skenario login ulang, suite ini
sendiri yang memicu pembatasan itu dan hasilnya menjadi gagal palsu. Skenario
`02`–`04` memulihkan sesi dari cookie refresh melalui `storageState`. Jika suite
pernah gagal karena rate limit, restart backend untuk mengosongkan penghitungnya.
