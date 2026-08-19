import {
  leanTransform,
  transformed,
  type Point,
  type Rect,
  type ScreenLine,
  type Size
} from '../projection/index.ts';
import { ScenePalette, type RGB8 } from '../scene/index.ts';

/// A throwaway WebGL2 line list, standing up the first browser pixels.
///
/// Deliberately the smallest thing that can draw one frame: no scene graph, no engine, no
/// dependency (ADR 0019 — the renderer is a line list owned outright). The real one is #95,
/// which owns the two-pass ink renderer, the indoor backdrop, timing and input. What this has
/// to earn is the WebGL2 assumption underneath all of that, and it earns it by putting a frame
/// on screen that a maintainer can hold beside a `FrameCapture` PNG.
///
/// **Y is flipped here and nowhere else.** The projection is in Y-down pixel space, as the
/// Reference Build computes it and as the Golden Traces record it. Clip space is Y-up, so the
/// vertex shader below is the one place the two meet.

const VERTEX_SHADER = `#version 300 es
in vec2 pixel;
uniform vec2 viewport;
void main() {
  vec2 clip = vec2(
    pixel.x / viewport.x * 2.0 - 1.0,
    1.0 - pixel.y / viewport.y * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 ink;
out vec4 colour;
void main() {
  colour = vec4(ink, 1.0);
}`;

const compile = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(shader) ?? 'no log'}`);
  }
  return shader;
};

const linked = (gl: WebGL2RenderingContext): WebGLProgram => {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program: ${gl.getProgramInfoLog(program) ?? 'no log'}`);
  }
  return program;
};

const channels = (colour: RGB8): [number, number, number] => [
  colour.red / 255,
  colour.green / 255,
  colour.blue / 255
];

/// The four corners of the ground fill, leaned about the view's centre, as two triangles.
const groundVertices = (
  ground: { lean: number; rect: Rect },
  size: Size
): Float32Array => {
  const lean = leanTransform(ground.lean, size);
  const { rect } = ground;
  const corner = (x: number, y: number): Point => transformed(lean, { x, y });
  const topLeft = corner(rect.x, rect.y);
  const topRight = corner(rect.x + rect.width, rect.y);
  const bottomRight = corner(rect.x + rect.width, rect.y + rect.height);
  const bottomLeft = corner(rect.x, rect.y + rect.height);
  return new Float32Array(
    [topLeft, topRight, bottomRight, topLeft, bottomRight, bottomLeft].flatMap(
      point => [point.x, point.y]
    )
  );
};

const lineVertices = (lines: readonly ScreenLine[]): Float32Array => {
  const out = new Float32Array(lines.length * 4);
  for (const [index, line] of lines.entries()) {
    out[index * 4] = line.x1;
    out[index * 4 + 1] = line.y1;
    out[index * 4 + 2] = line.x2;
    out[index * 4 + 3] = line.y2;
  }
  return out;
};

/// Far points are a one-pixel fill in the headless renderer, whose rectangle starts at the
/// projected coordinate; a GL point lands on the pixel it falls inside, so it is nudged to
/// that pixel's centre and covers the same one.
const pointVertices = (points: readonly Point[]): Float32Array => {
  const out = new Float32Array(points.length * 2);
  for (const [index, point] of points.entries()) {
    out[index * 2] = point.x + 0.5;
    out[index * 2 + 1] = point.y + 0.5;
  }
  return out;
};

export interface FrameContent {
  readonly blackInk: readonly ScreenLine[];
  /// The ground fill exactly as the camera described it: a rectangle in unrolled screen space
  /// and the angle to lean it by.
  readonly ground: { readonly lean: number; readonly rect: Rect };
  readonly points: readonly Point[];
  readonly size: Size;
  readonly whiteInk: readonly ScreenLine[];
}

/// The context, program and buffer one canvas draws every frame through.
///
/// A class rather than a function that sets all this up per call, because the page went from
/// drawing one frame to drawing one per `requestAnimationFrame`: compiling the two shaders,
/// linking, re-querying the locations and creating a buffer on each of those is both the most
/// expensive thing in the frame and a leak, since WebGL objects are not collected with the
/// closure that made them. Everything that does not change between frames is resolved once here,
/// and `draw` does only the work that does.
export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly ink: WebGLUniformLocation | null;
  private readonly viewport: WebGLUniformLocation | null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (gl === null) {
      throw new Error('this browser has no WebGL2 context to draw into');
    }
    const program = linked(gl);
    gl.useProgram(program);
    this.ink = gl.getUniformLocation(program, 'ink');
    this.viewport = gl.getUniformLocation(program, 'viewport');
    const pixel = gl.getAttribLocation(program, 'pixel');
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.enableVertexAttribArray(pixel);
    gl.vertexAttribPointer(pixel, 2, gl.FLOAT, false, 0, 0);
    this.canvas = canvas;
    this.gl = gl;
  }

  private pass(mode: number, vertices: Float32Array, colour: RGB8): void {
    if (vertices.length === 0) {
      return;
    }
    this.gl.uniform3f(this.ink, ...channels(colour));
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STREAM_DRAW);
    this.gl.drawArrays(mode, 0, vertices.length / 2);
  }

  /// Draw one frame, in the order the headless renderer draws it: sky, ground, the dim ink pass,
  /// the bright one, then the far points.
  draw(content: FrameContent): void {
    const gl = this.gl;
    // The canvas is sized once by the caller, but the viewport is read here so a resize between
    // frames needs nothing else to be rebuilt.
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.viewport, this.canvas.width, this.canvas.height);

    gl.clearColor(...channels(ScenePalette.sky), 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.pass(
      gl.TRIANGLES,
      groundVertices(content.ground, content.size),
      ScenePalette.ground
    );
    this.pass(gl.LINES, lineVertices(content.blackInk), ScenePalette.blackInk);
    this.pass(gl.LINES, lineVertices(content.whiteInk), ScenePalette.whiteInk);
    this.pass(gl.POINTS, pointVertices(content.points), ScenePalette.whiteInk);
  }
}
