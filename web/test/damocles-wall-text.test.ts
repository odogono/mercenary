import { expect, test } from 'bun:test';

import type { Mesh, StructureSelection } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { FLOATS_PER_VERTEX, planErisFrame } from '../src/damocles/frame.ts';
import { structureMeshes } from '../src/damocles/selection.ts';
import type { ErisPlacement, ErisSurface } from '../src/damocles/world.ts';
import { ERIS_BODY } from './damocles-pose.ts';

const doc = readErisPresentation(
  await Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
);

// One wall in the XY plane, and a font-4 wall text riding on it: an 'I' stroke in its own
// font and a filled bar in the font-3 fallback.
const wall: Mesh = {
  faces: [
    {
      colour: '#ff0000',
      sourceColour: 0,
      sourceIndex: 0,
      vertices: [0, 1, 2, 3]
    }
  ],
  lines: [],
  vertices: [
    [-10, 0, 0],
    [10, 0, 0],
    [10, 20, 0],
    [-10, 20, 0]
  ]
};
const stroke: Mesh = {
  faces: [],
  lines: [{ colour: '#00ff00', sourceColour: 0, vertices: [0, 1] }],
  vertices: [
    [0, 5, 0],
    [0, 15, 0]
  ]
};
const bar: Mesh = {
  faces: [{ colour: '#0000ff', sourceColour: 0, vertices: [0, 1, 2, 3] }],
  lines: [],
  vertices: [
    [-1, 5, 0],
    [1, 5, 0],
    [1, 15, 0],
    [-1, 15, 0]
  ]
};
const structure: StructureSelection = {
  attachments: [],
  detailModel: 'detail',
  detailVariant: 'record',
  plan: wall,
  regions: [
    {
      bounds: [
        [-32_768, 32_767],
        [-32_768, 32_767]
      ],
      flags: 0,
      gate: 'none',
      queue: [{ index: 0, kind: 'face' }]
    }
  ],
  scale: [1, 1],
  wallTexts: [
    {
      face: { index: 0, kind: 'face' },
      fallback: { font: 3, mesh: bar, whileCarried: [49, 91] },
      font: 4,
      mesh: stroke,
      plane: 0,
      text: 'I'
    }
  ]
};
// Half a cell in, so the eye stands in its cell's central half and the structure binds.
const HALF = 32_768;
const placement: ErisPlacement = {
  faceCount: 1,
  heading: 0,
  id: 'test',
  keyBase: null,
  kind: 'object',
  mesh: undefined,
  modelId: 'model',
  name: 'TEST',
  position: { x: HALF, y: 0, z: HALF + 100 },
  selection: {
    detail: { faces: [], lines: [], vertices: [] },
    groups: [],
    structure
  },
  status: 'decoded'
};
const pose = {
  body: ERIS_BODY,
  heading: 0,
  pitch: 0,
  position: { x: HALF, y: 10, z: HALF }
};
const surface: ErisSurface = {
  baseColour: '#000066',
  body: { id: 'body-11', name: 'ERIS' },
  grid: { cellsPerAxis: 16, cellUnits: 65_536, origin: { x: 64, z: 128 } },
  islands: [],
  placements: [placement],
  places: [],
  unresolvedCount: 0
};
const bound = {
  attachments: [],
  floor: 0,
  instanceId: 'test',
  regionIndex: 0
};

test('a wall text draws straight after the queue entry it rides on', () => {
  const meshes = structureMeshes(placement, pose, false, undefined, 0);
  expect(meshes.map(mesh => mesh.wallTextPlane)).toEqual([undefined, 0]);
  expect(meshes[1]!.lines).toEqual(stroke.lines);
  // The component is stable, so the frame's triangulation cache keeps hitting.
  expect(structureMeshes(placement, pose, false, undefined, 0)[1]).toBe(
    meshes[1]!
  );
});

const carried = (slots: readonly number[]) => (slot: number) =>
  slots.includes(slot);

test('font 4 draws its font-3 fallback while slot 49 or 91 is carried', () => {
  for (const slots of [[49], [91], [49, 91]]) {
    const meshes = structureMeshes(
      placement,
      pose,
      false,
      undefined,
      0,
      carried(slots)
    );
    expect(meshes[1]!.faces).toEqual(bar.faces);
  }
  expect(
    structureMeshes(placement, pose, false, undefined, 0, carried([50]))[1]!
      .lines
  ).toEqual(stroke.lines);
});

/// Each recovered triangle's colour and face order, in draw order.
const orders = (carriedSlot?: (slot: number) => boolean) => {
  const plan = planErisFrame(surface, pose, doc, bound, [], [], carriedSlot);
  const recovered = plan.vertices.slice(
    (plan.fillTriangleCount + plan.islandTriangleCount) * 3 * FLOATS_PER_VERTEX
  );
  const result: [string, number][] = [];
  for (let i = 0; i < recovered.length; i += FLOATS_PER_VERTEX * 3) {
    const [r, g, b, order] = recovered.slice(i + 3, i + 7);
    result.push([`${r}${g}${b}`, order!]);
  }
  return result;
};

test('the frame pulls wall text over its coplanar wall and faces it both ways', () => {
  // The wall's two triangles, then the stroke as a quad drawn from both sides.
  expect(orders()).toEqual([
    ['100', 0],
    ['100', 0],
    ['010', 1],
    ['010', 1],
    ['010', 1],
    ['010', 1]
  ]);
  // The fallback's filled bar, both windings of both triangles.
  expect(orders(slot => slot === 91)).toEqual([
    ['100', 0],
    ['100', 0],
    ['001', 1],
    ['001', 1],
    ['001', 1],
    ['001', 1]
  ]);
});
