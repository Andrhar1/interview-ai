import { expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { AUTH_STATE, FIXTURES, openDashboard, shot, useSyntheticMicrophone } from './helpers';

/**
 * Pengujian Black Box — UC-04 Memulai Sesi, UC-05 Menjawab Pertanyaan,
 * UC-06 Menerima Umpan Balik, UC-07 Mengakhiri Sesi.
 *
 * Mikrofon fisik digantikan berkas WAV berisi lima jawaban Bahasa Indonesia
 * (lihat playwright.config.ts dan tests/fixtures/build_audio.py), sehingga
 * percakapan suara dua arah dengan Gemini Live API benar-benar terjadi.
 * Keempat use case diuji dalam satu alur karena memang satu sesi yang sama.
 */
test.describe.configure({ mode: 'serial' });
test.use({ storageState: AUTH_STATE });

/** Bukti kuantitatif untuk pembahasan BAB IV (latensi, jumlah giliran). */
const metrics: Record<string, number | string | string[]> = {};

test.afterAll(() => {
  mkdirSync(path.resolve('tests/results'), { recursive: true });
  writeFileSync(
    path.resolve('tests/results/live-metrics.json'),
    JSON.stringify(metrics, null, 2),
  );
});

test('TC-17..TC-21 — Alur penuh sesi wawancara suara real-time', async ({ page }) => {
  await useSyntheticMicrophone(page, path.join(FIXTURES, 'candidate-answers.wav'));
  await openDashboard(page);

  // --- Persiapan sesi: bidang + konteks lowongan + CV -----------------------
  await page.getByRole('heading', { name: 'Teknologi Informasi' }).click();
  await page.getByLabel('Posisi yang dilamar').fill('Backend Engineer');
  await page.getByLabel('Perusahaan').fill('PT Maju Teknologi');
  await page
    .getByLabel('Deskripsi pekerjaan')
    .fill(
      'Merancang dan memelihara layanan API menggunakan Node.js dan PostgreSQL, ' +
        'melakukan optimasi kinerja, serta berkolaborasi dengan tim frontend.',
    );
  await page.setInputFiles('input[type=file]', path.join(FIXTURES, 'cv-andri.pdf'));
  await expect(page.getByRole('button', { name: 'hapus' })).toBeVisible();

  // --- TC-17 (UC-04) Sesi dibuat dan halaman wawancara terbuka -------------
  await page.getByRole('button', { name: 'Mulai Sesi Wawancara' }).click();
  await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
  const sessionId = page.url().split('/').pop()!;
  metrics.session_id = sessionId;

  await expect(page.getByRole('button', { name: 'Mulai Wawancara' })).toBeVisible();
  await shot(page, '06-pre-session');

  // --- TC-18 (UC-04) Koneksi WSS terbuka dan AI membuka percakapan ---------
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Mulai Wawancara' }).click();

  // Gelembung AI pertama = bukti token broker + koneksi Live API berhasil.
  await expect(page.getByTestId('bubble-ai').first()).toBeVisible({ timeout: 90_000 });
  metrics.detik_sampai_sapaan_ai = Number(((Date.now() - t0) / 1000).toFixed(1));

  // --- TC-19 (UC-05) Jawaban suara kandidat tertranskripsi -----------------
  // Berkas WAV memutar jawaban pertama setelah jeda 17 detik; transkripsi
  // Gemini berjalan ~3 detik di belakang penutur.
  const tSpeak = Date.now();
  await expect(page.getByTestId('bubble-user').first()).toBeVisible({ timeout: 150_000 });
  metrics.detik_sampai_transkrip_jawaban = Number(((Date.now() - tSpeak) / 1000).toFixed(1));

  // Biarkan percakapan berjalan sampai berkas audio hampir habis, agar
  // transkrip cukup kaya untuk dievaluasi. Berhenti lebih awal bila kedua
  // pihak sudah cukup banyak bergiliran.
  const deadline = Date.now() + 170_000;
  while (Date.now() < deadline) {
    const ai = await page.getByTestId('bubble-ai').count();
    const user = await page.getByTestId('bubble-user').count();
    if (ai >= 4 && user >= 4) break;
    await page.waitForTimeout(3_000);
  }

  const aiTexts = await page.getByTestId('bubble-ai').allInnerTexts();
  const userTexts = await page.getByTestId('bubble-user').allInnerTexts();
  metrics.giliran_ai = aiTexts.length;
  metrics.giliran_kandidat = userTexts.length;
  metrics.transkrip_ai = aiTexts.map((t) => t.replace(/^Pewawancara AI\n/, '').trim());
  metrics.transkrip_kandidat = userTexts.map((t) => t.trim());

  await shot(page, '07-session-live');

  // --- TC-20 (UC-06) Percakapan dua arah benar-benar terjadi ---------------
  // Beberapa giliran AI = AI menanggapi jawaban, bukan sekadar menyapa.
  expect(aiTexts.length).toBeGreaterThanOrEqual(2);
  expect(userTexts.length).toBeGreaterThanOrEqual(2);
  // Jawaban kandidat tertranskripsi secara substantif (bukan fragmen liar).
  const spokenTotal = userTexts.join(' ').replace(/\s+/g, ' ').trim();
  metrics.jumlah_karakter_transkrip_kandidat = spokenTotal.length;
  expect(spokenTotal.length).toBeGreaterThan(80);

  // --- TC-21 (UC-07) Mengakhiri sesi memicu evaluasi dan halaman Hasil -----
  await page.getByRole('button', { name: 'Akhiri Sesi', exact: true }).click();
  await expect(page.getByText('Akhiri sesi wawancara?')).toBeVisible();
  await shot(page, '08-end-confirm');

  const tEnd = Date.now();
  const modal = page.locator('div.fixed.inset-0.z-50');
  await modal.getByRole('button', { name: 'Akhiri Sesi', exact: true }).click();

  await expect(page.getByText('Menganalisis jawaban Anda…')).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`/result/${sessionId}$`), { timeout: 180_000 });
  metrics.detik_analisis_evaluasi = Number(((Date.now() - tEnd) / 1000).toFixed(1));

  // --- TC-21 (UC-06) Hasil evaluasi tampil lengkap -------------------------
  await expect(page.getByRole('heading', { name: 'Hasil & Umpan Balik' })).toBeVisible();
  await expect(page.getByText('Skor keseluruhan')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rincian penilaian' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Yang sudah baik' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bisa ditingkatkan' })).toBeVisible();

  for (const metric of ['Komunikasi', 'Relevansi', 'Struktur', 'Kepercayaan Diri']) {
    await expect(page.getByText(new RegExp(metric, 'i')).first()).toBeVisible();
  }

  const scoreText = await page.locator('p.text-\\[56px\\]').innerText();
  metrics.skor_keseluruhan = scoreText.trim();
  expect(Number(scoreText.replace(',', '.'))).toBeGreaterThan(0);

  await shot(page, '09-result');
});
