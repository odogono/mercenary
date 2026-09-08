import type { Mesh, Point, Primitive } from './data.ts';
import { triangulate } from './geometry.ts';

export const createViewer = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
  if (!gl) {
    throw new Error(
      'WebGL2 is unavailable. Enable hardware acceleration to inspect models.'
    );
  }
  const shader = (type: number, source: string) => {
    const value = gl.createShader(type)!;
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
      throw new Error('Could not initialise model shaders.');
    }
    return value;
  };
  const vertex = shader(
    gl.VERTEX_SHADER,
    `#version 300 es
    in vec3 position; in vec3 colour; in vec3 endpoint; in float edge;
    out vec3 ink;
    uniform vec2 angle; uniform vec2 scale; uniform vec2 viewport;
    vec3 project(vec3 position) {
      // ST model space has the opposite handedness to the viewer.
      float sourceZ=-position.z;
      float x=position.x*cos(angle.x)+sourceZ*sin(angle.x);
      float z=-position.x*sin(angle.x)+sourceZ*cos(angle.x);
      float y=position.y*cos(angle.y)-z*sin(angle.y);
      z=position.y*sin(angle.y)+z*cos(angle.y);
      return vec3(x*scale.x,y*scale.y,-z*0.1);
    }
    void main() {
      vec3 point=project(position);
      if (edge != 0.0) {
        vec2 direction=(project(endpoint).xy-point.xy)*viewport;
        float extent=length(direction);
        if (extent > 0.00001) {
          // One CSS-pixel stroke, independent of device pixel ratio. Its
          // endpoints and depth still follow the authored model geometry.
          point.xy+=vec2(-direction.y,direction.x)/extent*edge/viewport;
        }
      }
      gl_Position=vec4(point,1.0); ink=colour;
    }`
  );
  const fragment = shader(
    gl.FRAGMENT_SHADER,
    `#version 300 es
    precision highp float; in vec3 ink; out vec4 pixel;
    void main() { pixel=vec4(ink,1.0); }`
  );
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Could not initialise model renderer.');
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  gl.useProgram(program);
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [name, offset, size] of [
    ['position', 0, 3],
    ['colour', 12, 3],
    ['endpoint', 24, 3],
    ['edge', 36, 1]
  ] as const) {
    const attribute = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 40, offset);
  }
  let yaw = -0.55,
    pitch = 0.3,
    zoom = 0.8,
    wire = false,
    mesh: Mesh | null = null;
  let fillCount = 0,
    lineCount = 0;
  const rebuild = () => {
    if (!mesh) {
      fillCount = 0;
      lineCount = 0;
      return;
    }
    const low = [Infinity, Infinity, Infinity],
      high = [-Infinity, -Infinity, -Infinity];
    for (const v of mesh.vertices) {
      for (let i = 0; i < 3; i++) {
        low[i] = Math.min(low[i]!, v[i]!);
        high[i] = Math.max(high[i]!, v[i]!);
      }
    }
    const center = low.map((v, i) => (v + high[i]!) / 2);
    const radius = Math.max(
      ...mesh.vertices.map(v => Math.hypot(...v.map((n, i) => n - center[i]!))),
      1
    );
    const points = mesh.vertices.map(
      v => v.map((n, i) => (n - center[i]!) / radius) as unknown as Point
    );
    const data: number[] = [];
    const add = (index: number, p: Primitive, endpoint = index, edge = 0) => {
      data.push(...points[index]!);
      for (const offset of [1, 3, 5]) {
        data.push(
          Number.parseInt(p.colour.slice(offset, offset + 2), 16) / 255
        );
      }
      data.push(...points[endpoint]!, edge);
    };
    for (const face of mesh.faces) {
      const triangles = triangulate(mesh.vertices, face.vertices);
      // Segment-based walls have no authored polygon winding. Back-face
      // culling still admits only one copy, preserving coloured face pairs.
      if (face.doubleSided) {
        triangles.push(...[...triangles].reverse());
      }
      for (const index of triangles) {
        add(index, face);
      }
    }
    fillCount = data.length / 10;
    const paths = wire ? [...mesh.faces, ...mesh.lines] : mesh.lines;
    for (const path of paths) {
      for (
        let i = 0;
        i < path.vertices.length - (path.vertices.length === 2 ? 1 : 0);
        i++
      ) {
        const a = path.vertices[i]!,
          b = path.vertices[(i + 1) % path.vertices.length]!;
        add(a, path, b, -1);
        add(a, path, b, 1);
        add(b, path, a, -1);
        add(a, path, b, -1);
        add(b, path, a, -1);
        add(b, path, a, 1);
      }
    }
    lineCount = data.length / 10 - fillCount;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  };
  const draw = () => {
    const width = Math.max(
        1,
        Math.round(canvas.clientWidth * devicePixelRatio)
      ),
      height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.015, 0.035, 0.045, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(gl.getUniformLocation(program, 'angle'), yaw, pitch);
    gl.uniform2f(
      gl.getUniformLocation(program, 'viewport'),
      canvas.clientWidth,
      canvas.clientHeight
    );
    gl.uniform2f(
      gl.getUniformLocation(program, 'scale'),
      zoom * Math.min(1, height / width),
      zoom * Math.min(1, width / height)
    );
    // The Z reflection reverses winding, including differently coloured
    // opposite sides of coincident faces. Only the facing side may write depth.
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CW);
    gl.cullFace(gl.BACK);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    if (!wire) {
      // Keep coplanar source strokes visible without changing their geometry.
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, fillCount);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, fillCount, lineCount);
  };
  const reset = () => {
    yaw = -0.55;
    pitch = 0.3;
    zoom = 0.8;
    draw();
  };
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', event => {
    drag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.focus();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) {
      return;
    }
    yaw += (event.clientX - drag.x) * 0.01;
    pitch = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, pitch + (event.clientY - drag.y) * 0.01)
    );
    drag = { x: event.clientX, y: event.clientY };
    draw();
  });
  canvas.addEventListener('lostpointercapture', () => {
    drag = null;
  });
  const magnify = (factor: number) => {
    zoom = Math.max(0.1, Math.min(8, zoom * factor));
    draw();
  };
  canvas.addEventListener(
    'wheel',
    event => {
      event.preventDefault();
      magnify(Math.exp(-event.deltaY * 0.001));
    },
    { passive: false }
  );
  canvas.addEventListener('keydown', event => {
    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        '+',
        '=',
        '-',
        '0'
      ].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();
    if (event.key === 'ArrowLeft') {
      yaw -= 0.1;
    }
    if (event.key === 'ArrowRight') {
      yaw += 0.1;
    }
    if (event.key === 'ArrowUp') {
      pitch = Math.min(Math.PI / 2, pitch + 0.1);
    }
    if (event.key === 'ArrowDown') {
      pitch = Math.max(-Math.PI / 2, pitch - 0.1);
    }
    if (event.key === '+' || event.key === '=') {
      magnify(1.1);
    }
    if (event.key === '-') {
      magnify(1 / 1.1);
    }
    if (event.key === '0') {
      reset();
    }
    draw();
  });
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    canvas.dispatchEvent(
      new CustomEvent('viewer-error', {
        detail:
          'Graphics context lost. Reload the catalogue to restore the viewer.'
      })
    );
  });
  return {
    reset,
    show(value: Mesh | null, preserveView = false) {
      mesh = value;
      rebuild();
      if (preserveView) {
        draw();
      } else {
        reset();
      }
    },
    wireframe(value: boolean) {
      wire = value;
      rebuild();
      draw();
    },
    zoomIn: () => magnify(1.2),
    zoomOut: () => magnify(1 / 1.2)
  };
};
