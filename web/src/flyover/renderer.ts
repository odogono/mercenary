import { cos, sin } from '../math/index.ts';
import type { FlyoverPose } from './camera.ts';
import type {
  FlyoverBackdropPresentation,
  FlyoverBodyMeshPresentation,
  FlyoverCameraPresentation,
  FlyoverLighting
} from './documents.ts';
import type { FlyoverBody } from './system.ts';

const appendVertex = (values: number[], point: readonly number[]): void => {
  values.push(...point, ...point);
};

export const createSphereMesh = (
  longitudeSegments: number,
  latitudeSegments: number
): Float32Array => {
  const values: number[] = [];
  const point = (longitude: number, latitude: number) => {
    const longitudeRadians = (longitude / longitudeSegments) * 2 * Math.PI;
    const latitudeRadians =
      (latitude / latitudeSegments) * Math.PI - Math.PI / 2;
    const ring = cos(latitudeRadians);
    return [
      ring * sin(longitudeRadians),
      sin(latitudeRadians),
      ring * cos(longitudeRadians)
    ] as const;
  };
  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const a = point(longitude, latitude);
      const b = point(longitude + 1, latitude);
      const c = point(longitude, latitude + 1);
      const d = point(longitude + 1, latitude + 1);
      for (const vertex of [a, b, c, b, d, c]) {
        appendVertex(values, vertex);
      }
    }
  }
  return new Float32Array(values);
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const createFlyoverBackdrop = (settings: {
  readonly starCount: number;
  readonly starSeed: number;
}): Float32Array => {
  const random = mulberry32(settings.starSeed);
  const values = new Float32Array(settings.starCount * 3);
  for (let index = 0; index < settings.starCount; index += 1) {
    const y = 1 - 2 * random();
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const turn = random() * 2 * Math.PI;
    values[index * 3] = ring * sin(turn);
    values[index * 3 + 1] = y;
    values[index * 3 + 2] = ring * cos(turn);
  }
  return values;
};

const channels = (colour: string): readonly [number, number, number] => [
  Number.parseInt(colour.slice(1, 3), 16) / 255,
  Number.parseInt(colour.slice(3, 5), 16) / 255,
  Number.parseInt(colour.slice(5, 7), 16) / 255
];

const shader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader => {
  const value = gl.createShader(type);
  if (value === null) {
    throw new Error('Could not allocate a Flyover shader.');
  }
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(value);
    gl.deleteShader(value);
    throw new Error(
      `Could not compile a Flyover shader${detail ? `: ${detail}` : '.'}`
    );
  }
  return value;
};

const program = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram => {
  const vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const value = gl.createProgram();
  if (value === null) {
    throw new Error('Could not allocate a Flyover shader program.');
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
      `Could not link the Flyover renderer${detail ? `: ${detail}` : '.'}`
    );
  }
  return value;
};

const BODY_VERTEX = `#version 300 es
in vec3 position;
in vec3 normal;
uniform vec3 centre;
uniform float radius;
uniform vec2 attitude;
uniform float aspect;
uniform float tangent;
uniform vec2 depthRange;
out vec3 surfaceNormal;
out vec3 relativeSurface;

vec3 viewSpace(vec3 point) {
  float sinHeading = sin(attitude.x);
  float cosHeading = cos(attitude.x);
  float sinPitch = sin(attitude.y);
  float cosPitch = cos(attitude.y);
  float yawed = point.x * cosHeading - point.z * sinHeading;
  float forward = -(point.x * sinHeading + point.z * cosHeading);
  return vec3(
    yawed,
    point.y * cosPitch - forward * sinPitch,
    point.y * sinPitch + forward * cosPitch
  );
}

void main() {
  relativeSurface = centre + position * radius;
  surfaceNormal = normal;
  vec3 viewed = viewSpace(relativeSurface);
  float nearPlane = depthRange.x;
  float farPlane = depthRange.y;
  float depthA = (farPlane + nearPlane) / (farPlane - nearPlane);
  float depthB = (2.0 * farPlane * nearPlane) / (farPlane - nearPlane);
  gl_Position = vec4(
    viewed.x / (aspect * tangent),
    viewed.y / tangent,
    viewed.z * depthA - depthB,
    viewed.z
  );
}`;

const BODY_FRAGMENT = `#version 300 es
precision highp float;
in vec3 surfaceNormal;
in vec3 relativeSurface;
uniform vec3 bodyColour;
uniform vec3 lightPosition;
uniform bool emissive;
out vec4 pixel;

void main() {
  float light = emissive
    ? 1.0
    : max(dot(normalize(surfaceNormal), normalize(lightPosition - relativeSurface)), 0.0);
  pixel = vec4(bodyColour * light, 1.0);
}`;

const STAR_VERTEX = `#version 300 es
in vec3 direction;
uniform vec2 attitude;
uniform float aspect;
uniform float tangent;
uniform float pointSize;

vec3 viewSpace(vec3 point) {
  float sinHeading = sin(attitude.x);
  float cosHeading = cos(attitude.x);
  float sinPitch = sin(attitude.y);
  float cosPitch = cos(attitude.y);
  float yawed = point.x * cosHeading - point.z * sinHeading;
  float forward = -(point.x * sinHeading + point.z * cosHeading);
  return vec3(
    yawed,
    point.y * cosPitch - forward * sinPitch,
    point.y * sinPitch + forward * cosPitch
  );
}

void main() {
  vec3 viewed = viewSpace(direction);
  gl_Position = vec4(
    viewed.x / (aspect * tangent),
    viewed.y / tangent,
    0.0,
    viewed.z
  );
  gl_PointSize = pointSize;
}`;

const STAR_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 starColour;
out vec4 pixel;
void main() { pixel = vec4(starColour, 1.0); }`;

interface FlyoverRendererSettings {
  readonly backdrop: FlyoverBackdropPresentation;
  readonly bodyMesh: FlyoverBodyMeshPresentation;
  readonly camera: FlyoverCameraPresentation;
  readonly lighting: FlyoverLighting;
}

export interface OrbitalBodyPlan {
  readonly body: FlyoverBody;
  readonly emissive: boolean;
  readonly lightPosition: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly relativeCentre: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

export interface OrbitalFramePlan {
  readonly bodies: readonly OrbitalBodyPlan[];
  readonly farPlane: number;
  readonly nearPlane: number;
}

export const planOrbitalFrame = (
  bodies: readonly FlyoverBody[],
  pose: FlyoverPose,
  lighting: FlyoverLighting
): OrbitalFramePlan => {
  const relative = bodies.map(body => {
    const relativeCentre = {
      x: body.position.x - pose.position.x,
      y: body.position.y - pose.position.y,
      z: body.position.z - pose.position.z
    };
    return {
      body,
      distance: Math.hypot(
        relativeCentre.x,
        relativeCentre.y,
        relativeCentre.z
      ),
      relativeCentre
    };
  });
  const farPlane =
    Math.max(
      1,
      ...relative.map(entry => entry.distance + entry.body.displayRadiusUnits)
    ) * 1.1;
  const positiveSurfaces = relative
    .map(entry => entry.distance - entry.body.displayRadiusUnits)
    .filter(distance => distance > 0);
  const nearestSurface = Math.min(...positiveSurfaces);
  const nearPlane = Math.max(
    0.001,
    Math.min(
      farPlane / 100_000,
      Number.isFinite(nearestSurface) ? nearestSurface / 4 : 0.001
    )
  );
  const source =
    lighting.kind === 'body'
      ? relative.find(entry => entry.body.id === lighting.sourceBodyId)
      : undefined;
  if (lighting.kind === 'body' && source === undefined) {
    throw new Error(`Flyover light source ${lighting.sourceBodyId} is absent.`);
  }
  const lightPosition = source?.relativeCentre ?? { x: 0, y: 0, z: 0 };
  return {
    bodies: relative.map(entry => ({
      body: entry.body,
      emissive: source?.body.id === entry.body.id,
      lightPosition,
      relativeCentre: entry.relativeCentre
    })),
    farPlane,
    nearPlane
  };
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
        'The graphics context was lost. Reload the page to restore the Flyover.'
      );
    }
    throw new Error(`Flyover shader has no ${name} uniform.`);
  }
  return location;
};

export class FlyoverRenderer {
  private readonly backdropBuffer: WebGLBuffer;
  private readonly bodyBuffer: WebGLBuffer;
  private readonly bodyProgram: WebGLProgram;
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly sphereVertexCount: number;
  private readonly starProgram: WebGLProgram;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly settings: FlyoverRendererSettings,
    onContextLost: () => void
  ) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
    if (gl === null) {
      throw new Error(
        'WebGL2 is unavailable. Enable hardware acceleration to use the Flyover.'
      );
    }
    this.canvas = canvas;
    this.gl = gl;
    this.bodyProgram = program(gl, BODY_VERTEX, BODY_FRAGMENT);
    this.starProgram = program(gl, STAR_VERTEX, STAR_FRAGMENT);
    const bodyBuffer = gl.createBuffer();
    const backdropBuffer = gl.createBuffer();
    if (bodyBuffer === null || backdropBuffer === null) {
      throw new Error('Could not allocate Flyover geometry buffers.');
    }
    this.bodyBuffer = bodyBuffer;
    this.backdropBuffer = backdropBuffer;
    const mesh = createSphereMesh(
      settings.bodyMesh.longitudeSegments,
      settings.bodyMesh.latitudeSegments
    );
    this.sphereVertexCount = mesh.length / 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, bodyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, backdropBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      createFlyoverBackdrop(settings.backdrop),
      gl.STATIC_DRAW
    );
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

  private attitude(shaderProgram: WebGLProgram, pose: FlyoverPose): void {
    const gl = this.gl;
    gl.uniform2f(
      requiredUniform(gl, shaderProgram, 'attitude'),
      pose.heading,
      pose.pitch
    );
    gl.uniform1f(
      requiredUniform(gl, shaderProgram, 'aspect'),
      this.canvas.width / this.canvas.height
    );
    gl.uniform1f(
      requiredUniform(gl, shaderProgram, 'tangent'),
      Math.tan(
        (this.settings.camera.verticalFieldOfViewDegrees * Math.PI) / 360
      )
    );
  }

  draw(bodies: readonly FlyoverBody[], pose: FlyoverPose): void {
    if (this.gl.isContextLost()) {
      throw new Error(
        'The graphics context was lost. Reload the page to restore the Flyover.'
      );
    }
    this.resize();
    const gl = this.gl;
    const clear = channels(this.settings.backdrop.colour);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.starProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.backdropBuffer);
    const direction = gl.getAttribLocation(this.starProgram, 'direction');
    gl.enableVertexAttribArray(direction);
    gl.vertexAttribPointer(direction, 3, gl.FLOAT, false, 0, 0);
    this.attitude(this.starProgram, pose);
    gl.uniform1f(
      requiredUniform(gl, this.starProgram, 'pointSize'),
      this.settings.backdrop.pointSizeCssPixels * window.devicePixelRatio
    );
    gl.uniform3f(
      requiredUniform(gl, this.starProgram, 'starColour'),
      ...channels(this.settings.backdrop.starColour)
    );
    gl.drawArrays(gl.POINTS, 0, this.settings.backdrop.starCount);

    const frame = planOrbitalFrame(bodies, pose, this.settings.lighting);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
    gl.useProgram(this.bodyProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bodyBuffer);
    for (const [name, offset] of [
      ['position', 0],
      ['normal', 12]
    ] as const) {
      const attribute = gl.getAttribLocation(this.bodyProgram, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 24, offset);
    }
    this.attitude(this.bodyProgram, pose);
    gl.uniform2f(
      requiredUniform(gl, this.bodyProgram, 'depthRange'),
      frame.nearPlane,
      frame.farPlane
    );
    for (const bodyPlan of frame.bodies) {
      const { body } = bodyPlan;
      gl.uniform3f(
        requiredUniform(gl, this.bodyProgram, 'centre'),
        bodyPlan.relativeCentre.x,
        bodyPlan.relativeCentre.y,
        bodyPlan.relativeCentre.z
      );
      gl.uniform1f(
        requiredUniform(gl, this.bodyProgram, 'radius'),
        body.displayRadiusUnits
      );
      gl.uniform3f(
        requiredUniform(gl, this.bodyProgram, 'bodyColour'),
        ...channels(body.colour)
      );
      gl.uniform1i(
        requiredUniform(gl, this.bodyProgram, 'emissive'),
        bodyPlan.emissive ? 1 : 0
      );
      gl.uniform3f(
        requiredUniform(gl, this.bodyProgram, 'lightPosition'),
        bodyPlan.lightPosition.x,
        bodyPlan.lightPosition.y,
        bodyPlan.lightPosition.z
      );
      gl.drawArrays(gl.TRIANGLES, 0, this.sphereVertexCount);
    }
  }
}
