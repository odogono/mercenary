import { describe, expect, test } from 'bun:test';

import { navigationSession } from './replay/navigationGate.ts';
import { decodeNavigationTraceCommand } from './replay/navigationReplay.ts';

describe('a recorded Navigation command', () => {
  test('decodes the setup operations the Room trace emitter records', () => {
    expect(decodeNavigationTraceCommand({ carry: [17] })).toEqual({
      kind: 'carry',
      slots: [17]
    });
    expect(decodeNavigationTraceCommand({ face: Math.PI, leg: 2 })).toEqual({
      heading: Math.PI,
      kind: 'face',
      leg: 2
    });
  });

  test('refuses malformed setup rather than partially applying it', () => {
    expect(() => decodeNavigationTraceCommand({ carry: [] })).toThrow(
      /carry must name at least one object slot/
    );
    expect(() => decodeNavigationTraceCommand({ carry: [17.5] })).toThrow(
      /object slots must be non-negative integers/
    );
    expect(() =>
      decodeNavigationTraceCommand({ face: Number.POSITIVE_INFINITY, leg: 1 })
    ).toThrow(/face must name a finite heading/);
    expect(() => decodeNavigationTraceCommand({ face: 0, leg: 0 })).toThrow(
      /leg must be a positive integer/
    );
  });

  test('refuses unknown or mixed command shapes', () => {
    expect(() => decodeNavigationTraceCommand({ teleport: 127 })).toThrow(
      /unknown Navigation command/
    );
    expect(() =>
      decodeNavigationTraceCommand({ carry: [17], face: 0, leg: 1 })
    ).toThrow(/must be either carry or face/);
    expect(() => decodeNavigationTraceCommand('face')).toThrow(
      /must be an object/
    );
  });
});

test('a Navigation scenario refuses a negative Room identifier', () => {
  expect(() =>
    navigationSession(
      {} as never,
      { header: { scenario: { room: -1 } } } as never
    )
  ).toThrow(/room must be a non-negative integer/);
});
