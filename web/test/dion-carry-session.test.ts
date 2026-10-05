import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { dionTakeTargetAt } from '../src/dion/pointer.ts';
import type { DionAction } from '../src/dion/session.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { frames } from './dion-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

const at = (session: TourcraftSession, frame: number) => {
  while (session.snapshot.frame < frame - 1) {
    frames(session);
    session.drainSound();
  }
};
const act = (session: TourcraftSession, frame: number, action: DionAction) => {
  at(session, frame);
  session.press(action);
  frames(session);
};
const stack = (session: TourcraftSession) =>
  session.snapshot.tourcraft!.carry.stack;
const resident = (session: TourcraftSession, slot: number) =>
  session.snapshot.tourcraft!.residents.find(r => r.slot === slot)!;

/// R1's original opening route (docs/research/mercenary-iii-object-interaction-r1.md): Open
/// at 20, forward from 80 to 124, then one object action every thirty frames.
const r1Route = (session: TourcraftSession, until = 341) => {
  act(session, 20, 'activate');
  at(session, 80);
  session.intent = { ...IDLE, walk: 1 };
  at(session, 124);
  session.intent = IDLE;
  const route: [number, DionAction, number[]][] = [
    [161, 'drop', [103, 135]],
    [191, 'take', [104, 103, 135]],
    [221, 'forward', [103, 135, 104]],
    [251, 'drop', [135, 104]],
    [281, 'take', [103, 135, 104]],
    [311, 'backward', [104, 103, 135]],
    [341, 'take', [220, 104, 103, 135]]
  ];
  for (const [frame, action, expected] of route) {
    if (frame > until) {
      break;
    }
    act(session, frame, action);
    expect([frame, action, stack(session)]).toEqual([frame, action, expected]);
  }
};

test('the opening Carried Stack, label and gauge', () => {
  const session = new TourcraftSession(content);
  expect(stack(session)).toEqual([104, 103, 135]);
  expect(session.panelView().inventory).toBe('    TAXICARD    ');
  expect(session.snapshot.gauges.inventory).toBe(6);
  for (const slot of [103, 104, 135]) {
    expect(resident(session, slot).state & 0x80).toBe(0x80);
  }
});

test("R1's opening route drops, re-takes and rotates the cards, then takes the letter", () => {
  const session = new TourcraftSession(content);
  r1Route(session);
  const letter = resident(session, 220);
  expect(letter.state & 0x80).toBe(0x80);
  expect(letter.bodyOffset).toBe(0x78);
  expect(session.snapshot.gauges.inventory).toBe(8);
  frames(session, 4);
  expect(session.panelView().inventory).toBe('MARGARETS LETTER');
});

test('a dropped card lies on the ground, is drawn, and closes the open card', () => {
  const session = new TourcraftSession(content);
  r1Route(session, 161);
  const card = resident(session, 104);
  expect(card.state & 0x80).toBe(0);
  expect(card.bodyOffset).toBe(60);
  expect(card.position[1]).toBe(session.snapshot.eye[1] - 63);
  expect(session.snapshot.card).toBe(false);
  expect(session.snapshot.candidate?.slot).toBe(104);
  expect(session.snapshot.gauges.inventory).toBe(4);
  // The label scrolls in one character a VBL.
  expect(session.panelView().inventory).not.toBe('    BUS PASS    ');
  frames(session, 4);
  expect(session.panelView().inventory).toBe('    BUS PASS    ');
});

test('Take and Drop survive a Save', () => {
  const session = new TourcraftSession(content);
  r1Route(session, 251);
  frames(session, 4);
  const record = decodeTourcraftRecord(
    encodeTourcraftRecord(content, session.captureResume(), 'METIS'),
    content
  );
  const restored = new TourcraftSession(content, record.snapshot);
  expect(stack(restored)).toEqual([135, 104]);
  expect(resident(restored, 103)).toEqual(resident(session, 103));
  act(restored, 281, 'take');
  expect(stack(restored)).toEqual([103, 135, 104]);
});

test('a Save whose held bits disagree with the stack is refused', () => {
  const session = new TourcraftSession(content);
  const captured = session.captureResume();
  const tourcraft = captured.snapshot.tourcraft!;
  const tampered = {
    ...captured,
    snapshot: {
      ...captured.snapshot,
      tourcraft: {
        ...tourcraft,
        carry: { ...tourcraft.carry, stack: [104, 103] }
      }
    }
  };
  expect(() => new TourcraftSession(content, tampered)).toThrow(
    /Held bit|gauge/
  );
});

test('a press on the drawn candidate is a Take target, and nowhere else is', () => {
  // The opening view draws the letter, far off: a candidate there would be out of reach,
  // which the Take itself refuses.
  const description = new TourcraftSession(content).planFrame().description;
  const candidate = 220;
  const drawn = description.primitives.find(p => p.source === 'resident:220');
  if (drawn === undefined || drawn.kind === 'point') {
    throw new Error('the letter is not drawn');
  }
  const [x, y] = drawn.screen
    .reduce(([sx, sy], [px, py]) => [sx + px, sy + py], [0, 0])
    .map(v => v / drawn.screen.length) as [number, number];
  expect(dionTakeTargetAt(description, candidate, { x, y }, 1)).toBe(true);
  expect(dionTakeTargetAt(description, candidate, { x: -50, y: -50 }, 1)).toBe(
    false
  );
  expect(dionTakeTargetAt(description, undefined, { x, y }, 1)).toBe(false);
});

const openLetter = () => {
  const session = new TourcraftSession(content);
  r1Route(session);
  // The label settles, then Open scrolls the letter's panel on over 64 VBLs.
  frames(session, 4);
  session.press('activate');
  frames(session, 8);
  session.drainSound();
  return session;
};

test('Open shows the head document on the centre box, and the keypad pages it', () => {
  const session = openLetter();
  const head = () => session.snapshot.tourcraft!.head;
  expect(head().open).toEqual({ index: 0, item: 0, slot: 220 });
  expect(head().box.steps).toBe(0);
  expect(session.snapshot.card).toBe(false);
  const centre = session.panelView().centre;
  expect(centre.kind === 'panel' && centre.item?.name).toBe('FROM    ');
  session.press('plus');
  frames(session);
  expect(head().open?.item).toBe(1);
  session.press('minus');
  frames(session);
  session.press('minus');
  frames(session);
  // A backward wrap lands on the last item, PPS.
  expect(head().open?.item).toBe(3);
});

test('Read shows the item rows one after another; the last scrolls out', () => {
  const session = openLetter();
  session.press('plus');
  frames(session);
  session.press('star');
  frames(session);
  const shown: string[] = [];
  let serial = session.snapshot.narrative.message.serial;
  for (let i = 0; i < 400 && shown.length < 7; i += 1) {
    frames(session);
    session.drainSound();
    const message = session.snapshot.narrative.message;
    if (message.serial !== serial) {
      serial = message.serial;
      shown.push(message.text);
    }
  }
  expect(shown).toHaveLength(7);
  expect(shown[0]).toBe('MY DEAR MERCENARY         -');
  expect(session.snapshot.tourcraft!.head.lastRead).toEqual({
    index: 1,
    slot: 220
  });
});

test('dropping the open document closes it, and an open panel survives a Save', () => {
  const session = openLetter();
  session.press('star');
  frames(session);
  const record = decodeTourcraftRecord(
    encodeTourcraftRecord(content, session.captureResume(), 'METIS'),
    content
  );
  const restored = new TourcraftSession(content, record.snapshot);
  expect(restored.snapshot.tourcraft!.head).toEqual(
    session.snapshot.tourcraft!.head
  );
  expect(restored.snapshot.tourcraft!.reading).toEqual(
    session.snapshot.tourcraft!.reading
  );
  session.press('drop');
  frames(session);
  expect(session.snapshot.tourcraft!.head.open).toBeNull();
  expect(session.snapshot.tourcraft!.head.box.to).toBeNull();
});

test('the TAXICARD still opens its own card', () => {
  const session = new TourcraftSession(content);
  frames(session, 6);
  session.press('activate');
  frames(session, 8);
  expect(session.snapshot.card).toBe(true);
  expect(session.snapshot.tourcraft!.head.open?.slot).toBe(104);
  expect(session.panelView().centre.kind).toBe('card');
});
