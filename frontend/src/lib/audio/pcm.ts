/**
 * Shared helpers for converting between base64 and raw 16-bit PCM buffers.
 * Used by both capture (encode) and playback (decode).
 */

// btoa/String.fromCharCode blow the call stack on large arrays if passed
// in one shot, so encode in fixed-size chunks.
const BASE64_CHUNK_SIZE = 0x8000; // 32768 bytes per chunk

export function int16BufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToInt16Array(base64: string): Int16Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  // Int16Array view assumes little-endian, which matches both the worklet's
  // native-endian Int16Array (little-endian on all browser platforms) and
  // Gemini Live's documented little-endian PCM output.
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

export function int16ToFloat32(int16: Int16Array<ArrayBufferLike>): Float32Array<ArrayBuffer> {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}
