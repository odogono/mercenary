import { describe, expect, test } from 'bun:test';

import { drawDionPanel } from '../src/dion/panel.ts';
import { encodeDionResume, readDionResume } from '../src/dion/resume.ts';
import {
  DION_STORAGE,
  decodeDionRecord,
  dionRecordIdentity,
  encodeDionRecord
} from '../src/dion/save.ts';
import { DionSession, dionPanelView } from '../src/dion/session.ts';
import {
  applyDionControl,
  dionControlCaptures,
  type DionControlOperation
} from './dion-controls.ts';
import { dionContent } from './dion-documents.ts';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
};
describe('restore-complete MIII Saves and Session Resume', () => {
  test('all 33 controls on six trajectories preserve the same future and full panel', async () => {
    const content = await dionContent();
    const captures = dionControlCaptures(content);
    expect(captures.length).toBe(33);
    for (const { index, name, operations, record } of captures) {
      // The control replays actual browser inputs from New Game; it is never restored.
      const uninterrupted = new DionSession(content);
      for (const operation of operations.slice(0, index)) {
        applyDionControl(uninterrupted, operation);
      }
      expect(uninterrupted.captureResume()).toEqual(record);
      const encoded = encodeDionRecord({
        identity: dionRecordIdentity(content),
        savedAt: '2026-10-01T00:00:00Z',
        schemaVersion: 1,
        snapshot: record,
        where: name
      });
      const saved = new DionSession(
        content,
        decodeDionRecord(encoded, dionRecordIdentity(content), content).snapshot
      );
      const storage = memory();
      storage.setItem(
        DION_STORAGE.resume,
        encodeDionResume(content, uninterrupted)
      );
      const resumed = readDionResume(storage, content).session;
      expect(
        drawDionPanel(content.panel, dionPanelView(saved.snapshot, content))
          .pixels
      ).toEqual(
        drawDionPanel(
          content.panel,
          dionPanelView(uninterrupted.snapshot, content)
        ).pixels
      );
      saved.intent = uninterrupted.intent;
      resumed.intent = uninterrupted.intent;
      const continuation: DionControlOperation[] = [
        ...operations.slice(index),
        ...Array.from({ length: 600 }, () => ({
          kind: 'advance' as const,
          seconds: 11 / 50
        }))
      ];
      for (const operation of continuation) {
        for (const session of [uninterrupted, saved, resumed]) {
          applyDionControl(session, operation);
        }
        expect(saved.snapshot).toEqual(uninterrupted.snapshot);
        expect(resumed.snapshot).toEqual(uninterrupted.snapshot);
      }
    }
  }, 30_000);
  test('rejects malformed state and other schema, Destination and baseline identities', async () => {
    const content = await dionContent();
    const s = new DionSession(content);
    const record = JSON.parse(encodeDionResume(content, s));
    const identity = dionRecordIdentity(content);
    for (const mutate of [
      (r: typeof record) => {
        r.identity.destination = 'other';
      },
      (r: typeof record) => {
        r.schemaVersion = 2;
      },
      (r: typeof record) => {
        r.snapshot.snapshot.taxi.progress = -1;
      },
      (r: typeof record) => {
        r.snapshot.snapshot.narrative.message.bar = [];
      },
      (r: typeof record) => {
        r.snapshot.snapshot.narrative.pc = 12;
      },
      (r: typeof record) => {
        r.snapshot.snapshot.tick = 100;
      }
    ]) {
      const bad = structuredClone(record);
      mutate(bad);
      expect(() =>
        decodeDionRecord(JSON.stringify(bad), identity, content)
      ).toThrow();
    }
  });
});
