import { fetchReader, load } from '../payload/load.ts';
import {
  Camera,
  leanTransform,
  visible,
  type Point,
  type ScreenLine,
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
  heading: 0,
  pitch: 0,
  position: { x: 559_104, y: 128, z: 559_104 },
  roll: 0,
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
  const camera = new Camera({
    heading: OPENING_VIEW.heading,
    pitch: OPENING_VIEW.pitch,
    position: OPENING_VIEW.position,
    roll: OPENING_VIEW.roll
  });
  const seen = visible(world, OPENING_VIEW.position);

  const blackInk: ScreenLine[] = [];
  const whiteInk: ScreenLine[] = [];
  for (const segment of seen.segments) {
    const line = camera.projectSegment(segment, size);
    if (line !== undefined) {
      (line.ink === Ink.black ? blackInk : whiteInk).push(line);
    }
  }
  const points: Point[] = [];
  for (const origin of seen.points) {
    const point = camera.projectPoint(origin, size);
    if (point !== undefined) {
      points.push(point);
    }
  }

  const ground = camera.groundFill(size);
  drawFrame(canvas, {
    blackInk,
    ground: { leaned: leanTransform(ground.lean, size), rect: ground.rect },
    points,
    whiteInk
  });

  status.textContent =
    `${bundle.manifest.sourceDatasetId} — the opening view of Targ. ` +
    `${seen.segments.length} candidate segments projected to ` +
    `${blackInk.length + whiteInk.length} lines, with ` +
    `${points.length} drawn as a far point; horizon at ` +
    `${camera.horizon(size).toFixed(1)}px.`;
} catch (error) {
  status.textContent = `Could not draw the frame — ${String(error)}`;
}
