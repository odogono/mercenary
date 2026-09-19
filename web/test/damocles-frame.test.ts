import { describe, expect, test } from 'bun:test';

import { parseCatalogue, type Mesh } from '../src/catalogue/data.ts';
import {
  readErisPresentation,
  type ErisPresentationDocument
} from '../src/damocles/documents.ts';
import {
  FLOATS_PER_VERTEX,
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
  cellOf,
  erisSurfaceFrom,
  startPose,
  withinDrawBound,
  type ErisPlacement,
  type ErisSurface
} from '../src/damocles/world.ts';
import { ERIS_BODY } from './damocles-pose.ts';

const load = async () => {
  const [catalogue, presentation] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
  ]);
  const doc = readErisPresentation(presentation);
  return { doc, surface: erisSurfaceFrom(parseCatalogue(catalogue), doc) };
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
  kind: 'object',
  mesh,
  modelId: 'model',
  name: 'TEST',
  position,
  status: mesh === undefined ? 'unresolved' : 'decoded'
});

const surfaceOf = (placements: readonly ErisPlacement[]): ErisSurface => ({
  body: { id: 'body-11', name: 'ERIS' },
  grid: { cellsPerAxis: 16, cellUnits: 65_536, origin: { x: 64, z: 128 } },
  placements,
  places: [],
  unresolvedCount: placements.filter(p => p.mesh === undefined).length
});

const origin = {
  body: ERIS_BODY,
  heading: 0,
  position: { x: 0, y: 63, z: 0 }
};

/// The authored ground fill leads every plan; its triangle count depends on the eye's place
/// in the workspace, so read it back from the plan.
const fillFloats = (plan: ErisFramePlan): number =>
  plan.fillTriangleCount * 3 * FLOATS_PER_VERTEX;

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
    expect(plan.clear).toEqual([0x49 / 255, 0x92 / 255, 0xdb / 255]);
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
    // The Eris arrival Pose stands in cell 07-08: 4 of the workspace's 207 placements are in
    // it, and the 7 objects on the Body are drawn wherever they stand (#370, #373).
    expect(surface.placements).toHaveLength(207);
    expect(here).toHaveLength(4);
    expect(objects).toHaveLength(7);
    const plan = planErisFrame(surface, pose, doc);
    const drawnOnly = planErisFrame(
      surfaceOf([...new Set([...here, ...objects])]),
      pose,
      doc
    );
    expect(plan.triangleCount).toBe(drawnOnly.triangleCount);
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
      // Red, and no face order: only ground records carry one.
      expect(view.slice(3)).toEqual([1, 0, 0, 0]);
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

  test('lays the authored fill under the walk, below the recovered faces', async () => {
    const { doc, surface } = await load();
    const plan = planErisFrame(surface, startPose(doc), doc);
    const fill = Array.from(plan.vertices.slice(0, fillFloats(plan)));
    const at = (offset: number) =>
      fill.filter((_, index) => index % FLOATS_PER_VERTEX === offset);
    // The fill surrounds the camera rather than sitting a cell away: a ground plane this far
    // below the eye projects into a pixel at the horizon by the next cell along (#221).
    expect(Math.min(...at(0))).toBeLessThan(0);
    expect(Math.max(...at(0))).toBeGreaterThan(0);
    expect(Math.min(...at(2))).toBeLessThan(0);
    expect(Math.max(...at(2))).toBeGreaterThan(0);
    // It reaches the workspace edge and no further: the start is in cell $87, so the west
    // edge is closer than the east.
    const cell = surface.grid.cellUnits;
    const west = surface.grid.origin.x * cell - doc.start.position.x;
    const east = west + surface.grid.cellsPerAxis * cell;
    expect(Math.min(...at(0))).toBeCloseTo(west, 3);
    expect(Math.max(...at(0))).toBeCloseTo(east, 3);
    // Rings, not one quad: the nearest triangles are small enough that the rasteriser's
    // screen-space depth interpolation cannot lift them through the pads (#221).
    const first = fill
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
    expect(fill[3]).toBe(0);
    expect(fill[4]).toBeCloseTo(0x6d / 255, 6);
    expect(fill[5]).toBe(0);
    expect(fill[6]).toBe(0);
  });

  test('numbers each ground record face so later faces win a shared plane', async () => {
    const { doc, surface } = await load();
    const plan = planErisFrame(surface, startPose(doc), doc);
    const fill = fillFloats(plan);
    const groundEnd = fill + plan.groundTriangleCount * 3 * FLOATS_PER_VERTEX;
    const orders = (from: number, to: number) =>
      Array.from(plan.vertices.slice(from, to)).filter(
        (_, index) => index % FLOATS_PER_VERTEX === 6
      );
    // The recovered pads and aprons carry their face index; a cell's white strip is a later
    // face than its grey apron. Composed $7000 objects retain their own bounded source index,
    // so the combined ground mesh may exceed the old pre-composition 32-face ceiling.
    const groundOrders = orders(fill, groundEnd);
    expect(Math.max(...groundOrders)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...groundOrders)).toBeLessThan(1024);
    // Structures and objects do not: they resolve by layer alone.
    expect(new Set(orders(groundEnd, plan.vertices.length))).toEqual(
      new Set([0])
    );
  });
});

const fakeContext = () => {
  const calls: string[] = [];
  let compiled = 0;
  let framebuffer = 0;
  const uniforms: Record<string, number[]> = {};
  const gl = {
    activeTexture: (texture: number) => calls.push(`activeTexture:${texture}`),
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
    bufferData: (_target: number, data: Float32Array) =>
      calls.push(`buffer:${data.length}`),
    checkFramebufferStatus: () => 21,
    CLAMP_TO_EDGE: 34,
    clear: () => calls.push('clear'),
    clearColor: (r: number, g: number, b: number) =>
      calls.push(`clearColor:${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)}`),
    COLOR_BUFFER_BIT: 4,
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
    depthFunc: () => undefined,
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
    shaderSource: () => undefined,
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
    const plan = planErisFrame(surface, startPose(doc), doc);
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
    expect(fake.calls).toContain('enable:9');
    expect(fake.calls).toContain('enable:6');
    expect(fake.calls).toContain('frontFace:7');
    expect(fake.calls).toContain(`buffer:${plan.vertices.length}`);
    const fill = plan.fillTriangleCount * 3;
    const ground = plan.groundTriangleCount * 3;
    const rest = plan.triangleCount * 3 - fill - ground;
    expect(ground).toBeGreaterThan(0);
    // Structures, then the recovered ground records, then the fill, each a layer further back.
    const layered = [
      `draw:15:${fill + ground}:${rest}`,
      `draw:15:${fill}:${ground}`,
      `draw:15:0:${fill}`
    ];
    expect(fake.calls.filter(c => c.startsWith('draw:'))).toEqual([
      ...layered,
      ...layered
    ]);
    expect(fake.uniforms['depthBias']).toEqual([8e-6]);
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
    expect(fake.calls.filter(call => call.startsWith('draw:'))).toHaveLength(3);
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
      heading: origin.heading,
      lighting: erisLighting(doc, origin.heading),
      shadowEdge: 'soft'
    });
    expect(fake.compiled).toBe(6);
    expect(
      fake.calls.filter(call => call === 'texStorage:2048:2048')
    ).toHaveLength(2);
    renderer.render(plan, {
      eyeWorld: origin.position,
      heading: origin.heading,
      lighting: erisLighting(doc, origin.heading),
      shadowEdge: 'soft'
    });

    const casterDraw = `draw:15:0:${casters.length / FLOATS_PER_VERTEX}`;
    const fill = plan.fillTriangleCount * 3;
    // Two shadow maps of deduplicated casters, then the three colour layers: no ground
    // records here, so the middle layer is empty.
    const once = [
      casterDraw,
      casterDraw,
      `draw:15:${fill}:12`,
      `draw:15:${fill}:0`,
      `draw:15:0:${fill}`
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
    expect(
      fake.calls.filter(call => call.startsWith('bindSampler:'))
    ).toEqual([
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
      heading: origin.heading,
      lighting: erisLighting(doc, origin.heading)
    };

    renderer.render(plan, { ...frame, shadowEdge: 'hard' });
    // Same programs, same 2048² maps: only the sampler and the lookup change.
    expect(fake.compiled).toBe(6);
    expect(
      fake.calls.filter(call => call === 'texStorage:2048:2048')
    ).toHaveLength(2);
    expect(fake.uniforms['hardEdge']).toEqual([1]);
    expect(
      fake.calls.filter(call => call.startsWith('bindSampler:'))
    ).toEqual(['bindSampler:0:nearest', 'bindSampler:1:nearest']);

    // Switching edge between frames rebinds without reallocating.
    renderer.render(plan, { ...frame, shadowEdge: 'soft' });
    expect(fake.compiled).toBe(6);
    expect(fake.uniforms['hardEdge']).toEqual([0]);
    expect(
      fake.calls.filter(call => call.startsWith('bindSampler:')).slice(2)
    ).toEqual(['bindSampler:0:linear', 'bindSampler:1:linear']);
  });
});
