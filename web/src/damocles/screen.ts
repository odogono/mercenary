import { FLOATS_PER_VERTEX, type ErisFramePlan } from './frame.ts';
import type { DamoclesScreen } from './session.ts';

/// The TOLOSA encounter's screen effects on a planned frame (#581, ADR 0055).
///
/// Every colour the plan carries is an ST palette word scaled over its range, a channel's three
/// bits `v` as `v / 7`. The VBL handler's flash paints the view's palette white (`$051D7C`), and
/// each step of the death sequence's fade takes one level off every component, stopping at 0
/// (`$050FB8`–`$050FF0`). Both are exact in that space. The zap's noise loop writes the hardware
/// palette directly and is painted over the view instead (`noiseBands`).

const level = (channel: number): number => Math.round(channel * 7);
const channel = (value: number): number => Math.round((value * 255) / 7) / 255;

const recolour = (
  vertices: Float32Array,
  paint: (value: number) => number
): Float32Array => {
  const out = new Float32Array(vertices);
  for (let offset = 3; offset < out.length; offset += FLOATS_PER_VERTEX) {
    out[offset] = paint(out[offset]!);
    out[offset + 1] = paint(out[offset + 1]!);
    out[offset + 2] = paint(out[offset + 2]!);
  }
  return out;
};

export const presentScreen = (
  plan: ErisFramePlan,
  screen: DamoclesScreen
): ErisFramePlan => {
  if (!screen.white && screen.fade === 0) {
    return plan;
  }
  const paint = screen.white
    ? () => 1
    : (value: number) => channel(Math.max(0, level(value) - screen.fade));
  return {
    ...plan,
    clear: [paint(plan.clear[0]), paint(plan.clear[1]), paint(plan.clear[2])],
    horizonIslandVertices: recolour(plan.horizonIslandVertices, paint),
    horizonVertices: recolour(plan.horizonVertices, paint),
    skyVertices: recolour(plan.skyVertices, paint),
    vertices: recolour(plan.vertices, paint)
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
