import { describe, expect, test } from 'bun:test';

import { parseConsoleCommand } from '../src/shell/console.ts';
import { decodeSessionTraceCommand } from '../src/trace/session.ts';

/// Every verb the Shell Console understands.
const CONSOLE_VERBS = [
  'help',
  'where',
  'inventory',
  'get',
  'goto',
  'panel',
  'set',
  'save',
  'load'
] as const;

describe('the Shell Console stays out of traces', () => {
  test('shares no vocabulary with the Session trace decoder', () => {
    // A console command reaching a Golden Trace would record a state jump the Reference Build
    // cannot produce, so the two vocabularies must not overlap. If a recorder is ever added, this
    // is the test that notices.
    for (const verb of CONSOLE_VERBS) {
      expect(() => decodeSessionTraceCommand({ [verb]: true })).toThrow();
    }
  });

  test('keeps the actions a gate refuses to replay refused', () => {
    // `goto` reaches these two, which is exactly why it can never be a recorded input.
    expect(() => decodeSessionTraceCommand({ teleport: true })).toThrow(
      'the Session gate will not replay teleport'
    );
    expect(() => decodeSessionTraceCommand({ board: 1 })).toThrow(
      'the Session gate will not replay board'
    );
  });

  test('keeps the shared drop word structurally distinct', () => {
    expect(decodeSessionTraceCommand({ drop: true })).toEqual({ kind: 'drop' });
    expect(parseConsoleCommand('drop 42', 16)).toEqual({
      kind: 'dropObject',
      selector: '42'
    });
  });

  test('understands none of the commands a trace records', () => {
    // The reverse direction: a recorded input is not something a player can type.
    for (const recorded of [
      'press',
      'throttleNotch',
      'shutThrottle',
      'leaveCraft',
      'rideLift',
      'drop'
    ]) {
      if (recorded === 'drop') {
        expect(() => parseConsoleCommand(recorded, 16)).toThrow(
          'drop takes an object id or name'
        );
        continue;
      }
      expect(() => parseConsoleCommand(recorded, 16)).toThrow(
        `unknown command '${recorded.toLowerCase()}': type help`
      );
    }
  });
});
