import type { Vector3 } from '../orientation/index.ts';
import type { ErisFramePlan } from './frame.ts';
import {
  lightMatrix,
  type ErisLighting,
  type ShadowWindow
} from './lighting.ts';

/// Eris in Filled Presentation: one WebGL2 program, flat colours, a depth buffer.
///
/// Damocles's original fill order is unrecovered, and a depth buffer is not a claim about it:
/// it draws the same picture any correct ordering would. Faces are flat in their catalogue
/// colours with no lighting, which is what the Working Authority shows outdoors (ADR 0043).
/// The shape follows the Flyover renderer rather than Targ's line-list `Renderer`, whose
/// batches are pixel-space lines under the C64 Reference Viewport.
const VERTEX = `#version 300 es
in vec3 view;
in vec3 colour;
uniform float aspect;
uniform float tangent;
uniform vec2 depthRange;
out vec3 faceColour;

void main() {
  faceColour = colour;
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

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 faceColour;
out vec4 pixel;
void main() { pixel = vec4(faceColour, 1.0); }`;

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
${PROJECT}
out vec3 faceColour;
out vec3 viewPosition;
void main() {
  faceColour = colour;
  viewPosition = view;
  gl_Position = project(view);
}`;

const LIT_FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 faceColour;
in vec3 viewPosition;
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

float shadowAt(vec3 p, vec3 n, float ndl) {
  vec3 nearOffset = p + n * nearShadowBias.x * (1.0 - ndl);
  vec3 nearUv = (nearLightMatrix * vec4(nearOffset, 1.0)).xyz * 0.5 + 0.5;
  if (insideShadow(nearUv)) {
    nearUv.z -= nearShadowBias.y;
    return pcf(nearShadowMap, nearUv);
  }
  vec3 farOffset = p + n * farShadowBias.x * (1.0 - ndl);
  vec3 farUv = (farLightMatrix * vec4(farOffset, 1.0)).xyz * 0.5 + 0.5;
  if (insideShadow(farUv)) {
    farUv.z -= farShadowBias.y;
    return pcf(farShadowMap, farUv);
  }
  return 1.0;
}

void main() {
  vec3 n = normalize(-cross(dFdx(viewPosition), dFdy(viewPosition)));
  float lambert = max(dot(n, sunView), 0.0);
  float shadow = lambert > 0.0 ? shadowAt(viewPosition, n, lambert) : 1.0;
  vec3 ambient = mix(ambientGround, ambientSky, n.y * 0.5 + 0.5);
  pixel = vec4(faceColour * (ambient + sunColour * lambert * shadow), 1.0);
}`;

const DEPTH_VERTEX = `#version 300 es
in vec3 view;
uniform mat4 lightMatrix;
void main() { gl_Position = lightMatrix * vec4(view, 1.0); }`;

const DEPTH_FRAGMENT = `#version 300 es
precision highp float;
void main() {}`;

const SHADOW_RESOLUTION = 2048;
export const ERIS_SHADOW_WINDOWS = [
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
    throw new Error('Could not allocate a Damocles shader.');
  }
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(value);
    gl.deleteShader(value);
    throw new Error(
      `Could not compile a Damocles shader${detail ? `: ${detail}` : '.'}`
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
  const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const value = gl.createProgram();
  if (value === null) {
    throw new Error('Could not allocate the Damocles shader program.');
  }
  gl.attachShader(value, vertex);
  gl.attachShader(value, fragment);
  gl.linkProgram(value);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
    const detail = gl.getProgramInfoLog(value);
    gl.deleteProgram(value);
    throw new Error(
      `Could not link the Damocles renderer${detail ? `: ${detail}` : '.'}`
    );
  }
  return value;
};

interface ShadowMap {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
}

interface EnhancedResources {
  readonly casterBuffer: WebGLBuffer;
  readonly colourProgram: WebGLProgram;
  readonly depthProgram: WebGLProgram;
  readonly maps: readonly [ShadowMap, ShadowMap];
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
      for (let value = 0; value < 6; value += 1) {
        hash = Math.imul(
          hash ^ words[offset + vertex * 6 + value]!,
          16_777_619
        );
      }
    }
    return hash >>> 0;
  };
  const isReverseOf = (offset: number, previous: number): boolean => {
    for (let vertex = 0; vertex < 3; vertex += 1) {
      for (let value = 0; value < 6; value += 1) {
        if (
          words[offset + vertex * 6 + value] !==
          words[previous + (2 - vertex) * 6 + value]
        ) {
          return false;
        }
      }
    }
    return true;
  };
  let written = 0;
  for (let offset = 0; offset < vertices.length; offset += 18) {
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
    result.set(vertices.subarray(offset, offset + 18), written);
    written += 18;
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
        'The graphics context was lost. Reload the page to restore Damocles.'
      );
    }
    throw new Error(`Damocles shader has no ${name} uniform.`);
  }
  return location;
};

export interface ErisRendererOptions {
  readonly cullBackFaces: boolean;
  readonly lighting?: true;
}

export interface ErisLightingRender {
  readonly eyeWorld: Vector3;
  readonly heading: number;
  readonly lighting: ErisLighting;
}

export class ErisRenderer {
  private readonly buffer: WebGLBuffer;
  private readonly canvas: HTMLCanvasElement;
  private readonly enabledAttributes = new Set<number>();
  private enhanced: EnhancedResources | undefined;
  private readonly gl: WebGL2RenderingContext;
  private readonly shaderProgram: WebGLProgram;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly options: ErisRendererOptions,
    onContextLost: () => void
  ) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (gl === null) {
      throw new Error(
        'WebGL2 is unavailable. Enable hardware acceleration to play Damocles.'
      );
    }
    this.canvas = canvas;
    this.gl = gl;
    this.shaderProgram = program(gl);
    const buffer = gl.createBuffer();
    if (buffer === null) {
      throw new Error('Could not allocate the Damocles geometry buffer.');
    }
    this.buffer = buffer;
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      onContextLost();
    });
  }

  private resize(): void {
    const ratio = window.devicePixelRatio;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render(plan: ErisFramePlan, enhanced?: ErisLightingRender): void {
    const gl = this.gl;
    if (gl.isContextLost()) {
      throw new Error(
        'The graphics context was lost. Reload the page to restore Damocles.'
      );
    }
    this.resize();
    if (enhanced !== undefined && this.options.lighting === true) {
      this.enhanced ??= this.createEnhanced(gl);
      this.renderEnhanced(plan, enhanced, this.enhanced);
      return;
    }
    gl.clearColor(plan.clear[0], plan.clear[1], plan.clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    if (this.options.cullBackFaces) {
      gl.enable(gl.CULL_FACE);
      gl.frontFace(gl.CW);
      gl.cullFace(gl.BACK);
    } else {
      gl.disable(gl.CULL_FACE);
    }
    gl.useProgram(this.shaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, plan.vertices, gl.DYNAMIC_DRAW);
    for (const [name, offset] of [
      ['view', 0],
      ['colour', 12]
    ] as const) {
      const attribute = gl.getAttribLocation(this.shaderProgram, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 24, offset);
      this.enabledAttributes.add(attribute);
    }
    gl.uniform1f(
      requiredUniform(gl, this.shaderProgram, 'aspect'),
      this.canvas.width / this.canvas.height
    );
    gl.uniform1f(
      requiredUniform(gl, this.shaderProgram, 'tangent'),
      Math.tan((plan.verticalFieldOfViewDegrees * Math.PI) / 360)
    );
    gl.uniform2f(
      requiredUniform(gl, this.shaderProgram, 'depthRange'),
      plan.nearPlane,
      plan.farPlane
    );
    gl.drawArrays(gl.TRIANGLES, 0, plan.triangleCount * 3);
  }

  private createEnhanced(gl: WebGL2RenderingContext): EnhancedResources {
    const casterBuffer = gl.createBuffer();
    if (casterBuffer === null) {
      throw new Error(
        'Could not allocate the Damocles shadow geometry buffer.'
      );
    }
    const createMap = (): ShadowMap => {
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      if (texture === null || framebuffer === null) {
        throw new Error('Could not allocate a Damocles shadow map.');
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
        throw new Error(
          `Damocles shadow framebuffer is incomplete (${status}).`
        );
      }
      return { framebuffer, texture };
    };
    const maps = [createMap(), createMap()] as const;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return {
      casterBuffer,
      colourProgram: program(gl, LIT_VERTEX, LIT_FRAGMENT),
      depthProgram: program(gl, DEPTH_VERTEX, DEPTH_FRAGMENT),
      maps
    };
  }

  private bindGeometry(
    shaderProgram: WebGLProgram,
    buffer: WebGLBuffer,
    attributes: readonly (readonly [string, number])[]
  ): void {
    const gl = this.gl;
    gl.useProgram(shaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const locations = attributes.map(
      ([name, offset]) =>
        [gl.getAttribLocation(shaderProgram, name), offset] as const
    );
    const active = new Set(locations.map(([attribute]) => attribute));
    for (const attribute of this.enabledAttributes) {
      if (!active.has(attribute)) {
        gl.disableVertexAttribArray(attribute);
      }
    }
    this.enabledAttributes.clear();
    for (const [attribute, offset] of locations) {
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 24, offset);
      this.enabledAttributes.add(attribute);
    }
  }

  private setProjection(
    shaderProgram: WebGLProgram,
    plan: ErisFramePlan
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

  private renderEnhanced(
    plan: ErisFramePlan,
    frame: ErisLightingRender,
    resources: EnhancedResources
  ): void {
    const gl = this.gl;
    const matrices = ERIS_SHADOW_WINDOWS.map(window =>
      lightMatrix(frame.lighting, frame.heading, frame.eyeWorld, window)
    );
    const casters = shadowCasterVertices(plan.vertices);
    const casterCount = casters.length / 6;

    gl.bindBuffer(gl.ARRAY_BUFFER, resources.casterBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, casters, gl.DYNAMIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(...SHADOW_POLYGON_OFFSET);
    this.bindGeometry(resources.depthProgram, resources.casterBuffer, [
      ['view', 0]
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

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(plan.clear[0], plan.clear[1], plan.clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.options.cullBackFaces) {
      gl.enable(gl.CULL_FACE);
      gl.frontFace(gl.CW);
      gl.cullFace(gl.BACK);
    } else {
      gl.disable(gl.CULL_FACE);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, plan.vertices, gl.DYNAMIC_DRAW);
    this.bindGeometry(resources.colourProgram, this.buffer, [
      ['view', 0],
      ['colour', 12]
    ]);
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

    for (let index = 0; index < resources.maps.length; index += 1) {
      const prefix = index === 0 ? 'near' : 'far';
      const window = ERIS_SHADOW_WINDOWS[index]!;
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
      gl.uniform1i(
        requiredUniform(gl, resources.colourProgram, `${prefix}ShadowMap`),
        index
      );
    }
    gl.drawArrays(gl.TRIANGLES, 0, plan.triangleCount * 3);
  }
}
