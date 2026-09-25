/// Mono 16-bit PCM WAV, as the sound tools write and read it (#513).

export const encodeWav = (
  samples: Float32Array,
  sampleRate: number
): Uint8Array => {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const label = (offset: number, text: string): void => {
    bytes.set(new TextEncoder().encode(text), offset);
  };
  label(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  label(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (const [index, sample] of samples.entries()) {
    view.setInt16(
      44 + index * 2,
      Math.round(Math.max(-1, Math.min(1, sample)) * 32_767),
      true
    );
  }
  return bytes;
};

/// The samples of a WAV's `data` chunk, read as mono 16-bit PCM.
export const decodeWav = (bytes: Uint8Array): Float32Array => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    if (offset + 8 + length > bytes.length) {
      throw new Error('Truncated WAV');
    }
    if (tag === 'data') {
      return Float32Array.from(
        { length: length / 2 },
        (_, index) => view.getInt16(offset + 8 + index * 2, true) / 32_768
      );
    }
    offset += 8 + length + (length % 2);
  }
  throw new Error('Missing PCM data');
};
