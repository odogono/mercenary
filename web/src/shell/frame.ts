import {
  Camera,
  leanTransform,
  projectFrame,
  transformed,
  visible,
  type Point,
  type Rect,
  type ScreenLine,
  type Size
} from '../projection/index.ts';
import { IndoorBackdrop, ScenePalette, type RGB8 } from '../scene/index.ts';
import type { SessionSnapshot } from '../session/index.ts';
import {
  SKY_VERTEX_FIELDS,
  buildSkyFrame,
  type SkyBatch,
  type SkyFrame
} from '../sky/frame.ts';
import { skyStateAt, type TargOrrery } from '../sky/index.ts';
import { Ink, type World } from '../world/index.ts';

/// The owned WebGL2 renderer has no scene graph, engine or runtime dependency (ADR 0019).
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

const SKY_VERTEX_SHADER = `#version 300 es
in vec2 pixel;
in vec2 disc;
in float opacity;
uniform vec2 viewport;
out vec2 localDisc;
out float localOpacity;
void main() {
  vec2 clip = vec2(
    pixel.x / viewport.x * 2.0 - 1.0,
    1.0 - pixel.y / viewport.y * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = 2.0;
  localDisc = disc;
  localOpacity = opacity;
}`;

const SKY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 litInk;
uniform vec3 darkInk;
uniform float phaseCosine;
uniform float phased;
uniform float pointPass;
in vec2 localDisc;
in float localOpacity;
out vec4 colour;
void main() {
  if (pointPass > 0.5) {
    colour = vec4(litInk, localOpacity);
    return;
  }
  float radius = length(localDisc);
  float edge = max(fwidth(radius), 0.0001);
  float coverage = 1.0 - smoothstep(1.0 - edge, 1.0, radius);
  float illuminated = 1.0;
  if (phased > 0.5) {
    float surface = sqrt(max(0.0, 1.0 - dot(localDisc, localDisc)));
    float across = sqrt(max(0.0, 1.0 - phaseCosine * phaseCosine));
    float light = localDisc.x * across + surface * phaseCosine;
    float feather = max(fwidth(light), 0.0001);
    illuminated = smoothstep(-feather, feather, light);
  }
  colour = vec4(mix(darkInk, litInk, illuminated), localOpacity * coverage);
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

const linked = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram => {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program: ${gl.getProgramInfoLog(program) ?? 'no log'}`);
  }
  return program;
};

interface SkyPipeline {
  readonly buffer: WebGLBuffer;
  readonly darkInk: WebGLUniformLocation | null;
  readonly disc: number;
  readonly litInk: WebGLUniformLocation | null;
  readonly opacity: number;
  readonly phaseCosine: WebGLUniformLocation | null;
  readonly phased: WebGLUniformLocation | null;
  readonly pixel: number;
  readonly pointPass: WebGLUniformLocation | null;
  readonly program: WebGLProgram;
  readonly viewport: WebGLUniformLocation | null;
}

const skyPipeline = (gl: WebGL2RenderingContext): SkyPipeline => {
  const program = linked(gl, SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER);
  return {
    buffer: gl.createBuffer()!,
    darkInk: gl.getUniformLocation(program, 'darkInk'),
    disc: gl.getAttribLocation(program, 'disc'),
    litInk: gl.getUniformLocation(program, 'litInk'),
    opacity: gl.getAttribLocation(program, 'opacity'),
    phaseCosine: gl.getUniformLocation(program, 'phaseCosine'),
    phased: gl.getUniformLocation(program, 'phased'),
    pixel: gl.getAttribLocation(program, 'pixel'),
    pointPass: gl.getUniformLocation(program, 'pointPass'),
    program,
    viewport: gl.getUniformLocation(program, 'viewport')
  };
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

const stripVertices = (size: Size, parity: 0 | 1): Float32Array => {
  const vertices: number[] = [];
  const width = size.width / IndoorBackdrop.columnCount;
  for (let column = parity; column < IndoorBackdrop.columnCount; column += 2) {
    const left = column * width;
    const right = (column + 1) * width;
    vertices.push(
      left,
      0,
      right,
      0,
      right,
      size.height,
      left,
      0,
      right,
      size.height,
      left,
      size.height
    );
  }
  return new Float32Array(vertices);
};

type DrawMode = 'lines' | 'points' | 'triangles';

interface DrawBatch {
  readonly colour: RGB8;
  readonly mode: DrawMode;
  readonly vertices: Float32Array;
}

export interface FramePlan {
  readonly batches: readonly DrawBatch[];
  readonly clear: RGB8;
  readonly lines: number;
  readonly points: number;
  readonly size: Size;
  readonly sky?: SkyFrame;
}

const addBatch = (
  batches: DrawBatch[],
  mode: DrawMode,
  vertices: Float32Array,
  colour: RGB8
): void => {
  if (vertices.length > 0) {
    batches.push({ colour, mode, vertices });
  }
};

/// Resolve one Session Snapshot into the ordered primitive batches WebGL2 should draw.
///
/// This is deliberately pure. Golden Traces already grade selection and projection; this plan
/// makes the presentation boundary independently inspectable without a DOM or graphics driver.
export const planFrame = (
  world: World,
  snapshot: SessionSnapshot,
  size: Size,
  orrery?: TargOrrery
): FramePlan => {
  const indoor = snapshot.indoor;
  if (indoor?.dark === true) {
    return {
      batches: [],
      clear: ScenePalette.blackInk,
      lines: 0,
      points: 0,
      size
    };
  }

  const camera = new Camera({
    ...snapshot.player,
    mirrored: snapshot.worldFlipped
  });
  const seen = visible(world, snapshot.player.position, {
    elapsed: snapshot.elapsed,
    residence: snapshot.residence,
    ...(snapshot.location.kind === 'room' ? { room: snapshot.location.id } : {})
  });
  const projected = projectFrame(camera, seen, size);
  const blackInk: ScreenLine[] = [];
  const whiteInk: ScreenLine[] = [];
  for (const line of projected.lines) {
    (line.ink === Ink.black ? blackInk : whiteInk).push(line);
  }

  const batches: DrawBatch[] = [];
  if (indoor === undefined) {
    addBatch(
      batches,
      'triangles',
      groundVertices(camera.groundFill(size), size),
      ScenePalette.ground
    );
  } else {
    const backdrop = new IndoorBackdrop(indoor.background, indoor.foreground);
    addBatch(batches, 'triangles', stripVertices(size, 0), backdrop.foreground);
    addBatch(batches, 'triangles', stripVertices(size, 1), backdrop.background);
  }
  addBatch(batches, 'lines', lineVertices(blackInk), ScenePalette.blackInk);
  addBatch(batches, 'lines', lineVertices(whiteInk), ScenePalette.whiteInk);
  addBatch(
    batches,
    'points',
    pointVertices(projected.points),
    ScenePalette.whiteInk
  );
  const sky =
    orrery === undefined || snapshot.location.kind !== 'surface'
      ? undefined
      : buildSkyFrame(
          skyStateAt(orrery, snapshot.elapsed),
          {
            heading: snapshot.player.heading,
            mirrored: snapshot.worldFlipped,
            pitch: snapshot.player.pitch,
            roll: snapshot.player.roll
          },
          size
        );
  return {
    batches,
    clear:
      sky?.clear ??
      (indoor === undefined ? ScenePalette.sky : ScenePalette.blackInk),
    lines: projected.lines.length,
    points: projected.points.length,
    size,
    ...(sky === undefined ? {} : { sky })
  };
};

/// The context, program and buffer one canvas draws every frame through.
///
/// A class rather than a function that sets all this up per call, because the page went from
/// drawing one frame to drawing one per `requestAnimationFrame`: compiling shaders, linking,
/// re-querying the locations and creating a buffer on each of those is both the most
/// expensive thing in the frame and a leak, since WebGL objects are not collected with the
/// closure that made them. Everything that does not change between frames is resolved once here,
/// and `draw` does only the work that does.
export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly ink: WebGLUniformLocation | null;
  private readonly orrery: TargOrrery | undefined;
  private readonly pixel: number;
  private readonly program: WebGLProgram;
  private readonly sceneBuffer: WebGLBuffer;
  private readonly sky: SkyPipeline | undefined;
  private readonly viewport: WebGLUniformLocation | null;

  constructor(canvas: HTMLCanvasElement, orrery?: TargOrrery) {
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (gl === null) {
      throw new Error('this browser has no WebGL2 context to draw into');
    }
    const program = linked(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    gl.useProgram(program);
    this.ink = gl.getUniformLocation(program, 'ink');
    this.viewport = gl.getUniformLocation(program, 'viewport');
    const pixel = gl.getAttribLocation(program, 'pixel');
    const sceneBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);
    gl.enableVertexAttribArray(pixel);
    gl.vertexAttribPointer(pixel, 2, gl.FLOAT, false, 0, 0);
    this.canvas = canvas;
    this.gl = gl;
    this.orrery = orrery;
    this.pixel = pixel;
    this.program = program;
    this.sceneBuffer = sceneBuffer;
    this.sky = orrery === undefined ? undefined : skyPipeline(gl);
  }

  private pass(batch: DrawBatch): void {
    const modes: Record<DrawMode, number> = {
      lines: this.gl.LINES,
      points: this.gl.POINTS,
      triangles: this.gl.TRIANGLES
    };
    this.gl.uniform3f(this.ink, ...channels(batch.colour));
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      batch.vertices,
      this.gl.STREAM_DRAW
    );
    this.gl.drawArrays(modes[batch.mode], 0, batch.vertices.length / 2);
  }

  private skyPass(frame: SkyFrame, size: Size): void {
    const sky = this.sky;
    if (sky === undefined) {
      return;
    }
    const gl = this.gl;
    const stride = SKY_VERTEX_FIELDS * Float32Array.BYTES_PER_ELEMENT;
    gl.useProgram(sky.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, sky.buffer);
    gl.uniform2f(sky.viewport, size.width, size.height);
    gl.enableVertexAttribArray(sky.pixel);
    gl.enableVertexAttribArray(sky.disc);
    gl.enableVertexAttribArray(sky.opacity);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const batch of frame.batches) {
      this.skyBatch(batch, stride, sky);
    }
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(sky.disc);
    gl.disableVertexAttribArray(sky.opacity);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneBuffer);
    gl.enableVertexAttribArray(this.pixel);
    gl.vertexAttribPointer(this.pixel, 2, gl.FLOAT, false, 0, 0);
  }

  private skyBatch(batch: SkyBatch, stride: number, sky: SkyPipeline): void {
    const gl = this.gl;
    const dark = batch.darkColour ?? batch.litColour;
    gl.bufferData(gl.ARRAY_BUFFER, batch.vertices, gl.STREAM_DRAW);
    gl.vertexAttribPointer(sky.pixel, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(
      sky.disc,
      2,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.vertexAttribPointer(
      sky.opacity,
      1,
      gl.FLOAT,
      false,
      stride,
      4 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.uniform3f(sky.litInk, ...channels(batch.litColour));
    gl.uniform3f(sky.darkInk, ...channels(dark));
    gl.uniform1f(sky.phaseCosine, batch.phaseCosine);
    gl.uniform1f(sky.phased, batch.darkColour === undefined ? 0 : 1);
    gl.uniform1f(sky.pointPass, batch.kind === 'stars' ? 1 : 0);
    gl.drawArrays(
      batch.mode === 'points' ? gl.POINTS : gl.TRIANGLE_FAN,
      0,
      batch.vertices.length / SKY_VERTEX_FIELDS
    );
  }

  /// Draw one Session Snapshot and return the counts the status strip reports.
  draw(
    world: World,
    snapshot: SessionSnapshot,
    size: Size
  ): {
    readonly lines: number;
    readonly points: number;
  } {
    const plan = planFrame(world, snapshot, size, this.orrery);
    const gl = this.gl;
    // The canvas is sized once by the caller, but the viewport is read here so a resize between
    // frames needs nothing else to be rebuilt.
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.viewport, plan.size.width, plan.size.height);
    gl.lineWidth(1);

    gl.clearColor(...channels(plan.clear), 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (plan.sky !== undefined) {
      this.skyPass(plan.sky, plan.size);
      gl.uniform2f(this.viewport, plan.size.width, plan.size.height);
    }
    for (const batch of plan.batches) {
      this.pass(batch);
    }
    return { lines: plan.lines, points: plan.points };
  }
}
