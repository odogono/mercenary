import { expect, test } from 'bun:test';

import { decodeWav, encodeWav } from '../tools/wav.ts';

test('a WAV the tools write reads back as the samples, clipped to 16 bits', () => {
  const samples = Float32Array.from([0, 0.5, -0.5, 1.5, -1.5]);
  const bytes = encodeWav(samples, 48_000);
  const view = new DataView(bytes.buffer);
  expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RIFF');
  expect(view.getUint32(24, true)).toBe(48_000);
  expect(view.getUint32(28, true)).toBe(96_000);
  const decoded = Array.from(decodeWav(bytes));
  expect(decoded).toHaveLength(5);
  [0, 0.5, -0.5, 1, -1].forEach((expected, index) =>
    expect(decoded[index]!).toBeCloseTo(expected, 3)
  );
});
