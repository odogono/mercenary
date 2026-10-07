import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { drawDionPanel } from '../src/dion/panel.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { PANEL_TOP } from '../src/shell/panelPixels.ts';
import { frames, until } from './dion-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

/// The opening session once the logo has revealed, so input reaches play.
const opened = (): TourcraftSession => {
  const session = new TourcraftSession(content);
  until(session, () => session.snapshot.reveal === 0);
  return session;
};

/// How far the eye moves and the heading turns over a few frames of one Intent.
const travel = (running: boolean, intent: Partial<typeof IDLE>) => {
  const session = opened();
  if (running) {
    session.toggleRunning();
  }
  const { eye, heading } = session.snapshot;
  session.intent = { ...IDLE, ...intent, running: session.running };
  frames(session, 4);
  const after = session.snapshot;
  return {
    distance: Math.hypot(after.eye[0] - eye[0], after.eye[2] - eye[2]),
    turn: Math.abs(((after.heading - heading + 0x80_00) & 0xff_ff) - 0x80_00)
  };
};

describe('Mercenary III’s run mode (`$50F22`)', () => {
  test('walks 5/3 as far and turns 3/2 as fast, as R latches `$71CE` and `$71D2`', () => {
    const walked = travel(false, { walk: 1 });
    const ran = travel(true, { walk: 1 });
    expect(walked.distance).toBeGreaterThan(0);
    expect(ran.distance / walked.distance).toBeCloseTo(5 / 3, 1);
    const turned = travel(false, { turn: 1 });
    const spun = travel(true, { turn: 1 });
    expect(turned.turn).toBeGreaterThan(0);
    expect(spun.turn / turned.turn).toBeCloseTo(3 / 2, 1);
  });

  test('clears the run lamp’s plane 1 while running, and nothing else', () => {
    const session = opened();
    const walking = drawDionPanel(content.legacy.panel, session.panelView());
    session.toggleRunning();
    const running = drawDionPanel(content.legacy.panel, session.panelView());
    const changed: [number, number][] = [];
    walking.pixels.forEach((value, index) => {
      if (value !== running.pixels[index]) {
        expect(value & ~running.pixels[index]!).toBe(0b10);
        changed.push([index % 320, PANEL_TOP + Math.floor(index / 320)]);
      }
    });
    expect(changed).toHaveLength(5 * 7);
    expect(changed.every(([x]) => x >= 227 && x <= 231)).toBe(true);
    expect(changed.every(([, y]) => y >= 186 && y <= 192)).toBe(true);
  });

  test('keeps the toggle through a Save and a Resume', () => {
    const session = opened();
    session.toggleRunning();
    const record = decodeTourcraftRecord(
      encodeTourcraftRecord(content, session.captureResume(), 'METIS'),
      content
    );
    expect(new TourcraftSession(content, record.snapshot).running).toBe(true);
    session.toggleRunning();
    expect(session.running).toBe(false);
  });
});

describe('the panel controls’ cues', () => {
  test('say the TAXICARD opens, and its panel is open once Open has acted', () => {
    const session = opened();
    expect(session.headOpens).toBe(true);
    expect(session.documentOpen).toBe(false);
    session.press('activate');
    frames(session);
    expect(session.documentOpen).toBe(true);
  });
});
