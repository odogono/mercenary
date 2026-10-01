import { describe, expect, test } from 'bun:test';

import { DionSession } from '../src/dion/session.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { dionContent } from './dion-documents.ts';
import { boardOpeningTaxi, frames, press, until } from './dion-journey.ts';

describe('live METIS opening journeys', () => {
  for (const [destination, ride, endpoint, arrival] of [
    [0x60, 112, [0x09_df_80_80, 63, 0x04_30_80_00], true],
    [2, 507, [0x09_e1_80_00, 63, 0x04_2a_80_80], false]
  ] as const) {
    test(`plays to ${destination}, rejects early L, and exits at settled dwell`, async () => {
      const s = new DionSession(await dionContent());
      const balance = s.snapshot.cash;
      boardOpeningTaxi(s);
      press(s, 'plus');
      if (destination === 2) {
        press(s, 'plus');
      }
      const selected = s.snapshot.eye;
      frames(s, 100);
      expect(s.snapshot.eye).toEqual(selected);
      // Walking aboard changes no service coordinate; player yaw is retained through turns.
      s.intent = { ...IDLE, turn: -1, walk: 1 };
      frames(s, 3);
      s.intent = IDLE;
      const offset = (s.snapshot.heading - s.snapshot.taxi.heading) & 65_535;
      press(s, 'star');
      const start = s.snapshot.tick;
      frames(s, 10);
      press(s, 'leave');
      expect(s.snapshot.taxi.passenger).toBe(true);
      frames(s, ride - 11);
      expect(s.snapshot.tick - start).toBe(ride * 11);
      expect(s.snapshot.taxi.counter).toBe(35);
      expect(s.snapshot.taxi.destination).toBe(0);
      expect(s.snapshot.narrative.message.text === "WE'VE ARRIVED").toBe(
        arrival
      );
      expect((s.snapshot.heading - s.snapshot.taxi.heading) & 65_535).toBe(
        offset
      );
      frames(s, 21);
      expect(s.snapshot.taxi.counter).toBe(34);
      press(s, 'leave'); // counter 34 is tested before the service makes it dwell 2.
      expect(s.snapshot.taxi.passenger).toBe(true);
      expect(s.snapshot.taxi.counter).toBe(2);
      expect(s.snapshot.eye).toEqual(endpoint);
      frames(s, 3);
      expect(s.snapshot.taxi.passenger).toBe(true);
      press(s, 'leave');
      expect(s.snapshot.taxi.passenger).toBe(false);
      const heading = s.snapshot.heading;
      frames(s, 100);
      expect(s.snapshot.eye).toEqual(endpoint);
      expect(s.snapshot.heading).toBe(heading);
      expect(s.snapshot.card).toBe(true);
      expect(s.snapshot.cash).toBe(balance);
      press(s, 'star');
      until(s, () => s.snapshot.taxi.counter === 2);
      expect(s.snapshot.taxi.cell).toBe(s.snapshot.cell);
    });
  }
  test('refuses reveal input for 64 ticks, then permits a call with busy unrelated text', async () => {
    const s = new DionSession(await dionContent());
    until(s, () => s.snapshot.narrative.message.busy);
    press(s, 'activate');
    expect(s.snapshot.reveal).toBe(64);
    press(s, 'star');
    expect(s.snapshot.taxi.call).toBe(false);
    s.advance(53 / 50);
    expect(s.snapshot.reveal).toBe(0);
    expect(s.snapshot.narrative.message.busy).toBe(true);
    press(s, 'star');
    expect(s.snapshot.taxi.call).toBe(true);
  });
  test('arms ten admission passes and refuses the nearer prison occupant', async () => {
    const s = new DionSession(await dionContent());
    press(s, 'board');
    expect(s.snapshot.admission).toBe(9);
    expect(s.snapshot.candidate?.slot).toBe(10);
    frames(s, 9);
    expect(s.snapshot.admission).toBe(0);
    expect(s.snapshot.taxi.passenger).toBe(false);
  });
});

test('restores at every frame through taxi cell transitions and descent', async () => {
  const content = await dionContent();
  const session = new DionSession(content);
  boardOpeningTaxi(session);
  press(session, 'plus');
  press(session, 'plus');
  press(session, 'star');
  for (let frame = 0; frame < 530; frame += 1) {
    const restored = new DionSession(content, session.captureResume());
    frames(session);
    frames(restored);
    expect(restored.snapshot).toEqual(session.snapshot);
  }
}, 10_000);

test('preserves unconsumed B and retries the render-selected candidate for ten frames', async () => {
  const content = await dionContent();
  const session = new DionSession(content);
  press(session, 'activate');
  session.advance(64 / 50);
  press(session, 'star');
  until(session, () => session.snapshot.taxi.counter === 2);
  until(session, () =>
    [...session.snapshot.doors.values()].some(d => d.latch === 'open')
  );
  session.intent = { ...IDLE, walk: 1 };
  until(
    session,
    () => session.snapshot.eye[2] <= session.snapshot.taxi.position[2] + 400
  );
  session.press('board');
  const saved = new DionSession(content, session.captureResume());
  saved.intent = session.intent;
  frames(session);
  frames(saved);
  expect(session.snapshot.admission).toBe(9);
  expect(session.snapshot.taxi.passenger).toBe(false);
  const pending = new DionSession(content, session.captureResume());
  pending.intent = session.intent;
  let retries = 0;
  while (!session.snapshot.taxi.passenger && retries < 9) {
    frames(session);
    frames(saved);
    frames(pending);
    retries += 1;
  }
  expect(session.snapshot.taxi.passenger).toBe(true);
  expect(retries).toBeGreaterThan(0);
  expect(saved.snapshot).toEqual(session.snapshot);
  expect(pending.snapshot).toEqual(session.snapshot);
});

test('opens the prison door one unit per substep and latches after the extra step', async () => {
  const content = await dionContent();
  const original = new DionSession(content);
  const record = original.captureResume();
  const session = new DionSession(content, {
    ...record,
    snapshot: {
      ...record.snapshot,
      narrative: { ...record.snapshot.narrative, keyA: true, pc: null }
    }
  });
  frames(session, 17);
  expect([...session.snapshot.doors.values()][0]).toEqual({
    latch: 'moving',
    openUnits: 136
  });
  const saved = new DionSession(content, session.captureResume());
  frames(session);
  frames(saved);
  expect([...session.snapshot.doors.values()][0]).toEqual({
    latch: 'open',
    openUnits: 142
  });
  expect(saved.snapshot).toEqual(session.snapshot);
});

test('refuses exponent ten, then admits at exponent nine within the retry window', async () => {
  const content = await dionContent();
  const s = new DionSession(content);
  boardOpeningTaxi(s);
  const r = s.captureResume();
  const session = new DionSession(content, {
    ...r,
    snapshot: {
      ...r.snapshot,
      eye: [r.snapshot.eye[0], 63, r.snapshot.eye[2] - 1130],
      heading: 1536,
      taxi: { ...r.snapshot.taxi, call: true, passenger: false }
    }
  });
  expect(session.snapshot.candidate?.slot).toBe(16);
  expect(session.snapshot.candidate?.exponent).toBe(10);
  session.intent = { ...IDLE, walk: 1 };
  press(session, 'board');
  expect(session.snapshot.taxi.passenger).toBe(false);
  expect(session.snapshot.admission).toBe(9);
  const saved = new DionSession(content, session.captureResume());
  saved.intent = session.intent;
  for (let f = 0; f < 9 && !session.snapshot.taxi.passenger; f += 1) {
    frames(session);
    frames(saved);
  }
  expect(session.snapshot.taxi.passenger).toBe(true);
  expect(saved.snapshot).toEqual(session.snapshot);
});
