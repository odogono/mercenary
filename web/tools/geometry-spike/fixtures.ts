/// The #671 representative fixtures, recovered from a payload directory as a fresh baseline.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  recoverDamoclesModel,
  recoverTargObjectModel,
  recoverTargRoom,
  recoverTargSurfaceCell,
  type Recovered,
  type SurfaceDisplay
} from '../../src/geometrySpike/baseline.ts';
import { sha256, type Point3 } from '../../src/geometrySpike/contract.ts';
import { load } from '../../src/payload/load.ts';
import { Ink, World, WorldCell } from '../../src/world/index.ts';

type WorldCellRotation = ConstructorParameters<typeof WorldCell>[0]['rotation'];

type Json = Record<string, unknown>;

export interface Fixture {
  readonly coverage: string;
  readonly recover: (payload: string) => Promise<Recovered> | Recovered;
  /// A short, path-safe name for the asset's directory.
  readonly slug: string;
}

const read = (payload: string, document: string) => {
  const text = readFileSync(join(payload, document), 'utf8');
  return { json: JSON.parse(text) as Json, sha256: sha256(text) };
};

const damocles = (slug: string, id: string, coverage: string): Fixture => ({
  coverage,
  recover: payload => {
    const document = `damocles/models/${id}.json`;
    const { json, sha256: hash } = read(payload, document);
    return recoverDamoclesModel(json, { document, path: '$', sha256: hash });
  },
  slug
});

const vec = (v: { x: number; y: number; z: number }): Point3 => [
  Math.round(v.x),
  Math.round(v.y),
  Math.round(v.z)
];

/// The World resolves a surface cell's rotated inputs and Road Workspace slots for display.
const surfaceDisplay = async (
  payload: string,
  cell: number
): Promise<SurfaceDisplay> => {
  const bundle = await load(async name => {
    try {
      return readFileSync(join(payload, name), 'utf8');
    } catch {
      return undefined;
    }
  });
  const world = new World(bundle);
  const worldCell = world.cells.find(c => c.index === cell)!;
  const workspace = world.roadWorkspace(worldCell);
  return {
    roadWorkspace: workspace.map(v => (v === undefined ? undefined : vec(v))),
    // A one-vertex cell sharing the occupied cell's rotation resolves an input through the
    // World's own rule, so the display position is the runtime's and not a re-derivation.
    rotated: input =>
      vec(
        new WorldCell({
          centre: worldCell.centre,
          column: worldCell.column,
          edges: [{ end: 0, ink: Ink.white, start: 0 }],
          index: worldCell.index,
          rotation: (worldCell as unknown as { rotation: WorldCellRotation })
            .rotation,
          row: worldCell.row,
          structure: worldCell.structure,
          vertices: [{ input: [input[0], input[1], input[2]], kind: 'rotated' }]
        }).segments(0)[0]!.a
      )
  };
};

export const FIXTURES: readonly Fixture[] = [
  {
    coverage: 'Wireframe object and loose edges',
    recover: payload => {
      const { json, sha256: hash } = read(payload, 'objects.json');
      const models = json['models'] as Json[];
      const index = models.findIndex(m => m['id'] === 'object-model:1700');
      return recoverTargObjectModel(models[index]!, {
        document: 'objects.json',
        path: `$.models[${index}]`,
        sha256: hash
      });
    },
    slug: 'targ-object-model-1700'
  },
  {
    coverage: 'Structure, runtime rotation, external endpoint references',
    recover: async payload => {
      const { json, sha256: hash } = read(payload, 'surface.json');
      const cells = json['cells'] as Json[];
      const index = cells.findIndex(c => c['cell'] === 1);
      return recoverTargSurfaceCell(
        cells[index]!,
        { document: 'surface.json', path: `$.cells[${index}]`, sha256: hash },
        await surfaceDisplay(payload, 1)
      );
    },
    slug: 'targ-surface-cell-1'
  },
  {
    coverage: 'Room wireframe alongside doorway metadata',
    recover: payload => {
      const { json, sha256: hash } = read(payload, 'rooms.json');
      const rooms = json['rooms'] as Json[];
      const index = rooms.findIndex(r => r['room'] === 0);
      return recoverTargRoom(rooms[index]!, {
        document: 'rooms.json',
        path: `$.rooms[${index}]`,
        sha256: hash
      });
    },
    slug: 'targ-room-0'
  },
  damocles(
    'damocles-object-03f774',
    'object-03f774',
    'COFFIN, coloured polygons including a six-sided face'
  ),
  damocles(
    'damocles-atropos-ground-02064a-00',
    'atropos-ground-02064a-00',
    'Mixed face/line geometry, coincident-but-distinct vertices, source identity and sidedness'
  ),
  damocles(
    'damocles-structure-01484e',
    'structure-01484e',
    'Capital Spaceport, variants, region queues, moving entrance attachment, walking geometry'
  ),
  damocles(
    'damocles-interior-0303d6',
    'interior-0303d6',
    'Capital Spaceport detail linked by the structure selection'
  ),
  damocles(
    'damocles-ground-021de0-06-54',
    'ground-021de0-06-54',
    'Day/night palette attributes'
  )
];

/// The payload record a fixture was recovered from, for exact-composition checks.
export const sourceRecord = (
  payload: string,
  recovered: Recovered
): unknown => {
  const { document, path } = recovered.sidecar.source;
  let value: unknown = read(payload, document).json;
  for (const [, key, index] of path.matchAll(/\.(\w+)\[(\d+)]/g)) {
    value = (value as Json)[key!] as unknown[];
    value = (value as unknown[])[Number(index)];
  }
  return value;
};
