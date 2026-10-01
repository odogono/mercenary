import { expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  erisSurfaceFrom,
  structureInCell,
  withinDrawBound
} from '../src/damocles/world.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

// On foot at Gaea UR CITY 05-02 the ST draws one building, the tower Structure 175 details.
// The pose is the capture's `$7A92`/`$7A96`/`$7A9A`; its `$ABDC` holds slot `$AF` alone at
// cell `$25`. Dion's BIRMINGHAM ISLAND stream, once plotted at this origin too, put a house
// beside it (#673).
test('UR CITY cell $25 draws INDUSTRIAL CO-OP HSE2 and nothing beside it', async () => {
  const catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc, {
    bodyId: 'body-8',
    origin: { x: 512, z: 1792 }
  });
  const position = { x: 0x02_05_88_32, y: 63, z: 0x07_02_96_4f };

  const structures = surface.placements.filter(
    placement =>
      placement.kind === 'structure' &&
      withinDrawBound(placement, position, surface.grid)
  );
  expect(structures.map(placement => placement.id)).toEqual([
    'gaea-ur-city-surface-25'
  ]);
  expect(structureInCell(surface, position)?.id).toBe(
    'gaea-ur-city-surface-25'
  );
});
