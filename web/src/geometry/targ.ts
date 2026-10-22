/// Recover Targ object models and Surface Cells at the payload boundary (ADR 0081).
/// world.json supplies the grid and Road Workspace; it contains no structure meshes.
import { sha256 } from '../hash/index.ts';
import { toFloat32 } from '../math/index.ts';
import type {
  Bundle,
  ObjectsDocument,
  Source,
  SurfaceCell,
  SurfaceDocument,
  WorldDocument
} from '../payload/documents.ts';
import { readers } from '../payload/read.ts';
import { resolveRotation, surfaceRotation } from '../world/surfaceGeometry.ts';
import {
  recoverTargObjectModel,
  recoverTargSurfaceCell,
  type SurfaceDisplay
} from './baseline.ts';
import { compose } from './compose.ts';
import type { Point3 } from './contract.ts';

const surfaceDisplay = (
  cell: SurfaceCell,
  world: WorldDocument,
  roads: WorldDocument['roadCells'][number]['segments']
): SurfaceDisplay => {
  const rotation = surfaceRotation(cell, world.grid.cellsPerAxis);
  const point = (raw: readonly number[] | undefined): Point3 | undefined =>
    raw?.length === 2
      ? [
          Math.round(
            toFloat32((raw[0]! + 0.5) * toFloat32(world.grid.cellSize))
          ),
          0,
          Math.round(
            toFloat32((raw[1]! + 0.5) * toFloat32(world.grid.cellSize))
          )
        ]
      : undefined;
  return {
    roadWorkspace: [0, 1].flatMap(slot => {
      const road = roads.find(r => r.slot === slot);
      return [point(road?.to), point(road?.from)];
    }),
    rotated: input => {
      if (rotation === undefined) {
        return [0, 0, 0];
      }
      const p = resolveRotation(rotation, input, 0);
      return [Math.round(p.x), Math.round(p.y), Math.round(p.z)];
    }
  };
};

export const recoverTargGeometry = async (
  objectSource: Source<ObjectsDocument>,
  surfaceSource: Source<SurfaceDocument>,
  world: WorldDocument
) => {
  // These exact records have already passed the payload readers and schema checks.
  const { models } = objectSource.value as {
    models: Record<string, unknown>[];
  };
  const { cells } = surfaceSource.value as { cells: Record<string, unknown>[] };
  const surface = surfaceSource.document;
  const roads = new Map(
    world.roadCells.map(road => [road.cell, road.segments])
  );
  const [objectHash, surfaceHash] = await Promise.all([
    sha256(objectSource.body),
    sha256(surfaceSource.body)
  ]);
  const [objects, structures] = await Promise.all([
    Promise.all(
      models.map((model, i) =>
        recoverTargObjectModel(model, {
          document: 'objects.json',
          path: `$.models[${i}]`,
          sha256: objectHash
        })
      )
    ),
    Promise.all(
      cells.map((cell, i) =>
        recoverTargSurfaceCell(
          cell,
          {
            document: 'surface.json',
            path: `$.cells[${i}]`,
            sha256: surfaceHash
          },
          surfaceDisplay(
            surface.cells[i]!,
            world,
            roads.get(surface.cells[i]!.cell) ?? []
          )
        )
      )
    )
  ]);
  return { objects, structures };
};

/// The objects document the World reads, composed from its Geometry Assets and checked by the
/// payload reader, so an edited asset is held to the same contract as the extractor's record.
export const composeObjects = (objects: Bundle['objects']): ObjectsDocument =>
  readers.objects(
    { name: 'objects Geometry Assets' },
    {
      ...objects,
      models: objects.models.map(
        ({ asset, sidecar }) => compose(asset, sidecar).record
      )
    }
  );

/// The surface document the World reads, composed from its Surface Cell Geometry Assets.
export const composeSurface = (surface: Bundle['surface']): SurfaceDocument =>
  readers.surface(
    { name: 'Surface Cell Geometry Assets' },
    {
      ...surface,
      cells: surface.cells.map(
        ({ asset, sidecar }) => compose(asset, sidecar).record
      )
    }
  );
