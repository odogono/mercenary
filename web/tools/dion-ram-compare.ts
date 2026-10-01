import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  frameRgba,
  planDionFrame,
  type DionFrameState
} from '../src/dion/frame.ts';
import { dionContent } from '../test/dion-documents.ts';

/// Reproduce #647's eleven loop-top RAM comparisons, then preserve their exact output for #672.
/// Inputs and generated images belong under restricted/, never in the payload or test fixtures.
/// Usage: bun tools/dion-ram-compare.ts <capture-dir> <states.json> <output-dir> [before.json]
const [captures, statesPath, output, beforePath] = process.argv.slice(2);
if (!captures || !statesPath || !output) {
  throw new Error(
    'Expected capture directory, states.json and restricted output directory'
  );
}
const states = JSON.parse(readFileSync(statesPath, 'utf8')) as Record<
  string,
  Omit<DionFrameState, 'doors' | 'residents' | 'pitch' | 'roll'> & {
    latch: string;
    residents: Record<
      string,
      { position: readonly [number, number, number]; yaw: number }
    >;
  }
>;
const content = await dionContent();
mkdirSync(output, { recursive: true });
const hash = (bytes: Uint8Array | Uint8ClampedArray) =>
  createHash('sha256').update(bytes).digest('hex');
const checkpoints = [];
for (const [name, state] of Object.entries(states)) {
  const ram = readFileSync(join(captures, `${name}.ram`));
  const planned = planDionFrame(content.world, {
    ...state,
    // The old scratch adapter predates these required fields. Read the live words (#647).
    doors: new Map(
      state.cell === 98 && state.latch === '0x42ff'
        ? [[0x2_54, { openUnits: 142 }]]
        : []
    ),
    pitch: ram.readInt16BE(0x71_54),
    residents: new Map(
      Object.entries(state.residents).map(([slot, pose]) => [
        Number(slot),
        pose
      ])
    ),
    roll: ram.readInt16BE(0x71_52)
  });
  const rgba = new Uint8ClampedArray(320 * 136 * 4);
  frameRgba(planned, rgba);
  const rgb = new Uint8Array(320 * 136 * 3);
  const base = (ram[0x4_2c_01]! << 16) | 0x80_00;
  const palette = ram.readUInt32BE(0x72_b0);
  let agreement = 0;
  for (let y = 0; y < 136; y += 1) {
    for (let x = 0; x < 320; x += 1) {
      const pixel = y * 320 + x;
      const at = base + y * 160 + Math.floor(x / 16) * 8;
      const bit = 15 - (x % 16);
      let index = 0;
      for (let plane = 0; plane < 4; plane += 1) {
        index |= ((ram.readUInt16BE(at + plane * 2) >> bit) & 1) << plane;
      }
      const original =
        (index === 8 && y >= ram.readUInt16BE(0x72_98)
          ? ram.readUInt16BE(0x73_28)
          : ram.readUInt16BE(palette + index * 2)) & 0x7_77;
      const channels = [
        rgba[pixel * 4]!,
        rgba[pixel * 4 + 1]!,
        rgba[pixel * 4 + 2]!
      ];
      rgb.set(channels, pixel * 3);
      const rendered =
        (Math.round((channels[0]! * 7) / 255) << 8) |
        (Math.round((channels[1]! * 7) / 255) << 4) |
        Math.round((channels[2]! * 7) / 255);
      if (original === rendered) {
        agreement += 1;
      }
    }
  }
  writeFileSync(
    join(output, `${name}.ppm`),
    Buffer.concat([Buffer.from('P6\n320 136\n255\n'), rgb])
  );
  checkpoints.push({
    agreement,
    candidate: planned.candidate,
    horizonRow: planned.horizonRow,
    indexed: hash(planned.frame.pixels),
    land: planned.land,
    name,
    palette: planned.palette,
    ramSha256: hash(ram),
    rgba: hash(rgba),
    stats: planned.stats,
    total: 320 * 136
  });
  process.stdout.write(
    `${name}: ${((agreement / (320 * 136)) * 100).toFixed(2)}%\n`
  );
}
if (
  beforePath &&
  !isDeepStrictEqual(JSON.parse(readFileSync(beforePath, 'utf8')), checkpoints)
) {
  throw new Error(
    'RAM comparison output differs from the captured before-refactor output'
  );
}
writeFileSync(
  join(output, 'comparison.json'),
  JSON.stringify(checkpoints, null, 2) + '\n'
);
process.stdout.write(
  `mean: ${((checkpoints.reduce((sum, item) => sum + item.agreement / item.total, 0) / checkpoints.length) * 100).toFixed(2)}%\n`
);
