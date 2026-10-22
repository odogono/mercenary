import { describe, expect, test } from 'bun:test';

import { compose } from '../src/geometry/compose.ts';
import { canonicalJson } from '../src/geometry/contract.ts';
import { sha256 } from '../src/hash/index.ts';
import { World } from '../src/world/index.ts';
import { loadPayload, readPayloadFile } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);

describe('Targ Recovered Baselines', () => {
  for (const [document, key, recovered] of [
    ['objects.json', 'models', bundle.objects.models],
    ['surface.json', 'cells', bundle.surface.cells]
  ] as const) {
    test(`${document} retains every source record exactly in shared Geometry Assets and Sidecars`, async () => {
      const source = await readPayloadFile(document);
      const records = JSON.parse(source)[key] as unknown[];
      const hash = await sha256(source);
      expect(recovered).toHaveLength(records.length);
      for (const [i, { asset, sidecar }] of recovered.entries()) {
        expect(asset.format).toBe('mercenary-geometry-asset');
        expect(asset.asset).toBe(sidecar.asset);
        expect(asset.title).toBe('targ');
        expect(asset.sidecarSha256).toBe(await sha256(canonicalJson(sidecar)));
        expect(sidecar.source).toEqual({
          document,
          path: `$.${key}[${i}]`,
          sha256: hash
        });
        expect(compose(asset, sidecar).record).toEqual(records[i]);
      }
    });
  }

  test('runtime inputs and Road Workspace bindings retain their live and display forms', () => {
    let rotated = 0;
    let external = 0;
    for (const { asset } of bundle.surface.cells) {
      const cell = world.cells.find(
        c => asset.asset === `targ:surface-cell:${c.index}`
      )!;
      const workspace = world.roadWorkspace(cell);
      for (const part of asset.parts) {
        for (const vertex of part.vertices) {
          if (vertex.runtime !== undefined) {
            rotated++;
            expect(vertex.runtime.kind).toBe('rotated-input');
            expect(vertex.co.every(Number.isInteger)).toBe(true);
          }
        }
        for (const endpoint of part.externals) {
          external++;
          const point = workspace[endpoint.slot - 60];
          expect(endpoint.display).toEqual(
            point === undefined ? null : [point.x, point.y, point.z]
          );
        }
      }
    }
    expect(rotated).toBeGreaterThan(0);
    expect(external).toBeGreaterThan(0);
  });
});

describe('Targ rendering through shared Geometry Assets', () => {
  // Captured from the pre-migration World at c0be76e2 before #862. Every placed object and every
  // Surface Cell's ordered segments, with and without its Road Workspace, must remain exact.
  for (const [elapsed, hash] of [
    [0, '8cf524a39e63d5917519341afb5c67cdb30950e464a66579a808f5a97cff7b23'],
    [0.5, 'c7dcee8ab2ba688e23fd649223c8160716a3d3830ad17667ee0fbf916e79edc2'],
    [1, '8a0039ba11ee56c44493ed96a26a0e42543a7516d98275b1a348862bf4fc2ca0'],
    [12.375, '642a90d1908cd46269a78c67dacbb0d1efa579346704d5b107d8622f18e1d603']
  ] as const) {
    test(`all geometry matches the pre-migration World at elapsed ${elapsed}`, async () => {
      const value = {
        cells: world.cells.map(cell => ({
          withoutRoads: cell.segments(elapsed),
          withRoads: cell.segments(elapsed, world.roadWorkspace(cell))
        })),
        // Faces are new with #863; the pre-migration World had none to compare.
        objects: world.objects.map(({ faces, ...object }) => object)
      };
      expect(await sha256(canonicalJson(value))).toBe(hash);
    });
  }

  test('the World reads object and structure vertices from the shared assets', () => {
    const move = (recovered: (typeof bundle.objects.models)[number]) => ({
      ...recovered,
      asset: {
        ...recovered.asset,
        parts: recovered.asset.parts.map(part => ({
          ...part,
          vertices: part.vertices.map(vertex => ({
            ...vertex,
            co: [vertex.co[0] + 256, vertex.co[1], vertex.co[2]] as const
          }))
        }))
      }
    });
    const edited = new World({
      ...bundle,
      objects: { ...bundle.objects, models: bundle.objects.models.map(move) },
      surface: { ...bundle.surface, cells: bundle.surface.cells.map(move) }
    });
    expect(edited.objects[0]!.vertices).not.toEqual(world.objects[0]!.vertices);
    expect(edited.cells[0]!.segments(0)).not.toEqual(
      world.cells[0]!.segments(0)
    );
    expect(edited.objects[0]!.origin).toEqual(world.objects[0]!.origin);
  });
});
