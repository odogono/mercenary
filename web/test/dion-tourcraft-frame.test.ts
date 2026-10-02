import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';

import { openingFrameState, planDionFrame } from '../src/dion/frame.ts';
import { generalCamera, toCamera } from '../src/dion/raster.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  tourcraftFrameWorld,
  tourcraftOpeningFrameState
} from '../src/dion/tourcraftFrame.ts';

const sine = (a: number) => Math.sin((((a & 1023) + 0.5) * 2 * Math.PI) / 1024);
const cosine = (a: number) => sine(a + 256);

test('Dion general camera retains the recovered half-step pitch and roll matrix', () => {
  const camera = generalCamera([0, 0, 0], 0x17, 0x1_8f, 0x85);
  const at = toCamera(camera, 120, 30, -600);
  const [sr, cr, sp, cp, sy, cy] = [
    sine(0x17),
    cosine(0x17),
    sine(0x1_8f),
    cosine(0x1_8f),
    sine(0x85),
    cosine(0x85)
  ];
  expect(at.d).toBeCloseTo(cp * sy * 120 + sp * 30 - cp * cy * 600, 9);
  expect(at.u).toBeCloseTo(
    (sr * sp * sy + cr * cy) * 120 -
      sr * cp * 30 -
      (sr * sp * cy - cr * sy) * 600,
    9
  );
  expect(at.v).toBeCloseTo(
    (sr * cy - cr * sp * sy) * 120 +
      cr * cp * 30 +
      (cr * sp * cy + sr * sy) * 600,
    9
  );
});

const admitted = () =>
  loadTourcraftContent(async path => {
    if (path.includes('/catalogue/')) {
      throw new Error('unexpected Catalogue dependency');
    }
    const text = readFileSync(
      resolve(import.meta.dir, '../..', `.${path}`),
      'utf8'
    );
    return { text, value: JSON.parse(text) };
  });
test('promoted METIS and TOLOSA worlds cover every cell with their admitted geometry', async () => {
  const content = await admitted();
  for (const group of [3, 23] as const) {
    const world = tourcraftFrameWorld(content, group);
    expect(world.cells).toHaveLength(256);
    expect(world.models.has(279)).toBe(true);
    const state = openingFrameState(world);
    const frame = planDionFrame(world, state);
    expect(frame.description.projection.width).toBe(320);
    expect(
      frame.stats.gaps.some(g => g.includes('outside the exported slice'))
    ).toBe(false);
    expect(frame.stats.gaps.some(g => g.includes('sky Body inventory'))).toBe(
      false
    );
  }
});

test('expanded opening binds live face strings and beacon states rather than Catalogue observations', async () => {
  const content = await admitted();
  const state = tourcraftOpeningFrameState(content);
  expect(state.tokens!.get(0xa1)).toEqual([32]);
  expect(state.tokens!.get(0xa5)).toEqual([32]);
  const world = tourcraftFrameWorld(content, 3);
  expect(world.tourcraft!.beacons.get(165)!.dark.faces).not.toEqual(
    world.tourcraft!.beacons.get(165)!.lit.faces
  );
});

test('a distant promoted beacon draws its recovered lit point and vanishes in the dark phase', async () => {
  const content = await admitted();
  const world = tourcraftFrameWorld(content, 3);
  const opening = openingFrameState(world);
  const counter = (8 - world.blinkPhase.get(165)!) & 7;
  const state = {
    ...opening,
    frameCounter: counter,
    heading: 0,
    residents: new Map([
      [
        165,
        {
          position: [
            opening.eye[0],
            opening.eye[1],
            opening.eye[2] - 70_000
          ] as const,
          yaw: 0
        }
      ]
    ])
  };
  const isolated = {
    ...world,
    cells: [],
    drawList: { fixed: [165], templateTop: 255 }
  };
  const points = planDionFrame(isolated, state).description.primitives.filter(
    p => p.source === 'resident:165'
  );
  expect(points).toHaveLength(1);
  expect(points[0]!.kind).toBe('point');
  expect(
    planDionFrame(isolated, {
      ...state,
      frameCounter: counter + 4
    }).description.primitives.filter(p => p.source === 'resident:165')
  ).toHaveLength(0);
});

test('the promoted numbered TRANSPORTER writes its slot digit for inline lettering', async () => {
  const world = tourcraftFrameWorld(await admitted(), 3);
  const opening = openingFrameState(world);
  const state = {
    ...opening,
    heading: 0,
    residents: new Map([
      [
        67,
        { position: [opening.eye[0], 0, opening.eye[2] - 600] as const, yaw: 0 }
      ]
    ])
  };
  const isolated = {
    ...world,
    cells: [],
    drawList: { fixed: [67], templateTop: 255 }
  };
  const plain = {
    ...isolated,
    models: new Map([[67, { ...world.models.get(67)!, header: undefined }]])
  };
  const primitives = (frame: ReturnType<typeof planDionFrame>) =>
    frame.description.primitives.filter(p => p.source === 'resident:67');
  const expected = primitives(
    planDionFrame(plain, { ...state, tokens: new Map([[0x87, [51]]]) })
  );
  expect(expected.length).toBeGreaterThan(0);
  expect(primitives(planDionFrame(isolated, state))).toEqual(expected);
});
