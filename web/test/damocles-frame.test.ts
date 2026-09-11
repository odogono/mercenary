import { describe, expect, test } from 'bun:test';

import { parseCatalogue, type Mesh } from '../src/catalogue/data.ts';
import {
  readErisPresentation,
  type ErisPresentationDocument
} from '../src/damocles/documents.ts';
import { planErisFrame } from '../src/damocles/frame.ts';
import { ErisRenderer } from '../src/damocles/renderer.ts';
import {
  erisSurfaceFrom,
  startPose,
  type ErisPlacement,
  type ErisSurface
} from '../src/damocles/world.ts';

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

const origin = { heading: 0, position: { x: 0, y: 63, z: 0 } };

describe('an Eris frame in Filled Presentation', () => {
  test('emits the ground and every decoded face, and nothing for the unrecovered', async () => {
    const { doc, surface } = await load();
    const plan = planErisFrame(surface, startPose(doc), doc);
    const decodedFaces = surface.placements.reduce(
      (sum, p) => sum + (p.mesh?.faces.length ?? 0),
      0
    );
    // Every face is at least one triangle; the ground is two, both ways round.
    expect(plan.triangleCount).toBeGreaterThanOrEqual(decodedFaces + 4);
    expect(plan.vertices).toHaveLength(plan.triangleCount * 3 * 6);
    expect(plan.skippedFaces).toBe(0);
    expect(plan.clear).toEqual([0x49 / 255, 0x92 / 255, 0xdb / 255]);
    const withoutMeshes = surfaceOf(
      surface.placements.filter(p => p.mesh === undefined)
    );
    expect(
      planErisFrame(withoutMeshes, startPose(doc), doc).triangleCount
    ).toBe(4);
  });

  test('puts a face straight ahead at positive view depth in its own colour', async () => {
    const { doc } = await load();
    const plan = planErisFrame(surfaceOf([placement(square())]), origin, doc);
    expect(plan.triangleCount).toBe(4 + 2);
    // Skip the ground's twelve vertices; the face's corners follow, in the triangulator's order.
    for (let corner = 72; corner < plan.vertices.length; corner += 6) {
      const view = Array.from(plan.vertices.slice(corner, corner + 6));
      expect(Math.abs(view[0]!)).toBeCloseTo(10, 3);
      expect(view[1]).toBeCloseTo(-63, 3);
      expect(Math.abs(view[2]! - 1000)).toBeCloseTo(10, 3);
      expect(view.slice(3)).toEqual([1, 0, 0]);
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
    const firstFace = Array.from(single.vertices.slice(72, 72 + 18));
    const reversed = Array.from(double.vertices.slice(72 + 36, 72 + 54));
    expect(reversed.slice(0, 3)).toEqual(firstFace.slice(12, 15));
    expect(reversed.slice(12, 15)).toEqual(firstFace.slice(0, 3));
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
    const seen = (at: { x: number; z: number }, heading: number) =>
      Array.from(
        planErisFrame(
          surfaceOf([placement(mesh, { x: at.x, y: 0, z: at.z })]),
          { ...origin, heading },
          doc
        ).vertices.slice(72, 75)
      );
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
    const at = (document: ErisPresentationDocument, heading: number) =>
      Array.from(
        planErisFrame(
          surfaceOf([{ ...placement(mesh, { x: 0, y: 0, z: 0 }), heading }]),
          origin,
          document
        ).vertices.slice(72, 75)
      );
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
    expect(plan.triangleCount).toBe(4);
    expect(plan.skippedFaces).toBe(0);
  });
});

const fakeContext = () => {
  const calls: string[] = [];
  let compiled = 0;
  const uniforms: Record<string, number[]> = {};
  const gl = {
    ARRAY_BUFFER: 1,
    attachShader: () => undefined,
    BACK: 2,
    bindBuffer: () => undefined,
    bufferData: (_target: number, data: Float32Array) =>
      calls.push(`buffer:${data.length}`),
    clear: () => calls.push('clear'),
    clearColor: (r: number, g: number, b: number) =>
      calls.push(`clearColor:${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)}`),
    COLOR_BUFFER_BIT: 4,
    COMPILE_STATUS: 5,
    compileShader: () => {
      compiled += 1;
    },
    createBuffer: () => ({}),
    createProgram: () => ({}),
    createShader: () => ({}),
    CULL_FACE: 6,
    cullFace: () => calls.push('cullFace'),
    CW: 7,
    deleteShader: () => undefined,
    DEPTH_BUFFER_BIT: 8,
    DEPTH_TEST: 9,
    depthFunc: () => undefined,
    disable: (flag: number) => calls.push(`disable:${flag}`),
    drawArrays: (mode: number, first: number, count: number) =>
      calls.push(`draw:${mode}:${first}:${count}`),
    DYNAMIC_DRAW: 10,
    enable: (flag: number) => calls.push(`enable:${flag}`),
    enableVertexAttribArray: () => undefined,
    FLOAT: 11,
    FRAGMENT_SHADER: 12,
    frontFace: (mode: number) => calls.push(`frontFace:${mode}`),
    getAttribLocation: () => 0,
    getProgramParameter: () => true,
    getShaderParameter: () => true,
    getUniformLocation: (_p: unknown, name: string) => name,
    isContextLost: () => false,
    LEQUAL: 13,
    LINK_STATUS: 14,
    linkProgram: () => undefined,
    shaderSource: () => undefined,
    TRIANGLES: 15,
    uniform1f: (name: string, value: number) => {
      uniforms[name] = [value];
    },
    uniform2f: (name: string, a: number, b: number) => {
      uniforms[name] = [a, b];
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
    expect(fake.calls.filter(c => c.startsWith('draw:'))).toEqual([
      `draw:15:0:${plan.triangleCount * 3}`,
      `draw:15:0:${plan.triangleCount * 3}`
    ]);
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
});
