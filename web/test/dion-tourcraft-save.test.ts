import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { record } from '../src/dion/read.ts';
import type { DionResumeRecord } from '../src/dion/session.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { readTourcraftResume } from '../src/dion/tourcraftRestore.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { boardOpeningTaxi } from './dion-journey.ts';
import { continueTourcraft } from './tourcraft-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

const at = (value: unknown, ...path: string[]) =>
  path.reduce((v, key) => record(v, key)[key], value);
const change = (value: unknown, path: string[], key: string, next: unknown) => {
  record(at(value, ...path), key)[key] = next;
};
test('rejects contradictory progressed aliases and active reader/cursor custody before publication', () => {
  const opening = new TourcraftSession(content);
  opening.advance(11 / 50);
  opening.drainSound();
  for (const mutation of [
    (v: unknown) =>
      change(v, ['snapshot', 'tourcraft', 'owners', 'craft'], 'x', 123),
    (v: unknown) =>
      change(v, ['snapshot', 'tourcraft', 'owners', 'view'], 'eyeX', 456),
    (v: unknown) => change(v, ['snapshot'], 'day', !opening.snapshot.day),
    (v: unknown) => change(v, ['snapshot'], 'phase', 123),
    (v: unknown) =>
      change(v, ['snapshot', 'tourcraft', 'encounter'], 'programme', '0'),
    (v: unknown) => {
      change(v, ['snapshot', 'sound'], 'c', 'door_moving');
      change(v, ['snapshot', 'sound'], 'elapsed', 1);
    }
  ]) {
    const candidate = structuredClone(opening.captureResume());
    mutation(candidate);
    expect(() => readTourcraftResume(candidate, content)).toThrow();
  }
  boardOpeningTaxi(opening);
  opening.drainSound();
  let first: DionResumeRecord | null = null;
  continueTourcraft(opening, () => {
    if (first === null && opening.snapshot.tourcraft!.flight?.frameWord === 1) {
      first = structuredClone(opening.captureResume());
    }
  });
  expect(first).not.toBeNull();
  for (const mutation of [
    (v: unknown) => change(v, ['snapshot', 'taxi'], 'passenger', true),
    (v: unknown) =>
      change(v, ['snapshot', 'tourcraft', 'flight'], 'mode', ['surface']),
    (v: unknown) => change(v, ['snapshot'], 'frameCounter', 65_000),
    (v: unknown) =>
      change(v, ['snapshot', 'tourcraft', 'flight'], 'nextAction', 134),
    (v: unknown) =>
      change(v, ['snapshot', 'tourcraft', 'flight', 'craft'], 'x', 123),
    (v: unknown) => {
      change(v, ['snapshot'], 'heading', 123);
      change(v, ['snapshot', 'tourcraft', 'owners', 'view'], 'yaw', 123);
    },
    (v: unknown) => {
      change(v, ['snapshot'], 'pitch', 123);
      change(v, ['snapshot', 'tourcraft', 'owners', 'view'], 'pitch', 123);
    },
    (v: unknown) => {
      const eye = at(v, 'snapshot', 'eye') as number[];
      eye[0] = 123;
      change(v, ['snapshot', 'tourcraft', 'owners', 'view'], 'eyeX', 123);
    }
  ]) {
    const candidate = structuredClone(first);
    mutation(candidate);
    expect(() => readTourcraftResume(candidate, content)).toThrow();
  }
});
test('expanded opening round trips without refreshing its saved candidate or VM', () => {
  const control = new TourcraftSession(content);
  for (let tick = 0; tick < 10; tick++) {
    control.advance(1 / 50);
    control.drainSound();
    const encoded = encodeTourcraftRecord(
      content,
      control.captureResume(),
      'METIS'
    );
    const restored = new TourcraftSession(
      content,
      decodeTourcraftRecord(encoded, content).snapshot
    );
    expect(restored.captureResume()).toEqual(control.captureResume());
    expect(restored.planFrame()).toEqual(control.planFrame());
  }
});
test('a Save during the opening reveal keeps refusing Enter until the logo arrives', () => {
  const control = new TourcraftSession(content);
  control.advance(22 / 50);
  const restored = new TourcraftSession(
    content,
    decodeTourcraftRecord(
      encodeTourcraftRecord(content, control.captureResume(), 'METIS'),
      content
    ).snapshot
  );
  for (const opens of [false, false, true]) {
    for (const session of [control, restored]) {
      session.press('activate');
      session.advance(11 / 50);
      expect(session.snapshot.card).toBe(opens);
    }
    expect(restored.captureResume()).toEqual(control.captureResume());
    expect(restored.panelView()).toEqual(control.panelView());
  }
});

test('refuses prototype, foreign references, extension keys and phase inconsistency', () => {
  const session = new TourcraftSession(content);
  const encoded = encodeTourcraftRecord(
    content,
    session.captureResume(),
    'METIS'
  );
  type Encoded = {
    schemaVersion: number;
    snapshot: {
      remainder: number;
      snapshot: {
        narrative: { pc: { next: number } };
        tourcraft: Record<string, unknown>;
      };
    };
  };
  for (const change of [
    (v: Encoded) => (v.schemaVersion = 1),
    (v: Encoded) => (v.snapshot.snapshot.narrative.pc.next = 99_999),
    (v: Encoded) => (v.snapshot.snapshot.tourcraft.unrecognised = 0),
    (v: Encoded) => (v.snapshot.remainder = 0.02),
    (v: Encoded) => (v.snapshot.snapshot.tourcraft.faceSelection = 'base')
  ]) {
    const value = JSON.parse(encoded);
    change(value);
    expect(() =>
      decodeTourcraftRecord(JSON.stringify(value), content)
    ).toThrow();
  }
});

// Synthetic scheduler/clock boundary controls, not a naturally timed boarding
// witness. The raw signed timer bits and fractional tick remain independent.
test('restores signed timer boundaries and a partial tick before midnight rollover', () => {
  const seed = new TourcraftSession(content);
  seed.advance(11 / 50);
  seed.drainSound();
  for (const timerBits of [1, 0, 65_535, 32_768, 32_767]) {
    const record = structuredClone(seed.captureResume());
    const control = new TourcraftSession(content, {
      ...record,
      remainder: 0.01,
      snapshot: {
        ...record.snapshot,
        clock: { accumulator: 32, day: 7, seconds: 86_399 },
        narrative: {
          ...record.snapshot.narrative,
          timedTarget: 0x7_5a_16,
          timerBits
        } as typeof record.snapshot.narrative
      }
    });
    const restored = new TourcraftSession(
      content,
      decodeTourcraftRecord(
        encodeTourcraftRecord(content, control.captureResume(), 'midnight'),
        content
      ).snapshot
    );
    expect(restored.captureResume()).toEqual(control.captureResume());
    for (let tick = 0; tick < 50; tick++) {
      control.advance(tick === 0 ? 0.01 : 0.02);
      restored.advance(tick === 0 ? 0.01 : 0.02);
      expect(restored.drainSound()).toEqual(control.drainSound());
      expect(restored.captureResume()).toEqual(control.captureResume());
      if (tick === 0) {
        expect(control.snapshot.clock).toEqual({
          accumulator: 1600,
          day: 8,
          seconds: 0
        });
      }
    }
  }
});
