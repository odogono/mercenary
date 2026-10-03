import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { boardOpeningTaxi, press, until } from './dion-journey.ts';
import { continueTourcraft } from './tourcraft-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

test('starts from the coherent expanded opening without relaunching the prison VM', () => {
  const session = new TourcraftSession(content);
  expect(session.snapshot.clock).toEqual({
    accumulator: 672,
    day: 0,
    seconds: 0
  });
  expect(session.snapshot.reveal).toBe(49);
  expect(session.snapshot.narrative).toMatchObject({
    pc: 0x6_ff_57,
    stack: [0x7_66_d5],
    wait: 29
  });
  expect(session.snapshot.sound.registers).toEqual([
    1, 0, 1, 0, 1, 0, 31, 254, 0, 0, 0, 0, 0, 0
  ]);
});

test('samples the passenger zone after each refreshed METIS cell binding', () => {
  const session = new TourcraftSession(content);
  boardOpeningTaxi(session);
  press(session, 'plus');
  press(session, 'plus');
  press(session, 'star');
  const crossings = new Map([
    [97, 0],
    [96, 2],
    [80, 6],
    [2, 2]
  ]);
  const seen = new Set<number>();
  let previousCell = session.snapshot.cell;
  for (let pass = 0; pass < 1000; pass++) {
    session.advance(11 / 50);
    const state = session.snapshot;
    if (state.cell !== previousCell && crossings.has(state.cell)) {
      expect(state.tourcraft!.playerZone).toBe(crossings.get(state.cell)!);
      expect(state.tourcraft!.residents.find(r => r.slot === 16)!.zone).toBe(
        crossings.get(state.cell)!
      );
      seen.add(state.cell);
    }
    previousCell = state.cell;
    if (state.taxi.counter === 2 && state.taxi.destination === 0) {
      break;
    }
  }
  expect([...seen]).toEqual([...crossings.keys()]);
});

test('continues the real spaceport taxi exit to a position-based TOURCRAFT admission', () => {
  const session = new TourcraftSession(content);
  boardOpeningTaxi(session);
  press(session, 'plus');
  press(session, 'plus');
  press(session, 'star');
  until(
    session,
    () =>
      session.snapshot.taxi.counter === 2 &&
      session.snapshot.taxi.destination === 0
  );
  press(session, 'leave');
  const target = content.gameplay.initial['residents'] as {
    position: number[];
    slot: number;
  }[];
  const resident = target.find(r => r.slot === 13)!;
  for (
    let frame = 0;
    frame < 2000 &&
    !(
      session.snapshot.candidate?.slot === 13 &&
      session.snapshot.candidate.exponent <= 9
    );
    frame++
  ) {
    const [x, , z] = session.snapshot.eye;
    const desired =
      (Math.atan2(resident.position[0]! - x, resident.position[2]! - z) *
        1024) /
        (2 * Math.PI) -
      512;
    const difference =
      ((((desired - session.snapshot.heading + 1536) % 1024) + 1024) % 1024) -
      512;
    session.intent = {
      ...IDLE,
      turn: Math.abs(difference) > 8 ? Math.sign(difference) : 0,
      walk: Math.abs(difference) <= 16 ? 1 : 0
    };
    session.advance(11 / 50);
  }
  session.intent = IDLE;
  expect(session.snapshot.candidate?.slot).toBe(13);
  press(session, 'board');
  until(session, () => session.snapshot.tourcraft?.flight !== null);
  const launchClock = session.snapshot.clock.seconds;
  // Independent original cell ledger from R7, not a modulo-wrapped browser path.
  const cells = [
    [73, 2],
    [79, 0x12],
    [82, 0x22],
    [85, 0x32],
    [87, 0x42],
    [88, 0x52],
    [90, 0x62],
    [91, 0x72],
    [92, 0x82],
    [93, 0x92],
    [94, 0xa2],
    [95, 0xd2],
    [788, 0],
    [811, 2],
    [927, 1]
  ];
  for (
    let pass = 0;
    pass < 1200 && session.snapshot.tourcraft!.flight!.mode !== 'foot';
    pass++
  ) {
    session.advance(11 / 50);
    const state = session.snapshot,
      f = state.tourcraft!.flight!;
    if (f.mode !== 'space') {
      expect(state.cell, `cell at ${f.frameWord}`).toBe(
        cells.find(([last]) => f.frameWord <= last!)![1]!
      );
      const residence = state.tourcraft!.residents.find(r => r.slot === 13)!;
      expect(residence.yaw).toBe(
        f.mode === 'foot' ? 94 : f.body === 100 ? 94 : 127
      );
      expect(residence.group).toBe(23);
    }
    const taxi = state.tourcraft!.residents.find(r => r.slot === 16)!;
    expect(taxi.position).toEqual(state.taxi.position);
    expect(taxi.yaw).toBe((state.taxi.heading >>> 2) & 255);
    expect(taxi.group).toBe(0);
  }
  expect(session.snapshot.clock.seconds - launchClock).toBe(13_832);
  expect(session.snapshot.location).toBe(100);
  expect(session.snapshot.cell).toBe(1);
  expect(session.snapshot.cash).toBe('005100900000');
  expect(session.snapshot.heading).toBe(0xfd_79);
  expect(session.snapshot.tourcraft!.flight!.nextAction).toBe(134);
  expect(
    session.snapshot.tourcraft!.residents.find(r => r.slot === 13)
  ).toMatchObject({
    bodyOffset: 100,
    cell: 1,
    group: 23,
    position: [0x0a_b2_93_c2, 0, 0x06_23_8b_ef],
    yaw: 94,
    zone: 8
  });
  expect(session.snapshot.taxi).toMatchObject({
    cell: 2,
    counter: 0,
    heading: 768,
    position: [179_518_464, 25, 102_989_952],
    progress: 48_128,
    routeIndex: 0
  });
  expect(session.snapshot.eye).toEqual([0x0a_b2_93_c2, 63, 0x06_23_8b_ef]);
  for (const action of ['star', 'board'] as const) {
    press(session, action);
    expect(session.snapshot.taxi.call).toBe(false);
    expect(session.snapshot.taxi.passenger).toBe(false);
  }
});

// These are explicitly perturbed guard probes of the ordinary approach checkpoint,
// matching R6's controls; they are not a synthetic route to the service.
test('eligibility precedes the cash longword guard and a busy bar drops its refusal', () => {
  const control = new TourcraftSession(content);
  boardOpeningTaxi(control);
  let near: ReturnType<TourcraftSession['captureResume']> | undefined;
  continueTourcraft(control, op => {
    if (
      op.kind === 'press' &&
      op.action === 'board' &&
      control.snapshot.candidate?.slot === 13
    ) {
      near = control.captureResume();
    }
  });
  expect(near).toBeDefined();
  for (const cash of ['000000000000', '000000000001']) {
    const record = structuredClone(near!);
    const session = new TourcraftSession(content, {
      ...record,
      snapshot: { ...record.snapshot, cash }
    });
    const serial = session.snapshot.narrative.message.serial;
    press(session, 'board');
    expect(session.snapshot.tourcraft!.armed).toBe(false);
    expect(session.snapshot.tourcraft!.flight).toBeNull();
    expect(session.snapshot.narrative.message.serial).toBe(serial + 1);
    const refused = session.snapshot.narrative.message.serial;
    expect(session.snapshot.narrative.message.busy).toBe(true);
    press(session, 'board');
    expect(session.snapshot.narrative.message.serial).toBe(refused);
    expect(session.snapshot.tourcraft!.armed).toBe(false);
  }
  const record = structuredClone(near!);
  const e = record.snapshot.tourcraft!;
  const session = new TourcraftSession(content, {
    ...record,
    snapshot: {
      ...record.snapshot,
      cash: '000000000000',
      tourcraft: {
        ...e,
        owners: {
          ...e.owners,
          candidate: { ...e.owners['candidate'], regionFlags: 0 }
        }
      }
    }
  });
  const serial = session.snapshot.narrative.message.serial;
  press(session, 'board');
  expect(session.snapshot.narrative.message.serial).toBe(serial);
  expect(session.snapshot.tourcraft!.armed).toBe(false);
});
