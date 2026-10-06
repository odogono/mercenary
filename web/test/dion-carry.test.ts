import { expect, test } from 'bun:test';

import {
  carriedLabel,
  drop,
  inventoryGauge,
  rotate,
  stepCarriedLabel,
  take,
  type CarriedResident,
  type CarryPlace,
  type CarryWorld,
  type DionCarry
} from '../src/dion/carry.ts';

// The outcomes R1 recorded from the original handlers
// (docs/research/mercenary-iii-object-interaction-r1.md, "Synthetic rule controls").

const resident = (
  slot: number,
  state: number,
  fields: Partial<CarriedResident> = {}
): CarriedResident => ({
  association: 0,
  body: 0,
  bodyOffset: 60,
  cell: 98,
  group: 3,
  model: slot,
  position: [165_773_321, 0, 70_289_576],
  slot,
  state,
  yaw: 0,
  zone: 0,
  ...fields
});

const world: CarryWorld = {
  labels: new Map([
    [104, '    TAXICARD    '],
    [103, '    BUS PASS    '],
    [135, ' ACME UNIVERSAL '],
    [108, '   BRIEFCASE    '],
    [38, '   DOOR KEY A   '],
    [64, ' TRANSPORTER a  ']
  ]),
  // DESK240's original reader gives 38.
  supportTop: slot => (slot === 240 ? 38 : undefined)
};

const carry = (
  stack: number[],
  fields: Partial<DionCarry> = {}
): DionCarry => ({
  capacity: 10,
  incoming: '    TAXICARD    ',
  label: '    TAXICARD    ',
  scroll: 0,
  stack,
  stored: [],
  ...fields
});

const held = (stack: readonly number[]) =>
  stack.map(slot => resident(slot, 0x84, { bodyOffset: 0x78 }));

const place: CarryPlace = {
  body: 60,
  cell: 98,
  contact: true,
  eye: [165_773_321, 63, 70_289_576],
  floor: 0,
  group: 3,
  interior: null,
  zone: 4
};

const near = (slot: number, exponent = 5) => ({ exponent, slot });

const takeAt = (count: number, capacity: number) => {
  const stack = Array.from({ length: count }, (_, i) => i + 1);
  return take(
    carry(stack, { capacity }),
    [...held(stack), resident(181, 4)],
    world,
    near(181),
    60
  ).kind;
};

test('Take compares the count with capacity for equality', () => {
  const at = takeAt;
  expect(at(9, 10)).toBe('done');
  expect(at(10, 10)).toBe('refused');
  expect(at(11, 10)).toBe('done');
  expect(at(19, 20)).toBe('done');
  expect(at(20, 20)).toBe('refused');
});

test('fixed objects refuse unless slot 0 is held; heavy ones yield to POWERGLOVE or ANTIGRAV', () => {
  const stack = [104, 103, 135];
  const attempt = (state: number, extra: CarriedResident[] = []) =>
    take(
      carry(stack),
      [...held(stack), ...extra, resident(67, state)],
      world,
      near(67),
      60
    );
  expect(attempt(0x10)).toEqual({ kind: 'refused' });
  expect(attempt(0x10, [resident(157, 0x8c)])).toEqual({ kind: 'refused' });
  expect(attempt(0x20)).toEqual({ kind: 'refused', message: 2 });
  expect(attempt(0x20, [resident(157, 0x8c)]).kind).toBe('done');
  expect(attempt(0x20, [resident(158, 0x84)]).kind).toBe('done');
});

test('Take needs a candidate within exponent 8 and a settled label', () => {
  const stack = [104, 103, 135];
  const residents = [...held(stack), resident(181, 4)];
  expect(take(carry(stack), residents, world, near(181, 8), 60).kind).toBe(
    'done'
  );
  expect(take(carry(stack), residents, world, near(181, 9), 60).kind).toBe(
    'refused'
  );
  expect(take(carry(stack), residents, world, null, 60).kind).toBe('refused');
  for (const scroll of [16, -3]) {
    expect(
      take(carry(stack, { scroll }), residents, world, near(181), 60).kind
    ).toBe('refused');
  }
});

test('a taken object goes to the head, held, staged in group 49', () => {
  const stack = [104, 103, 135];
  const outcome = take(
    carry(stack),
    [...held(stack), resident(220, 4)],
    world,
    near(220),
    60
  );
  if (outcome.kind !== 'done') {
    throw new Error('refused');
  }
  expect(outcome.carry.stack).toEqual([220, 104, 103, 135]);
  expect(outcome.carry.scroll).toBe(-16);
  const letter = outcome.residents.find(r => r.slot === 220)!;
  expect(letter.state).toBe(0x84);
  expect(letter).toMatchObject({
    association: 1,
    body: 0,
    bodyOffset: 0x78,
    cell: 0x10,
    group: 49,
    position: [0x81_d5, 0, 0x1_83_1c]
  });
  expect(outcome.residents.find(r => r.slot === 135)!.position).toEqual([
    0x81_d5, 900, 0x1_83_1c
  ]);
});

test('twenty carried objects stage ten to a row', () => {
  const stack = Array.from({ length: 19 }, (_, i) => i + 1);
  const outcome = take(
    carry(stack, { capacity: 20 }),
    [...held(stack), resident(200, 4)],
    world,
    near(200),
    60
  );
  if (outcome.kind !== 'done') {
    throw new Error('refused');
  }
  const at = (slot: number) => outcome.residents.find(r => r.slot === slot)!;
  expect(at(9)).toMatchObject({
    body: 9,
    cell: 0x10,
    position: [0x81_d5, 2700, 0x1_83_1c]
  });
  expect(at(10)).toMatchObject({
    body: 0,
    cell: 0x20,
    position: [0x81_d5, 0, 0x2_83_1c]
  });
  expect(at(19)).toMatchObject({
    body: 9,
    cell: 0x20,
    position: [0x81_d5, 2700, 0x2_83_1c]
  });
});

test('rotation moves the whole stack both ways', () => {
  const stack = [103, 104, 135];
  const turned = (direction: 'forward' | 'backward') => {
    const outcome = rotate(carry(stack), held(stack), world, direction);
    return outcome.kind === 'done' ? outcome.carry.stack : null;
  };
  expect(turned('forward')).toEqual([104, 135, 103]);
  expect(turned('backward')).toEqual([135, 103, 104]);
  expect(rotate(carry([]), [], world, 'forward').kind).toBe('refused');
  expect(
    rotate(carry(stack, { scroll: -1 }), held(stack), world, 'forward').kind
  ).toBe('refused');
});

test('a direct Drop needs contact and places the object below the eye', () => {
  const stack = [104, 103, 135];
  expect(
    drop(carry(stack), held(stack), world, null, { ...place, contact: false })
  ).toEqual({ kind: 'refused' });
  expect(drop(carry([]), [], world, null, place)).toEqual({ kind: 'refused' });
  const outcome = drop(carry(stack), held(stack), world, null, place);
  if (outcome.kind !== 'done') {
    throw new Error('refused');
  }
  expect(outcome.carry.stack).toEqual([103, 135]);
  expect(outcome.carry.scroll).toBe(16);
  expect(outcome.closes).toBe(104);
  expect(outcome.residents.find(r => r.slot === 104)).toMatchObject({
    association: 0,
    bodyOffset: 60,
    cell: 98,
    group: 3,
    position: [165_773_321, 0, 70_289_576],
    state: 0x04,
    zone: 4
  });
});

test('an interior Drop takes the region as its association, and refuses outside the list', () => {
  const stack = [104];
  const inside = drop(carry(stack), held(stack), world, null, {
    ...place,
    interior: { associations: [1, 3], region: 3 }
  });
  expect(inside.kind === 'done' && inside.residents[0]!.association).toBe(3);
  expect(
    drop(carry(stack), held(stack), world, null, {
      ...place,
      interior: { associations: [1], region: 3 }
    })
  ).toEqual({ kind: 'refused', message: 9 });
});

test('a supported Drop ranks supply against demand and sits on the support top', () => {
  const desk = resident(240, 14, {
    association: 3,
    body: 1,
    cell: 96,
    position: [165_642_146, 0, 70_288_932],
    zone: 4
  });
  const card = [resident(104, 0x84, { bodyOffset: 0x78 })];
  const supported = drop(
    carry([104]),
    [...card, desk],
    world,
    near(240, 6),
    place
  );
  if (supported.kind !== 'done') {
    throw new Error('refused');
  }
  expect(supported.residents[0]).toMatchObject({
    association: 3,
    body: 1,
    bodyOffset: 60,
    cell: 96,
    position: [165_642_146, 38, 70_288_932]
  });
  // Exponent 7 is past the support: the Drop is direct.
  const direct = drop(
    carry([104]),
    [...card, desk],
    world,
    near(240, 7),
    place
  );
  expect(direct.kind === 'done' && direct.residents[0]!.position[1]).toBe(0);
  // Y25 tops out at the eye; Y26 is above it.
  const raised = (y: number) =>
    drop(
      carry([104]),
      [...card, { ...desk, position: [desk.position[0], y, desk.position[2]] }],
      world,
      near(240, 6),
      place
    ).kind;
  expect(raised(25)).toBe('done');
  expect(raised(26)).toBe('refused');
  const unranked = (support: number, demand = 0x84) =>
    drop(
      carry([104]),
      [
        resident(104, demand, { bodyOffset: 0x78 }),
        { ...desk, state: support }
      ],
      world,
      near(240, 6),
      place
    );
  expect(unranked(0)).toEqual({ kind: 'refused', message: 9 });
  expect(unranked(14, 0x80)).toEqual({ kind: 'refused', message: 9 });
  expect(unranked(1, 0x8c)).toEqual({ kind: 'refused', message: 9 });
  // KEY A39 held lifts the rank test; KEY A38 does not.
  const keyed = (key: number) =>
    drop(
      carry([104]),
      [
        ...card,
        resident(key, 0x84, { bodyOffset: 0x78 }),
        { ...desk, state: 0 }
      ],
      world,
      near(240, 6),
      place
    ).kind;
  expect(keyed(39)).toBe('done');
  expect(keyed(38)).toBe('refused');
});

test('the BRIEFCASE keeps its overflow and returns it when taken again', () => {
  const stack = [108, ...Array.from({ length: 14 }, (_, i) => i + 1)];
  const dropped = drop(
    carry(stack, { capacity: 20 }),
    held(stack),
    world,
    null,
    place
  );
  if (dropped.kind !== 'done') {
    throw new Error('refused');
  }
  expect(dropped.message).toBe(1);
  expect(dropped.carry.capacity).toBe(10);
  expect(dropped.carry.stack).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(dropped.carry.stored).toEqual([10, 11, 12, 13, 14]);
  // Stored objects stay held.
  expect(dropped.residents.find(r => r.slot === 12)!.state).toBe(0x84);
  const retaken = take(
    { ...dropped.carry, scroll: 0 },
    dropped.residents,
    world,
    near(108),
    60
  );
  if (retaken.kind !== 'done') {
    throw new Error('refused');
  }
  expect(retaken.carry.stack).toEqual(stack);
  expect(retaken.carry.capacity).toBe(20);
  expect(retaken.carry.stored).toEqual([]);
});

test('the label scrolls one character a VBL and the gauge follows the count', () => {
  let state = carry([103, 135], {
    incoming: '    BUS PASS    ',
    label: '    TAXICARD    ',
    scroll: 16
  });
  state = stepCarriedLabel(state);
  expect(state.label).toBe('     TAXICARD   ');
  expect(state.scroll).toBe(15);
  for (let i = 0; i < 15; i += 1) {
    state = stepCarriedLabel(state);
  }
  expect(state).toMatchObject({ label: '    BUS PASS    ', scroll: 0 });
  let back = carry([104], {
    incoming: '    TAXICARD    ',
    label: '    BUS PASS    ',
    scroll: -16
  });
  for (let i = 0; i < 16; i += 1) {
    back = stepCarriedLabel(back);
  }
  expect(back.label).toBe('    TAXICARD    ');
  expect(inventoryGauge(carry([104, 103, 135]))).toBe(6);
  expect(inventoryGauge(carry([108, 1, 2], { capacity: 20 }))).toBe(3);
});

test('KEYs and TRANSPORTERs show their own letter or digit', () => {
  expect(carriedLabel(world, 38)).toBe('   DOOR KEY I   ');
  expect(carriedLabel(world, 64)).toBe(' TRANSPORTER 0  ');
});

for (const [slot, script] of [
  [216, 0x1c],
  [218, 0x73],
  [127, 0x18]
] as const) {
  test(`Take slot ${slot} requests pickup script $${script.toString(16)}`, () => {
    const outcome = take(carry([]), [resident(slot, 4)], world, near(slot), 60);
    expect(outcome).toMatchObject({ kind: 'done', script });
    expect(outcome).not.toHaveProperty('unported');
    expect(
      take(carry([]), [resident(slot, 4)], world, near(slot, 9), 60)
    ).toEqual({ kind: 'refused' });
  });
}
