import {
  Renderer,
  type FramePlan,
  type InkOptions
} from '../src/shell/frame.ts';

const canvas = document.getElementById('frame') as HTMLCanvasElement;
const result = document.getElementById('result')!;
const scale = Number(new URLSearchParams(location.search).get('scale') ?? 1);
canvas.width = 640 * scale;
canvas.height = 480 * scale;
const renderer = new Renderer(canvas);
const gl = canvas.getContext('webgl2')!;
const white = { blue: 255, green: 255, red: 255 };
const black = { blue: 0, green: 0, red: 0 };
const heavy: InkOptions = { glow: 0.7, thickness: 3 };
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
const pixels = (vertices: number[], options = heavy): Uint8Array => {
  renderer.render(plan(vertices), options);
  return readPixels();
};
const redAt = (data: Uint8Array, x: number, y: number): number =>
  data[
    ((canvas.height - 1 - Math.floor(y * scale)) * canvas.width +
      Math.floor(x * scale)) *
      4
  ]!;
const horizontal = [100, 60, 220, 60];
const authenticBefore = pixels(horizontal, { glow: 0, thickness: 1 });
const isolated = pixels(horizontal);
const duplicate = pixels([...horizontal, ...horizontal]);
const vertical = [160, 20, 160, 100];
const aloneVertical = pixels(vertical);
const crossing = pixels([...horizontal, ...vertical]);
const diagonal = [100, 60, 150, 120];
const aloneDiagonal = pixels(diagonal);
const join = pixels([...horizontal, ...diagonal]);
let duplicateDifference = 0;
let crossingExcess = 0;
let joinExcess = 0;
for (let index = 0; index < isolated.length; index += 4) {
  duplicateDifference = Math.max(
    duplicateDifference,
    Math.abs(duplicate[index]! - isolated[index]!)
  );
  crossingExcess = Math.max(
    crossingExcess,
    crossing[index]! - Math.max(isolated[index]!, aloneVertical[index]!)
  );
  joinExcess = Math.max(
    joinExcess,
    join[index]! - Math.max(isolated[index]!, aloneDiagonal[index]!)
  );
}
const degenerate = pixels([300, 60, 300, 60]);
const originalSize = { height: canvas.height, width: canvas.width };
canvas.width += 64;
canvas.height += 32;
const resized = pixels(horizontal);
const resizeCore = redAt(
  resized,
  (160 * canvas.width) / originalSize.width,
  (60 * canvas.height) / originalSize.height
);
canvas.width = originalSize.width;
canvas.height = originalSize.height;
const restored = pixels(horizontal);
const restoreDifference = restored.reduce(
  (difference, value, index) =>
    index % 4 === 0
      ? Math.max(difference, Math.abs(value - isolated[index]!))
      : difference,
  0
);
const authenticAfter = pixels(horizontal, { glow: 0, thickness: 1 });
const authenticDifference = authenticAfter.reduce(
  (difference, value, index) =>
    Math.max(difference, Math.abs(value - authenticBefore[index]!)),
  0
);
const roadPlan = plan(horizontal);
const roads: FramePlan = {
  ...roadPlan,
  batches: roadPlan.batches.map(batch => ({ ...batch, style: 'roads' }))
};
renderer.render(roads, heavy);
const defaultRoad = readPixels();
renderer.render(roads, { glow: 0, thickness: 1 }, heavy);
const glowingRoad = readPixels();
const roadDefaultDifference = defaultRoad.reduce(
  (difference, value, index) =>
    Math.max(difference, Math.abs(value - authenticBefore[index]!)),
  0
);
const roadGlowDifference = glowingRoad.reduce(
  (difference, value, index) =>
    Math.max(difference, Math.abs(value - isolated[index]!)),
  0
);
renderer.render({ ...plan(horizontal, black), clear: white }, heavy);
const darkLine = readPixels();
renderer.render(
  { ...plan([...horizontal, ...horizontal], black), clear: white },
  heavy
);
const darkDuplicate = readPixels();
const darkDuplicateDifference = darkLine.reduce(
  (difference, value, index) =>
    index % 4 === 0
      ? Math.max(difference, Math.abs(value - darkDuplicate[index]!))
      : difference,
  0
);
const report = {
  authenticDifference,
  core: redAt(isolated, 160, 60),
  crossingExcess,
  darkDuplicateDifference,
  darkHalo: redAt(darkLine, 160, 64),
  degenerateCentre: redAt(degenerate, 300, 60),
  duplicateDifference,
  endpointHalo: redAt(isolated, 95, 60),
  joinExcess,
  resizeCore,
  restoreDifference,
  roadDefaultDifference,
  roadGlowDifference,
  webglError: gl.getError()
};
// A dense, deterministic view supplies a repeatable synchronous GPU timing sample.
const dense = Array.from({ length: 1500 }, (_, index) => {
  const x = (index * 97) % 620;
  const y = (index * 53) % 450;
  return [x, y, x + 15, y + 25];
}).flat();
const densePlan = plan(dense);
for (let index = 0; index < 10; index++) {
  renderer.render(densePlan, heavy);
}
gl.finish();
const timingPixel = new Uint8Array(4);
const start = performance.now();
for (let index = 0; index < 60; index++) {
  renderer.render(densePlan, heavy);
  gl.readPixels(320, 240, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, timingPixel);
}
const millisecondsPerFrame = (performance.now() - start) / 60;
// Isolated line, acute join, crossing, and a structure beside dark Map Lines.
const showcase = plan([
  ...horizontal,
  280,
  100,
  310,
  30,
  310,
  30,
  320,
  100,
  380,
  30,
  440,
  100,
  380,
  100,
  440,
  30,
  140,
  380,
  180,
  180,
  180,
  180,
  250,
  400,
  140,
  380,
  250,
  400,
  250,
  400,
  330,
  330,
  180,
  180,
  330,
  330,
  180,
  180,
  220,
  310,
  140,
  380,
  220,
  310,
  220,
  310,
  330,
  330
]);
renderer.render(
  {
    ...showcase,
    batches: [
      {
        colour: black,
        mode: 'lines',
        pointSize: 1,
        style: 'roads',
        vertices: new Float32Array([0, 200, 600, 340, 0, 220, 600, 360])
      },
      ...showcase.batches
    ],
    clear: { blue: 0, green: 128, red: 0 }
  },
  heavy
);
result.textContent = JSON.stringify({ ...report, millisecondsPerFrame });
result.dataset['state'] = 'ready';
