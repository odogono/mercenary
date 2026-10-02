import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { loadDionCatalogue } from '../src/dion/catalogue.ts';
import { frameRgba } from '../src/dion/frame.ts';
import { readSelection } from '../src/dionCatalogue/inspection.ts';
import {
  preparePreview,
  readRenderSupport,
  supportPath,
  type PreviewPose
} from '../src/dionCatalogue/preview.ts';
import {
  renderAuthentic,
  rgbaFromIndexed
} from '../src/rendering/authentic.ts';
import { encodePng } from './png.ts';

// Original captures remain ignored. The compared renderer is the Catalogue's
// preview composition, loading only validated Catalogue documents and geometry.
const root = resolve(import.meta.dir, '../..');
const restricted = await realpath(join(root, 'restricted'));
const safe = async (path: string) => {
  const real = await realpath(path);
  const local = relative(restricted, real);
  if (!local || local.startsWith('..') || isAbsolute(local)) {
    throw new Error('Evidence must be under restricted/');
  }
  return real;
};
const input = await safe(
  process.argv[2] ?? join(restricted, 'mercenary-iii-686/scenes.json')
);
const document = await Bun.file(input).json();
const read = (path: string): Promise<unknown> =>
  Bun.file(join(root, path)).json();
const store = await loadDionCatalogue(read);
if (document.kind !== 'dion-catalogue-scenes' || document.schemaVersion !== 1) {
  throw new Error('Unsupported Catalogue scene evidence');
}
if (
  Object.entries(store.catalogue.source).some(
    ([key, value]) => document.source?.[key] !== value
  )
) {
  throw new Error('scene source differs from the Catalogue');
}
const support = readRenderSupport(await read(supportPath), store.catalogue);
const gun = (v: number) => Math.round((v * 7) / 255);
const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray, at: number) =>
  [0, 1, 2].some(i => gun(a[at + i]!) !== gun(b[at + i]!));
const results = [];
for (const scene of document.cases) {
  if (!/^[\da-z]+(?:-[\da-z]+)*$/.test(scene.id)) {
    throw new Error('Invalid scene identity');
  }
  const selection = readSelection(
    new URLSearchParams(
      Object.entries(scene.selection).map(([k, v]) => [k, String(v)])
    )
  );
  const preview = await preparePreview(
    store,
    support,
    selection,
    scene.context ?? undefined
  );
  const pose = {
    ...scene.pose,
    ...(scene.pose.doors ? { doors: new Map(scene.pose.doors) } : {}),
    ...(scene.pose.residents
      ? { residents: new Map(scene.pose.residents) }
      : {})
  } as PreviewPose;
  const frame = preview.planAt(pose);
  const rgba = new Uint8ClampedArray(320 * 136 * 4);
  frameRgba(frame, rgba);
  const without = new Uint8ClampedArray(rgba.length);
  const box = { x0: 320, x1: -1, y0: 136, y1: -1 };
  if (scene.context) {
    const bare = {
      ...frame.description,
      primitives: frame.description.primitives.filter(
        p => !p.source.startsWith('resident:')
      )
    };
    rgbaFromIndexed(bare, renderAuthentic(bare), without);
    for (let y = 0; y < 136; y += 1) {
      for (let x = 0; x < 320; x += 1) {
        if (differs(rgba, without, (y * 320 + x) * 4)) {
          box.x0 = Math.min(box.x0, x - 2);
          box.x1 = Math.max(box.x1, x + 2);
          box.y0 = Math.min(box.y0, y - 2);
          box.y1 = Math.max(box.y1, y + 2);
        }
      }
    }
  }
  const ram = new Uint8Array(
    await Bun.file(await safe(scene.ram)).arrayBuffer()
  );
  if (createHash('sha256').update(ram).digest('hex') !== scene.ramSha256) {
    throw new Error(`${scene.id}: original RAM hash differs`);
  }
  const memory = new DataView(ram.buffer, ram.byteOffset, ram.byteLength);
  // At loop top, $42C01 names the frame drawn from the captured pose. A PNG
  // shows the previous buffer. Read ST bitplanes and the frame's palette shadow.
  const base = (ram[0x4_2c_01]! << 16) | 0x80_00;
  const palette = memory.getUint32(0x72_b0);
  const horizon = memory.getUint16(0x72_98);
  const sheet = new Uint8Array(960 * 136 * 3);
  let same = 0;
  let objectPixels = 0,
    objectSame = 0;
  for (let y = 0; y < 136; y += 1) {
    for (let x = 0; x < 320; x += 1) {
      const at = (y * 320 + x) * 4;
      const address = base + y * 160 + Math.floor(x / 16) * 8;
      let index = 0;
      for (let plane = 0; plane < 4; plane += 1) {
        index |=
          ((memory.getUint16(address + plane * 2) >> (15 - (x % 16))) & 1) <<
          plane;
      }
      const colour =
        memory.getUint16(
          index === 8 && y >= horizon ? 0x73_28 : palette + 2 * index
        ) & 0x7_77;
      const a = [8, 4, 0].map(shift =>
        Math.round((((colour >> shift) & 7) * 255) / 7)
      );
      const b = Array.from(rgba.subarray(at, at + 3));
      const agrees = a.every((v, i) => gun(v) === gun(b[i]!));
      same += Number(agrees);
      if (
        scene.context &&
        x >= box.x0 &&
        x <= box.x1 &&
        y >= box.y0 &&
        y <= box.y1 &&
        (differs(rgba, without, at) ||
          a.some((v, i) => gun(v) !== gun(without[at + i]!)))
      ) {
        objectPixels += 1;
        objectSame += Number(agrees);
      }
      sheet.set(a, (y * 960 + x) * 3);
      sheet.set(b, (y * 960 + 320 + x) * 3);
      sheet.set(agrees ? [0, 0, 0] : [255, 0, 255], (y * 960 + 640 + x) * 3);
    }
  }
  const output = join(restricted, 'mercenary-iii-686', scene.id + '.png');
  await Bun.write(
    output,
    encodePng({ height: 136, pixels: sheet, width: 960 })
  );
  const row = {
    agreement: same / (320 * 136),
    gaps: frame.stats.gaps,
    id: scene.id,
    models: frame.stats.models,
    ...(scene.context
      ? {
          objectAgreement: objectPixels ? objectSame / objectPixels : null,
          objectPixels
        }
      : {}),
    primitives: frame.description.primitives.length,
    ramSha256: scene.ramSha256,
    run: scene.run,
    selection: scene.selection
  };
  results.push(row);
  process.stdout.write(
    `${row.id}: ${(row.agreement * 100).toFixed(2)}% · ${row.primitives} primitives · ${row.gaps.filter((g: string) => !g.includes('sky Body')).join(';')}\n`
  );
}
await Bun.write(
  join(restricted, 'mercenary-iii-686/comparisons.json'),
  JSON.stringify({ results, source: store.catalogue.source }, null, 2) + '\n'
);
