import { describe, expect, test } from 'bun:test';

import type { EntranceAttachment } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DAMOCLES_RESUME_STORAGE_KEY,
  readDamoclesResume,
  writeDamoclesResume,
  type ResumeStorage
} from '../src/damocles/resume.ts';
import {
  damoclesSaveIdentity,
  initialDamoclesSaveScript
} from '../src/damocles/save.ts';
import {
  attachmentOpenLimit,
  type AttachmentLatch
} from '../src/damocles/selection.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { intent } from '../src/gameCore/index.ts';
import { titleStorageKeys } from '../src/shell/title.ts';
import { ERIS_BODY, arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

const content = async (): Promise<DamoclesContent> => {
  const [catalogue, presentation, strings] = await Promise.all([
    loadCatalogue(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const parsed = catalogue;
  const doc = readErisPresentation(presentation);
  return {
    catalogue: parsed,
    doc,
    models: modelsOf(parsed),
    poses: await arrivalPoses(),
    presentationSha256: 'test-presentation',
    strings: parseDamoclesStrings(strings),
    surface: erisSurfaceFrom(parsed, modelsOf(parsed), doc)
  };
};

const atSpaceport = (
  loaded: DamoclesContent,
  x: number,
  z: number,
  heading = 0,
  entranceOpenUnits = 0
): DamoclesSession => {
  const entrance = loaded.surface.placements.find(
    placement => placement.id === 'eris-surface-87'
  )!;
  return new DamoclesSession(loaded, {
    angleBytes: [],
    bodyTurn: 0,
    briefcaseStore: [],
    carried: [],
    craft: null,
    doorsMoving: false,
    elapsed: 0,
    encounter: null,
    footTicks: 0,
    frameAccumulator: 0,
    occupancy: { kind: 'onFoot' },
    pendingBriefcaseDrop: null,
    pose: {
      body: ERIS_BODY,
      heading,
      pitch: 0,
      position: {
        x: entrance.position.x + x,
        y: loaded.doc.eye.heightUnits,
        z: entrance.position.z + z
      }
    },
    residence: [],
    script: initialDamoclesSaveScript(),
    scrollCounter: 0,
    spaceMemory: null,
    structure: {
      attachments: entrance.selection!.structure.attachments.map(
        (attachment, index) => ({
          latch: restingLatch(attachment, index === 0 ? entranceOpenUnits : 0),
          openUnits: index === 0 ? entranceOpenUnits : 0,
          slot: attachment.slot
        })
      ),
      doorway: null,
      floor: 0,
      instanceId: entrance.id,
      regionIndex: null,
      ride: null
    }
  });
};

/// The latch a door restored `openUnits` open reads: settled at either end, moving between.
const restingLatch = (
  attachment: EntranceAttachment,
  openUnits: number
): AttachmentLatch =>
  openUnits === 0
    ? 'closed'
    : openUnits === attachmentOpenLimit(attachment)
      ? 'open'
      : 'moving';

const firstAttachmentUnits = (session: DamoclesSession): number =>
  session.snapshot.structure?.attachments[0]?.openUnits ?? 0;

const atStructure = (
  loaded: DamoclesContent,
  instanceId: string,
  x: number,
  z: number,
  heading = 0,
  firstOpenUnits = 0
): DamoclesSession => {
  const placement = loaded.surface.placements.find(p => p.id === instanceId)!;
  return new DamoclesSession(loaded, {
    angleBytes: [],
    bodyTurn: 0,
    briefcaseStore: [],
    carried: [],
    craft: null,
    doorsMoving: false,
    elapsed: 0,
    encounter: null,
    footTicks: 0,
    frameAccumulator: 0,
    occupancy: { kind: 'onFoot' },
    pendingBriefcaseDrop: null,
    pose: {
      body: ERIS_BODY,
      heading,
      pitch: 0,
      position: {
        x: placement.position.x + x,
        y: loaded.doc.eye.heightUnits,
        z: placement.position.z + z
      }
    },
    residence: [],
    script: initialDamoclesSaveScript(),
    scrollCounter: 0,
    spaceMemory: null,
    structure: {
      attachments: placement.selection!.structure.attachments.map(
        (attachment, index) => ({
          latch: restingLatch(attachment, index === 0 ? firstOpenUnits : 0),
          openUnits: index === 0 ? firstOpenUnits : 0,
          slot: attachment.slot
        })
      ),
      doorway: null,
      floor: 0,
      instanceId,
      regionIndex: null,
      ride: null
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
    // The arrival has spent the deadline down to the hand-over's `02-47-28`.
    expect(first.elapsed).toBe(15_560 - 10_048);
    expect(session.advance(0)).toEqual(first);
    session.intent = intent({ walk: 1 });
    const later = session.advance(0.5);
    expect(first.pose.position).toEqual(first.pose.position);
    expect(later.elapsed - first.elapsed).toBeCloseTo(0.5, 9);
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
    expect(whole.elapsed - pieces.snapshot.elapsed).toBeCloseTo(0, 9);
    expect(whole.elapsed).toBeCloseTo(15_560 - 10_048 + 1, 9);
  });

  test('refuses swept facade and window steps while preserving free turning', async () => {
    const loaded = await content();
    const entrance = loaded.surface.placements.find(
      placement => placement.id === 'eris-surface-87'
    )!;
    const facade = atSpaceport(loaded, 1000, -1000);
    facade.intent = intent({ running: true, walk: 1 });
    const afterFacade = facade.advance(1);
    expect(afterFacade.pose.position.z).toBeLessThan(entrance.position.z - 760);

    const turning = atSpaceport(loaded, 1000, -820);
    turning.intent = intent({ turn: 1, walk: 1 });
    turning.advance(0.03);
    expect(turning.snapshot.pose.heading).toBeGreaterThan(0);
    expect(turning.snapshot.pose.position.z).toBeLessThan(
      entrance.position.z - 800
    );

    const window = atSpaceport(loaded, 700, 0, Math.PI / 2);
    window.intent = intent({ running: true, walk: 1 });
    window.advance(1);
    expect(window.snapshot.pose.position.x).toBeLessThan(
      entrance.position.x + 840
    );
  });

  test('opens over time, admits the doorway only at the endpoint, and re-closes on retreat', async () => {
    const loaded = await content();
    const opening = atSpaceport(loaded, 1400, -1000);
    expect(firstAttachmentUnits(opening)).toBe(0);
    opening.advance(1);
    expect(firstAttachmentUnits(opening)).toBeGreaterThan(0);
    expect(firstAttachmentUnits(opening)).toBeLessThan(92);
    opening.advance(2);
    expect(firstAttachmentUnits(opening)).toBe(92);

    const session = atSpaceport(loaded, 1400, -820, 0, 90);
    session.intent = intent({ walk: 1 });
    session.advance(0.03);
    const entrance = loaded.surface.placements.find(
      placement => placement.id === 'eris-surface-87'
    )!;
    expect(session.snapshot.pose.position.z).toBeLessThan(
      entrance.position.z - 800
    );
    session.advance(0.1);
    expect(session.snapshot.pose.position.z).toBeGreaterThan(
      entrance.position.z - 800
    );

    const retreat = atSpaceport(loaded, 1400, -1300, 0, 92);
    retreat.advance(1);
    expect(firstAttachmentUnits(retreat)).toBeGreaterThan(0);
    expect(firstAttachmentUnits(retreat)).toBeLessThan(92);
    retreat.advance(2);
    expect(firstAttachmentUnits(retreat)).toBe(0);
  });

  test('opens and re-closes STATE OFFICE with its recovered two-leaf Z constructor', async () => {
    const loaded = await content();
    const office = loaded.surface.placements.find(
      placement => placement.id === 'eris-surface-89'
    )!;
    const attachment = office.selection!.structure.attachments[0]!;
    expect(attachment.constructor).toEqual({ leafCount: 2, motionAxis: 'z' });
    expect(attachment.proximityBox).toEqual({
      x: [100, 500],
      z: [-200, 0]
    });
    expect(attachmentOpenLimit(attachment)).toBe(52);

    const opening = atStructure(
      loaded,
      office.id,
      330,
      -100,
      (3 * Math.PI) / 2
    );
    opening.advance(1);
    expect(firstAttachmentUnits(opening)).toBeGreaterThan(0);
    expect(firstAttachmentUnits(opening)).toBeLessThan(52);
    opening.advance(1);
    expect(firstAttachmentUnits(opening)).toBe(52);

    opening.intent = intent({ walk: 1 });
    opening.advance(0.25);
    expect(opening.snapshot.pose.position.x).toBeLessThan(
      office.position.x + 290
    );

    const retreat = atStructure(loaded, office.id, 550, -100, 0, 52);
    retreat.advance(2);
    expect(firstAttachmentUnits(retreat)).toBe(0);
  });

  test('resumes exactly where it left off, from its own key', async () => {
    const storage = memoryStorage();
    const loaded = await content();
    const identity = damoclesSaveIdentity(
      loaded.catalogue,
      loaded.presentationSha256
    );
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
    const identity = damoclesSaveIdentity(
      loaded.catalogue,
      loaded.presentationSha256
    );
    storage.setItem(DAMOCLES_RESUME_STORAGE_KEY, '{"schemaVersion":1}');
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

  test('publishes where the player stands against land and sea', async () => {
    const session = new DamoclesSession(await content());
    // The arrival stands in CAPITAL SPACEPORT, inside CAPITAL CITY's authored core box.
    expect(session.snapshot.landSea).toBe('core');
    expect(session.snapshot.island?.areaName).toBe('CAPITAL CITY');
    // Every cell the session can walk to is inside that box: the workspace origin is the
    // island origin, so a 0-15 workspace cell is a 0-15 Island-Local Cell, and CAPITAL CITY's
    // core box reaches 21. The coast is well outside the window, which is why `land` and `sea`
    // are pinned against the probe sweep in damocles-islands.test.ts rather than by walking.
    session.teleportToCell(15, 15);
    expect(session.snapshot.landSea).toBe('core');
    expect(session.snapshot.islandCell).toEqual({ x: 15, z: 15 });
  });
});
