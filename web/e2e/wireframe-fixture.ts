import { planEnhancedFrame } from '../src/enhanced/frame.ts';
import { ENHANCED_PRESENTATION } from '../src/enhanced/presentation.ts';
import { FrameRenderer } from '../src/rendering/renderer.ts';
import { Renderer, type FramePlan } from '../src/shell/frame.ts';

/// Authentic Targ's line pass, and the same canvas shared with the shared planner's renderer
/// as Enhanced Targ shares it (ADR 0087): an Authentic frame drawn after an Enhanced one is the
/// frame drawn before it.

const canvas = document.getElementById('frame') as HTMLCanvasElement;
const result = document.getElementById('result')!;
const renderer = new Renderer(canvas);
const shared = new FrameRenderer(canvas, { cullBackFaces: true }, () => {
  throw new Error('context lost');
});
// The shared renderer sizes the canvas to its element; size it first, as the shell does.
shared.resize();
const gl = canvas.getContext('webgl2')!;
const white = { blue: 255, green: 255, red: 255 };
const black = { blue: 0, green: 0, red: 0 };
const plan = (vertices: number[], colour = white): FramePlan => ({
  batches: [
    {
      colour,
      mode: 'lines',
      pointSize: 1,
      vertices: new Float32Array(vertices)
    }
  ],
  clear: black,
  lines: vertices.length / 4,
  overlays: [],
  points: 0,
  size: { height: 480, width: 640 }
});
const readPixels = (): Uint8Array => {
  const data = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(
    0,
    0,
    canvas.width,
    canvas.height,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data
  );
  return data;
};
const pixels = (vertices: number[]): Uint8Array => {
  renderer.render(plan(vertices));
  return readPixels();
};
const redAt = (data: Uint8Array, x: number, y: number): number =>
  data[
    ((canvas.height - 1 - Math.floor((y * canvas.height) / 480)) *
      canvas.width +
      Math.floor((x * canvas.width) / 640)) *
      4
  ]!;
const difference = (left: Uint8Array, right: Uint8Array): number =>
  left.reduce(
    (maximum, value, index) =>
      Math.max(maximum, Math.abs(value - right[index]!)),
    0
  );
const horizontal = [100, 60, 220, 60];
const authenticBefore = pixels(horizontal);
// An Enhanced frame through the shared planner: a white plane below a black sky.
shared.render(
  planEnhancedFrame(
    {
      baseColour: '#ffffff',
      floorLabelGlyphs: {},
      grid: { cellsPerAxis: 16, cellUnits: 0x1_00_00, origin: { x: 0, z: 0 } },
      islands: [],
      placements: [],
      sky: null
    },
    { body: 'test', heading: 0, pitch: -0.2, position: { x: 0, y: 63, z: 0 } },
    ENHANCED_PRESENTATION
  )
);
const enhanced = readPixels();
renderer.resume();
const authenticAfter = pixels(horizontal);
const report = {
  authenticDifference: difference(authenticAfter, authenticBefore),
  core: redAt(authenticBefore, 160, 60),
  enhancedGround: redAt(enhanced, 320, 470),
  webglError: gl.getError()
};
result.textContent = JSON.stringify(report);
result.dataset['state'] = 'ready';
