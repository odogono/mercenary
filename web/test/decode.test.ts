import { describe, expect, test } from 'bun:test';

import type {
  Block,
  Bundle,
  FlightRules,
  Walk
} from '../src/payload/documents.ts';
import { load } from '../src/payload/load.ts';
import { World } from '../src/world/index.ts';
import { Inspector, type Row } from '../src/world/inspector.ts';
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

/// The decode Replay Gate: payload to world, before anything projects or moves.
///
/// The first gate with a payload behind it, and the one that needs no simulation — every record
/// is a fact about the decoded content, so a divergence here is a decode that changed. It is
/// also where the port's Float32 discipline is first tested: the geometry is stored in binary32
/// and every span in the trace is a binary32 quantity written at full double precision.

const trace = parseTrace(
  await readTraceText('decode', 'payload'),
  'decode',
  'payload'
);

const bundle: Bundle = await load(async name => {
  try {
    return await readPayloadFile(name);
  } catch {
    // Absence: five of the ten documents are optional, so a missing file is not a failure.
    // This flattens a genuine read error into absence as well, which is the right trade for
    // a gate — the documents it asserts on are all required, so a lost one fails downstream
    // as a missing document rather than passing quietly.
    return undefined;
  }
});

const world = new World(bundle);
const inspector = new Inspector(world);

/// The trace's records, in the order the emitter wrote them.
const recordsOfKind = (kind: string): TraceObject[] =>
  trace.records.filter(record => record['kind'] === kind);

/// A Row as the trace spells it. Field order is irrelevant — the comparison is by key.
const rowValue = (row: Row): TraceValue => ({
  detail: row.detail,
  edges: row.edges,
  note: row.note,
  spans: { x: row.spans.x, y: row.spans.y, z: row.spans.z },
  subject: row.subject,
  vertices: row.vertices
});

const blockValue = (block: Block): TraceValue => ({
  ceiling: block.ceiling,
  handler: block.handler,
  index: block.index,
  liftFactor: block.liftFactor,
  mode: block.mode ?? null,
  pitchStep: block.pitchStep,
  rollCoupling: block.rollCoupling,
  speedDamping: block.speedDamping,
  throttleGain: block.throttleGain,
  yawAuthority: block.yawAuthority,
  yawDamping: block.yawDamping,
  ...(block.tumble !== undefined ? { tumble: { ...block.tumble } } : {})
});

const rulesValue = (rules: FlightRules): TraceValue => ({
  angleUnitsPerTurn: rules.angleUnitsPerTurn,
  ceilingClimbScale: rules.ceilingClimbScale,
  ceilingUnit: rules.ceilingUnit,
  crashDescentRate: rules.crashDescentRate,
  crashPitch: rules.crashPitch,
  groundAltitude: rules.groundAltitude,
  groundBand: rules.groundBand,
  levelPitch: rules.levelPitch,
  poweramp: { ...rules.poweramp },
  takeoffSpeed: rules.takeoffSpeed,
  throttleLimit: rules.throttleLimit,
  throttleNotches: [...rules.throttleNotches],
  walkingBlock: rules.walkingBlock
});

const walkValue = (walk: Walk): TraceValue => ({
  step: walk.step,
  turnStep: walk.turnStep
});

describe('the payload this gate runs against', () => {
  test('is the extraction the trace was recorded from', () => {
    // Asserted before anything is compared, because every divergence below would otherwise have
    // two possible explanations and this rules one of them out in a line. The Oracle records the
    // payload's own provenance in the header verbatim.
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
        `the payload in ${payloadDirectory()} is not the one this trace was recorded from — ` +
          `${describeDifference(difference)}\n` +
          're-emit the traces: cd app && swift run mercenary --emit-traces'
      );
    }
  });
});

describe('the decode Replay Gate', () => {
  test('the trace covers what it is supposed to', () => {
    // Guards against the way a gate like this fails silently: every comparison below is over a
    // list, and two empty lists agree. These are the counts the decode emitter writes.
    expect(trace.records.length).toBe(687);
    const counts = new Map<string, number>();
    for (const record of trace.records) {
      const kind = record['kind'] as string;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    expect(Object.fromEntries([...counts].sort())).toEqual({
      cell: 256,
      controlLoopRules: 1,
      craftParameterBlock: 11,
      object: 64,
      placement: 64,
      room: 192,
      structure: 98,
      walk: 1
    });
  });

  test("the header's counts are the manifest's own", () => {
    expectIdentical(
      trace.header['counts'],
      { ...bundle.manifest.counts },
      'counts'
    );
  });

  test('the world the payload builds', () => {
    expectIdentical(
      trace.header['world'],
      {
        cells: world.cells.length,
        cellSize: world.cellSize,
        deferredEdges: world.deferredEdges,
        groundExtent: world.groundExtent,
        objects: world.objects.length,
        rooms: world.rooms.size
      },
      'world'
    );
  });

  test('every Craft Parameter Block', () => {
    const recorded = recordsOfKind('craftParameterBlock');
    expect(bundle.flight).toBeDefined();
    expect(recorded.length).toBe(bundle.flight!.blocks.length);
    for (const [index, record] of recorded.entries()) {
      expectIdentical(
        record['block'],
        blockValue(bundle.flight!.blocks[index]!),
        `block ${index}`
      );
    }
  });

  test('the control-loop rules and the walk', () => {
    expectIdentical(
      recordsOfKind('controlLoopRules')[0]?.['rules'],
      rulesValue(bundle.flight!.rules),
      'rules'
    );
    expectIdentical(
      recordsOfKind('walk')[0]?.['walk'],
      walkValue(bundle.flight!.walk),
      'walk'
    );
  });

  const rowGate = (kind: string, rows: () => Row[]): void => {
    test(`every ${kind} row`, () => {
      const recorded = recordsOfKind(kind);
      const produced = rows();
      expect(produced.length).toBe(recorded.length);
      for (const [index, record] of recorded.entries()) {
        expectIdentical(
          record['row'],
          rowValue(produced[index]!),
          `${kind} row ${index}`
        );
      }
    });
  };

  rowGate('object', () => inspector.objectRows());
  rowGate('cell', () => inspector.cellRows());
  rowGate('structure', () => inspector.structureRows());
  rowGate('room', () => inspector.roomRows());

  test('where every object starts, and how it is placed', () => {
    const recorded = recordsOfKind('placement');
    expect(recorded.length).toBe(world.objects.length);
    for (const [index, record] of recorded.entries()) {
      const object = world.objects[index]!;
      expectIdentical(
        record,
        {
          detailCube: object.detailCube,
          drawsFarAsPoint: object.drawsFarAsPoint,
          edges: object.edges.length,
          id: object.id,
          kind: 'placement',
          model: object.model,
          orientation: {
            x: object.orientation.x,
            y: object.orientation.y,
            z: object.orientation.z
          },
          origin: {
            x: object.origin.x,
            y: object.origin.y,
            z: object.origin.z
          },
          placement: object.placement,
          room: object.room,
          slot: object.slot,
          stateFlags: object.stateFlags,
          vertices: object.vertices.length,
          withinWorld: object.withinWorld
        },
        `placement ${index}`
      );
    }
  });
});
