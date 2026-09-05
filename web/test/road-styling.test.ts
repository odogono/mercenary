import { expect, test } from 'bun:test';

import { defaultSettings, loadSettings } from '../src/settings/index.ts';
import {
  DEFAULT_PREFERENCES,
  createPreferences,
  effectivePresentation,
  readPreferences
} from '../src/shell/preferences.ts';

test('roads default independently and validate the same authored ranges', () => {
  expect(defaultSettings().presentation.roads).toEqual({
    glow: 0,
    thickness: 1
  });
  expect(
    loadSettings(
      '{"presentation":{"roads":{"thickness":2,"glow":0.5},"wireframe":{"glow":1}}}'
    ).presentation.roads
  ).toEqual({ glow: 0.5, thickness: 2 });
  for (const roads of [{ thickness: 0 }, { glow: 1.1 }, { glow: true }]) {
    expect(() =>
      loadSettings(JSON.stringify({ presentation: { roads } }))
    ).toThrow('presentation.roads');
  }
});

test('road choices persist independently, hand back to tuning, and Authentic overrides both', () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value)
  } as unknown as Storage;
  const store = createPreferences({
    storage,
    surface: { dataset: {} } as HTMLElement
  });
  store.update({
    roadGlow: 'soft',
    roadWeight: 'bold',
    wireframeGlow: 'bright',
    wireframeWeight: 'heavy'
  });
  const settings = defaultSettings().presentation;
  const selected = effectivePresentation(settings, readPreferences(storage));
  expect(selected.roads).toEqual({ glow: 0.35, thickness: 2 });
  expect(selected.wireframe).toEqual({ glow: 0.7, thickness: 3 });
  const authentic = effectivePresentation(settings, {
    ...store.current(),
    presentationPreset: 'authentic'
  });
  expect(authentic.roads).toEqual({ glow: 0, thickness: 1 });
  expect(authentic.wireframe).toEqual({ glow: 0, thickness: 1 });
  store.update({ roadGlow: undefined, roadWeight: undefined });
  expect(readPreferences(storage).roadWeight).toBeUndefined();
  expect(effectivePresentation(settings, store.current()).roads).toEqual(
    settings.roads
  );
  expect(
    effectivePresentation(settings, {
      ...DEFAULT_PREFERENCES,
      wireframeGlow: 'bright'
    }).roads
  ).toEqual({ glow: 0, thickness: 1 });
});
