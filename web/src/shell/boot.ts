import { REFERENCE_OPENING_POSITION } from '../gameCore/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import { fetchReader, load } from '../payload/load.ts';
import {
  Camera,
  projectFrame,
  visible,
  type CameraFields,
  type ScreenLine,
  type Size
} from '../projection/index.ts';
import {
  foldStates,
  isObject,
  parseTrace,
  type TraceObject,
  type TraceValue
} from '../trace/index.ts';
import { Ink, World } from '../world/index.ts';
import { Renderer } from './frame.ts';

/// Targ, drawn in a browser tab: one fixed pose, and then a recorded flight over it.
///
/// It loads the Data Payload over `fetch` — the read seam the loader was given for exactly
/// this — builds the world and draws the opening pose once. It then fetches one flight Golden
/// Trace, folds the poses the Trace Oracle recorded out of it, and shows them in order on
/// `requestAnimationFrame`, paced by the step the trace was recorded at. Nothing here is
/// simulated and nothing is steered: a recording is played back, which is what lets a page with
/// no engine behind it show more than a still (ADR 0011). The Browser Shell proper is #95, and
/// the Mover the browser will one day fly with is the port #92 grades.
///
/// Every pose drawn is one a Replay Gate has already compared bit-for-bit against the Oracle:
/// the fixed one against the projection trace, the flown ones against the flight trace. That
/// is the whole reason to draw a trace rather than a path invented here — a flythrough that
/// wandered off the recording would be a new thing to judge instead of a view of a judged one.
///
/// The pose is the `opening-view` Golden Trace's, at its viewport, and the same pose against a
/// different viewport is a different trace, so the canvas is 1280×800. It is drawn before the
/// trace is fetched, so the first frame on screen is still the one to hold beside
/// `docs/frames/m4.2-opening-view.png`.
const OPENING_VIEW = {
  camera: {
    heading: 0,
    pitch: 0,
    position: REFERENCE_OPENING_POSITION
  } satisfies CameraFields,
  size: { height: 800, width: 1280 } satisfies Size
};

/// The one trace the page flies. The dev server serves the flight traces by scenario id, so
/// this is the id and not a path.
const FLYTHROUGH = { emitter: 'flight', id: 'craft-1-standard' } as const;

const EMIT_HINT =
  'from the repository root: cd app && swift run mercenary --emit-traces';

/// Where the player was and how they were turned on one recorded step. The pose the Camera
/// wants, plus the speed that reached it, which the status line reports.
///
/// The Camera goes exactly where the recording put the player, with no eye offset applied. An
/// offset invented here would put the view somewhere no trace has ever graded, and where the
/// eye sits relative to a craft is the Browser Shell's question to answer against one.
interface RecordedPose {
  readonly heading: number;
  readonly pitch: number;
  readonly position: Vector3;
  readonly roll: number;
  readonly speed: number;
}

interface Flythrough {
  /// The step the trace was recorded at, in seconds. Playback is paced by it rather than by
  /// the display's refresh rate, so the flight takes as long as it took the Oracle.
  readonly dt: number;
  readonly poses: readonly RecordedPose[];
}

const numberAt = (fields: TraceObject, key: string): number => {
  const value = fields[key];
  if (typeof value !== 'number') {
    throw new Error(
      `the recorded ${key} is ${String(value)} rather than a number`
    );
  }
  return value;
};

const poseOf = (state: TraceValue): RecordedPose => {
  const player = isObject(state) ? state['player'] : undefined;
  if (!isObject(player) || !isObject(player['position'])) {
    throw new Error('a recorded state has no player position');
  }
  const position = player['position'];
  return {
    heading: numberAt(player, 'heading'),
    pitch: numberAt(player, 'pitch'),
    position: {
      x: numberAt(position, 'x'),
      y: numberAt(position, 'y'),
      z: numberAt(position, 'z')
    },
    roll: numberAt(player, 'roll'),
    speed: numberAt(player, 'speed')
  };
};

/// The poses one Golden Trace flew, read through the same reader the Replay Gates use.
///
/// `foldStates` returns one state per record, so the poses are picked out of it by the records
/// that are simulation steps: a command record shares a step number and does not advance time.
/// A step whose record changed nothing repeats the pose before it, which is what standing still
/// looks like and is left in rather than collapsed, so a step here is a step there.
const flownPoses = (text: string): Flythrough => {
  const trace = parseTrace(text, FLYTHROUGH.emitter, FLYTHROUGH.id);
  const states = foldStates(trace);
  const poses = states
    .filter((_, index) => isObject(trace.records[index]?.['input']))
    .map(poseOf);
  if (poses.length === 0) {
    throw new Error('the trace records no steps');
  }
  return { dt: numberAt(trace.header, 'dt'), poses };
};

/// The recorded poses, or the reason there are none. Absence is ordinary — a Golden Trace is
/// derived from the Reference Build and never tracked — so it is reported rather than thrown.
const flythrough = async (): Promise<Flythrough | Error> => {
  try {
    const url = new URL(
      `/traces/${FLYTHROUGH.emitter}/${FLYTHROUGH.id}.jsonl`,
      location.href
    );
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`the dev server answered ${response.status}`);
    }
    return flownPoses(await response.text());
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const status = document.getElementById('status')!;
const canvas = document.getElementById('frame') as HTMLCanvasElement;

const size = OPENING_VIEW.size;
canvas.width = size.width;
canvas.height = size.height;

/// What one pose resolved to, for the status line to report.
interface Drawn {
  readonly horizon: number;
  readonly lines: number;
  readonly points: number;
  readonly segments: number;
}

const renderer = new Renderer(canvas);

const draw = (world: World, pose: CameraFields): Drawn => {
  const camera = new Camera(pose);
  const seen = visible(world, pose.position);
  const { lines, points } = projectFrame(camera, seen, size);

  // The headless renderer strokes the dim ink and then the bright one, so the demo does too.
  // Which pass a line belongs to is the projection's answer; how many draw calls that costs is
  // the renderer's, and neither is pinned by a trace. Split in one walk rather than two filters,
  // because this runs once per displayed frame rather than once per page.
  const blackInk: ScreenLine[] = [];
  const whiteInk: ScreenLine[] = [];
  for (const line of lines) {
    (line.ink === Ink.black ? blackInk : whiteInk).push(line);
  }
  renderer.draw({
    blackInk,
    ground: camera.groundFill(size),
    points,
    size,
    whiteInk
  });

  return {
    horizon: camera.horizon(size),
    lines: lines.length,
    points: points.length,
    segments: seen.segments.length
  };
};

/// The part of the status line that is the same whichever pose was drawn.
const describe = (drawn: Drawn): string =>
  `${drawn.segments} candidate segments projected to ${drawn.lines} lines, ` +
  `with ${drawn.points} drawn as a far point; horizon at ` +
  `${drawn.horizon.toFixed(1)}px.`;

try {
  // The trace and the payload are unrelated fetches, so the trace is asked for before the
  // payload is awaited rather than after it. The opening pose is still drawn first — only the
  // two round trips overlap, not the draws.
  const pending = flythrough();
  const bundle = await load(
    fetchReader(new URL('/payload/', location.href).href)
  );
  const world = new World(bundle);
  const dataset = bundle.manifest.sourceDatasetId;

  status.textContent =
    `${dataset} — the opening view of Targ. ` +
    describe(draw(world, OPENING_VIEW.camera));

  const flown = await pending;
  if (flown instanceof Error) {
    // The fixed pose stays on screen. A page that blanked because an untracked artifact was
    // not there would read as broken rather than as unemitted, and the one thing the reader
    // needs is the command that emits it.
    status.textContent =
      `${dataset} — the opening view of Targ, held still: no ` +
      `${FLYTHROUGH.emitter}/${FLYTHROUGH.id} Golden Trace to fly ` +
      `(${flown.message}). Emit the traces with \`${EMIT_HINT}\`.`;
  } else {
    const duration = flown.poses.length * flown.dt;
    const start = performance.now();
    let shown = -1;
    // The recording loops, so the flight can be left running and watched from any point in it.
    const play = (now: number): void => {
      const index =
        Math.floor((now - start) / 1000 / flown.dt) % flown.poses.length;
      if (index !== shown) {
        shown = index;
        const pose = flown.poses[index]!;
        status.textContent =
          `${dataset} — flying ${FLYTHROUGH.emitter}/${FLYTHROUGH.id}, ` +
          `${(index * flown.dt).toFixed(1)}s of ${duration.toFixed(1)}s at the ` +
          `recorded rate. Altitude ${pose.position.y.toFixed(0)}, speed ` +
          `${pose.speed.toFixed(0)}; ${describe(draw(world, pose))}`;
      }
      requestAnimationFrame(play);
    };
    requestAnimationFrame(play);
  }
} catch (error) {
  status.textContent = `Could not draw the frame — ${String(error)}`;
}
