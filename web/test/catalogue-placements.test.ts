import { describe, expect, test } from 'bun:test';

import { parseCatalogue, type Instance } from '../src/catalogue/data.ts';
import { atlasBodyIds, atlasLinkFor } from '../src/catalogue/placements.ts';
import { readGammaSystem } from '../src/flyover/documents.ts';

const catalogue = parseCatalogue(
  await Bun.file('../payload/damocles/catalogue.json').json()
);
const system = readGammaSystem(
  await Bun.file('../payload/damocles/system.json').json()
);
const bodies = atlasBodyIds(system);
const instance = (id: string): Instance =>
  catalogue.instances.find(value => value.id === id)!;

describe('the Catalogue hand-off into the Atlas', () => {
  test('joins every Catalogue Body to the Atlas Body of the same source slot', () => {
    // The Catalogue keys a Body by slot and the Gamma System document by slug, both from the
    // recovered source index, so every Body but one joins. VOID is the exception by design: the
    // Catalogue carries it as a space-as-place sentinel and the Atlas holds no Body for it.
    const unjoined = catalogue.bodies.filter(body => !bodies.get(body.id));
    expect(unjoined.map(body => body.name)).toEqual(['VOID']);
    expect(bodies.get('body-11')).toBe('eris');
    expect(bodies.size).toBe(system.bodies.length);
  });

  test('centres a placed Instance at the Street Range on its own position', () => {
    expect(atlasLinkFor(bodies, instance('eris-surface-87'))).toBe(
      '/damocles/atlas?body=eris&instance=eris-surface-87&x=71.49&z=136.52&span=1'
    );
    // An object stands on the surface the same way, whatever the footprint layer draws of it.
    expect(atlasLinkFor(bodies, instance('object-slot-2'))).toBe(
      '/damocles/atlas?body=gaea&instance=object-slot-2&x=519.49&z=1793.49&span=1'
    );
  });

  test('withholds the hand-off where there is nothing true to link to', () => {
    // An Instance placed inside a structure holds no surface position of its own.
    expect(atlasLinkFor(bodies, instance('object-slot-14'))).toBeNull();
    expect(atlasLinkFor(new Map(), instance('eris-surface-87'))).toBeNull();
  });

  test('offers a hand-off for every placed Instance in the Catalogue', () => {
    const placed = catalogue.instances.filter(value => value.location);
    expect(placed.length).toBeGreaterThan(0);
    expect(
      placed.filter(value => atlasLinkFor(bodies, value) === null)
    ).toEqual([]);
  });
});
