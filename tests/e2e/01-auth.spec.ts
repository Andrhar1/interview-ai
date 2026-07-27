import { expect, test } from '@playwright/test';
import { AUTH_STATE, currentAccount, loginViaUi, newAccount, shot } from './helpers';

/**
 * Pengujian Black Box — UC-01 Register, UC-02 Login, UC-10 Logout.
 * Akun yang dibuat di sini dipakai kembali oleh berkas spec berikutnya.
 */
test.describe.configure({ mode: 'serial' });

test('TC-00 — Landing page tampil dengan ajakan mulai', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('wawancara');
  await expect(page.getByRole('button', { name: /Mulai Sekarang/i }).first()).toBeVisible();
  await shot(page, '01-landing');
});

test('TC-01 — Halaman tanpa autentikasi dialihkan ke login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await shot(page, '02-login');
});

test('TC-02 — Register dengan email tidak valid ditolak di sisi klien', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Daftar', exact: true }).first().click();
  await page.getByLabel('Nama lengkap').fill('Uji Validasi');
  await page.getByLabel('Email').fill('bukan-email');
  await page.getByLabel('Kata sandi').fill('RahasiaUji123');
  await page.locator('button[type=submit]').click();

  await expect(page.getByText('Masukkan email yang valid.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('TC-03 — Register dengan kata sandi kurang dari 6 karakter ditolak', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Daftar', exact: true }).first().click();
  await page.getByLabel('Nama lengkap').fill('Uji Validasi');
  await page.getByLabel('Email').fill('uji.pendek@interviewai.test');
  await page.getByLabel('Kata sandi').fill('123');
  await page.locator('button[type=submit]').click();

  await expect(page.getByText('Kata sandi minimal 6 karakter.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('TC-04 — UC-01 Register akun baru berhasil dan masuk ke Dashboard', async ({ page }) => {
  const account = newAccount();

  await page.goto('/login');
  await page.getByRole('button', { name: 'Daftar', exact: true }).first().click();
  await page.getByLabel('Nama lengkap').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Kata sandi').fill(account.password);
  await shot(page, '03-register');
  await page.locator('button[type=submit]').click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: /Selamat datang, Andri/ })).toBeVisible();
});

test('TC-05 — Register dengan email yang sudah terdaftar ditolak server', async ({ page }) => {
  const account = currentAccount();

  await page.goto('/login');
  await page.getByRole('button', { name: 'Daftar', exact: true }).first().click();
  await page.getByLabel('Nama lengkap').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Kata sandi').fill(account.password);
  await page.locator('button[type=submit]').click();

  await expect(page.getByText(/sudah terdaftar|sudah digunakan/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('TC-06 — UC-02 Login dengan kredensial salah ditolak', async ({ page }) => {
  const account = currentAccount();

  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Kata sandi').fill('KataSandiSalah999');
  await page.locator('button[type=submit]').click();

  await expect(page.getByText(/salah|tidak (cocok|sesuai)/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('TC-07 — UC-02 Login dengan kredensial benar masuk ke Dashboard', async ({ page }) => {
  await loginViaUi(page, currentAccount());
  await expect(page.getByRole('heading', { name: /Selamat datang, Andri/ })).toBeVisible();
});

test('TC-08 — UC-10 Logout mengakhiri sesi dan memblokir halaman terproteksi', async ({ page }) => {
  await loginViaUi(page, currentAccount());

  await page.getByRole('button', { name: 'Keluar' }).click();
  // Sesi gugur seketika, sehingga ProtectedRoute mengalihkan ke /login lebih
  // dulu daripada navigasi ke Landing yang dipicu tombol Keluar.
  await expect(page).toHaveURL(/\/(login)?$/);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

// Bukan skenario pengujian: menyiapkan sesi login untuk spec 02–04.
test('Setup — simpan sesi login', async ({ page, context }) => {
  await loginViaUi(page, currentAccount());
  await context.storageState({ path: AUTH_STATE });
});
