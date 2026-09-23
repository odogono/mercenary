import { expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  attachmentOpenLimit,
  clampStructureStep,
  structureMeshes,
  structureRegionAt
} from '../src/damocles/selection.ts';
import { erisSurfaceFrom, startPose } from '../src/damocles/world.ts';
import { ERIS_BODY } from './damocles-pose.ts';
import { readRawCatalogue } from './fixtures/catalogue.ts';

interface RawModel {
  detailSelection: { default: number[] }[];
  id: string;
  kind: string;
  structureSelection: {
    attachments: unknown[];
    detailModel: string;
    detailVariant: string;
    regions: {
      bounds: number[][];
      queue: { index: number; kind: string; slot?: number }[];
    }[];
  };
}
const raw = (await readRawCatalogue()) as unknown as { models: RawModel[] };
const catalogue = parseCatalogue(raw);
const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
const placement = erisSurfaceFrom(catalogue, doc).placements.find(
  p => p.id === 'eris-surface-87'
)!;
const entrance = placement.selection!.structure.attachments[0]!;
const OPEN_ENTRANCE_UNITS = attachmentOpenLimit(entrance);
const units =
  (value: number) =>
  (_slot: number): number =>
    value;
const at = (x: number, z: number, y = 63) => ({
  body: ERIS_BODY,
  heading: 0,
  pitch: 0,
  position: { x: placement.position.x + x, y, z: placement.position.z + z }
});

test('Eris cell 52 receives the selector following an odd-addressed detail face stream', () => {
  const cell = erisSurfaceFrom(catalogue, doc).placements.find(
    p => p.id === 'eris-surface-52'
  )!;
  expect(cell.modelId).toBe('structure-010152');
  expect(cell.selection).toBeDefined();
  expect(cell.selection!.structure.attachments).toEqual([]);
  expect(
    cell.selection!.structure.regions.some(region => region.gate === 'passage')
  ).toBeTrue();
});

test('STATE OFFICE moves its recovered two-leaf attachment on Z', () => {
  const office = erisSurfaceFrom(catalogue, doc).placements.find(
    p => p.id === 'eris-surface-89'
  )!;
  const attachment = office.selection!.structure.attachments[0]!;
  expect(attachment.controlWord).toBe(0x82_00);
  expect(attachment.slot).toBe(0x03_fc);
  expect(attachment.constructor).toEqual({ leafCount: 2, motionAxis: 'z' });
  const pose = {
    body: ERIS_BODY,
    heading: 0,
    pitch: 0,
    position: {
      x: office.position.x + 330,
      y: 63,
      z: office.position.z - 100
    }
  };
  const meshes = structureMeshes(
    office,
    pose,
    false,
    slot => (slot === attachment.slot ? 26 : 0),
    0
  );
  const leaves = meshes.find(
    mesh =>
      mesh.faces.length === 6 &&
      Math.min(...mesh.vertices.map(vertex => vertex[0])) === 293
  )!;
  expect(new Set(leaves.vertices.map(vertex => vertex[0]))).toEqual(
    new Set([293, 297])
  );
  expect(new Set(leaves.vertices.map(vertex => vertex[2]))).toEqual(
    new Set([-160, -126, -74, -40])
  );
});

test('STATE OFFICE leaves rise to the soffit of the doorway they fill', () => {
  const office = erisSurfaceFrom(catalogue, doc).placements.find(
    p => p.id === 'eris-surface-89'
  )!;
  const structure = office.selection!.structure;
  const north = structure.attachments.find(a => a.slot === 0x03_f0)!;
  expect(north.constructor).toEqual({ leafCount: 2, motionAxis: 'x' });
  expect(new Set(north.mesh.vertices.map(vertex => vertex[1]))).toEqual(
    new Set([0, 150])
  );
  const spanning = structure.plan.faces.filter(face => {
    const points = face.vertices.map(index => structure.plan.vertices[index]!);
    return (
      Math.min(...points.map(point => point[0])) <= -100 &&
      Math.max(...points.map(point => point[0])) >= 100 &&
      Math.min(...points.map(point => point[2])) <= 185 &&
      Math.max(...points.map(point => point[2])) >= 200 &&
      Math.max(...points.map(point => point[1])) > 110 &&
      Math.min(...points.map(point => point[1])) < 150
    );
  });
  expect(spanning).toEqual([]);
  const east = structure.attachments.find(a => a.slot === 0x03_fc)!;
  expect(new Set(east.mesh.vertices.map(vertex => vertex[1]))).toEqual(
    new Set([0, 110])
  );
});

test('arrival draws region eleven in order, its real door, and the on-foot detail default', () => {
  const meshes = structureMeshes(placement, startPose(doc), false);
  expect(meshes.slice(0, 18).map(m => m.faces[0]!.sourceIndex! + 1)).toEqual([
    26, 22, 23, 13, 9, 28, 11, 25, 10, 24, 12, 7, 5, 2, 17, 3, 15, 20
  ]);
  expect(meshes[18]).toBe(entrance.mesh);
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

test('region pushback clamps only the blocked axis and preserves wall sliding', () => {
  const region = structureRegionAt(placement, at(1000, -1000), false, units(0));
  expect(region).toBe(2);
  const pushed = clampStructureStep(
    placement,
    at(1000, -1000),
    at(1100, 0),
    false,
    units(0),
    region
  );
  expect(pushed.pose.position.x).toBe(placement.position.x + 1100);
  expect(pushed.pose.position.z).toBe(placement.position.z - 812);
  expect(pushed.regionIndex).toBe(region);

  // Region 10 and the room do not share an edge: the lower window wall remains solid.
  const windowRegion = structureRegionAt(
    placement,
    at(700, 0),
    false,
    units(0)
  );
  const window = clampStructureStep(
    placement,
    at(700, 0),
    at(1000, 0),
    false,
    units(0),
    windowRegion
  );
  expect(window.pose.position.x).toBe(placement.position.x + 788);
});

test('open doorway X uses the bind-time inset, not the catalogue slab span', () => {
  const inDoor = at(1400, -780);
  expect(
    structureRegionAt(placement, inDoor, false, units(OPEN_ENTRANCE_UNITS))
  ).toBe(1);
  const left = clampStructureStep(
    placement,
    inDoor,
    at(1300, -780),
    false,
    units(OPEN_ENTRANCE_UNITS),
    1
  );
  expect(left.pose.position.x).toBe(placement.position.x + 1311);
  expect(left.regionIndex).toBe(1);
  const right = clampStructureStep(
    placement,
    inDoor,
    at(1500, -780),
    false,
    units(OPEN_ENTRANCE_UNITS),
    1
  );
  expect(right.pose.position.x).toBe(placement.position.x + 1488);
  expect(right.regionIndex).toBe(1);
});

test('the doorway region is admitted only at the fully-open endpoint', () => {
  const outside = at(1400, -820);
  const region = structureRegionAt(placement, outside, false, units(0));
  expect(region).toBe(2);
  const closed = clampStructureStep(
    placement,
    outside,
    at(1400, -790),
    false,
    units(OPEN_ENTRANCE_UNITS - 1),
    region
  );
  expect(closed.pose.position.z).toBe(placement.position.z - 812);
  const open = clampStructureStep(
    placement,
    outside,
    at(1400, -790),
    false,
    units(OPEN_ENTRANCE_UNITS),
    region
  );
  expect(open.pose.position.z).toBe(placement.position.z - 790);
  expect(open.regionIndex).toBe(1);
});

test('the Entrance Attachment stays rendered and interpolates its inner edges', () => {
  expect(structureMeshes(placement, at(1400, -780), false)).toEqual([
    placement.mesh!
  ]);
  const half = structureMeshes(
    placement,
    at(1400, -1000),
    false,
    units(OPEN_ENTRANCE_UNITS / 2)
  ).find(mesh => mesh.faces.length === 6)!;
  expect(half.vertices[1]![0]).toBe(1354);
  expect(half.vertices[12]![0]).toBe(1446);

  const open = structureMeshes(
    placement,
    at(1400, -780),
    false,
    units(OPEN_ENTRANCE_UNITS)
  );
  const leaves = open.find(mesh => mesh.faces.length === 6)!;
  expect(leaves.vertices[1]![0]).toBe(1308);
  expect(leaves.vertices[12]![0]).toBe(1492);
  expect(open.some(mesh => mesh.faces[0]?.sourceIndex === 20)).toBeTrue();
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
    m.structureSelection.attachments = [];
  });
  change(m => {
    m.kind = 'object';
  });
  const copy = structuredClone(raw);
  copy.models.find(
    m => m.id === 'interior-0303d6'
  )!.detailSelection[0]!.default = [999];
  expect(() => parseCatalogue(copy)).toThrow('detail record');
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
              records: []
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
            gate: 'none' as const,
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
