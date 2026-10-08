import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { frames } from './dion-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

// Places the player on foot at a point in a METIS cell's own frame. Entering another
// cell binds its doors shut, as walking into it does.
class DoorSession extends TourcraftSession {
  standAt(cell: number, x: number, z: number) {
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
      doors: cell === this.state.cell ? this.state.doors : new Map(),
      eye,
      region: this.regionAtEye(cell, [...eye])
    };
  }

  door(slot: number) {
    return this.state.doors.get(slot);
  }
}

// Eight substeps a frame at the fixed 11-VBL frame.
test('opens a keyless two-leaf door in its box, latches a substep late, and closes outside it', () => {
  const session = new DoorSession(content);
  // Cell $31's slot $250: leaves X −80..80, box X −100..100, Z 400..1100.
  session.standAt(0x31, 0, 1000);
  frames(session);
  expect(session.door(0x2_50)).toEqual({ latch: 'moving', openUnits: 8 });
  expect(session.door(0x2_54)).toBeUndefined();
  frames(session, 8);
  expect(session.door(0x2_50)).toEqual({ latch: 'moving', openUnits: 72 });
  frames(session);
  expect(session.door(0x2_50)).toEqual({ latch: 'open', openUnits: 72 });

  session.standAt(0x31, 0, 1100);
  frames(session);
  expect(session.door(0x2_50)).toEqual({ latch: 'moving', openUnits: 64 });
  frames(session, 9);
  expect(session.door(0x2_50)).toEqual({ latch: 'shut', openUnits: 0 });
});

test('latches a single leaf on arrival when its high edge falls open', () => {
  const session = new DoorSession(content);
  // Cell $03's slot $24C: control $4000, leaf X −680..−520, box X −800..−400, Z 2000..2800.
  session.standAt(0x03, -600, 2400);
  frames(session, 18);
  expect(session.door(0x2_4c)).toEqual({ latch: 'moving', openUnits: 144 });
  frames(session);
  expect(session.door(0x2_4c)).toEqual({ latch: 'open', openUnits: 152 });
});

test('keeps the prison door shut without DOOR KEY A', () => {
  const session = new DoorSession(content);
  session.standAt(0x62, 0, 0);
  frames(session, 4);
  expect(session.door(0x2_54)).toBeUndefined();
});
