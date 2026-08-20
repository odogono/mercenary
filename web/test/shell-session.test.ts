import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { Bundle } from '../src/payload/documents.ts';
import { createWalkabout, requiredSettings } from '../src/shell/session.ts';
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
});
