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
  /** Mute: releases the mic hardware, keeps the AudioContext so start() can resume. */
  stop(): void;
  /** Full teardown: stop() + close the AudioContext. This MicCapture is dead after. */
  close(): Promise<void>;
  readonly analyser: AnalyserNode;
  readonly active: boolean;
}

export function createMicCapture(onChunk: (pcmBase64: string) => void): MicCapture {
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let active = false;
  let closed = false;

  // Created eagerly (starts 'suspended' until start() resumes it) so
  // `analyser` is available to callers immediately, and so it lives in the
  // same 16kHz AudioContext as the mic source for the lifetime of this
  // MicCapture — nodes can only connect to other nodes in the same context,
  // so the context is never replaced here; it is only closed by close(), at
  // which point this MicCapture is done. Actual mic hardware release (the OS
  // indicator) is handled by stopping the MediaStreamTrack in stop(),
  // independent of the AudioContext's lifecycle.
  const ctx = new AudioContext({ sampleRate: 16000 });
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;

  async function start(): Promise<void> {
    if (closed) throw new Error('MicCapture is closed');
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

  // Browsers cap the number of AudioContexts per document (~6), so a session
  // that only suspend()s leaks one context per session and eventually makes
  // `new AudioContext()` throw. Call this on teardown, never on mute.
  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    stop();
    if (ctx.state !== 'closed') {
      try {
        await ctx.close();
      } catch {
        /* already closed / closing */
      }
    }
  }

  return {
    start,
    stop,
    close,
    analyser,
    get active() {
      return active;
    },
  };
}
