import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'bun:test';

import {
  foldStates,
  type Trace,
  type TraceObject,
  type TraceValue
} from '../src/trace/index.ts';
import { repositoryRoot } from './replay/artifacts.ts';
import { navigationGate } from './replay/navigationGate.ts';

const IDS = [
  'world-flip-from-144',
  'world-flip-from-86',
  'dark-room-5',
  'locked-room-2-refused',
  'locked-room-2-opened',
  'random-room-114'
] as const;

const locationPath = (trace: Trace): TraceValue[] => {
  const states = [
    trace.header['initial'] as TraceObject,
    ...(foldStates(trace) as TraceObject[])
  ];
  const path: TraceValue[] = [];
  for (const state of states) {
    const location = state['location']!;
    if (
      path.length === 0 ||
      JSON.stringify(path.at(-1)) !== JSON.stringify(location)
    ) {
      path.push(location);
    }
  }
  return path;
};

const events = (trace: Trace): TraceObject[][] =>
  trace.records.flatMap(record => {
    const recorded = record['events'];
    return Array.isArray(recorded) ? [recorded as TraceObject[]] : [];
  });

const hasEvent = (
  trace: Trace,
  predicate: (event: TraceObject) => boolean
): boolean => events(trace).some(group => group.some(predicate));

await navigationGate({
  coverage: traces => {
    const catalogue = JSON.parse(
      readFileSync(join(repositoryRoot, 'trace-scenarios.json'), 'utf8')
    ) as {
      readonly scenarios: readonly {
        readonly emitter: string;
        readonly id: string;
      }[];
    };
    expect(
      catalogue.scenarios
        .filter(scenario => scenario.emitter === 'navigation')
        .map(scenario => scenario.id)
    ).toEqual([...IDS]);

    const from144 = traces.get('world-flip-from-144')!;
    expect(locationPath(from144)).toEqual([{ room: 144 }, { room: 127 }]);
    expect(
      events(from144).some(
        group =>
          group.some(event =>
            Object.is((event['arrived'] as TraceObject)?.['room'], 127)
          ) && group.some(event => event['worldFlipped'] === true)
      )
    ).toBeTrue();

    const from86 = traces.get('world-flip-from-86')!;
    expect(locationPath(from86)).toEqual([{ room: 86 }, { room: 127 }]);
    expect(hasEvent(from86, event => 'worldFlipped' in event)).toBeFalse();

    const dark = traces.get('dark-room-5')!;
    expect(locationPath(dark)).toEqual([
      { room: 5 },
      { room: 111 },
      { room: 5 }
    ]);
    const darkStates = [
      dark.header['initial'] as TraceObject,
      ...(foldStates(dark) as TraceObject[])
    ];
    expect(
      darkStates.some(
        state => (state['indoor'] as TraceObject)?.['dark'] === false
      )
    ).toBeTrue();
    expect((darkStates.at(-1)!['indoor'] as TraceObject)['dark']).toBeTrue();

    const refused = traces.get('locked-room-2-refused')!;
    expect(locationPath(refused)).toEqual([{ room: 2 }]);
    expect(hasEvent(refused, event => 'wall' in event)).toBeTrue();
    expect(hasEvent(refused, event => 'arrived' in event)).toBeFalse();

    const opened = traces.get('locked-room-2-opened')!;
    expect(
      ((opened.header['initial'] as TraceObject)['residence'] as TraceObject)[
        '17'
      ]
    ).toBe('carried');
    expect(locationPath(opened)).toEqual([
      { room: 2 },
      { room: 74 },
      { room: 60 },
      { room: 123 }
    ]);

    const random = traces.get('random-room-114')!;
    expect(locationPath(random)).toEqual([
      { room: 114 },
      { room: 46 },
      { room: 114 }
    ]);
  },
  ids: IDS,
  recordCounts: [182, 182, 484, 182, 183, 364],
  title: 'the navigation Replay Gate'
});
