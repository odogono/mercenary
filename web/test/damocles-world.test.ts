import { describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  bearingFromYaw,
  cellOf,
  erisSurfaceFrom,
  headingFromByte,
  insideCentralCellHalf,
  startPose,
  structureInCell
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
    expect(surface.placements).toHaveLength(174);
    const spaceport = surface.placements.find(
      placement => placement.id === 'eris-surface-87'
    )!;
    expect(spaceport.modelId).toBe('structure-01484e');
    expect(spaceport.status).toBe('partial');
    // The authored fallback omits the resident key, retaining 28 plan primitives and detail.
    expect(spaceport.faceCount).toBe(70);
    expect(spaceport.mesh!.vertices).toHaveLength(163);
    expect(spaceport.position.x / 65_536).toBeCloseTo(71.4876, 3);
    expect(spaceport.position.y).toBe(0);
    expect(spaceport.position.z / 65_536).toBeCloseTo(136.5238, 3);
    expect(cellOf(spaceport.position, surface.grid)).toEqual({ x: 7, z: 8 });
    const pad = surface.placements.find(
      placement => placement.id === 'eris-ground-88'
    )!;
    expect(pad.kind).toBe('ground');
    expect(pad.modelId).toBe('ground-021afe-00');
    expect(pad.faceCount).toBeGreaterThan(0);
    const colours = new Set(pad.mesh!.faces.map(face => face.sourceColour));
    expect(colours.has(0x7_77)).toBe(true);
    expect(colours.has(0x80_0e)).toBe(true);
    const apron = surface.placements.find(
      placement => placement.id === 'eris-ground-87'
    )!;
    expect(cellOf(apron.position, surface.grid)).toEqual({ x: 7, z: 8 });
    expect(apron.faceCount).toBeGreaterThan(0);
  });

  test('binds only the current-cell structure and gates its plan to the central half', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, doc);
    const office = surface.placements.find(
      placement => placement.id === 'eris-surface-89'
    )!;
    expect(structureInCell(surface, office.position)?.id).toBe(office.id);
    const origin = {
      x:
        Math.floor(office.position.x / surface.grid.cellUnits) *
        surface.grid.cellUnits,
      y: 63,
      z:
        Math.floor(office.position.z / surface.grid.cellUnits) *
        surface.grid.cellUnits
    };
    expect(
      insideCentralCellHalf(
        {
          ...origin,
          x: origin.x + surface.grid.cellUnits * 0.25,
          z: origin.z + surface.grid.cellUnits * 0.25
        },
        surface.grid
      )
    ).toBeTrue();
    expect(
      insideCentralCellHalf(
        {
          ...origin,
          x: origin.x + surface.grid.cellUnits * 0.75,
          z: origin.z + surface.grid.cellUnits * 0.5
        },
        surface.grid
      )
    ).toBeFalse();
  });

  test('draws the authored variant the document names', async () => {
    const { catalogue, doc } = await load();
    const placement = (
      structureFallback: (typeof doc)['structureFallback'],
      id: string
    ): { faceCount: number; vertices: number } => {
      const found = erisSurfaceFrom(catalogue, {
        ...doc,
        structureFallback
      }).placements.find(entry => entry.id === id)!;
      return {
        faceCount: found.faceCount,
        vertices: found.mesh!.vertices.length
      };
    };
    const authored = doc.structureFallback;
    expect(
      placement({ ...authored, view: 'exterior' }, 'eris-surface-87')
    ).toEqual({
      faceCount: 42,
      vertices: 51
    });
    expect(
      placement({ ...authored, doorState: 'open' }, 'eris-surface-87')
    ).toEqual({
      faceCount: 69,
      vertices: 163
    });
    // An untagged single-variant model is drawn as that variant whatever the document names.
    expect(
      placement({ ...authored, view: 'exterior' }, 'object-slot-1')
    ).toEqual({
      faceCount: 9,
      vertices: 8
    });
  });

  test('prefers the named view over the named door state and refuses an absent view', async () => {
    const { catalogue, doc } = await load();
    const spaceport = catalogue.models.find(
      model => model.id === 'structure-01484e'
    )!;
    const withoutClosed = {
      ...catalogue,
      models: catalogue.models.map(model =>
        model === spaceport
          ? {
              ...model,
              variants: model.variants.filter(
                variant => variant.doorState !== 'closed'
              )
            }
          : model
      )
    };
    const combinedOpen = erisSurfaceFrom(withoutClosed, doc).placements.find(
      entry => entry.id === 'eris-surface-87'
    )!;
    expect(combinedOpen.faceCount).toBe(69);
    const exteriorOnly = {
      ...catalogue,
      models: catalogue.models.map(model =>
        model === spaceport
          ? {
              ...model,
              variants: model.variants.filter(
                variant => variant.view !== 'combined'
              )
            }
          : model
      )
    };
    expect(() => erisSurfaceFrom(exteriorOnly, doc)).toThrow(
      'Damocles model structure-01484e has no combined variant to draw'
    );
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

  test('reads the V.I.P. limo heading byte as north', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, doc);
    const limo = surface.placements.find(
      placement => placement.id === 'object-slot-5'
    )!;
    expect(limo.heading).toBeCloseTo(0, 12);
  });

  test('reads the camera yaw as a bearing clockwise from north', async () => {
    const { doc } = await load();
    const orientation = doc.orientation;
    // $0600 at the start capture, N centred on the compass tape.
    expect(bearingFromYaw(0x6_00, orientation)).toBeCloseTo(0, 12);
    expect(startPose(doc).heading).toBeCloseTo(0, 12);
    // A right turn raises the word; E is a quarter turn on.
    expect(bearingFromYaw(0x7_00, orientation)).toBeCloseTo(Math.PI / 2, 12);
    expect(bearingFromYaw(0x0_00, orientation)).toBeCloseTo(Math.PI, 12);
    expect(bearingFromYaw(0x1_00, orientation)).toBeCloseTo(
      (3 * Math.PI) / 2,
      12
    );
    // The word wraps every $400.
    expect(bearingFromYaw(0x12_18, orientation)).toBeCloseTo(
      bearingFromYaw(0x02_18, orientation),
      12
    );
    // The instance byte shares the yaw word's scale and sign, with zero at north.
    expect(headingFromByte(null, orientation)).toBe(0);
    expect(headingFromByte(0x00, orientation)).toBeCloseTo(0, 12);
    expect(headingFromByte(0x40, orientation)).toBeCloseTo(Math.PI / 2, 12);
    expect(headingFromByte(0x80, orientation)).toBeCloseTo(Math.PI, 12);
    expect(headingFromByte(0xc0, orientation)).toBeCloseTo(
      (3 * Math.PI) / 2,
      12
    );
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
