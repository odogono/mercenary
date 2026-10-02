import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { CatalogueGeometry } from '../src/dion/catalogue.ts';
import {
  frameRgba,
  planDionFrame,
  type DionFrameState
} from '../src/dion/frame.ts';
import { playableModel } from '../src/dion/modelForms.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { tourcraftFrameWorld } from '../src/dion/tourcraftFrame.ts';
import { tourcraftStars } from '../src/dion/tourcraftSky.ts';
import type { DionResident } from '../src/dion/world.ts';
import { encodePng } from './png.ts';

/// R7 RAM and scene metadata are restricted evidence, never runtime geometry.
/// Usage: bun tools/dion-tourcraft-compare.ts <R7 root> <restricted output> [expected.json]
const [evidence, output, expected] = process.argv.slice(2);
if (
  !evidence ||
  !output ||
  !resolve(evidence).includes(`${sep}restricted${sep}`) ||
  !resolve(output).includes(`${sep}restricted${sep}`)
) {
  throw new Error('Require restricted evidence and output directories');
}
const root = resolve(import.meta.dir, '../..');
const content = await loadTourcraftContent(async path => {
  if (path.includes('/catalogue/')) {
    throw new Error('runtime Catalogue read');
  }
  const text = readFileSync(join(root, path), 'utf8');
  return { text, value: JSON.parse(text) };
});
mkdirSync(output, { recursive: true });
const hash = (v: Uint8Array | Uint8ClampedArray) =>
  createHash('sha256').update(v).digest('hex');
const paths = JSON.parse(
  readFileSync(join(evidence, 'views/inputs.json'), 'utf8')
) as string[];
const results = [];
for (const path of paths) {
  const name = basename(path, '.json');
  const sceneBytes = readFileSync(join(evidence, 'views', `${name}.json`));
  const captured = JSON.parse(sceneBytes.toString()) as {
    residents: DionResident[];
    scene: Omit<DionFrameState, 'doors' | 'residents'> & {
      body: number;
      group: number;
      ram: string;
      ramSha256: string;
      selector: number;
    };
  };
  const s = captured.scene;
  const rel = s.ram.split('mercenary-iii-708/')[1];
  if (!rel || rel.includes('..')) {
    throw new Error('invalid capture reference');
  }
  const ram = readFileSync(join(evidence, rel));
  if (hash(ram) !== s.ramSha256) {
    throw new Error(`${name}: RAM digest mismatch`);
  }
  const space = s.selector === 2;
  const world = tourcraftFrameWorld(content, s.body === 100 ? 23 : 3);
  const models = new Map(world.models);
  const colours = Array.from({ length: 60 }, (_, i) =>
    ram.readUInt16BE(0x2_ea_40 + 2 * i)
  );
  const table = ram.readUInt32BE(0x4_bd_10);
  for (const slot of models.keys()) {
    const record = table + ram.readUInt16BE(table + 2 * slot);
    const g = [...content.geometry.values()].find(
      g =>
        g.family === 'model' &&
        Number.parseInt(g.record.slice(1), 16) === record
    );
    if (!g) {
      throw new Error(`${name}: model ${slot} references unadmitted record`);
    }
    const prefix = g.variants['state=lamp-lit;form=default']
      ? `state=lamp-${((s.frameCounter + (world.blinkPhase.get(slot) ?? 0)) & 4) === 0 ? 'lit' : 'dark'};`
      : g.variants['form=default']
        ? ''
        : 'state=intact;';
    models.set(
      slot,
      playableModel(g as CatalogueGeometry, slot, colours, prefix)
    );
  }
  const roll = ram.readUInt16BE(0x71_32),
    pitch = ram.readUInt16BE(0x71_34),
    yaw = ram.readUInt16BE(0x71_36);
  const state: DionFrameState = {
    ...s,
    articulationAngle: ram.readUInt16BE(0x6f_38),
    beaconGates: new Map([
      [4, (ram[0x64_c2]! & 0x80) !== 0],
      [5, (ram[0x64_be]! & 0x80) !== 0]
    ]),
    cameraAngles: { pitch, roll, yaw },
    doors: new Map(),
    pilotHead: 279,
    residents: new Map(
      captured.residents.map(r => [
        r.slot,
        { position: r.position, yaw: r.yaw }
      ])
    ),
    skyView: {
      body: space ? null : s.body,
      clipRow: ram.readUInt16BE(0x4_2c_74),
      day: s.day,
      latitude: ram.readUInt16BE(0x4_2c_70),
      longitude: ram.readUInt16BE(0x4_2c_6c),
      pitch,
      roll,
      routine: space ? 'space' : s.selector === 0 ? 'flight' : 'onFoot',
      systemEye: [
        ram.readInt32BE(0x70_2a),
        ram.readInt32BE(0x70_2e),
        ram.readInt32BE(0x70_32)
      ],
      yaw
    },
    tokens: new Map(
      [0xa1, 0xa5].map((token, i) => {
        const word = ram.readUInt16BE(i === 0 ? 0xb4_fa : 0xb6_02);
        return [token, [word >>> 8, word & 255].filter(code => code !== 0)];
      })
    )
  };
  const liveWorld = {
    ...world,
    framePalette: {
      ...world.framePalette,
      fixed: space
        ? new Map([
            [13, 0x3_33],
            [14, 0x4_11],
            [15, 0x7_77]
          ])
        : world.framePalette.fixed,
      horizonRow: ram.readUInt16BE(0x72_98)
    },
    modelColours: colours,
    models,
    residents: captured.residents
  };
  const f = planDionFrame(liveWorld, state);
  const rgba = new Uint8ClampedArray(320 * 136 * 4);
  frameRgba(f, rgba);
  const base = ram.readUInt32BE(0x4_2c_00);
  const palette = ram.readUInt32BE(0x72_b0),
    horizon = ram.readUInt16BE(0x72_98);
  const sheet = new Uint8Array(960 * 136 * 3);
  const stars = tourcraftStars(world.sky, content.arithmetic, state.skyView!);
  const exposed = new Map(
    stars
      .filter(([x, y]) => (x < 64 || x >= 256) && y < 40)
      .map(([x, y, word]) => [`${x}:${y}`, word])
  );
  let starMatches = 0;
  let agreement = 0;
  for (let y = 0; y < 136; y++) {
    for (let x = 0; x < 320; x++) {
      const at = base + y * 160 + Math.floor(x / 16) * 8;
      let index = 0;
      for (let plane = 0; plane < 4; plane++) {
        index |=
          ((ram.readUInt16BE(at + plane * 2) >> (15 - (x % 16))) & 1) << plane;
      }
      const word =
        (!space && index === 8 && y >= horizon
          ? ram.readUInt16BE(0x73_28)
          : ram.readUInt16BE(palette + 2 * index)) & 0x7_77;
      if (exposed.get(`${x}:${y}`) === word) {
        starMatches += 1;
      }
      const a = [(word >> 8) & 7, (word >> 4) & 7, word & 7].map(v =>
        Math.round((v * 255) / 7)
      );
      const b = rgba.slice((y * 320 + x) * 4, (y * 320 + x) * 4 + 3);
      const equal = a.every(
        (v, i) => Math.round((v * 7) / 255) === Math.round((b[i]! * 7) / 255)
      );
      agreement += +equal;
      sheet.set(a, (y * 960 + x) * 3);
      sheet.set(b, (y * 960 + 320 + x) * 3);
      sheet.set(equal ? [0, 0, 0] : [255, 0, 255], (y * 960 + 640 + x) * 3);
    }
  }
  const png = encodePng({ height: 136, pixels: sheet, width: 960 });
  writeFileSync(join(output, `${name}.png`), png);
  results.push({
    agreement,
    body: s.body,
    cell: s.cell,
    comparison: ['f139', 'f140', 'f461', 'f462', 'f463'].includes(name)
      ? 'transition-state-only'
      : 'settled-draw',
    contentSha256: content.contentSha256,
    exposedStars: exposed.size,
    frame: s.frameCounter + 1,
    group: s.group,
    indexedSha256: hash(f.frame.pixels),
    name,
    ramSha256: s.ramSha256,
    rgbaSha256: hash(rgba),
    sceneSha256: hash(sceneBytes),
    selector: s.selector,
    sheetSha256: hash(png),
    starMatches,
    stats: f.stats,
    total: 43_520
  });
  process.stdout.write(
    `${name}: ${((agreement / 43_520) * 100).toFixed(2)}% ${f.stats.gaps.join('; ')}\n`
  );
}
if (
  expected &&
  !isDeepStrictEqual(JSON.parse(readFileSync(expected, 'utf8')), results)
) {
  throw new Error('Comparison output changed');
}
writeFileSync(
  join(output, 'comparison.json'),
  JSON.stringify(results, null, 2) + '\n'
);
