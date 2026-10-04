import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { prepareTourcraftFrame } from '../src/dion/tourcraftPresentation.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord,
  readTourcraftSession
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { applyDionControl, dionControlCaptures } from './dion-controls.ts';
import { continueTourcraft } from './tourcraft-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});
const create = () => {
  const s = new TourcraftSession(content);
  return new Proxy(s, {
    get: (target, key) =>
      key === 'advance'
        ? (seconds: number) => {
            const state = target.advance(seconds);
            target.drainSound();
            return state;
          }
        : typeof Reflect.get(target, key, target) === 'function'
          ? Reflect.get(target, key, target).bind(target)
          : Reflect.get(target, key, target)
  });
};
const captures = dionControlCaptures(content.legacy, create);
expect(captures).toHaveLength(33);
for (const capture of captures) {
  test(`schema 2 ${capture.name} continues ordinary access and flight`, () => {
    const control = create();
    for (const op of capture.operations.slice(0, capture.index)) {
      applyDionControl(control, op);
    }
    expect(control.captureResume()).toEqual(capture.record);
    const encoded = encodeTourcraftRecord(
      content,
      capture.record,
      capture.name
    );
    const slot = new TourcraftSession(
      content,
      decodeTourcraftRecord(encoded, content).snapshot
    );
    const resumed = readTourcraftSession(
      { getItem: () => encoded, removeItem: () => {}, setItem: () => {} },
      content
    );
    expect(resumed.reason).toBeNull();
    const resume = resumed.session;
    expect(prepareTourcraftFrame(slot)).toEqual(prepareTourcraftFrame(control));
    expect(prepareTourcraftFrame(resume)).toEqual(
      prepareTourcraftFrame(control)
    );
    for (const op of capture.operations.slice(capture.index)) {
      for (const session of [control, slot, resume]) {
        applyDionControl(session, op);
        session.drainSound();
      }
      expect(slot.captureResume()).toEqual(control.captureResume());
      expect(resume.captureResume()).toEqual(control.captureResume());
    }
    continueTourcraft(control, op => {
      for (const session of [slot, resume]) {
        applyDionControl(session, op);
        session.drainSound();
      }
      if (op.kind === 'advance') {
        expect(slot.captureResume()).toEqual(control.captureResume());
        expect(resume.captureResume()).toEqual(control.captureResume());
      }
    });
    expect(slot.captureResume()).toEqual(control.captureResume());
    expect(resume.captureResume()).toEqual(control.captureResume());
    expect(prepareTourcraftFrame(slot)).toEqual(prepareTourcraftFrame(control));
    expect(control.snapshot.location).toBe(100);
  }, 60_000);
}
