import { describe, expect, test } from 'bun:test';

import {
  damoclesMessageTranscript,
  executeDamoclesConsoleCommand
} from '../src/damocles/console.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { catalogueResidence } from '../src/damocles/residence.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { parseConsoleCommand } from '../src/shell/console.ts';
import type { PreferencesStore } from '../src/shell/preferences.ts';
import type { SavePersistence } from '../src/shell/saves.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

let content: DamoclesContent | undefined;

const contentOf = async (): Promise<DamoclesContent> => {
  if (content !== undefined) {
    return content;
  }
  const [raw, presentation, strings] = await Promise.all([
    loadCatalogue(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const catalogue = raw;
  const doc = readErisPresentation(presentation);
  content = {
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test-presentation',
    strings: parseDamoclesStrings(strings),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
  return content;
};

const sessionOf = async (): Promise<DamoclesSession> =>
  new DamoclesSession(await contentOf());

const host = (session: DamoclesSession) => ({
  openAtlas: () => undefined,
  persistence: {
    armed: () => undefined,
    delete: () => ({ kind: 'done' }),
    describe: () => ({ slot: 1, state: 'empty' }),
    disarm: () => undefined,
    dismiss: () => undefined,
    load: () => ({ kind: 'done' }),
    message: () => ({ source: 'game' as const, text: '' }),
    onChange: () => undefined,
    save: () => ({ kind: 'done' })
  } as unknown as SavePersistence,
  preferences: {
    current: () => ({
      audioMuted: false,
      audioVolume: 100,
      composition: 'panel' as const,
      extendedControls: false,
      panelRendition: 'targ' as const
    }),
    update: () => ({
      audioMuted: false,
      audioVolume: 100,
      composition: 'panel' as const,
      extendedControls: false,
      panelRendition: 'targ' as const
    })
  } as PreferencesStore,
  session: () => session,
  typeface: () => undefined
});

/// Every cell of a Body, collecting whatever is drawn anywhere on it.
const drawnAnywhere = async (pose: string): Promise<ReadonlySet<string>> => {
  const seen = new Set<string>();
  for (let x = 0; x < 16; x += 1) {
    for (let z = 0; z < 16; z += 1) {
      const probe = await sessionOf();
      if (probe.switchToPose(pose).kind !== 'switched') {
        throw new Error(`${pose} did not switch`);
      }
      probe.teleportToCell(x, z);
      for (const item of probe.snapshot.residents) {
        seen.add(item.id);
      }
    }
  }
  return seen;
};

describe('the Damocles Shell Console', () => {
  test('where and goto speak Eris cells', async () => {
    const session = await sessionOf();
    const cells = session.snapshot.cell;
    expect(cells).toEqual({ x: 7, z: 8 });
    const parsed = parseConsoleCommand('goto 3 4', 16);
    expect(parsed?.kind).toBe('gotoCell');
    const lines = executeDamoclesConsoleCommand(parsed!, host(session));
    expect(lines[0]).toContain('3-4');
    expect(session.snapshot.cell).toEqual({ x: 3, z: 4 });
    const where = executeDamoclesConsoleCommand(
      parseConsoleCommand('where', 16)!,
      host(session)
    );
    expect(where[0]).toContain('ERIS 03-04');
  });

  test('refuses Targ-only commands', async () => {
    const session = await sessionOf();
    const run = (line: string) =>
      executeDamoclesConsoleCommand(
        parseConsoleCommand(line, 16, 256, 'selected')!,
        host(session)
      )[0];
    expect(run('goto room 3')).toBe('Damocles has no Rooms');
    expect(run('get')).toBe('take refused');
    expect(run('drop')).toBe('inventory is empty');
    expect(run('inventory')).toBe('inventory is empty');
    expect(run('time')).toBe("time belongs to Targ's orrery");
    expect(run('goto 7 8 10')).toBe('goto takes two cells on Eris');
    expect(
      executeDamoclesConsoleCommand(
        parseConsoleCommand('goto 99 0', 256)!,
        host(session)
      )[0]
    ).toMatch(/not on Eris/);
  });
});

/// Stand where a drawn resident is, which is what walking up to it achieves. The position comes
/// from the session's own Session Snapshot, so it is the recovered placement rather than a number
/// this suite chose; nothing here moves the object.
const standingAt = async (
  session: DamoclesSession,
  instance: string
): Promise<DamoclesSession> => {
  const resident = session.snapshot.residents.find(
    item => item.id === instance
  );
  if (resident === undefined) {
    throw new Error(`${instance} is not drawn`);
  }
  const shared = await contentOf();
  const saved = session.captureResume();
  return new DamoclesSession(shared, {
    ...saved,
    pose: {
      ...saved.pose,
      position: {
        x: resident.position.x,
        y: resident.position.y + shared.doc.eye.heightUnits,
        z: resident.position.z
      }
    }
  });
};

const run = (session: DamoclesSession, line: string): string =>
  executeDamoclesConsoleCommand(
    parseConsoleCommand(line, 16, 256, 'selected')!,
    host(session)
  )[0]!;

describe('get names what it took', () => {
  test('a slot above 63 parses, which is what the old refusal hid', () => {
    // `get 183` could not even be understood while the bound was Targ's 64. Damocles slots run
    // 1 through 255.
    expect(parseConsoleCommand('get 183', 16, 256, 'selected')).toEqual({
      kind: 'getObject',
      slot: 183
    });
    expect(() => parseConsoleCommand('get 183', 16, 64, 'selected')).toThrow(
      /0 through 63/
    );
  });

  test('takes the limo key by slot and names it', async () => {
    const opened = await sessionOf();
    opened.teleportToCell(7, 8);
    const session = await standingAt(opened, 'object-slot-183');
    expect(run(session, 'get 183')).toBe('took KEY- V.I.P. LIMO');
    expect(session.snapshot.carried).toEqual(['object-slot-183']);
  });

  test('a slot that is not the selection is declined by name', async () => {
    const opened = await sessionOf();
    opened.teleportToCell(7, 8);
    const session = await standingAt(opened, 'object-slot-183');
    expect(run(session, 'get 94')).toBe(
      'object 94 is not in reach; KEY- V.I.P. LIMO is'
    );
    expect(session.snapshot.carried).toEqual([]);
  });

  /// Only slot 183 can be stood beside in a 16x16 window, which the old `get` refusal happened
  /// to match by accident rather than by rule. Slot 95 is drawn on Midas, but only from its own
  /// cell of the field, far outside any window `goto` reaches (test/damocles-midas-field.test.ts).
  /// The other four are out of reach for reasons that are evidence boundaries, not defects, and
  /// this pins each one:
  ///
  /// - slots 151 and 181 are placed in the Eris State Office (cell 9,8), but 181 is on Floor 10
  ///   and 151's insertion group names regions 1, 6 and 7, while the cell's centre is region 10;
  /// - slot 94 is level 1, and `worldPosition` draws only level 0 (#357);
  /// - slot 101 is level 0 on Dion, but its insertion group 32 never names the one region the
  ///   player can bind to in its cell, so it is positioned and then drawn zero times (#355).
  test('slot 183 is the only pickup resident a session can reach', async () => {
    const eris = await drawnAnywhere('eris-spaceport-onfoot');
    expect(eris.has('object-slot-183')).toBe(true);
    expect(eris.has('object-slot-151')).toBe(false);
    expect(eris.has('object-slot-181')).toBe(false);
    expect((await drawnAnywhere('dion-2-3')).has('object-slot-101')).toBe(
      false
    );
    expect(
      (await drawnAnywhere('vesta-parliament-4-6')).has('object-slot-94')
    ).toBe(false);
    // body-2 carries MAGIC CRYSTAL. Its Pose is anchored to the field window it stands in,
    // about 2,200 cells across the wrapping surface from the crystal's copy.
    expect((await drawnAnywhere('midas')).has('object-slot-95')).toBe(false);
  }, 30_000);

  test('the unreachable five are unplaced, off level 0, or not in the region stood in', async () => {
    // Stated against the Catalogue as well as the session, so a payload change moves this test
    // rather than leaving the reachability test to fail for a reason it cannot name.
    const catalogue = await loadCatalogue();
    expect(catalogueResidence(catalogue, 'object-slot-95')).toMatchObject({
      kind: 'structure',
      level: 0,
      parent: 'midas-the-midas-project-surface-2364-376'
    });
    expect(catalogueResidence(catalogue, 'object-slot-151')).toMatchObject({
      insertionGroup: 7,
      kind: 'structure',
      level: 0,
      parent: 'eris-surface-89'
    });
    expect(
      catalogue.instances
        .find(item => item.id === 'object-slot-151')!
        .association!.insertions.map(pair => pair.regionSelector)
    ).toEqual([1, 6]);
    expect(catalogueResidence(catalogue, 'object-slot-181')).toMatchObject({
      kind: 'structure',
      level: 10,
      parent: 'eris-surface-89'
    });
    // Slot 94 is placed, and placed above the ground level the draw pass admits.
    expect(catalogueResidence(catalogue, 'object-slot-94')).toMatchObject({
      kind: 'structure',
      level: 1
    });
  });

  test('drop confirms the head by slot or by name', async () => {
    const opened = await sessionOf();
    opened.teleportToCell(7, 8);
    const session = await standingAt(opened, 'object-slot-183');
    expect(session.take().kind).toBe('took');
    // A take sets the inventory-label scroll counter to -16; let it settle as live play does.
    session.advance(16 / 50);
    expect(run(session, 'drop 94')).toBe("carried head does not match '94'");
    expect(run(session, 'drop 183')).toBe('dropped KEY- V.I.P. LIMO');
  });
});

test('atlas is a zero-argument shell navigation command', async () => {
  expect(parseConsoleCommand('atlas', 16)).toEqual({ kind: 'atlas' });
  expect(() => parseConsoleCommand('atlas eris', 16)).toThrow(
    'atlas takes no arguments'
  );
  const session = await sessionOf();
  const before = session.captureResume();
  let opened = false;
  executeDamoclesConsoleCommand(
    { kind: 'atlas' },
    {
      ...host(session),
      openAtlas: () => {
        opened = true;
      }
    }
  );
  expect(opened).toBeTrue();
  expect(session.captureResume()).toEqual(before);
});

describe('the Damocles message transcript', () => {
  test('logs what the message bar shows, one row a line', () => {
    expect(damoclesMessageTranscript('  WELCOME TO ERIS  ')).toEqual([
      'BENSON · WELCOME TO ERIS'
    ]);
    // A document body's block is the 48 cells from its start, not the rest of the record.
    const body =
      '        REFER TO CONFIDENTIAL FILE IN SAFE        ' + 'SECOND BLOCK';
    expect(damoclesMessageTranscript(body)).toEqual([
      'BENSON · REFER TO CONFIDENTIAL FILE IN SAFE'
    ]);
    expect(damoclesMessageTranscript('SECOND BLOCK')).toEqual([
      'BENSON · SECOND BLOCK'
    ]);
  });

  test('logs nothing for a blank row', () => {
    expect(damoclesMessageTranscript(' '.repeat(48))).toEqual([]);
  });
});
