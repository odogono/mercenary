import { describe, expect, test } from 'bun:test';

import {
  ReferenceViewport,
  viewportCentre,
  viewportScale
} from '../src/projection/index.ts';
import { ScenePalette, atariSTColour, c64Colour } from '../src/scene/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import { defaultSettings } from '../src/settings/index.ts';
import { Renderer, planFrame } from '../src/shell/frame.ts';
import { createTargOrrery, type TargOrrery } from '../src/sky/index.ts';
import { World } from '../src/world/index.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const size = { height: 800, width: 1280 } as const;
const session = (): GameplaySession =>
  new GameplaySession(
    sessionContent(world, bundle, undefined),
    openingPlayer()
  );

interface UniformCall {
  readonly name: string;
  readonly values: readonly number[];
}

const uniformName = (location: WebGLUniformLocation | null): string =>
  (location as unknown as { readonly name: string }).name;

const fakeRenderer = (
  orrery?: TargOrrery
): {
  calls: string[];
  programs: number;
  renderer: Renderer;
  shaderSources: string[];
  uniforms: UniformCall[];
} => {
  const calls: string[] = [];
  const shaderSources: string[] = [];
  const uniforms: UniformCall[] = [];
  let programs = 0;
  const shader = {} as WebGLShader;
  const program = {} as WebGLProgram;
  const buffer = {} as WebGLBuffer;
  const gl = {
    ARRAY_BUFFER: 0x88_92,
    attachShader: (_program: WebGLProgram, _shader: WebGLShader) => undefined,
    bindBuffer: (_target: number, _buffer: WebGLBuffer | null) => undefined,
    BLEND: 0x0b_71,
    blendFunc: (_source: number, _destination: number) =>
      calls.push('blend-function'),
    bufferData: (_target: number, _vertices: Float32Array, _usage: number) =>
      calls.push('buffer'),
    clear: (_mask: number) => calls.push('clear'),
    clearColor: (_red: number, _green: number, _blue: number, _alpha: number) =>
      calls.push('clear-colour'),
    COLOR_BUFFER_BIT: 0x40_00,
    COMPILE_STATUS: 0x8b_81,
    compileShader: (_shader: WebGLShader) => undefined,
    createBuffer: () => buffer,
    createProgram: () => {
      programs += 1;
      return program;
    },
    createShader: (_type: number) => shader,
    disable: (capability: number) =>
      calls.push(
        capability === 0x0b_71 ? 'blend:off' : `disable:${capability}`
      ),
    disableVertexAttribArray: (_index: number) => undefined,
    drawArrays: (mode: number, _first: number, _count: number) =>
      calls.push(`draw:${String(mode)}`),
    drawArraysInstanced: (
      mode: number,
      _first: number,
      _count: number,
      instances: number
    ) => calls.push(`instanced:${String(mode)}:${String(instances)}`),
    enable: (capability: number) =>
      calls.push(capability === 0x0b_71 ? 'blend:on' : `enable:${capability}`),
    enableVertexAttribArray: (_index: number) => undefined,
    FLOAT: 0x14_06,
    FRAGMENT_SHADER: 0x8b_30,
    getAttribLocation: (_program: WebGLProgram, _name: string) => 0,
    getProgramInfoLog: (_program: WebGLProgram) => null,
    getProgramParameter: (_program: WebGLProgram, _parameter: number) => true,
    getShaderInfoLog: (_shader: WebGLShader) => null,
    getShaderParameter: (_shader: WebGLShader, _parameter: number) => true,
    getUniformLocation: (_program: WebGLProgram, name: string) =>
      ({ name }) as unknown as WebGLUniformLocation,
    LINES: 0x00_01,
    lineWidth: (width: number) => calls.push(`line-width:${String(width)}`),
    LINK_STATUS: 0x8b_82,
    linkProgram: (_program: WebGLProgram) => undefined,
    ONE_MINUS_SRC_ALPHA: 0x03_03,
    POINTS: 0x00_00,
    shaderSource: (_shader: WebGLShader, source: string) =>
      shaderSources.push(source),
    SRC_ALPHA: 0x03_02,
    STREAM_DRAW: 0x88_e0,
    TRIANGLE_FAN: 0x00_06,
    TRIANGLES: 0x00_04,
    uniform1f: (location: WebGLUniformLocation | null, value: number) => {
      calls.push('scalar-uniform');
      uniforms.push({ name: uniformName(location), values: [value] });
    },
    uniform2f: (
      _location: WebGLUniformLocation | null,
      _width: number,
      _height: number
    ) => {
      calls.push('viewport-uniform');
      uniforms.push({
        name: uniformName(_location),
        values: [_width, _height]
      });
    },
    uniform3f: (
      _location: WebGLUniformLocation | null,
      _red: number,
      _green: number,
      _blue: number
    ) => {
      calls.push('ink');
      uniforms.push({
        name: uniformName(_location),
        values: [_red, _green, _blue]
      });
    },
    useProgram: (_program: WebGLProgram | null) => undefined,
    VERTEX_SHADER: 0x8b_31,
    vertexAttribDivisor: (_index: number, divisor: number) =>
      calls.push(`divisor:${String(divisor)}`),
    vertexAttribPointer: (
      _index: number,
      _size: number,
      _type: number,
      _normalized: boolean,
      _stride: number,
      _offset: number
    ) => undefined,
    viewport: (_x: number, _y: number, _width: number, _height: number) =>
      calls.push('viewport')
  };
  const canvas = {
    getContext: () => gl,
    height: size.height,
    width: size.width
  };
  const renderer = new Renderer(canvas as unknown as HTMLCanvasElement, orrery);
  return {
    calls,
    renderer,
    // Read live rather than copied: the enhanced pipeline is compiled lazily, on the first
    // draw that asks for it.
    get programs() {
      return programs;
    },
    shaderSources,
    uniforms
  };
};

describe('a Session Snapshot planned for WebGL2', () => {
  test('the clipped opening surface is ground, visible Ink, then Far Points', () => {
    const frame = planFrame(world, session().snapshot, size);

    expect(frame.clear).toEqual(ScenePalette.sky);
    expect(frame.batches.map(batch => batch.mode)).toEqual([
      'triangles',
      'lines',
      'points'
    ]);
    expect(frame.batches.map(batch => batch.colour)).toEqual([
      ScenePalette.ground,
      ScenePalette.whiteInk,
      ScenePalette.whiteInk
    ]);
    expect(frame.batches[0]?.vertices.length).toBe(12);
    expect(frame.lines).toBe(4);
    expect(frame.points).toBe(1);
    expect(frame.batches.at(-1)?.pointSize).toBe(1);
  });

  test('all reach draws distant bright Ink behind every near batch', () => {
    const presentation = {
      ...defaultSettings().presentation,
      structureReach: 'all' as const
    };
    const frame = planFrame(
      world,
      session().snapshot,
      size,
      undefined,
      presentation
    );

    expect(frame.batches[0]?.mode).toBe('triangles');
    expect(frame.batches[0]?.colour).toEqual(ScenePalette.ground);
    const blackIndex = frame.batches.findIndex(
      batch =>
        batch.mode === 'lines' && batch.colour.red === ScenePalette.blackInk.red
    );
    const nearWhiteIndex = frame.batches.reduce(
      (found, batch, index) =>
        batch.colour.red === ScenePalette.whiteInk.red ? index : found,
      -1
    );
    expect(blackIndex).toBeGreaterThan(1);
    expect(nearWhiteIndex).toBeGreaterThan(blackIndex);
    expect(frame.batches.at(-1)?.mode).toBe('points');
    expect(frame.batches.at(-1)?.colour).toEqual(ScenePalette.whiteInk);
    expect(frame.lines).toBeGreaterThan(38);
    expect(frame.batches.at(-1)?.pointSize).toBe(4);

    const distantGreys = frame.batches
      .filter(
        batch =>
          batch.mode === 'lines' &&
          batch.colour.red !== ScenePalette.blackInk.red &&
          batch.colour.red !== ScenePalette.whiteInk.red
      )
      .map(batch => batch.colour.red);
    expect(new Set(distantGreys).size).toBeGreaterThan(1);
    expect(Math.min(...distantGreys)).toBe(ScenePalette.distantInk.red);
    expect(Math.max(...distantGreys)).toBeGreaterThan(
      ScenePalette.distantInk.red
    );
  });

  test('a lit Room clears to its solid Atari ST backdrop colour', () => {
    const inside = session();
    inside.teleport({ id: 3, kind: 'room' });

    const frame = planFrame(
      world,
      inside.snapshot,
      size,
      undefined,
      defaultSettings().presentation
    );

    expect(frame.clear).toEqual(
      atariSTColour(inside.snapshot.indoor!.foreground)!
    );
    expect(frame.batches.map(batch => batch.mode)).toEqual(['lines']);
    expect(frame.batches[0]?.colour).toEqual(ScenePalette.whiteInk);
    expect(frame.lines).toBeGreaterThan(0);
    expect(frame.points).toBe(0);
  });

  test('Authentic presentation retains the decoded C64 Room backdrop', () => {
    const inside = session();
    inside.teleport({ id: 3, kind: 'room' });

    const frame = planFrame(world, inside.snapshot, size);

    expect(frame.clear).toEqual(ScenePalette.blackInk);
    expect(frame.batches.map(batch => batch.mode)).toEqual([
      'triangles',
      'triangles',
      'lines'
    ]);
    expect(
      frame.batches[0]!.vertices.length + frame.batches[1]!.vertices.length
    ).toBe(320 * 6 * 2);
  });

  test('a dark Room clears black and submits no geometry at all', () => {
    const inside = session();
    inside.teleport({ id: 5, kind: 'room' });

    const frame = planFrame(world, inside.snapshot, size);

    expect(frame.clear).toEqual(ScenePalette.blackInk);
    expect(frame.batches).toEqual([]);
    expect(frame.lines).toBe(0);
    expect(frame.points).toBe(0);
  });

  test('the Escape shows its field alone, on the colour the sequence chose', () => {
    const escaping = session();
    const presented = {
      ...escaping.snapshot,
      ending: { kind: 'escape', phase: 1 } as const,
      escapePresentation: {
        colourPair: { line: 0, screen: 12 },
        points: [
          { x: 0, y: 0 },
          { x: 80, y: 68 },
          { x: 159, y: 135 }
        ]
      }
    };

    const frame = planFrame(world, presented, size);

    // The terminal loop draws points and nothing else: no world, no ground, no
    // Map Lines. The pair's second byte is what the screen is cleared to and
    // the first is what the points are drawn in.
    expect(frame.clear).toEqual(c64Colour(12)!);
    expect(frame.batches).toHaveLength(1);
    expect(frame.batches[0]?.mode).toBe('points');
    expect(frame.batches[0]?.colour).toEqual(c64Colour(0)!);
    expect(frame.lines).toBe(0);
    expect(frame.points).toBe(3);
    expect(frame.batches[0]?.pointSize).toBe(1);

    // Reference Viewport coordinates, scaled the way everything else is: the
    // centre of the field is the centre of the view.
    const centre = viewportCentre(size);
    const vertices = [...(frame.batches[0]?.vertices ?? [])];
    expect(vertices[2]).toBeCloseTo(centre.x, 5);
    expect(vertices[3]).toBeCloseTo(centre.y, 5);
    // And a logical column is two physical pixels, so the field is as wide as
    // the world view rather than half of it.
    const scale = viewportScale(size);
    expect((vertices[4] ?? 0) - (vertices[2] ?? 0)).toBeCloseTo(
      79 * ReferenceViewport.horizontalPixelScale * scale,
      5
    );
  });

  test('the Escape presents the same way under either Presentation Preset', () => {
    const escaping = session();
    const presented = {
      ...escaping.snapshot,
      ending: { kind: 'escape', phase: 255 } as const,
      escapePresentation: {
        colourPair: { line: 0, screen: 12 },
        points: [{ x: 40, y: 40 }]
      }
    };

    // The field is recovered behaviour, not an authored addition, so the
    // Enhanced preset's orrery has nothing to say about it (ADR 0025).
    const authentic = planFrame(world, presented, size);
    const enhanced = planFrame(
      world,
      presented,
      size,
      createTargOrrery(defaultSettings().presentation.sky)
    );

    expect(enhanced.clear).toEqual(authentic.clear);
    expect(enhanced.sky).toBeUndefined();
    expect(enhanced.batches).toEqual(authentic.batches);
  });

  test('an Enhanced surface carries a Sky Frame before the unchanged scene batches', () => {
    const orrery = createTargOrrery(defaultSettings().presentation.sky);
    const frame = planFrame(world, session().snapshot, size, orrery);

    expect(frame.sky?.batches.map(batch => batch.kind)).toEqual(['outerMoon']);
    expect(frame.sky).toBeDefined();
    expect(frame.clear).toEqual(frame.sky!.clear);
    expect(frame.batches.map(batch => batch.mode)).toEqual([
      'triangles',
      'lines',
      'points'
    ]);
  });

  test('never carries the Enhanced sky into a Room', () => {
    const inside = session();
    inside.teleport({ id: 3, kind: 'room' });
    const orrery = createTargOrrery(defaultSettings().presentation.sky);
    const frame = planFrame(
      world,
      inside.snapshot,
      size,
      orrery,
      defaultSettings().presentation
    );

    expect(frame.sky).toBeUndefined();
    expect(frame.clear).toEqual(
      atariSTColour(inside.snapshot.indoor!.foreground)!
    );
  });
});

describe('a Session Snapshot submitted to WebGL2', () => {
  test('compiles the sky program only when an Enhanced orrery is supplied', () => {
    const orrery = createTargOrrery(defaultSettings().presentation.sky);
    const enhanced = fakeRenderer(orrery);

    expect(fakeRenderer().programs).toBe(1);
    expect(enhanced.programs).toBe(2);
    expect(
      enhanced.shaderSources.some(source =>
        source.includes('gl_PointSize = 2.0;')
      )
    ).toBeTrue();
  });

  test('surface commands clear, then draw ground, clipped Ink and Far Points', () => {
    const { calls, renderer } = fakeRenderer();

    renderer.draw(world, session().snapshot, size);

    expect(calls).toEqual([
      'viewport',
      'viewport-uniform',
      'line-width:1',
      'clear-colour',
      'clear',
      'ink',
      'buffer',
      'draw:4',
      'ink',
      'buffer',
      'draw:1',
      'ink',
      'scalar-uniform',
      'buffer',
      'draw:0'
    ]);
  });

  test('submits a four-pixel Enhanced Far Point and one-pixel Authentic Far Point', () => {
    const authentic = fakeRenderer();
    authentic.renderer.render(planFrame(world, session().snapshot, size));
    expect(authentic.uniforms).toContainEqual({
      name: 'pointSize',
      values: [1]
    });

    const enhanced = fakeRenderer();
    enhanced.renderer.render(
      planFrame(
        world,
        session().snapshot,
        size,
        undefined,
        defaultSettings().presentation
      )
    );
    expect(enhanced.uniforms).toContainEqual({
      name: 'pointSize',
      values: [4]
    });
  });

  test('compiles the enhanced ink program only when a draw asks for it', () => {
    const plain = fakeRenderer();
    expect(plain.programs).toBe(1);
    plain.renderer.draw(world, session().snapshot, size);
    expect(plain.programs).toBe(1);

    const bold = fakeRenderer();
    bold.renderer.draw(world, session().snapshot, size, {
      glow: 0,
      thickness: 2
    });
    expect(bold.programs).toBe(2);
    expect(
      bold.shaderSources.some(source => source.includes('endpoints'))
    ).toBeTrue();
    // The quad must span the whole segment, extended by the extent — expanding by the extent
    // alone drew every line as a short blob centred on its midpoint.
    const vertex = bold.shaderSources.find(source =>
      source.includes('lineSpace')
    );
    expect(vertex?.includes('spanLength * 0.5 + extent')).toBeTrue();
  });

  test('a bold Ink request routes line batches through instanced quads', () => {
    const { calls, renderer, uniforms } = fakeRenderer();

    renderer.draw(world, session().snapshot, size, {
      glow: 0,
      thickness: 2
    });

    // The surviving Ink batch becomes a blended instance draw; ground
    // triangles and Far Points are untouched.
    const instanced = calls.filter(call => call.startsWith('instanced'));
    expect(instanced).toHaveLength(1);
    for (const call of instanced) {
      expect(call.startsWith('instanced:4:')).toBeTrue();
    }
    expect(calls).toContain('blend:on');
    expect(calls).toContain('divisor:0');
    expect(calls).toContain('draw:4');
    expect(calls).toContain('draw:0');
    // The quad reaches one feather past the two-pixel core even without glow.
    expect(
      uniforms.filter(uniform => uniform.name === 'extent')
    ).toContainEqual({ name: 'extent', values: [1.75] });
    expect(uniforms).toContainEqual({ name: 'halfWidth', values: [1] });
  });

  test('a glowing Ink request widens the quad by the glow spread', () => {
    const { calls, renderer, uniforms } = fakeRenderer();

    renderer.draw(world, session().snapshot, size, {
      glow: 0.5,
      thickness: 1
    });

    expect(calls.filter(call => call.startsWith('instanced'))).toHaveLength(1);
    expect(
      uniforms.filter(uniform => uniform.name === 'extent')
    ).toContainEqual({ name: 'extent', values: [0.5 + 8 * 0.5] });
    expect(uniforms).toContainEqual({ name: 'halo', values: [0.5] });
  });

  test('a lit Room clears once and submits only its Ink', () => {
    const inside = session();
    inside.teleport({ id: 3, kind: 'room' });
    const { calls, renderer } = fakeRenderer();

    renderer.draw(
      world,
      inside.snapshot,
      size,
      undefined,
      defaultSettings().presentation
    );

    expect(calls.filter(call => call.startsWith('draw:'))).toEqual(['draw:1']);
  });

  test('a dark Room clears without submitting any geometry', () => {
    const inside = session();
    inside.teleport({ id: 5, kind: 'room' });
    const { calls, renderer } = fakeRenderer();

    renderer.draw(world, inside.snapshot, size);

    expect(calls).toEqual([
      'viewport',
      'viewport-uniform',
      'line-width:1',
      'clear-colour',
      'clear'
    ]);
  });

  test('an Enhanced surface blends its sky before the unchanged scene passes', () => {
    const orrery = createTargOrrery(defaultSettings().presentation.sky);
    const { calls, renderer } = fakeRenderer(orrery);

    renderer.draw(world, session().snapshot, size);

    expect(
      calls.filter(call => call.startsWith('blend') || call.startsWith('draw'))
    ).toEqual([
      'blend:on',
      'blend-function',
      'draw:6',
      'blend:off',
      'draw:4',
      'draw:1',
      'draw:0'
    ]);
  });

  test('submits the authored moon and star shader inputs', () => {
    const orrery = createTargOrrery(defaultSettings().presentation.sky);
    const opening = session().snapshot;
    const expectedMoon = planFrame(world, opening, size, orrery).sky!
      .batches[0]!;
    const { renderer, uniforms } = fakeRenderer(orrery);

    renderer.draw(world, opening, size);

    expect(
      uniforms.filter(call =>
        ['litInk', 'darkInk', 'phaseCosine', 'phased', 'pointPass'].includes(
          call.name
        )
      )
    ).toEqual([
      {
        name: 'litInk',
        values: [0xb8 / 255, 0xc8 / 255, 0xd8 / 255]
      },
      {
        name: 'darkInk',
        values: [0x10 / 255, 0x18 / 255, 0x20 / 255]
      },
      { name: 'phaseCosine', values: [expectedMoon.phaseCosine] },
      { name: 'phased', values: [1] },
      { name: 'pointPass', values: [0] }
    ]);

    const night = {
      ...opening,
      elapsed: 720,
      player: { ...opening.player, heading: -Math.PI / 2 }
    };
    const nightRenderer = fakeRenderer(orrery);
    nightRenderer.renderer.draw(world, night, size);
    expect(
      nightRenderer.uniforms
        .filter(call => call.name === 'pointPass')
        .map(call => call.values[0])
    ).toContain(1);
  });
});
