import { describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  damoclesPitchStrip,
  readDamoclesPanel
} from '../src/damocles/pitchStrip.ts';

const panel = readDamoclesPanel(
  await Bun.file('../payload/damocles/panel.json').json()
);
const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
const strip = damoclesPitchStrip(panel, doc.orientation);

/// The window as the gauge shows it, `#` for ink, `s` sky, `g` ground.
const window = (degrees: number): string[] =>
  strip.rows
    .slice(strip.row(degrees), strip.row(degrees) + 20)
    .map(([sky, ground]) =>
      Array.from(sky.slice(0, 11))
        .map((bit, x) => (bit === '1' ? 's' : ground[x] === '1' ? 'g' : '#'))
        .join('')
    );

describe('the Damocles pitch strip (#716)', () => {
  test('is the strip Mercenary III draws, row for row', async () => {
    const dion = (await Bun.file('../payload/dion/panel.json').json()) as {
      fields: { pitch: { strip: { rows: [string, string][] } } };
    };
    expect(panel.strip).toEqual(dion.fields.pitch.strip.rows);
  });

  test('takes rows (pitch & $3F0) >> 4 of the camera word, level at $0200', () => {
    expect(strip.row(0)).toBe(32);
    // The nose going down raises the word, and the scale scrolls up.
    expect(strip.row(-45)).toBe(40);
    expect(strip.row(-90)).toBe(48);
    expect(strip.row(45)).toBe(24);
    // A half turn wraps to the strip's first row.
    expect(strip.row(180)).toBe(0);
    // Sixteen units a row: a step under one row does not move it.
    expect(strip.row(-5)).toBe(32);
  });

  test('shows -0- across the middle level, sky above and ground below', () => {
    const level = window(0);
    expect(level[10]).toBe('###g#g#g###');
    expect(level[0]).toBe('sssssssssss');
    expect(level[19]).toBe('ggggggggggg');
  });

  test('pitched down 45°, shows 0 at the top and 90 at the bottom', () => {
    const down = window(-45);
    // The 0 mark's middle row, then the 90's.
    expect(down[2]).toBe('###g#g#g###');
    expect(down[18]).toBe('#g###g#g#g#');
  });
});
