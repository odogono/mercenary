import { describe, expect, test } from 'bun:test';

import type { MapPoint } from '../src/atlas/mapView.ts';
import {
  bodyRoadPieceModels,
  readBodyRoadPieces
} from '../src/atlas/roadPiece.ts';
import { instanceById, type Catalogue } from '../src/catalogue/data.ts';
import { ModelStore } from '../src/catalogue/modelStore.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

const ERIS = 11;
/// One Surface Cell, in the engine units a Model's mesh is measured in.
const CELL = 65_536;
/// Capital City's cell (1, 1): an overridden corner whose Drawn Record is one of Eris's
/// captured ground Models.
const CORNER = 'ground-021534-05-11';

/// How far a set of points reaches along one axis.
const spread = (points: readonly MapPoint[], axis: 'x' | 'z') =>
  Math.max(...points.map(value => value[axis])) -
  Math.min(...points.map(value => value[axis]));

let cached: Catalogue | undefined;
const catalogue = async () => {
  cached = cached ?? (await loadCatalogue());
  return cached;
};

describe('an Atlas Road Piece', () => {
  test('places a Drawn Record at its cell centre, with no z mirror', async () => {
    const data = await catalogue();
    const { drawn } = readBodyRoadPieces(data, modelsOf(data), ERIS);
    const corner = drawn.find(piece => piece.modelId === CORNER)!;
    expect(corner.networkId).toBe('roads-eris-capital-city');
    expect(corner.pieceName).toBe('corner');
    expect(corner.overridden).toBe(true);
    // Capital City's group sits at (64, 128), and this is its cell (1, 1).
    expect(corner.at).toEqual({ x: 65.5, z: 129.5 });
    // The cell's ground Instance stands at the same point: the network's composition and the
    // Instance's own recovered location agree.
    const instance = instanceById(data, 'eris-ground-11')!;
    expect(instance.model).toBe(CORNER);
    expect([
      instance.location!.position[0],
      instance.location!.position[2]
    ]).toEqual([corner.at.x, corner.at.z]);
    // Every face and edge the record holds, in its own order and colour.
    const model = modelsOf(data).peek(CORNER)!;
    const mesh = model.variants[0]!.mesh;
    expect(corner.faces.map(face => face.colour)).toEqual(
      mesh.faces.map(face => face.colour)
    );
    expect(corner.edges).toHaveLength(mesh.lines.length);
    // The first face's second vertex is (1200, 0, -200): east and, with no mirror, south.
    const point = corner.faces[0]!.points[1]!;
    expect(point.x).toBeCloseTo(65.5 + 1200 / CELL, 12);
    expect(point.z).toBeCloseTo(129.5 - 200 / CELL, 12);
  });

  test('follows the runs it lies on', async () => {
    const data = await catalogue();
    const { drawn } = readBodyRoadPieces(data, modelsOf(data), ERIS);
    const network = data.roadNetworks.find(
      value => value.id === 'roads-eris-capital-city'
    )!;
    // Captured models are already turned by their orientation byte, so the Atlas turns
    // nothing. The check that it is right: every straight on an x run reaches further along x
    // than along z, and every straight on a z run the other way.
    const along = (x: number, z: number) =>
      network.runs.find(
        run =>
          run.start[0] <= x &&
          x <= run.end[0] &&
          run.start[1] <= z &&
          z <= run.end[1]
      )?.axis;
    let checked = 0;
    for (const cell of network.cells) {
      if (cell.pieceName !== 'straight' || cell.overridden !== false) {
        continue;
      }
      const piece = drawn.find(
        value =>
          value.networkId === network.id &&
          value.at.x === network.origin[0] + cell.x + 0.5 &&
          value.at.z === network.origin[1] + cell.z + 0.5
      )!;
      const points = piece.faces.flatMap(face => face.points);
      const axis = along(cell.x, cell.z);
      if (axis === undefined) {
        continue;
      }
      expect(spread(points, axis)).toBeGreaterThan(
        spread(points, axis === 'x' ? 'z' : 'x')
      );
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('draws only captured cells, and counts the image-derived ones', async () => {
    const data = await catalogue();
    let drawnTotal = 0;
    let undrawnTotal = 0;
    for (const body of data.bodies) {
      const sourceIndex = Number(body.id.slice('body-'.length));
      const { drawn, undrawn } = readBodyRoadPieces(
        data,
        modelsOf(data),
        sourceIndex
      );
      for (const piece of drawn) {
        const network = data.roadNetworks.find(
          value => value.id === piece.networkId
        )!;
        expect(network.attestation).toBe('capture');
      }
      drawnTotal += drawn.length;
      undrawnTotal += undrawn;
    }
    // The 693 captured road cells each draw their own record; the 478 expanded from the
    // authored stream have a Selected Piece and no Drawn Record (#460).
    const cells = data.roadNetworks.flatMap(network => network.cells);
    expect(drawnTotal).toBe(cells.filter(cell => cell.model !== null).length);
    expect(undrawnTotal).toBe(cells.filter(cell => cell.model === null).length);
    expect(undrawnTotal).toBeGreaterThan(0);
  });

  test('waits for a Model before drawing its piece', async () => {
    const data = await catalogue();
    const empty = new ModelStore(data, () =>
      Promise.reject(new Error('not fetched'))
    );
    const { drawn, undrawn } = readBodyRoadPieces(data, empty, ERIS);
    // Nothing is read yet, so nothing is drawn; the image-derived cells are known from the
    // document alone.
    expect(drawn).toEqual([]);
    expect(undrawn).toBe(
      data.roadNetworks
        .filter(network => network.body === `body-${ERIS}`)
        .flatMap(network => network.cells)
        .filter(cell => cell.model === null).length
    );
    expect(bodyRoadPieceModels(data, ERIS)).toContain(CORNER);
  });
});
