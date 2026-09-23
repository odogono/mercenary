import { beforeAll, describe, expect, test } from 'bun:test';

import {
  buildSearchIndex,
  instancePlacement,
  modelPlacements,
  querySearch,
  settlementCentre,
  type SearchRecord
} from '../src/atlas/search.ts';
import type { Catalogue } from '../src/catalogue/data.ts';
import {
  readGammaSystem,
  type GammaSystemDocument
} from '../src/flyover/documents.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

/// The Atlas's research search (#453), over the real recovered records.

let system: GammaSystemDocument;
let catalogue: Catalogue;
let index: readonly SearchRecord[];

beforeAll(async () => {
  system = readGammaSystem(
    await Bun.file('../payload/damocles/system.json').json()
  );
  catalogue = await loadCatalogue();
  index = buildSearchIndex(system, catalogue);
});

const find = (q: string, kind: SearchRecord['kind'] | null = null) =>
  querySearch(index, { bodyId: null, kind, q });

describe('the search index', () => {
  test('finds Bodies before the Catalogue has been read', () => {
    const bodiesOnly = buildSearchIndex(system);
    expect(bodiesOnly.every(item => item.kind === 'body')).toBe(true);
    expect(
      querySearch(bodiesOnly, { bodyId: null, kind: null, q: 'eris' }).map(
        item => item.id
      )
    ).toEqual(['eris']);
  });

  test('finds nothing for an empty or blank query', () => {
    expect(find('')).toEqual([]);
    expect(find('   ')).toEqual([]);
  });

  test('matches every word, in any case, against name and record id', () => {
    expect(find('dart ii').map(item => item.id)).toContain('object-035d12');
    expect(find('OBJECT-035D12').map(item => item.id)).toEqual([
      'object-035d12'
    ]);
    expect(find('dart zzzz')).toEqual([]);
  });

  test('lists kinds in a fixed order, then names, then ids', () => {
    const results = find('eris');
    const kinds = results.map(item => item.kind);
    const order = ['body', 'settlement', 'place', 'model', 'instance'];
    expect(kinds).toEqual(
      [...kinds].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    );
    expect(find('eris')).toEqual(results);
  });

  test('keeps duplicate names apart by their record ids', () => {
    const stores = find('gum store', 'instance').filter(
      item => item.name === 'GUM STORE'
    );
    expect(stores.length).toBeGreaterThan(1);
    expect(new Set(stores.map(item => item.id)).size).toBe(stores.length);
  });

  test('filters by kind and by the Body searched, independently', () => {
    expect(find('beacon', 'model').every(item => item.kind === 'model')).toBe(
      true
    );
    const onEris = querySearch(index, {
      bodyId: 'eris',
      kind: null,
      q: 'beacon'
    });
    expect(onEris.length).toBeGreaterThan(0);
    expect(onEris.every(item => item.bodyIds.includes('eris'))).toBe(true);
    expect(onEris.length).toBeLessThan(find('beacon').length);
  });

  test('indexes a coastline-less Settlement by the record carrying it', () => {
    const takoushi = find('takoushi base', 'settlement');
    expect(takoushi.map(item => [item.id, item.bodyIds])).toEqual([
      ['island-icarus-063150', ['icarus']]
    ]);
    const island = catalogue.islands.find(
      item => item.id === 'island-icarus-063150'
    )!;
    expect(island.coastline.vertices).toHaveLength(0);
    expect(settlementCentre(island)).toEqual({
      x: island.origin[0] + 8,
      z: island.origin[1] + 8
    });
  });
});

describe('a Model’s placements', () => {
  test('lists every recorded occurrence, grouped by Body, choosing none', () => {
    const beacon = modelPlacements(system, catalogue, 'object-03e2c6')!;
    expect(beacon.model.name).toBe('BLACK BEACON');
    expect(beacon.byBody.length).toBe(8);
    const listed =
      beacon.byBody.reduce((sum, group) => sum + group.instances.length, 0) +
      beacon.parentLocal.length +
      beacon.unlocated.length +
      beacon.unmapped.length;
    expect(listed).toBe(
      catalogue.instances.filter(item => item.model === 'object-03e2c6').length
    );
    // In the Gamma System's own order.
    const order = system.bodies.map(body => body.id);
    const bodies = beacon.byBody.map(group => group.body.id);
    expect(bodies).toEqual(
      [...bodies].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    );
  });

  test('keeps parent-local and unlocated Instances off the map', () => {
    const chair = catalogue.instances.find(
      item => item.id === 'object-slot-14'
    )!;
    const placed = instancePlacement(system, catalogue, chair);
    expect(placed.kind).toBe('parent');
    const unlocated = catalogue.instances.find(
      item => item.id === 'object-slot-8'
    )!;
    expect(instancePlacement(system, catalogue, unlocated).kind).toBe(
      'unlocated'
    );
    const chairs = modelPlacements(system, catalogue, chair.model)!;
    expect(chairs.parentLocal.map(entry => entry.instance.id)).toContain(
      'object-slot-14'
    );
    expect(
      chairs.byBody.some(group =>
        group.instances.some(entry => entry.instance.id === 'object-slot-14')
      )
    ).toBe(false);
  });

  test('is null for a Model the index does not hold', () => {
    expect(modelPlacements(system, catalogue, 'object-ffffff')).toBeNull();
  });
});
