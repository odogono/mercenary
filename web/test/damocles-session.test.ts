import { describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DAMOCLES_RESUME_STORAGE_KEY,
  readDamoclesResume,
  writeDamoclesResume,
  type ResumeStorage
} from '../src/damocles/resume.ts';
import { damoclesSaveIdentity } from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { intent } from '../src/gameCore/index.ts';
import { titleStorageKeys } from '../src/shell/title.ts';

const content = async (): Promise<DamoclesContent> => {
  const [catalogue, presentation] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
  ]);
  const parsed = parseCatalogue(catalogue);
  const doc = readErisPresentation(presentation);
  return { catalogue: parsed, doc, surface: erisSurfaceFrom(parsed, doc) };
};

const atSpaceport = (
  loaded: DamoclesContent,
  x: number,
  z: number,
  heading = 0
): DamoclesSession => {
  const entrance = loaded.surface.placements.find(
    placement => placement.id === loaded.doc.spaceportEntrance.instanceId
  )!;
  return new DamoclesSession(loaded, {
    elapsed: 0,
    pose: {
      heading,
      position: {
        x: entrance.position.x + x,
        y: loaded.doc.eye.heightUnits,
        z: entrance.position.z + z
      }
    }
  });
};

const memoryStorage = (): ResumeStorage & {
  readonly map: Map<string, string>;
} => {
  const map = new Map<string, string>();
  return {
    getItem: key => map.get(key) ?? null,
    map,
    removeItem: key => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    }
  };
};

describe('the Damocles Gameplay Session', () => {
  test('opens on foot in the spaceport cell and hands out immutable snapshots', async () => {
    const session = new DamoclesSession(await content());
    const first = session.snapshot;
    expect(first.occupancy).toEqual({ kind: 'onFoot' });
    expect(first.cell).toEqual({ x: 7, z: 8 });
    expect(first.carried).toEqual([]);
    expect(first.elapsed).toBe(0);
    expect(session.advance(0)).toEqual(first);
    session.intent = intent({ walk: 1 });
    const later = session.advance(0.5);
    expect(first.pose.position).toEqual(first.pose.position);
    expect(later.elapsed).toBeCloseTo(0.5, 9);
    expect(later.pose.position).not.toEqual(first.pose.position);
    expect(later.pose.position.y).toBe(63);
  });

  test('steps long frames in bounded pieces', async () => {
    const stepped = new DamoclesSession(await content());
    stepped.intent = intent({ walk: 1 });
    const whole = stepped.advance(1);
    const pieces = new DamoclesSession(await content());
    pieces.intent = intent({ walk: 1 });
    for (let i = 0; i < 60; i += 1) {
      pieces.advance(1 / 60);
    }
    expect(whole.pose.position.z).toBeCloseTo(
      pieces.snapshot.pose.position.z,
      3
    );
    expect(whole.elapsed).toBeCloseTo(1, 9);
  });

  test('refuses swept facade and window steps while preserving free turning', async () => {
    const loaded = await content();
    const entrance = loaded.surface.placements.find(
      placement => placement.id === loaded.doc.spaceportEntrance.instanceId
    )!;
    const facade = atSpaceport(loaded, 1000, -1000);
    facade.intent = intent({ running: true, walk: 1 });
    const afterFacade = facade.advance(1);
    expect(afterFacade.pose.position.z).toBeLessThan(entrance.position.z - 760);

    const turning = atSpaceport(loaded, 1000, -765);
    turning.intent = intent({ turn: 1, walk: 1 });
    turning.advance(0.03);
    expect(turning.snapshot.pose.heading).toBeGreaterThan(0);
    expect(turning.snapshot.pose.position.z).toBeLessThan(
      entrance.position.z - 760
    );

    const window = atSpaceport(loaded, 700, 0, Math.PI / 2);
    window.intent = intent({ running: true, walk: 1 });
    window.advance(1);
    expect(window.snapshot.pose.position.x).toBeLessThan(
      entrance.position.x + 840
    );
  });

  test('latches on entry, stays latched on exit and passes through the doorway', async () => {
    const loaded = await content();
    const session = atSpaceport(loaded, 1400, -1300);
    expect(session.snapshot.entranceLatched).toBeFalse();
    session.intent = intent({ walk: 1 });
    session.advance(0.5);
    expect(session.snapshot.entranceLatched).toBeTrue();
    session.advance(2);
    const entrance = loaded.surface.placements.find(
      placement => placement.id === loaded.doc.spaceportEntrance.instanceId
    )!;
    expect(session.snapshot.pose.position.z).toBeGreaterThan(
      entrance.position.z - 760
    );
    session.intent = intent({ walk: -1 });
    session.advance(3);
    expect(session.snapshot.entranceLatched).toBeTrue();
  });

  test('derives the non-persisted latch from the opening pose', async () => {
    const loaded = await content();
    const fresh = new DamoclesSession(loaded);
    expect(fresh.snapshot.entranceLatched).toBeFalse();
    const inside = atSpaceport(loaded, 1400, -1000);
    expect(inside.snapshot.entranceLatched).toBeTrue();
    expect(
      atSpaceport(loaded, 1200, -1200).snapshot.entranceLatched
    ).toBeTrue();
    expect(
      atSpaceport(loaded, 1600, -1000).snapshot.entranceLatched
    ).toBeFalse();
    expect(
      atSpaceport(loaded, 1400, -200).snapshot.entranceLatched
    ).toBeFalse();

    const left = atSpaceport(loaded, 1400, -1300);
    left.intent = intent({ walk: 1 });
    left.advance(0.5);
    left.intent = intent({ walk: -1 });
    left.advance(0.5);
    expect(left.snapshot.entranceLatched).toBeTrue();
    expect(left.captureResume()).not.toHaveProperty('entranceLatched');
    const restored = new DamoclesSession(loaded, left.captureResume());
    expect(restored.snapshot.entranceLatched).toBeFalse();
  });

  test('resumes exactly where it left off, from its own key', async () => {
    const storage = memoryStorage();
    const loaded = await content();
    const identity = damoclesSaveIdentity(loaded.catalogue, loaded.doc);
    const session = new DamoclesSession(loaded);
    session.intent = intent({ turn: -1, walk: 1 });
    session.advance(3);
    writeDamoclesResume(storage, identity, session);
    expect([...storage.map.keys()]).toEqual([DAMOCLES_RESUME_STORAGE_KEY]);
    expect(DAMOCLES_RESUME_STORAGE_KEY).toBe(
      'mercenary.browser-shell.damocles.session-resume.v1'
    );
    expect(titleStorageKeys('targ').resume).toBe(
      'mercenary.browser-shell.session-resume.v1'
    );
    expect(titleStorageKeys('damocles').save(1)).toBe(
      'mercenary.browser-shell.damocles.save.v1.slot-1'
    );
    const read = readDamoclesResume(storage, identity);
    expect(read.kind).toBe('restored');
    const restored = new DamoclesSession(
      loaded,
      read.kind === 'restored' ? read.snapshot : undefined
    );
    expect(restored.snapshot).toEqual(session.snapshot);
  });

  test('discards a record it cannot read and starts afresh', async () => {
    const storage = memoryStorage();
    const loaded = await content();
    const identity = damoclesSaveIdentity(loaded.catalogue, loaded.doc);
    storage.setItem(DAMOCLES_RESUME_STORAGE_KEY, '{"schemaVersion":2}');
    expect(readDamoclesResume(storage, identity).kind).toBe('invalid');
    expect(storage.map.size).toBe(0);
    storage.setItem(DAMOCLES_RESUME_STORAGE_KEY, 'not json');
    expect(readDamoclesResume(storage, identity).kind).toBe('invalid');
    storage.setItem(
      DAMOCLES_RESUME_STORAGE_KEY,
      JSON.stringify({
        elapsed: 1,
        pose: { heading: 0, position: { x: 1, y: 2, z: 3 } },
        schemaVersion: 2
      })
    );
    expect(readDamoclesResume(storage, identity).kind).toBe('invalid');
    expect(readDamoclesResume(undefined, identity).kind).toBe('unavailable');
    const fresh = new DamoclesSession(loaded);
    expect(fresh.snapshot.cell).toEqual({ x: 7, z: 8 });
  });

  test('teleports to an Eris cell centre without changing heading', async () => {
    const session = new DamoclesSession(await content());
    const heading = session.snapshot.pose.heading;
    session.teleportToCell(3, 4);
    expect(session.snapshot.cell).toEqual({ x: 3, z: 4 });
    expect(session.snapshot.pose.heading).toBe(heading);
    expect(session.snapshot.pose.position.y).toBe(63);
    expect(() => session.teleportToCell(99, 0)).toThrow(/not on Eris/);
  });
});
