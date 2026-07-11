// AudioWorkletProcessor that converts incoming Float32 mono audio into
// 16-bit signed PCM and posts it back to the main thread as transferable
// ArrayBuffers. Runs on the audio rendering thread — no imports allowed,
// so this file must stay dependency-free.
//
// Registered under the name 'pcm-capture'. The capture AudioContext is
// created at 16000 Hz (see src/lib/audio/capture.ts), so no resampling
// happens here — samples arriving in `process()` are already 16 kHz.

const CHUNK_SIZE_SAMPLES = 2048;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Int16Array(CHUNK_SIZE_SAMPLES);
    this._writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];

    if (channel && channel.length > 0) {
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]));
        this._buffer[this._writeIndex] = s < 0 ? s * 0x8000 : s * 0x7fff;
        this._writeIndex++;

        if (this._writeIndex === this._buffer.length) {
          this._flush();
        }
      }
    }

    // Returning true keeps the processor (and the node) alive.
    return true;
  }

  _flush() {
    if (this._writeIndex === 0) return;
    // Only transfer the samples actually written (matters for the final
    // partial chunk flushed on destroy, if we ever add that).
    const out = this._buffer.slice(0, this._writeIndex).buffer;
    this.port.postMessage(out, [out]);
    this._buffer = new Int16Array(CHUNK_SIZE_SAMPLES);
    this._writeIndex = 0;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
