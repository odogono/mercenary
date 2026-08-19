import { fetchReader, load } from '../payload/load.ts';
import {
  Camera,
  projectFrame,
  visible,
  type CameraFields,
  type Size
} from '../projection/index.ts';
import { Ink, World } from '../world/index.ts';
import { drawFrame } from './frame.ts';

/// One frame of Targ, drawn in a browser tab.
///
/// It loads the Data Payload over `fetch` — the read seam the loader was given for exactly
/// this — builds the world, projects one fixed pose and draws it. There is no loop, no input
/// and no timing: this page exists to be held beside `docs/frames/m4.2-opening-view.png` and
/// judged by eye (ADR 0011), which is what de-risks WebGL2 before six more modules are ported
/// on top of it. The Browser Shell proper is #95.
///
/// The pose is the `opening-view` Golden Trace's, at its viewport, so every number drawn here
/// is one the projection Replay Gate has already compared bit-for-bit against the Trace Oracle.
/// The same pose against a different viewport is a different trace, so the canvas is 1280×800.
const OPENING_VIEW = {
  camera: {
    heading: 0,
    pitch: 0,
    position: { x: 559_104, y: 128, z: 559_104 }
  } satisfies CameraFields,
  size: { height: 800, width: 1280 } satisfies Size
};

const status = document.getElementById('status')!;
const canvas = document.getElementById('frame') as HTMLCanvasElement;

try {
  const bundle = await load(
    fetchReader(new URL('/payload/', location.href).href)
  );
  const world = new World(bundle);

  const size = OPENING_VIEW.size;
  canvas.width = size.width;
  canvas.height = size.height;
  const camera = new Camera(OPENING_VIEW.camera);
  const seen = visible(world, OPENING_VIEW.camera.position);
  const { lines, points } = projectFrame(camera, seen, size);

  // The headless renderer strokes the dim ink and then the bright one, so the demo does too.
  // Which pass a line belongs to is the projection's answer; how many draw calls that costs is
  // the renderer's, and neither is pinned by a trace.
  drawFrame(canvas, {
    blackInk: lines.filter(line => line.ink === Ink.black),
    ground: camera.groundFill(size),
    points,
    size,
    whiteInk: lines.filter(line => line.ink === Ink.white)
  });

  status.textContent =
    `${bundle.manifest.sourceDatasetId} — the opening view of Targ. ` +
    `${seen.segments.length} candidate segments projected to ` +
    `${lines.length} lines, with ` +
    `${points.length} drawn as a far point; horizon at ` +
    `${camera.horizon(size).toFixed(1)}px.`;
} catch (error) {
  status.textContent = `Could not draw the frame — ${String(error)}`;
}
