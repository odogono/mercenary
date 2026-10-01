import { describe, expect, test } from 'bun:test';

import { type Mesh } from '../src/catalogue/data.ts';
import {
  readErisPresentation,
  type ErisPresentationDocument
} from '../src/damocles/documents.ts';
import {
  FLOATS_PER_VERTEX,
  modelPlane,
  planErisFrame,
  type ErisFramePlan
} from '../src/damocles/frame.ts';
import { erisLighting } from '../src/damocles/lighting.ts';
import {
  ERIS_SHADOW_WINDOWS,
  ErisRenderer,
  shadowCasterVertices
} from '../src/damocles/renderer.ts';
import {
  structureMeshes,
  structureRegionAt
} from '../src/damocles/selection.ts';
import {
  bearingFromYaw,
  cellOf,
  erisSurfaceFrom,
  pitchFromWord,
  startPose,
  withinDrawBound,
  type ErisPlacement,
  type ErisSurface
} from '../src/damocles/world.ts';
import { ERIS_BODY } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

const load = async () => {
  const [catalogue, presentation] = await Promise.all([
    loadCatalogue(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
  ]);
  const doc = readErisPresentation(presentation);
  return { doc, surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc) };
};

/// The start pose moved west onto CAPITAL CITY's land outside its core: body cell 58, island
/// x −6, where the core box starts at −5 (docs/research/damocles-eris-islands.md). The islands
/// are drawn there, as they are not on the core (#578), and the workspace's ground records are
/// still in reach.
const offCore = (doc: ErisPresentationDocument, surface: ErisSurface) => {
  const start = startPose(doc);
  return {
    ...start,
    position: { ...start.position, x: 58 * surface.grid.cellUnits }
  };
};

const square = (doubleSided = false): Mesh => ({
  faces: [
    {
      colour: '#ff0000',
      doubleSided,
      sourceColour: 0,
      vertices: [0, 1, 2, 3]
    }
  ],
  lines: [],
  vertices: [
    [-10, 0, -10],
    [10, 0, -10],
    [10, 0, 10],
    [-10, 0, 10]
  ]
});

const placement = (
  mesh: Mesh | undefined,
  position = { x: 0, y: 0, z: 1000 }
): ErisPlacement => ({
  faceCount: mesh?.faces.length ?? 0,
  heading: 0,
  id: 'test',
  keyBase: null,
  kind: 'object',
  mesh,
  modelId: 'model',
  name: 'TEST',
  position,
  status: mesh === undefined ? 'unresolved' : 'decoded'
});

const surfaceOf = (placements: readonly ErisPlacement[]): ErisSurface => ({
  baseColour: '#000066',
  body: { id: 'body-11', name: 'ERIS' },
  floorLabelGlyphs: {},
  grid: { cellsPerAxis: 16, cellUnits: 65_536, origin: { x: 64, z: 128 } },
  islands: [],
  placements,
  places: [],
  sky: null,
  unresolvedCount: placements.filter(p => p.mesh === undefined).length
});

const origin = {
  body: ERIS_BODY,
  heading: 0,
  pitch: 0,
  position: { x: 0, y: 63, z: 0 }
};

/// The Body's base plane and the Damocles Island fills over it lead every plan; both counts
/// depend on where the eye stands, so read them back from the plan.
const fillFloats = (plan: ErisFramePlan): number =>
  (plan.fillTriangleCount + plan.islandTriangleCount) * 3 * FLOATS_PER_VERTEX;

/// Everything a plan draws above the base plane and the island fills: the recovered geometry,
/// which the land-and-sea layers sit beneath rather than move.
const recoveredVertices = (plan: ErisFramePlan): Float32Array =>
  plan.vertices.slice(fillFloats(plan));

describe('an Eris frame in Filled Presentation', () => {
  test('draws the visible resident placements supplied by Session State', async () => {
    const { doc, surface } = await load();
    const pose = startPose(doc);
    const without = planErisFrame(surface, pose, doc);
    const resident = placement(square(), {
      x: pose.position.x,
      y: 0,
      z: pose.position.z + 100
    });
    const withResident = planErisFrame(surface, pose, doc, null, [resident]);
    expect(withResident.triangleCount).toBe(without.triangleCount + 2);
  });

  test('draws a resident key display code from its recovered line segments', async () => {
    const { doc, surface } = await load();
    const pose = startPose(doc);
    const labelled: Mesh = {
      ...square(),
      displayCode: 'VL',
      labelAnchor: [0, 0, 0],
      lines: [
        {
          colour: '#000000',
          sourceColour: 0x80_00,
          vertices: [0, 1]
        }
      ]
    };
    const resident = placement(labelled, {
      x: pose.position.x,
      y: 0,
      z: pose.position.z + 100
    });
    const unlabelled = planErisFrame(surface, pose, doc, null, [
      { ...resident, mesh: { ...labelled, lines: [] } }
    ]);
    const withLabel = planErisFrame(surface, pose, doc, null, [resident]);
    expect(withLabel.triangleCount).toBe(unlabelled.triangleCount + 4);
  });

  test('emits the ground and every decoded face it draws, and nothing for the unrecovered', async () => {
    const { doc, surface } = await load();
    const pose = startPose(doc);
    const plan = planErisFrame(surface, pose, doc);
    // Only the placements within the recovered draw bound contribute faces (#373).
    const decodedFaces = surface.placements
      .filter(item => withinDrawBound(item, pose.position, surface.grid))
      .reduce((sum, p) => sum + (p.mesh?.faces.length ?? 0), 0);
    // Every face is at least one triangle, on top of the fill.
    expect(plan.triangleCount).toBeGreaterThanOrEqual(
      decodedFaces + plan.fillTriangleCount
    );
    expect(plan.vertices).toHaveLength(
      plan.triangleCount * 3 * FLOATS_PER_VERTEX
    );
    expect(plan.skippedFaces).toBe(0);
    // Outside a structure the sky is the Body's own word; `planErisFrame` defaults to night,
    // Eris's `$001` (#494).
    expect(plan.clear).toEqual([0, 0, 0x22 / 255]);
    expect(
      planErisFrame(surface, pose, doc, null, [], [], () => false, true).clear
    ).toEqual([0x66 / 255, 0xaa / 255, 0xee / 255]);
    const withoutMeshes = surfaceOf(
      surface.placements.filter(p => p.mesh === undefined)
    );
    const empty = planErisFrame(withoutMeshes, startPose(doc), doc);
    expect(empty.triangleCount).toBe(empty.fillTriangleCount);
  });

  test('draws ground and structures from the occupied cell alone, and objects from anywhere', async () => {
    const { doc, surface } = await load();
    const pose = startPose(doc);
    const cell = cellOf(pose.position, surface.grid);
    const here = surface.placements.filter(item => {
      const at = cellOf(item.position, surface.grid);
      return at.x === cell.x && at.z === cell.z;
    });
    const objects = surface.placements.filter(item => item.kind === 'object');
    // The Eris arrival Pose stands in cell 07-08: 4 of the Body's 439 placements are in it,
    // and the 7 objects on the Body are drawn wherever they stand (#370, #373).
    expect(surface.placements).toHaveLength(439);
    expect(here).toHaveLength(4);
    expect(objects).toHaveLength(7);
    const plan = planErisFrame(surface, pose, doc);
    const drawnOnly = planErisFrame(
      surfaceOf([...new Set([...here, ...objects])]),
      pose,
      doc
    );
    // Less the island fills, which the hand-built surface carries no records for.
    expect(plan.triangleCount - plan.islandTriangleCount).toBe(
      drawnOnly.triangleCount
    );
    expect(plan.groundTriangleCount).toBe(drawnOnly.groundTriangleCount);
    // A neighbouring cell's ground record and structure stop being drawn, so the plan is a
    // fraction of the every-placement draw it replaced.
    expect(plan.triangleCount).toBeLessThan(1000);

    // An object in a distant cell stays in the draw; a ground record there does not.
    const far = { x: pose.position.x + 6 * 65_536, y: 0, z: pose.position.z };
    const withObject = planErisFrame(
      surfaceOf([placement(square(), far)]),
      pose,
      doc
    );
    const withGround = planErisFrame(
      surfaceOf([{ ...placement(square(), far), kind: 'ground' }]),
      pose,
      doc
    );
    expect(withObject.triangleCount).toBe(withObject.fillTriangleCount + 2);
    expect(withGround.triangleCount).toBe(withGround.fillTriangleCount);
  });

  test('puts a face straight ahead at positive view depth in its own colour', async () => {
    const { doc } = await load();
    const plan = planErisFrame(surfaceOf([placement(square())]), origin, doc);
    expect(plan.triangleCount).toBe(plan.fillTriangleCount + 2);
    for (
      let corner = fillFloats(plan);
      corner < plan.vertices.length;
      corner += FLOATS_PER_VERTEX
    ) {
      const view = Array.from(
        plan.vertices.slice(corner, corner + FLOATS_PER_VERTEX)
      );
      expect(Math.abs(view[0]!)).toBeCloseTo(10, 3);
      expect(view[1]).toBeCloseTo(-63, 3);
      expect(Math.abs(view[2]! - 1000)).toBeCloseTo(10, 3);
      // Red, in the plane y = 0 seen from 63 units above it: n·p + d = 0 with n up.
      expect(view.slice(3, 6)).toEqual([1, 0, 0]);
      expect(view[6]).toBeCloseTo(0, 12);
      expect(view[7]).toBe(1);
      expect(view[8]).toBeCloseTo(0, 12);
      expect(view[9]).toBe(63);
    }
  });

  test('draws a double-sided face twice, reversed', async () => {
    const { doc } = await load();
    const single = planErisFrame(surfaceOf([placement(square())]), origin, doc);
    const double = planErisFrame(
      surfaceOf([placement(square(true))]),
      origin,
      doc
    );
    expect(double.triangleCount).toBe(single.triangleCount + 2);
    const fill = fillFloats(single);
    const stride = 3 * FLOATS_PER_VERTEX;
    const firstFace = Array.from(single.vertices.slice(fill, fill + stride));
    const reversed = Array.from(
      double.vertices.slice(fill + 2 * stride, fill + 3 * stride)
    );
    expect(reversed.slice(0, 3)).toEqual(
      firstFace.slice(2 * FLOATS_PER_VERTEX, 2 * FLOATS_PER_VERTEX + 3)
    );
    expect(
      reversed.slice(2 * FLOATS_PER_VERTEX, 2 * FLOATS_PER_VERTEX + 3)
    ).toEqual(firstFace.slice(0, 3));
  });

  test('puts north ahead and east on the right', async () => {
    const { doc } = await load();
    const mesh: Mesh = {
      faces: [{ colour: '#00ff00', sourceColour: 0, vertices: [0, 1, 2] }],
      lines: [],
      vertices: [
        [0, 0, 0],
        [10, 0, 0],
        [0, 10, 0]
      ]
    };
    const seen = (at: { x: number; z: number }, heading: number) => {
      const plan = planErisFrame(
        surfaceOf([placement(mesh, { x: at.x, y: 0, z: at.z })]),
        { ...origin, heading },
        doc
      );
      const fill = fillFloats(plan);
      return Array.from(plan.vertices.slice(fill, fill + 3));
    };
    // Facing north (a zero bearing), a placement at +z is ahead at positive depth and one at
    // +x is on the right, as the Working Authority's spaceport tower is from the start.
    expect(seen({ x: 0, z: 1000 }, 0)[2]).toBeCloseTo(1000, 6);
    expect(seen({ x: 1000, z: 0 }, 0)[0]).toBeCloseTo(1000, 6);
    // A quarter turn right faces east, so the +x placement is now ahead.
    expect(seen({ x: 1000, z: 0 }, Math.PI / 2)[2]).toBeCloseTo(1000, 6);
    expect(seen({ x: 1000, z: 0 }, Math.PI / 2)[0]).toBeCloseTo(0, 6);
  });

  test('applies the document Z convention and the placement bearing', async () => {
    const { doc } = await load();
    const negate: ErisPresentationDocument = {
      ...doc,
      orientation: { ...doc.orientation, modelZ: 'negate' }
    };
    const mesh: Mesh = {
      faces: [{ colour: '#00ff00', sourceColour: 0, vertices: [0, 1, 2] }],
      lines: [],
      vertices: [
        [0, 0, 100],
        [10, 0, 100],
        [0, 10, 100]
      ]
    };
    const at = (document: ErisPresentationDocument, heading: number) => {
      const plan = planErisFrame(
        surfaceOf([{ ...placement(mesh, { x: 0, y: 0, z: 0 }), heading }]),
        origin,
        document
      );
      const fill = fillFloats(plan);
      return Array.from(plan.vertices.slice(fill, fill + 3));
    };
    // Camera at the origin facing north: a model vertex at +100 z sits ahead (positive
    // depth) when kept, behind when negated.
    expect(at(doc, 0)[2]).toBeCloseTo(100, 6);
    expect(at(negate, 0)[2]).toBeCloseTo(-100, 6);
    // A quarter turn clockwise about +Y moves that vertex onto +x, the right of the view.
    const turned = at(doc, Math.PI / 2);
    expect(turned[0]).toBeCloseTo(100, 6);
    expect(turned[2]).toBeCloseTo(0, 6);
  });

  test('draws nothing for a face without area and counts nothing skipped', async () => {
    const { doc } = await load();
    const degenerate: Mesh = {
      faces: [{ colour: '#ffffff', sourceColour: 0, vertices: [0, 1, 2, 3] }],
      lines: [],
      vertices: [
        [0, 0, 0],
        [10, 0, 0],
        [0, 0, 0],
        [10, 0, 0]
      ]
    };
    const plan = planErisFrame(surfaceOf([placement(degenerate)]), origin, doc);
    expect(plan.triangleCount).toBe(plan.fillTriangleCount);
    expect(plan.skippedFaces).toBe(0);
  });

  test('lays the base plane under the walk, below the recovered faces', async () => {
    const { doc, surface } = await load();
    const plan = planErisFrame(surface, startPose(doc), doc);
    const base = Array.from(
      plan.vertices.slice(0, plan.fillTriangleCount * 3 * FLOATS_PER_VERTEX)
    );
    const at = (offset: number) =>
      base.filter((_, index) => index % FLOATS_PER_VERTEX === offset);
    // The plane surrounds the camera rather than sitting a cell away: a ground plane this far
    // below the eye projects into a pixel at the horizon by the next cell along (#221).
    expect(Math.min(...at(0))).toBeLessThan(0);
    expect(Math.max(...at(0))).toBeGreaterThan(0);
    expect(Math.min(...at(2))).toBeLessThan(0);
    expect(Math.max(...at(2))).toBeGreaterThan(0);
    // It reaches the far plane, not the workspace edge. A Body is a 4096-cell torus and its
    // surface runs to the horizon; the 16-cell window it used to stop at was never a coast,
    // and stopping there left sky where the sea is (#394).
    const reach = Math.max(...at(0).map(Math.abs));
    expect(reach).toBeGreaterThanOrEqual(doc.camera.farPlane);
    expect(Math.max(...at(2).map(Math.abs))).toBe(reach);
    expect(reach).toBeGreaterThan(
      surface.grid.cellsPerAxis * surface.grid.cellUnits
    );
    // Rings, not one quad: the nearest triangles are small enough that the rasteriser's
    // screen-space depth interpolation cannot lift them through the pads (#221).
    const first = base
      .slice(0, 3 * FLOATS_PER_VERTEX)
      .filter((_, index) => index % FLOATS_PER_VERTEX === 0);
    expect(Math.max(...first) - Math.min(...first)).toBe(512);
    expect(plan.fillTriangleCount).toBeGreaterThan(100);
    expect(plan.fillTriangleCount).toBeLessThan(400);
    // One unit under the recovered pad and apron faces, which the eye sees at -63.
    for (const height of at(1)) {
      expect(height).toBeCloseTo(
        -doc.eye.heightUnits - doc.ground.fillDropUnits,
        3
      );
    }
    // The arrival stands on CAPITAL CITY's core, so the plane is that island's own recovered
    // land colour $0030 rather than Eris's $0003 sea: the engine draws the ground plane in
    // `$7A1A` and does not fill the island underfoot over it ($0597F8).
    expect(base[3]).toBe(0);
    expect(base[4]).toBeCloseTo(0x66 / 255, 6);
    expect(base[5]).toBe(0);
    expect(base[6]).toBe(0);
  });

  test('leaves the Capital Spaceport placements exactly where they were', async () => {
    const { doc, surface } = await load();
    // Off the core, where the islands are drawn: on it no island is (#578).
    const pose = offCore(doc, surface);
    const plan = planErisFrame(surface, pose, doc);
    // The island fill is a new layer beneath the recovered geometry, not a change to its
    // transform: the structures, roads and ground polygons placed in Body Coordinates at
    // origin 64,128 draw vertex for vertex as they did before land and sea existed (#394).
    const withoutIslands = planErisFrame(
      { ...surface, islands: [] },
      pose,
      doc
    );
    expect(plan.islandTriangleCount).toBeGreaterThan(0);
    expect(withoutIslands.islandTriangleCount).toBe(0);
    expect(recoveredVertices(plan)).toEqual(recoveredVertices(withoutIslands));
    expect(plan.groundTriangleCount).toBe(withoutIslands.groundTriangleCount);
    // And the placement itself is still at the recovered Body Coordinate.
    const spaceport = surface.placements.find(
      item => item.id === 'eris-surface-87'
    )!;
    expect(spaceport.position.x / surface.grid.cellUnits).toBeCloseTo(
      71.4876,
      3
    );
    expect(spaceport.position.z / surface.grid.cellUnits).toBeCloseTo(
      136.5238,
      3
    );
  });

  test('draws no base plane for a Body with no recovered surface colour', async () => {
    const { doc } = await load();
    // ADR 0043: nothing unrecovered is drawn. The VOID slot is the space-as-place sentinel
    // and carries no surface, so it gets no invented one.
    const plan = planErisFrame(
      { ...surfaceOf([placement(square())]), baseColour: null },
      origin,
      doc
    );
    expect(plan.fillTriangleCount).toBe(0);
    expect(plan.triangleCount).toBe(2);
  });

  test('draws the Body base plane as sea once the eye is off every island core', async () => {
    const { doc, surface } = await load();
    const pose = startPose(doc);
    // Forty cells west of CAPITAL CITY's origin is past its extent box: open water.
    const offshore = {
      ...pose,
      position: { ...pose.position, x: (64 - 40) * surface.grid.cellUnits }
    };
    const plan = planErisFrame(surface, offshore, doc);
    expect(plan.vertices[3]).toBe(0);
    expect(plan.vertices[4]).toBe(0);
    expect(plan.vertices[5]).toBeCloseTo(0x66 / 255, 6);
    // Nothing is standing on any island now, so every record is filled over the sea: all five
    // of Eris's, CAPITAL CITY included.
    const islands = plan.islandTriangleCount / 2;
    expect(islands).toBe(
      surface.islands.reduce(
        (sum, island) => sum + island.coastline.vertices.length - 2,
        0
      )
    );
  });

  test('ties every ground record face at y = 0 to one plane, bit for bit', async () => {
    const { doc, surface } = await load();
    const plan = planErisFrame(surface, startPose(doc), doc);
    const fill = fillFloats(plan);
    const groundEnd = fill + plan.groundTriangleCount * 3 * FLOATS_PER_VERTEX;
    // Pads, aprons and the white strips over them all lie in y = 0. However each face was
    // triangulated, it carries the same plane, so the later face wins by draw order alone.
    const level = new Set(
      planesOf(plan, fill, plan.vertices.length)
        .filter(plane => plane[1]! > 0.99 && Math.abs(plane[3]! - 63) < 1e-3)
        .map(plane => plane.join())
    );
    expect(level.size).toBe(1);
    const ground = planesOf(plan, fill, groundEnd);
    expect(ground.some(plane => level.has(plane.join()))).toBe(true);
  });

  test('ties a detail glyph to its wall and draws it after', async () => {
    const { doc, surface } = await load();
    // Outside the building at 11-8, facing its door wall and the E painted beside the door.
    // The wall (#888844) and the E (#eeeeee) are all detail faces in the plane z = 210.
    const pose = {
      ...origin,
      position: { x: 4_947_050, y: 63, z: 8_945_500 }
    };
    const building = surface.placements.find(
      item => item.id === 'eris-surface-8b'
    )!;
    const meshes = structureMeshes(building, pose, false);
    const onWall = (colour: string) =>
      meshes.flatMap(mesh =>
        mesh.faces.filter(
          face =>
            face.colour === colour &&
            face.vertices.every(vertex => mesh.vertices[vertex]![2] === 210)
        )
      );
    expect(onWall('#888844')).toHaveLength(3);
    expect(onWall('#eeeeee').length).toBeGreaterThanOrEqual(4);

    // The frame selects the detail list only for the structure a session has bound.
    const plan = planErisFrame(surface, pose, doc, {
      attachments: [],
      doorway: null,
      floor: 0,
      instanceId: building.id,
      regionIndex: structureRegionAt(building, pose, false),
      ride: null
    });
    const from =
      fillFloats(plan) + plan.groundTriangleCount * 3 * FLOATS_PER_VERTEX;
    const triangles = trianglesOf(plan, from);
    const coloured = (hex: string) =>
      triangles.flatMap((triangle, index) =>
        triangle.colour.every(
          (channel, at) =>
            channel ===
            Math.fround(
              Number.parseInt(hex.slice(1 + 2 * at, 3 + 2 * at), 16) / 255
            )
        )
          ? [{ index, plane: triangle.plane.join() }]
          : []
      );
    const wall = coloured('#888844');
    const glyph = coloured('#eeeeee');
    const wallPlanes = new Set(wall.map(item => item.plane));
    const painted = glyph.filter(item => wallPlanes.has(item.plane));
    expect(painted.length).toBeGreaterThanOrEqual(4);
    for (const item of painted) {
      const under = wall.filter(other => other.plane === item.plane);
      expect(item.index).toBeGreaterThan(Math.max(...under.map(o => o.index)));
    }
  });
});

const channelsOf = (colour: string) =>
  Array.from(
    new Float32Array(
      [1, 3, 5].map(at => Number.parseInt(colour.slice(at, at + 2), 16) / 255)
    )
  );
const verticesOf = (values: Float32Array) => {
  const vertices: { colour: number[]; view: number[] }[] = [];
  for (let at = 0; at < values.length; at += FLOATS_PER_VERTEX) {
    vertices.push({
      colour: Array.from(values.slice(at + 3, at + 6)),
      view: Array.from(values.slice(at, at + 3))
    });
  }
  return vertices;
};
/// The crossing's pose over LACHESIS in the #558 trace, on Eris: Y `$1800000`, pitch word 487.
const aloft = (doc: ErisPresentationDocument) => {
  const start = startPose(doc);
  return {
    ...start,
    pitch: pitchFromWord(487, doc.orientation),
    position: { ...start.position, y: 0x1_80_00_00 }
  };
};

describe('the ground to the horizon', () => {
  test('reaches the horizon from Y $1800000, where the base plane is past the far plane', async () => {
    const { doc, surface } = await load();
    const plan = planErisFrame(surface, aloft(doc), doc);
    // Every base plane vertex is past the far plane: from this height it draws nothing (#573).
    const base = verticesOf(
      plan.vertices.slice(0, plan.fillTriangleCount * 3 * FLOATS_PER_VERTEX)
    );
    expect(base.length).toBeGreaterThan(0);
    for (const { view } of base) {
      expect(Math.hypot(...view)).toBeGreaterThan(doc.camera.farPlane);
    }
    // The horizon fill is there anyway, inside the frustum, in the Body's base colour: aloft
    // the ST fills `$7C88` even over an island core, where it stood on CAPITAL CITY's land.
    const horizon = verticesOf(plan.horizonVertices);
    expect(horizon.length).toBeGreaterThan(0);
    expect(horizon.length % 3).toBe(0);
    for (const { colour, view } of horizon) {
      expect(colour).toEqual(channelsOf(surface.baseColour!));
      expect(view[2]!).toBeLessThan(doc.camera.farPlane);
      expect(view[2]!).toBeGreaterThan(doc.camera.nearPlane);
    }
    // It spans the view below the horizon line, which with the nose up is `tan θ` under the
    // centre. The #573 Hatari frames at this pitch show 30 rows of LACHESIS's `$411`, rows 106
    // to 135 of 136, at Y 25.6, 26.5 and 27.7 million. The port's edge is at ST row 107.6: its
    // Camera levels at pitch word 512 where the ST's horizon is on the centre row at 511, the
    // Camera-wide half-step, not the fill's.
    const tangents = horizon.map(({ view }) => ({
      x: view[0]! / view[2]!,
      y: view[1]! / view[2]!
    }));
    const top = Math.max(...tangents.map(t => t.y));
    expect(top).toBeCloseTo(-Math.tan(aloft(doc).pitch), 6);
    expect(Math.abs(68 - 256 * top - 106)).toBeLessThan(2);
    const bottom = -Math.tan(
      (doc.camera.verticalFieldOfViewDegrees * Math.PI) / 360
    );
    expect(Math.min(...tangents.map(t => t.y))).toBeLessThan(bottom);
    expect(Math.min(...tangents.map(t => t.x))).toBeLessThan(-4);
    expect(Math.max(...tangents.map(t => t.x))).toBeGreaterThan(4);
  });

  test('does not move with height', async () => {
    const { doc, surface } = await load();
    const high = aloft(doc);
    const higher = {
      ...high,
      position: { ...high.position, y: 0x1_a7_4b_20 }
    };
    expect(planErisFrame(surface, higher, doc).horizonVertices).toEqual(
      planErisFrame(surface, high, doc).horizonVertices
    );
  });

  test('takes the island colour underfoot on the ground, as the base plane does', async () => {
    const { doc, surface } = await load();
    const plan = planErisFrame(surface, startPose(doc), doc);
    expect(plan.horizonVertices.length).toBeGreaterThan(0);
    expect(Array.from(plan.horizonVertices.slice(3, 6))).toEqual(
      Array.from(plan.vertices.slice(3, 6))
    );
    // Level on foot, the line is the centre row, where the raster split falls (row 68).
    const tops: number[] = [];
    for (
      let at = 0;
      at < plan.horizonVertices.length;
      at += FLOATS_PER_VERTEX
    ) {
      tops.push(plan.horizonVertices[at + 1]! / plan.horizonVertices[at + 2]!);
    }
    expect(Math.max(...tops)).toBeCloseTo(0, 6);
  });

  test('is not drawn in space or on a Body with no surface colour', async () => {
    const { doc, surface } = await load();
    const space = planErisFrame(
      surface,
      aloft(doc),
      doc,
      null,
      [],
      [],
      () => false,
      false,
      null,
      true
    );
    expect(space.horizonVertices.length).toBe(0);
    expect(space.horizonIslandVertices.length).toBe(0);
    // Space is filled in `$001`, slot 8 as `$0598CC` loads it (#578).
    expect(space.clear).toEqual([0, 0, 0x22 / 0xff]);
    const bare = planErisFrame(
      { ...surfaceOf([]), baseColour: null },
      origin,
      doc
    );
    expect(bare.horizonVertices.length).toBe(0);
  });
});

/// ST pixel spans a row of the plan's flat island fills covers: each triangle's tangents at
/// 256 pixels a unit about column 160 and row 68, cut through the row's middle, and merged.
const islandSpans = (vertices: Float32Array, row: number) => {
  const y = row + 0.5;
  const spans: [number, number][] = [];
  for (let at = 0; at < vertices.length; at += 3 * FLOATS_PER_VERTEX) {
    const corners = [0, 1, 2].map(corner => {
      const base = at + corner * FLOATS_PER_VERTEX;
      const depth = vertices[base + 2]!;
      return {
        x: 160 + (256 * vertices[base]!) / depth,
        y: 68 - (256 * vertices[base + 1]!) / depth
      };
    });
    const hits: number[] = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = corners[edge]!;
      const b = corners[(edge + 1) % 3]!;
      if ((a.y - y) * (b.y - y) < 0) {
        hits.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
      }
    }
    if (hits.length === 2) {
      spans.push([Math.min(...hits), Math.max(...hits)]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last !== undefined && span[0] <= last[1] + 1e-6) {
      last[1] = Math.max(last[1], span[1]);
    } else {
      merged.push([...span]);
    }
  }
  return merged;
};

describe('the islands from altitude', () => {
  test('are DION NORTH as the ST draws it from 5,117,470 up (#578)', async () => {
    const catalogue = await loadCatalogue();
    const { doc } = await load();
    const surface = erisSurfaceFrom(catalogue, modelsOf(catalogue), doc, {
      bodyId: 'body-4',
      origin: { x: 3316, z: 1378 }
    });
    // The words the #573 run's stop-30 frame was drawn from, a stop before it: nose down at
    // pitch word 655 and yaw 664 over DION NORTH, 1.7 times the far plane up.
    const pose = {
      body: 'body-4',
      heading: bearingFromYaw(664, doc.orientation),
      pitch: pitchFromWord(655, doc.orientation),
      position: { x: 214_399_288, y: 5_117_470, z: 88_304_370 }
    };
    const plan = planErisFrame(surface, pose, doc);
    const flat = verticesOf(plan.horizonIslandVertices);
    expect(flat.length).toBeGreaterThan(0);
    for (const { view } of flat) {
      expect(view[2]!).toBeLessThan(doc.camera.farPlane);
    }
    // The depth-tested fill of the same islands is past the far plane.
    const fills = verticesOf(
      plan.vertices.slice(
        plan.fillTriangleCount * 3 * FLOATS_PER_VERTEX,
        (plan.fillTriangleCount + plan.islandTriangleCount) *
          3 *
          FLOATS_PER_VERTEX
      )
    );
    expect(fills.some(({ view }) => view[2]! > doc.camera.farPlane)).toBe(true);
    // DION NORTH in the frame, `$040`: its first and last pixel on each row of the 136, read
    // from `shot-00030.png`. The port's Camera levels half a step from the ST's, 1.6 rows at
    // this pitch, so the edges are held to three pixels.
    const frame = [
      [50, 147, 188],
      [60, 131, 215],
      [70, 119, 215],
      [80, 111, 214],
      [90, 103, 214],
      [100, 94, 208],
      [110, 86, 186],
      [120, 78, 164],
      [130, 69, 142],
      [135, 68, 131]
    ] as const;
    for (const [row, first, last] of frame) {
      const [span] = islandSpans(plan.horizonIslandVertices, row).filter(
        ([from, to]) => to > 0 && from < 320
      );
      expect(Math.abs(span![0] - first)).toBeLessThan(3);
      expect(Math.abs(span![1] - (last + 1))).toBeLessThan(3);
    }
    expect(new Set(flat.map(({ colour }) => colour.join(',')))).toContainEqual(
      channelsOf('#008800').join(',')
    );
  });

  test('are not drawn on an island core on the ground, as `$0560F2` returns first', async () => {
    const { doc, surface } = await load();
    const plan = planErisFrame(surface, startPose(doc), doc);
    expect(plan.islandTriangleCount).toBe(0);
    expect(plan.horizonIslandVertices.length).toBe(0);
    // One unit above Y's high word, the core no longer holds and every island is drawn.
    const lifted = startPose(doc);
    const aloft = planErisFrame(
      surface,
      { ...lifted, position: { ...lifted.position, y: 0x1_00_00 } },
      doc
    );
    expect(aloft.islandTriangleCount).toBeGreaterThan(0);
    expect(aloft.horizonIslandVertices.length).toBeGreaterThan(0);
  });
});

describe('the stars in the frame plan', () => {
  test('open the sky vertices, one ST pixel square each at its tangent', async () => {
    const { doc, surface } = await load();
    const sky = {
      bodies: [],
      halfWidthDivisor: 0.843_75,
      horizonCut: true,
      projectionScale: 256,
      stars: [
        { colour: '#eeeeee', column: 10, row: 20 },
        { colour: '#4488cc', column: -300, row: 150 }
      ]
    };
    const plan = planErisFrame(
      surface,
      startPose(doc),
      doc,
      null,
      [],
      [],
      () => false,
      false,
      sky
    );
    expect(plan.starCount).toBe(2);
    const vertices = verticesOf(plan.skyVertices);
    expect(vertices).toHaveLength(12);
    const tangents = vertices.map(({ view }) => [
      view[0]! / view[2]!,
      view[1]! / view[2]!
    ]);
    const first = tangents.slice(0, 6);
    expect(Math.min(...first.map(([x]) => x!))).toBeCloseTo(-150 / 256, 9);
    expect(Math.max(...first.map(([x]) => x!))).toBeCloseTo(-149 / 256, 9);
    expect(Math.max(...first.map(([, y]) => y!))).toBeCloseTo(48 / 256, 9);
    expect(Math.min(...first.map(([, y]) => y!))).toBeCloseTo(47 / 256, 9);
    expect(vertices[0]!.colour).toEqual(channelsOf('#eeeeee'));
    expect(vertices[6]!.colour).toEqual(channelsOf('#4488cc'));
  });
});

describe('a face plane', () => {
  test('is the same bits from any face in the plane, however it winds', () => {
    // An oblique integer plane, 2x + 3y + 6z = 60, cut into two unlike polygons.
    const vertices = [
      [30, 0, 0],
      [0, 20, 0],
      [0, 0, 10],
      [6, 4, 6],
      [12, 6, 3],
      [3, 16, 1]
    ] as const;
    const one = modelPlane(vertices, [0, 1, 2]);
    const other = modelPlane(vertices, [5, 4, 3]);
    expect(one).not.toBeNull();
    expect(other).toEqual(one);
    const [nx, ny, nz, d] = one!;
    expect([nx * 7, ny * 7, nz * 7, d * 7].map(Math.round)).toEqual([
      2, 3, 6, -60
    ]);
  });

  test('keeps an axis-aligned plane exact off the integers', () => {
    const integral = modelPlane(
      [
        [0, 0, 210],
        [40, 0, 210],
        [40, 30, 210]
      ],
      [0, 1, 2]
    );
    const stroke = modelPlane(
      [
        [1.25, 3.5, 210],
        [7.75, 3.5, 210],
        [7.75, 4.25, 210],
        [1.25, 4.25, 210]
      ],
      [3, 2, 1, 0]
    );
    expect(integral).toEqual([0, 0, 1, -210]);
    expect(stroke).toEqual(integral);
  });

  test('is none for a degenerate face', () => {
    expect(
      modelPlane(
        [
          [0, 0, 0],
          [1, 1, 1],
          [2, 2, 2]
        ],
        [0, 1, 2]
      )
    ).toBeNull();
  });
});

/// Each vertex's plane between two float offsets of a plan's vertices.
const planesOf = (plan: ErisFramePlan, from: number, to: number) => {
  const planes: number[][] = [];
  for (let at = from; at < to; at += FLOATS_PER_VERTEX) {
    planes.push(Array.from(plan.vertices.slice(at + 6, at + 10)));
  }
  return planes;
};

/// Each triangle's colour and plane from a float offset on, in draw order.
const trianglesOf = (plan: ErisFramePlan, from: number) => {
  const triangles: { colour: number[]; plane: number[] }[] = [];
  for (let at = from; at < plan.vertices.length; at += 3 * FLOATS_PER_VERTEX) {
    triangles.push({
      colour: Array.from(plan.vertices.slice(at + 3, at + 6)),
      plane: Array.from(plan.vertices.slice(at + 6, at + 10))
    });
  }
  return triangles;
};

const fakeContext = () => {
  const calls: string[] = [];
  let compiled = 0;
  let framebuffer = 0;
  const uniforms: Record<string, number[]> = {};
  const gl = {
    activeTexture: (texture: number) => calls.push(`activeTexture:${texture}`),
    ALWAYS: 25,
    ARRAY_BUFFER: 1,
    attachShader: () => undefined,
    BACK: 2,
    bindBuffer: () => undefined,
    bindFramebuffer: (_target: number, value: { id: number } | null) =>
      calls.push(`framebuffer:${value === null ? 'default' : value.id}`),
    bindSampler: (unit: number, sampler: { filter: number }) =>
      calls.push(
        `bindSampler:${unit}:${sampler.filter === 34 ? 'nearest' : 'linear'}`
      ),
    bindTexture: () => undefined,
    BLEND: 35,
    bufferData: (_target: number, data: Float32Array) =>
      calls.push(`buffer:${data.length}`),
    checkFramebufferStatus: () => 21,
    CLAMP_TO_EDGE: 34,
    clear: () => calls.push('clear'),
    clearColor: (r: number, g: number, b: number) =>
      calls.push(`clearColor:${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)}`),
    COLOR_BUFFER_BIT: 4,
    colorMask: (...mask: boolean[]) =>
      calls.push(`colorMask:${mask.join(',')}`),
    COMPARE_REF_TO_TEXTURE: 17,
    COMPILE_STATUS: 5,
    compileShader: () => {
      compiled += 1;
    },
    createBuffer: () => ({}),
    createFramebuffer: () => ({ id: ++framebuffer }),
    createProgram: () => ({}),
    createSampler: () => ({ filter: 0 }),
    createShader: () => ({}),
    createTexture: () => ({}),
    CULL_FACE: 6,
    cullFace: () => calls.push('cullFace'),
    CW: 7,
    deleteShader: () => undefined,
    DEPTH_ATTACHMENT: 18,
    DEPTH_BUFFER_BIT: 8,
    DEPTH_COMPONENT24: 19,
    DEPTH_TEST: 9,
    depthFunc: (compare: number) => calls.push(`depthFunc:${compare}`),
    depthMask: () => undefined,
    disable: (flag: number) => calls.push(`disable:${flag}`),
    disableVertexAttribArray: (attribute: number) =>
      calls.push(`disableAttribute:${attribute}`),
    drawArrays: (mode: number, first: number, count: number) =>
      calls.push(`draw:${mode}:${first}:${count}`),
    drawBuffers: () => undefined,
    DYNAMIC_DRAW: 10,
    enable: (flag: number) => calls.push(`enable:${flag}`),
    enableVertexAttribArray: () => undefined,
    FLOAT: 11,
    FRAGMENT_SHADER: 12,
    FRAMEBUFFER: 20,
    FRAMEBUFFER_COMPLETE: 21,
    framebufferTexture2D: () => undefined,
    frontFace: (mode: number) => calls.push(`frontFace:${mode}`),
    getAttribLocation: (_program: unknown, name: string) =>
      name === 'colour' ? 1 : 0,
    getProgramParameter: () => true,
    getShaderParameter: () => true,
    getUniformLocation: (_p: unknown, name: string) => name,
    isContextLost: () => false,
    LEQUAL: 13,
    LINEAR: 22,
    LINK_STATUS: 14,
    linkProgram: () => undefined,
    NEAREST: 34,
    NONE: 23,
    POLYGON_OFFSET_FILL: 24,
    polygonOffset: (factor: number, units: number) =>
      calls.push(`polygonOffset:${factor}:${units}`),
    readBuffer: () => undefined,
    samplerParameteri: (
      sampler: { filter: number },
      parameter: number,
      value: number
    ) => {
      if (parameter === 31) {
        sampler.filter = value;
      }
    },
    SCISSOR_TEST: 36,
    shaderSource: () => undefined,
    STENCIL_TEST: 37,
    texParameteri: () => undefined,
    texStorage2D: (
      _target: number,
      _levels: number,
      _format: number,
      width: number,
      height: number
    ) => calls.push(`texStorage:${width}:${height}`),
    TEXTURE_2D: 27,
    TEXTURE_COMPARE_FUNC: 28,
    TEXTURE_COMPARE_MODE: 29,
    TEXTURE_MAG_FILTER: 30,
    TEXTURE_MIN_FILTER: 31,
    TEXTURE_WRAP_S: 32,
    TEXTURE_WRAP_T: 33,
    TEXTURE0: 25,
    TEXTURE1: 26,
    TRIANGLES: 15,
    uniform1f: (name: string, value: number) => {
      uniforms[name] = [value];
    },
    uniform1i: (name: string, value: number) => {
      uniforms[name] = [value];
    },
    uniform2f: (name: string, a: number, b: number) => {
      uniforms[name] = [a, b];
    },
    uniform3f: (name: string, a: number, b: number, c: number) => {
      uniforms[name] = [a, b, c];
    },
    uniformMatrix4fv: (
      name: string,
      _transpose: boolean,
      value: Float32Array
    ) => {
      uniforms[name] = Array.from(value);
    },
    useProgram: () => undefined,
    VERTEX_SHADER: 16,
    vertexAttribPointer: () => undefined,
    viewport: () => calls.push('viewport')
  };
  const canvas = {
    addEventListener: () => undefined,
    clientHeight: 400,
    clientWidth: 800,
    getContext: () => gl,
    height: 400,
    width: 800
  };
  return {
    calls,
    canvas: canvas as unknown as HTMLCanvasElement,
    get compiled() {
      return compiled;
    },
    uniforms
  };
};

describe('the Eris renderer', () => {
  test('compiles once and draws the plan as depth-tested culled triangles', async () => {
    (globalThis as { window?: unknown }).window ??= { devicePixelRatio: 1 };
    const { doc, surface } = await load();
    // Every layer at once: the arrival's cell has ground records, and with CAPITAL CITY's core
    // box emptied it stands on the island's land, where every island is filled (#578).
    const coreless = {
      ...surface,
      islands: surface.islands.map(island => ({
        ...island,
        boxes: island.boxes.map((box, index) =>
          index === 1 ? { ...box, x: [0, 0] as const, z: [0, 0] as const } : box
        )
      }))
    };
    const plan = planErisFrame(coreless, startPose(doc), doc);
    const fake = fakeContext();
    const renderer = new ErisRenderer(
      fake.canvas,
      { cullBackFaces: true },
      () => undefined
    );
    expect(fake.compiled).toBe(2);
    renderer.render(plan);
    renderer.render(plan);
    expect(fake.compiled).toBe(2);
    expect(fake.calls.slice(1, 7)).toEqual([
      'framebuffer:default',
      'disable:35',
      'disable:36',
      'disable:37',
      'disable:24',
      'colorMask:true,true,true,true'
    ]);
    expect(fake.calls).toContain('enable:9');
    expect(fake.calls).toContain('enable:6');
    expect(fake.calls).toContain('frontFace:7');
    expect(fake.calls).toContain(`buffer:${plan.vertices.length}`);
    const fill = plan.fillTriangleCount * 3;
    const islands = plan.islandTriangleCount * 3;
    const ground = plan.groundTriangleCount * 3;
    const rest = plan.triangleCount * 3 - fill - islands - ground;
    expect(ground).toBeGreaterThan(0);
    expect(islands).toBeGreaterThan(0);
    // The Body's surface first — base plane then island fills, painted as a stream — and then
    // the recovered ground records and everything else, each a layer nearer.
    const layered = [
      `draw:15:0:${fill}`,
      `draw:15:${fill}:${islands}`,
      `draw:15:${fill + islands}:${ground}`,
      `draw:15:${fill + islands + ground}:${rest}`
    ];
    // The ground to the horizon goes first, over the sky and under everything else (#573),
    // with the island fills flat over it (#578).
    const horizon = `draw:15:0:${(plan.horizonVertices.length + plan.horizonIslandVertices.length) / FLOATS_PER_VERTEX}`;
    expect(plan.horizonVertices.length).toBeGreaterThan(0);
    expect(plan.horizonIslandVertices.length).toBeGreaterThan(0);
    expect(fake.calls.filter(c => c.startsWith('draw:'))).toEqual([
      horizon,
      ...layered,
      horizon,
      ...layered
    ]);
    // The base plane's own step, wider than a layer: its outer rings are far-plane-sized
    // triangles whose interpolated depth strays further than one (#394).
    // The last layer drawn is the one at zero bias: the structures and objects.
    expect(fake.uniforms['depthBias']).toEqual([0]);
    // The surface pair is painted rather than depth-tested, so the comparison is turned off
    // for it and restored for everything that orders against it (#394).
    expect(fake.calls).toContain('depthFunc:25');
    expect(fake.calls).toContain('depthFunc:13');
    expect(fake.uniforms['aspect']).toEqual([2]);
    expect(fake.uniforms['depthRange']).toEqual([
      doc.camera.nearPlane,
      doc.camera.farPlane
    ]);
    expect(fake.uniforms['tangent']![0]).toBeCloseTo(
      Math.tan((doc.camera.verticalFieldOfViewDegrees * Math.PI) / 360),
      9
    );
    const uncull = fakeContext();
    new ErisRenderer(
      uncull.canvas,
      { cullBackFaces: false },
      () => undefined
    ).render(plan);
    expect(uncull.calls).toContain('disable:6');
  });

  test('keeps the Authentic draw path lazy when lighting is available', async () => {
    (globalThis as { window?: unknown }).window ??= { devicePixelRatio: 1 };
    const { doc, surface } = await load();
    const plan = planErisFrame(surface, startPose(doc), doc);
    const fake = fakeContext();
    const renderer = new ErisRenderer(
      fake.canvas,
      { cullBackFaces: true, lighting: true },
      () => undefined
    );

    expect(fake.compiled).toBe(2);
    expect(fake.calls).not.toContain('texStorage:2048:2048');
    renderer.render(plan);
    expect(fake.compiled).toBe(2);
    // The ground to the horizon, then the four colour layers.
    expect(fake.calls.filter(call => call.startsWith('draw:'))).toHaveLength(5);
    expect(fake.calls).not.toContain('texStorage:2048:2048');
  });

  test('draws deduplicated casters into near and far soft-shadow maps', async () => {
    (globalThis as { window?: unknown }).window ??= { devicePixelRatio: 1 };
    const { doc, surface } = await load();
    const plan = planErisFrame(
      surfaceOf([placement(square(true))]),
      origin,
      doc
    );
    const casters = shadowCasterVertices(plan.vertices);
    expect(plan.triangleCount).toBe(plan.fillTriangleCount + 4);
    // Every fill quad and the double-sided face collapse to one winding each.
    expect(casters).toHaveLength(
      (plan.fillTriangleCount / 2 + 2) * 3 * FLOATS_PER_VERTEX
    );

    const fake = fakeContext();
    const renderer = new ErisRenderer(
      fake.canvas,
      { cullBackFaces: true, lighting: true },
      () => undefined
    );
    expect(fake.compiled).toBe(2);

    renderer.render(plan, {
      eyeWorld: origin.position,
      lighting: erisLighting(doc, origin),
      shadowEdge: 'soft',
      view: origin
    });
    expect(fake.compiled).toBe(6);
    expect(
      fake.calls.filter(call => call === 'texStorage:2048:2048')
    ).toHaveLength(2);
    renderer.render(plan, {
      eyeWorld: origin.position,
      lighting: erisLighting(doc, origin),
      shadowEdge: 'soft',
      view: origin
    });

    const casterDraw = `draw:15:0:${casters.length / FLOATS_PER_VERTEX}`;
    const fill = plan.fillTriangleCount * 3;
    // Two shadow maps of deduplicated casters, the ground to the horizon, then the four
    // colour layers: this surface carries no island records and no ground records, so those
    // two layers are empty.
    const once = [
      casterDraw,
      casterDraw,
      `draw:15:0:${plan.horizonVertices.length / FLOATS_PER_VERTEX}`,
      `draw:15:0:${fill}`,
      `draw:15:${fill}:0`,
      `draw:15:${fill}:0`,
      `draw:15:${fill}:12`
    ];
    expect(fake.calls.filter(call => call.startsWith('draw:'))).toEqual([
      ...once,
      ...once
    ]);
    expect(fake.calls).toContain('disableAttribute:1');
    expect(fake.calls).toContain('polygonOffset:1:2');
    expect(fake.uniforms['nearLightMatrix']).toHaveLength(16);
    expect(fake.uniforms['farLightMatrix']).toHaveLength(16);
    expect(fake.uniforms['nearShadowMap']).toEqual([0]);
    expect(fake.uniforms['farShadowMap']).toEqual([1]);
    // A soft Cast Shadow reads both maps through the LINEAR compare sampler and averages.
    expect(fake.uniforms['hardEdge']).toEqual([0]);
    expect(fake.calls.filter(call => call.startsWith('bindSampler:'))).toEqual([
      'bindSampler:0:linear',
      'bindSampler:1:linear',
      'bindSampler:0:linear',
      'bindSampler:1:linear'
    ]);
    expect(fake.uniforms['ambientSky']).toEqual([
      0x66 / 255,
      0x80 / 255,
      0x9c / 255
    ]);

    const spaceport = surface.placements.find(
      candidate => candidate.id === 'eris-surface-87'
    )!;
    const startDistance = Math.hypot(
      doc.start.position.x - spaceport.position.x,
      doc.start.position.z - spaceport.position.z
    );
    expect(ERIS_SHADOW_WINDOWS).toHaveLength(2);
    expect(ERIS_SHADOW_WINDOWS[0].depthHalfRange).toBeGreaterThan(16_384);
    expect(ERIS_SHADOW_WINDOWS[1].halfExtent).toBeGreaterThan(startDistance);
  });

  test('draws a hard Cast Shadow through the NEAREST sampler with the same maps', async () => {
    (globalThis as { window?: unknown }).window ??= { devicePixelRatio: 1 };
    const { doc } = await load();
    const plan = planErisFrame(
      surfaceOf([placement(square(true))]),
      origin,
      doc
    );
    const fake = fakeContext();
    const renderer = new ErisRenderer(
      fake.canvas,
      { cullBackFaces: true, lighting: true },
      () => undefined
    );
    const frame = {
      eyeWorld: origin.position,
      lighting: erisLighting(doc, origin),
      view: origin
    };

    renderer.render(plan, { ...frame, shadowEdge: 'hard' });
    // Same programs, same 2048² maps: only the sampler and the lookup change.
    expect(fake.compiled).toBe(6);
    expect(
      fake.calls.filter(call => call === 'texStorage:2048:2048')
    ).toHaveLength(2);
    expect(fake.uniforms['hardEdge']).toEqual([1]);
    expect(fake.calls.filter(call => call.startsWith('bindSampler:'))).toEqual([
      'bindSampler:0:nearest',
      'bindSampler:1:nearest'
    ]);

    // Switching edge between frames rebinds without reallocating.
    renderer.render(plan, { ...frame, shadowEdge: 'soft' });
    expect(fake.compiled).toBe(6);
    expect(fake.uniforms['hardEdge']).toEqual([0]);
    expect(
      fake.calls.filter(call => call.startsWith('bindSampler:')).slice(2)
    ).toEqual(['bindSampler:0:linear', 'bindSampler:1:linear']);
  });
});
