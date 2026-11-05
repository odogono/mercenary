import {
  Camera,
  REFERENCE_RULES,
  ReferenceViewport,
  leanTransform,
  projectFrame,
  referenceViewportBounds,
  transformed,
  viewportCentre,
  viewportScale,
  visible,
  type Point,
  type Rect,
  type ScreenLine,
  type Size,
  type Visible
} from '../projection/index.ts';
import {
  IndoorBackdrop,
  ScenePalette,
  atariSTColour,
  c64Colour,
  type RGB8
} from '../scene/index.ts';
import type { SessionSnapshot } from '../session/index.ts';
import {
  type PresentationPreset,
  type StructureReach
} from '../settings/index.ts';
import {
  SKY_VERTEX_FIELDS,
  buildSkyFrame,
  type SkyBatch,
  type SkyFrame
} from '../sky/frame.ts';
import { skyStateAt, type TargOrrery } from '../sky/index.ts';
import { Ink, type World } from '../world/index.ts';
import { FACE_STRIDE, faceBatch, type FaceBatch } from './faces.ts';

/// The owned WebGL2 renderer has no scene graph, engine or runtime dependency (ADR 0019).
///
/// **Y is flipped here and nowhere else.** The projection is in Y-down pixel space, as the
/// Reference Build computes it and as the Golden Traces record it. Clip space is Y-up, so the
/// vertex shader below is the one place the two meet.

const VERTEX_SHADER = `#version 300 es
in vec2 pixel;
uniform vec2 viewport;
uniform float pointSize;
void main() {
  vec2 clip = vec2(
    pixel.x / viewport.x * 2.0 - 1.0,
    1.0 - pixel.y / viewport.y * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = pointSize;
}`;

/// Filled faces carry their colour per vertex so every face draws in one call.
const FACE_VERTEX_SHADER = `#version 300 es
in vec4 vertex;
in vec3 colour;
flat out vec3 ink;
void main() {
  gl_Position = vertex;
  ink = colour;
}`;

const FACE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
flat in vec3 ink;
out vec4 colour;
void main() {
  colour = vec4(ink, 1.0);
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
uniform float gradientPass;
out vec2 localDisc;
out float localOpacity;
void main() {
  if (gradientPass > 0.5) {
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
    localDisc = vec2(0.0);
    localOpacity = 1.0;
    return;
  }
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
uniform float gradientPass;
uniform vec2 framebufferSize;
uniform vec2 viewport;
uniform vec2 gradientCentre;
uniform vec2 gradientFocal;
uniform vec3 gradientHorizon;
uniform vec3 gradientZenith;
uniform vec3 gradientUpInView;
in vec2 localDisc;
in float localOpacity;
out vec4 colour;
void main() {
  if (gradientPass > 0.5) {
    vec2 pixel = vec2(gl_FragCoord.x, framebufferSize.y - gl_FragCoord.y)
      * viewport / framebufferSize;
    vec3 viewDirection = normalize(vec3(
      (pixel.x - gradientCentre.x) / gradientFocal.x,
      (gradientCentre.y - pixel.y) / gradientFocal.y,
      1.0
    ));
    float elevation = asin(clamp(dot(viewDirection, gradientUpInView), -1.0, 1.0));
    float amount = smoothstep(0.0, radians(30.0), elevation);
    colour = vec4(mix(gradientHorizon, gradientZenith, amount), 1.0);
    return;
  }
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
  readonly framebufferSize: WebGLUniformLocation | null;
  readonly gradientCentre: WebGLUniformLocation | null;
  readonly gradientFocal: WebGLUniformLocation | null;
  readonly gradientHorizon: WebGLUniformLocation | null;
  readonly gradientPass: WebGLUniformLocation | null;
  readonly gradientUpInView: WebGLUniformLocation | null;
  readonly gradientZenith: WebGLUniformLocation | null;
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
    framebufferSize: gl.getUniformLocation(program, 'framebufferSize'),
    gradientCentre: gl.getUniformLocation(program, 'gradientCentre'),
    gradientFocal: gl.getUniformLocation(program, 'gradientFocal'),
    gradientHorizon: gl.getUniformLocation(program, 'gradientHorizon'),
    gradientPass: gl.getUniformLocation(program, 'gradientPass'),
    gradientUpInView: gl.getUniformLocation(program, 'gradientUpInView'),
    gradientZenith: gl.getUniformLocation(program, 'gradientZenith'),
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

export interface DrawBatch {
  readonly colour: RGB8;
  readonly mode: DrawMode;
  readonly pointSize: number;
  readonly vertices: Float32Array;
}

export interface FramePresentation {
  readonly orreryElapsed?: number;
  readonly preset: PresentationPreset;
  readonly structureReach: StructureReach;
}

export interface FramePlan {
  readonly batches: readonly DrawBatch[];
  /// The colour the frame starts from, or null to draw over what is already there: the
  /// passes drawn after the shared Enhanced planner's plan (ADR 0087).
  readonly clear: RGB8 | null;
  /// Every visible face in one draw, made just before `batches[before]`.
  readonly faces?: { readonly batch: FaceBatch; readonly before: number };
  readonly liftWipe?: {
    readonly lineColour: RGB8;
    readonly split: number;
  };
  readonly lines: number;
  /// Fixed Reference Viewport bitmaps composited after the complete Game Surface.
  readonly overlays: readonly BitmapOverlay[];
  readonly points: number;
  readonly size: Size;
  readonly sky?: SkyFrame;
}

export interface BitmapOverlay {
  readonly colour: RGB8;
  readonly origin: Point;
  readonly pixelScale: Point;
  readonly vertices: Float32Array;
}

const addBatch = (
  batches: DrawBatch[],
  mode: DrawMode,
  vertices: Float32Array,
  colour: RGB8,
  pointSize = 1
): void => {
  if (vertices.length > 0) {
    batches.push({ colour, mode, pointSize, vertices });
  }
};

/// Lines carrying an authored colour, one batch per colour, in the white-ink position: after
/// black ink, so they win where the two overlap.
const addColouredLines = (
  batches: DrawBatch[],
  lines: readonly ScreenLine[]
): void => {
  const byColour = new Map<string, ScreenLine[]>();
  for (const line of lines) {
    const { blue, green, red } = line.colour!;
    const key = `${red},${green},${blue}`;
    const group = byColour.get(key) ?? [];
    group.push(line);
    byColour.set(key, group);
  }
  for (const group of byColour.values()) {
    addLineBatch(batches, group, group[0]!.colour!);
  }
};

const addLineBatch = (
  batches: DrawBatch[],
  lines: readonly ScreenLine[],
  colour: RGB8
): void => {
  addBatch(batches, 'lines', lineVertices(lines), colour);
};

const AUTHENTIC_PRESENTATION: FramePresentation = {
  preset: 'authentic',
  structureReach: 'cell'
};

/// The Reference Viewport's logical centre across, in logical columns rather
/// than physical pixels: the field's own coordinates are logical.
const LOGICAL_CENTRE_X =
  ReferenceViewport.width / ReferenceViewport.horizontalPixelScale / 2;

const bitmapVertices = (
  rows: readonly number[],
  width: number,
  origin: readonly [number, number],
  pixelScale: readonly [number, number],
  size: Size
): Float32Array => {
  const scale = viewportScale(size);
  const centre = viewportCentre(size);
  const left = centre.x - (ReferenceViewport.width * scale) / 2;
  const top = centre.y - (ReferenceViewport.height * scale) / 2;
  const vertices: number[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    for (let column = 0; column < width; column += 1) {
      if ((row & (2 ** (width - column - 1))) === 0) {
        continue;
      }
      const x0 = left + (origin[0] + column * pixelScale[0]) * scale;
      const y0 = top + (origin[1] + rowIndex * pixelScale[1]) * scale;
      const x1 = x0 + pixelScale[0] * scale;
      const y1 = y0 + pixelScale[1] * scale;
      vertices.push(x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1);
    }
  }
  return new Float32Array(vertices);
};

const liftBarVertices = (
  split: number,
  size: Size,
  upper = false
): Float32Array => {
  const scale = viewportScale(size);
  const centre = viewportCentre(size);
  const left = 0;
  const right = size.width;
  const top = centre.y - (ReferenceViewport.height * scale) / 2;
  const boundary = top + (split - 50) * scale;
  const y = upper ? 0 : boundary;
  const bottom = upper ? boundary : size.height;
  return new Float32Array([
    left,
    y,
    right,
    y,
    right,
    bottom,
    left,
    y,
    right,
    bottom,
    left,
    bottom
  ]);
};

export const objectOverlays = (
  world: World,
  snapshot: SessionSnapshot,
  size: Size
): readonly BitmapOverlay[] => {
  const sights = world.objectEffects.sights;
  if (!snapshot.carriedStack.includes(sights.slot)) {
    return [];
  }
  return [
    {
      colour:
        c64Colour(
          snapshot.location.kind === 'room'
            ? sights.colours.room
            : sights.colours.surface
        ) ?? ScenePalette.whiteInk,
      origin: { x: sights.origin[0], y: sights.origin[1] },
      pixelScale: { x: sights.pixelScale[0], y: sights.pixelScale[1] },
      vertices: bitmapVertices(
        sights.bitmapRows,
        sights.width,
        sights.origin,
        sights.pixelScale,
        size
      )
    }
  ];
};

/// The frames that draw no world at all, or undefined where the world is drawn.
///
/// The Escape's terminal loop replaces the world view entirely: no ground, no Map Lines, no
/// structures, just the Interstellar Ship Field on the colour its sequence has reached. It comes
/// before everything, including the orrery, because the field is recovered behaviour rather
/// than an authored addition and so is the same under either Presentation Preset (ADR 0025).
/// The Lift Journey's solid stages show its bar alone, and a dark Room is an empty black frame.
export const worldlessFrame = (
  world: World,
  snapshot: SessionSnapshot,
  size: Size
): FramePlan | undefined => {
  const overlays = objectOverlays(world, snapshot, size);
  const escape = snapshot.escapePresentation;
  if (escape !== undefined) {
    const scale = viewportScale(size);
    const centre = viewportCentre(size);
    const vertices = new Float32Array(escape.points.length * 2);
    for (const [index, point] of escape.points.entries()) {
      vertices[index * 2] =
        centre.x +
        (point.x - LOGICAL_CENTRE_X) *
          ReferenceViewport.horizontalPixelScale *
          scale;
      vertices[index * 2 + 1] =
        centre.y + (point.y - ReferenceViewport.height / 2) * scale;
    }
    const batches: DrawBatch[] = [];
    addBatch(
      batches,
      'points',
      vertices,
      c64Colour(escape.colourPair.line) ?? ScenePalette.blackInk
    );
    return {
      batches,
      clear: c64Colour(escape.colourPair.screen) ?? ScenePalette.blackInk,
      lines: 0,
      overlays,
      points: escape.points.length,
      size
    };
  }

  const journey = snapshot.liftJourney;
  const liftWipe = liftWipeOf(snapshot);
  // $BB37 selects the blank character screen on both sides of the raster
  // boundary. Stage 7 descending restores the bitmap below the boundary
  // through $AE37; stage 13 ascending selects $AE76 and restores it above.
  const solidLift =
    journey !== undefined &&
    journey.stage >= 7 &&
    journey.stage <= 12 &&
    !(journey.direction === 'down' && journey.stage === 7);
  if (solidLift) {
    const batches: DrawBatch[] = [];
    if (liftWipe !== undefined) {
      addBatch(
        batches,
        'triangles',
        liftBarVertices(liftWipe.split, size),
        liftWipe.lineColour
      );
    }
    return {
      batches,
      clear: c64Colour(journey.upperColour ?? 0) ?? ScenePalette.blackInk,
      ...(liftWipe === undefined ? {} : { liftWipe }),
      lines: 0,
      overlays: [],
      points: 0,
      size
    };
  }
  if (snapshot.indoor?.dark === true) {
    return {
      batches: [],
      clear: ScenePalette.blackInk,
      lines: 0,
      overlays,
      points: 0,
      size
    };
  }
  return undefined;
};

const liftWipeOf = (snapshot: SessionSnapshot): FramePlan['liftWipe'] => {
  const journey = snapshot.liftJourney;
  return journey?.screenSplit === undefined
    ? undefined
    : {
        lineColour: c64Colour(journey.lineColour) ?? ScenePalette.whiteInk,
        split: journey.screenSplit
      };
};

/// The Lift Journey's bar over a world frame, if the journey shows one: its triangles in
/// pixels and its colour. At stage 7 going down the bar covers the frame above the boundary.
export const liftBar = (
  snapshot: SessionSnapshot,
  size: Size
): { readonly colour: RGB8; readonly vertices: Float32Array } | undefined => {
  const journey = snapshot.liftJourney;
  const liftWipe = liftWipeOf(snapshot);
  if (liftWipe === undefined || journey === undefined) {
    return undefined;
  }
  const upper = journey.direction === 'down' && journey.stage === 7;
  return {
    colour: upper
      ? (c64Colour(journey.upperColour ?? 0) ?? ScenePalette.blackInk)
      : liftWipe.lineColour,
    vertices: liftBarVertices(liftWipe.split, size, upper)
  };
};

/// The Lift Journey's bar over Authentic Targ's world frame, drawn after the world.
const addLiftBar = (
  batches: DrawBatch[],
  snapshot: SessionSnapshot,
  size: Size
): void => {
  const bar = liftBar(snapshot, size);
  if (bar !== undefined) {
    addBatch(batches, 'triangles', bar.vertices, bar.colour);
  }
};

/// The Enhanced sky over the surface, where an orrery is given (ADR 0025).
export const skyFrameOf = (
  snapshot: SessionSnapshot,
  size: Size,
  orrery: TargOrrery | undefined,
  presentation: FramePresentation
): SkyFrame | undefined =>
  orrery === undefined || snapshot.location.kind !== 'surface'
    ? undefined
    : buildSkyFrame(
        skyStateAt(orrery, presentation.orreryElapsed ?? snapshot.elapsed),
        {
          heading: snapshot.player.heading,
          mirrored: snapshot.worldFlipped,
          pitch: snapshot.player.pitch,
          roll: snapshot.player.roll
        },
        size
      );

/// The colour a world frame starts from: the sky, or a lit Room's backdrop.
export const worldClear = (
  snapshot: SessionSnapshot,
  sky: { readonly clear: RGB8 } | undefined,
  preset: PresentationPreset
): RGB8 => {
  const indoor = snapshot.indoor;
  return (
    sky?.clear ??
    (indoor === undefined
      ? ScenePalette.sky
      : preset === 'enhanced'
        ? (atariSTColour(indoor.foreground) ?? ScenePalette.blackInk)
        : ScenePalette.blackInk)
  );
};

/// Resolve one Session Snapshot into the ordered primitive batches WebGL2 should draw.
///
/// This is deliberately pure. Golden Traces already grade selection and projection; this plan
/// makes the presentation boundary independently inspectable without a DOM or graphics driver.
/// It is Authentic Targ's frame, the Arrival's descent included; Enhanced Targ draws its world,
/// and the Lift Journey's bar over it, through the shared planner instead (`enhancedFrame.ts`,
/// ADR 0087).
export const planFrame = (
  world: World,
  snapshot: SessionSnapshot,
  size: Size,
  orrery?: TargOrrery,
  presentation: FramePresentation = AUTHENTIC_PRESENTATION
): FramePlan => {
  const worldless = worldlessFrame(world, snapshot, size);
  if (worldless !== undefined) {
    return worldless;
  }
  const overlays = objectOverlays(world, snapshot, size);
  const liftWipe = liftWipeOf(snapshot);
  const indoor = snapshot.indoor;
  const camera = new Camera({
    ...snapshot.player,
    mirrored: snapshot.worldFlipped
  });
  const seen = visible(world, snapshot.player.position, {
    elapsed: snapshot.elapsed,
    residence: snapshot.residence,
    ...(snapshot.location.kind === 'room'
      ? { room: snapshot.location.id }
      : {}),
    rules: { ...REFERENCE_RULES, reach: presentation.structureReach }
  });
  const projected = projectFrame(camera, seen, size, 'clipped');
  // Line Colour: white Ink on the surface, the Indoor Scene's wireframe colour in a Room.
  const lineColour =
    indoor === undefined
      ? ScenePalette.whiteInk
      : (c64Colour(indoor.lineColour) ?? ScenePalette.whiteInk);
  const blackInk: ScreenLine[] = [];
  const whiteInk: ScreenLine[] = [];
  const coloured: ScreenLine[] = [];
  for (const line of [...projected.distant, ...projected.lines]) {
    if (line.colour !== undefined) {
      coloured.push(line);
    } else {
      (line.ink === Ink.black ? blackInk : whiteInk).push(line);
    }
  }

  const batches: DrawBatch[] = [];
  if (indoor === undefined) {
    addBatch(
      batches,
      'triangles',
      groundVertices(camera.groundFill(size), size),
      ScenePalette.ground
    );
  } else if (presentation.preset === 'authentic') {
    const backdrop = new IndoorBackdrop(indoor.background, indoor.foreground);
    addBatch(batches, 'triangles', stripVertices(size, 0), backdrop.foreground);
    addBatch(batches, 'triangles', stripVertices(size, 1), backdrop.background);
  }
  const faceFill = faceBatch(seen.faces, camera, size, lineColour);
  const faces =
    faceFill === undefined
      ? undefined
      : { batch: faceFill, before: batches.length };
  addLineBatch(batches, blackInk, ScenePalette.blackInk);
  addLineBatch(batches, whiteInk, lineColour);
  addColouredLines(batches, coloured);
  addBatch(
    batches,
    'points',
    pointVertices(projected.points),
    ScenePalette.whiteInk
  );
  addLiftBar(batches, snapshot, size);
  const sky = skyFrameOf(snapshot, size, orrery, presentation);
  return {
    batches,
    clear: worldClear(snapshot, sky, presentation.preset),
    ...(faces === undefined ? {} : { faces }),
    lines: projected.distant.length + projected.lines.length,
    ...(liftWipe === undefined ? {} : { liftWipe }),
    overlays,
    points: projected.points.length,
    size,
    ...(sky === undefined ? {} : { sky })
  };
};

/// One model's faces and lines from an inspection camera, with no world, sky or ground: what the
/// Targ Asset Browser previews, through the same projection, fill and ink passes as play.
export const planInspection = (
  camera: Camera,
  seen: Pick<Visible, 'faces' | 'segments'>,
  size: Size
): FramePlan => {
  const projected = projectFrame(
    camera,
    { ...seen, detailedObjects: 0, distant: [], points: [] },
    size
  );
  const batches: DrawBatch[] = [];
  const faceFill = faceBatch(seen.faces, camera, size, ScenePalette.whiteInk);
  addLineBatch(
    batches,
    projected.lines.filter(line => line.ink === Ink.black),
    ScenePalette.blackInk
  );
  addLineBatch(
    batches,
    projected.lines.filter(
      line => line.ink !== Ink.black && line.colour === undefined
    ),
    ScenePalette.whiteInk
  );
  addColouredLines(
    batches,
    projected.lines.filter(line => line.colour !== undefined)
  );
  return {
    batches,
    clear: ScenePalette.sky,
    ...(faceFill === undefined
      ? {}
      : { faces: { batch: faceFill, before: 0 } }),
    lines: projected.lines.length,
    overlays: [],
    points: 0,
    size
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
  private facePass:
    | {
        readonly colour: number;
        readonly program: WebGLProgram;
        readonly vertex: number;
      }
    | undefined;
  /// The orrery this renderer was built with, readable so a caller planning its own frame plans
  /// it against the same sky (ADR 0025).
  readonly orrery: TargOrrery | undefined;
  private readonly pixel: number;
  private readonly pointSize: WebGLUniformLocation | null;
  private readonly program: WebGLProgram;
  private readonly sceneBuffer: WebGLBuffer;
  private readonly sky: SkyPipeline | undefined;
  /// This renderer's own vertex array: Enhanced Targ shares the canvas's context with the
  /// shared planner's renderer, and neither may disturb the other's attributes (ADR 0087).
  private readonly vertexArray: WebGLVertexArrayObject;
  private readonly viewport: WebGLUniformLocation | null;

  constructor(canvas: HTMLCanvasElement, orrery?: TargOrrery) {
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (gl === null) {
      throw new Error('this browser has no WebGL2 context to draw into');
    }
    const program = linked(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const vertexArray = gl.createVertexArray()!;
    gl.bindVertexArray(vertexArray);
    gl.useProgram(program);
    this.ink = gl.getUniformLocation(program, 'ink');
    this.viewport = gl.getUniformLocation(program, 'viewport');
    this.pointSize = gl.getUniformLocation(program, 'pointSize');
    const pixel = gl.getAttribLocation(program, 'pixel');
    const sceneBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);
    gl.enableVertexAttribArray(pixel);
    gl.vertexAttribPointer(pixel, 2, gl.FLOAT, false, 0, 0);
    this.canvas = canvas;
    this.gl = gl;
    // The enhanced pipeline is compiled the first enhanced frame needs it: a player who never
    // leaves the Reference Build presentation never pays for its shaders either.
    this.orrery = orrery;
    this.pixel = pixel;
    this.program = program;
    this.sceneBuffer = sceneBuffer;
    this.sky = orrery === undefined ? undefined : skyPipeline(gl);
    this.vertexArray = vertexArray;
  }

  private pass(batch: DrawBatch): void {
    const modes: Record<DrawMode, number> = {
      lines: this.gl.LINES,
      points: this.gl.POINTS,
      triangles: this.gl.TRIANGLES
    };
    this.gl.uniform3f(this.ink, ...channels(batch.colour));
    if (batch.mode === 'points') {
      this.gl.uniform1f(this.pointSize, batch.pointSize);
    }
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      batch.vertices,
      this.gl.STREAM_DRAW
    );
    this.gl.drawArrays(modes[batch.mode], 0, batch.vertices.length / 2);
  }

  /// Filled faces share one depth buffer. Explicit wireframe lines are painted over the fill.
  private faces(batch: FaceBatch, size: Size): void {
    const gl = this.gl;
    // Compiled the first frame with faces, like the enhanced pipeline: views without Geometry
    // Asset faces never pay for it.
    if (this.facePass === undefined) {
      const program = linked(gl, FACE_VERTEX_SHADER, FACE_FRAGMENT_SHADER);
      this.facePass = {
        colour: gl.getAttribLocation(program, 'colour'),
        program,
        vertex: gl.getAttribLocation(program, 'vertex')
      };
    }
    const pass = this.facePass;
    const bounds = referenceViewportBounds(size);
    const sx = this.canvas.width / size.width;
    const sy = this.canvas.height / size.height;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(
      Math.round(bounds.x * sx),
      Math.round((size.height - bounds.y - bounds.height) * sy),
      Math.round(bounds.width * sx),
      Math.round(bounds.height * sy)
    );
    gl.useProgram(pass.program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.vertices, gl.STREAM_DRAW);
    const stride = FACE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(pass.vertex);
    gl.enableVertexAttribArray(pass.colour);
    gl.vertexAttribPointer(pass.vertex, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(
      pass.colour,
      3,
      gl.FLOAT,
      false,
      stride,
      4 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.drawArrays(gl.TRIANGLES, 0, batch.vertices.length / FACE_STRIDE);
    gl.disableVertexAttribArray(pass.vertex);
    gl.disableVertexAttribArray(pass.colour);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(this.pixel);
    gl.vertexAttribPointer(this.pixel, 2, gl.FLOAT, false, 0, 0);
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
    const gradient = frame.gradient;
    if (gradient !== undefined) {
      gl.disableVertexAttribArray(sky.pixel);
      gl.disableVertexAttribArray(sky.disc);
      gl.disableVertexAttribArray(sky.opacity);
      gl.uniform1f(sky.gradientPass, 1);
      gl.uniform2f(sky.framebufferSize, this.canvas.width, this.canvas.height);
      gl.uniform2f(sky.gradientCentre, gradient.centre.x, gradient.centre.y);
      gl.uniform2f(sky.gradientFocal, gradient.focal.x, gradient.focal.y);
      gl.uniform3f(sky.gradientHorizon, ...channels(gradient.horizon));
      gl.uniform3f(sky.gradientZenith, ...channels(gradient.zenith));
      gl.uniform3f(
        sky.gradientUpInView,
        gradient.upInView.x,
        gradient.upInView.y,
        gradient.upInView.z
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.uniform1f(sky.gradientPass, 0);
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
    size: Size,
    presentation: FramePresentation = AUTHENTIC_PRESENTATION
  ): {
    readonly lines: number;
    readonly points: number;
  } {
    return this.render(
      planFrame(world, snapshot, size, this.orrery, presentation)
    );
  }

  /// Draw one already-planned frame.
  ///
  /// Split from `draw` so a caller that plans its own frame — the Arrival, which draws the world
  /// from a camera the session is not standing in (ADR 0032) — reaches this rasteriser rather
  /// than a second one. How a plan becomes pixels stays here; what a plan says is still decided
  /// by a pure function.
  render(plan: FramePlan): {
    readonly lines: number;
    readonly points: number;
  } {
    const gl = this.gl;
    gl.bindVertexArray(this.vertexArray);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneBuffer);
    // The canvas is sized once by the caller, but the viewport is read here so a resize between
    // frames needs nothing else to be rebuilt.
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.viewport, plan.size.width, plan.size.height);
    gl.lineWidth(1);

    if (plan.clear !== null) {
      gl.clearColor(...channels(plan.clear), 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    if (plan.sky !== undefined) {
      this.skyPass(plan.sky, plan.size);
      gl.uniform2f(this.viewport, plan.size.width, plan.size.height);
    }
    for (const [index, batch] of plan.batches.entries()) {
      if (index === plan.faces?.before) {
        this.faces(plan.faces.batch, plan.size);
      }
      this.pass(batch);
    }
    if (plan.faces?.before === plan.batches.length) {
      this.faces(plan.faces.batch, plan.size);
    }
    // Hardware-style overlays are deliberately outside the scene: they are fixed-screen pixels
    // in either preset.
    for (const overlay of plan.overlays) {
      this.pass({
        colour: overlay.colour,
        mode: 'triangles',
        pointSize: 1,
        vertices: overlay.vertices
      });
    }
    return { lines: plan.lines, points: plan.points };
  }

  /// Leave the context as this renderer draws, after another has drawn into it: the shared
  /// planner's renderer leaves depth testing and culling on.
  resume(): void {
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.disable(this.gl.BLEND);
    this.gl.depthMask(true);
  }
}
