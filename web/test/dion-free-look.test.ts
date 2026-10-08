import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { dionControlActions } from '../src/dion/controls.ts';
import { dionPose } from '../src/dion/enhancedScene.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import {
  FREE_LOOK_LIMIT,
  FREE_LOOK_RATE,
  IDLE
} from '../src/gameCore/index.ts';
import { BrowserControlProfile } from '../src/shell/input.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

const profile = (session: TourcraftSession, extended = true) =>
  new BrowserControlProfile(
    dionControlActions({
      act: action => session.press(action),
      extendedControls: () => extended,
      passenger: () => session.aboard,
      recentreLook: () => session.recentreLook()
    })
  );

test('the right stick looks up and down on foot with Extended Controls enabled', () => {
  for (const direction of [-1, 1]) {
    const session = new TourcraftSession(content);
    const controls = profile(session);
    const level = session.snapshot.pitch;
    const pose = dionPose(session.expandedFrameState());
    controls.pollPads([
      { axes: [0, 0, 0, direction], buttons: [], mapping: 'standard' }
    ]);
    session.intent = controls.intent;
    expect(session.intent.look).toBe(-direction);
    session.advance(11 / 50);
    expect(session.snapshot.pitch).not.toBe(level);
    const looked = dionPose(session.expandedFrameState()).pitch - pose.pitch;
    expect(looked * -direction).toBeGreaterThan(0);
    expect(Math.abs(looked)).toBeCloseTo((FREE_LOOK_RATE * 11) / 50, 2);
    expect(session.planFrame().candidate).toEqual(session.snapshot.candidate);
  }
});

test('Free Look holds its tilt, stops at both limits and R3 recenters it', () => {
  const session = new TourcraftSession(content);
  const controls = profile(session);
  const level = session.snapshot.pitch;
  for (const direction of [-1, 1]) {
    controls.pollPads([
      { axes: [0, 0, 0, direction], buttons: [], mapping: 'standard' }
    ]);
    session.intent = controls.intent;
    session.advance(5);
    const tilted = session.snapshot.pitch;
    expect((tilted - level + 65_536) & 65_535).toBe(
      (direction * Math.round((FREE_LOOK_LIMIT * 1024) / (2 * Math.PI))) &
        65_535
    );
    controls.pollPads([]);
    session.intent = controls.intent;
    session.advance(11 / 50);
    expect(session.snapshot.pitch).toBe(tilted);
    controls.pollPads([
      {
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, (_, i) => ({
          pressed: i === 11,
          value: i === 11 ? 1 : 0
        })),
        mapping: 'standard'
      }
    ]);
    expect(session.snapshot.pitch).toBe(level);
    expect(session.expandedFrameState().pitch).toBe(level);
    controls.pollPads([]);
  }
});

test('Extended Controls off leaves the on-foot view level', () => {
  const session = new TourcraftSession(content);
  const controls = profile(session, false);
  const level = session.snapshot.pitch;
  controls.pollPads([
    { axes: [0, 0, 0, -1], buttons: [], mapping: 'standard' }
  ]);
  session.intent = controls.intent;
  session.advance(1);
  expect(session.snapshot.pitch).toBe(level);
});

test('Saves omit the look input and tilt while the live view stays tilted', () => {
  const session = new TourcraftSession(content);
  const twin = new TourcraftSession(content);
  session.intent = { ...IDLE, look: 1 };
  for (let i = 0; i < 3; i++) {
    session.advance(11 / 50);
    twin.advance(11 / 50);
    expect(session.captureResume()).toEqual(twin.captureResume());
  }
  const tilted = session.snapshot.pitch;
  expect(session.captureResume()).toEqual(twin.captureResume());
  const saved = decodeTourcraftRecord(
    encodeTourcraftRecord(content, session.captureResume(), 'METIS'),
    content
  );
  const restored = new TourcraftSession(content, saved.snapshot);
  expect(restored.expandedFrameState().pitch).toBe(twin.snapshot.pitch);
  expect(restored.intent.look).toBe(0);
  expect(session.snapshot.pitch).toBe(tilted);
  session.recentreLook();
  expect(session.snapshot).toEqual(twin.snapshot);
});

test('Free Look follows the simulation cadence at any browser step size', () => {
  const coarse = new TourcraftSession(content);
  const fine = new TourcraftSession(content);
  coarse.intent = fine.intent = { ...IDLE, look: 1 };
  coarse.advance(0.66);
  for (let i = 0; i < 66; i++) {
    fine.advance(0.01);
  }
  expect(fine.snapshot).toEqual(coarse.snapshot);
});

test('walking into another region centers Free Look', () => {
  const session = new TourcraftSession(content);
  session.intent = { ...IDLE, look: 1 };
  session.advance(11 / 50);
  expect(session.snapshot.pitch).not.toBe(511);
  const region = session.snapshot.region;
  session.intent = { ...IDLE, look: 1, walk: 1 };
  for (let i = 0; i < 200 && session.snapshot.region === region; i++) {
    session.advance(11 / 50);
  }
  expect(session.snapshot.region).not.toBe(region);
  expect(session.snapshot.pitch).toBe(511);
});
