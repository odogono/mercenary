import type { Vector3 } from '../orientation/index.ts';
import type { FrameDescription } from './description.ts';
import {
  CASTER_GRID_SIZE,
  CASTER_TEXTURE_WIDTH,
  casterGrid,
  shadowVolumeVertices
} from './exactShadows.ts';
import {
  DESCRIPTION_STRIDE,
  descriptionPalette,
  descriptionVertices
} from './gpuDescription.ts';
import {
  lightMatrix,
  type FrameLighting,
  type ShadowWindow,
  type ViewOrientation
} from './lighting.ts';
import { FLOATS_PER_VERTEX, type TriangleFrame } from './triangles.ts';

/// Eris in Filled Presentation: one WebGL2 program, flat colours, a depth buffer.
///
/// Damocles's original fill order is unrecovered, and a depth buffer is not a claim about it:
/// it draws the same picture any correct ordering would, except where faces are coplanar.
/// There draw order settles the tie. Every fragment's depth comes from its face's plane, and
/// faces sharing a plane carry the same plane bit for bit, so they tie exactly and `LEQUAL`
/// keeps the later one, as the painter's stream the plan follows would (#545).
/// Faces are flat in their catalogue colours with no lighting, which is what the Working
/// Authority shows outdoors (ADR 0043).
/// The shape follows the Flyover renderer rather than Targ's line-list `Renderer`, whose
/// batches are pixel-space lines under the C64 Reference Viewport.
const ORDERED_VERTEX = `#version 300 es
in vec3 camera;
in vec3 colour;
in float paletteIndex;
uniform vec2 referenceSize;
uniform vec2 centre;
uniform float focal;
out vec3 resolvedColour;
flat out int colourIndex;
void main() {
  float d = camera.z;
  vec2 screen = centre + vec2(-camera.x, camera.y) * focal / d;
  vec2 ndc = (screen + 0.5) / referenceSize * 2.0 - 1.0;
  gl_Position = vec4(ndc.x * d, -ndc.y * d, 0.0, d);
  resolvedColour = colour;
  colourIndex = int(paletteIndex);
}`;
const ORDERED_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec3 resolvedColour;
flat in int colourIndex;
uniform sampler2D palette;
uniform vec2 referenceSize;
uniform vec2 outputSize;
out vec4 pixel;
void main() {
  int row = clamp(int((outputSize.y - gl_FragCoord.y) * referenceSize.y / outputSize.y), 0, int(referenceSize.y) - 1);
  pixel = colourIndex < 0 ? vec4(resolvedColour, 1.0) : texelFetch(palette, ivec2(colourIndex, row), 0);
}`;

const VERTEX = `#version 300 es
in vec3 view;
in vec3 colour;
in vec4 plane;
uniform float aspect;
uniform float tangent;
uniform vec2 depthRange;
out vec3 faceColour;
out float viewDepth;
flat out vec4 facePlane;

void main() {
  faceColour = colour;
  viewDepth = view.z;
  facePlane = plane;
  float nearPlane = depthRange.x;
  float farPlane = depthRange.y;
  float depthA = (farPlane + nearPlane) / (farPlane - nearPlane);
  float depthB = (2.0 * farPlane * nearPlane) / (farPlane - nearPlane);
  gl_Position = vec4(
    view.x / (aspect * tangent),
    view.y / tangent,
    view.z * depthA - depthB,
    view.z
  );
}`;

/// Depth added per layer, in the [0, 1] window range, keeping every ground record behind every
/// structure and ahead of the Body's surface. Plane depth already ties a structure's base with
/// the record under it and draw order settles it; this is the margin for a record whose
/// placement height differs in its last bits. In distance it is six parts in a hundred
/// thousand.
const LAYER_DEPTH_BIAS = 4e-6;

/// The layer the Body's whole surface sits on: its base plane and the Damocles Island fills
/// painted over it, which are one surface in two colours and share a depth (#394).
const SURFACE_DEPTH_BIAS = 2 * LAYER_DEPTH_BIAS;

const STRIDE = FLOATS_PER_VERTEX * 4;
/// Attribute name, byte offset and float count in a plan vertex.
const COLOUR_ATTRIBUTES = [
  ['view', 0, 3],
  ['colour', 12, 3],
  ['plane', 24, 4]
] as const;

/// Depth is logarithmic in view distance, written per fragment (#221). The fixed-point z/w
/// buffer spends nearly all its steps within a few hundred units of a 4-unit near plane; with
/// a far plane out at the sea horizon, a fill one unit under the recovered pads is
/// unresolvable a cell away. log2(1 + z) / log2(1 + far) keeps a constant relative
/// resolution, about one part in a million at any range.
///
/// The view depth itself is not interpolated from the corners but found where the pixel's ray
/// meets the face's plane (#545). Interpolation lands two coplanar faces built from different
/// triangles about a millionth apart, as much as a depth step, and they fought wherever no bias
/// had been added to settle them. The plane is flat per face and computed the same way at the
/// same pixel, so faces sharing one tie to the bit and draw order decides. A face without a
/// plane, or a ray that misses its plane in front of the eye, keeps the interpolated depth.
const LOG_DEPTH = `
uniform vec2 depthRange;
uniform float depthBias;
uniform float aspect;
uniform float tangent;
uniform vec2 viewport;
flat in vec4 facePlane;
float planeDepth(float interpolated) {
  vec2 ndc = gl_FragCoord.xy / viewport * 2.0 - 1.0;
  vec3 ray = vec3(ndc.x * aspect * tangent, ndc.y * tangent, 1.0);
  float facing = dot(facePlane.xyz, ray);
  float depth = facing == 0.0 ? 0.0 : -facePlane.w / facing;
  return depth > 0.0 ? depth : interpolated;
}
float logDepth(float interpolated) {
  float viewDepth = planeDepth(interpolated);
  return log2(max(1.0 + viewDepth, 1e-6)) / log2(1.0 + depthRange.y) + depthBias;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 faceColour;
in float viewDepth;
${LOG_DEPTH}
out vec4 pixel;
void main() {
  gl_FragDepth = logDepth(viewDepth);
  pixel = vec4(faceColour, 1.0);
}`;

const PROJECT = `
uniform float aspect;
uniform float tangent;
uniform vec2 depthRange;
vec4 project(vec3 view) {
  float nearPlane = depthRange.x;
  float farPlane = depthRange.y;
  float depthA = (farPlane + nearPlane) / (farPlane - nearPlane);
  float depthB = (2.0 * farPlane * nearPlane) / (farPlane - nearPlane);
  return vec4(
    view.x / (aspect * tangent),
    view.y / tangent,
    view.z * depthA - depthB,
    view.z
  );
}`;

const LIT_VERTEX = `#version 300 es
in vec3 view;
in vec3 colour;
in vec4 plane;
${PROJECT}
out vec3 faceColour;
out vec3 viewPosition;
flat out vec4 facePlane;
void main() {
  faceColour = colour;
  viewPosition = view;
  facePlane = plane;
  gl_Position = project(view);
}`;

const LIT_FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 faceColour;
in vec3 viewPosition;
${LOG_DEPTH}
uniform vec3 sunView;
uniform vec3 sunColour;
uniform vec3 ambientSky;
uniform vec3 ambientGround;
uniform mat4 nearLightMatrix;
uniform mat4 farLightMatrix;
uniform vec2 nearShadowBias;
uniform vec2 farShadowBias;
uniform sampler2DShadow nearShadowMap;
uniform sampler2DShadow farShadowMap;
uniform bool hardEdge;
// 0 samples the shadow maps; 1 draws ambient only and 2 full Sunlight, the two colour passes
// around a stencil volume pass; 3 ray-tests the caster grid (#380 prototypes).
uniform int shadowMode;
uniform highp sampler2D casterTriangles;
uniform highp isampler2D casterCells;
uniform highp isampler2D casterIndices;
uniform mat3 lightBasis;
uniform vec4 gridBounds;
uniform int gridSize;
out vec4 pixel;

bool insideShadow(vec3 uvz) {
  return uvz.x >= 0.0 && uvz.x <= 1.0
    && uvz.y >= 0.0 && uvz.y <= 1.0
    && uvz.z >= 0.0 && uvz.z <= 1.0;
}

float pcf(sampler2DShadow map, vec3 uvz) {
  float lit = textureOffset(map, uvz, ivec2(-1, -1))
    + textureOffset(map, uvz, ivec2(0, -1))
    + textureOffset(map, uvz, ivec2(1, -1))
    + textureOffset(map, uvz, ivec2(-1, 0))
    + textureOffset(map, uvz, ivec2(0, 0))
    + textureOffset(map, uvz, ivec2(1, 0))
    + textureOffset(map, uvz, ivec2(-1, 1))
    + textureOffset(map, uvz, ivec2(0, 1))
    + textureOffset(map, uvz, ivec2(1, 1));
  return lit / 9.0;
}

// A hard Cast Shadow is one compare against a NEAREST-filtered map; a soft one averages the
// 3x3 neighbourhood of LINEAR compares. The uniform branch is coherent across the frame.
float lookup(sampler2DShadow map, vec3 uvz) {
  return hardEdge ? texture(map, uvz) : pcf(map, uvz);
}

float shadowAt(vec3 p, vec3 n, float ndl) {
  vec3 nearOffset = p + n * nearShadowBias.x * (1.0 - ndl);
  vec3 nearUv = (nearLightMatrix * vec4(nearOffset, 1.0)).xyz * 0.5 + 0.5;
  if (insideShadow(nearUv)) {
    nearUv.z -= nearShadowBias.y;
    return lookup(nearShadowMap, nearUv);
  }
  vec3 farOffset = p + n * farShadowBias.x * (1.0 - ndl);
  vec3 farUv = (farLightMatrix * vec4(farOffset, 1.0)).xyz * 0.5 + 0.5;
  if (insideShadow(farUv)) {
    farUv.z -= farShadowBias.y;
    return lookup(farShadowMap, farUv);
  }
  return 1.0;
}

ivec2 tableAt(int index) {
  return ivec2(index % ${CASTER_TEXTURE_WIDTH}, index / ${CASTER_TEXTURE_WIDTH});
}

// The receiver point where the pixel's ray meets the face's plane, as the depth is found.
vec3 surfacePoint() {
  vec2 ndc = gl_FragCoord.xy / viewport * 2.0 - 1.0;
  vec3 ray = vec3(ndc.x * aspect * tangent, ndc.y * tangent, 1.0);
  return ray * planeDepth(viewPosition.z);
}

// Under an orthographic sun the ray from p toward it is one point of the light's plane, so
// every triangle that could block it is in that point's grid cell. Corners on a shared edge
// count for both triangles, so no pinhole opens along the seams.
float exactShadow(vec3 p) {
  vec3 l = p * lightBasis;
  ivec2 cell = ivec2(floor((l.xy - gridBounds.xy) * gridBounds.zw));
  if (any(lessThan(cell, ivec2(0))) || any(greaterThanEqual(cell, ivec2(gridSize)))) {
    return 1.0;
  }
  ivec2 range = texelFetch(casterCells, cell, 0).xy;
  float epsilon = 0.05 + length(p) * 2e-5;
  for (int i = 0; i < range.y; i++) {
    int triangle = texelFetch(casterIndices, tableAt(range.x + i), 0).x;
    vec3 a = texelFetch(casterTriangles, tableAt(triangle * 3), 0).xyz;
    vec3 b = texelFetch(casterTriangles, tableAt(triangle * 3 + 1), 0).xyz;
    vec3 c = texelFetch(casterTriangles, tableAt(triangle * 3 + 2), 0).xyz;
    vec2 e0 = b.xy - a.xy;
    vec2 e1 = c.xy - a.xy;
    vec2 d = l.xy - a.xy;
    float area = e0.x * e1.y - e1.x * e0.y;
    if (abs(area) < 1e-9) {
      continue;
    }
    float u = (d.x * e1.y - e1.x * d.y) / area;
    float v = (e0.x * d.y - d.x * e0.y) / area;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.0 + 1e-6) {
      float z = a.z + u * (b.z - a.z) + v * (c.z - a.z);
      if (z > l.z + epsilon) {
        return 0.0;
      }
    }
  }
  return 1.0;
}

// The face's own normal, turned toward the eye as the screen-space one was: the eye is at the
// origin, so it is on the side the plane's offset is positive.
vec3 faceNormal() {
  if (dot(facePlane.xyz, facePlane.xyz) == 0.0) {
    return normalize(-cross(dFdx(viewPosition), dFdy(viewPosition)));
  }
  return facePlane.w < 0.0 ? -facePlane.xyz : facePlane.xyz;
}

void main() {
  vec3 n = faceNormal();
  float lambert = max(dot(n, sunView), 0.0);
  float shadow = 1.0;
  if (lambert > 0.0) {
    if (shadowMode == 0) {
      shadow = shadowAt(viewPosition, n, lambert);
    } else if (shadowMode == 1) {
      shadow = 0.0;
    } else if (shadowMode == 3) {
      shadow = exactShadow(surfacePoint());
    }
  }
  vec3 ambient = mix(ambientGround, ambientSky, n.y * 0.5 + 0.5);
  gl_FragDepth = logDepth(viewPosition.z);
  pixel = vec4(faceColour * (ambient + sunColour * lambert * shadow), 1.0);
}`;

const DEPTH_VERTEX = `#version 300 es
in vec3 view;
uniform mat4 lightMatrix;
void main() { gl_Position = lightMatrix * vec4(view, 1.0); }`;

/// A shadow volume is clipped at the near plane only: depth-fail counting needs every back cap,
/// however far, and the fragment's own log depth (clamped to the far plane) is what is tested.
const VOLUME_VERTEX = `#version 300 es
in vec3 view;
in vec3 colour;
in vec4 plane;
uniform float aspect;
uniform float tangent;
uniform vec2 depthRange;
out vec3 faceColour;
out float viewDepth;
flat out vec4 facePlane;
void main() {
  faceColour = colour;
  viewDepth = view.z;
  facePlane = plane;
  gl_Position = vec4(
    view.x / (aspect * tangent),
    view.y / tangent,
    view.z - 2.0 * depthRange.x,
    view.z
  );
}`;

const DEPTH_FRAGMENT = `#version 300 es
precision highp float;
void main() {}`;

const SHADOW_RESOLUTION = 2048;
export const SHADOW_WINDOWS = [
  {
    // Keep near receivers at fine texel density without dropping distant casters.
    depthHalfRange: 65_536,
    halfExtent: 2048,
    resolution: SHADOW_RESOLUTION
  },
  {
    depthHalfRange: 65_536,
    halfExtent: 32_768,
    resolution: SHADOW_RESOLUTION
  }
] as const satisfies readonly [ShadowWindow, ShadowWindow];
const SHADOW_POLYGON_OFFSET = [1, 2] as const;
const SHADOW_NORMAL_OFFSET_TEXELS = 1.5;
const SHADOW_DEPTH_BIAS_UNITS = 2;

const shader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader => {
  const value = gl.createShader(type);
  if (value === null) {
    throw new Error('Could not allocate a view shader.');
  }
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(value);
    gl.deleteShader(value);
    throw new Error(
      `Could not compile a view shader${detail ? `: ${detail}` : '.'}`
    );
  }
  return value;
};

const program = (
  gl: WebGL2RenderingContext,
  vertexSource = VERTEX,
  fragmentSource = FRAGMENT
): WebGLProgram => {
  const vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragment: WebGLShader | undefined;
  let value: WebGLProgram | null = null;
  try {
    fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    value = gl.createProgram();
    if (value === null) {
      throw new Error('Could not allocate the view shader program.');
    }
    gl.attachShader(value, vertex);
    gl.attachShader(value, fragment);
    gl.linkProgram(value);
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
      const detail = gl.getProgramInfoLog(value);
      throw new Error(
        `Could not link the view renderer${detail ? `: ${detail}` : '.'}`
      );
    }
    return value;
  } catch (error) {
    if (value !== null) {
      gl.deleteProgram(value);
    }
    throw error;
  } finally {
    gl.deleteShader(vertex);
    if (fragment !== undefined) {
      gl.deleteShader(fragment);
    }
  }
};

interface ShadowMap {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
}

/// Which edge a Cast Shadow is drawn with; `off` never reaches the renderer. `stepped`,
/// `volume` and `exact` are the #380 prototypes: a hard map under a sun held still between
/// 1/1024-turn steps, stencil shadow volumes, and a per-fragment ray test.
export type ShadowEdge = 'soft' | 'hard' | 'stepped' | 'volume' | 'exact';

interface CasterTextures {
  readonly cells: WebGLTexture;
  readonly indices: WebGLTexture;
  readonly triangles: WebGLTexture;
}

interface EnhancedResources {
  readonly casterBuffer: WebGLBuffer;
  readonly casterTextures: CasterTextures;
  readonly colourProgram: WebGLProgram;
  readonly depthProgram: WebGLProgram;
  readonly maps: readonly [ShadowMap, ShadowMap];
  /// The compare samplers the maps are read through, one per edge. The texture keeps LINEAR
  /// parameters of its own; whichever sampler is bound overrides them.
  readonly samplers: Readonly<Record<'hard' | 'soft', WebGLSampler>>;
  readonly volumeBuffer: WebGLBuffer;
  readonly volumeProgram: WebGLProgram;
}

/// The frame keeps reversed copies for double-sided colour faces. A shadow caster only needs
/// one of two byte-identical, oppositely wound triangles; retaining both creates a lit PCF rim
/// where coincident wall and roof copies meet.
export const shadowCasterVertices = (vertices: Float32Array): Float32Array => {
  const result = new Float32Array(vertices.length);
  const words = new Uint32Array(
    vertices.buffer,
    vertices.byteOffset,
    vertices.length
  );
  const seen = new Map<number, number[]>();
  const hashAt = (offset: number, reversed: boolean): number => {
    let hash = 2_166_136_261;
    for (let step = 0; step < 3; step += 1) {
      const vertex = reversed ? 2 - step : step;
      for (let value = 0; value < FLOATS_PER_VERTEX; value += 1) {
        hash = Math.imul(
          hash ^ words[offset + vertex * FLOATS_PER_VERTEX + value]!,
          16_777_619
        );
      }
    }
    return hash >>> 0;
  };
  const isReverseOf = (offset: number, previous: number): boolean => {
    for (let vertex = 0; vertex < 3; vertex += 1) {
      for (let value = 0; value < FLOATS_PER_VERTEX; value += 1) {
        if (
          words[offset + vertex * FLOATS_PER_VERTEX + value] !==
          words[previous + (2 - vertex) * FLOATS_PER_VERTEX + value]
        ) {
          return false;
        }
      }
    }
    return true;
  };
  const stride = 3 * FLOATS_PER_VERTEX;
  let written = 0;
  for (let offset = 0; offset < vertices.length; offset += stride) {
    const reversed = seen.get(hashAt(offset, true));
    if (reversed?.some(previous => isReverseOf(offset, previous)) === true) {
      continue;
    }
    const hash = hashAt(offset, false);
    const matching = seen.get(hash);
    if (matching === undefined) {
      seen.set(hash, [offset]);
    } else {
      matching.push(offset);
    }
    result.set(vertices.subarray(offset, offset + stride), written);
    written += stride;
  }
  return result.subarray(0, written);
};

const requiredUniform = (
  gl: WebGL2RenderingContext,
  shaderProgram: WebGLProgram,
  name: string
): WebGLUniformLocation => {
  const location = gl.getUniformLocation(shaderProgram, name);
  if (location === null) {
    if (gl.isContextLost()) {
      throw new Error(
        'The graphics context was lost. Reload the page to restore the view.'
      );
    }
    throw new Error(`view shader has no ${name} uniform.`);
  }
  return location;
};

export interface FrameRendererOptions {
  readonly cullBackFaces: boolean;
  readonly lighting?: true;
}

export interface LightingRender {
  readonly eyeWorld: Vector3;
  readonly lighting: FrameLighting;
  readonly shadowEdge: ShadowEdge;
  /// The frame camera's turn, which the light matrices must share with the plan's vertices.
  readonly view: ViewOrientation;
}

export class FrameRenderer {
  private readonly buffer: WebGLBuffer;
  private readonly skyBuffer: WebGLBuffer;
  private readonly canvas: HTMLCanvasElement;
  private readonly enabledAttributes = new Set<number>();
  private enhanced: EnhancedResources | undefined;
  private readonly gl: WebGL2RenderingContext;
  private readonly shaderProgram: WebGLProgram;
  private ordered:
    | {
        readonly buffer: WebGLBuffer;
        readonly palette: WebGLTexture;
        readonly program: WebGLProgram;
      }
    | undefined;
  private readonly contextLost: (event: Event) => void;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly options: FrameRendererOptions,
    onContextLost: () => void
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      stencil: true
    });
    if (gl === null) {
      throw new Error(
        'WebGL2 is unavailable. Enable hardware acceleration to use Enhanced presentation.'
      );
    }
    this.canvas = canvas;
    this.gl = gl;
    this.shaderProgram = program(gl);
    const buffer = gl.createBuffer();
    const skyBuffer = gl.createBuffer();
    if (buffer === null || skyBuffer === null) {
      if (buffer !== null) {
        gl.deleteBuffer(buffer);
      }
      if (skyBuffer !== null) {
        gl.deleteBuffer(skyBuffer);
      }
      gl.deleteProgram(this.shaderProgram);
      throw new Error('Could not allocate the view geometry buffer.');
    }
    this.buffer = buffer;
    this.skyBuffer = skyBuffer;
    this.contextLost = event => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener('webglcontextlost', this.contextLost);
  }

  get outputHeight(): number {
    return Math.max(
      1,
      Math.round(this.canvas.clientHeight * window.devicePixelRatio)
    );
  }

  private resize(): void {
    const ratio = window.devicePixelRatio;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = this.outputHeight;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render(plan: TriangleFrame, enhanced?: LightingRender): void {
    const gl = this.gl;
    if (gl.isContextLost()) {
      throw new Error(
        'The graphics context was lost. Reload the page to restore the view.'
      );
    }
    this.resize();
    this.resetState();
    if (enhanced !== undefined && this.options.lighting === true) {
      this.enhanced ??= this.createEnhanced(gl);
      const query = this.beginTiming();
      this.renderEnhanced(plan, enhanced, this.enhanced);
      this.endTiming(query);
      return;
    }
    gl.clearColor(plan.clear[0], plan.clear[1], plan.clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.drawSky(plan);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.cullAsConfigured();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, plan.vertices, gl.DYNAMIC_DRAW);
    this.bindGeometry(this.shaderProgram, this.buffer, COLOUR_ATTRIBUTES);
    this.setProjection(this.shaderProgram, plan);
    this.drawLayers(this.shaderProgram, plan);
  }

  /// The ordered, camera-first contract; the legacy triangle entry point above remains unchanged.
  renderDescription(description: FrameDescription): void {
    const gl = this.gl;
    if (gl.isContextLost()) {
      throw new Error('The graphics context was lost.');
    }
    this.resize();
    if (this.ordered === undefined) {
      const buffer = gl.createBuffer();
      const palette = gl.createTexture();
      if (buffer === null || palette === null) {
        if (buffer !== null) {
          gl.deleteBuffer(buffer);
        }
        if (palette !== null) {
          gl.deleteTexture(palette);
        }
        throw new Error('Could not allocate the ordered frame resources.');
      }
      try {
        this.ordered = {
          buffer,
          palette,
          program: program(gl, ORDERED_VERTEX, ORDERED_FRAGMENT)
        };
      } catch (error) {
        gl.deleteBuffer(buffer);
        gl.deleteTexture(palette);
        throw error;
      }
    }
    const resources = this.ordered;
    this.resetState();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(resources.program);
    for (const attribute of this.enabledAttributes) {
      gl.disableVertexAttribArray(attribute);
    }
    this.enabledAttributes.clear();
    const vertices = descriptionVertices(description, {
      height: this.canvas.height,
      width: this.canvas.width
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    for (const [name, count, offset] of [
      ['camera', 3, 0],
      ['colour', 3, 3],
      ['paletteIndex', 1, 6]
    ] as const) {
      const attribute = gl.getAttribLocation(resources.program, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(
        attribute,
        count,
        gl.FLOAT,
        false,
        DESCRIPTION_STRIDE * 4,
        offset * 4
      );
      this.enabledAttributes.add(attribute);
    }
    const { centre, focal, height, width } = description.projection;
    gl.uniform2f(
      requiredUniform(gl, resources.program, 'referenceSize'),
      width,
      height
    );
    gl.uniform2f(
      requiredUniform(gl, resources.program, 'centre'),
      centre[0],
      centre[1]
    );
    gl.uniform1f(requiredUniform(gl, resources.program, 'focal'), focal);
    gl.uniform2f(
      requiredUniform(gl, resources.program, 'outputSize'),
      this.canvas.width,
      this.canvas.height
    );
    const texture = descriptionPalette(description);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindSampler(0, null);
    gl.bindTexture(gl.TEXTURE_2D, resources.palette);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      texture.width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      texture.pixels
    );
    gl.uniform1i(requiredUniform(gl, resources.program, 'palette'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / DESCRIPTION_STRIDE);
  }

  dispose(): void {
    const gl = this.gl;
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    gl.deleteBuffer(this.buffer);
    gl.deleteBuffer(this.skyBuffer);
    gl.deleteProgram(this.shaderProgram);
    if (this.ordered !== undefined) {
      gl.deleteBuffer(this.ordered.buffer);
      gl.deleteTexture(this.ordered.palette);
      gl.deleteProgram(this.ordered.program);
    }
    if (this.enhanced !== undefined) {
      gl.deleteBuffer(this.enhanced.casterBuffer);
      gl.deleteBuffer(this.enhanced.volumeBuffer);
      gl.deleteProgram(this.enhanced.volumeProgram);
      for (const texture of Object.values(this.enhanced.casterTextures)) {
        gl.deleteTexture(texture);
      }
      gl.deleteProgram(this.enhanced.colourProgram);
      gl.deleteProgram(this.enhanced.depthProgram);
      for (const map of this.enhanced.maps) {
        gl.deleteFramebuffer(map.framebuffer);
        gl.deleteTexture(map.texture);
      }
      for (const sampler of Object.values(this.enhanced.samplers)) {
        gl.deleteSampler(sampler);
      }
    }
  }

  private resetState(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.colorMask(true, true, true, true);
  }

  private cullAsConfigured(): void {
    const gl = this.gl;
    if (this.options.cullBackFaces) {
      gl.enable(gl.CULL_FACE);
      gl.frontFace(gl.CW);
      gl.cullFace(gl.BACK);
    } else {
      gl.disable(gl.CULL_FACE);
    }
  }

  /// The sky Bodies, painted over the sky fill in the plan's order with the depth buffer left
  /// alone, so everything drawn after covers them (#530). They are flat in both presentations;
  /// an Enhanced sky is #114's. The stars go first, as `$0503FE` runs before the sky pass
  /// (#578). The ground to the horizon follows the Bodies the same way, as `$0599D6` follows
  /// the sky pass (#573). Island fills follow the finite sea plane in drawLayers (#578).
  private drawSky(plan: TriangleFrame): void {
    const gl = this.gl;
    const sky = plan.skyVertices.length;
    const horizon = plan.horizonVertices.length;
    if (sky + horizon === 0) {
      return;
    }
    const vertices = new Float32Array(sky + horizon);
    vertices.set(plan.skyVertices);
    vertices.set(plan.horizonVertices, sky);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    this.bindGeometry(this.shaderProgram, this.skyBuffer, COLOUR_ATTRIBUTES);
    this.setProjection(this.shaderProgram, plan);
    gl.uniform1f(requiredUniform(gl, this.shaderProgram, 'depthBias'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / FLOATS_PER_VERTEX);
    gl.depthMask(true);
  }

  /// Paint flat ink without changing the geometry's depth, then restore the main stream.
  private drawFlatLayer(
    vertices: Float32Array,
    plan: TriangleFrame,
    shaderProgram: WebGLProgram,
    farPlane = plan.farPlane
  ): void {
    if (vertices.length === 0) {
      return;
    }
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    this.bindGeometry(this.shaderProgram, this.skyBuffer, COLOUR_ATTRIBUTES);
    this.setProjection(this.shaderProgram, plan);
    gl.uniform2f(
      requiredUniform(gl, this.shaderProgram, 'depthRange'),
      plan.nearPlane,
      farPlane
    );
    gl.uniform1f(requiredUniform(gl, this.shaderProgram, 'depthBias'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / FLOATS_PER_VERTEX);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    this.cullAsConfigured();
    this.bindGeometry(shaderProgram, this.buffer, COLOUR_ATTRIBUTES);
    this.setProjection(shaderProgram, plan);
  }

  /// The Body's surface first, then the recovered ground records, then everything else, each
  /// layer a step nearer than the last so coplanar faces resolve the same way every frame.
  ///
  /// The surface is drawn as a painter's stream rather than through the depth buffer: its base
  /// plane and the island fills over it are the *same* plane in two colours — that is what land
  /// and sea are here — and no depth bias can order a tie. The attempt is instructive. An
  /// island fill is one polygon spanning the whole view, and interpolating its depth across a
  /// triangle millions of units on a side loses far more than a layer step, so the margin that
  /// settles it standing on the coast is larger than the one that settles it from altitude, and
  /// neither is a constant. Painting the islands over the base plane with the comparison off
  /// costs nothing, needs no constant, and is what the original's own surface stream does.
  /// Depth writes stay on, so the ground records and the structures that follow order against
  /// the surface normally.
  private drawLayers(
    shaderProgram: WebGLProgram,
    plan: TriangleFrame,
    /// A repeat of a drawn frame tests every depth against itself (the sunlit pass over a
    /// stencil volume count); the painter's order is otherwise unchanged.
    repeat = false
  ): void {
    const gl = this.gl;
    const depthFunc = (value: number): void =>
      gl.depthFunc(repeat ? gl.EQUAL : value);
    const bias = requiredUniform(gl, shaderProgram, 'depthBias');
    const fill = plan.fillTriangleCount * 3;
    const islands = plan.islandTriangleCount * 3;
    const ground = plan.groundTriangleCount * 3;
    const rest = plan.triangleCount * 3 - fill - islands - ground;
    gl.uniform1f(bias, SURFACE_DEPTH_BIAS);
    depthFunc(gl.ALWAYS);
    gl.drawArrays(gl.TRIANGLES, 0, fill);
    // The finite sea plane can overlap land beyond the detailed far plane.
    // Paint the complete island silhouettes after it, so it cannot cut holes in them.
    this.drawFlatLayer(plan.horizonIslandVertices, plan, shaderProgram);
    gl.uniform1f(bias, SURFACE_DEPTH_BIAS);
    gl.drawArrays(gl.TRIANGLES, fill, islands);
    if (plan.roadVertices !== undefined && plan.roadVertices.length !== 0) {
      // The recovered road pass paints over the island fill, before ground
      // records and objects. Use flat ink in both presets and leave depth alone.
      // Road reach is the altitude window, not the authored detailed-geometry
      // far plane. At orbital heights that plane would clip the whole network.
      this.drawFlatLayer(plan.roadVertices, plan, shaderProgram, 1_000_000_000);
    }
    depthFunc(gl.LEQUAL);
    gl.uniform1f(bias, LAYER_DEPTH_BIAS);
    gl.drawArrays(gl.TRIANGLES, fill + islands, ground);
    gl.uniform1f(bias, 0);
    gl.drawArrays(gl.TRIANGLES, fill + islands + ground, rest);
  }

  private createEnhanced(gl: WebGL2RenderingContext): EnhancedResources {
    const casterBuffer = gl.createBuffer();
    if (casterBuffer === null) {
      throw new Error('Could not allocate the view shadow geometry buffer.');
    }
    const createMap = (): ShadowMap => {
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      if (texture === null || framebuffer === null) {
        throw new Error('Could not allocate a view shadow map.');
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(
        gl.TEXTURE_2D,
        1,
        gl.DEPTH_COMPONENT24,
        SHADOW_RESOLUTION,
        SHADOW_RESOLUTION
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_COMPARE_MODE,
        gl.COMPARE_REF_TO_TEXTURE
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        texture,
        0
      );
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`view shadow framebuffer is incomplete (${status}).`);
      }
      return { framebuffer, texture };
    };
    const maps = [createMap(), createMap()] as const;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const createSampler = (filter: number): WebGLSampler => {
      const sampler = gl.createSampler();
      if (sampler === null) {
        throw new Error('Could not allocate a view shadow sampler.');
      }
      gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, filter);
      gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, filter);
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(
        sampler,
        gl.TEXTURE_COMPARE_MODE,
        gl.COMPARE_REF_TO_TEXTURE
      );
      gl.samplerParameteri(sampler, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      return sampler;
    };
    const volumeBuffer = gl.createBuffer();
    if (volumeBuffer === null) {
      throw new Error('Could not allocate the view shadow volume buffer.');
    }
    const createTable = (): WebGLTexture => {
      const texture = gl.createTexture();
      if (texture === null) {
        throw new Error('Could not allocate a view caster table.');
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    };
    const casterTextures = {
      cells: createTable(),
      indices: createTable(),
      triangles: createTable()
    };
    gl.bindTexture(gl.TEXTURE_2D, casterTextures.triangles);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      1,
      1,
      0,
      gl.RGBA,
      gl.FLOAT,
      new Float32Array(4)
    );
    gl.bindTexture(gl.TEXTURE_2D, casterTextures.cells);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG32I,
      1,
      1,
      0,
      gl.RG_INTEGER,
      gl.INT,
      new Int32Array(2)
    );
    gl.bindTexture(gl.TEXTURE_2D, casterTextures.indices);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32I,
      1,
      1,
      0,
      gl.RED_INTEGER,
      gl.INT,
      new Int32Array(1)
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    const colourProgram = program(gl, LIT_VERTEX, LIT_FRAGMENT);
    gl.useProgram(colourProgram);
    // Every sampler keeps a unit of its own, so a shadow sampler and an integer one never
    // share a unit whichever mode draws.
    for (const [name, unit] of [
      ['nearShadowMap', 0],
      ['farShadowMap', 1],
      ['casterTriangles', 2],
      ['casterCells', 3],
      ['casterIndices', 4]
    ] as const) {
      gl.uniform1i(requiredUniform(gl, colourProgram, name), unit);
    }
    return {
      casterBuffer,
      casterTextures,
      colourProgram,
      depthProgram: program(gl, DEPTH_VERTEX, DEPTH_FRAGMENT),
      maps,
      samplers: {
        hard: createSampler(gl.NEAREST),
        soft: createSampler(gl.LINEAR)
      },
      volumeBuffer,
      volumeProgram: program(gl, VOLUME_VERTEX, FRAGMENT)
    };
  }

  private bindGeometry(
    shaderProgram: WebGLProgram,
    buffer: WebGLBuffer,
    attributes: readonly (readonly [string, number, number])[]
  ): void {
    const gl = this.gl;
    gl.useProgram(shaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const locations = attributes.map(
      ([name, offset, size]) =>
        [gl.getAttribLocation(shaderProgram, name), offset, size] as const
    );
    const active = new Set(locations.map(([attribute]) => attribute));
    for (const attribute of this.enabledAttributes) {
      if (!active.has(attribute)) {
        gl.disableVertexAttribArray(attribute);
      }
    }
    this.enabledAttributes.clear();
    for (const [attribute, offset, size] of locations) {
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, STRIDE, offset);
      this.enabledAttributes.add(attribute);
    }
  }

  private setProjection(
    shaderProgram: WebGLProgram,
    plan: TriangleFrame
  ): void {
    const gl = this.gl;
    gl.uniform1f(
      requiredUniform(gl, shaderProgram, 'aspect'),
      this.canvas.width / this.canvas.height
    );
    gl.uniform1f(
      requiredUniform(gl, shaderProgram, 'tangent'),
      Math.tan((plan.verticalFieldOfViewDegrees * Math.PI) / 360)
    );
    gl.uniform2f(
      requiredUniform(gl, shaderProgram, 'depthRange'),
      plan.nearPlane,
      plan.farPlane
    );
    gl.uniform2f(
      requiredUniform(gl, shaderProgram, 'viewport'),
      this.canvas.width,
      this.canvas.height
    );
  }

  private uniform3(
    shaderProgram: WebGLProgram,
    name: string,
    value: readonly [number, number, number] | Vector3
  ): void {
    const location = requiredUniform(this.gl, shaderProgram, name);
    if ('x' in value) {
      this.gl.uniform3f(location, value.x, value.y, value.z);
    } else {
      this.gl.uniform3f(location, value[0], value[1], value[2]);
    }
  }

  private readonly pendingTimings: WebGLQuery[] = [];

  /// #380 prototype instrumentation: when a page sets `__shadowTiming` to an array, each
  /// Enhanced frame's GPU time in milliseconds is pushed onto it once the GPU reports it.
  private beginTiming(): WebGLQuery | undefined {
    const gl = this.gl;
    const sink = (globalThis as Record<string, unknown>)['__shadowTiming'];
    const extension = Array.isArray(sink)
      ? (gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
          readonly GPU_DISJOINT_EXT: number;
          readonly TIME_ELAPSED_EXT: number;
        } | null)
      : null;
    if (!Array.isArray(sink) || extension === null) {
      return undefined;
    }
    while (this.pendingTimings.length > 0) {
      const oldest = this.pendingTimings[0]!;
      if (!gl.getQueryParameter(oldest, gl.QUERY_RESULT_AVAILABLE)) {
        break;
      }
      this.pendingTimings.shift();
      if (!gl.getParameter(extension.GPU_DISJOINT_EXT)) {
        sink.push(gl.getQueryParameter(oldest, gl.QUERY_RESULT) / 1e6);
      }
      gl.deleteQuery(oldest);
    }
    const query = gl.createQuery();
    if (query === null) {
      return undefined;
    }
    gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
    return query;
  }

  private endTiming(query: WebGLQuery | undefined): void {
    if (query === undefined) {
      return;
    }
    const gl = this.gl;
    const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
      readonly TIME_ELAPSED_EXT: number;
    };
    gl.endQuery(extension.TIME_ELAPSED_EXT);
    this.pendingTimings.push(query);
  }

  private renderEnhanced(
    plan: TriangleFrame,
    frame: LightingRender,
    resources: EnhancedResources
  ): void {
    const gl = this.gl;
    const edge = frame.shadowEdge;
    const usesMaps = edge === 'soft' || edge === 'hard' || edge === 'stepped';
    const matrices = SHADOW_WINDOWS.map(window =>
      lightMatrix(frame.lighting, frame.view, frame.eyeWorld, window)
    );
    // The Body's surface and the ground records under the structures are flat on the ground
    // and cast nothing; the exact candidates leave them out (the maps keep them, as shipped).
    const structureStart =
      (plan.fillTriangleCount +
        plan.islandTriangleCount +
        plan.groundTriangleCount) *
      3 *
      FLOATS_PER_VERTEX;
    const casters = shadowCasterVertices(
      usesMaps ? plan.vertices : plan.vertices.subarray(structureStart)
    );

    if (usesMaps) {
      const casterCount = casters.length / FLOATS_PER_VERTEX;
      gl.bindBuffer(gl.ARRAY_BUFFER, resources.casterBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, casters, gl.DYNAMIC_DRAW);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(...SHADOW_POLYGON_OFFSET);
      this.bindGeometry(resources.depthProgram, resources.casterBuffer, [
        ['view', 0, 3]
      ]);
      for (let index = 0; index < resources.maps.length; index += 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, resources.maps[index]!.framebuffer);
        gl.viewport(0, 0, SHADOW_RESOLUTION, SHADOW_RESOLUTION);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(
          requiredUniform(gl, resources.depthProgram, 'lightMatrix'),
          false,
          matrices[index]!
        );
        gl.drawArrays(gl.TRIANGLES, 0, casterCount);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(plan.clear[0], plan.clear[1], plan.clear[2], 1);
    if (edge === 'volume') {
      gl.clearStencil(0);
      gl.clear(
        gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT
      );
    } else {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    this.drawSky(plan);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.cullAsConfigured();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, plan.vertices, gl.DYNAMIC_DRAW);
    this.bindGeometry(resources.colourProgram, this.buffer, COLOUR_ATTRIBUTES);
    this.setLitUniforms(plan, frame, resources, matrices);

    const mode = requiredUniform(gl, resources.colourProgram, 'shadowMode');
    if (edge === 'exact') {
      this.uploadCasterGrid(
        resources,
        casterGrid(casters, frame.lighting.sunView)
      );
      gl.uniform1i(mode, 3);
      this.drawLayers(resources.colourProgram, plan);
      return;
    }
    if (edge !== 'volume') {
      gl.uniform1i(mode, 0);
      this.drawLayers(resources.colourProgram, plan);
      return;
    }

    // Stencil shadow volumes, depth-fail: ambient everywhere, count each pixel's volumes behind
    // it, then full Sunlight where the count is zero.
    gl.uniform1i(mode, 1);
    this.drawLayers(resources.colourProgram, plan);

    const volumes = shadowVolumeVertices(casters, frame.lighting.sunView);
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.volumeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, volumes, gl.DYNAMIC_DRAW);
    this.bindGeometry(
      resources.volumeProgram,
      resources.volumeBuffer,
      COLOUR_ATTRIBUTES
    );
    this.setProjection(resources.volumeProgram, plan);
    gl.uniform1f(requiredUniform(gl, resources.volumeProgram, 'depthBias'), 0);
    gl.colorMask(false, false, false, false);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.CULL_FACE);
    gl.frontFace(gl.CW);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.INCR_WRAP, gl.KEEP);
    gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.DECR_WRAP, gl.KEEP);
    gl.drawArrays(gl.TRIANGLES, 0, volumes.length / FLOATS_PER_VERTEX);

    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    this.cullAsConfigured();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    this.bindGeometry(resources.colourProgram, this.buffer, COLOUR_ATTRIBUTES);
    gl.uniform1i(mode, 2);
    this.drawLayers(resources.colourProgram, plan, true);
    gl.depthMask(true);
    gl.disable(gl.STENCIL_TEST);
  }

  private setLitUniforms(
    plan: TriangleFrame,
    frame: LightingRender,
    resources: EnhancedResources,
    matrices: readonly Float32Array[]
  ): void {
    const gl = this.gl;
    this.setProjection(resources.colourProgram, plan);
    this.uniform3(resources.colourProgram, 'sunView', frame.lighting.sunView);
    this.uniform3(
      resources.colourProgram,
      'sunColour',
      frame.lighting.sunColour
    );
    this.uniform3(
      resources.colourProgram,
      'ambientSky',
      frame.lighting.ambientSky
    );
    this.uniform3(
      resources.colourProgram,
      'ambientGround',
      frame.lighting.ambientGround
    );
    const sampler = frame.shadowEdge === 'soft' ? 'soft' : 'hard';
    gl.uniform1i(
      requiredUniform(gl, resources.colourProgram, 'hardEdge'),
      sampler === 'hard' ? 1 : 0
    );

    for (let index = 0; index < resources.maps.length; index += 1) {
      const prefix = index === 0 ? 'near' : 'far';
      const window = SHADOW_WINDOWS[index]!;
      gl.uniformMatrix4fv(
        requiredUniform(gl, resources.colourProgram, `${prefix}LightMatrix`),
        false,
        matrices[index]!
      );
      const texel = (2 * window.halfExtent) / window.resolution;
      gl.uniform2f(
        requiredUniform(gl, resources.colourProgram, `${prefix}ShadowBias`),
        SHADOW_NORMAL_OFFSET_TEXELS * texel,
        SHADOW_DEPTH_BIAS_UNITS / (2 * window.depthHalfRange)
      );
      gl.activeTexture(index === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, resources.maps[index]!.texture);
      gl.bindSampler(index, resources.samplers[sampler]);
    }
  }

  private uploadCasterGrid(
    resources: EnhancedResources,
    grid: ReturnType<typeof casterGrid>
  ): void {
    const gl = this.gl;
    const program = resources.colourProgram;
    for (const unit of [2, 3, 4]) {
      gl.bindSampler(unit, null);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, resources.casterTextures.triangles);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      CASTER_TEXTURE_WIDTH,
      grid.triangleRows,
      0,
      gl.RGBA,
      gl.FLOAT,
      grid.triangles
    );
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, resources.casterTextures.cells);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG32I,
      CASTER_GRID_SIZE,
      CASTER_GRID_SIZE,
      0,
      gl.RG_INTEGER,
      gl.INT,
      grid.cells
    );
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, resources.casterTextures.indices);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32I,
      CASTER_TEXTURE_WIDTH,
      grid.indexRows,
      0,
      gl.RED_INTEGER,
      gl.INT,
      grid.indices
    );
    const [lx, ly, lz] = grid.basis;
    gl.uniformMatrix3fv(requiredUniform(gl, program, 'lightBasis'), false, [
      lx.x,
      lx.y,
      lx.z,
      ly.x,
      ly.y,
      ly.z,
      lz.x,
      lz.y,
      lz.z
    ]);
    gl.uniform4f(requiredUniform(gl, program, 'gridBounds'), ...grid.bounds);
    gl.uniform1i(requiredUniform(gl, program, 'gridSize'), CASTER_GRID_SIZE);
  }
}
