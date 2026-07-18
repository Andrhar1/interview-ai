import { GoogleGenAI, Modality, Type } from '@google/genai';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';

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
  cvContext?: string | null;
}

/**
 * Cap the CV text injected into the system instruction. A CV is 1-3 pages
 * (~3-6k chars); anything beyond this is usually parsing noise, and an
 * unbounded prompt inflates token cost + latency of every live session.
 */
const CV_CONTEXT_MAX_CHARS = 8000;

/**
 * Builds the Bahasa Indonesia system instruction for the interview persona.
 * Locked server-side via liveConnectConstraints — never sent to the client.
 */
export function buildSystemInstruction(input: BuildSystemInstructionInput): string {
  const context: string[] = [`Bidang pekerjaan: ${input.jobFieldName}`];
  if (input.jobTitle) context.push(`Posisi yang dilamar: ${input.jobTitle}`);
  if (input.company) context.push(`Perusahaan: ${input.company}`);
  if (input.jobDescription) context.push(`Deskripsi pekerjaan: ${input.jobDescription}`);

  const cv = input.cvContext?.trim();
  const cvBlock = cv
    ? `\n\nCV kandidat (gunakan untuk mempersonalisasi pertanyaan — gali pengalaman, keterampilan, dan pencapaian yang tercantum):\n${cv.slice(0, CV_CONTEXT_MAX_CHARS)}`
    : '';

  return `Anda adalah pewawancara HR profesional Indonesia yang ramah namun formal, sedang melakukan simulasi wawancara kerja.

Konteks wawancara:
${context.join('\n')}${cvBlock}

Aturan wawancara:
- Buka sesi dengan sapaan singkat (satu kalimat), lalu LANGSUNG ajukan pertanyaan pertama tanpa menunggu kandidat berbicara lebih dulu.
- Ajukan selalu satu pertanyaan per giliran, lalu tunggu jawaban kandidat sebelum melanjutkan.
- Setelah setiap jawaban kandidat, berikan umpan balik singkat (2-3 kalimat) sebelum melanjutkan ke pertanyaan berikutnya.
- Tutup wawancara setelah 5-7 pertanyaan, lalu berikan ringkasan penutup yang singkat dan konstruktif.
- Gunakan Bahasa Indonesia yang formal namun ramah sepanjang sesi.
- Sesuaikan pertanyaan dengan bidang pekerjaan dan konteks di atas.`;
}

/**
 * Mints a short-lived Google ephemeral token with the model + system
 * instruction locked server-side via liveConnectConstraints, so the
 * long-lived GEMINI_API_KEY never leaves this server. Never log the
 * returned token or the API key.
 *
 * `lockAdditionalFields: []` is REQUIRED. With liveConnectConstraints set and
 * lockAdditionalFields undefined, the API locks EVERY field of
 * LiveConnectConfig — including the ones we do not set — so the client's
 * `sessionResumption: { handle }` would be silently dropped and every
 * reconnect would open a brand-new, empty session. With an empty array only
 * the fields we actually set below are locked (model, systemInstruction,
 * voice, temperature, modalities, transcription — the security-relevant ones),
 * leaving sessionResumption client-settable. That is the ONLY field the client
 * may supply; it carries no persona/voice/model override.
 */
export async function createEphemeralToken(
  systemInstruction: string,
): Promise<{ token: string; model: string }> {
  let created;
  try {
    created = await ai.authTokens.create({
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
            speechConfig: {
              languageCode: 'id-ID',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            systemInstruction,
          },
        },
        // Lock only the fields set above; sessionResumption stays client-settable.
        lockAdditionalFields: [],
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });
  } catch {
    console.error('Gemini token mint failed');
    throw new AppError(502, 'Gagal memulai sesi wawancara. Coba lagi.');
  }

  if (!created.name) {
    throw new AppError(502, 'Gagal memulai sesi wawancara. Coba lagi.');
  }

  return { token: created.name, model: env.GEMINI_MODEL };
}

/** The 4 fixed evaluation metrics, in the required order — keys are stable slugs. */
const METRIC_DEFS = [
  { key: 'komunikasi', label: 'Komunikasi' },
  { key: 'relevansi', label: 'Relevansi' },
  { key: 'struktur', label: 'Struktur (STAR)' },
  { key: 'kepercayaan_diri', label: 'Kepercayaan Diri' },
] as const;

export interface EvaluationMetric {
  key: string;
  label: string;
  score: number;
  note: string;
}

export interface Evaluation {
  overall_score: number;
  feedback_text: string;
  metrics: EvaluationMetric[];
  strengths: string[];
  improvements: string[];
  summary: string;
}

export interface EvaluationExchange {
  role: 'ai' | 'user';
  text: string;
}

/** Lenient shape for the raw Gemini JSON output — everything optional, since the
 * model can drift. Normalization below fills in/clamps whatever is missing. */
const rawMetricSchema = z
  .object({
    key: z.string().optional(),
    label: z.string().optional(),
    score: z.coerce.number().optional(),
    note: z.string().optional(),
  })
  .passthrough();

const rawEvaluationSchema = z
  .object({
    overall_score: z.coerce.number().optional(),
    feedback_text: z.string().optional(),
    metrics: z.array(rawMetricSchema).optional(),
    strengths: z.array(z.string()).optional(),
    improvements: z.array(z.string()).optional(),
    summary: z.string().optional(),
  })
  .passthrough();

/** Gemini structured-output schema requesting the fixed evaluation shape. */
const evaluationResponseSchema = {
  type: Type.OBJECT,
  properties: {
    overall_score: {
      type: Type.INTEGER,
      description: 'Skor keseluruhan 0-100, kira-kira rata-rata tertimbang dari metrics.',
    },
    feedback_text: {
      type: Type.STRING,
      description: 'Umpan balik naratif ringkas dalam Bahasa Indonesia.',
    },
    metrics: {
      type: Type.ARRAY,
      description: 'Tepat 4 metrik: komunikasi, relevansi, struktur, kepercayaan_diri.',
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING },
          label: { type: Type.STRING },
          score: { type: Type.INTEGER },
          note: { type: Type.STRING, description: 'Catatan satu kalimat.' },
        },
        required: ['key', 'label', 'score', 'note'],
      },
    },
    strengths: {
      type: Type.ARRAY,
      description: '2-4 poin "yang sudah baik", dalam Bahasa Indonesia.',
      items: { type: Type.STRING },
    },
    improvements: {
      type: Type.ARRAY,
      description: '2-4 poin "bisa ditingkatkan", dalam Bahasa Indonesia.',
      items: { type: Type.STRING },
    },
    summary: {
      type: Type.STRING,
      description: 'Ringkasan naratif sesi dalam Bahasa Indonesia.',
    },
  },
  required: ['overall_score', 'feedback_text', 'metrics', 'strengths', 'improvements', 'summary'],
};

function clampScore(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const filtered = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (filtered.length > 0) return filtered;
  }
  return fallback;
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * Validates + normalizes the raw Gemini JSON output into the fixed Evaluation
 * shape. Never throws for minor drift (missing/renamed metric, missing
 * scores, etc.) — only throws AppError(502) if the payload is unusable
 * (not even a JSON object).
 */
export function normalizeEvaluation(raw: unknown): Evaluation {
  const parsed = rawEvaluationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(502, 'Gagal menganalisis sesi. Coba lagi.');
  }
  const data = parsed.data;
  const rawMetrics = data.metrics ?? [];

  const metrics: EvaluationMetric[] = METRIC_DEFS.map((def) => {
    const match = rawMetrics.find((m) => {
      const key = typeof m.key === 'string' ? m.key.trim().toLowerCase() : '';
      const label = typeof m.label === 'string' ? m.label.trim().toLowerCase() : '';
      return key === def.key || label === def.label.toLowerCase();
    });
    return {
      key: def.key,
      label: def.label,
      score: clampScore(match?.score, 50),
      note: normalizeText(match?.note, ''),
    };
  });

  const overallFallback = Math.round(
    metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length,
  );

  return {
    overall_score: clampScore(data.overall_score, overallFallback),
    feedback_text: normalizeText(
      data.feedback_text,
      'Evaluasi wawancara berhasil dibuat berdasarkan transkrip sesi.',
    ),
    metrics,
    strengths: normalizeStringArray(data.strengths, [
      'Kandidat menyelesaikan sesi wawancara ini.',
    ]),
    improvements: normalizeStringArray(data.improvements, [
      'Perlu latihan lebih lanjut untuk meningkatkan performa wawancara.',
    ]),
    summary: normalizeText(data.summary, 'Sesi wawancara telah selesai dianalisis.'),
  };
}

function buildAnalysisPrompt(exchanges: EvaluationExchange[]): string {
  const transcript = exchanges
    .map((e) => `${e.role === 'ai' ? 'Pewawancara' : 'Kandidat'}: ${e.text}`)
    .join('\n');

  return `Anda adalah asesor wawancara kerja profesional Indonesia. Evaluasi performa kandidat berdasarkan transkrip wawancara di bawah ini.

Berikan penilaian dalam format JSON dengan:
- overall_score: skor keseluruhan 0-100 (kira-kira rata-rata tertimbang dari ke-4 metrik).
- metrics: TEPAT 4 metrik berikut, masing-masing dengan score 0-100 dan note (catatan satu kalimat), dalam urutan ini:
  1. key="komunikasi", label="Komunikasi"
  2. key="relevansi", label="Relevansi"
  3. key="struktur", label="Struktur (STAR)"
  4. key="kepercayaan_diri", label="Kepercayaan Diri"
- strengths: 2-4 poin hal yang sudah baik dari kandidat.
- improvements: 2-4 poin hal yang bisa ditingkatkan.
- summary: ringkasan naratif singkat mengenai keseluruhan sesi.
- feedback_text: umpan balik naratif ringkas untuk kandidat.

Semua teks WAJIB menggunakan Bahasa Indonesia yang formal namun membangun.

Transkrip wawancara:
${transcript}`;
}

/**
 * Sends the interview transcript to Gemini (text model, structured JSON
 * output) and returns a validated, normalized Evaluation. Does not persist
 * anything — the caller (sessions module) is responsible for that via /end.
 */
export async function generateEvaluation(exchanges: EvaluationExchange[]): Promise<Evaluation> {
  let raw: unknown;
  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_ANALYSIS_MODEL,
      contents: buildAnalysisPrompt(exchanges),
      config: {
        responseMimeType: 'application/json',
        responseSchema: evaluationResponseSchema,
        temperature: 0.4,
      },
    });
    raw = JSON.parse(response.text ?? '');
  } catch {
    console.error('Gemini evaluation generation failed');
    throw new AppError(502, 'Gagal menganalisis sesi. Coba lagi.');
  }

  return normalizeEvaluation(raw);
}
