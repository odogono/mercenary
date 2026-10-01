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

  test('walks 48 units a frame toward the door on the shared foot step', async () => {
    const session = new DionSession(await dionContent());
    session.intent = { ...session.intent, walk: 1 };
    // Heading `$400` faces −Z, the prison door: one frame is eight substeps of 6 units.
    session.advance(11 / 50);
    const [x, , z] = session.snapshot.eye;
    expect(session.snapshot.frame).toBe(1);
    expect(z).toBe(0x04_30_88_a8 - 48);
    expect(x).toBe(0x09_e1_80_09);
  });

  test('holds the eye in the room while the door is shut', async () => {
    const content = await dionContent();
    const session = new DionSession(content);
    session.intent = { ...session.intent, walk: 1 };
    session.advance(20);
    const cell = content.world.cells.find(item => item.cell === 0x62)!;
    const originZ =
      (content.world.opening.groupOrigin[1] + cell.z) * 0x1_00_00 +
      cell.origin[1];
    // The doorway region shares the room's edge at z −840, so the clearance does not apply;
    // the scan refuses the shut doorway and the eye stands on the edge, where #645 saw the
    // keyless player held.
    expect(session.snapshot.eye[2] - originZ).toBe(-840);
    expect(session.snapshot.region).toBe(1);
    expect(session.snapshot.cell).toBe(0x62);
  });

  test('turns two heading units a substep', async () => {
    const session = new DionSession(await dionContent());
    session.intent = { ...session.intent, turn: 1 };
    session.advance(11 / 50);
    expect(session.snapshot.heading).toBe(0x4_00 + 16);
    session.intent = { ...session.intent, turn: -1 };
    session.advance(22 / 50);
    expect(session.snapshot.heading).toBe(0x4_00 - 16);
  });

  test('walks the same whatever the step size', async () => {
    const content = await dionContent();
    const coarse = new DionSession(content);
    const fine = new DionSession(content);
    for (const session of [coarse, fine]) {
      session.intent = { ...session.intent, turn: 0.5, walk: 1 };
    }
    coarse.advance(3);
    for (let index = 0; index < 180; index += 1) {
      fine.advance(1 / 60);
    }
    expect(fine.snapshot.eye).toEqual(coarse.snapshot.eye);
    expect(fine.snapshot.heading).toBe(coarse.snapshot.heading);
  });

  test('refuses a restore: Session Resume is reserved for #648', async () => {
    const content = await dionContent();
    expect(() => new DionSession(content, { tick: 0 })).toThrow('reserved');
  });
});
