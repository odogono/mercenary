import { describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  cellOf,
  erisSurfaceFrom,
  headingFromByte,
  startPose
} from '../src/damocles/world.ts';

const load = async () => {
  const [catalogue, presentation] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
  ]);
  return {
    catalogue: parseCatalogue(catalogue),
    doc: readErisPresentation(presentation)
  };
};

describe('the Eris surface from the Damocles Catalogue', () => {
  test('places every recovered Eris instance in raw units', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, doc);
    expect(surface.body).toEqual({ id: 'body-11', name: 'ERIS' });
    expect(surface.placements).toHaveLength(84);
    const spaceport = surface.placements.find(
      placement => placement.id === 'eris-surface-87'
    )!;
    expect(spaceport.modelId).toBe('structure-01484e');
    expect(spaceport.status).toBe('partial');
    expect(spaceport.faceCount).toBe(42);
    expect(spaceport.position.x / 65_536).toBeCloseTo(71.4876, 3);
    expect(spaceport.position.y).toBe(0);
    expect(spaceport.position.z / 65_536).toBeCloseTo(136.5238, 3);
    expect(cellOf(spaceport.position, surface.grid)).toEqual({ x: 7, z: 8 });
  });

  test('draws nothing for unrecovered geometry and counts the gap', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, doc);
    const unresolved = surface.placements.filter(
      placement => placement.mesh === undefined
    );
    expect(unresolved).toHaveLength(21);
    expect(surface.unresolvedCount).toBe(21);
    expect(unresolved.every(placement => placement.faceCount === 0)).toBe(true);
    expect(new Set(unresolved.map(placement => placement.modelId))).toEqual(
      new Set(['object-036324', 'object-03e30e', 'structure-01a618'])
    );
  });

  test('starts on foot in the spaceport cell at the arrival ship', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, doc);
    const pose = startPose(doc);
    expect(cellOf(pose.position, surface.grid)).toEqual({ x: 7, z: 8 });
    expect(pose.position.y).toBe(63);
    const ship = surface.placements.find(
      placement => placement.id === 'object-slot-7'
    )!;
    expect(ship.name).toContain('INTERSTELLARSHIP');
    expect(Math.abs(ship.position.x - pose.position.x)).toBeLessThan(64);
    expect(Math.abs(ship.position.z - pose.position.z)).toBeLessThan(64);
  });

  test('names the recovered Eris places by cell', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, doc);
    expect(surface.places).toHaveLength(11);
    const spaceport = surface.places.find(
      place => place.id === 'place-025042'
    )!;
    expect(spaceport.cell).toEqual({ x: 7, z: 8 });
    expect(spaceport.name).toContain('CAPITAL');
  });

  test('reads headings under the documented placeholder convention', () => {
    expect(headingFromByte(null)).toBe(0);
    expect(headingFromByte(0)).toBe(0);
    expect(headingFromByte(64)).toBeCloseTo(Math.PI / 2, 12);
    expect(headingFromByte(255)).toBeCloseTo((255 / 256) * 2 * Math.PI, 12);
    expect(
      cellOf(
        { x: 64 * 65_536 - 1, y: 0, z: 128 * 65_536 },
        {
          cellsPerAxis: 16,
          cellUnits: 65_536,
          origin: { x: 64, z: 128 }
        }
      )
    ).toEqual({ x: -1, z: 0 });
  });
});
