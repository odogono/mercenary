import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import {
  detectorRate,
  electromagnet,
  initialDevices,
  locationCardLines,
  startFruitMachine,
  stepDetector,
  stepFruitMachine
} from '../src/dion/devices.ts';
import { drawDionPanel } from '../src/dion/panel.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { initialTourcraftResidents } from '../src/dion/tourcraftState.ts';
import { frames } from './dion-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

class DeviceSession extends TourcraftSession {
  collide() {
    this.cue('collision');
  }
  target(slot: number) {
    this.state = {
      ...this.state,
      candidate: { distance: 0, exponent: 0, slot }
    };
  }
  nearOre() {
    const e = this.state.tourcraft!;
    this.state = {
      ...this.state,
      tourcraft: {
        ...e,
        residents: e.residents.map(r =>
          r.slot === 127
            ? {
                ...r,
                association: 0,
                body: 0,
                bodyOffset: 60,
                cell: this.state.cell,
                group: 3,
                position: [this.state.eye[0], 0, this.state.eye[2]],
                zone: 0
              }
            : r
        )
      }
    };
  }
  machine() {
    const e = this.state.tourcraft!;
    this.state = {
      ...this.state,
      tourcraft: { ...e, devices: startFruitMachine(e.devices) }
    };
  }
  open(slot: number, steps = 0) {
    const e = this.state.tourcraft!;
    this.state = {
      ...this.state,
      card: false,
      reveal: steps,
      tourcraft: {
        ...e,
        head: {
          ...e.head,
          box: { from: slot, fromItem: null, steps, to: slot },
          open: { index: 0, item: 0, slot }
        }
      }
    };
  }
}

for (const slot of [103, 46]) {
  test(`mode-5 card ${slot} ignores keypad keys as the original dispatcher does`, () => {
    const session = new DeviceSession(content);
    session.open(slot);
    for (const action of ['plus', 'minus', 'star'] as const) {
      session.press(action);
      frames(session);
    }
    expect(session.drainNotes()).toEqual([]);
  });
}

test('ELECTROMAGNET + does not set its switch bit when no slot machine is running', () => {
  const session = new DeviceSession(content);
  session.open(131);
  session.press('plus');
  frames(session);
  expect(session.snapshot.tourcraft!.switches).toBe(0);
  expect(session.drainNotes()).toEqual([]);
});

test('PULVIN DETECTOR changes its ON/OFF field', () => {
  const session = new DeviceSession(content);
  session.open(149);
  const off = drawDionPanel(content.legacy.panel, session.panelView()).pixels;
  session.press('plus');
  frames(session);
  expect(session.snapshot.tourcraft!.switches).toBe(2);
  const on = drawDionPanel(content.legacy.panel, session.panelView()).pixels;
  expect(on.slice(39 * 320 + 144, 39 * 320 + 176)).not.toEqual(
    off.slice(39 * 320 + 144, 39 * 320 + 176)
  );
  expect(session.drainNotes()).toEqual([]);
  // The first command queues its click at the frame boundary; let it play.
  frames(session);
  session.drainSound();
  session.press('plus');
  frames(session);
  expect(
    session
      .drainSound()
      .flatMap(b => b.registers)
      .some(([r]) => r === 13)
  ).toBe(false);
  session.press('minus');
  frames(session);
  expect(session.snapshot.tourcraft!.switches).toBe(0);
  const again = drawDionPanel(content.legacy.panel, session.panelView()).pixels;
  expect(again.slice(39 * 320 + 144, 39 * 320 + 176)).toEqual(
    off.slice(39 * 320 + 144, 39 * 320 + 176)
  );
});

test('a switch lamp waits for the centre-box reveal to finish', () => {
  const session = new DeviceSession(content);
  session.open(149);
  session.press('plus');
  frames(session);
  const shown = session.panelView().centre;
  expect(shown.kind).toBe('panel');
  session.open(149, 16);
  const arriving = session.panelView().centre;
  expect(arriving.kind === 'panel' && arriving.to.pixels[15]).not.toEqual(
    shown.kind === 'panel' && shown.to.pixels[15]
  );
});

test('BUS PASS has its two recovered lines and A TO Z follows location without keys', () => {
  const session = new DeviceSession(content);
  session.open(103);
  let centre = session.panelView().centre;
  expect(centre.kind === 'panel' && centre.lines).toEqual([
    '   BUS    ',
    '   PASS   '
  ]);
  session.open(46);
  centre = session.panelView().centre;
  expect(centre.kind === 'panel' && centre.lines).toEqual([
    'TIMEWARP  ',
    'PRISON    '
  ]);
  expect(locationCardLines(content.head, 3, 0x60)).toEqual([
    'DOOBERRYS ',
    'SOLICITORS'
  ]);
  expect(locationCardLines(content.head, 3, 0)).toEqual([
    'METIS     ',
    'MOONBASE  '
  ]);
  expect(locationCardLines(content.head, 49, 0)).toEqual([
    '  OUT OF  ',
    '  RANGE   '
  ]);
});

test('ELECTROMAGNET stops only running reels and consumes the rotated source word', () => {
  const initial = initialDevices(content.head);
  expect(electromagnet(initial)).toBe(initial);
  const running = { ...initial, machine: { ...initial.machine, stage: 1 } };
  const stopped = electromagnet(running);
  expect(stopped.machine.stage).toBe(2);
  expect(stopped.machine.count).toBe(45);
  expect(stopped.randomWords[0]).toBe(0x72_9e);
  expect(stopped.randomCursor).toBe(1);
  const allStopped = electromagnet(electromagnet(stopped));
  expect(allStopped.machine.stage).toBe(4);
  expect(electromagnet(allStopped)).toBe(allStopped);
});

test('Space at the selected FRUIT MACHINE starts a paid game on foot', () => {
  const session = new DeviceSession(content);
  frames(session, 6);
  const cash = BigInt(session.snapshot.cash);
  session.target(146);
  session.throttleKey(57);
  expect(BigInt(session.snapshot.cash)).toBe(cash - 100_000_000n);
  expect(session.snapshot.tourcraft!.devices.machine.stage).toBe(1);
  expect(session.expandedFrameState().tokens?.get(0x99)).toEqual(
    session.snapshot.tourcraft!.devices.machine.reels
  );
  session.open(131);
  session.press('plus');
  frames(session);
  expect(session.snapshot.tourcraft!.devices.machine.stage).toBe(2);
  expect(session.snapshot.tourcraft!.switches).toBe(0);
});

test('fruit-machine reels stop automatically, pay matching pairs and enforce the signed credit limit', () => {
  let state = startFruitMachine(initialDevices(content.head));
  for (let i = 0; state.machine.stage !== 0 && i < 250; i++) {
    state = stepFruitMachine(state).state;
  }
  expect(state.machine.stage).toBe(0);
  const pair = {
    ...state,
    machine: { ...state.machine, credit: 0, reels: [35, 35, 36], stage: 4 }
  };
  let payout = stepFruitMachine(pair).state;
  expect(payout.machine.payout).toBe(3);
  for (let i = 0; i < 4; i++) {
    payout = stepFruitMachine(payout).state;
  }
  const paid = stepFruitMachine(payout);
  expect(paid.pays).toBe(true);
  expect(paid.state.machine.credit).toBe(65_535);
  expect(stepFruitMachine(paid.state).bankrupt).toBe(true);
  for (const [reels, expected] of [
    [[34, 34, 34], 50],
    [[35, 35, 35], 10],
    // A loss clears the stage without overwriting the retained payout word.
    [[34, 35, 34], pair.machine.payout]
  ] as const) {
    expect(
      stepFruitMachine({ ...pair, machine: { ...pair.machine, reels } }).state
        .machine.payout
    ).toBe(expected);
  }
});

test('detector requires held149, bit1 and ore on the current Body; 127 precedes114', () => {
  const eye = [1000, 63, 1000] as const;
  const residents = initialTourcraftResidents(content).map(r =>
    r.slot === 149
      ? { ...r, state: r.state | 128 }
      : r.slot === 127
        ? { ...r, bodyOffset: 60, position: [1000, 0, 1000] as const }
        : r
  );
  const rate = (rs = residents, bits = 2, body = 60) =>
    detectorRate(content.arithmetic, rs, bits, body, eye);
  expect(rate()).toBe(3);
  expect(rate(residents, 0)).toBe(0);
  expect(
    rate(
      residents.map(r => (r.slot === 149 ? { ...r, state: r.state & 127 } : r))
    )
  ).toBe(0);
  expect(rate(residents, 2, 100)).toBe(0);
  const distant = residents.map(r =>
    r.slot === 127 ? { ...r, position: [2_000_000, 0, 1000] as const } : r
  );
  expect(rate(distant)).toBeGreaterThan(rate());
  const fallback = residents.map(r =>
    r.slot === 127
      ? { ...r, bodyOffset: 116 }
      : r.slot === 114
        ? { ...r, bodyOffset: 60, position: [1000, 0, 1000] as const }
        : r
  );
  expect(rate(fallback)).toBe(3);
});

test('detector random/counter pauses for priority sound and survives the word wrap', () => {
  const initial = initialDevices(content.head);
  expect(stepDetector(initial, 0).state).toBe(initial);
  const busy = stepDetector({ ...initial, counter: 7, priority: 3 }, 3);
  expect(busy.beep).toBe(false);
  expect(busy.state.randomCursor).toBe(0);
  expect(busy.state.counter).toBe(7);
  expect(busy.state.priority).toBe(2);
  expect(stepDetector(initial, 3).beep).toBe(true);
  const wrapped = stepDetector({ ...initial, randomCursor: 511 }, 3);
  expect(wrapped.state.randomCursor).toBe(0);
});

test('a carried detector emits its recovered B envelope and resumes the same sound future', () => {
  const session = new DeviceSession(content);
  frames(session, 6);
  session.target(149);
  session.press('take');
  frames(session, 8);
  session.open(149);
  session.nearOre();
  session.drainSound();
  session.press('plus');
  frames(session, 3);
  expect(session.drainSound().flatMap(b => b.registers)).toContainEqual([
    11, 64
  ]);
  const restored = new TourcraftSession(
    content,
    decodeTourcraftRecord(
      encodeTourcraftRecord(content, session.captureResume(), 'detector'),
      content
    ).snapshot
  );
  for (let i = 0; i < 60; i++) {
    frames(session);
    frames(restored);
    expect(restored.drainSound()).toEqual(session.drainSound());
  }
  expect(restored.captureResume()).toEqual(session.captureResume());
  session.collide();
  expect(session.snapshot.tourcraft!.devices.priority).toBe(3);
  frames(session, 3);
  expect(session.snapshot.tourcraft!.collision.routine).toBe('idle');
  expect(session.drainSound().flatMap(b => b.registers)).toContainEqual([
    11, 64
  ]);
  session.press('minus');
  frames(session);
  session.drainSound();
  frames(session, 3);
  expect(session.drainSound().flatMap(b => b.registers)).not.toContainEqual([
    11, 64
  ]);
});

test('active machine, switch lamp and random future restore without reseeding', () => {
  const session = new DeviceSession(content);
  frames(session, 6);
  session.open(131);
  session.machine();
  session.press('plus');
  frames(session);
  session.drainSound();
  const restored = new TourcraftSession(
    content,
    decodeTourcraftRecord(
      encodeTourcraftRecord(content, session.captureResume(), 'devices'),
      content
    ).snapshot
  );
  expect(restored.panelView()).toEqual(session.panelView());
  for (let i = 0; i < 200; i++) {
    frames(session);
    frames(restored);
    expect(restored.drainSound()).toEqual(session.drainSound());
  }
  expect(restored.captureResume()).toEqual(session.captureResume());
  const encoded = JSON.parse(
    encodeTourcraftRecord(content, session.captureResume(), 'devices')
  );
  encoded.snapshot.snapshot.tourcraft.devices.randomCursor = 512;
  expect(() =>
    decodeTourcraftRecord(JSON.stringify(encoded), content)
  ).toThrow();
});
