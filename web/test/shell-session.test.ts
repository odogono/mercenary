import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { Bundle } from '../src/payload/documents.ts';
import { load } from '../src/payload/load.ts';
import {
  createWalkabout,
  requiredSettings,
  saveEnvironment
} from '../src/shell/session.ts';
import { comparable } from './fixtures/save.ts';
import {
  loadPayload,
  readPayloadFile,
  repositoryRoot
} from './replay/artifacts.ts';

const bundle = await loadPayload();
const settingsText = await Bun.file(
  join(repositoryRoot, 'settings.json')
).text();

describe('the live browser Gameplay Session', () => {
  test('loads and plays without asking for the retired Benson program', async () => {
    const requested: string[] = [];
    const live = await load(async name => {
      requested.push(name);
      return readPayloadFile(name).catch(() => undefined);
    });
    expect(requested).not.toContain('benson.json');
    const session = createWalkabout(
      live,
      requiredSettings(settingsText)
    ).session;
    expect('program' in session.benson!).toBe(false);
    for (let seconds = 0; seconds < 20; seconds += 0.02) {
      session.advance(0.02);
    }
    expect(session.talk!.shown).toContain('CRASH IMMINENT,');
  });

  test('hands a new game what its Talk Scripts settled as they began', () => {
    const walkabout = createWalkabout(
      bundle,
      requiredSettings(settingsText),
      undefined,
      [
        {
          name: 'opening',
          replaces: [],
          source: 'on begin\n  tell sound to silence "voice1"\nend begin\n'
        }
      ]
    );
    expect(walkabout.opening?.events).toContainEqual({
      script: { sound: { symbol: 'voice1.control', value: 0 } }
    });
    expect(walkabout.session.settle().events).toEqual([]);
  });

  test('starts the opening on foot at the captured surface Pose', () => {
    const walkabout = createWalkabout(bundle, requiredSettings(settingsText));

    expect(walkabout.session.snapshot.location).toEqual({ kind: 'surface' });
    expect(walkabout.session.snapshot.occupancy).toEqual({ kind: 'onFoot' });
    // The opening is a Talk Script; Benson Script 0 no longer runs.
    expect(walkabout.session.talk!.replaces.has(0)).toBeTrue();
    expect(walkabout.session.snapshot.isScriptRunning).toBeFalse();
    expect(walkabout.session.snapshot.player.position).toEqual({
      x: 559_104,
      y: 128,
      z: 559_104
    });
  });

  for (const document of ['flight', 'text', 'interaction'] as const) {
    test(`refuses a Data Payload without its ${document} document`, () => {
      const incomplete = { ...bundle, [document]: undefined } as Bundle;

      expect(() =>
        createWalkabout(incomplete, requiredSettings(settingsText))
      ).toThrow(`${document}.json`);
    });
  }

  test('refuses missing settings rather than silently changing the feel', () => {
    expect(() => requiredSettings(undefined)).toThrow('settings.json');
  });

  test('uses the settings parser for malformed settings', () => {
    expect(() => requiredSettings('{')).toThrow(
      'Could not read settings from settings.json'
    );
  });

  test('restores a Save Snapshot without starting the opening script again', () => {
    const settings = requiredSettings(settingsText);
    const original = createWalkabout(bundle, settings).session;
    const stopped = original.captureSaveSnapshot();

    const restored = createWalkabout(bundle, settings, stopped).session;

    expect(restored.snapshot.isScriptRunning).toBeFalse();
    expect(comparable(restored.captureSaveSnapshot())).toEqual(
      comparable(stopped)
    );
  });

  test('refuses a Save whose story no longer loads, with New Game guidance (#933)', () => {
    const settings = requiredSettings(settingsText);
    const saved = createWalkabout(
      bundle,
      settings
    ).session.captureSaveSnapshot();
    const broken = { ...saved, talk: { ...saved.talk!, group: 'AAAAAAAA' } };

    expect(() => createWalkabout(bundle, settings, broken)).toThrow(
      'start a New Game'
    );
  });

  test('save compatibility excludes presentation but includes gameplay tuning', () => {
    const settings = requiredSettings(settingsText);
    const baseline = saveEnvironment(bundle, settings);

    expect(
      saveEnvironment(bundle, {
        ...settings,
        presentation: {
          ...settings.presentation,
          preset:
            settings.presentation.preset === 'authentic'
              ? 'enhanced'
              : 'authentic'
        }
      })
    ).toEqual(baseline);
    expect(
      saveEnvironment(bundle, {
        ...settings,
        message: {
          ...settings.message,
          waitSeconds: settings.message.waitSeconds + 1
        }
      })
    ).not.toEqual(baseline);
    expect(
      saveEnvironment(
        {
          ...bundle,
          sound: {
            ...bundle.sound,
            schemaVersion: bundle.sound.schemaVersion + 1
          }
        },
        settings
      )
    ).toEqual(baseline);
  });

  test('restores airborne mover and parked-craft state exactly', () => {
    const settings = requiredSettings(settingsText);
    const original = createWalkabout(bundle, settings).session;
    original.board(1);
    original.game = {
      ...original.game,
      mode: 'flying',
      player: {
        ...original.game.player,
        pitch: 0.4,
        roll: -0.2,
        speed: 72,
        yawVelocity: -3
      },
      throttle: 128
    };
    original.settle();
    const captured = original.captureSaveSnapshot();

    const restored = createWalkabout(bundle, settings, captured).session;

    expect(comparable(restored.captureSaveSnapshot())).toEqual(
      comparable(captured)
    );
    expect(restored.snapshot.mode).toBe('flying');
    expect(restored.snapshot.occupancy).toEqual({ kind: 'aboard', slot: 1 });
  });

  test('restores carried objects, random Room rewiring, and the next RNG byte', () => {
    const settings = requiredSettings(settingsText);
    const original = createWalkabout(bundle, settings).session;
    const slot = original.content.objects[0]!.slot;
    original.carry(slot);
    original.teleport({ id: 114, kind: 'room' });
    original.settle();
    const captured = original.captureSaveSnapshot();

    const restored = createWalkabout(bundle, settings, captured).session;
    const room = original.content.rooms.get(114)!;

    expect(comparable(restored.captureSaveSnapshot())).toEqual(
      comparable(captured)
    );
    expect(restored.residenceOf(slot)).toEqual({ kind: 'carried' });
    expect(restored.doorwaysOf(room)).toEqual(original.doorwaysOf(room));
    expect(restored.nextRandomByte()).toBe(original.nextRandomByte());
  });

  test('rejects snapshot references that do not exist in the current payload', () => {
    const settings = requiredSettings(settingsText);
    const captured = createWalkabout(
      bundle,
      settings
    ).session.captureSaveSnapshot();

    expect(() =>
      createWalkabout(bundle, settings, {
        ...captured,
        game: { ...captured.game, room: 999 }
      })
    ).toThrow('Room 999');
    expect(() =>
      createWalkabout(bundle, settings, {
        ...captured,
        game: { ...captured.game, craft: 999 }
      })
    ).toThrow('craft slot 999');
    expect(() =>
      createWalkabout(bundle, settings, {
        ...captured,
        residence: [[999, { kind: 'carried' }]]
      })
    ).toThrow('object slot 999');
  });
});
