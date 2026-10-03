import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { visible } from '../src/projection/index.ts';
import { GameplaySession, sessionContent } from '../src/session/index.ts';
import { defaultSettings, flightModel } from '../src/settings/index.ts';
import {
  SETTING_VALUES,
  executeConsoleCommand,
  parseConsoleCommand,
  type ConsoleCommand,
  type ConsoleDeps,
  type SettingName
} from '../src/shell/console.ts';
import type { PreferencesChange } from '../src/shell/preferences.ts';
import type { SaveOutcome, SavePersistence } from '../src/shell/saves.ts';
import { createWalkabout } from '../src/shell/session.ts';
import type { TypefaceId } from '../src/shell/typography.ts';
import { TargPresentationClock } from '../src/sky/time.ts';
import { World, atUnsignedSurfacePosition } from '../src/world/index.ts';
import { emptyContent } from './fixtures/save.ts';
import { loadPayload } from './replay/artifacts.ts';

const CELL = 65_536;
const CELLS_PER_AXIS = 256;
const bundle = await loadPayload();
const world = new World(bundle);
const content = sessionContent(
  world,
  bundle,
  flightModel(defaultSettings().flight, bundle.flight!, world.groundExtent)
);

/// The parser takes its grid bound from the world it reads for; the tests read for Targ's 16×16.
const parse = (line: string, cellsPerAxis = CELLS_PER_AXIS) =>
  parseConsoleCommand(line, cellsPerAxis);

const harness = (
  overrides: {
    readonly objectName?: (slot: number) => string | undefined;
    readonly rooms?: readonly number[];
    readonly saveOutcomes?: readonly SaveOutcome[];
    readonly session?: GameplaySession;
  } = {}
) => {
  const session =
    overrides.session ??
    new GameplaySession(
      emptyContent(),
      playerState({ position: { x: 8.5 * CELL, y: 128, z: 8.5 * CELL } }),
      undefined
    );
  const changes: PreferencesChange[] = [];
  const faces: TypefaceId[] = [];
  const calls: string[] = [];
  const outcomes = [...(overrides.saveOutcomes ?? [])];
  const rooms = new Set(overrides.rooms ?? [5]);
  const targClock = new TargPresentationClock(() => 24);
  const persistence = {
    armed: () => undefined,
    delete: () => ({ kind: 'done' }) as SaveOutcome,
    describe: () => ({ slot: 1, state: 'empty' }) as never,
    disarm: () => {
      calls.push('disarm');
    },
    dismiss: () => {},
    load: (slot: number) => {
      calls.push(`load ${slot}`);
      return outcomes.shift() ?? ({ kind: 'done' } as SaveOutcome);
    },
    message: () => ({ source: 'game', text: '' }) as never,
    onChange: () => {},
    save: (slot: number) => {
      calls.push(`save ${slot}`);
      return outcomes.shift() ?? ({ kind: 'done' } as SaveOutcome);
    }
  } as unknown as SavePersistence;
  const deps: ConsoleDeps = {
    cellSize: () => CELL,
    cellsPerAxis: () => CELLS_PER_AXIS,
    hasRoom: id => rooms.has(id),
    objectName:
      overrides.objectName ?? (slot => bundle.text?.messages[slot]?.text),
    objectSlots: () => world.objects.length,
    persistence,
    preferences: {
      current: () => ({
        audioMuted: false,
        audioVolume: 100,
        composition: 'panel',
        extendedControls: false,
        panelRendition: 'targ'
      }),
      update: change => {
        changes.push(change);
        return {
          audioMuted: false,
          audioVolume: 100,
          composition: 'panel',
          extendedControls: false,
          panelRendition: 'targ'
        };
      }
    },
    session: () => session,
    setTime: secondsOfDay =>
      targClock.set(session.snapshot.elapsed, secondsOfDay),
    time: () => targClock.secondsOfDay(session.snapshot.elapsed),
    typeface: face => faces.push(face)
  };
  return { calls, changes, deps, faces, session };
};

const run = (line: string, deps: ConsoleDeps): readonly string[] => {
  const command = parse(line);
  return command === undefined ? [] : executeConsoleCommand(command, deps);
};

describe('reading a console command line', () => {
  test('ignores an empty line rather than complaining about it', () => {
    expect(parse('')).toBeUndefined();
    expect(parse('   ')).toBeUndefined();
  });

  test('does not care about case or spacing', () => {
    expect(parse('  GoTo   Room   5 ')).toEqual({
      kind: 'gotoRoom',
      room: 5
    });
  });

  test('names the command it does not know', () => {
    expect(() => parse('warp 3')).toThrow("unknown command 'warp': type help");
  });

  test('reads a grid reference across the full 24-bit surface', () => {
    expect(parse('goto 03 11')).toEqual({
      kind: 'gotoCell',
      x: 3,
      z: 11
    });
    expect(parse('goto 136 136')).toEqual({
      kind: 'gotoCell',
      x: 136,
      z: 136
    });
    expect(() => parse('goto 256 00')).toThrow(
      'a x cell must be from 0 through 255, and is 256'
    );
    expect(() => parse('goto 00 -1')).toThrow(
      'a z cell must be from 0 through 255, and is -1'
    );
  });

  test('accepts an optional bounded altitude', () => {
    expect(parse('goto 136 136 4259008')).toEqual({
      height: 4_259_008,
      kind: 'gotoCell',
      x: 136,
      z: 136
    });
    expect(() => parse('goto 8 8 -1')).toThrow(
      'a height must be from 0 through 16777215, and is -1'
    );
    expect(() => parse('goto 8 8 16777216')).toThrow(
      'a height must be from 0 through 16777215, and is 16777216'
    );
  });

  test('reads an object slot across the payload object census', () => {
    expect(parse('goto object 0')).toEqual({ kind: 'gotoObject', slot: 0 });
    expect(parse('goto object 63')).toEqual({ kind: 'gotoObject', slot: 63 });
    expect(() => parse('goto object -1')).toThrow(
      'an object slot must be from 0 through 63, and is -1'
    );
    expect(() => parse('goto object 64')).toThrow(
      'an object slot must be from 0 through 63, and is 64'
    );
    expect(() => parse('goto object')).toThrow(
      'goto object takes one object slot'
    );
    expect(() => parse('goto object 1 2')).toThrow(
      'goto object takes one object slot'
    );
  });

  test('reads a request to get one object slot', () => {
    expect(parse('get 20')).toEqual({ kind: 'getObject', slot: 20 });
    expect(() => parse('get')).toThrow('get takes one object slot');
    expect(() => parse('get 20 21')).toThrow('get takes one object slot');
    expect(() => parse('get 64')).toThrow(
      'an object slot must be from 0 through 63, and is 64'
    );
  });

  test('reads a request to fetch one object slot', () => {
    expect(parse('fetch 20')).toEqual({ kind: 'fetchObject', slot: 20 });
    expect(() => parse('fetch')).toThrow('fetch takes one object slot');
    expect(() => parse('fetch 20 21')).toThrow('fetch takes one object slot');
    expect(() => parse('fetch 64')).toThrow(
      'an object slot must be from 0 through 63, and is 64'
    );
    expect(() =>
      parseConsoleCommand('fetch', CELLS_PER_AXIS, 256, 'selected')
    ).toThrow('fetch takes one object slot');
  });

  test('keeps where as the sole location-reporting command', () => {
    expect(parse('where')).toEqual({ kind: 'where' });
    expect(() => parse('where now')).toThrow('where takes no arguments');
    expect(() => parse('location')).toThrow(
      "unknown command 'location': type help"
    );
  });

  test('reads a time query and a bounded Targ local time', () => {
    expect(parse('time')).toEqual({ kind: 'time' });
    expect(parse('time 18:30')).toEqual({
      kind: 'setTime',
      secondsOfDay: 18 * 3600 + 30 * 60
    });
    expect(parse('time 9:00')).toEqual({
      kind: 'setTime',
      secondsOfDay: 9 * 3600
    });
    expect(parse('time 07-08-09')).toEqual({
      kind: 'setTime',
      secondsOfDay: 7 * 3600 + 8 * 60 + 9
    });
    for (const invalid of ['24:00', '12:60', '12:30:60', 'noon', '1:2']) {
      expect(() => parse(`time ${invalid}`)).toThrow(
        'a time must be H:MM or H:MM:SS'
      );
    }
    expect(() => parse('time 12:00 later')).toThrow(
      'time takes no value, or one H:MM[:SS] value'
    );
  });

  test('reads inventory without arguments', () => {
    expect(parse('inventory')).toEqual({ kind: 'inventory' });
    expect(() => parse('inventory now')).toThrow(
      'inventory takes no arguments'
    );
  });

  test('reads a drop selector as all text following the verb', () => {
    expect(parse('drop 42')).toEqual({ kind: 'dropObject', selector: '42' });
    expect(parse('drop Essential 12939 Supply')).toEqual({
      kind: 'dropObject',
      selector: 'essential 12939 supply'
    });
    expect(() => parse('drop')).toThrow('drop takes an object id or name');
  });

  test('takes its grid bound from the world it reads for', () => {
    // The bound is a caller's fact, not the parser's guess about one payload.
    expect(parse('goto 07 07', 8)).toEqual({
      kind: 'gotoCell',
      x: 7,
      z: 7
    });
    expect(() => parse('goto 08 00', 8)).toThrow(
      'a x cell must be from 0 through 7, and is 8'
    );
  });

  test('refuses a grid reference that is not a number, rather than guessing', () => {
    // The session would take any number given to it, so nothing unusable may reach it.
    expect(() => parse('goto north 4')).toThrow(
      "a x cell must be a whole number, and is 'north'"
    );
    expect(() => parse('goto 3.5 4')).toThrow('must be a whole number');
    expect(() => parse('goto NaN 4')).toThrow('must be a whole number');
  });

  test('counts the words a command needs', () => {
    expect(() => parse('goto 3')).toThrow(
      'goto takes two cells and an optional height, or the word room and one Room'
    );
    // A bare `goto room` is answered by the more specific message, not the general one.
    expect(() => parse('goto room')).toThrow('goto room takes one Room');
    expect(() => parse('goto room 5 6')).toThrow('goto room takes one Room');
    expect(() => parse('load')).toThrow('load takes a slot');
    expect(() => parse('panel')).toThrow('panel takes one rendition');
  });

  test('refuses Room zero, because the surface is not a Room', () => {
    expect(() => parse('goto room 0')).toThrow(
      'Room 0 is not a Room: the surface is not one, so Rooms start at 1'
    );
    expect(() => parse('goto room -3')).toThrow('is not a Room');
  });

  test('treats panel as the rendition setting it is', () => {
    expect(parse('panel damocles')).toEqual({
      kind: 'set',
      setting: { name: 'rendition', value: 'damocles' }
    });
    expect(() => parse('panel sideways')).toThrow(
      "rendition takes targ, damocles, and not 'sideways'"
    );
  });

  test('accepts every setting the settings page offers, and only those', () => {
    for (const name of Object.keys(SETTING_VALUES) as SettingName[]) {
      for (const value of SETTING_VALUES[name]) {
        // The vocabulary is read widened here; the parser returns it narrowed per setting.
        expect(parse(`set ${name} ${value}`)).toEqual({
          kind: 'set',
          setting: { name, value }
        } as ConsoleCommand);
      }
    }
    expect(() => parse('set volume 4')).toThrow(
      "unknown setting 'volume': try composition, extended, glow, rendition, road-glow, road-weight, shadows, sky, structures, typeface, weight"
    );
    expect(() => parse('set sky purple')).toThrow(
      "sky takes document, authentic, enhanced, and not 'purple'"
    );
    expect(() => parse('set weight chunky')).toThrow(
      "weight takes document, fine, bold, heavy, and not 'chunky'"
    );
    expect(() => parse('set structures ring')).toThrow(
      "structures takes document, cell, all, and not 'ring'"
    );
    expect(() => parse('set sky')).toThrow('set takes a name and a value');
  });

  test('reads a slot, and only a real one', () => {
    expect(parse('save 2')).toEqual({
      confirm: false,
      kind: 'save',
      slot: 2
    });
    expect(parse('save 2 confirm')).toEqual({
      confirm: true,
      kind: 'save',
      slot: 2
    });
    expect(() => parse('save 4')).toThrow(
      'a slot must be 1, 2, or 3, and is 4'
    );
    expect(() => parse('save 2 yes')).toThrow(
      "save takes the word confirm, not 'yes'"
    );
  });
});

describe('doing what a console command says', () => {
  test('lists its commands', () => {
    const { deps } = harness();
    const lines = run('help', deps);

    expect(lines.join(' ')).toContain('goto room');
    expect(lines.join(' ')).toContain('goto object');
    expect(lines.join(' ')).toContain('get <object-slot>');
    expect(lines.join(' ')).toContain('fetch <object-slot>');
    expect(lines.join(' ')).toContain('inventory');
    expect(lines.join(' ')).not.toContain('location');
    expect(lines.join(' ')).toContain('goto <x> <z> [height]');
    expect(lines.join(' ')).toContain('save <slot>');
    expect(lines.join(' ')).toContain('time [h]h:mm[:ss]');
  });

  test('reports and sets presentation time without changing Session State', () => {
    const { deps, session } = harness();

    expect(run('time', deps)).toEqual(['time 09:00:00']);
    expect(run('time 18:00', deps)).toEqual(['time 18:00:00']);
    expect(session.snapshot.elapsed).toBe(0);
    expect(run('time', deps)).toEqual(['time 18:00:00']);
  });

  test('reports where the player is', () => {
    const { deps } = harness();

    expect(run('where', deps)).toEqual([
      'SURFACE · cell 08-08',
      'position x 557056.000 y 128.000 z 557056.000',
      'orientation heading 0.000 pitch 0.000 roll 0.000 radians',
      'on foot'
    ]);
  });

  test('reports position and orientation rounded to three decimal places', () => {
    const session = new GameplaySession(
      emptyContent(),
      playerState({
        heading: Math.PI / 3,
        pitch: -0.125,
        position: { x: 557_056.25, y: 128.5, z: 557_055.75 },
        roll: 0.0625
      }),
      undefined
    );
    const { deps } = harness({ session });

    expect(run('where', deps)).toEqual([
      'SURFACE · cell 08-08',
      'position x 557056.250 y 128.500 z 557055.750',
      'orientation heading 1.047 pitch -0.125 roll 0.063 radians',
      'on foot'
    ]);
  });

  test('prints the Carried Stack one named object per line', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    const { deps } = harness({ session });
    session.carry(29);
    session.carry(43);

    expect(run('inventory', deps)).toEqual([
      '(29) NEUTRON FUEL',
      '(43) WINCHESTER'
    ]);
  });

  test('reports an empty inventory', () => {
    const { deps } = harness();

    expect(run('inventory', deps)).toEqual(['inventory is empty']);
  });

  test('drops a carried object by id or a distinctive part of its name', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    const { deps } = harness({ session });

    for (const selector of ['42', '12939', 'supply']) {
      session.carry(42);
      expect(run(`drop ${selector}`, deps)).toEqual([
        'dropped (42) ESSENTIAL 12939 SUPPLY'
      ]);
      expect(session.snapshot.carriedStack).not.toContain(42);
    }
  });

  test('prefers a carried object id over a numeric name match', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    session.carry(20);
    session.carry(42);
    const { deps } = harness({
      objectName: slot => (slot === 20 ? 'SUPPLY 42' : 'OTHER'),
      session
    });

    expect(run('drop 42', deps)).toEqual(['dropped (42) OTHER']);
    expect(session.snapshot.carriedStack).toEqual([20]);
  });

  test('refuses missing and ambiguous inventory name matches', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    session.carry(20);
    session.carry(21);
    const { deps } = harness({
      objectName: slot => (slot === 20 ? 'RED KEY' : 'BLUE KEY'),
      session
    });

    expect(run('drop wrench', deps)).toEqual([
      "no carried object matches 'wrench'"
    ]);
    expect(run('drop key', deps)).toEqual([
      "'key' matches more than one carried object: (20) RED KEY, (21) BLUE KEY"
    ]);
    expect(session.snapshot.carriedStack).toEqual([20, 21]);
  });

  test('reports ordinary drop refusals without changing inventory', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    const { deps } = harness({ session });

    expect(run('drop 42', deps)).toEqual(['inventory is empty']);

    session.carry(42);
    session.board(1);
    session.placeInAir({ ...session.snapshot.player.position, y: 10_000 });
    expect(run('drop supply', deps)).toEqual([
      'cannot drop objects while airborne'
    ]);
    expect(session.snapshot.carriedStack).toContain(42);
  });

  test('gets a remote object when the ordinary take rules allow it', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    const { deps } = harness({ session });

    expect(run('get 20', deps)).toEqual(['took object 20']);
    expect(session.snapshot.carriedStack).toContain(20);
    expect(session.snapshot.residence.get(20)).toEqual({ kind: 'carried' });
  });

  test('refuses to get an object that the ordinary take rules forbid', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    const { deps } = harness({ session });

    expect(run('get 10', deps)).toEqual(['object 10 is fixed in place']);
    expect(session.snapshot.carriedStack).not.toContain(10);
  });

  test('fetches a remote object to where a Drop would put it', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    const { deps } = harness({ session });
    const { position } = session.snapshot.player;

    expect(run('fetch 20', deps)).toEqual(['fetched object 20']);
    expect(session.snapshot.carriedStack).not.toContain(20);
    expect(session.snapshot.residence.get(20)).toEqual({
      at: {
        x: position.x,
        y: Math.floor(position.y / 0x1_00) * 0x1_00,
        z: position.z
      },
      kind: 'surface'
    });
  });

  test('fetches heavy objects but refuses fixed, carried and absent ones', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    const { deps } = harness({ session });

    expect(run('fetch 10', deps)).toEqual(['object 10 is fixed in place']);
    expect(run('fetch 8', deps)).toEqual(['object 08 is not in the world']);
    expect(run('fetch 2', deps)).toEqual(['fetched object 02']);
    session.carry(20);
    expect(run('fetch 20', deps)).toEqual([
      'object 20 is already carried; use drop'
    ]);
    expect(session.snapshot.carriedStack).toEqual([20]);
  });

  test('refuses to fetch while airborne', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    const { deps } = harness({ session });
    const before = session.snapshot.residence.get(20);

    session.board(1);
    session.placeInAir({ ...session.snapshot.player.position, y: 10_000 });
    expect(run('fetch 20', deps)).toEqual([
      'cannot fetch objects while airborne'
    ]);
    expect(session.snapshot.residence.get(20)).toEqual(before);
  });

  test('keeps all other take refusals and object states visible', () => {
    const session = createWalkabout(bundle, defaultSettings()).session;
    const { deps } = harness({ session });
    const before = session.snapshot.player;

    expect(run('get 2', deps)).toEqual(['object 02 is too heavy']);
    expect(run('get 8', deps)).toEqual(['object 08 is not in the world']);
    expect(run('get 20', deps)).toEqual(['took object 20']);
    expect(run('get 20', deps)).toEqual(['object 20 is already carried']);
    expect(session.snapshot.player).toEqual(before);

    for (let slot = 21; slot < 30; slot += 1) {
      session.carry(slot);
    }
    expect(run('get 30', deps)).toEqual(['inventory is full']);
    expect(session.snapshot.carriedStack).not.toContain(30);
  });

  test('goes to the middle of a cell, on the surface, at the altitude it found', () => {
    const { deps, session } = harness();
    session.teleport({ id: 5, kind: 'room' });

    expect(run('goto 03 11', deps)).toEqual(['moved to cell 03-11']);
    // The surface again, because placing alone would have moved them inside the Room.
    expect(session.snapshot.location).toEqual({ kind: 'surface' });
    expect(session.snapshot.player.position.x).toBeCloseTo(3.5 * CELL);
    expect(session.snapshot.player.position.z).toBeCloseTo(11.5 * CELL);
    // The altitude it found, not one invented for it.
    expect(session.snapshot.player.position.y).toBe(128);
  });

  test('places a flyable craft at the requested height', () => {
    const session = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 128, z: 0 } }),
      undefined
    );
    session.board(1);
    const { deps } = harness({ session });

    expect(run('goto 8 8 4259008', deps)).toEqual([
      'moved to cell 08-08 at height 4259008'
    ]);
    expect(session.snapshot.player.position).toEqual({
      x: 8.5 * CELL,
      y: 4_259_008,
      z: 8.5 * CELL
    });
    expect(session.snapshot.mode).toBe('flying');
    session.advance(1 / 60);
    expect(session.snapshot.player.position.y).toBe(4_259_008);
  });

  test('goes to the Colony Craft exact surface position', () => {
    const session = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 128, z: 0 } }),
      undefined
    );
    session.board(0);
    const { deps } = harness({ session });
    const colonyCraft = world.objects.find(object => object.slot === 63)!;

    expect(run('goto object 63', deps)).toEqual([
      'moved to object 63 on SURFACE'
    ]);
    expect(session.snapshot.location).toEqual({ kind: 'surface' });
    expect(session.snapshot.player.position).toEqual(colonyCraft.origin);
    expect(session.snapshot.mode).toBe('flying');
  });

  test('normalises a remote surface object into the unsigned world', () => {
    const session = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 128, z: 0 } }),
      undefined
    );
    session.board(0);
    const { deps } = harness({ session });
    const lift = world.objects.find(object => object.slot === 62)!;

    run('goto object 63', deps);
    expect(session.snapshot.mode).toBe('flying');
    expect(run('goto object 62', deps)).toEqual([
      'moved to object 62 on SURFACE'
    ]);
    expect(session.snapshot.player.position).toEqual(
      atUnsignedSurfacePosition(lift).origin
    );
    expect(session.snapshot.mode).toBe('grounded');
    expect(
      visible(world, session.snapshot.player.position, {
        residence: session.snapshot.residence
      }).detailedObjects
    ).toBeGreaterThan(0);
  });

  test('goes to an underground object in its Room', () => {
    const session = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 128, z: 0 } }),
      undefined
    );
    const { deps } = harness({ session });
    const interstellarShip = world.objects.find(object => object.slot === 7)!;

    expect(run('goto object 7', deps)).toEqual([
      'moved to object 07 in ROOM 05'
    ]);
    expect(session.snapshot.location).toEqual({ id: 5, kind: 'room' });
    expect(session.snapshot.player.position).toEqual(interstellarShip.origin);
  });

  test('starts an on-foot player falling from the requested height', () => {
    const session = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 128, z: 0 } }),
      undefined
    );
    const { deps } = harness({ session });

    run('goto 136 136 100000', deps);
    expect(session.snapshot.mode).toBe('flying');
    expect(session.snapshot.player.position.y).toBe(100_000);

    session.advance(1 / 60);
    expect(session.snapshot.player.position.y).toBeLessThan(100_000);
  });

  test('starts a player in the non-flyable Interstellar Ship falling too', () => {
    const session = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 128, z: 0 } }),
      undefined
    );
    session.board(7);
    const { deps } = harness({ session });

    run('goto 8 8 100000', deps);
    session.advance(1 / 60);
    expect(session.snapshot.player.position.y).toBeLessThan(100_000);
  });

  test('teleports to a Room the payload has', () => {
    const { deps, session } = harness({ rooms: [5] });

    expect(run('goto room 5', deps)).toEqual(['teleported to ROOM 05']);
    expect(session.snapshot.location).toEqual({ id: 5, kind: 'room' });
  });

  test('says so when a Room is not in the payload, rather than going nowhere', () => {
    const { deps, session } = harness({ rooms: [5] });

    // The session accepts any id in silence, leaving the player somewhere that draws nothing.
    expect(run('goto room 191', deps)).toEqual(['there is no Room 191']);
    expect(session.snapshot.location).toEqual({ kind: 'surface' });
  });

  test('sends each setting to the store that owns it', () => {
    const { changes, deps, faces } = harness();

    expect(run('set rendition damocles', deps)).toEqual(['rendition damocles']);
    expect(run('set composition strip', deps)).toEqual(['composition strip']);
    expect(run('set sky authentic', deps)).toEqual(['sky authentic']);
    expect(run('set typeface damocles', deps)).toEqual(['typeface damocles']);

    expect(changes).toEqual([
      { panelRendition: 'damocles' },
      { composition: 'strip' },
      { presentationPreset: 'authentic' }
    ]);
    // The typeface is not a preference: it keeps its own key.
    expect(faces).toEqual(['damocles']);
  });

  test('hands the sky back to the tuning document', () => {
    const { changes, deps } = harness();

    expect(run('set sky document', deps)).toEqual(['sky as tuned']);
    expect(changes).toEqual([{ presentationPreset: undefined }]);
  });

  test('turns Cast Shadows off and on, with no document to hand back to', () => {
    const { changes, deps } = harness();

    expect(run('set shadows off', deps)).toEqual(['shadows off']);
    expect(run('set shadows on', deps)).toEqual(['shadows on']);
    expect(changes).toEqual([{ castShadows: 'off' }, { castShadows: 'on' }]);
    expect(() => parse('set shadows document')).toThrow();
    expect(() => parse('set shadows soft')).toThrow();
  });

  test('sets Structure Reach and hands it back to the tuning document', () => {
    const { changes, deps } = harness();

    expect(run('set structures all', deps)).toEqual(['structures all']);
    expect(run('set structures cell', deps)).toEqual(['structures cell']);
    expect(run('set structures document', deps)).toEqual([
      'structures as tuned'
    ]);
    expect(changes).toEqual([
      { structureReach: 'all' },
      { structureReach: 'cell' },
      { structureReach: undefined }
    ]);
  });

  test('sets the wireframe weight and glow, and hands them back too', () => {
    const { changes, deps } = harness();

    expect(run('set weight bold', deps)).toEqual(['weight bold']);
    expect(run('set glow soft', deps)).toEqual(['glow soft']);
    expect(run('set weight document', deps)).toEqual(['weight as tuned']);
    expect(run('set glow off', deps)).toEqual(['glow off']);

    expect(changes).toEqual([
      { wireframeWeight: 'bold' },
      { wireframeGlow: 'soft' },
      { wireframeWeight: undefined },
      { wireframeGlow: 'off' }
    ]);
  });

  test('sets road styling independently and hands it back to tuning', () => {
    const { changes, deps } = harness();
    expect(run('set road-weight heavy', deps)).toEqual(['road-weight heavy']);
    expect(run('set road-glow bright', deps)).toEqual(['road-glow bright']);
    expect(run('set road-weight document', deps)).toEqual([
      'road-weight as tuned'
    ]);
    expect(run('set road-glow document', deps)).toEqual(['road-glow as tuned']);
    expect(changes).toEqual([
      { roadWeight: 'heavy' },
      { roadGlow: 'bright' },
      { roadWeight: undefined },
      { roadGlow: undefined }
    ]);
  });

  test('saves an empty slot outright', () => {
    const { calls, deps } = harness({ saveOutcomes: [{ kind: 'done' }] });

    expect(run('save 2', deps)).toEqual(['saved slot 2']);
    expect(calls).toEqual(['save 2']);
  });

  test('asks for confirm on an occupied slot, and leaves nothing armed', () => {
    const { calls, deps } = harness({ saveOutcomes: [{ kind: 'armed' }] });

    expect(run('save 1', deps)).toEqual([
      "slot 1 holds a Save: 'save 1 confirm' to overwrite"
    ]);
    // Disarming matters: an armed core plus a press in the chooser would overwrite a Save the
    // player never confirmed there.
    expect(calls).toEqual(['save 1', 'disarm']);
  });

  test('overwrites when confirmed, in one command', () => {
    const { calls, deps } = harness({
      saveOutcomes: [{ kind: 'armed' }, { kind: 'done' }]
    });

    expect(run('save 3 confirm', deps)).toEqual(['saved slot 3']);
    expect(calls).toEqual(['save 3', 'save 3']);
  });

  test('quotes a refusal rather than claiming success', () => {
    const { deps } = harness({
      saveOutcomes: [
        { kind: 'failed', reason: 'browser storage is unavailable' }
      ]
    });

    expect(run('save 1', deps)).toEqual([
      'save refused: browser storage is unavailable'
    ]);
  });

  test('quotes why a Save would not restore', () => {
    const { deps } = harness({
      saveOutcomes: [{ kind: 'failed', reason: 'slot 2 is empty' }]
    });

    expect(run('load 2', deps)).toEqual(['load refused: slot 2 is empty']);
  });

  test('restores a Save', () => {
    const { calls, deps } = harness({ saveOutcomes: [{ kind: 'done' }] });

    expect(run('load 1', deps)).toEqual(['restored slot 1']);
    expect(calls).toEqual(['load 1']);
  });
});
