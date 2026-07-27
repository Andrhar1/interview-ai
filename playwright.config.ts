import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Tangkapan layar untuk sub-bab "Hasil Implementasi" pada BAB IV. */
export const SHOT_DIR = path.join(here, 'docs/skripsi/gambar');

/**
 * Konfigurasi pengujian Black Box BAB IV.
 *
 * Dijalankan serial (satu worker) karena skenario saling bergantung: sesi
 * wawancara yang diselesaikan pada berkas 03 adalah data yang diperiksa oleh
 * pengujian riwayat pada berkas 04. Urutan eksekusi mengikuti awalan nomor
 * pada nama berkas.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // 99-diagnose.spec.ts adalah alat bantu diagnosa, bukan skenario pengujian.
  testIgnore: '**/99-*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  // Sesi wawancara live memutar audio ~3,5 menit lalu menunggu evaluasi LLM.
  timeout: 8 * 60 * 1000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'tests/results/results.json' }],
    ['html', { outputFolder: 'tests/results/html', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5180',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    video: 'off',
    permissions: ['microphone'],
    launchOptions: {
      args: [
        // Izinkan mikrofon tanpa dialog izin.
        '--use-fake-ui-for-media-stream',
        // Suara kandidat TIDAK memakai --use-file-for-fake-audio-capture: flag
        // itu terbukti diabaikan pada build ini, sehingga mikrofon disimulasikan
        // lewat Web Audio API (lihat useSyntheticMicrophone di helpers.ts).
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
