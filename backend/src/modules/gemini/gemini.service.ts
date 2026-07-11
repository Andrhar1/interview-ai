import { GoogleGenAI, Modality } from '@google/genai';
import { env } from '../../config/env.js';

/**
 * Shared GoogleGenAI client (singleton, constructed once at module scope —
 * mirrors the pool/client singletons in config/db.ts and config/mongo.ts).
 * The API key never leaves this process.
 */
const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
  httpOptions: { apiVersion: 'v1alpha' },
});

export interface BuildSystemInstructionInput {
  jobFieldName: string;
  jobTitle?: string | null;
  company?: string | null;
  jobDescription?: string | null;
}

/**
 * Builds the Bahasa Indonesia system instruction for the interview persona.
 * Locked server-side via liveConnectConstraints — never sent to the client.
 */
export function buildSystemInstruction(input: BuildSystemInstructionInput): string {
  const context: string[] = [`Bidang pekerjaan: ${input.jobFieldName}`];
  if (input.jobTitle) context.push(`Posisi yang dilamar: ${input.jobTitle}`);
  if (input.company) context.push(`Perusahaan: ${input.company}`);
  if (input.jobDescription) context.push(`Deskripsi pekerjaan: ${input.jobDescription}`);

  return `Anda adalah pewawancara HR profesional Indonesia yang ramah namun formal, sedang melakukan simulasi wawancara kerja.

Konteks wawancara:
${context.join('\n')}

Aturan wawancara:
- Ajukan selalu satu pertanyaan per giliran, lalu tunggu jawaban kandidat sebelum melanjutkan.
- Setelah setiap jawaban kandidat, berikan umpan balik singkat (2-3 kalimat) sebelum melanjutkan ke pertanyaan berikutnya.
- Tutup wawancara setelah 5-7 pertanyaan, lalu berikan ringkasan penutup yang singkat dan konstruktif.
- Gunakan Bahasa Indonesia yang formal namun ramah sepanjang sesi.
- Sesuaikan pertanyaan dengan bidang pekerjaan dan konteks di atas.

// TODO(Fase 4): inject {CV_CONTEXT} — ringkasan CV kandidat — begitu modul CV tersedia.`;
}

/**
 * Mints a short-lived Google ephemeral token with the model + system
 * instruction locked server-side via liveConnectConstraints, so the
 * long-lived GEMINI_API_KEY never leaves this server. Never log the
 * returned token or the API key.
 */
export async function createEphemeralToken(
  systemInstruction: string,
): Promise<{ token: string; model: string }> {
  const created = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      liveConnectConstraints: {
        model: env.GEMINI_MODEL,
        config: {
          temperature: 0.7,
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { languageCode: 'id-ID' },
          sessionResumption: {},
          systemInstruction,
        },
      },
      httpOptions: { apiVersion: 'v1alpha' },
    },
  });

  if (!created.name) {
    throw new Error('Gemini did not return an ephemeral token name.');
  }

  return { token: created.name, model: env.GEMINI_MODEL };
}
