import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { dionControlActions } from '../src/dion/controls.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { TourcraftFlight } from '../src/dion/tourcraftFlight.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { BrowserControlProfile } from '../src/shell/input.ts';
import { frames, press, until } from './dion-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});
class EagleSession extends TourcraftSession {
  protected override admissionFlags(): number {
    return 0x40_00;
  }
  boardTaxi() {
    this.target(16);
    this.state = {
      ...this.state,
      admission: 10,
      taxi: { ...this.state.taxi, counter: 2 }
    };
    this.admit();
  }
  target(slot: number) {
    this.state = {
      ...this.state,
      candidate: { distance: 0, exponent: 0, slot },
      tourcraft: {
        ...this.state.tourcraft!,
        owners: {
          ...this.state.tourcraft!.owners,
          candidate: { regionFlags: 0x40_00 }
        }
      }
    };
  }
  supportedContact() {
    const e = this.state.tourcraft!,
      f = e.flight!;
    this.state = {
      ...this.state,
      tourcraft: {
        ...e,
        flight: { ...f, craft: { ...f.craft, contact: 63, y: 300 } }
      }
    };
  }
  phase(body: number, phase: number) {
    const e = this.state.tourcraft!;
    this.state = {
      ...this.state,
      tourcraft: {
        ...e,
        phases: e.phases.map((p, i) => (i === body / 4 ? phase : p))
      }
    };
  }
  arrive(body: number) {
    const e = this.state.tourcraft!,
      f = e.flight!;
    this.state = {
      ...this.state,
      tourcraft: { ...e, flight: { ...f, arrival: body } }
    };
  }
  descent() {
    const e = this.state.tourcraft!,
      f = e.flight!;
    this.state = {
      ...this.state,
      tourcraft: {
        ...e,
        flight: {
          ...f,
          craft: {
            ...f.craft,
            contact: 0,
            pitch: 768,
            speed: 0x8_10_00,
            throttle: 0x8_10_00,
            trig: { pitch: 768, yaw: 0 },
            x: 0,
            y: 100,
            z: 0
          }
        }
      }
    };
  }
}
const eagle = (key = true) => {
  const s = new EagleSession(content);
  if (key) {
    s.target(181);
    press(s, 'take');
  }
  s.target(3);
  press(s, 'board');
  return s;
};
const flight = (s: TourcraftSession) => s.snapshot.tourcraft!.flight;
const resident = (s: TourcraftSession) =>
  s.snapshot.tourcraft!.residents.find(r => r.slot === 3)!;
test('boarding centers Free Look and a tilted view after leaving never tilts the parked craft', () => {
  const s = new EagleSession(content);
  s.target(181);
  press(s, 'take');
  s.intent = { ...IDLE, look: 1 };
  frames(s, 2);
  expect(s.snapshot.pitch).not.toBe(511);
  s.target(3);
  press(s, 'board');
  expect(s.snapshot.pitch).toBe(flight(s)!.craft.pitch);
  frames(s);
  expect(s.snapshot.pitch).toBe(flight(s)!.craft.pitch);
  press(s, 'leave');
  const parked = flight(s)!.craft;
  frames(s, 2);
  expect(s.snapshot.pitch).not.toBe(parked.pitch);
  expect(flight(s)!.craft.pitch).toBe(parked.pitch);
  expect(flight(s)!.craft.trig.pitch).toBe(parked.pitch);
  const restored = new TourcraftSession(content, s.captureResume());
  expect(restored.snapshot.pitch).toBe(parked.pitch);
  expect(restored.expandedFrameState().pitch).toBe(parked.pitch);
});
test('the right stick pitches EAGLE through the browser Control Profile', () => {
  const s = eagle();
  const controls = new BrowserControlProfile(
    dionControlActions({
      act: action => s.press(action),
      extendedControls: () => false,
      passenger: () => s.aboard
    })
  );
  const before = flight(s)!.craft.pitch;
  controls.pollPads([{ axes: [0, 0, 0, 1], buttons: [], mapping: 'standard' }]);
  s.intent = controls.intent;
  expect(s.intent.pitch).toBe(1);
  expect(s.intent.walk).toBe(0);
  s.throttleKey(11);
  frames(s, 12);
  expect(flight(s)!.craft.pitch).not.toBe(before);
  controls.pollPads([
    { axes: [0, 0, 0, -1], buttons: [], mapping: 'standard' }
  ]);
  s.intent = controls.intent;
  const raised = flight(s)!.craft.pitch;
  frames(s, 2);
  expect(flight(s)!.craft.pitch).toBeGreaterThan(raised);
});
test('Board requires KEY181 and stages EAGLE in VOID without consuming the key', () => {
  expect(flight(eagle(false))).toBeNull();
  const s = eagle();
  expect(flight(s)).toMatchObject({
    craft: { contact: 63 },
    mode: 'surface',
    pilot: 'eagle'
  });
  expect(resident(s).bodyOffset).toBe(120);
  expect(s.snapshot.tourcraft!.carry.stack).toContain(181);
});
test('Leave places EAGLE at its current pose, and it can be boarded again', () => {
  const s = eagle(),
    c = flight(s)!.craft;
  press(s, 'leave');
  expect(flight(s)?.mode).toBe('foot');
  expect(resident(s)).toMatchObject({
    bodyOffset: 60,
    position: [c.x, c.y - 63, c.z],
    yaw: (c.yaw >>> 2) & 255
  });
  s.target(3);
  press(s, 'board');
  expect(flight(s)?.mode).toBe('surface');
});
test('manual throttle, pitch and yaw fly EAGLE; airborne Leave refuses', () => {
  const s = eagle(),
    before = flight(s)!.craft;
  s.throttleKey(11);
  s.intent = { ...IDLE, pitch: 1, turn: 1 };
  frames(s, 12);
  expect(flight(s)!.craft.pitch).not.toBe(before.pitch);
  expect(flight(s)!.craft.yaw).not.toBe(before.yaw);
  expect(flight(s)!.craft.y).toBeGreaterThan(63);
  expect(flight(s)!.craft.contact).toBe(0);
  press(s, 'leave');
  expect(flight(s)?.mode).toBe('surface');
});
test('hard touchdown stops and disembarks EAGLE', () => {
  const s = eagle();
  s.descent();
  frames(s);
  expect(flight(s)).toMatchObject({
    craft: { contact: 63, y: 63 },
    mode: 'foot'
  });
  expect(resident(s).bodyOffset).toBe(60);
});
test('midflight Save retains raw craft words and produces the same future', () => {
  const s = eagle();
  s.throttleKey(10);
  s.intent = { ...IDLE, pitch: 1, turn: -1 };
  frames(s, 10);
  const saved = decodeTourcraftRecord(
    encodeTourcraftRecord(content, s.captureResume(), 'METIS · EAGLE'),
    content
  );
  const restored = new TourcraftSession(content, saved.snapshot);
  expect(flight(restored)).toEqual(flight(s));
  frames(s, 10);
  frames(restored, 10);
  expect(restored.captureResume()).toEqual(s.captureResume());
});

const restore = (s: TourcraftSession) =>
  new TourcraftSession(
    content,
    decodeTourcraftRecord(
      encodeTourcraftRecord(content, s.captureResume(), 'EAGLE'),
      content
    ).snapshot
  );

test('ground launch is inert; airborne launch reaches space and preserves a saved future', () => {
  const s = eagle();
  s.launchCraft();
  expect(flight(s)!.craft.swing).toBe(false);
  s.throttleKey(11);
  s.intent = { ...IDLE, pitch: 1 };
  frames(s, 10);
  s.intent = IDLE;
  s.launchCraft();
  expect(flight(s)!.craft.swing).toBe(true);
  // A key change is itself a Save boundary, before the next numeric pass.
  expect(flight(restore(s))).toEqual(flight(s));
  for (let i = 0; i < 1000 && flight(s)!.mode !== 'space'; i++) {
    frames(s);
    s.drainSound();
  }
  expect(flight(s)!.mode).toBe('space');
  expect(s.snapshot.location).toBe(65_535);
  const resumed = restore(s);
  frames(s, 5);
  frames(resumed, 5);
  expect(resumed.captureResume()).toEqual(s.captureResume());
});

test('manual arrival binds promoted Bodies and refuses unpromoted content with a note', () => {
  const s = eagle();
  s.throttleKey(11);
  s.intent = { ...IDLE, pitch: 1 };
  frames(s, 10);
  s.intent = IDLE;
  s.launchCraft();
  for (let i = 0; i < 1000 && flight(s)!.mode !== 'space'; i++) {
    frames(s);
    s.drainSound();
  }
  const unpromoted = content.system.bodies.find(
    b => ![0, 60, 100].includes(b.offset)
  )!.offset;
  s.arrive(unpromoted);
  expect(flight(restore(s))!.arrival).toBe(unpromoted);
  frames(s);
  expect(flight(s)!.mode).toBe('space');
  expect(s.drainNotes()).toContain(
    `Body ${unpromoted} has no promoted content`
  );
  s.arrive(100);
  frames(s);
  expect(flight(s)).toMatchObject({
    arrival: null,
    body: 100,
    mode: 'surface'
  });
  expect(s.snapshot.location).toBe(100);
  expect(flight(restore(s))).toEqual(flight(s));
});

test('Leave and hard touchdown Saves retain placed EAGLE while the player walks away', () => {
  for (const hard of [false, true]) {
    const s = eagle();
    if (hard) {
      s.descent();
      frames(s);
    } else {
      press(s, 'leave');
    }
    const placed = resident(s);
    s.intent = { ...IDLE, walk: 1 };
    frames(s, 4);
    expect(resident(s)).toEqual(placed);
    expect(resident(restore(s))).toEqual(placed);
  }
});

test('firing and hostile encounters are inert and named in the Shell Console notes', () => {
  const s = eagle();
  expect(s.drainNotes()).toContain('EAGLE hostile encounters');
  const before = s.snapshot.tourcraft!.encounter;
  s.fire();
  s.fire();
  frames(s, 3);
  expect(s.drainNotes()).toEqual(['EAGLE firing']);
  expect(s.snapshot.tourcraft!.encounter.actors).toEqual(before.actors);
});

test('after leaving EAGLE, taxi and TOURCRAFT boarding keep Saves valid', () => {
  for (const taxi of [true, false]) {
    const s = eagle();
    press(s, 'leave');
    const placed = resident(s);
    if (taxi) {
      s.boardTaxi();
      frames(s);
    } else {
      s.target(13);
      press(s, 'board');
    }
    expect(s.snapshot.tourcraft!.flight).toBeNull();
    expect(resident(restore(s))).toEqual(placed);
  }
});

test('refused Board while piloting keeps the flight counter and Save valid', () => {
  const s = eagle();
  frames(s, 2);
  s.target(3);
  press(s, 'board');
  expect(flight(s)!.frameWord).toBe(3);
  expect(flight(restore(s))).toEqual(flight(s));
});

test('manual arrival subtracts the destination Body Rotation', () => {
  const s = eagle();
  s.throttleKey(11);
  s.intent = { ...IDLE, pitch: 1 };
  frames(s, 10);
  s.intent = IDLE;
  s.launchCraft();
  for (let i = 0; i < 1000 && flight(s)!.mode !== 'space'; i++) {
    frames(s);
    s.drainSound();
  }
  const unturned = new EagleSession(content, s.captureResume());
  s.phase(100, 0x01_00_00_00);
  unturned.phase(100, 0);
  s.arrive(100);
  unturned.arrive(100);
  frames(s);
  frames(unturned);
  // One quarter-turn shifts longitude by 256 Body Coordinate Steps, wrapped in 28 bits.
  expect((flight(unturned)!.craft.x - flight(s)!.craft.x) & 0x0f_ff_ff_ff).toBe(
    0x04_00_00_00
  );
  expect(flight(s)!.craft.z).toBe(flight(unturned)!.craft.z);
});

test('Leave preserves the eye height when EAGLE rests on a raised support', () => {
  const s = eagle();
  s.supportedContact();
  press(s, 'leave');
  expect(s.snapshot.eye[1]).toBe(300);
  expect(resident(s).position[1]).toBe(237);
  expect(restore(s).snapshot.eye[1]).toBe(300);
});

test('manual Save refuses unknown pilots, malformed arrivals and contradictory custody', () => {
  const s = eagle();
  for (const mutate of [
    (v: ReturnType<typeof s.captureResume>) => {
      Object.assign(v.snapshot.tourcraft!.flight!, { pilot: ['eagle'] });
    },
    (v: ReturnType<typeof s.captureResume>) => {
      Object.assign(v.snapshot.tourcraft!.flight!, { arrival: '100' });
    },
    (v: ReturnType<typeof s.captureResume>) => {
      Object.assign(
        v.snapshot.tourcraft!.residents.find(r => r.slot === 3)!,
        { bodyOffset: 60 }
      );
    }
  ]) {
    const record = s.captureResume();
    mutate(record);
    expect(() => new TourcraftSession(content, record)).toThrow();
  }
});

test('dropping KEY181 aboard on the ground makes the next Board refuse', () => {
  const s = eagle();
  // `$55794` refuses a Drop while the Take's label still scrolls, a tick-counted rule that
  // outlasts the EAGLE's four-tick frames.
  until(s, () => s.snapshot.tourcraft!.carry.scroll === 0);
  press(s, 'drop');
  press(s, 'leave');
  expect(s.snapshot.tourcraft!.carry.stack).not.toContain(181);
  s.target(3);
  press(s, 'board');
  expect(flight(s)!.mode).toBe('foot');
});

test('fire held before boarding is noted when EAGLE becomes occupied', () => {
  const s = new EagleSession(content);
  s.target(181);
  press(s, 'take');
  s.fire();
  s.target(3);
  press(s, 'board');
  s.fire();
  expect(s.drainNotes()).toContain('EAGLE firing');
});

test('EAGLE flight runs a frame every four ticks, and on foot every eleven (ADR 0058)', () => {
  const s = eagle();
  expect(s.snapshot.tourcraft!.frameTicks).toBe(0);
  let frame = s.snapshot.frame;
  s.advance(1);
  expect(s.snapshot.frame - frame).toBe(12);
  expect(s.snapshot.tourcraft!.frameTicks).toBe(2);
  // Leave ends the next four-tick frame; the frames after it are eleven.
  s.press('leave');
  s.advance(2 / 50);
  expect(flight(s)!.mode).toBe('foot');
  frame = s.snapshot.frame;
  s.advance(1);
  expect(s.snapshot.frame - frame).toBe(4);
  expect(s.snapshot.tourcraft!.frameTicks).toBe(6);
});

test('a second of held stick aboard EAGLE is twelve craft passes', () => {
  const s = eagle();
  s.throttleKey(11);
  s.intent = { ...IDLE, pitch: 1, turn: 1 };
  const passes = new TourcraftFlight(content, flight(s)!);
  s.advance(1);
  for (let pass = 0; pass < 12; pass += 1) {
    passes.frame(2 | 8);
  }
  expect(flight(s)!.craft).toEqual(passes.state.craft);
});

test('a Save between EAGLE frames keeps the phase and the same future', () => {
  const s = eagle();
  s.throttleKey(10);
  s.intent = { ...IDLE, turn: -1 };
  s.advance(7 / 50);
  expect(s.snapshot.tourcraft!.frameTicks).toBe(3);
  const restored = restore(s);
  restored.intent = s.intent;
  expect(restored.snapshot.tourcraft!.frameTicks).toBe(3);
  for (const session of [s, restored]) {
    session.advance(1 / 50);
    session.press('leave');
    session.advance(1);
  }
  expect(restored.captureResume()).toEqual(s.captureResume());
});

test('a record from before the EAGLE cadence restores at eleven ticks a frame', () => {
  const s = new EagleSession(content);
  frames(s, 3);
  s.advance(5 / 50);
  const record = structuredClone(s.captureResume());
  delete (record.snapshot.tourcraft as { frameTicks?: number }).frameTicks;
  const restored = new TourcraftSession(content, record);
  expect(restored.snapshot.tourcraft!.frameTicks).toBe(5);
  expect(restored.captureResume()).toEqual(s.captureResume());
});

test('a Save refuses a phase its cadence or frame count contradicts', () => {
  const s = eagle();
  s.advance(6 / 50);
  for (const mutate of [
    (v: ReturnType<typeof s.captureResume>) => {
      Object.assign(v.snapshot.tourcraft!, { frameTicks: 4 });
    },
    (v: ReturnType<typeof s.captureResume>) => {
      Object.assign(v.snapshot, { frame: v.snapshot.frame + 1 });
    },
    (v: ReturnType<typeof s.captureResume>) => {
      delete (v.snapshot.tourcraft as { frameTicks?: number }).frameTicks;
    }
  ]) {
    const record = structuredClone(s.captureResume());
    mutate(record);
    expect(() => new TourcraftSession(content, record)).toThrow();
  }
});
