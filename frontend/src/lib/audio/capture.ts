/**
 * Microphone capture: records mono audio at 16 kHz, converts it to 16-bit
 * PCM in an AudioWorklet, and emits base64-encoded chunks — the exact
 * format Gemini Live expects for its input stream
 * (`mimeType: 'audio/pcm;rate=16000'`).
 *
 * Also exposes an AnalyserNode fed from the raw mic signal so a visualizer
 * can read input amplitude (Task 5).
 */

import { int16BufferToBase64 } from './pcm';

const WORKLET_URL = '/audio-worklet/pcm-capture-worklet.js';
const WORKLET_NAME = 'pcm-capture';

export interface MicCapture {
  start(): Promise<void>;
  stop(): void;
  readonly analyser: AnalyserNode;
  readonly active: boolean;
}

export function createMicCapture(onChunk: (pcmBase64: string) => void): MicCapture {
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let active = false;

  // Created eagerly (starts 'suspended' until start() resumes it) so
  // `analyser` is available to callers immediately, and so it lives in the
  // same 16kHz AudioContext as the mic source for the lifetime of this
  // MicCapture — nodes can only connect to other nodes in the same context,
  // so the context is never closed/replaced here. Actual mic hardware
  // release (the OS indicator) is handled by stopping the MediaStreamTrack
  // in stop(), independent of the AudioContext's lifecycle.
  const ctx = new AudioContext({ sampleRate: 16000 });
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;

  async function start(): Promise<void> {
    if (active) return;

    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    try {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      await ctx.resume();

      source = ctx.createMediaStreamSource(stream);
      workletNode = new AudioWorkletNode(ctx, WORKLET_NAME);
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        onChunk(int16BufferToBase64(event.data));
      };

      source.connect(workletNode);
      source.connect(analyser);

      active = true;
    } catch (err) {
      // Don't leak the mic if setup fails after getUserMedia succeeded.
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      throw err;
    }
  }

  function stop(): void {
    if (workletNode) {
      workletNode.port.onmessage = null;
      workletNode.disconnect();
      workletNode = null;
    }
    if (source) {
      source.disconnect();
      source = null;
    }
    if (stream) {
      // This is what actually releases the OS mic indicator/hardware.
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (ctx.state !== 'closed') {
      void ctx.suspend();
    }
    active = false;
  }

  return {
    start,
    stop,
    analyser,
    get active() {
      return active;
    },
  };
}
