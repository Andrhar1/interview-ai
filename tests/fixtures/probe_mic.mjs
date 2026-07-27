/**
 * Probe mandiri: buka Chromium dengan mikrofon palsu berisi probe-tone.wav,
 * lalu ukur amplitudo mikrofon tiap 250 ms — tanpa melibatkan aplikasi.
 *
 * Jika pola keras/hening 1 detik terlihat, flag mikrofon palsu bekerja.
 * Pakai: node tests/fixtures/probe_mic.mjs [path-wav]
 */
import { chromium } from '@playwright/test';
import path from 'node:path';

const file = path.resolve(process.argv[2] ?? 'tests/fixtures/probe-tone.wav');

const browser = await chromium.launch({
  headless: process.env.HEADED ? false : true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-capture',
    `--use-file-for-fake-audio-capture=${file}`,
  ],
});
const page = await browser.newPage();
await page.goto('http://localhost:5180/');

const samples = await page.evaluate(async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const out = [];
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    out.push(Math.sqrt(sum / buf.length));
  }
  return out;
});

console.log(`berkas: ${file}`);
samples.forEach((rms, i) => {
  const db = rms > 0 ? 20 * Math.log10(rms) : -99;
  console.log(`${((i + 1) * 0.25).toFixed(2)}s  ${db.toFixed(1)} dBFS  ${'#'.repeat(Math.max(0, Math.round(60 + db)))}`);
});

await browser.close();
