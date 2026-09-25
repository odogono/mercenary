import { describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  SURFACE_CELLS,
  bearingFromYaw,
  bodyCellOf,
  cellOf,
  erisSurfaceFrom,
  headingFromByte,
  insideCentralCellHalf,
  islandLocalCell,
  nearestIsland,
  placementHeading,
  startPose,
  structureInCell
} from '../src/damocles/world.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

const load = async () => {
  const [catalogue, presentation] = await Promise.all([
    loadCatalogue(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
  ]);
  return {
    catalogue,
    doc: readErisPresentation(presentation)
  };
};

describe('the Eris surface from the Damocles Catalogue', () => {
  test('places every recovered Eris instance in raw units', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc);
    expect(surface.body).toEqual({ id: 'body-11', name: 'ERIS' });
    // Capital City's captured workspace and the four islands replayed from the image.
    expect(surface.placements).toHaveLength(439);
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
    expect(pad.modelId).toBe('ground-021afe-00-88');
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

  test("reads Eris's five island records and measures cells from the nearest", async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc);
    expect(
      surface.islands.map(island => [island.areaName, island.origin])
    ).toEqual([
      ['CAPITAL CITY', { x: 64, z: 128 }],
      ['SNOW ISLAND', { x: 32, z: 1056 }],
      ['VELOS CITY', { x: 1536, z: 768 }],
      ['BARE ISLAND', { x: 3072, z: 512 }],
      ['KEY WEST', { x: 2560, z: 3584 }]
    ]);
    // The three Working-Authority readings the Cell Readout is pinned by, each given as the
    // body cell the capture decodes to and the pair the original prints there, a negative axis
    // being the one it prints red (#397, docs/research/damocles-eris-islands.md).
    const readings = [
      {
        area: 'CAPITAL CITY',
        body: { x: 38, z: 136 },
        local: { x: -26, z: 8 }
      },
      {
        area: 'SNOW ISLAND',
        body: { x: 35, z: 1028 },
        local: { x: 3, z: -28 }
      },
      { area: 'KEY WEST', body: { x: 2620, z: 3639 }, local: { x: 60, z: 55 } }
    ];
    for (const reading of readings) {
      // The middle of the cell, so the reading does not depend on where in it the player stood.
      const position = {
        x: (reading.body.x + 0.5) * surface.grid.cellUnits,
        y: 63,
        z: (reading.body.z + 0.5) * surface.grid.cellUnits
      };
      expect(bodyCellOf(position, surface.grid)).toEqual(reading.body);
      const island = nearestIsland(surface, position)!;
      expect(island.areaName).toBe(reading.area);
      expect(islandLocalCell(position, surface.grid, island)).toEqual(
        reading.local
      );
    }
  });

  test('measures the Island-Local Cell across the surface wrap', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc);
    const capital = surface.islands[0]!;
    // The surface is a 4096-cell torus on both axes, so a cell four short of wrapping round to
    // Capital City's origin is four west of it and not 4092 east.
    const position = {
      x: (SURFACE_CELLS + capital.origin.x - 4 + 0.5) * surface.grid.cellUnits,
      y: 63,
      z: (capital.origin.z + 0.5) * surface.grid.cellUnits
    };
    expect(bodyCellOf(position, surface.grid)).toEqual({
      x: capital.origin.x - 4,
      z: capital.origin.z
    });
    expect(islandLocalCell(position, surface.grid, capital)).toEqual({
      x: -4,
      z: 0
    });
  });

  test('binds only the current-cell structure and gates its plan to the central half', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc);
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
      const found = erisSurfaceFrom(catalogue, modelsOf(catalogue), {
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
    const combinedOpen = erisSurfaceFrom(
      withoutClosed,
      modelsOf(withoutClosed),
      doc
    ).placements.find(entry => entry.id === 'eris-surface-87')!;
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
    expect(() =>
      erisSurfaceFrom(exteriorOnly, modelsOf(exteriorOnly), doc)
    ).toThrow(
      'Damocles model structure-01484e has no combined variant to draw'
    );
  });

  test('draws nothing for unrecovered geometry and counts the gap', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc);
    const unresolved = surface.placements.filter(
      placement => placement.mesh === undefined
    );
    // INTERSTELLARSHIP and RED BEACON now draw; only the intentional empty
    // surface record has nothing to place, on Capital City and the other four islands.
    expect(unresolved).toHaveLength(22);
    expect(surface.unresolvedCount).toBe(22);
    expect(unresolved.every(placement => placement.faceCount === 0)).toBe(true);
    // Two intentionally empty records: Capital City places 01a618, Bare Island and Key West
    // 01d1a2.
    expect(new Set(unresolved.map(placement => placement.modelId))).toEqual(
      new Set(['structure-01a618', 'structure-01d1a2'])
    );
  });

  test('starts on foot in the spaceport cell at the arrival ship', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc);
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
    const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc);
    // Capital City's eleven and the other islands' twelve that name a placement.
    expect(surface.places).toHaveLength(23);
    const spaceport = surface.places.find(
      place => place.id === 'place-025042'
    )!;
    expect(spaceport.cell).toEqual({ x: 7, z: 8 });
    expect(spaceport.name).toContain('CAPITAL');
  });

  test('turns the V.I.P. limo by its drawn instance angle', async () => {
    const { catalogue, doc } = await load();
    const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc);
    const limo = surface.placements.find(
      placement => placement.id === 'object-slot-5'
    )!;
    // $77BC is $7F and the model's $8001 bias is zero, so the parked limo is turned
    // 127/256 of a turn: a whisker short of half, not left as modelled (#361).
    expect(limo.heading).toBeCloseTo((0x7f / 256) * 2 * Math.PI, 12);
  });

  test('leaves a model the source never turns as modelled', async () => {
    const { catalogue, doc } = await load();
    // Slot 72's angle byte is $FF, but TRANSPORTER a opens with $8002, not $8001,
    // so $5342A stays clear and the record draws unturned (#361).
    const transporter = catalogue.models.find(
      model => model.id === 'object-038820'
    )!;
    const instance = catalogue.instances.find(
      item => item.id === 'object-slot-72'
    )!;
    expect(instance.location?.heading).toBe(0xff);
    expect(transporter.instanceOrientation).toBeUndefined();
    expect(placementHeading(transporter, 0xff)).toBe(0);
  });

  test('adds the model record bias to the Instance angle', async () => {
    const { catalogue, doc } = await load();
    // INTERSTELLARSHIP is modelled the other way round: its $8001 bias is $80 and the
    // arrival ship's byte is $80, so the two cancel and the ship draws as modelled (#361).
    const ship = catalogue.models.find(model => model.id === 'object-036324')!;
    expect(ship.instanceOrientation?.angleBiasByte).toBe(0x80);
    expect(placementHeading(ship, 0x80)).toBeCloseTo(0, 12);
    expect(placementHeading(ship, 0x40)).toBeCloseTo((3 * Math.PI) / 2, 12);
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
    // The instance byte shares the yaw word's scale and sign; zero leaves the mesh alone.
    expect(headingFromByte(null)).toBe(0);
    expect(headingFromByte(0x00)).toBeCloseTo(0, 12);
    expect(headingFromByte(0x40)).toBeCloseTo(Math.PI / 2, 12);
    expect(headingFromByte(0x80)).toBeCloseTo(Math.PI, 12);
    expect(headingFromByte(0xc0)).toBeCloseTo((3 * Math.PI) / 2, 12);
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
