import { describe, expect, test } from 'bun:test';

import { executeDamoclesConsoleCommand } from '../src/damocles/console.ts';
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
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

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
    poses: await arrivalPoses(),
    presentationSha256: 'test-presentation',
    strings: parseDamoclesStrings(strings),
    surface: erisSurfaceFrom(catalogue, doc)
  };
  return content;
};

const sessionOf = async (): Promise<DamoclesSession> =>
  new DamoclesSession(await contentOf());

const host = (session: DamoclesSession) => ({
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
      panelRendition: 'targ' as const
    }),
    update: () => ({
      audioMuted: false,
      audioVolume: 100,
      composition: 'panel' as const,
      panelRendition: 'targ' as const
    })
  } as PreferencesStore,
  session: () => session,
  typeface: () => undefined
});

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

  /// Only slot 183 can be stood beside anywhere in the game today, which the old `get` refusal
  /// happened to match by accident rather than by rule. The other five are out of reach for
  /// reasons that are evidence boundaries, not defects, and this pins each one:
  ///
  /// - slots 95, 151 and 181 have **no recovered residence at all**, so nothing places them;
  /// - slot 94 is level 1, and `worldPosition` draws only level 0 (#357);
  /// - slot 101 is level 0 on Dion, but its insertion group 32 never names the one region the
  ///   player can bind to in its cell, so it is positioned and then drawn zero times (#355).
  test('slot 183 is the only pickup resident a session can reach', async () => {
    /// Every cell of a Body, collecting whatever is drawn anywhere on it.
    const drawnAnywhere = async (
      pose: string
    ): Promise<ReadonlySet<string>> => {
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
    // body-2 carries MAGIC CRYSTAL and no arrival Pose anchors it, so it cannot be visited.
    const session = await sessionOf();
    expect(session.switchToPose('body-2').kind).toBe('declined');
  }, 30_000);

  test('the unreachable five have no recovered residence or no level 0', async () => {
    // Stated against the Catalogue as well as the session, so a payload change moves this test
    // rather than leaving the reachability test to fail for a reason it cannot name.
    const catalogue = await loadCatalogue();
    for (const id of ['object-slot-95', 'object-slot-151', 'object-slot-181']) {
      expect(catalogueResidence(catalogue, id)).toBeUndefined();
    }
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
