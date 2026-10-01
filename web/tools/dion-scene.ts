import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { frameRgba, planDionFrame } from '../src/dion/frame.ts';
import { readDionWorldBody } from '../src/dion/world.ts';
import { decodePng, encodePng } from './png.ts';

/// Draw a captured Mercenary III scene with the browser planner and compare it with
/// the original's screenshot of the same state (#682). The scene document comes from
/// `python3 -m m3lab.scene`; both it and the screenshot are Restricted Material, so
/// only runs under the ignored `restricted/` root are read. Writes original | planner
/// | difference beside the scene and prints the agreement.

const root = resolve(import.meta.dir, '../..');
const restricted = await realpath(join(root, 'restricted'));
const scenePath = await realpath(process.argv[2] ?? '');
const inside = relative(restricted, scenePath);
if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
  throw new Error('Select a scene.json under restricted/');
}
const document = await Bun.file(scenePath).json();
const payload = await Bun.file(join(root, 'payload/dion/world.json')).json();
// The sky Body inventory is a separate extractor; METIS's stands in for the stars.
document.sky ??= payload.sky;
const world = readDionWorldBody(document, payload.source);
const scene = document.scene;
const shot = decodePng(
  new Uint8Array(await Bun.file(scene.screenshot).arrayBuffer())
);

// Hatari's cropped screenshot puts the 320×200 screen at (96, 58), doubled.
const original = (x: number, y: number): readonly [number, number, number] => {
  const at = ((58 + 2 * y) * shot.width + 96 + 2 * x) * 3;
  return [shot.pixels[at]!, shot.pixels[at + 1]!, shot.pixels[at + 2]!];
};
const gun = (value: number): number => Math.round((value * 7) / 255);
const st = (word: number): string =>
  [(word >> 8) & 7, (word >> 4) & 7, word & 7].join();
const sky = original(1, 1).map(gun).join();
const day = sky === st(scene.skyDay) || sky !== st(scene.skyNight);

const residents = new Map<
  number,
  { position: [number, number, number]; yaw: number }
>();
for (const resident of document.residents) {
  residents.set(resident.slot, {
    position: resident.position,
    yaw: resident.yaw
  });
}
const planned = planDionFrame(world, {
  cell: scene.cell,
  day,
  doors: new Map(),
  driverProfile: false,
  eye: scene.eye,
  frameCounter: scene.frameCounter,
  heading: scene.heading,
  passenger: null,
  pitch: scene.pitch,
  region: scene.region,
  residents,
  roll: scene.roll,
  signCode: scene.signCode
});
const rgba = new Uint8ClampedArray(320 * 136 * 4);
frameRgba(planned, rgba);

const sheet = new Uint8Array(960 * 136 * 3);
let same = 0;
for (let y = 0; y < 136; y += 1) {
  for (let x = 0; x < 320; x += 1) {
    const a = original(x, y);
    const b = [
      rgba[(y * 320 + x) * 4]!,
      rgba[(y * 320 + x) * 4 + 1]!,
      rgba[(y * 320 + x) * 4 + 2]!
    ];
    const agrees = a.every((value, index) => gun(value) === gun(b[index]!));
    same += agrees ? 1 : 0;
    sheet.set(a, (y * 960 + x) * 3);
    sheet.set(b, (y * 960 + 320 + x) * 3);
    sheet.set(agrees ? [0, 0, 0] : [255, 0, 255], (y * 960 + 640 + x) * 3);
  }
}
await Bun.write(
  join(dirname(scenePath), 'comparison.png'),
  encodePng({ height: 136, pixels: sheet, width: 960 })
);
const result = JSON.stringify({
  agreement: same / (320 * 136),
  cell: scene.cell,
  day,
  gaps: planned.stats.gaps,
  group: scene.group,
  pixels: same
});
await Bun.write(join(dirname(scenePath), 'comparison.json'), result + '\n');
process.stdout.write(result + '\n');
