import { describe, expect, test } from 'bun:test';

import { ScenePalette } from '../src/scene/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import { Renderer, planFrame } from '../src/shell/frame.ts';
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

const fakeRenderer = (): { calls: string[]; renderer: Renderer } => {
  const calls: string[] = [];
  const shader = {} as WebGLShader;
  const program = {} as WebGLProgram;
  const location = {} as WebGLUniformLocation;
  const buffer = {} as WebGLBuffer;
  const gl = {
    ARRAY_BUFFER: 0x88_92,
    attachShader: (_program: WebGLProgram, _shader: WebGLShader) => undefined,
    bindBuffer: (_target: number, _buffer: WebGLBuffer | null) => undefined,
    bufferData: (_target: number, _vertices: Float32Array, _usage: number) =>
      calls.push('buffer'),
    clear: (_mask: number) => calls.push('clear'),
    clearColor: (_red: number, _green: number, _blue: number, _alpha: number) =>
      calls.push('clear-colour'),
    COLOR_BUFFER_BIT: 0x40_00,
    COMPILE_STATUS: 0x8b_81,
    compileShader: (_shader: WebGLShader) => undefined,
    createBuffer: () => buffer,
    createProgram: () => program,
    createShader: (_type: number) => shader,
    drawArrays: (mode: number, _first: number, _count: number) =>
      calls.push(`draw:${String(mode)}`),
    enableVertexAttribArray: (_index: number) => undefined,
    FLOAT: 0x14_06,
    FRAGMENT_SHADER: 0x8b_30,
    getAttribLocation: (_program: WebGLProgram, _name: string) => 0,
    getProgramInfoLog: (_program: WebGLProgram) => null,
    getProgramParameter: (_program: WebGLProgram, _parameter: number) => true,
    getShaderInfoLog: (_shader: WebGLShader) => null,
    getShaderParameter: (_shader: WebGLShader, _parameter: number) => true,
    getUniformLocation: (_program: WebGLProgram, _name: string) => location,
    LINES: 0x00_01,
    lineWidth: (width: number) => calls.push(`line-width:${String(width)}`),
    LINK_STATUS: 0x8b_82,
    linkProgram: (_program: WebGLProgram) => undefined,
    POINTS: 0x00_00,
    shaderSource: (_shader: WebGLShader, _source: string) => undefined,
    STREAM_DRAW: 0x88_e0,
    TRIANGLES: 0x00_04,
    uniform2f: (
      _location: WebGLUniformLocation | null,
      _width: number,
      _height: number
    ) => calls.push('viewport-uniform'),
    uniform3f: (
      _location: WebGLUniformLocation | null,
      _red: number,
      _green: number,
      _blue: number
    ) => calls.push('ink'),
    useProgram: (_program: WebGLProgram | null) => undefined,
    VERTEX_SHADER: 0x8b_31,
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
  return {
    calls,
    renderer: new Renderer(canvas as unknown as HTMLCanvasElement)
  };
};

describe('a Session Snapshot planned for WebGL2', () => {
  test('the opening surface is ground, dim Ink, bright Ink, then Far Points', () => {
    const frame = planFrame(world, session().snapshot, size);

    expect(frame.clear).toEqual(ScenePalette.sky);
    expect(frame.batches.map(batch => batch.mode)).toEqual([
      'triangles',
      'lines',
      'lines',
      'points'
    ]);
    expect(frame.batches.map(batch => batch.colour)).toEqual([
      ScenePalette.ground,
      ScenePalette.blackInk,
      ScenePalette.whiteInk,
      ScenePalette.whiteInk
    ]);
    expect(frame.batches[0]?.vertices.length).toBe(12);
    expect(frame.lines).toBe(117);
    expect(frame.points).toBe(1);
  });

  test('a lit Room starts with 320 alternating Indoor Backdrop strips', () => {
    const inside = session();
    inside.teleport({ id: 3, kind: 'room' });

    const frame = planFrame(world, inside.snapshot, size);

    expect(frame.clear).toEqual(ScenePalette.blackInk);
    expect(frame.batches.slice(0, 2).map(batch => batch.mode)).toEqual([
      'triangles',
      'triangles'
    ]);
    expect(
      frame.batches[0]!.vertices.length + frame.batches[1]!.vertices.length
    ).toBe(320 * 6 * 2);
    expect(frame.batches[0]?.colour).not.toEqual(frame.batches[1]?.colour);
    expect(frame.batches.slice(2).map(batch => batch.mode)).toEqual(['lines']);
    expect(frame.batches[2]?.colour).toEqual(ScenePalette.whiteInk);
    expect(frame.lines).toBeGreaterThan(0);
    expect(frame.points).toBe(0);
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
});

describe('a Session Snapshot submitted to WebGL2', () => {
  test('surface commands clear, then draw ground, dim Ink, bright Ink and Far Points', () => {
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
      'buffer',
      'draw:1',
      'ink',
      'buffer',
      'draw:0'
    ]);
  });

  test('a lit Room submits both backdrop halves before its Ink', () => {
    const inside = session();
    inside.teleport({ id: 3, kind: 'room' });
    const { calls, renderer } = fakeRenderer();

    renderer.draw(world, inside.snapshot, size);

    expect(calls.filter(call => call.startsWith('draw:'))).toEqual([
      'draw:4',
      'draw:4',
      'draw:1'
    ]);
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
});
