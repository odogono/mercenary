import { expect } from 'bun:test';

import type { Trace, TraceObject, TraceValue } from '../src/trace/index.ts';
import { moverGate } from './replay/moverGate.ts';

/// The craft Mover's Replay Gate.
///
/// Nine traces, one per Craft Parameter Block plus the poweramp, replayed step for step against
/// the Trace Oracle. The gate protocol itself is `replay/moverGate.ts`, shared with the
/// game-core gate — what is here is only what makes this gate the flight one.

const IDS = [
  'craft-0-standard',
  'craft-1-standard',
  'craft-1-poweramp',
  'craft-2-sinking',
  'craft-3-standard',
  'craft-4-standard',
  'craft-5-sinking',
  'craft-6-standard',
  'craft-7-slot7'
] as const;

/// The flight emitter boards, fits the poweramp and sets a notch in one command.
const setupCommands = (trace: Trace): TraceValue[] => {
  const scenario = trace.header['scenario'] as TraceObject;
  return [
    {
      board: scenario['craft']!,
      poweramp: scenario['poweramp']!,
      throttle: scenario['notch']!
    }
  ];
};

await moverGate({
  coverage: traces => {
    // Two empty event lists agreeing would pass silently, so pin that both sinking runs
    // genuinely contain no events and never report a touchdown.
    for (const id of ['craft-2-sinking', 'craft-5-sinking'] as const) {
      const records = traces.get(id)!.records;
      expect(
        records.some(record => record['events'] !== undefined)
      ).toBeFalse();
      expect(JSON.stringify(records)).not.toContain('"touchdown"');
    }
  },
  emitter: 'flight',
  ids: IDS,
  recordCounts: [530, 811, 563, 1802, 440, 1102, 1802, 563, 563],
  setupCommands,
  title: 'the flight Replay Gate'
});
