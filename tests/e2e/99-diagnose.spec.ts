import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FIXTURES, currentAccount, loginViaUi, useSyntheticMicrophone } from './helpers';

/**
 * Bukan bagian dari pengujian Black Box — skrip diagnostik untuk mengamati
 * perilaku sesi live detik per detik (jumlah gelembung, status bicara, pesan
 * konsol). Dipakai saat menyetel skenario pengujian UC-04..UC-07.
 */
/** PCM 16 kHz yang benar-benar dikirim aplikasi ke Gemini, untuk diperiksa ulang. */
const capturedPcm: Buffer[] = [];

test.afterAll(() => {
  const pcm = Buffer.concat(capturedPcm);
  if (pcm.length === 0) return;
  const rate = 16000;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  mkdirSync(path.resolve('tests/results'), { recursive: true });
  const out = path.resolve('tests/results/sent-to-gemini.wav');
  writeFileSync(out, Buffer.concat([header, pcm]));
  console.log(`[dump] ${out} — ${(pcm.length / 2 / rate).toFixed(1)} detik PCM 16 kHz`);
});

test('diagnose live session', async ({ page }) => {
  page.on('console', (m) => console.log(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  page.on('websocket', (ws) => {
    if (!ws.url().includes('googleapis')) return;
    console.log(`[ws] open ${ws.url().slice(0, 80)}`);
    let sent = 0;
    ws.on('framesent', (f) => {
      const text = Buffer.isBuffer(f.payload) ? f.payload.toString('utf8') : String(f.payload);
      // Audio kandidat dikirim terus-menerus; kumpulkan PCM-nya, jangan dicetak.
      const m = /"data"\s*:\s*"([^"]+)"/.exec(text);
      if (m && text.includes('realtimeInput')) {
        sent++;
        capturedPcm.push(Buffer.from(m[1], 'base64'));
        if (sent % 200 === 0) console.log(`[ws] >> ${sent} frame audio terkirim`);
        return;
      }
      console.log(`[ws] >> ${text.slice(0, 300)}`);
    });
    ws.on('framereceived', (f) => {
      const s = Buffer.isBuffer(f.payload) ? f.payload.toString('utf8') : String(f.payload);
      // Ringkas chunk audio balasan agar teks/kontrol terlihat jelas.
      console.log(`[ws] << ${s.replace(/"data":"[^"]{40,}"/g, '"data":"<audio>"').slice(0, 400)}`);
    });
    ws.on('close', () => console.log('[ws] CLOSED'));
    ws.on('socketerror', (e) => console.log(`[ws] ERROR ${e}`));
  });

  await useSyntheticMicrophone(page, path.join(FIXTURES, process.env.FAKE_AUDIO_NAME ?? 'candidate-answers.wav'));
  await loginViaUi(page, currentAccount());
  await page.getByRole('heading', { name: 'Teknologi Informasi' }).click();
  await page.getByLabel('Posisi yang dilamar').fill('Backend Engineer');
  await page.setInputFiles('input[type=file]', path.join(FIXTURES, 'cv-andri.pdf'));
  await page.getByRole('button', { name: 'hapus' }).waitFor();
  await page.getByRole('button', { name: 'Mulai Sesi Wawancara' }).click();
  await page.getByRole('button', { name: 'Mulai Wawancara' }).click();

  const t0 = Date.now();
  for (let i = 0; i < 22; i++) {
    await page.waitForTimeout(5_000);
    const ai = await page.getByTestId('bubble-ai').count();
    const user = await page.getByTestId('bubble-user').count();
    const status = await page
      .locator('div.rounded-pill.border')
      .first()
      .innerText()
      .catch(() => '?');
    const lastAi = ai
      ? (await page.getByTestId('bubble-ai').last().innerText()).replace(/\s+/g, ' ').slice(0, 90)
      : '-';
    const lastUser = user
      ? (await page.getByTestId('bubble-user').last().innerText()).replace(/\s+/g, ' ').slice(0, 90)
      : '-';
    console.log(
      `t=${((Date.now() - t0) / 1000).toFixed(0)}s ai=${ai} user=${user} status="${status.replace(/\s+/g, ' ')}"\n` +
        `    AI:   ${lastAi}\n    USER: ${lastUser}`,
    );
  }
});
