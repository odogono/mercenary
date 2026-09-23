import { describe, expect, test } from 'bun:test';

import { type Catalogue } from '../src/catalogue/data.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

const load = async (): Promise<Catalogue> => await loadCatalogue();

/// The first-world capture stands in Capital City cell $87 with the ground window latched
/// at radius 3, and docs/research/damocles-eris-ground.md reads its live ground-extent
/// edge list out of $84DC. Those edges are the road runs the window reaches, so they are
/// the payload's own claim checked against the running game.
const windowEdges = [
  { end: [11, 8], start: [7, 8] },
  { end: [4, 11], start: [4, 1] },
  { end: [9, 13], start: [9, 8] },
  { end: [10, 9], start: [10, 8] },
  { end: [10, 9], start: [4, 9] },
  { end: [5, 11], start: [3, 11] }
] as const;

describe('the recovered Damocles Settlement road networks', () => {
  test('every Settlement group carries a network, captured or not', async () => {
    const catalogue = await load();
    const withRoads = catalogue.roadNetworks.filter(
      network => network.cells.length > 0
    );

    // One per island record that binds a Structure Workspace group, not one per
    // capture: the run grid is expanded from the group's own authored stream, so a
    // Settlement nobody has stood in publishes its roads too.
    const binding = catalogue.islands.filter(
      island => island.structureGroup !== 0
    );
    expect(catalogue.roadNetworks).toHaveLength(binding.length);
    expect(catalogue.roadNetworks).toHaveLength(42);
    expect(
      catalogue.roadNetworks.filter(n => n.attestation === 'capture')
    ).toHaveLength(22);
    expect(withRoads).toHaveLength(39);
    // Three Settlements hold no run at all: a Settlement is not obliged to have roads
    // any more than it is obliged to have an island. An empty network is a reading.
    expect(
      catalogue.roadNetworks
        .filter(network => network.cells.length === 0)
        .map(network => network.id)
        .sort()
    ).toEqual([
      'roads-gaea-0e',
      'roads-midas-the-midas-project',
      'roads-solon'
    ]);
    // The record family is not Eris-only: twenty Bodies beyond Eris have one.
    expect(new Set(withRoads.map(network => network.body)).size).toBe(21);
  });

  test('a network binds the group and origin of its own island record', async () => {
    const catalogue = await load();
    const byOrigin = new Map(
      catalogue.islands
        .filter(island => island.structureGroup !== 0)
        .map(island => [`${island.body}:${island.origin.join()}`, island])
    );
    for (const network of catalogue.roadNetworks) {
      const island = byOrigin.get(`${network.body}:${network.origin.join()}`);
      expect(island).toBeDefined();
      expect(network.structureGroup).toBe(island!.structureGroup);
    }
  });

  test('the Capital City grid holds the network the aerial view draws', async () => {
    const catalogue = await load();
    const capital = catalogue.roadNetworks.find(
      network => network.id === 'roads-eris-capital-city'
    )!;

    expect(capital.body).toBe('body-11');
    expect(capital.origin).toEqual([64, 128]);
    expect(capital.cells).toHaveLength(88);
    expect(capital.runs).toHaveLength(37);
    for (const edge of windowEdges) {
      expect(capital.runs).toContainEqual({
        axis: edge.start[0] === edge.end[0] ? 'z' : 'x',
        end: [...edge.end],
        start: [...edge.start]
      });
    }
  });

  test('a run is one cell wide and lies along its own axis', async () => {
    const catalogue = await load();
    for (const network of catalogue.roadNetworks) {
      for (const run of network.runs) {
        const [axis, across] = run.axis === 'x' ? [0, 1] : [1, 0];
        expect(run.start[across]).toBe(run.end[across]!);
        expect(run.start[axis]).toBeLessThanOrEqual(run.end[axis]!);
      }
    }
  });

  test('every cell of a run is classified, and no other cell is', async () => {
    const catalogue = await load();
    for (const network of catalogue.roadNetworks) {
      const covered = new Set<number>();
      for (const run of network.runs) {
        const [axis, across] = run.axis === 'x' ? [0, 1] : [1, 0];
        for (let at = run.start[axis]!; at <= run.end[axis]!; at += 1) {
          covered.add(
            run.axis === 'x'
              ? run.start[across]! * 16 + at
              : at * 16 + run.start[across]!
          );
        }
      }
      expect(new Set(network.cells.map(cell => cell.cell))).toEqual(covered);
    }
  });

  test('a crossroads lies inside both runs and an end caps one', async () => {
    const catalogue = await load();
    const capital = catalogue.roadNetworks.find(
      network => network.id === 'roads-eris-capital-city'
    )!;
    const byCell = new Map(capital.cells.map(cell => [cell.cell, cell]));

    // Cell $21 is (1,2): inside the x run (0,2)-(2,2) and inside the z run (1,1)-(1,3).
    expect(byCell.get(0x21)?.pieceName).toBe('crossroads');
    // Cell $12 is (2,1), the far end of the x run (1,1)-(2,1) and on no z run.
    expect(byCell.get(0x12)?.pieceName).toBe('end');
    // Cell $88 is (8,8), inside the x run (7,8)-(11,8) and on no z run.
    expect(byCell.get(0x88)?.pieceName).toBe('straight');
  });

  test('an overridden cell draws a record the classifier did not pick', async () => {
    const catalogue = await load();
    const models = new Set(catalogue.models.map(model => model.id));
    let overridden = 0;
    for (const network of catalogue.roadNetworks) {
      for (const cell of network.cells) {
        if (cell.model !== null) {
          expect(models.has(cell.model)).toBe(true);
        }
        if (cell.overridden === true) {
          overridden += 1;
        }
        // Only a live $01E400 answers the question at all.
        expect(cell.overridden === null).toBe(network.attestation === 'image');
      }
      // A piece index always names one of the group's own six selectors.
      for (const cell of network.cells) {
        expect(network.pieces[cell.piece]?.recordAddress).toBe(
          cell.recordAddress
        );
        expect(network.pieces[cell.piece]?.name).toBe(cell.pieceName);
      }
    }
    // The override is the placement stream's, not an artefact: it reaches most of Capital
    // City and none of several smaller groups.
    expect(overridden).toBeGreaterThan(0);
  });
});
