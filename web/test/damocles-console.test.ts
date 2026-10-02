import { describe, expect, test } from 'bun:test';

import { cometCentre } from '../src/damocles/comet.ts';
import {
  damoclesMessageTranscript,
  executeDamoclesConsoleCommand,
  parseDamoclesConsoleCommand
} from '../src/damocles/console.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { catalogueResidence } from '../src/damocles/residence.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave
} from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { turnOnClock } from '../src/damocles/terminator.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { readGammaSystem } from '../src/flyover/documents.ts';
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
    parseDamoclesConsoleCommand(line, 16)!,
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

  test('bare get takes the selection and names it', async () => {
    const opened = await sessionOf();
    opened.teleportToCell(7, 8);
    const session = await standingAt(opened, 'object-slot-183');
    expect(run(session, 'get')).toBe('took KEY- V.I.P. LIMO');
    expect(session.snapshot.carried).toEqual(['object-slot-183']);
  });

  test('get with a slot takes it from afar without moving the player, as Targ does', async () => {
    const session = await sessionOf();
    const before = session.snapshot.pose;
    // CASH REGISTER is a Vesta resident; the player stands on Eris.
    expect(run(session, 'get 94')).toBe('took object 94');
    expect(session.snapshot.carried).toEqual(['object-slot-94']);
    expect(session.snapshot.pose).toEqual(before);
    expect(run(session, 'get 94')).toBe('object 94 is already carried');
  });

  test('get with a slot keeps the Take rules', async () => {
    const session = await sessionOf();
    expect(run(session, 'get 3')).toBe('object 03 is too heavy');
    expect(run(session, 'get 156')).toBe('object 156 is fixed in place');
    expect(run(session, 'get 8')).toBe('object 08 is not in the world');
    expect(run(session, 'get 9')).toBe('there is no object 09');
    expect(session.snapshot.carried).toEqual([]);
  });

  test('get with a slot refuses a full Carried Stack', async () => {
    const session = await sessionOf();
    const slots = [26, 27, 28, 30, 31, 32, 33, 34, 35, 36];
    for (const slot of slots) {
      expect(run(session, `get ${slot}`)).toBe(`took object ${slot}`);
      // The Carried Stack scrolls for a moment after each Take, as the Take key's does.
      session.advance(1);
    }
    expect(run(session, 'get 37')).toBe('inventory is full');
    expect(session.snapshot.carried).toHaveLength(slots.length);
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

  test('fetch brings a remote object to the player without carrying it', async () => {
    const session = await sessionOf();
    // The arrival Pose stands within reach of slot 7, which will not take CASH REGISTER.
    expect(run(session, 'fetch 94')).toBe('no room for object 94');
    expect(session.snapshot.message).toBeNull();
    session.teleportToCell(3, 3);
    const before = session.snapshot.pose;
    expect(run(session, 'fetch 94')).toBe('fetched object 94');
    expect(session.snapshot.carried).toEqual([]);
    expect(session.snapshot.pose).toEqual(before);
    expect(
      session.snapshot.residence.find(
        item => item.instance === 'object-slot-94'
      )?.residence
    ).toMatchObject({ body: before.body });
  });

  test('fetch keeps only the fixed-in-place Take rule', async () => {
    const session = await sessionOf();
    session.teleportToCell(3, 3);
    expect(run(session, 'fetch 156')).toBe('object 156 is fixed in place');
    expect(run(session, 'fetch 8')).toBe('object 08 is not in the world');
    expect(run(session, 'fetch 9')).toBe('there is no object 09');
    expect(run(session, 'get 94')).toBe('took object 94');
    expect(run(session, 'fetch 94')).toBe(
      'object 94 is already carried; use drop'
    );
    session.advance(1);
    expect(run(session, 'fetch 3')).toBe('fetched object 03');
    expect(
      executeDamoclesConsoleCommand({ kind: 'help' }, host(session)).join(' ')
    ).toContain('fetch <object-slot>');
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

describe('Damocles console clocks', () => {
  test('sets local Body Time on the shared clock without moving impact', async () => {
    const session = await sessionOf();
    const content = await contentOf();
    const before = session.captureResume();
    const impact = session.snapshot.impact;
    for (const value of ['0:00:00', '12:00:00', '23-59-59', '9:01:02']) {
      expect(run(session, `time ${value}`)).toBe(
        `time ${value.replaceAll('-', ':').padStart(8, '0')}`
      );
      expect(run(session, 'time')).toBe(
        `time ${value.replaceAll('-', ':').padStart(8, '0')}`
      );
      expect(session.snapshot.impact).toEqual(impact);
      const saved = session.captureResume();
      const body = content.catalogue.craft!.bodies[11]!;
      const rate = content.catalogue.bodies.find(body => body.id === 'body-11')!
        .bodySurface!.rotationRate;
      expect(
        turnOnClock(
          { rate, start: body.turn, turn: saved.bodyTurn },
          { rate, start: body.turn }
        )
      ).toBe(saved.bodyTurn);
      const restored = new DamoclesSession(content, saved);
      expect(run(restored, 'time')).toBe(run(session, 'time'));
    }
    expect(session.captureResume().elapsed).toBe(before.elapsed);
    session.teleportToCell(0, 0);
    const west = session.bodyTime()!;
    session.teleportToCell(4, 0);
    expect((session.bodyTime()! - west + 86_400) % 86_400).toBeCloseTo(
      86_400 / 1024,
      4
    );
    const help = executeDamoclesConsoleCommand(
      { kind: 'help' },
      host(session)
    ).join(' ');
    expect(help).toContain('time');
    expect(help).toContain('impact');
  });

  test('carries the shared Body clock through a console switch and Atlas Travel', async () => {
    const content = await contentOf();
    const session = new DamoclesSession(content);
    run(session, 'time 12:00');
    const chosen = session.captureResume();
    const eris = content.catalogue.craft!.bodies[11]!;
    const gaea = content.catalogue.craft!.bodies[8]!;
    const rate = (body: string) =>
      content.catalogue.bodies.find(item => item.id === body)!.bodySurface!
        .rotationRate;
    const expected = turnOnClock(
      { rate: rate('body-11'), start: eris.turn, turn: chosen.bodyTurn },
      { rate: rate('body-8'), start: gaea.turn }
    );
    expect(session.switchToPose('gaea-ur-city-4-2').kind).toBe('switched');
    expect(session.snapshot.bodyTurn).toBe(expected!);
    const destination = {
      bodyId: 'body-8',
      x: session.snapshot.pose.position.x / content.doc.grid.cellUnits,
      z: session.snapshot.pose.position.z / content.doc.grid.cellUnits
    };
    await DamoclesSession.prepareAtlasTravel(content, destination);
    expect(session.switchToPose('eris-spaceport-onfoot').kind).toBe('switched');
    expect(run(session, 'time')).toBe('time 12:00:00');
    expect(session.travelToAtlas(destination)).toEqual({ kind: 'travelled' });
    expect(session.snapshot.bodyTurn).toBe(expected!);
    expect(session.snapshot.impact).toEqual(
      new DamoclesSession(content, chosen).snapshot.impact
    );
  });

  test('reads and sets impact independently, retaining MORE TIME and saving the result', async () => {
    const content = await contentOf();
    const saved = (await sessionOf()).captureResume();
    const session = new DamoclesSession(content, {
      ...saved,
      clockAnchor: { clock: saved.elapsed, elapsed: saved.elapsed },
      clockLevel: 8
    });
    const turn = session.snapshot.bodyTurn;
    expect(run(session, 'impact 1:02:03')).toBe('impact 01-02-03 to impact');
    expect(run(session, 'impact')).toBe('impact 01-02-03 to impact');
    expect(session.snapshot.bodyTurn).toBe(turn);
    expect(session.captureResume().clockLevel).toBe(8);
    session.advance(4);
    expect(run(session, 'impact')).toBe('impact 01-02-02 to impact');
    expect(run(session, 'impact +2-03-04')).toBe(
      'impact 02-03-04 since impact'
    );
    expect(session.captureResume().impactPassed).toBe(true);
    const restored = new DamoclesSession(content, session.captureResume());
    expect(run(restored, 'impact')).toBe('impact 02-03-04 since impact');
    restored.advance(4);
    expect(run(restored, 'impact')).toBe('impact 02-03-05 since impact');
  });

  test('lets the Session run impact consequences when a set countdown crosses zero', async () => {
    const session = await sessionOf();
    expect(run(session, 'impact 0:00:01')).toBe('impact 00-00-01 to impact');
    expect(session.captureResume().destroyedBodies).toEqual([]);
    session.advance(2);
    expect(session.captureResume().impactPassed).toBe(true);
    expect(session.captureResume().destroyedBodies).toEqual([
      'body-29',
      'body-11'
    ]);
    expect(session.snapshot.screen.dead).toBe(true);
  });

  test('setting after impact positions the live comet directly without replaying destruction', async () => {
    const content = await contentOf();
    const system = readGammaSystem(
      await Bun.file('../payload/damocles/system.json').json()
    );
    const session = new DamoclesSession(content);
    expect(run(session, 'impact +0:00:02')).toBe(
      'impact 00-00-02 since impact'
    );
    const saved = session.captureResume();
    expect(saved.impactPassed).toBe(true);
    expect(saved.destroyedBodies).toEqual([]);
    // The sky and range scan read the clock and latch together; past zero the unlatched
    // comet has no centre, whereas the latched one continues along its recovered path.
    expect(
      cometCentre(system.comet, session.snapshot.impact, {
        drift: session.snapshot.drift,
        passed: session.snapshot.impactPassed
      })
    ).not.toBeNull();
    const restored = new DamoclesSession(content, saved);
    expect(restored.snapshot.impact).toEqual({ fraction: 0, seconds: 2 });
    expect(restored.snapshot.impactPassed).toBe(true);
    session.advance(1);
    expect(session.captureResume().destroyedBodies).toEqual([]);
    expect(run(session, 'impact 0:00:01')).toBe('impact 00-00-01 to impact');
    expect(session.captureResume().impactPassed).toBe(false);
  });

  test('rate changes Body rotation and impact together and survives a Save', async () => {
    const content = await contentOf();
    const normal = new DamoclesSession(content);
    const changed = new DamoclesSession(content);
    expect(run(changed, 'rate')).toBe('rate 1x');
    expect(run(changed, 'rate 0.25')).toBe('rate 0.25x');
    const turn = changed.snapshot.bodyTurn;
    const impact = changed.snapshot.impact.seconds;
    const normalTurn = normal.snapshot.bodyTurn;
    normal.advance(4);
    changed.advance(4);
    expect(changed.snapshot.impact.seconds - impact).toBe(1);
    expect((changed.snapshot.bodyTurn - turn) >>> 0).toBe(
      Math.floor(321 / 4) * 200
    );
    expect(normal.snapshot.bodyTurn - normalTurn).toBe(321 * 200);
    const restored = new DamoclesSession(content, changed.captureResume());
    expect(run(restored, 'rate')).toBe('rate 0.25x');
    changed.advance(4);
    restored.advance(4);
    expect(restored.captureResume()).toEqual(changed.captureResume());
    expect(run(changed, 'rate 2')).toBe('rate 2x');
    const fastTurn = changed.snapshot.bodyTurn;
    const fastImpact = changed.snapshot.impact.seconds;
    changed.advance(2);
    expect((changed.snapshot.bodyTurn - fastTurn) >>> 0).toBe(321 * 2 * 100);
    expect(changed.snapshot.impact.seconds - fastImpact).toBe(4);
    expect(run(changed, 'rate 1')).toBe('rate 1x');
    expect(
      executeDamoclesConsoleCommand({ kind: 'help' }, host(changed)).join(' ')
    ).toContain('rate');
  });

  test('rate changes preserve the clock reading and keep Body Time through travel', async () => {
    const content = await contentOf();
    const session = new DamoclesSession(content);
    run(session, 'time 12:00');
    run(session, 'rate 0.25');
    expect(run(session, 'time')).toBe('time 12:00:00');
    run(session, 'rate 1');
    session.advance(0.18);
    const impact = session.snapshot.impact;
    const local = session.bodyTime()!;
    for (const multiplier of [64, 0.0625, 2, 1]) {
      run(session, `rate ${multiplier}`);
      expect(session.snapshot.impact).toEqual(impact);
      expect(Math.abs(session.bodyTime()! - local)).toBeLessThan(0.1);
      expect(session.switchToPose('gaea-ur-city-4-2').kind).toBe('switched');
      expect(session.switchToPose('eris-spaceport-onfoot').kind).toBe(
        'switched'
      );
      expect(Math.abs(session.bodyTime()! - local)).toBeLessThan(0.1);
    }
    const before = session.captureResume();
    expect(() => session.setTimeRate(3)).toThrow();
    expect(session.captureResume()).toEqual(before);
  });

  test("rate preserves other Bodies' sky phases across travel and restore", async () => {
    const content = await contentOf();
    const source = new DamoclesSession(content);
    run(source, 'time 12:00');
    const saved = source.captureResume();
    const normal = new DamoclesSession(content, saved);
    normal.switchToPose('gaea-ur-city-4-2');
    const expected = normal.snapshot.bodyTurn;
    for (const multiplier of [2, 0.25, 64, 0.0625]) {
      const changed = new DamoclesSession(content, saved);
      run(changed, `rate ${multiplier}`);
      const identity = damoclesSaveIdentity(
        content.catalogue,
        content.presentationSha256
      );
      const encoded = encodeDamoclesSave({
        identity,
        savedAt: '2026-10-02T00:00:00.000Z',
        schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
        snapshot: changed.captureResume(),
        where: 'ERIS'
      });
      const decoded = decodeDamoclesSave(encoded, identity, {
        catalogue: content.catalogue,
        strings: content.strings
      }).snapshot;
      const restored = new DamoclesSession(content, decoded);
      for (const session of [changed, restored]) {
        expect(session.switchToPose('gaea-ur-city-4-2').kind).toBe('switched');
        expect(session.snapshot.bodyTurn).toBe(expected);
      }
      changed.advance(1);
      restored.advance(1);
      expect(restored.captureResume()).toEqual(changed.captureResume());
    }
  });

  test('migrates existing Saves and refuses corrupt rotation origins', async () => {
    const content = await contentOf();
    const session = new DamoclesSession(content);
    const identity = damoclesSaveIdentity(
      content.catalogue,
      content.presentationSha256
    );
    const record = {
      identity,
      savedAt: '2026-10-02T00:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: session.captureResume(),
      where: 'ERIS'
    };
    const decode = (record: unknown) =>
      decodeDamoclesSave(JSON.stringify(record), identity, {
        catalogue: content.catalogue,
        strings: content.strings
      }).snapshot;
    const migrated = decode({
      ...record,
      schemaVersion: 26,
      snapshot: { ...record.snapshot, bodyTurnOrigins: undefined }
    });
    expect(migrated.bodyTurnOrigins).toBeNull();
    expect(new DamoclesSession(content, migrated).captureResume()).toEqual(
      session.captureResume()
    );
    for (const origins of [
      [],
      Array(30).fill(-1),
      Array(30).fill(2 ** 32),
      Array(30).fill(0.5),
      Array(30).fill('0')
    ]) {
      expect(() =>
        decode({
          ...record,
          snapshot: { ...record.snapshot, bodyTurnOrigins: origins }
        })
      ).toThrow('bodyTurnOrigins');
    }
  });

  test('rate rejects unsupported values without changing play', async () => {
    const session = await sessionOf();
    const before = session.captureResume();
    for (const line of [
      'rate 0',
      'rate -1',
      'rate 3',
      'rate 0.1',
      'rate 128',
      'rate Infinity',
      'rate NaN',
      'rate 2 extra'
    ]) {
      expect(() => parseDamoclesConsoleCommand(line, 16)).toThrow();
    }
    expect(session.captureResume()).toEqual(before);
    expect(parseDamoclesConsoleCommand('RATE 0.0625', 16)).toEqual({
      kind: 'setRate',
      multiplier: 0.0625
    });
    expect(parseDamoclesConsoleCommand('rate 64', 16)).toEqual({
      kind: 'setRate',
      multiplier: 64
    });
  });

  test('rejects days and malformed impact values', () => {
    for (const line of [
      'impact 24:00',
      'impact +24:00',
      'impact 1:60',
      'impact 1:02-03',
      'impact 1:00 extra'
    ]) {
      expect(() => parseDamoclesConsoleCommand(line, 16)).toThrow();
    }
  });
});
