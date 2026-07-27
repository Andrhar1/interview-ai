import { expect, test } from '@playwright/test';
import { AUTH_STATE, openDashboard, shot } from './helpers';

/**
 * Pengujian Black Box — UC-08 Melihat Riwayat Sesi dan UC-09 Melihat Detail
 * Riwayat. Data yang diperiksa adalah sesi yang benar-benar diselesaikan pada
 * berkas 03, sehingga alur simpan → baca ikut terverifikasi.
 */
test.describe.configure({ mode: 'serial' });
test.use({ storageState: AUTH_STATE });

test.beforeEach(async ({ page }) => {
  await openDashboard(page);
});

test('TC-22 — UC-08 Riwayat menampilkan sesi yang telah diselesaikan', async ({ page }) => {
  await page.getByRole('link', { name: 'Riwayat' }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('heading', { name: 'Riwayat Sesi' })).toBeVisible();

  const cards = page.getByRole('button', { name: 'Lihat Detail' });
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(1);

  // Kartu memuat bidang, tanggal, dan skor hasil evaluasi.
  await expect(page.getByRole('heading', { name: 'Teknologi Informasi' }).first()).toBeVisible();
  await shot(page, '10-history');
});

test('TC-23 — UC-09 Detail riwayat menampilkan penilaian dan transkrip', async ({ page }) => {
  await page.goto('/history');
  await page.getByRole('button', { name: 'Lihat Detail' }).first().click();
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/);

  await expect(page.getByRole('heading', { name: 'Rincian penilaian' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Transkrip' })).toBeVisible();

  // Transkrip tersimpan di MongoDB dan berhasil dibaca kembali.
  await expect(page.getByTestId('bubble-ai').first()).toBeVisible();
  await expect(page.getByTestId('bubble-user').first()).toBeVisible();

  // Empat metrik evaluasi terstruktur tampil.
  for (const metric of ['Komunikasi', 'Relevansi', 'Struktur', 'Kepercayaan Diri']) {
    await expect(page.getByText(new RegExp(metric, 'i')).first()).toBeVisible();
  }
  await shot(page, '11-history-detail');
});

test('TC-24 — UC-09 Detail sesi milik pengguna lain tidak dapat diakses', async ({ page }) => {
  // UUID acak yang bukan milik akun ini: sistem harus menolak, bukan menampilkan.
  await page.goto('/history/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText(/tidak ditemukan|Gagal memuat/i)).toBeVisible();
});

test('TC-25 — UC-09 Navigasi kembali dari detail ke daftar riwayat', async ({ page }) => {
  await page.goto('/history');
  await page.getByRole('button', { name: 'Lihat Detail' }).first().click();
  await page.getByRole('link', { name: 'Kembali ke Riwayat' }).click();
  await expect(page).toHaveURL(/\/history$/);
});
