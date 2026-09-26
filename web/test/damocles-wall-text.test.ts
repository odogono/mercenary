import { expect, test } from 'bun:test';

import {
  FLOOR_LABEL_CHARACTERS,
  type FloorLabel,
  type FloorLabelGlyph,
  type Mesh,
  type StructureSelection
} from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  FLOATS_PER_VERTEX,
  floorLabelGlyphsOf,
  planErisFrame
} from '../src/damocles/frame.ts';
import type { BoundStructureSnapshot } from '../src/damocles/save.ts';
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
    extent: null,
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
  floorLabelGlyphs: {},
  grid: { cellsPerAxis: 16, cellUnits: 65_536, origin: { x: 64, z: 128 } },
  islands: [],
  placements: [placement],
  places: [],
  sky: null,
  unresolvedCount: 0
};
const bound: BoundStructureSnapshot = {
  attachments: [],
  doorway: null,
  floor: 0,
  instanceId: 'test',
  regionIndex: 0,
  ride: null
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

/// Each recovered triangle's colour, in draw order, and whether it shares the first one's
/// plane to the bit.
const orders = (carriedSlot?: (slot: number) => boolean) => {
  const plan = planErisFrame(surface, pose, doc, bound, [], [], carriedSlot);
  const recovered = plan.vertices.slice(
    (plan.fillTriangleCount + plan.islandTriangleCount) * 3 * FLOATS_PER_VERTEX
  );
  const result: [string, boolean][] = [];
  const first = recovered.slice(6, 10).join();
  for (let i = 0; i < recovered.length; i += FLOATS_PER_VERTEX * 3) {
    const [r, g, b] = recovered.slice(i + 3, i + 6);
    result.push([
      `${r}${g}${b}`,
      recovered.slice(i + 6, i + 10).join() === first
    ]);
  }
  return result;
};

test('the frame ties wall text to its wall, draws it after, and faces it both ways', () => {
  // The wall's two triangles, then the stroke as a quad drawn from both sides.
  expect(orders()).toEqual([
    ['100', true],
    ['100', true],
    ['010', true],
    ['010', true],
    ['010', true],
    ['010', true]
  ]);
  // The fallback's filled bar, both windings of both triangles.
  expect(orders(slot => slot === 91)).toEqual([
    ['100', true],
    ['100', true],
    ['001', true],
    ['001', true],
    ['001', true],
    ['001', true]
  ]);
});

// A Floor Label riding on the same wall: a stroked 'G' and a filled '1' in font 2, and a
// filled 'G' in font 3 for a font-4 record's fallback.
const strokeGlyph: FloorLabelGlyph = {
  lines: [[0, 1]],
  points: [
    [0, 0],
    [0, 7]
  ]
};
const fillGlyph: FloorLabelGlyph = {
  faces: [[0, 1, 2]],
  points: [
    [0, 0],
    [2, 0],
    [0, 7]
  ]
};
const labelGlyphs = { '1': fillGlyph, G: strokeGlyph } as Record<
  string,
  FloorLabelGlyph
>;
const glyphFont = (glyphs: Record<string, FloorLabelGlyph>) =>
  Object.fromEntries(
    FLOOR_LABEL_CHARACTERS.map(character => [
      character,
      glyphs[character] ?? strokeGlyph
    ])
  );
const label: FloorLabel = {
  anchor: [-610, 70, -260],
  colour: '#777777',
  face: { index: 0, kind: 'face' },
  font: 2,
  plane: 128,
  scale: [-4, 4],
  sourceColour: 0x07_77
};
const labelled: ErisPlacement = {
  ...placement,
  selection: {
    ...placement.selection!,
    structure: {
      attachments: [],
      detailModel: structure.detailModel,
      detailVariant: structure.detailVariant,
      floorLabels: [label],
      plan: structure.plan,
      regions: structure.regions,
      scale: structure.scale
    }
  }
};
const labelSurface: ErisSurface = {
  ...surface,
  floorLabelGlyphs: {
    '2': glyphFont(labelGlyphs),
    '3': glyphFont({ G: fillGlyph })
  },
  placements: [labelled]
};

test('a Floor Label draws its glyph straight after its face, placed as the builder places it', () => {
  const meshes = structureMeshes(
    labelled,
    pose,
    false,
    undefined,
    0,
    undefined,
    floorLabelGlyphsOf(labelSurface, bound)
  );
  expect(meshes.map(mesh => mesh.wallTextPlane)).toEqual([undefined, 128]);
  // ZY plane: glyph x runs along z by the X scale, glyph y up y by the Y scale.
  expect(meshes[1]!.vertices).toEqual([
    [-610, 70, -260],
    [-610, 98, -260]
  ]);
  expect(meshes[1]!.lines).toEqual([
    { colour: '#777777', sourceColour: 0x07_77, vertices: [0, 1] }
  ]);
  expect(meshes[1]!.faces).toEqual([]);
  // The component is stable while the label holds.
  expect(
    structureMeshes(
      labelled,
      pose,
      false,
      undefined,
      0,
      undefined,
      floorLabelGlyphsOf(labelSurface, bound)
    )[1]
  ).toBe(meshes[1]!);
});

/// The Floor Label component drawn after the wall for a bound structure's Floor and ride.
const drawnLabel = (structure: BoundStructureSnapshot) =>
  structureMeshes(
    labelled,
    pose,
    false,
    undefined,
    0,
    undefined,
    floorLabelGlyphsOf(labelSurface, structure)
  )[1]!;

test('the label shows the Floor, and the stepping label during a ride', () => {
  expect(drawnLabel({ ...bound, floor: 1 }).faces).toHaveLength(1);
  // Standing on Floor 0 with the label stepped to 1: the label, not the Floor, is drawn.
  expect(
    drawnLabel({ ...bound, ride: { countdown: 5, destination: 2, label: 1 } })
      .faces[0]!.vertices
  ).toEqual([0, 1, 2]);
  expect(
    drawnLabel({
      ...bound,
      floor: 1,
      ride: { countdown: 5, destination: 0, label: 0 }
    }).lines
  ).toHaveLength(1);
});

test('a font-4 Floor Label draws its font-3 glyph while slot 49 or 91 is carried', () => {
  const font4: ErisPlacement = {
    ...labelled,
    selection: {
      ...labelled.selection!,
      structure: {
        ...labelled.selection!.structure,
        floorLabels: [
          { ...label, fallback: { font: 3, whileCarried: [49, 91] }, font: 4 }
        ]
      }
    }
  };
  const drawn = (slots: readonly number[]) =>
    structureMeshes(
      font4,
      pose,
      false,
      undefined,
      0,
      carried(slots),
      floorLabelGlyphsOf(labelSurface, bound)
    );
  // The Catalogue here carries no font 4, so nothing draws until the fallback holds.
  expect(drawn([])).toHaveLength(1);
  expect(drawn([91])[1]!.faces).toHaveLength(1);
});

test('no label is drawn without a Floor Label record or its glyph', () => {
  expect(
    structureMeshes(
      placement,
      pose,
      false,
      undefined,
      0,
      undefined,
      floorLabelGlyphsOf(labelSurface, bound)
    ).filter(mesh => mesh.lines.length > 0)
  ).toEqual([
    expect.objectContaining({ lines: stroke.lines, wallTextPlane: 0 })
  ]);
  expect(
    structureMeshes(
      labelled,
      pose,
      false,
      undefined,
      0,
      undefined,
      floorLabelGlyphsOf(surface, bound)
    )
  ).toHaveLength(1);
});

test('the frame draws the label over its wall, from both sides', () => {
  const plan = planErisFrame(labelSurface, pose, doc, {
    ...bound,
    floor: 1
  });
  const recovered = plan.vertices.slice(
    (plan.fillTriangleCount + plan.islandTriangleCount) * 3 * FLOATS_PER_VERTEX
  );
  const colours: number[] = [];
  for (let i = 0; i < recovered.length; i += FLOATS_PER_VERTEX * 3) {
    colours.push(recovered[i + 3]!);
  }
  const grey = Math.fround(0x77 / 255);
  // The wall's two triangles, then the filled '1' in both windings: drawn after, so it wins
  // the plane it shares with a wall.
  expect(colours).toEqual([1, 1, grey, grey]);
});
