import { expect, test } from '@playwright/test';
import path from 'node:path';
import { AUTH_STATE, FIXTURES, openDashboard, shot } from './helpers';

/**
 * Pengujian Black Box — UC-03 Memilih Bidang Pekerjaan dan UC-11 Mengunggah CV.
 * Keduanya berlangsung pada halaman Dashboard sebagai persiapan sesi wawancara.
 */
test.describe.configure({ mode: 'serial' });
test.use({ storageState: AUTH_STATE });

test.beforeEach(async ({ page }) => {
  await openDashboard(page);
});

test('TC-09 — UC-03 Daftar bidang pekerjaan dimuat dari server', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '1. Pilih bidang pekerjaan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Teknologi Informasi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pemasaran' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keuangan' })).toBeVisible();
  await shot(page, '04-dashboard');
});

test('TC-10 — UC-03 Tombol mulai terkunci sebelum bidang dipilih', async ({ page }) => {
  const start = page.getByRole('button', { name: 'Pilih bidang untuk mulai' });
  await expect(start).toBeDisabled();
  await expect(page.getByText('Pilih bidang pekerjaan terlebih dahulu untuk memulai.')).toBeVisible();
});

test('TC-11 — UC-03 Memilih bidang mengaktifkan tombol mulai sesi', async ({ page }) => {
  await page.getByRole('heading', { name: 'Teknologi Informasi' }).click();
  await expect(page.getByRole('button', { name: 'Mulai Sesi Wawancara' })).toBeEnabled();
});

test('TC-12 — UC-03 Konteks lowongan >40 karakter dikonfirmasi akan dipakai AI', async ({ page }) => {
  await page.getByLabel('Posisi yang dilamar').fill('Backend Engineer');
  await page.getByLabel('Perusahaan').fill('PT Maju Teknologi');
  await page
    .getByLabel('Deskripsi pekerjaan')
    .fill(
      'Bertanggung jawab merancang dan memelihara layanan API menggunakan Node.js ' +
        'dan PostgreSQL, serta berkolaborasi dengan tim frontend.',
    );

  await expect(page.getByText('Konteks akan dipakai AI')).toBeVisible();
});

test('TC-13 — UC-11 Unggah CV berformat PDF berhasil', async ({ page }) => {
  await page.setInputFiles('input[type=file]', path.join(FIXTURES, 'cv-andri.pdf'));

  await expect(page.getByText('cv-andri.pdf')).toBeVisible();
  await expect(page.getByRole('button', { name: 'hapus' })).toBeVisible();
  // Area unggah CV berada di bawah lipatan layar; gulirkan agar terlihat.
  await page.getByText('Unggah CV (opsional)').scrollIntoViewIfNeeded();
  await shot(page, '05-upload-cv');
});

test('TC-14 — UC-11 Unggah CV berformat DOCX berhasil', async ({ page }) => {
  await page.setInputFiles('input[type=file]', path.join(FIXTURES, 'cv-andri.docx'));

  await expect(page.getByText('cv-andri.docx')).toBeVisible();
  await expect(page.getByRole('button', { name: 'hapus' })).toBeVisible();
});

test('TC-15 — UC-11 Unggah berkas berformat salah ditolak', async ({ page }) => {
  await page.setInputFiles('input[type=file]', path.join(FIXTURES, 'cv-invalid.txt'));

  await expect(page.getByText('Format CV harus PDF atau DOCX.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'hapus' })).toHaveCount(0);
});

test('TC-16 — UC-11 CV yang sudah diunggah dapat dihapus dari formulir', async ({ page }) => {
  await page.setInputFiles('input[type=file]', path.join(FIXTURES, 'cv-andri.pdf'));
  await expect(page.getByRole('button', { name: 'hapus' })).toBeVisible();

  await page.getByRole('button', { name: 'hapus' }).click();
  await expect(page.getByText('Klik untuk unggah')).toBeVisible();
});
