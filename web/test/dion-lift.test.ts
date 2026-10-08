import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { executeDionConsoleCommand } from '../src/dion/console.ts';
import { captureDionParts } from '../src/dion/frame.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { frames, until } from './dion-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

// The METIS building in cell 4: structure slot 154, Floors 0 to 9 at a pitch of 150, a
// lift car at X −320..0, Z −1380..−1160 behind the doorway region `$83FC` and door `$254`.
const CELL = 0x04;
const DOOR = 0x2_54;

class LiftSession extends TourcraftSession {
  readonly heard: string[] = [];

  standAt(cell: number, x: number, z: number, heading = 0) {
    const { world } = this.content;
    const entry = world.cells.find(item => item.cell === cell)!;
    const [gx, gz] = world.opening.groupOrigin;
    const eye = [
      (gx + entry.x) * 65_536 + entry.origin[0] + x,
      63,
      (gz + entry.z) * 65_536 + entry.origin[1] + z
    ] as const;
    this.state = {
      ...this.state,
      cell,
      doors: new Map(),
      eye,
      heading,
      region: this.regionAtEye(cell, [...eye])
    };
  }

  /// Walks forward from the hall into the car, as the ROM probe does.
  walkIntoCar() {
    this.standAt(CELL, -160, -700);
    this.intent = { ...IDLE, walk: 1 };
    until(this, () => this.inLift);
    this.intent = IDLE;
    frames(this, 8);
  }

  get lift() {
    return this.snapshot.tourcraft!.lift;
  }

  get local(): readonly [number, number] {
    const entry = this.content.world.cells.find(c => c.cell === CELL)!;
    const [gx, gz] = this.content.world.opening.groupOrigin;
    return [
      this.state.eye[0] - ((gx + entry.x) * 65_536 + entry.origin[0]),
      this.state.eye[2] - ((gz + entry.z) * 65_536 + entry.origin[1])
    ];
  }

  door() {
    return this.state.doors.get(DOOR);
  }

  protected override cue(name: string): void {
    this.heard.push(name);
    super.cue(name);
  }
}

const labels = (session: LiftSession, limit = 200) => {
  const seen = [session.labelFloor];
  for (let frame = 0; frame < limit && session.lift.ride !== null; frame += 1) {
    frames(session);
    if (session.labelFloor !== seen.at(-1)) {
      seen.push(session.labelFloor);
    }
  }
  return seen;
};

describe('Mercenary III lift (#835)', () => {
  test('exports every Floor the building binds', () => {
    const cell = new LiftSession(content).snapshot;
    const world = new LiftSession(content)['content'].world;
    const entry = world.cells.find(c => c.cell === CELL)!;
    expect([...entry.floors!.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...entry.floors!.values()].map(f => f.baseY)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(f => f * 150)
    );
    expect(entry.floors!.get(3)!.structure.regions.length).toBe(5);
    expect(world.cells.find(c => c.cell === cell.cell)!.floors).toBeUndefined();
  });

  test('the Floor keys are the lift’s only on foot in a car', () => {
    const session = new LiftSession(content);
    session.standAt(CELL, -160, -700);
    expect(session.inLift).toBe(false);
    expect(session.rideLift(3)).toEqual({ kind: 'noLift' });
    session.walkIntoCar();
    expect(session.inLift).toBe(true);
    expect(session.lift.doorway).toBe(DOOR);
    expect(session.door()?.latch).toBe('open');
  });

  test('rides G to 3 as the original does, and back', () => {
    const session = new LiftSession(content);
    session.walkIntoCar();
    const [x, z] = session.local;
    session.heard.length = 0;
    expect(session.rideLift(3)).toEqual({ kind: 'admitted' });
    expect(session.heard).toEqual(['door_moving']);
    // The pinned door closes before the label moves: 64 units, one a substep, and a
    // substep to latch.
    frames(session, 8);
    expect(session.labelFloor).toBe(0);
    expect(session.door()).toEqual({ latch: 'moving', openUnits: 0 });
    frames(session);
    expect(session.door()).toEqual({ latch: 'shut', openUnits: 0 });
    // Three steps and the arrival, 25 substeps each, at eight substeps a frame.
    const start = session.snapshot.frame;
    expect(labels(session)).toEqual([0, 1, 2, 3]);
    expect(session.snapshot.frame - start).toBe(Math.ceil((100 - 7) / 8));
    expect(session.lift).toEqual({ doorway: DOOR, floor: 3, ride: null });
    expect(session.snapshot.eye[1]).toBe(3 * 150 + 63);
    expect(session.local).toEqual([x, z]);
    expect(session.inLift).toBe(true);
    expect(session.heard).toEqual([
      'door_moving',
      'door_stop',
      'cut',
      'key_click',
      'door_moving'
    ]);
    // Floor 3 binds its own structure, and the door opens again.
    frames(session, 9);
    expect(session.door()?.latch).toBe('open');
    expect(session.snapshot.tourcraft!.owners['location']!['floor']).toBe(3);

    // B is a Floor the table leaves zero, and 3 is the Floor the label shows.
    expect(session.rideLift(10)).toEqual({ kind: 'refused' });
    expect(session.rideLift(3)).toEqual({ kind: 'refused' });
    expect(session.rideLift(0)).toEqual({ kind: 'admitted' });
    expect(labels(session)).toEqual([3, 2, 1, 0]);
    expect(session.lift.floor).toBe(0);
    expect(session.snapshot.eye[1]).toBe(63);
  });

  test('a later key replaces the destination', () => {
    const session = new LiftSession(content);
    session.walkIntoCar();
    session.rideLift(3);
    frames(session, 13);
    expect(session.labelFloor).toBe(1);
    expect(session.rideLift(1)).toEqual({ kind: 'refused' });
    expect(session.rideLift(2)).toEqual({ kind: 'admitted' });
    labels(session);
    expect(session.lift.floor).toBe(2);
  });

  test('holds the player in the car for the whole ride', () => {
    const session = new LiftSession(content);
    session.walkIntoCar();
    session.rideLift(2);
    session.intent = { ...IDLE, walk: -1 };
    frames(session, 15);
    expect(session.inLift).toBe(true);
    session.intent = IDLE;
  });

  test('a Save part way through a ride resumes it', () => {
    const session = new LiftSession(content);
    session.walkIntoCar();
    session.rideLift(4);
    frames(session, 12);
    const ride = session.lift.ride;
    expect(ride).not.toBeNull();
    const encoded = encodeTourcraftRecord(
      content,
      session.captureResume(),
      'here'
    );
    const restored = new LiftSession(
      content,
      decodeTourcraftRecord(encoded, content).snapshot
    );
    expect(restored.snapshot.tourcraft!.lift).toEqual(session.lift);
    labels(session);
    labels(restored);
    expect(restored.captureResume()).toEqual(session.captureResume());
    expect(restored.lift.floor).toBe(4);
  });

  test('refuses a saved ride outside a lift', () => {
    const session = new LiftSession(content);
    session.walkIntoCar();
    session.rideLift(4);
    const record = session.captureResume();
    const moved = structuredClone(record);
    (moved.snapshot as { region: number }).region = 3;
    expect(() => new LiftSession(content, moved)).toThrow(/lift.ride/);
  });

  test('draws the Floor’s structure at its height, with the live Floor Label', () => {
    const session = new LiftSession(content);
    session.walkIntoCar();
    session.rideLift(3);
    frames(session, 12);
    const [, state] = session.frameInputs();
    // Still on Floor 0 while the label steps.
    expect(state.floor).toBe(0);
    expect(state.tokens?.get(0x80)).toEqual([0x31]);
    labels(session);
    const [after, view] = session.frameInputs();
    expect(view.floor).toBe(3);
    expect(view.tokens?.get(0x80)).toEqual([0x33]);
    expect(view.tokens?.get(0x81)).toEqual([0x33]);
    const parts = captureDionParts(after, view);
    const entry = after.cells.find(c => c.cell === CELL)!;
    expect(parts.structure!.structure).toBe(entry.floors!.get(3)!.structure);
    // The structure-local eye stays 63, so walls stand from the Floor's height.
    const ys = [...parts.structure!.walls.values()]
      .flat()
      .flatMap(p => p.points.map(point => point[1]));
    expect(Math.min(...ys)).toBe(450);
    expect(session.planFrame().stats.gaps).not.toContain(
      'text token $80 is not bound'
    );
  });

  test('the console’s floor binds a Floor at once', () => {
    const session = new LiftSession(content);
    session.walkIntoCar();
    const host = {
      persistence: undefined as never,
      session: () => session
    } as unknown as Parameters<typeof executeDionConsoleCommand>[1];
    expect(
      executeDionConsoleCommand({ floor: 9, kind: 'floor' }, host)
    ).toEqual(['moved to Floor 9']);
    expect(session.snapshot.eye[1]).toBe(9 * 150 + 63);
    expect(
      executeDionConsoleCommand({ floor: 10, kind: 'floor' }, host)
    ).toEqual(['floor refused: structure 154 binds no Floor 10']);
  });
});
