import { describe, expect, test } from 'bun:test';

import {
  executeDionConsoleCommand,
  parseDionConsoleCommand
} from '../src/dion/console.ts';
import { DionSession } from '../src/dion/session.ts';
import { dionContent } from './dion-documents.ts';

const run = (session: DionSession, line: string) =>
  executeDionConsoleCommand(parseDionConsoleCommand(line)!, {
    session: () => session
  })[0];

describe('Dion console clocks', () => {
  test('sets Body Time and daylight while leaving the panel clock independent', async () => {
    const content = await dionContent();
    const session = new DionSession(content);
    const clock = session.snapshot.clock;
    for (const value of ['0:00:00', '12:00:00', '23-59-59', '9:01:02']) {
      expect(run(session, `time ${value}`)).toBe(
        `time ${value.replaceAll('-', ':').padStart(8, '0')}`
      );
      expect(session.snapshot.clock).toEqual(clock);
      expect(run(session, 'time')).toBe(
        `time ${value.replaceAll('-', ':').padStart(8, '0')}`
      );
      expect(
        run(new DionSession(content, session.captureResume()), 'time')
      ).toBe(run(session, 'time'));
    }
    run(session, 'time 12:00');
    expect(session.snapshot.day).toBe(true);
    run(session, 'time 0:00');
    expect(session.snapshot.day).toBe(false);
    const saved = session.captureResume();
    const east = new DionSession(content, {
      ...saved,
      snapshot: {
        ...saved.snapshot,
        eye: [
          saved.snapshot.eye[0] + 0x4_00_00,
          saved.snapshot.eye[1],
          saved.snapshot.eye[2]
        ]
      }
    });
    expect(
      (east.bodyTime() - session.bodyTime() + 86_400) % 86_400
    ).toBeCloseTo(86_400 / 1024, 4);
  });

  test('sets and restores the panel clock, preserving its day, fraction and sky', async () => {
    const content = await dionContent();
    const session = new DionSession(content);
    const before = session.snapshot;
    expect(run(session, 'clock 23-59-59')).toBe('clock 23:59:59');
    expect(run(session, 'clock')).toBe('clock 23:59:59');
    expect(session.snapshot.phase).toBe(before.phase);
    expect(session.snapshot.clock.accumulator).toBe(before.clock.accumulator);
    expect(session.snapshot.clock.day).toBe(before.clock.day);
    const restored = new DionSession(content, session.captureResume());
    session.advance(1);
    restored.advance(1);
    expect(restored.snapshot).toEqual(session.snapshot);
    expect(run(restored, 'clock')).toBe('clock 00:00:00');
    expect(restored.snapshot.clock.day).toBe(before.clock.day + 1);
  });

  test('admits only help, time and clock with the shared syntax', () => {
    expect(parseDionConsoleCommand('  TIME 9-01-02 ')).toEqual({
      kind: 'setTime',
      secondsOfDay: 32_462
    });
    expect(parseDionConsoleCommand('')).toBeUndefined();
    for (const line of [
      'clock 24:00',
      'clock 1:60',
      'clock 1:02-03',
      'clock 1:00 extra',
      'impact',
      'where',
      'get 1',
      'save 1'
    ]) {
      expect(() => parseDionConsoleCommand(line)).toThrow();
    }
  });
});
