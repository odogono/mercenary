import { describe, expect, test } from 'bun:test';

import type { Bundle } from '../src/payload/documents.ts';
import {
  Camera,
  ORACLE_FAR_PLANE,
  ORACLE_RULES,
  ReferenceViewport,
  projectFrame,
  referenceViewportBounds,
  visible,
  type ScreenLine,
  type Size,
  type Visible
} from '../src/projection/index.ts';
import { INDOOR_BACKDROP_COLUMNS, indoorScene } from '../src/scene/index.ts';
import {
  parseTrace,
  type TraceObject,
  type TraceValue
} from '../src/trace/index.ts';
import { Ink, World, type Residence } from '../src/world/index.ts';
import {
  expectRecordedPayload,
  loadPayload,
  readTraceText
} from './replay/artifacts.ts';
import { expectIdentical } from './replay/compare.ts';

/// The projection Replay Gate: one camera pose in, a list of screen lines out.
///
/// Segments rather than pixels, deliberately (ADR 0011): a raster comparison fails on
/// antialiasing that means nothing while passing a line drawn in the wrong ink. What the port
/// has to reproduce is the list of lines and their ink, in the order the pipeline produced
/// them, and the backdrop drawn behind them.
///
/// This is where the Float32 discipline bites hardest. A `ScreenLine` is `Float` in the kit, so
/// every coordinate below is a binary32 quantity written at full binary64 precision; a port
/// carrying doubles to the screen reproduces none of them.

const bundle: Bundle = await loadPayload();

const world = new World(bundle);

const IDS = [
  'opening-view',
  'opening-view-turned',
  'high-altitude',
  'banked',
  'room-3',
  'room-5-dark'
] as const;

const traces = new Map(
  await Promise.all(
    IDS.map(
      async id =>
        [
          id,
          parseTrace(await readTraceText('projection', id), 'projection', id)
        ] as const
    )
  )
);

/// The scenario the emitter was given, as the header records it back. Angles are degrees
/// there and radians in the camera — the emitter's own conversion, kept spelled the same way.
interface Scenario {
  readonly eye: number;
  readonly heading: number;
  readonly height: number;
  readonly pitch: number;
  readonly roll: number;
  readonly room: number | undefined;
  readonly time: number;
  readonly width: number;
  readonly x: number;
  readonly z: number;
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

const segment = (x1: number, y1: number, x2: number, y2: number) => ({
  a: { x: x1, y: y1, z: 128 },
  b: { x: x2, y: y2, z: 128 },
  ink: Ink.white
});

describe('the outdoor ground fill', () => {
  for (const elevation of [-89, -90, -91]) {
    test(`covers the view through a ${elevation}-degree dive`, () => {
      const size: Size = { height: 800, width: 1280 };
      const camera = new Camera({
        heading: 0,
        pitch: radians(elevation),
        position: { x: 0, y: 32_769, z: 0 },
        roll: 0
      });

      const ground = camera.groundFill(size).rect;

      expect(ground.y).toBeLessThanOrEqual(0);
      expect(ground.y + ground.height).toBeGreaterThanOrEqual(size.height);
    });
  }
});

describe('Reference Viewport line clipping', () => {
  const camera = new Camera({
    heading: 0,
    pitch: 0,
    position: { x: 0, y: 0, z: 0 }
  });
  const size: Size = { height: 800, width: 1280 };
  test('centres the scaled 160-by-136 Reference Viewport', () => {
    expect(referenceViewportBounds(size)).toEqual({
      height: 544,
      width: 1280,
      x: 0,
      y: 128
    });
    expect(referenceViewportBounds({ height: 136, width: 640 })).toEqual({
      height: ReferenceViewport.height,
      width: ReferenceViewport.width,
      x: 160,
      y: 0
    });
  });

  test.each([
    ['left', segment(-256, 0, 0, 0), { x1: 0, y1: 400 }],
    ['right', segment(0, 0, 256, 0), { x2: 1280, y2: 400 }],
    ['top', segment(0, 256, 0, 0), { x1: 640, y1: 128 }],
    ['bottom', segment(0, 0, 0, -256), { x2: 640, y2: 672 }]
  ])('clips a crossing at the %s border', (_edge, input, crossing) => {
    expect(camera.projectSegment(input, size)).toMatchObject(crossing);
  });

  test('clips a corner crossing parametrically', () => {
    expect(camera.projectSegment(segment(-256, 108.8, 0, 0), size)).toEqual({
      ink: Ink.white,
      x1: 0,
      x2: 640,
      y1: 128,
      y2: 400
    });
  });

  test('discards wholly outside lines and preserves inside Float32 lines', () => {
    expect(
      camera.projectSegment(segment(-300, 0, -280, 0), size)
    ).toBeUndefined();
    const line = camera.projectSegment(segment(0.1, 0.1, 1.1, 1.1), size)!;
    expect(line).toEqual({
      ink: Ink.white,
      x1: Math.fround(640.4),
      x2: Math.fround(644.4),
      y1: Math.fround(399.6),
      y2: Math.fround(395.6)
    });
  });

  test('keeps the byte-identical unclipped oracle mode', () => {
    expect(
      camera.projectSegment(segment(-256, 0, 0, 0), size, 'unclipped')
    ).toEqual({
      ink: Ink.white,
      x1: -384,
      x2: 640,
      y1: 400,
      y2: 400
    });
  });

  test('clips distant lines by the same border while preserving distance and order', () => {
    const first = { ...segment(-256, 0, 0, 0), distance: 12 };
    const second = { ...segment(0, 0, 256, 0), distance: 34 };
    expect(
      projectFrame(
        camera,
        {
          detailedObjects: 0,
          distant: [first, second],
          points: [],
          segments: []
        },
        size
      ).distant
    ).toEqual([
      { distance: 12, ink: Ink.white, x1: 0, x2: 640, y1: 400, y2: 400 },
      { distance: 34, ink: Ink.white, x1: 640, x2: 1280, y1: 400, y2: 400 }
    ]);
  });
});

const scenarioOf = (header: TraceObject): Scenario => {
  const body = header['scenario'] as TraceObject;
  const number = (key: string): number => body[key] as number;
  const room = body['room'];
  return {
    eye: number('eye'),
    heading: number('heading'),
    height: number('height'),
    pitch: number('pitch'),
    roll: number('roll'),
    room: typeof room === 'number' ? room : undefined,
    time: number('time'),
    width: number('width'),
    x: number('x'),
    z: number('z')
  };
};

/// Where the photon emitter is for a still. A still has no session behind it, so it is where
/// the payload put it — which is where it is at the start of a game, and the honest answer for
/// a pose nobody has played up to. The emitter derives it the same way.
const photonEmitter = (): Residence => {
  const slot = world.doorwayRules.photonEmitterSlot;
  const object = world.objects.find(candidate => candidate.slot === slot);
  if (object === undefined || object.room === 0) {
    return { kind: 'surface' };
  }
  return { id: object.room, kind: 'room' };
};

const lineValue = (line: ScreenLine): TraceValue => ({
  ink: line.ink === Ink.white ? 'white' : 'black',
  x1: line.x1,
  x2: line.x2,
  y1: line.y1,
  y2: line.y2
});

/// Whether the trace says this pose is a dark Room, in which case the pipeline is not run at
/// all and there is nothing to project.
const isDark = (header: TraceObject): boolean => {
  const backdrop = header['backdrop'] as TraceObject;
  const indoor = backdrop['indoor'] as TraceObject | undefined;
  return indoor?.['dark'] === true;
};

/// The backdrop the trace records: sky and ground outdoors, the indoor scene underground.
const backdropValue = (
  camera: Camera,
  size: Size,
  roomId: number | undefined
): TraceValue => {
  const here = roomId === undefined ? undefined : world.rooms.get(roomId);
  if (here !== undefined) {
    const scene = indoorScene(here, world.doorwayRules, photonEmitter());
    return {
      columns: INDOOR_BACKDROP_COLUMNS,
      indoor: {
        background: scene.background,
        dark: scene.dark,
        foreground: scene.foreground,
        lineColour: scene.lineColour
      }
    };
  }
  const ground = camera.groundFill(size);
  return {
    ground: {
      height: ground.rect.height,
      lean: ground.lean,
      width: ground.rect.width,
      x: ground.rect.x,
      y: ground.rect.y
    },
    horizon: camera.horizon(size)
  };
};

describe('the payload this gate runs against', () => {
  test('is the extraction the traces were recorded from', () => {
    for (const trace of traces.values()) {
      expectRecordedPayload(trace, bundle);
    }
  });
});

describe('the projection Replay Gate', () => {
  test('the six traces are all here, and cover what they are supposed to', () => {
    // Guards against the way a gate like this fails silently: the comparisons below are over
    // lists, and two empty lists agree. `room-5-dark` has no records at all — that is the
    // claim, and it is only worth anything alongside the five that do.
    expect([...traces.keys()]).toEqual([...IDS]);
    const counts = [...traces].map(([id, trace]) => [
      id,
      trace.records.filter(record => record['kind'] === 'line').length,
      trace.records.filter(record => record['kind'] === 'point').length
    ]);
    expect(counts).toEqual([
      ['opening-view', 117, 1],
      ['opening-view-turned', 133, 0],
      ['high-altitude', 185, 0],
      ['banked', 52, 0],
      ['room-3', 38, 0],
      ['room-5-dark', 0, 0]
    ]);
  });

  for (const id of IDS) {
    const trace = traces.get(id)!;
    const scenario = scenarioOf(trace.header);
    const size: Size = { height: scenario.height, width: scenario.width };
    const position = { x: scenario.x, y: scenario.eye, z: scenario.z };
    const camera = new Camera({
      farPlane: ORACLE_FAR_PLANE,
      heading: radians(scenario.heading),
      pitch: radians(scenario.pitch),
      position,
      roll: radians(scenario.roll)
    });
    const seen: Visible = visible(world, position, {
      elapsed: scenario.time,
      rules: ORACLE_RULES,
      ...(scenario.room === undefined ? {} : { room: scenario.room })
    });
    // A dark Room draws nothing at all, so the pipeline is not run: the selector's candidates
    // are the claim, and the absence of lines and points is the rest of it.
    const frame = isDark(trace.header)
      ? { distant: [], lines: [], points: [] }
      : projectFrame(camera, seen, size, 'unclipped');

    describe(id, () => {
      test('the camera the pose resolves to', () => {
        expectIdentical(
          trace.header['camera'],
          {
            farPlane: camera.farPlane,
            heading: camera.heading,
            isInverted: camera.isInverted,
            mirrored: camera.mirrored,
            nearPlane: camera.nearPlane,
            pitch: camera.pitch,
            position: {
              x: camera.position.x,
              y: camera.position.y,
              z: camera.position.z
            },
            roll: camera.roll,
            verticalFieldOfView: camera.verticalFieldOfView
          },
          `${id} camera`
        );
      });

      test('the viewport it is projected into', () => {
        // The same pose against a different viewport is a different trace, so this is
        // recorded rather than assumed.
        expectIdentical(
          trace.header['viewport'],
          { height: size.height, width: size.width },
          `${id} viewport`
        );
      });

      test('the backdrop drawn behind the lines', () => {
        // A horizon in the wrong place is not a line-list problem, and a Room lit when it
        // should be dark is the whole of what `room-5-dark` claims.
        expectIdentical(
          trace.header['backdrop'],
          backdropValue(camera, size, scenario.room),
          `${id} backdrop`
        );
      });

      test('what the selector offered the projection', () => {
        expectIdentical(
          trace.header['candidates'],
          {
            detailedObjects: seen.detailedObjects,
            points: seen.points.length,
            segments: seen.segments.length
          },
          `${id} candidates`
        );
      });

      test('every line, in pipeline order', () => {
        const recorded = trace.records.filter(
          record => record['kind'] === 'line'
        );
        expect(frame.lines.length).toBe(recorded.length);
        for (const [index, record] of recorded.entries()) {
          // The recorded index counts only the lines that survived clipping, and points
          // count separately from zero.
          expectIdentical(
            record,
            { index, kind: 'line', line: lineValue(frame.lines[index]!) },
            `${id} line ${index}`
          );
        }
      });

      test('every far point, in binary64', () => {
        const recorded = trace.records.filter(
          record => record['kind'] === 'point'
        );
        expect(frame.points.length).toBe(recorded.length);
        for (const [index, record] of recorded.entries()) {
          expectIdentical(
            record,
            {
              index,
              kind: 'point',
              point: { x: frame.points[index]!.x, y: frame.points[index]!.y }
            },
            `${id} point ${index}`
          );
        }
      });
    });
  }
});
