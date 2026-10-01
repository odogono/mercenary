import { describe, expect, test } from 'bun:test';

import { DionSession } from '../src/dion/session.ts';
import { dionContent } from './dion-documents.ts';

/// The I1 session's clocks (ADR 0058): fifty ticks a second, a frame every eleven, and the
/// elapsed clock's own VBL rule from the recovered accumulator.

describe('the Mercenary III session', () => {
  test('opens at the recovered fresh game in the prison cell', async () => {
    const session = new DionSession(await dionContent());
    const { snapshot } = session;
    expect(snapshot.cell).toBe(0x62);
    expect(snapshot.region).toBe(1);
    expect(snapshot.eye).toEqual([0x09_e1_80_09, 63, 0x04_30_88_a8]);
    expect(snapshot.clock.seconds).toBe(0);
    expect(snapshot.cash).toBe('005100900000');
    // The prison binds its door shut; without DOOR KEY A it stays shut (#645).
    expect(snapshot.doors.size).toBe(0);
  });

  test('runs a frame every eleven ticks whatever the step size', async () => {
    const content = await dionContent();
    const coarse = new DionSession(content);
    const fine = new DionSession(content);
    coarse.advance(1);
    for (let index = 0; index < 600; index += 1) {
      fine.advance(1 / 600);
    }
    expect(coarse.snapshot.tick).toBe(50);
    expect(fine.snapshot.tick).toBe(50);
    expect(coarse.snapshot.frame).toBe(4);
    expect(fine.snapshot).toEqual(coarse.snapshot);
  });

  test('counts the first second on the twenty-first tick, then every fifty', async () => {
    const session = new DionSession(await dionContent());
    session.advance(20 / 50);
    expect(session.snapshot.clock.seconds).toBe(0);
    session.advance(1 / 50);
    expect(session.snapshot.clock.seconds).toBe(1);
    session.advance(49 / 50);
    expect(session.snapshot.clock.seconds).toBe(1);
    session.advance(1 / 50);
    expect(session.snapshot.clock.seconds).toBe(2);
  });

  test('accepts the Movement Intent without moving before the Mover arrives', async () => {
    const session = new DionSession(await dionContent());
    session.intent = { ...session.intent, turn: 1, walk: 1 };
    session.advance(2);
    expect(session.snapshot.eye).toEqual([0x09_e1_80_09, 63, 0x04_30_88_a8]);
    expect(session.snapshot.heading).toBe(0x4_00);
  });

  test('refuses a restore: Session Resume is reserved for #648', async () => {
    const content = await dionContent();
    expect(() => new DionSession(content, { tick: 0 })).toThrow('reserved');
  });
});
