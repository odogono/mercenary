import { beforeAll, describe, expect, test } from 'bun:test';

import { documentMessageId } from '../src/damocles/display.ts';
import {
  DOCUMENT_COUNT,
  documentFor,
  parseDamoclesDocuments
} from '../src/damocles/documentBank.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  BACKWARD_WRAP_INDEX,
  TRANSITION_VBLS,
  initialHeadCommands
} from '../src/damocles/headCommands.ts';
import {
  centreBoxView,
  damoclesPanelViewModel
} from '../src/damocles/panel.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  initialDamoclesSaveScript,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import { SHORTENED_DISPLAY_FRAMES } from '../src/damocles/script.ts';
import { TRIGGER_FOR_RESIDENT } from '../src/damocles/scripts.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

const DAMOCLES_FILE = 'object-slot-151';
const LIMO_KEY = 'object-slot-183';
const NOVAGEN_SAFE = 'object-slot-102';
const FILE_SLOT = 151;

let loaded: DamoclesContent;

beforeAll(async () => {
  const [catalogue, presentation, strings] = await Promise.all([
    loadCatalogue(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const doc = readErisPresentation(presentation);
  loaded = {
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(strings),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

/// A session on foot at the origin carrying `carried`, head first.
const carrying = (
  carried: readonly string[],
  overrides: Partial<DamoclesSaveSnapshot> = {}
): DamoclesSession =>
  new DamoclesSession(loaded, {
    angleBytes: [],
    bodyTurn: 0,
    briefcaseStore: [],
    carried: [...carried],
    craft: null,
    doorsMoving: false,
    elapsed: 0,
    encounter: null,
    footTicks: 0,
    frameAccumulator: 0,
    headCommands: initialHeadCommands(),
    occupancy: { kind: 'onFoot' },
    pendingBriefcaseDrop: null,
    pose: {
      body: 'body-11',
      heading: 0,
      pitch: 0,
      position: { x: 0, y: loaded.doc.eye.heightUnits, z: 0 }
    },
    residence: carried.map(instance => ({
      instance,
      residence: {
        kind: 'carried' as const,
        placementClass: loaded.catalogue.instances.find(
          item => item.id === instance
        )!.placementClass!
      }
    })),
    // Taking an object launched its trigger, which disarmed it.
    running: false,
    script: (() => {
      const script = initialDamoclesSaveScript();
      const taken = carried.map(instance => TRIGGER_FOR_RESIDENT[instance]);
      return {
        ...script,
        triggers: script.triggers.map(trigger =>
          taken.includes(trigger.index) ? { ...trigger, armed: false } : trigger
        )
      };
    })(),
    scrollCounter: 0,
    spaceMemory: null,
    structure: null,
    ...overrides
  });

/// Run `count` VBLs, one advance each so every frame is its own.
const vbls = (session: DamoclesSession, count: number): void => {
  for (let frame = 0; frame < count; frame += 1) {
    session.advance(1 / 50);
  }
};

/// Open the head and let the centre box finish its transition.
const opened = (session: DamoclesSession): DamoclesSession => {
  expect(session.headCommand('open')).toEqual({ kind: 'opened' });
  vbls(session, TRANSITION_VBLS);
  return session;
};

const fileItems = () => documentFor(loaded.documents, FILE_SLOT)!.items;

describe('the Damocles documents payload', () => {
  test('holds the Open table’s 19 documents and their 93 items', () => {
    expect(loaded.documents.documents).toHaveLength(DOCUMENT_COUNT);
    expect(
      loaded.documents.documents.reduce(
        (total, document) => total + document.items.length,
        0
      )
    ).toBe(93);
    expect(loaded.documents.source.programSha256).toBe(
      loaded.catalogue.source.programSha256
    );
  });

  test('carries the DAMOCLES FILE as the note decodes it', () => {
    const file = documentFor(loaded.documents, FILE_SLOT)!;
    expect(file.index).toBe(0x0e);
    expect([file.colour15, file.colour3]).toEqual([0x0_36, 0x2_57]);
    expect(file.items.map(item => item.name.trimEnd())).toEqual([
      'PROBLEM',
      'HISTORY',
      'SOLUTION',
      'SETBACK',
      'HANTZEN',
      'OTHER',
      'POLITICS',
      'REWARD',
      'REASON',
      'TIME',
      'NEXT'
    ]);
    // Bodies keep the padding that lines their words up in the row.
    expect(file.items[0]!.body.trim().replaceAll(/ +/g, ' ')).toBe(
      'THE COMET DAMOCLES IS ON A COLLISION COURSE WITH ERIS - SEE CHART D.1745 FOR TRAJECTORY'
    );
  });

  test('refuses a document set that is short or names an object twice', async () => {
    const raw = await Bun.file('../payload/damocles/documents.json').json();
    expect(() =>
      parseDamoclesDocuments({ ...raw, documents: raw.documents.slice(1) })
    ).toThrow(/expected 19 documents/);
    expect(() =>
      parseDamoclesDocuments({
        ...raw,
        documents: [raw.documents[0], ...raw.documents.slice(0, -1)]
      })
    ).toThrow(/share an object/);
    const lowercase = structuredClone(raw);
    lowercase.documents[0].items[0].body = 'lower case';
    expect(() => parseDamoclesDocuments(lowercase)).toThrow(/row glyphs/);
  });
});

describe('Open', () => {
  test('opens the head’s document at item 0 and scrolls it in over 64 VBLs', () => {
    const session = carrying([DAMOCLES_FILE, LIMO_KEY]);
    expect(session.headCommand('open')).toEqual({ kind: 'opened' });
    expect(session.snapshot.headCommands.open).toEqual({
      index: 0,
      item: 0,
      slot: FILE_SLOT
    });
    // The logo rises out for 32 VBLs, then the file's panel rises in for 32.
    vbls(session, 1);
    expect(centreBoxView(session.snapshot.centreBox)).toEqual({
      panel: null,
      top: -1
    });
    vbls(session, 32);
    const arriving = centreBoxView(session.snapshot.centreBox);
    expect(arriving.top).toBe(31);
    expect(arriving.panel).toMatchObject({
      field: '#44aaee',
      ground: '#0066cc',
      item: null,
      title: 'DAMOCLES FILE'
    });
    vbls(session, 31);
    expect(
      damoclesPanelViewModel(session.snapshot, loaded.doc).centreBox
    ).toEqual({
      panel: {
        field: '#44aaee',
        ground: '#0066cc',
        item: 'PROBLEM',
        title: 'DAMOCLES FILE'
      },
      top: 0
    });
  });

  test('ignores every keypad key until the transition ends', () => {
    const session = carrying([DAMOCLES_FILE]);
    session.headCommand('open');
    vbls(session, TRANSITION_VBLS - 1);
    expect(session.headCommand('next')).toEqual({ kind: 'ignored' });
    expect(session.headCommand('open')).toEqual({ kind: 'ignored' });
    vbls(session, 1);
    expect(session.headCommand('next')).toEqual({ kind: 'paged' });
  });

  test('does nothing for a head that opens no document, or for no head', () => {
    expect(carrying([LIMO_KEY]).headCommand('open')).toEqual({
      kind: 'ignored'
    });
    expect(carrying([]).headCommand('open')).toEqual({ kind: 'ignored' });
  });

  test('refuses the NOVAGEN SAFE, whose gate only an explosion sets', () => {
    const session = carrying([NOVAGEN_SAFE]);
    expect(session.headCommand('open')).toEqual({ kind: 'ignored' });
    expect(session.snapshot.headCommands.open).toBeNull();
  });

  test('closes the document already open, as the #595 Accommodation for Enter', () => {
    const session = opened(carrying([DAMOCLES_FILE]));
    expect(session.headCommand('open')).toEqual({ kind: 'closed' });
    expect(session.snapshot.headCommands.open).toBeNull();
    vbls(session, TRANSITION_VBLS);
    expect(centreBoxView(session.snapshot.centreBox)).toEqual({
      panel: null,
      top: 0
    });
  });

  test('clicks for each command that acts, and not for one ignored', () => {
    const session = carrying([DAMOCLES_FILE]);
    session.headCommand('open');
    const clicks = () =>
      session.drainEffects().filter(effect => effect.type === 'sound-request')
        .length;
    expect(clicks()).toBe(1);
    session.headCommand('next');
    expect(clicks()).toBe(0);
  });
});

describe('the pointer’s hover cue', () => {
  test('says Open acts only on a head with a document', () => {
    expect(carrying([DAMOCLES_FILE, LIMO_KEY]).headOpens).toBe(true);
    expect(carrying([LIMO_KEY, DAMOCLES_FILE]).headOpens).toBe(false);
    expect(carrying([NOVAGEN_SAFE]).headOpens).toBe(false);
    expect(carrying([]).headOpens).toBe(false);
  });

  test('follows the head as the stack rotates', () => {
    const session = carrying([LIMO_KEY, DAMOCLES_FILE]);
    session.rotateForward();
    expect(session.headOpens).toBe(true);
  });
});

describe('Next and Previous', () => {
  test('step the item and wrap at both ends, the index to 8 on a backward wrap', () => {
    const session = opened(carrying([DAMOCLES_FILE]));
    const last = fileItems().length - 1;
    session.headCommand('next');
    expect(session.snapshot.headCommands.open).toMatchObject({
      index: 1,
      item: 1
    });
    session.headCommand('previous');
    session.headCommand('previous');
    expect(session.snapshot.headCommands.open).toMatchObject({
      index: BACKWARD_WRAP_INDEX,
      item: last
    });
    expect(session.snapshot.centreBox.from?.item).toBe('NEXT');
    // The index counts on from 8, not from the item's position.
    session.headCommand('previous');
    expect(session.snapshot.headCommands.open).toMatchObject({
      index: 7,
      item: last - 1
    });
    session.headCommand('next');
    session.headCommand('next');
    expect(session.snapshot.headCommands.open).toMatchObject({
      index: 0,
      item: 0
    });
  });

  test('page the open document after the stack rotates it away from the head', () => {
    const session = opened(carrying([DAMOCLES_FILE, LIMO_KEY]));
    expect(session.rotateForward()).toEqual({ kind: 'rotated' });
    expect(session.snapshot.carried[0]).toBe(LIMO_KEY);
    expect(session.headCommand('next')).toEqual({ kind: 'paged' });
    expect(session.snapshot.headCommands.open).toMatchObject({
      item: 1,
      slot: FILE_SLOT
    });
  });

  test('do nothing with no document open', () => {
    const session = carrying([DAMOCLES_FILE]);
    expect(session.headCommand('next')).toEqual({ kind: 'ignored' });
    expect(session.headCommand('previous')).toEqual({ kind: 'ignored' });
    expect(session.headCommand('read')).toEqual({ kind: 'ignored' });
  });
});

describe('Read', () => {
  test('queues the item body as a message in plane 1, 48 cells a block', () => {
    const session = opened(carrying([DAMOCLES_FILE]));
    session.headCommand('next');
    session.drainEffects();
    expect(session.headCommand('read')).toEqual({ kind: 'read' });
    expect(session.snapshot.headCommands.lastRead).toEqual({
      index: 1,
      slot: FILE_SLOT
    });
    const body = fileItems()[1]!.body;
    expect(body.length).toBeGreaterThan(96);
    // The dispatch head presents it on the next frame, ahead of any script.
    vbls(session, 1);
    expect(session.snapshot.message).toEqual({
      id: documentMessageId(FILE_SLOT, 1),
      offset: 0,
      remainingFrames: 200
    });
    // The body's tone is asked for as it begins, like any other message's.
    expect(session.drainEffects()).toContainEqual({
      text: body,
      type: 'message'
    });
    vbls(session, 36);
    expect(session.snapshot.display).toEqual({
      cells: body.slice(0, 48),
      kind: 'held',
      plane: 1
    });
    expect(session.snapshot.displayCells.planes).toEqual(Array(48).fill(1));
    // The second block starts where the first stopped, once the first has held its 200.
    vbls(session, 200 - 36);
    expect(session.snapshot.message).toMatchObject({
      offset: 48,
      remainingFrames: 200
    });
    vbls(session, 36);
    expect(session.snapshot.displayCells.cells).toBe(body.slice(48, 96));
  });

  test('holds the block that reads the terminator for 50 frames', () => {
    const session = opened(carrying([DAMOCLES_FILE]));
    session.headCommand('read');
    const body = fileItems()[0]!.body;
    const blocks = Math.ceil(body.length / 48);
    vbls(session, 1 + 200 * (blocks - 1));
    expect(session.snapshot.message).toMatchObject({
      offset: 48 * (blocks - 1),
      remainingFrames: SHORTENED_DISPLAY_FRAMES
    });
    vbls(session, SHORTENED_DISPLAY_FRAMES);
    expect(session.snapshot.message).toBeNull();
    expect(session.snapshot.display).toEqual({
      cells: body.slice(48 * (blocks - 1)).padEnd(48),
      kind: 'held',
      plane: 1
    });
  });

  test('is ignored while a Read is still waiting to present', () => {
    const session = opened(carrying([DAMOCLES_FILE]));
    expect(session.headCommand('read')).toEqual({ kind: 'read' });
    session.headCommand('next');
    expect(session.headCommand('read')).toEqual({ kind: 'ignored' });
    vbls(session, 1);
    expect(session.snapshot.message?.id).toBe(documentMessageId(FILE_SLOT, 0));
  });
});

describe('closing', () => {
  test('dropping the open object closes it and scrolls the logo back', () => {
    const session = opened(carrying([DAMOCLES_FILE, LIMO_KEY]));
    expect(session.drop()).toEqual({ kind: 'dropped' });
    expect(session.snapshot.headCommands.open).toBeNull();
    expect(session.snapshot.headCommands.box).toMatchObject({
      from: FILE_SLOT,
      fromItem: 0,
      steps: TRANSITION_VBLS,
      to: null
    });
  });

  test('dropping another object leaves the document open', () => {
    const session = opened(carrying([DAMOCLES_FILE, LIMO_KEY]));
    session.rotateForward();
    // A rotation scrolls the inventory label, and a drop waits for it.
    vbls(session, 16);
    expect(session.drop()).toEqual({ kind: 'dropped' });
    expect(session.snapshot.headCommands.open?.slot).toBe(FILE_SLOT);
  });

  test('Escape’s close is the drop’s, without dropping anything', () => {
    const session = opened(carrying([DAMOCLES_FILE]));
    expect(session.documentOpen).toBe(true);
    expect(session.closeDocument()).toEqual({ kind: 'closed' });
    expect(session.documentOpen).toBe(false);
    expect(session.snapshot.carried).toEqual([DAMOCLES_FILE]);
    expect(session.closeDocument()).toEqual({ kind: 'ignored' });
  });
});

describe('the world while a document is open', () => {
  test('keeps its clock running through the transition and the read', () => {
    const session = carrying([DAMOCLES_FILE]);
    const before = session.snapshot.elapsed;
    opened(session);
    session.headCommand('read');
    vbls(session, 100);
    expect(session.snapshot.elapsed - before).toBeCloseTo(164 / 50, 6);
  });
});

/// The fields of a Save record these tests edit.
interface EditableRecord {
  schemaVersion: number;
  snapshot: {
    headCommands?: {
      box: { from: number | null; to: number | null };
      open: { item: number; slot: number };
    };
    running?: boolean;
    script: {
      display: { plane?: number };
      read?: string | null;
      triggers: { armed: boolean; index: number }[];
    };
  };
}

/// Before schema 19 no record carried the State President's location trigger 3.
const beforeLocations = (record: EditableRecord): void => {
  record.snapshot.script.triggers = record.snapshot.script.triggers.filter(
    trigger => trigger.index !== 3
  );
};

const identity = () => damoclesSaveIdentity(loaded.catalogue, 'test');

const encoded = (session: DamoclesSession): string =>
  encodeDamoclesSave({
    identity: identity(),
    savedAt: '2026-09-29T10:00:00.000Z',
    schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
    snapshot: session.captureResume(),
    where: 'ERIS 00-00'
  });
const decoded = (text: string) =>
  decodeDamoclesSave(text, identity(), {
    catalogue: loaded.catalogue,
    documents: loaded.documents,
    poses: loaded.poses,
    strings: loaded.strings
  });
const edited = (
  session: DamoclesSession,
  edit: (record: EditableRecord) => void
): string => {
  const record = JSON.parse(encoded(session)) as EditableRecord;
  edit(record);
  return JSON.stringify(record);
};

describe('the Save', () => {
  test('carries the open document, its index after a wrap and a body mid-block', () => {
    const session = opened(carrying([DAMOCLES_FILE, LIMO_KEY]));
    session.headCommand('previous');
    session.headCommand('read');
    vbls(session, 250);
    const saved = decoded(encoded(session));
    expect(saved.snapshot.headCommands.open).toEqual({
      index: BACKWARD_WRAP_INDEX,
      item: fileItems().length - 1,
      slot: FILE_SLOT
    });
    expect(saved.snapshot.script.message).toMatchObject({ offset: 48 });
    // A restored session goes on exactly as the uninterrupted one does.
    const restored = new DamoclesSession(loaded, saved.snapshot);
    vbls(session, 300);
    vbls(restored, 300);
    for (const key of ['display', 'message', 'headCommands'] as const) {
      expect(restored.snapshot[key]).toEqual(session.snapshot[key]);
    }
  });

  test('carries the centre box mid-transition', () => {
    const session = carrying([DAMOCLES_FILE]);
    session.headCommand('open');
    vbls(session, 40);
    const saved = decoded(encoded(session));
    expect(saved.snapshot.headCommands.box).toEqual({
      from: null,
      fromItem: null,
      steps: TRANSITION_VBLS - 40,
      to: FILE_SLOT
    });
  });

  test('migrates a schema-16 record with no document open and every row in plane 0', () => {
    const session = carrying([DAMOCLES_FILE]);
    vbls(session, 1);
    const older = edited(session, record => {
      record.schemaVersion = 16;
      beforeLocations(record);
      delete record.snapshot.headCommands;
      delete record.snapshot.script.read;
      delete record.snapshot.script.display.plane;
    });
    const migrated = decoded(older).snapshot;
    expect(migrated.headCommands).toEqual(initialHeadCommands());
    expect(migrated.script.read).toBeNull();
    expect(migrated.script.display).toMatchObject({ kind: 'held', plane: 0 });
  });

  test('carries the run toggle, and migrates a schema-17 record walking', () => {
    const session = opened(carrying([DAMOCLES_FILE]));
    session.toggleRunning();
    const saved = decoded(encoded(session)).snapshot;
    expect(saved.running).toBeTrue();
    expect(new DamoclesSession(loaded, saved).running).toBeTrue();

    const older = decoded(
      edited(session, record => {
        record.schemaVersion = 17;
        beforeLocations(record);
        delete record.snapshot.running;
      })
    ).snapshot;
    expect(older.running).toBeFalse();
    // Schema 17 carried the document mode, which still restores.
    expect(older.headCommands).toEqual(saved.headCommands);

    expect(() =>
      decoded(
        edited(session, record => {
          delete record.snapshot.running;
        })
      )
    ).toThrow(/running is not a boolean/);
  });

  test('refuses a document state no play reaches', () => {
    const session = opened(carrying([DAMOCLES_FILE, LIMO_KEY]));
    expect(() =>
      decoded(
        edited(session, record => {
          record.snapshot.headCommands!.open.slot = 102;
          record.snapshot.headCommands!.box.from = 102;
          record.snapshot.headCommands!.box.to = 102;
        })
      )
    ).toThrow(/no document the Open table opens/);
    expect(() =>
      decoded(
        edited(session, record => {
          record.snapshot.headCommands!.open.slot = 131;
          record.snapshot.headCommands!.box.from = 131;
          record.snapshot.headCommands!.box.to = 131;
        })
      )
    ).toThrow(/not carried/);
    expect(() =>
      decoded(
        edited(session, record => {
          record.snapshot.headCommands!.box.to = null;
        })
      )
    ).toThrow(/centre box and the open document disagree/);
    expect(() =>
      decoded(
        edited(session, record => {
          record.snapshot.headCommands!.open.item = fileItems().length;
        })
      )
    ).toThrow(/outside its recovered bounds/);
    expect(() =>
      decoded(
        edited(session, record => {
          record.snapshot.script.read = 'document-151-99';
        })
      )
    ).toThrow(/unknown document item/);
  });
});
