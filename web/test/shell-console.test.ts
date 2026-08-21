import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { GameplaySession } from '../src/session/index.ts';
import {
  SETTING_VALUES,
  executeConsoleCommand,
  parseConsoleCommand,
  type ConsoleDeps,
  type SettingName
} from '../src/shell/console.ts';
import type { PreferencesChange } from '../src/shell/preferences.ts';
import type { SaveOutcome, SavePersistence } from '../src/shell/saves.ts';
import type { TypefaceId } from '../src/shell/typography.ts';
import { emptyContent } from './fixtures/save.ts';

const CELL = 65_536;

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
  const command = parseConsoleCommand(line);
  return command === undefined ? [] : executeConsoleCommand(command, deps);
};

describe('reading a console command line', () => {
  test('ignores an empty line rather than complaining about it', () => {
    expect(parseConsoleCommand('')).toBeUndefined();
    expect(parseConsoleCommand('   ')).toBeUndefined();
  });

  test('does not care about case or spacing', () => {
    expect(parseConsoleCommand('  GoTo   Room   5 ')).toEqual({
      kind: 'gotoRoom',
      room: 5
    });
  });

  test('names the command it does not know', () => {
    expect(() => parseConsoleCommand('warp 3')).toThrow(
      "unknown command 'warp': type help"
    );
  });

  test('reads a grid reference, and refuses one off the world', () => {
    expect(parseConsoleCommand('goto 03 11')).toEqual({
      kind: 'gotoCell',
      x: 3,
      z: 11
    });
    expect(() => parseConsoleCommand('goto 16 00')).toThrow(
      'a x cell must be from 0 through 15, and is 16'
    );
    expect(() => parseConsoleCommand('goto 00 -1')).toThrow(
      'a z cell must be from 0 through 15, and is -1'
    );
  });

  test('refuses a grid reference that is not a number, rather than guessing', () => {
    // The session would take any number given to it, so nothing unusable may reach it.
    expect(() => parseConsoleCommand('goto north 4')).toThrow(
      "a x cell must be a whole number, and is 'north'"
    );
    expect(() => parseConsoleCommand('goto 3.5 4')).toThrow(
      'must be a whole number'
    );
    expect(() => parseConsoleCommand('goto NaN 4')).toThrow(
      'must be a whole number'
    );
  });

  test('counts the words a command needs', () => {
    expect(() => parseConsoleCommand('goto 3')).toThrow(
      'goto takes two cells, or the word room and one Room'
    );
    // A bare `goto room` is answered by the more specific message, not the general one.
    expect(() => parseConsoleCommand('goto room')).toThrow(
      'goto room takes one Room'
    );
    expect(() => parseConsoleCommand('goto room 5 6')).toThrow(
      'goto room takes one Room'
    );
    expect(() => parseConsoleCommand('load')).toThrow('load takes a slot');
    expect(() => parseConsoleCommand('panel')).toThrow(
      'panel takes one rendition'
    );
  });

  test('refuses Room zero, because the surface is not a Room', () => {
    expect(() => parseConsoleCommand('goto room 0')).toThrow(
      'Room 0 is not a Room: the surface is not one, so Rooms start at 1'
    );
    expect(() => parseConsoleCommand('goto room -3')).toThrow('is not a Room');
  });

  test('treats panel as the rendition setting it is', () => {
    expect(parseConsoleCommand('panel damocles')).toEqual({
      kind: 'set',
      name: 'rendition',
      value: 'damocles'
    });
    expect(() => parseConsoleCommand('panel sideways')).toThrow(
      "rendition takes targ, damocles, and not 'sideways'"
    );
  });

  test('accepts every setting the settings page offers, and only those', () => {
    for (const name of Object.keys(SETTING_VALUES) as SettingName[]) {
      for (const value of SETTING_VALUES[name]) {
        expect(parseConsoleCommand(`set ${name} ${value}`)).toEqual({
          kind: 'set',
          name,
          value
        });
      }
    }
    expect(() => parseConsoleCommand('set volume 4')).toThrow(
      "unknown setting 'volume': try composition, rendition, sky, typeface"
    );
    expect(() => parseConsoleCommand('set sky purple')).toThrow(
      "sky takes document, authentic, enhanced, and not 'purple'"
    );
    expect(() => parseConsoleCommand('set sky')).toThrow(
      'set takes a name and a value'
    );
  });

  test('reads a slot, and only a real one', () => {
    expect(parseConsoleCommand('save 2')).toEqual({
      confirm: false,
      kind: 'save',
      slot: 2
    });
    expect(parseConsoleCommand('save 2 confirm')).toEqual({
      confirm: true,
      kind: 'save',
      slot: 2
    });
    expect(() => parseConsoleCommand('save 4')).toThrow(
      'a slot must be 1, 2, or 3, and is 4'
    );
    expect(() => parseConsoleCommand('save 2 yes')).toThrow(
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
