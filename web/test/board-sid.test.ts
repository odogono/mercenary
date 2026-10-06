import { describe, expect, test } from 'bun:test';

import { BoardSid } from '../src/soundboard/boardSid.ts';

const CLOCK = 985_248;
const RATE = 48_000;
const word = (hertz: number): number => Math.round((hertz * 2 ** 24) / CLOCK);

/// A voice-1 note at `hertz` with `control`, held with full sustain, after `setup`.
const note = (
  hertz: number,
  control: number,
  setup: readonly (readonly [number, number])[] = []
): BoardSid => {
  const sid = new BoardSid(CLOCK, RATE);
  for (const [register, value] of [
    [0, word(hertz) & 0xff],
    [1, word(hertz) >> 8],
    [2, 0x00],
    [3, 0x08],
    [5, 0x00],
    [6, 0xf0],
    [24, 0x0f],
    ...setup,
    [4, control]
  ] as const) {
    sid.write(register, value);
  }
  sid.render(RATE / 10);
  return sid;
};

const rms = (samples: Float32Array): number =>
  Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);

/// Rising zero crossings a second.
const pitch = (samples: Float32Array): number => {
  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index - 1]! < 0 && samples[index]! >= 0) {
      crossings += 1;
    }
  }
  return (crossings * RATE) / samples.length;
};

describe('the board SID', () => {
  test('sawtooth, triangle and pulse sound at their frequency', () => {
    for (const control of [0x21, 0x11, 0x41]) {
      expect(pitch(note(440, control).render(RATE))).toBeCloseTo(440, -1);
    }
  });

  test('the low-pass filter quietens a routed voice above its cutoff', () => {
    const open = rms(note(2000, 0x21).render(RATE / 4));
    const filtered = rms(
      note(2000, 0x21, [
        [21, 0],
        [22, 0x00],
        [23, 0x01],
        [24, 0x1f]
      ]).render(RATE / 4)
    );
    expect(filtered).toBeLessThan(open / 4);
  });

  test('a gate off releases the envelope to silence', () => {
    const sid = note(440, 0x21);
    sid.write(4, 0x20);
    sid.render(RATE / 2);
    expect(rms(sid.render(RATE / 10))).toBeLessThan(1e-3);
  });

  test('the volume nibble scales the output', () => {
    const full = rms(note(440, 0x21).render(RATE / 4));
    const half = rms(note(440, 0x21, [[24, 0x07]]).render(RATE / 4));
    expect(half / full).toBeCloseTo(7 / 15, 1);
  });
});
