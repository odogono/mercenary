import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { drop, take, type CarryPlace } from '../src/dion/carry.ts';
import { repricePawn } from '../src/dion/pawn.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import {
  initialTourcraftCarry,
  initialTourcraftResidents,
  tourcraftCarryWorld
} from '../src/dion/tourcraftState.ts';
import { frames } from './dion-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});
const world = tourcraftCarryWorld(content);
const carry = initialTourcraftCarry(content, world);
const residents = initialTourcraftResidents(content);
const place: CarryPlace = {
  body: 60,
  cell: 98,
  contact: true,
  eye: [165_773_321, 63, 70_289_576],
  floor: 0,
  group: 3,
  interior: { associations: [9], region: 9 },
  structure: 0x52,
  zone: 0
};
const economy = {
  cash: '000000000100',
  pawn: { previous: 0, price: '000000000025', slot: 0 }
};
const candidate = { exponent: 5, slot: 104 };
const dropAt = (where = place, trade = economy) =>
  drop(carry, residents, world, null, where, trade);

test('pawn Drop pays the six-byte BCD price and remembers the head', () => {
  const sold = dropAt();
  expect(sold).toMatchObject({
    economy: { cash: '000000000125', pawn: { ...economy.pawn, slot: 104 } },
    kind: 'done'
  });
  if (sold.kind !== 'done') {
    throw new Error('refused');
  }
  expect(sold.carry.stack).toEqual([103, 135]);
  expect(sold.residents.find(r => r.slot === 104)).toMatchObject({
    association: 9,
    state: 8
  });
  expect(sold).not.toHaveProperty('unported');
  expect(dropAt(place, { ...economy, cash: '999999999990' })).toMatchObject({
    economy: { cash: '000000000015' }
  });
});

test('an occupied pawn refuses a second Drop with message 11', () => {
  expect(
    dropAt(place, { ...economy, pawn: { ...economy.pawn, slot: 103 } })
  ).toEqual({ kind: 'refused', message: 11 });
});

test('ordinary and invalid-region Drops do not transact', () => {
  for (const where of [
    { ...place, interior: null },
    { ...place, structure: 0x53 },
    { ...place, interior: { associations: [8], region: 8 } }
  ]) {
    expect(dropAt(where)).not.toHaveProperty('economy');
  }
  expect(
    dropAt({ ...place, interior: { ...place.interior!, associations: [] } })
  ).toEqual({ kind: 'refused', message: 9 });
});

test('pawn credit precedes a later placement refusal, and cannot be paid twice', () => {
  const refused = dropAt({ ...place, contact: false });
  expect(refused).toMatchObject({
    economy: { cash: '000000000125', pawn: { slot: 104 } },
    kind: 'refused'
  });
  if (!refused.economy) {
    throw new Error('missing transaction');
  }
  expect(dropAt(place, refused.economy)).toEqual({
    kind: 'refused',
    message: 11
  });
});

test('taking the pawned object charges exactly the stored price and clears the slot', () => {
  const sold = dropAt();
  if (sold.kind !== 'done' || !sold.economy) {
    throw new Error('refused');
  }
  const retake = (cash: string, region = 9, exponent = 5) =>
    take(
      { ...sold.carry, scroll: 0 },
      sold.residents,
      world,
      { ...candidate, exponent },
      60,
      { ...sold.economy!, cash },
      region
    );
  expect(retake('000000000025')).toMatchObject({
    carry: { stack: [104, 103, 135] },
    economy: { cash: '000000000000', pawn: { slot: 0 } },
    kind: 'done'
  });
  expect(retake('000000000024')).toEqual({ kind: 'refused', message: 12 });
  // `$4E732` tests the high byte's sign, not the subtraction's borrow.
  expect(retake('800000000025')).toEqual({ kind: 'refused', message: 12 });
  expect(retake('800000000024')).toMatchObject({
    economy: { cash: '799999999999' },
    kind: 'done'
  });
  expect(retake('000000000100', 8)).toEqual({ kind: 'refused' });
  expect(retake('000000000100', 9, 9)).toEqual({ kind: 'refused' });
  expect(
    take(
      { ...sold.carry, capacity: 2, scroll: 0 },
      sold.residents,
      world,
      candidate,
      60,
      sold.economy,
      9
    )
  ).toEqual({ kind: 'refused' });
  expect(sold.economy.cash).toBe('000000000125');
});

test('taking a different resident leaves the outstanding pawn alone', () => {
  const trade = { ...economy, pawn: { ...economy.pawn, slot: 103 } };
  const letter = take(
    carry,
    residents,
    world,
    { exponent: 5, slot: 220 },
    60,
    trade,
    8
  );
  expect(letter.kind).toBe('done');
  expect(letter).not.toHaveProperty('economy');
});

// The promoted world has no ERIS shop. Synthetic placement reaches the real session,
// currency and Save boundary without promoting a new world or claiming a route.
class PawnSession extends TourcraftSession {
  protected override carryPlace(body: number): CarryPlace {
    return { ...place, body, cell: this.state.cell, eye: this.state.eye };
  }
  target(slot: number) {
    this.state = {
      ...this.state,
      candidate: { distance: 0, exponent: 5, slot }
    };
  }
  cash(value: string) {
    this.state = { ...this.state, cash: value };
  }
  ready() {
    const flags = [...this.narrative.state.flags];
    flags[6] = false;
    this.narrative.state = {
      ...this.narrative.state,
      flags,
      message: { ...this.narrative.state.message, busy: false },
      pc: 0x6_ff_54,
      stack: []
    };
    this.state = { ...this.state, narrative: this.narrative.state, region: 9 };
  }
}

const shopSession = () => {
  const session = new PawnSession(content);
  frames(session, 2);
  session.ready();
  session.target(74);
  session.cash('000000000100');
  return session;
};

test('the session credits the recovered TAXICARD price and restores the same reclaim future', () => {
  const session = shopSession();
  session.press('drop');
  frames(session, 3);
  expect(session.snapshot.cash).toBe('000000000125');
  expect(session.snapshot.tourcraft!.pawn).toEqual({
    previous: 0,
    price: '000000000025',
    slot: 104
  });
  session.drainSound();
  const restored = new PawnSession(
    content,
    decodeTourcraftRecord(
      encodeTourcraftRecord(content, session.captureResume(), 'pawn'),
      content
    ).snapshot
  );
  expect(restored.captureResume()).toEqual(session.captureResume());
  for (const current of [session, restored]) {
    current.ready();
    current.target(104);
    current.press('take');
    frames(current, 3);
    current.drainSound();
    expect(current.snapshot.cash).toBe('000000000100');
    expect(current.snapshot.tourcraft!.pawn.slot).toBe(0);
    expect(current.drainNotes()).toEqual([]);
  }
  expect(restored.captureResume()).toEqual(session.captureResume());
});

test('short cash shows message 12 without changing the pawn, stack or resident', () => {
  const session = shopSession();
  session.press('drop');
  frames(session, 3);
  session.ready();
  session.cash('000000000024');
  session.target(104);
  const before = session.snapshot.tourcraft!;
  session.press('take');
  frames(session);
  expect(session.snapshot.cash).toBe('000000000024');
  expect(session.snapshot.tourcraft!.pawn).toEqual(before.pawn);
  expect(session.snapshot.tourcraft!.carry.stack).toEqual(before.carry.stack);
  expect(
    session.snapshot.tourcraft!.residents.find(r => r.slot === 104)
  ).toEqual(before.residents.find(r => r.slot === 104));
  expect(session.snapshot.narrative.message.text).toBe(
    'SORRY BUT YOU HAVE INSUFFICIENT FUNDS'
  );
});

test('pawn Save validation refuses malformed prices and unknown slots', () => {
  const session = shopSession();
  session.press('drop');
  frames(session, 3);
  session.drainSound();
  for (const change of [
    { price: '25' },
    { price: '00000000000a' },
    { slot: 247 },
    { slot: 50 },
    { previous: 63 },
    { slot: -1 },
    { previous: 247 }
  ]) {
    const resume = structuredClone(session.captureResume());
    Object.assign(resume.snapshot.tourcraft!.pawn, change);
    expect(() => new TourcraftSession(content, resume)).toThrow(/pawn/);
  }
});

test('head rotation changes the empty counter quote, then an offer freezes its price', () => {
  const session = shopSession();
  frames(session);
  expect(session.snapshot.tourcraft!.pawn.price).toBe('000000000025');
  session.press('forward');
  frames(session, 3);
  expect(session.snapshot.tourcraft!.pawn.price).toBe('000000000250');
  session.target(74);
  session.press('drop');
  frames(session, 3);
  expect(session.snapshot.tourcraft!.pawn.slot).toBe(103);
  expect(session.snapshot.cash).toBe('000000000350');
  session.press('forward');
  frames(session, 3);
  expect(session.snapshot.tourcraft!.pawn.price).toBe('000000000250');
});

test('workspace reload finds the highest matching pawn resident and restores its buy price', () => {
  const sold = dropAt();
  if (sold.kind !== 'done' || !sold.economy) {
    throw new Error('refused');
  }
  const pawn = repricePawn(
    sold.economy.pawn,
    sold.residents,
    103,
    content.head.pawn,
    place,
    true
  );
  expect(pawn).toEqual({ previous: 104, price: '000000000075', slot: 104 });
  const reclaimed = repricePawn(
    { ...pawn, slot: 0 },
    sold.residents,
    104,
    content.head.pawn,
    place,
    false
  );
  expect(reclaimed).toEqual({ previous: 104, price: '000000000075', slot: 0 });
  expect(
    repricePawn(reclaimed, sold.residents, 103, content.head.pawn, place, false)
      .price
  ).toBe('000000000250');
  const other = sold.residents.map(r =>
    r.slot === 220
      ? { ...r, association: 9, cell: place.cell, group: place.group }
      : r
  );
  expect(repricePawn(pawn, other, 103, content.head.pawn, place, true)).toEqual(
    { previous: 220, price: '000004500000', slot: 220 }
  );
  expect(
    repricePawn(
      pawn,
      other,
      103,
      content.head.pawn,
      { ...place, cell: 99 },
      true
    )
  ).toEqual({ previous: 0, price: '000000000250', slot: 0 });
  expect(
    repricePawn(
      pawn,
      other,
      103,
      content.head.pawn,
      { ...place, structure: 0 },
      true
    )
  ).toBe(pawn);
});
