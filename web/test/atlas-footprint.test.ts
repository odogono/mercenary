import { describe, expect, test } from 'bun:test';

import { fitBody } from '../src/atlas/bodyRange.ts';
import {
  drawnAngleByte,
  footprintAt,
  footprintMesh,
  footprintOf,
  readBodyFootprints
} from '../src/atlas/footprint.ts';
import {
  instanceById,
  modelById,
  parseCatalogue,
  type Catalogue,
  type Instance,
  type Model
} from '../src/catalogue/data.ts';

const FRAME = { height: 800, width: 1280 };
const ASPECT = FRAME.height / FRAME.width;
const ERIS = 11;
/// One Surface Cell, in the engine units a Model's mesh is measured in.
const CELL = 65_536;
/// The one Model carrying an exterior Mesh, and the one Instance of it on Eris.
const SPACEPORT = 'eris-surface-87';
const STATE_OFFICE = 'eris-surface-89';

let cached: Catalogue | undefined;
const catalogue = async () => {
  cached =
    cached ??
    parseCatalogue(await Bun.file('../payload/damocles/catalogue.json').json());
  return cached;
};

const pair = async (
  instanceId: string
): Promise<{ readonly instance: Instance; readonly model: Model }> => {
  const data = await catalogue();
  const instance = instanceById(data, instanceId)!;
  return { instance, model: modelById(data, instance.model)! };
};

describe('an Atlas footprint', () => {
  test('measures the exterior Mesh where a Model has one', async () => {
    const { instance, model } = await pair(SPACEPORT);
    const footprint = footprintOf(model, instance)!;
    expect(footprint.source).toBe('exterior');
    // Capital Spaceport's exterior spans x 750 to 1600 and z -800 to 1250 in engine units,
    // measured about the Instance's own recovered position rather than about the cell.
    const [x, z] = [
      instance.location!.position[0],
      instance.location!.position[2]
    ];
    expect(footprint.at).toEqual({ x, z });
    expect(footprint.corners[0].x).toBeCloseTo(x + 750 / CELL, 12);
    expect(footprint.corners[0].z).toBeCloseTo(z - 800 / CELL, 12);
    expect(footprint.corners[2].x).toBeCloseTo(x + 1600 / CELL, 12);
    expect(footprint.corners[2].z).toBeCloseTo(z + 1250 / CELL, 12);
    // No z mirror: the mesh's own +z corner lands north of the Instance, not south of it. The
    // mirror in the renderer belongs to the camera's handedness and not to where a building is.
    expect(footprint.corners[2].z).toBeGreaterThan(z);
  });

  test('falls back to the plan Mesh where the Model has no exterior', async () => {
    const { instance, model } = await pair(STATE_OFFICE);
    expect(model.variants.some(variant => variant.view === 'exterior')).toBe(
      false
    );
    const footprint = footprintOf(model, instance)!;
    expect(footprint.source).toBe('plan');
    const plan = model.structureSelection!.plan;
    const xs = plan.vertices.map(vertex => vertex[0]);
    const width = (Math.max(...xs) - Math.min(...xs)) / CELL;
    expect(footprint.corners[1].x - footprint.corners[0].x).toBeCloseTo(
      width,
      12
    );
    expect(footprintMesh(model)).toEqual({ mesh: plan, source: 'plan' });
  });

  test('turns the rectangle by the Instance’s drawn angle', async () => {
    // Built over a recovered record rather than beside one: the turn is the whole of what is
    // being checked, and no recovered structure Instance carries a non-zero angle today.
    const { instance, model } = await pair(STATE_OFFICE);
    const turned: Model = {
      ...model,
      // A quarter turn as the Model's own $8001 bias, so the Instance's byte stays zero and the
      // two halves of the sum are told apart.
      instanceOrientation: { angleBiasByte: 64, modeByte: 1, rotation: 'yaw' },
      structureSelection: {
        ...model.structureSelection!,
        plan: {
          faces: [],
          lines: [],
          vertices: [
            [0, 0, 0],
            [100, 0, 0],
            [100, 0, 300],
            [0, 0, 300]
          ]
        }
      }
    };
    const placed: Instance = {
      ...instance,
      location: { ...instance.location!, heading: 0, position: [10, 0, 20] }
    };
    expect(drawnAngleByte(turned, placed)).toBe(64);
    const footprint = footprintOf(turned, placed)!;
    expect(footprint.drawnAngle).toBe(64);
    // A quarter turn clockwise seen from above sends the model's +x to −z and its +z to +x, the
    // composition the draw path applies at $0533F4.
    const expected = [
      { x: 10, z: 20 },
      { x: 10, z: 20 - 100 / CELL },
      { x: 10 + 300 / CELL, z: 20 - 100 / CELL },
      { x: 10 + 300 / CELL, z: 20 }
    ];
    for (const [index, corner] of footprint.corners.entries()) {
      expect(corner.x).toBeCloseTo(expected[index]!.x, 12);
      expect(corner.z).toBeCloseTo(expected[index]!.z, 12);
    }
    // The rectangle keeps its size through the turn: 100 by 300 units, now across z by x.
    expect(
      Math.hypot(
        footprint.corners[1].x - footprint.corners[0].x,
        footprint.corners[1].z - footprint.corners[0].z
      )
    ).toBeCloseTo(100 / CELL, 12);

    // A Model that never asked for the single-Y path is drawn as modelled however its
    // Instance's byte reads ($0536F6), so the byte alone does not turn anything.
    const { instanceOrientation: _turn, ...asModelled } = turned;
    const unturned = footprintOf(asModelled, {
      ...placed,
      location: { ...placed.location!, heading: 64 }
    })!;
    expect(unturned.drawnAngle).toBe(0);
    expect(unturned.corners[2].x).toBeCloseTo(10 + 100 / CELL, 12);
  });

  test('offers no rectangle where a Model recovered no outline', async () => {
    const data = await catalogue();
    // Structure 100 is the intentionally empty surface record: no plan vertices and no walls.
    const empty = instanceById(data, 'eris-surface-33')!;
    const model = modelById(data, empty.model)!;
    expect(footprintMesh(model)).toBeNull();
    expect(footprintOf(model, empty)).toBeNull();
  });
});

describe('a Body’s footprints', () => {
  test('are the Surface Structures placed on it, and what has no outline', async () => {
    const data = await catalogue();
    const { drawn, gaps } = readBodyFootprints(data, ERIS);
    expect(drawn).toHaveLength(57);
    expect(gaps).toHaveLength(20);
    expect(drawn.map(footprint => footprint.id)).toContain(SPACEPORT);
    // Object and ground Instances are not footprints: one is a thing standing on the ground
    // whose Object Residence a Drop rewrites, and the other is the cell's own surface.
    for (const footprint of drawn) {
      expect(modelById(data, footprint.modelId)?.kind).toBe('structure');
    }
  });

  test('measures how often the plan fallback is needed', async () => {
    // What #405 left in fog and this task was to answer, pinned because the panel prints it.
    const data = await catalogue();
    const bodies = data.bodies.map(body => Number(body.id.split('-')[1]));
    const all = bodies.flatMap(index => readBodyFootprints(data, index).drawn);
    expect(all).toHaveLength(579);
    expect(all.filter(footprint => footprint.source === 'plan')).toHaveLength(
      577
    );
    expect(
      all.filter(footprint => footprint.source === 'exterior')
    ).toHaveLength(2);
    // The exterior Mesh is all but absent, so the fallback is the rule rather than the relief.
    const onBodies = bodies.filter(
      index => readBodyFootprints(data, index).drawn.length > 0
    );
    expect(onBodies).toHaveLength(19);
    // Every recovered structure Instance is drawn as modelled: nothing on the surface carries a
    // $8001 record with an angle byte, so the turn above is arithmetic the data does not yet
    // exercise rather than a turn that is being missed.
    expect(all.every(footprint => footprint.drawnAngle === 0)).toBe(true);
  });
});

describe('picking a footprint', () => {
  test('finds the rectangle under a Body Coordinate', async () => {
    const data = await catalogue();
    const { drawn } = readBodyFootprints(data, ERIS);
    const spaceport = drawn.find(footprint => footprint.id === SPACEPORT)!;
    const view = { cx: spaceport.at.x, cz: spaceport.at.z, span: 1 };
    // The middle of its own rectangle, which is not the Instance's position: the mesh is not
    // centred on the point it is placed at.
    const middle = {
      x: (spaceport.corners[0].x + spaceport.corners[2].x) / 2,
      z: (spaceport.corners[0].z + spaceport.corners[2].z) / 2
    };
    expect(footprintAt(drawn, view, ASPECT, middle)?.id).toBe(SPACEPORT);
    // Bare ground a whole cell away is nothing, and clears the selection rather than picking
    // whichever rectangle happens to be nearest.
    expect(
      footprintAt(drawn, view, ASPECT, { x: middle.x + 1, z: middle.z + 1 })
    ).toBeNull();
  });

  test('is tested against every wrap image the camera can see', async () => {
    const data = await catalogue();
    const { drawn } = readBodyFootprints(data, ERIS);
    const spaceport = drawn.find(footprint => footprint.id === SPACEPORT)!;
    const middle = {
      x: (spaceport.corners[0].x + spaceport.corners[2].x) / 2,
      z: (spaceport.corners[0].z + spaceport.corners[2].z) / 2
    };
    // The same rectangle one whole surface over is the same record, at the widest camera there
    // is. A pick across the seam must not fall through to bare ground.
    const wide = fitBody(FRAME);
    expect(
      footprintAt(drawn, wide, ASPECT, {
        x: middle.x + 4096,
        z: middle.z
      })?.id
    ).toBe(SPACEPORT);
  });
});
