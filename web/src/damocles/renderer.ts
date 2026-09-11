import type { ErisFramePlan } from './frame.ts';

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

const program = (gl: WebGL2RenderingContext): WebGLProgram => {
  const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
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
}

export class ErisRenderer {
  private readonly buffer: WebGLBuffer;
  private readonly canvas: HTMLCanvasElement;
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

  render(plan: ErisFramePlan): void {
    const gl = this.gl;
    if (gl.isContextLost()) {
      throw new Error(
        'The graphics context was lost. Reload the page to restore Damocles.'
      );
    }
    this.resize();
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
}
