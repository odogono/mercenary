import { expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { structureMeshes } from '../src/damocles/selection.ts';
import { erisSurfaceFrom, startPose } from '../src/damocles/world.ts';

interface RawModel {
  detailSelection: { default: number[] }[];
  id: string;
  kind: string;
  structureSelection: {
    attachment: unknown;
    detailModel: string;
    detailVariant: string;
    regions: { bounds: number[][]; queue: { index: number; kind: string }[] }[];
  };
}
const raw: { models: RawModel[] } = await Bun.file(
  '../payload/damocles/catalogue.json'
).json();
const catalogue = parseCatalogue(raw);
const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
const placement = erisSurfaceFrom(catalogue, doc).placements.find(
  p => p.id === 'eris-surface-87'
)!;
const at = (x: number, z: number, y = 63) => ({
  heading: 0,
  position: { x: placement.position.x + x, y, z: placement.position.z + z }
});

test('Eris cell 52 receives the selector following an odd-addressed detail face stream', () => {
  const cell = erisSurfaceFrom(catalogue, doc).placements.find(
    p => p.id === 'eris-surface-52'
  )!;
  expect(cell.modelId).toBe('structure-010152');
  expect(cell.selection).toBeDefined();
});

test('arrival draws region eleven in order, its real door, and the on-foot detail default', () => {
  const meshes = structureMeshes(placement, startPose(doc), false);
  expect(meshes.slice(0, 18).map(m => m.faces[0]!.sourceIndex! + 1)).toEqual([
    26, 22, 23, 13, 9, 28, 11, 25, 10, 24, 12, 7, 5, 2, 17, 3, 15, 20
  ]);
  expect(meshes[18]).toBe(placement.selection!.structure.attachment!);
  expect(meshes[18]!.faces).toHaveLength(6);
  expect(meshes[19]!.faces).toHaveLength(29);
  const detail = placement.selection!.detail;
  expect(meshes[19]!.faces).toEqual(
    [
      21, 22, 23, 24, 25, 26, 27, 28, 13, 14, 15, 16, 17, 18, 19, 20, 1, 4, 35,
      30, 45, 40, 41, 42, 43, 31, 36, 37, 38
    ].map(n => detail.faces[n - 1]!)
  );
  expect(structureMeshes(placement, startPose(doc), false)).toEqual(meshes);
  expect(structureMeshes(placement, startPose(doc), false)[0]).toBe(meshes[0]!);
});

test('inside, window and doorway replace the detail list, preserving empty and first matches', () => {
  expect(structureMeshes(placement, at(1200, 0), false)[0]!.faces).toEqual([]);
  expect(structureMeshes(placement, at(1000, 900), false)[0]!.faces).toEqual(
    []
  );
  const doorway = structureMeshes(placement, at(1400, -1000), false).at(-1)!;
  expect(doorway.faces).toEqual(
    [36, 37, 38, 31].map(n => placement.selection!.detail.faces[n - 1]!)
  );
  const window = structureMeshes(placement, at(700, 0), false).at(-1)!;
  expect(window.faces).toHaveLength(9);
  // Upper detail bound is included; lower detail bound is excluded.
  expect(structureMeshes(placement, at(1600, 0), false).at(-1)!.faces).toEqual(
    []
  );
  expect(
    structureMeshes(placement, at(800, 0), false).at(-1)!.faces.length
  ).toBeGreaterThan(0);
});

test('region boundaries are lower inclusive and upper exclusive, with authored fallback outside', () => {
  const structure = placement.selection!.structure;
  const first = {
    ...structure.regions[0]!,
    bounds: [
      [0, 10],
      [0, 10]
    ] as const,
    queue: []
  };
  const second = {
    ...structure.regions[2]!,
    bounds: [
      [10, 20],
      [0, 10]
    ] as const,
    queue: []
  };
  const p = {
    ...placement,
    selection: {
      ...placement.selection!,
      structure: { ...structure, regions: [first, second] }
    }
  };
  expect(structureMeshes(p, at(0, 0), false)).not.toEqual([p.mesh!]);
  expect(structureMeshes(p, at(10, 0), false)).not.toEqual([p.mesh!]);
  expect(structureMeshes(p, at(20, 0), false)).toEqual([p.mesh!]);
  const fallback = { ...p };
  delete (fallback as { selection?: unknown }).selection;
  expect(structureMeshes(fallback, at(0, 0), false)).toEqual([p.mesh!]);
});

test('flags gate detail and order components independently of heading and model Z', () => {
  for (const flags of [0x80_00, 0xc0_00, 0xd0_00, 0x40_00]) {
    const structure = placement.selection!.structure;
    const p = {
      ...placement,
      selection: {
        ...placement.selection!,
        structure: {
          ...structure,
          regions: [{ ...structure.regions[10]!, flags }]
        }
      }
    };
    const meshes = structureMeshes(p, startPose(doc), false);
    if (flags === 0x40_00) {
      expect(meshes).toHaveLength(19);
    } else {
      expect(
        meshes[flags === 0xc0_00 ? meshes.length - 1 : 0]!.faces
      ).toHaveLength(29);
    }
  }
  const expected = structureMeshes(placement, at(1400, -1000), false);
  const turned = { ...placement, heading: Math.PI / 2 };
  expect(structureMeshes(turned, at(-1000, -1400), false)).toEqual(expected);
  expect(structureMeshes(placement, at(1400, 1000), true)).toEqual(expected);
});

test('selector payload rejects invalid bindings, references, bounds, tags and kinds', () => {
  const change = (edit: (m: RawModel) => void) => {
    const copy = structuredClone(raw);
    edit(copy.models.find(m => m.id === placement.modelId)!);
    expect(() => parseCatalogue(copy)).toThrow('Invalid Damocles catalogue');
  };
  change(m => {
    m.structureSelection.detailModel = 'missing';
  });
  change(m => {
    m.structureSelection.detailVariant = 'missing';
  });
  change(m => {
    m.structureSelection.regions[0]!.queue[0]!.index = 999;
  });
  change(m => {
    m.structureSelection.regions[0]!.queue[0]!.kind = 'unknown';
  });
  change(m => {
    m.structureSelection.regions[0]!.bounds[0] = [3, 3];
  });
  change(m => {
    m.structureSelection.attachment = null;
  });
  change(m => {
    m.kind = 'object';
  });
  const copy = structuredClone(raw);
  copy.models.find(
    m => m.id === 'interior-0303d6'
  )!.detailSelection[0]!.default = [999];
  expect(() => parseCatalogue(copy)).toThrow('detail face');
  expect(() => parseCatalogue({ ...raw, schemaVersion: 5 })).toThrow(
    'schema version'
  );
});

test('negative detail scales retain lower-exclusive and upper-inclusive world bounds', () => {
  const p = {
    ...placement,
    selection: {
      ...placement.selection!,
      groups: [
        placement.selection!.groups[0]!,
        {
          boxes: [
            {
              bounds: [
                [1, 2],
                [0, 200],
                [-1, 1]
              ] as const,
              faces: []
            }
          ],
          default: [0]
        }
      ],
      structure: {
        ...placement.selection!.structure,
        regions: [
          {
            bounds: [
              [-10, 10],
              [-10, 10]
            ] as const,
            flags: 0x80_00,
            queue: []
          }
        ],
        scale: [-2, 1] as const
      }
    }
  };
  expect(structureMeshes(p, at(-4, 0), false)[0]!.faces).toHaveLength(1);
  expect(structureMeshes(p, at(-3, 0), false)[0]!.faces).toHaveLength(0);
  expect(structureMeshes(p, at(-2, 0), false)[0]!.faces).toHaveLength(0);
});
