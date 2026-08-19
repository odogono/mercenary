import { describe, expect, test } from 'bun:test';

import type { Bundle } from '../src/payload/documents.ts';
import { load } from '../src/payload/load.ts';
import {
  Camera,
  visible,
  type ScreenLine,
  type Size,
  type Visible
} from '../src/projection/index.ts';
import { INDOOR_BACKDROP_COLUMNS, indoorScene } from '../src/scene/index.ts';
import { Ink, World, type Residence } from '../src/world/index.ts';
import {
  payloadDirectory,
  readPayloadFile,
  readTraceText
} from './replay/artifacts.ts';
import {
  describeDifference,
  expectIdentical,
  firstDifference
} from './replay/compare.ts';
import {
  parseTrace,
  type TraceObject,
  type TraceValue
} from './replay/trace.ts';

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

const bundle: Bundle = await load(async name => {
  try {
    return await readPayloadFile(name);
  } catch {
    return undefined;
  }
});

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
    // Asserted before anything is compared, because every divergence below would otherwise
    // have two possible explanations and this rules one of them out in a line.
    for (const [id, trace] of traces) {
      const recorded = trace.header['payload'] as TraceObject;
      const difference = firstDifference(
        {
          decoderVersion: recorded['decoderVersion']!,
          schemaVersion: recorded['schemaVersion']!,
          sourceCoreDigest: recorded['sourceCoreDigest']!,
          sourceDatasetId: recorded['sourceDatasetId']!
        },
        {
          decoderVersion: bundle.manifest.decoderVersion,
          schemaVersion: bundle.manifest.schemaVersion,
          sourceCoreDigest: bundle.manifest.sourceCoreDigest,
          sourceDatasetId: bundle.manifest.sourceDatasetId
        }
      );
      if (difference !== null) {
        throw new Error(
          `the payload in ${payloadDirectory()} is not the one ${id} was recorded from — ` +
            `${describeDifference(difference)}\n` +
            're-emit the traces: cd app && swift run mercenary --emit-traces'
        );
      }
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
      heading: radians(scenario.heading),
      pitch: radians(scenario.pitch),
      position,
      roll: radians(scenario.roll)
    });
    const seen: Visible = visible(world, position, {
      elapsed: scenario.time,
      ...(scenario.room === undefined ? {} : { room: scenario.room })
    });

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
        // A dark Room draws nothing at all, so the pipeline is not run: the selector's
        // candidates above are the claim, and the absence of lines here is the rest of it.
        const dark =
          (
            (trace.header['backdrop'] as TraceObject)['indoor'] as
              TraceObject | undefined
          )?.['dark'] === true;
        const produced: ScreenLine[] = [];
        if (!dark) {
          for (const segment of seen.segments) {
            const line = camera.projectSegment(segment, size);
            if (line !== undefined) {
              produced.push(line);
            }
          }
        }
        expect(produced.length).toBe(recorded.length);
        for (const [index, record] of recorded.entries()) {
          // The recorded index counts only the lines that survived clipping, and points
          // count separately from zero.
          expectIdentical(
            record,
            {
              index,
              kind: 'line',
              line: lineValue(produced[index]!)
            },
            `${id} line ${index}`
          );
        }
      });

      test('every far point, in binary64', () => {
        const recorded = trace.records.filter(
          record => record['kind'] === 'point'
        );
        const dark =
          (
            (trace.header['backdrop'] as TraceObject)['indoor'] as
              TraceObject | undefined
          )?.['dark'] === true;
        const produced = dark
          ? []
          : seen.points
              .map(origin => camera.projectPoint(origin, size))
              .filter(point => point !== undefined);
        expect(produced.length).toBe(recorded.length);
        for (const [index, record] of recorded.entries()) {
          expectIdentical(
            record,
            {
              index,
              kind: 'point',
              point: { x: produced[index]!.x, y: produced[index]!.y }
            },
            `${id} point ${index}`
          );
        }
      });
    });
  }
});
