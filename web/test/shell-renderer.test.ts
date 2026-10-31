import { describe, expect, test } from 'bun:test';

import {
  Camera,
  ReferenceViewport,
  projectFrame,
  viewportCentre,
  viewportScale,
  visible
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
import { Ink, World } from '../src/world/index.ts';
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
    activeTexture: () => undefined,
    ARRAY_BUFFER: 0x88_92,
    attachShader: (_program: WebGLProgram, _shader: WebGLShader) => undefined,
    bindBuffer: (_target: number, _buffer: WebGLBuffer | null) => undefined,
    bindFramebuffer: () => undefined,
    bindTexture: () => undefined,
    BLEND: 0x0b_71,
    blendEquation: () => undefined,
    blendFunc: (_source: number, _destination: number) =>
      calls.push('blend-function'),
    bufferData: (_target: number, _vertices: Float32Array, _usage: number) =>
      calls.push('buffer'),
    checkFramebufferStatus: () => 0x8c_d5,
    clear: (_mask: number) => calls.push('clear'),
    clearColor: (_red: number, _green: number, _blue: number, _alpha: number) =>
      calls.push('clear-colour'),
    COLOR_BUFFER_BIT: 0x40_00,
    COMPILE_STATUS: 0x8b_81,
    compileShader: (_shader: WebGLShader) => undefined,
    createBuffer: () => buffer,
    createFramebuffer: () => ({}),
    createProgram: () => {
      programs += 1;
      return program;
    },
    createShader: (_type: number) => shader,
    createTexture: () => ({}),
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
    FRAMEBUFFER_COMPLETE: 0x8c_d5,
    framebufferTexture2D: () => undefined,
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
    texImage2D: () => undefined,
    texParameteri: () => undefined,
    TRIANGLE_FAN: 0x00_06,
    TRIANGLES: 0x00_04,
    uniform1f: (location: WebGLUniformLocation | null, value: number) => {
      calls.push('scalar-uniform');
      uniforms.push({ name: uniformName(location), values: [value] });
    },
    uniform1i: () => undefined,
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
    vertexAttrib3f: () => undefined,
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
  test('shows the decoded Sights only while functional slot 40 is carried', () => {
    const gameplay = session();
    expect(planFrame(world, gameplay.snapshot, size).overlays).toEqual([]);

    gameplay.carry(39);
    expect(planFrame(world, gameplay.snapshot, size).overlays).toEqual([]);

    gameplay.carry(40);
    const authentic = planFrame(world, gameplay.snapshot, size);
    const enhanced = planFrame(
      world,
      gameplay.snapshot,
      size,
      undefined,
      defaultSettings().presentation
    );
    expect(authentic.overlays).toHaveLength(1);
    expect(enhanced.overlays).toEqual(authentic.overlays);
    expect(authentic.overlays[0]?.colour).toEqual(c64Colour(15)!);
    expect(authentic.overlays[0]?.vertices).toHaveLength(16 * 6 * 2);

    gameplay.drop(40);
    expect(planFrame(world, gameplay.snapshot, size).overlays).toEqual([]);
  });

  test('places and scales the fixed Reference Viewport bitmap without projection', () => {
    const gameplay = session();
    gameplay.carry(40);

    const reference = planFrame(world, gameplay.snapshot, {
      height: ReferenceViewport.height,
      width: ReferenceViewport.width
    }).overlays[0]!;
    expect(reference.origin).toEqual({ x: 136, y: 66 });
    expect(reference.pixelScale).toEqual({ x: 2, y: 2 });
    expect(Math.min(...reference.vertices.filter((_, i) => i % 2 === 0))).toBe(
      136
    );
    expect(Math.max(...reference.vertices.filter((_, i) => i % 2 === 0))).toBe(
      184
    );
    expect(Math.min(...reference.vertices.filter((_, i) => i % 2 === 1))).toBe(
      66
    );
    expect(Math.max(...reference.vertices.filter((_, i) => i % 2 === 1))).toBe(
      68
    );

    const doubled = planFrame(world, gameplay.snapshot, {
      height: ReferenceViewport.height * 2,
      width: ReferenceViewport.width * 2
    }).overlays[0]!;
    expect(Math.min(...doubled.vertices.filter((_, i) => i % 2 === 0))).toBe(
      272
    );
    expect(Math.max(...doubled.vertices.filter((_, i) => i % 2 === 0))).toBe(
      368
    );
    expect(Math.min(...doubled.vertices.filter((_, i) => i % 2 === 1))).toBe(
      132
    );
    expect(Math.max(...doubled.vertices.filter((_, i) => i % 2 === 1))).toBe(
      136
    );
  });

  test('composites carried Sights after dark Room and Ending frames', () => {
    const gameplay = session();
    gameplay.carry(40);
    gameplay.teleport({ id: 5, kind: 'room' });
    const dark = planFrame(world, gameplay.snapshot, size);
    expect(dark.batches).toEqual([]);
    expect(dark.overlays[0]?.colour).toEqual(c64Colour(1)!);

    const ending = planFrame(
      world,
      {
        ...gameplay.snapshot,
        ending: { kind: 'escape', phase: 1 },
        escapePresentation: {
          colourPair: { line: 0, screen: 12 },
          points: [{ x: 80, y: 68 }]
        }
      },
      size
    );
    expect(ending.batches[0]?.mode).toBe('points');
    expect(ending.overlays).toHaveLength(1);
  });

  test('restores Sights visibility from saved carrying state without separate state', () => {
    const content = sessionContent(world, bundle, undefined);
    const carried = new GameplaySession(content, openingPlayer());
    carried.carry(40);
    carried.settle();
    const restored = GameplaySession.restore(
      content,
      undefined,
      carried.captureSaveSnapshot()
    );
    expect(planFrame(world, restored.snapshot, size).overlays).toHaveLength(1);

    const absent = new GameplaySession(content, openingPlayer());
    const absentRestored = GameplaySession.restore(
      content,
      undefined,
      absent.captureSaveSnapshot()
    );
    expect(planFrame(world, absentRestored.snapshot, size).overlays).toEqual(
      []
    );
  });

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

  test('all reach draws roads behind distant and nearby bright Ink', () => {
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
    expect(blackIndex).toBe(1);
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

  test('positions the Orrery with presentation time without changing the Session Snapshot', () => {
    const orrery = createTargOrrery(defaultSettings().presentation.sky);
    const snapshot = session().snapshot;

    expect(
      planFrame(world, snapshot, size, orrery).sky?.gradient
    ).toBeUndefined();
    expect(
      planFrame(world, snapshot, size, orrery, {
        ...defaultSettings().presentation,
        orreryElapsed: 9 * 60
      }).sky?.gradient
    ).toBeDefined();
    expect(snapshot.elapsed).toBe(0);
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

test('a Lift Journey carries its recovered moving split and line colour into the frame plan', () => {
  const snapshot = session().snapshot;
  const frame = planFrame(
    world,
    {
      ...snapshot,
      liftJourney: {
        destination: { id: 1, kind: 'room' },
        direction: 'down',
        lineColour: 6,
        pitchHighByte: 5,
        position: 80,
        scene: 'surface',
        screenSplit: 130,
        stage: 10
      }
    },
    size
  );

  expect(frame.liftWipe).toEqual({ lineColour: c64Colour(6)!, split: 130 });
  expect(frame.batches.every(batch => batch.mode === 'triangles')).toBe(true);
  expect(frame.lines).toBe(0);
  expect(frame.points).toBe(0);
  const bar = frame.batches.find(
    batch => batch.mode === 'triangles' && batch.colour === c64Colour(6)
  );
  expect(bar).toBeDefined();
  const xs = Array.from(bar!.vertices).filter((_, index) => index % 2 === 0);
  const ys = Array.from(bar!.vertices).filter((_, index) => index % 2 === 1);
  const scale = viewportScale(size);
  const centre = viewportCentre(size);
  expect(new Set(xs)).toEqual(new Set([0, size.width]));
  expect(new Set(ys)).toEqual(
    new Set([
      centre.y - (ReferenceViewport.height * scale) / 2 + (130 - 50) * scale,
      size.height
    ])
  );
});

test('the final ascent bar shrinks downward to reveal the surface above it', () => {
  const snapshot = session().snapshot;
  for (const position of [0, 66, 131]) {
    const frame = planFrame(
      world,
      {
        ...snapshot,
        liftJourney: {
          destination: { kind: 'surface' },
          direction: 'up',
          lineColour: 0,
          pitchHighByte: 2,
          position,
          scene: 'surface',
          screenSplit: position + 50,
          stage: 13,
          upperColour: 0
        }
      },
      size
    );
    const bar = frame.batches.at(-1)!;
    const ys = Array.from(bar.vertices).filter((_, index) => index % 2 === 1);
    const boundary =
      viewportCentre(size).y -
      (ReferenceViewport.height * viewportScale(size)) / 2 +
      position * viewportScale(size);
    expect(bar.colour).toEqual(c64Colour(0)!);
    expect(Math.min(...ys)).toBe(boundary);
    expect(Math.max(...ys)).toBe(size.height);
  }
});

describe('a Session Snapshot submitted to WebGL2', () => {
  test('submits fixed-screen Sights after every scene batch', () => {
    const gameplay = session();
    gameplay.carry(40);
    const rendered = fakeRenderer();

    rendered.renderer.render(planFrame(world, gameplay.snapshot, size));

    const draws = rendered.calls.filter(call => call.startsWith('draw:'));
    expect(draws.at(-2)).toBe('draw:0');
    expect(draws.at(-1)).toBe('draw:4');
  });

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
    expect(bold.programs).toBe(3);
    expect(
      bold.shaderSources.some(source => source.includes('endpoints'))
    ).toBeTrue();
    // The quad must span the whole segment, extended by the extent — expanding by the extent
    // alone drew every line as a short blob centred on its midpoint.
    const vertex = bold.shaderSources.find(source =>
      source.includes('lineAxis = axis')
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

  test('draws the world-aligned twilight gradient before blended sky bodies', () => {
    const orrery = createTargOrrery(defaultSettings().presentation.sky);
    const twilight = { ...session().snapshot, elapsed: 540 };
    const planned = planFrame(world, twilight, size, orrery);
    const { calls, renderer, shaderSources, uniforms } = fakeRenderer(orrery);

    expect(planned.sky?.gradient).toBeDefined();
    renderer.draw(world, twilight, size);

    const drawsAndBlend = calls.filter(
      call => call.startsWith('blend') || call.startsWith('draw')
    );
    expect(drawsAndBlend[0]).toBe('draw:4');
    expect(drawsAndBlend.indexOf('draw:4')).toBeLessThan(
      drawsAndBlend.indexOf('blend:on')
    );
    expect(uniforms).toContainEqual({ name: 'gradientPass', values: [1] });
    expect(uniforms).toContainEqual({ name: 'gradientPass', values: [0] });
    expect(uniforms).toContainEqual({
      name: 'gradientUpInView',
      values: [
        planned.sky!.gradient!.upInView.x,
        planned.sky!.gradient!.upInView.y,
        planned.sky!.gradient!.upInView.z
      ]
    });
    expect(
      shaderSources.some(
        source =>
          source.includes('asin(clamp(dot(viewDirection, gradientUpInView)') &&
          source.includes('smoothstep(0.0, radians(30.0), elevation)')
      )
    ).toBeTrue();
  });

  test('does not submit a gradient outside twilight', () => {
    const orrery = createTargOrrery(defaultSettings().presentation.sky);
    const { renderer, uniforms } = fakeRenderer(orrery);

    renderer.draw(world, session().snapshot, size);

    expect(
      uniforms.some(
        uniform => uniform.name === 'gradientPass' && uniform.values[0] === 1
      )
    ).toBeFalse();
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

test('Enhanced frame separates Map Lines without changing projected geometry', () => {
  const opening = session().snapshot;
  const snapshot = {
    ...opening,
    player: {
      ...opening.player,
      heading: Math.PI,
      pitch: -0.5,
      position: { x: 0, y: 5000, z: 0 },
      roll: 0
    }
  };
  const authentic = planFrame(world, snapshot, size);
  const enhanced = planFrame(world, snapshot, size, undefined, {
    preset: 'enhanced',
    structureReach: 'cell'
  });
  const roadBatches = enhanced.batches.filter(batch => batch.style === 'roads');
  expect(roadBatches.length).toBeGreaterThan(0);
  const selected = visible(world, snapshot.player.position);
  const projected = projectFrame(new Camera(snapshot.player), selected, size);
  const expectedRoads = [...projected.roads].flatMap(line => [
    line.x1,
    line.y1,
    line.x2,
    line.y2
  ]);
  expect(roadBatches.flatMap(batch => Array.from(batch.vertices))).toEqual(
    expectedRoads
  );
  expect(selected.roadSegments?.size).toBeGreaterThanOrEqual(
    world.mapSegments(snapshot.player.position).length
  );
  expect(enhanced.lines).toBe(authentic.lines);
  const segments = (frame: typeof enhanced) =>
    frame.batches
      .filter(batch => batch.mode === 'lines')
      .flatMap(batch =>
        Array.from(
          { length: batch.vertices.length / 4 },
          (_, index) =>
            `${JSON.stringify(batch.colour)}:${Array.from(batch.vertices.slice(index * 4, index * 4 + 4)).join(',')}`
        )
      )
      .sort();
  expect(segments(enhanced)).toEqual(segments(authentic));
});

test('roads around cell 06-09 structures use road styling at both structure reaches', () => {
  const opening = session().snapshot;
  const cell = world.cell(6, 9)!;
  const snapshot = {
    ...opening,
    player: {
      ...opening.player,
      heading: 0,
      pitch: -Math.PI / 2,
      position: { ...cell.centre, y: 12_000 },
      roll: 0
    }
  };
  const camera = new Camera(snapshot.player);
  const roadLines = cell
    .segments(0, world.roadWorkspace(cell))
    .filter(segment => segment.ink === Ink.black)
    .flatMap(segment => {
      const line = camera.projectSegment(segment, size);
      return line ? [[line.x1, line.y1, line.x2, line.y2]] : [];
    });
  expect(roadLines.length).toBeGreaterThan(0);
  for (const structureReach of ['cell', 'all'] as const) {
    const frame = planFrame(world, snapshot, size, undefined, {
      preset: 'enhanced',
      structureReach
    });
    const roads = frame.batches
      .filter(batch => batch.style === 'roads')
      .flatMap(batch =>
        Array.from({ length: batch.vertices.length / 4 }, (_, index) =>
          Array.from(batch.vertices.slice(index * 4, index * 4 + 4))
        )
      );
    for (const line of roadLines) {
      expect(roads).toContainEqual(line);
    }
    expect(
      frame.batches.some(
        batch =>
          batch.mode === 'lines' &&
          batch.style === undefined &&
          batch.colour.red === 255
      )
    ).toBe(true);
  }
});

test('Enhanced roads are drawn behind distant and nearby bright structures', () => {
  const opening = session().snapshot;
  const cell = world.cell(6, 9)!;
  const frame = planFrame(
    world,
    {
      ...opening,
      player: {
        ...opening.player,
        heading: 0,
        pitch: -0.05,
        position: { ...cell.centre, y: 2700 },
        roll: 0
      }
    },
    size,
    undefined,
    { preset: 'enhanced', structureReach: 'all' }
  );
  const roadIndices = frame.batches.flatMap((batch, index) =>
    batch.style === 'roads' ? [index] : []
  );
  const structureIndices = frame.batches.flatMap((batch, index) =>
    batch.mode === 'lines' && batch.style === undefined && batch.colour.red > 0
      ? [index]
      : []
  );
  expect(roadIndices.length).toBeGreaterThan(0);
  expect(structureIndices.length).toBeGreaterThan(1);
  expect(Math.max(...roadIndices)).toBeLessThan(Math.min(...structureIndices));
});
