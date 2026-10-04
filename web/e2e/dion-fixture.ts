import { loadDionContent } from '../src/dion/content.ts';
import { frameRgba, planDionFrame } from '../src/dion/frame.ts';
import { PANEL_TOP, drawDionPanel, panelRgba } from '../src/dion/panel.ts';
import { encodeDionResume, readDionResume } from '../src/dion/resume.ts';
import {
  DION_STORAGE,
  decodeDionRecord,
  dionRecordIdentity
} from '../src/dion/save.ts';
import {
  DionSession,
  dionFrameState,
  dionPanelView
} from '../src/dion/session.ts';
import {
  applyDionControl,
  dionControlCaptures
} from '../test/dion-controls.ts';
import {
  boardOpeningTaxi,
  frames,
  press,
  until
} from '../test/dion-journey.ts';

const content = await loadDionContent(async pathname => {
  const response = await fetch(pathname);
  const text = await response.text();
  return { text, value: JSON.parse(text) };
});
let session = new DionSession(content);
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const context = canvas.getContext('2d')!;
const image = context.createImageData(320, 200);
const result = document.getElementById('result')!;
const draw = () => {
  frameRgba(
    planDionFrame(content.world, dionFrameState(session.snapshot)),
    image.data
  );
  panelRgba(
    drawDionPanel(content.panel, dionPanelView(session.snapshot, content)),
    image.data.subarray(PANEL_TOP * 320 * 4)
  );
  context.putImageData(image, 0, 0);
  const state = session.captureResume();
  result.textContent = JSON.stringify({
    cell: session.snapshot.cell,
    counter: session.snapshot.taxi.counter,
    eye: session.snapshot.eye,
    heading: session.snapshot.heading,
    tick: session.snapshot.tick
  });
  return state;
};
const stateText = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    typeof item === 'object' && item !== null && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
        )
      : item
  );
const api = {
  checkpoint: (name: string, spaceport = false) => {
    if (name === 'opening') {
      session = new DionSession(content);
    } else if (name === 'reveal') {
      press(session, 'activate');
      session.advance(16 / 50);
    } else if (name === 'boarding') {
      session = new DionSession(content);
      boardOpeningTaxi(session);
    } else if (name === 'selection') {
      press(session, 'plus');
      if (spaceport) {
        press(session, 'plus');
      }
    } else if (name === 'travel') {
      press(session, 'star');
      frames(session, 111);
    } else if (name === 'turn') {
      frames(session);
    } else if (name === 'arrival') {
      until(
        session,
        () =>
          session.snapshot.taxi.destination === 0 &&
          session.snapshot.taxi.counter === 2
      );
    } else if (name === 'exit') {
      press(session, 'leave');
    } else if (name === 'night') {
      until(session, () => !session.snapshot.day);
    } else {
      throw new Error('Unknown fixture checkpoint');
    }
    return draw();
  },
  pixels: () => Array.from(image.data),
  verifyPersistence: () => {
    const controls = dionControlCaptures(content);
    let comparisons = 0;
    for (const { index, name, operations, record } of controls) {
      const uninterrupted = new DionSession(content);
      for (const op of operations.slice(0, index)) {
        applyDionControl(uninterrupted, op);
      }
      const encoded = encodeDionResume(content, uninterrupted);
      const saved = new DionSession(
        content,
        decodeDionRecord(encoded, dionRecordIdentity(content), content).snapshot
      );
      localStorage.setItem(DION_STORAGE.resume, encoded);
      const resumed = readDionResume(localStorage, content).session;
      if (stateText(uninterrupted.captureResume()) !== stateText(record)) {
        throw new Error(`${name}: control differs`);
      }
      for (const restored of [saved, resumed]) {
        restored.intent = uninterrupted.intent;
        const panel = drawDionPanel(
          content.panel,
          dionPanelView(restored.snapshot, content)
        );
        const expected = drawDionPanel(
          content.panel,
          dionPanelView(uninterrupted.snapshot, content)
        );
        if (JSON.stringify(panel.pixels) !== JSON.stringify(expected.pixels)) {
          throw new Error(`${name}: panel differs`);
        }
      }
      const continuation = [
        ...operations.slice(index),
        ...Array.from({ length: 600 }, () => ({
          kind: 'advance' as const,
          seconds: 11 / 50
        }))
      ];
      for (const op of continuation) {
        for (const current of [uninterrupted, saved, resumed]) {
          applyDionControl(current, op);
        }
        const expected = stateText(uninterrupted.snapshot);
        for (const restored of [saved, resumed]) {
          if (stateText(restored.snapshot) !== expected) {
            throw new Error(`${name}: future differs`);
          }
          comparisons += 1;
        }
      }
    }
    return { comparisons, controls: controls.length };
  }
};
declare global {
  interface Window {
    dionFixture: typeof api;
  }
}
window.dionFixture = api;
draw();
canvas.dataset['state'] = 'ready';
