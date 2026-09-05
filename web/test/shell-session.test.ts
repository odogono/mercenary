import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { Bundle } from '../src/payload/documents.ts';
import {
  createWalkabout,
  requiredSettings,
  saveEnvironment
} from '../src/shell/session.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const settingsText = await Bun.file(
  join(repositoryRoot, 'settings.json')
).text();

describe('the live browser Gameplay Session', () => {
  test('starts the opening script on foot at the captured surface Pose', () => {
    const walkabout = createWalkabout(bundle, requiredSettings(settingsText));

    expect(walkabout.session.snapshot.location).toEqual({ kind: 'surface' });
    expect(walkabout.session.snapshot.occupancy).toEqual({ kind: 'onFoot' });
    expect(walkabout.session.snapshot.isScriptRunning).toBeTrue();
    expect(walkabout.session.snapshot.player.position).toEqual({
      x: 559_104,
      y: 128,
      z: 559_104
    });
  });

  for (const document of ['flight', 'text', 'benson', 'interaction'] as const) {
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
    const captured = original.captureSaveSnapshot();
    const stopped = {
      ...captured,
      benson: {
        ...captured.benson!,
        host: { ...captured.benson!.host, engineFlags: 0 },
        state: { ...captured.benson!.state, pc: null }
      }
    };

    const restored = createWalkabout(bundle, settings, stopped).session;

    expect(restored.snapshot.isScriptRunning).toBeFalse();
    expect(restored.captureSaveSnapshot()).toEqual(stopped);
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
        scripts: {
          ...settings.scripts,
          timeScale: settings.scripts.timeScale + 1
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
    const captured = original.captureSaveSnapshot();

    const restored = createWalkabout(bundle, settings, captured).session;

    expect(restored.captureSaveSnapshot()).toEqual(captured);
    expect(restored.snapshot.mode).toBe('flying');
    expect(restored.snapshot.occupancy).toEqual({ kind: 'aboard', slot: 1 });
  });

  test('restores carried objects, random Room rewiring, and the next RNG byte', () => {
    const settings = requiredSettings(settingsText);
    const original = createWalkabout(bundle, settings).session;
    const slot = original.content.objects[0]!.slot;
    original.carry(slot);
    original.teleport({ id: 114, kind: 'room' });
    const captured = original.captureSaveSnapshot();

    const restored = createWalkabout(bundle, settings, captured).session;
    const room = original.content.rooms.get(114)!;

    expect(restored.captureSaveSnapshot()).toEqual(captured);
    expect(restored.residenceOf(slot)).toEqual({ kind: 'carried' });
    expect(restored.doorwaysOf(room)).toEqual(original.doorwaysOf(room));
    expect(restored.scripts!.nextRandomByte()).toBe(
      original.scripts!.nextRandomByte()
    );
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
    expect(() =>
      createWalkabout(bundle, settings, {
        ...captured,
        benson: {
          ...captured.benson!,
          state: {
            ...captured.benson!.state,
            pc: 999_999
          }
        }
      })
    ).toThrow('program counter');
  });
});
