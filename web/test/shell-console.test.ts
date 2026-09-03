import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { GameplaySession } from '../src/session/index.ts';
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
import type { TypefaceId } from '../src/shell/typography.ts';
import { emptyContent } from './fixtures/save.ts';

const CELL = 65_536;
const CELLS_PER_AXIS = 16;

/// The parser takes its grid bound from the world it reads for; the tests read for Targ's 16×16.
const parse = (line: string, cellsPerAxis = CELLS_PER_AXIS) =>
  parseConsoleCommand(line, cellsPerAxis);

const harness = (
  overrides: {
    readonly rooms?: readonly number[];
    readonly saveOutcomes?: readonly SaveOutcome[];
  } = {}
) => {
  const session = new GameplaySession(
    emptyContent(),
    playerState({ position: { x: 8.5 * CELL, y: 128, z: 8.5 * CELL } }),
    undefined
  );
  const changes: PreferencesChange[] = [];
  const faces: TypefaceId[] = [];
  const calls: string[] = [];
  const outcomes = [...(overrides.saveOutcomes ?? [])];
  const rooms = new Set(overrides.rooms ?? [5]);
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
    persistence,
    preferences: {
      current: () => ({ composition: 'panel', panelRendition: 'targ' }),
      update: change => {
        changes.push(change);
        return { composition: 'panel', panelRendition: 'targ' };
      }
    },
    session: () => session,
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

  test('reads a grid reference, and refuses one off the world', () => {
    expect(parse('goto 03 11')).toEqual({
      kind: 'gotoCell',
      x: 3,
      z: 11
    });
    expect(() => parse('goto 16 00')).toThrow(
      'a x cell must be from 0 through 15, and is 16'
    );
    expect(() => parse('goto 00 -1')).toThrow(
      'a z cell must be from 0 through 15, and is -1'
    );
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
      'goto takes two cells, or the word room and one Room'
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
      "unknown setting 'volume': try composition, glow, rendition, sky, structures, typeface, weight"
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
    expect(lines.join(' ')).toContain('save <slot>');
  });

  test('reports where the player is', () => {
    const { deps } = harness();

    expect(run('where', deps)).toEqual([
      'SURFACE · cell 08-08',
      'x 557056 y 128 z 557056',
      'on foot'
    ]);
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
