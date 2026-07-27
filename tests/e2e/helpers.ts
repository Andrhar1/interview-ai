import { expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');

export const SHOT_DIR = path.join(ROOT, 'docs/skripsi/gambar');
export const FIXTURES = path.join(ROOT, 'tests/fixtures');
const STATE_FILE = path.join(ROOT, 'tests/results/account.json');

/**
 * Cookie sesi hasil login, dipakai ulang oleh spec 02–04.
 *
 * Endpoint register/login dibatasi 20 permintaan per IP tiap 15 menit
 * (authLimiter). Bila setiap skenario login ulang, suite ini sendiri yang
 * memicu pembatasan itu dan hasilnya menjadi gagal palsu. Karena itu login
 * nyata hanya diuji pada spec 01 (UC-01/UC-02/UC-10); skenario lain memulihkan
 * sesi dari cookie refresh, persis seperti pengguna yang membuka kembali tab.
 */
export const AUTH_STATE = path.join(ROOT, 'tests/results/auth-state.json');

export interface Account {
  name: string;
  email: string;
  password: string;
}

/**
 * Akun uji dipakai bersama lintas berkas spec (register di 01, dipakai sampai
 * 04), sehingga identitasnya disimpan ke berkas — modul TypeScript tidak
 * berbagi memori antar berkas spec.
 */
export function newAccount(): Account {
  const account: Account = {
    name: 'Andri Hari Musyaffa',
    email: `uji.${Date.now()}@interviewai.test`,
    password: 'RahasiaUji123',
  };
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(account, null, 2));
  return account;
}

export function currentAccount(): Account {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Account;
}

/** Simpan tangkapan layar bernomor untuk disisipkan ke BAB IV. */
export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  // Diamkan animasi masuk agar tangkapan layar tidak buram/setengah jalan.
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: false });
}

/** Masuk lewat antarmuka (bukan pintasan API) agar tetap sah sebagai Black Box. */
export async function loginViaUi(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Kata sandi').fill(account.password);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** URL semu tempat berkas suara kandidat disajikan ke halaman saat pengujian. */
const TEST_AUDIO_URL = '/__test_audio.wav';

/**
 * Pasang mikrofon sintetis berisi jawaban kandidat.
 *
 * Flag Chromium `--use-file-for-fake-audio-capture` terbukti tidak berpengaruh
 * pada build Playwright di macOS ARM: berkas WAV diabaikan dan yang tertangkap
 * tetap nada bawaan perangkat palsu (diverifikasi dengan berkas probe berpola
 * keras/hening 1 detik — polanya hilang sama sekali pada PCM yang dikirim
 * aplikasi). Karena itu mikrofon disimulasikan satu lapis lebih tinggi:
 * `getUserMedia` dioper agar mengembalikan MediaStream yang dibangkitkan Web
 * Audio API dari berkas WAV yang sama.
 *
 * Yang disimulasikan hanya perangkat keras mikrofonnya. Seluruh jalur kode
 * aplikasi — AudioWorklet, konversi PCM 16 kHz, pengiriman ke Gemini — tetap
 * berjalan apa adanya, sehingga pengujian tetap sah sebagai Black Box.
 */
export async function useSyntheticMicrophone(page: Page, wavPath: string): Promise<void> {
  const bytes = readFileSync(wavPath);
  await page.route(`**${TEST_AUDIO_URL}`, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: bytes }),
  );

  await page.addInitScript((url: string) => {
    const media = navigator.mediaDevices;
    media.getUserMedia = async () => {
      const ctx = new AudioContext();
      const data = await (await fetch(url)).arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const destination = ctx.createMediaStreamDestination();
      source.connect(destination);
      // AudioContext bisa lahir 'suspended'; sesi selalu dimulai oleh klik
      // pengguna, jadi resume di sini aman dan memastikan audio mengalir.
      await ctx.resume().catch(() => {});
      source.start();
      return destination.stream;
    };
  }, TEST_AUDIO_URL);
}

/** Buka Dashboard memakai sesi tersimpan, tanpa memanggil endpoint login lagi. */
export async function openDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Selamat datang/ })).toBeVisible();
}
