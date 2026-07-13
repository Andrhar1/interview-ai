/**
 * Gap-free playback of Gemini Live's audio output: raw little-endian
 * 16-bit PCM, mono, 24 kHz, arriving as base64 chunks. Chunks are decoded
 * and scheduled back-to-back on a running clock so there are no audible
 * gaps or overlaps between them.
 *
 * Also exposes an AnalyserNode fed from the played-back signal so a
 * visualizer can show "AI speaking" amplitude (Task 5).
 */

import { base64ToInt16Array, int16ToFloat32 } from './pcm';

const PLAYBACK_SAMPLE_RATE = 24000;

export interface AudioPlayback {
  enqueue(pcmBase64: string): void;
  clear(): void;
  /**
   * Membuat + me-resume AudioContext. HARUS dipanggil dari dalam handler user
   * gesture (klik) agar autoplay policy browser tidak membisukan sesi — enqueue()
   * pertama biasanya datang dari WebSocket, jauh dari gesture apa pun.
   */
  resume(): Promise<void>;
  readonly analyser: AnalyserNode;
  close(): Promise<void>;
}

export function createAudioPlayback(): AudioPlayback {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let nextStartTime = 0;
  const liveSources = new Set<AudioBufferSourceNode>();

  // Lazily create the AudioContext (and its AnalyserNode) on first use, per
  // autoplay policy — Task 5 triggers the first enqueue() from a user
  // gesture, which is also when we resume() the context.
  function ensureContext(): { ctx: AudioContext; analyser: AnalyserNode } {
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(ctx.destination);
      nextStartTime = 0;
    }
    return { ctx, analyser: analyser as AnalyserNode };
  }

  function enqueue(pcmBase64: string): void {
    const { ctx: audioCtx, analyser: analyserNode } = ensureContext();
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }

    const int16 = base64ToInt16Array(pcmBase64);
    if (int16.length === 0) return;
    const float32 = int16ToFloat32(int16);

    const buffer = audioCtx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(analyserNode);
    src.onended = () => {
      liveSources.delete(src);
    };

    // Schedule gap-free: start no earlier than "now", and no earlier than
    // when the previous chunk finishes.
    const startAt = Math.max(audioCtx.currentTime, nextStartTime);
    src.start(startAt);
    nextStartTime = startAt + buffer.duration;

    liveSources.add(src);
  }

  function clear(): void {
    for (const src of liveSources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped/ended */
      }
      src.disconnect();
    }
    liveSources.clear();
    nextStartTime = ctx ? ctx.currentTime : 0;
  }

  async function resume(): Promise<void> {
    const { ctx: audioCtx } = ensureContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
  }

  async function close(): Promise<void> {
    clear();
    if (ctx) {
      await ctx.close();
      ctx = null;
      analyser = null;
      nextStartTime = 0;
    }
  }

  return {
    enqueue,
    clear,
    resume,
    // Accessing `analyser` lazily creates the (suspended, silent)
    // AudioContext if it doesn't exist yet — this does not itself start
    // playback and so doesn't run afoul of autoplay restrictions, but lets
    // callers (e.g. Task 5's visualizer) bind the node before the first
    // enqueue() happens.
    get analyser() {
      return ensureContext().analyser;
    },
    close,
  };
}
