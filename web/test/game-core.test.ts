import { expect } from 'bun:test';

import {
  foldStates,
  type Trace,
  type TraceObject,
  type TraceValue
} from '../src/trace/index.ts';
import { moverGate } from './replay/moverGate.ts';

/// The game-core Replay Gate: the on-foot Mover, and the throttle ladder under the craft one.
///
/// Three traces — walking the surface, walking inside a Room against its walls, and stepping a
/// craft down the whole decoded throttle ladder. The gate protocol itself is
/// `replay/moverGate.ts`, shared with the flight gate.

const IDS = ['surface-walk', 'room-walk', 'craft-1-throttle-ladder'] as const;

/// The game-core emitter issues its setup as separate commands, and a walking scenario boards
/// nothing at all — so this is a list of none, one or two rather than a fixed shape.
const setupCommands = (trace: Trace): TraceValue[] => {
  const scenario = trace.header['scenario'] as TraceObject;
  const commands: TraceValue[] = [];
  if (typeof scenario['craft'] === 'number') {
    commands.push({ board: scenario['craft'] });
  }
  if (typeof scenario['notch'] === 'number') {
    commands.push({ throttle: scenario['notch'] });
  }
  return commands;
};

await moverGate({
  coverage: traces => {
    // The room walk is the scenario that replaced a Doorway crossing, so pin exactly what it was
    // re-accepted for: it stays in Room 3, sounds the wall twice, and never arrives anywhere.
    // Asserted on the event kind and the location rather than on a count of records that carry
    // any event at all, which would agree with two events of some other kind.
    const roomWalk = traces.get('room-walk')!;
    expect(JSON.stringify(roomWalk.records)).not.toContain('"arrived"');

    const events = roomWalk.records.flatMap(record =>
      Array.isArray(record['events']) ? record['events'] : []
    );
    expect(events.map(event => Object.keys(event as TraceObject)[0])).toEqual([
      'wall',
      'wall'
    ]);

    // The location is folded forward like everything else, so a Doorway taken mid-run would show
    // up as a room that is not 3 rather than as an absent `arrived`.
    for (const state of foldStates(roomWalk)) {
      expect((state as TraceObject)['location']).toEqual({ room: 3 });
    }
  },
  emitter: 'game-core',
  ids: IDS,
  recordCounts: [784, 628, 725],
  setupCommands,
  title: 'the game-core Replay Gate'
});
