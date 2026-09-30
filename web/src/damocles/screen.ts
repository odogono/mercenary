import { FLOATS_PER_VERTEX, type ErisFramePlan } from './frame.ts';
import type { DamoclesScreen } from './session.ts';

/// The TOLOSA encounter's screen effects on a planned frame (#581, ADR 0055).
///
/// Every colour the plan carries is an ST palette word scaled over its range, a channel's three
/// bits `v` as `v / 7`. The VBL handler's flash paints the view's colours 1 to 15 `$777` and
/// colour 0, the clear, black (`$051D7C`, #649). Each step of the death sequence's fade takes
/// one level off every component, stopping at 0 (`$050FB8`–`$050FF0`). Both are exact in that
/// space. The zap's noise loop writes the hardware palette directly and is painted over the view
/// instead (`noiseBands`).

const level = (channel: number): number => Math.round(channel * 7);
const channel = (value: number): number => Math.round((value * 255) / 7) / 255;

const recolourChannels = (
  vertices: Float32Array,
  [red, green, blue]: readonly [
    (value: number) => number,
    (value: number) => number,
    (value: number) => number
  ]
): Float32Array => {
  const out = new Float32Array(vertices);
  for (let offset = 3; offset < out.length; offset += FLOATS_PER_VERTEX) {
    out[offset] = red(out[offset]!);
    out[offset + 1] = green(out[offset + 1]!);
    out[offset + 2] = blue(out[offset + 2]!);
  }
  return out;
};

/// `$059948`: page 6's mask XORs each palette word's red, green and blue bits. The ST applies
/// it to colours 1 to 15 of the view's palette, and to colour 8 only its `$111` part while that
/// colour has none of `$666` set. The plan carries colours, not palette indices, so the port
/// applies the whole mask to every colour it draws, the clear included.
const masked = (value: number, bits: number): number =>
  channel(level(value) ^ bits);

export const presentScreen = (
  plan: ErisFramePlan,
  screen: DamoclesScreen
): ErisFramePlan => {
  if (!screen.white && screen.fade === 0 && screen.mask === 0) {
    return plan;
  }
  const bits = [
    (screen.mask >> 8) & 7,
    (screen.mask >> 4) & 7,
    screen.mask & 7
  ] as const;
  const faded = (value: number) =>
    channel(Math.max(0, level(value) - screen.fade));
  const paint = screen.white ? () => 1 : faded;
  const channelPaint = (index: 0 | 1 | 2) =>
    screen.mask === 0
      ? paint
      : (value: number) => paint(masked(value, bits[index]));
  const recolour3 = (vertices: Float32Array): Float32Array =>
    recolourChannels(vertices, [
      channelPaint(0),
      channelPaint(1),
      channelPaint(2)
    ]);
  return {
    ...plan,
    // `$051D74`: a flash paints colours 1 to 15 `$777` and colour 0, the clear, black.
    clear: screen.white
      ? [0, 0, 0]
      : [
          channelPaint(0)(plan.clear[0]),
          channelPaint(1)(plan.clear[1]),
          channelPaint(2)(plan.clear[2])
        ],
    horizonIslandVertices: recolour3(plan.horizonIslandVertices),
    horizonVertices: recolour3(plan.horizonVertices),
    skyVertices: recolour3(plan.skyVertices),
    vertices: recolour3(plan.vertices)
  };
};

/// Rows of the view the noise is painted in, as the ST's view is 136 lines high (`$87`).
export const NOISE_ROWS = 136;
/// Bands across a row. Authored: the original's look is the scene's pixels shown through a
/// palette rewritten fifteen colours at a time, many times a line, which the port does not model.
export const NOISE_BANDS = 40;

/// The colours the noise paints this tick, row by row, from the noise table's words as the loop
/// writes them to the palette (`$050EE6`): a word's low twelve bits are an ST colour. `tick`
/// walks the table so that successive ticks differ.
export const noiseBands = (
  words: Uint16Array,
  tick: number
): readonly (readonly string[])[] => {
  if (words.length === 0) {
    return [];
  }
  const rows: string[][] = [];
  let index = (tick * 997) % words.length;
  for (let row = 0; row < NOISE_ROWS; row += 1) {
    const bands: string[] = [];
    for (let band = 0; band < NOISE_BANDS; band += 1) {
      const word = words[index]! & 0x7_77;
      index = (index + 1) % words.length;
      bands.push(
        `#${[word >> 8, (word >> 4) & 7, word & 7]
          .map(bits =>
            Math.round((bits * 255) / 7)
              .toString(16)
              .padStart(2, '0')
          )
          .join('')}`
      );
    }
    rows.push(bands);
  }
  return rows;
};
