import { describe, expect, test } from 'bun:test';

import type { Bundle } from '../src/payload/documents.ts';
import { defaultSettings } from '../src/settings/index.ts';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  createPreferences,
  effectivePresentation,
  readPreferences,
  validatePreferences,
  writePreferences,
  type Preferences
} from '../src/shell/preferences.ts';
import { saveEnvironment } from '../src/shell/session.ts';

const memoryStorage = () => {
  const entries = new Map<string, string>();
  return {
    entries,
    storage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      }
    } as unknown as Storage
  };
};

const hostileStorage = (): Storage =>
  ({
    getItem: () => {
      throw new Error('storage is blocked');
    },
    setItem: () => {
      throw new Error('storage is blocked');
    }
  }) as unknown as Storage;

const surface = () =>
  ({ dataset: {} as Record<string, string> }) as unknown as HTMLElement;

const bundle = (): Bundle =>
  ({
    manifest: {
      decoderVersion: 'test-decoder',
      schemaVersion: 1,
      sourceCoreDigest: 'digest',
      sourceDatasetId: 'dataset'
    }
  }) as unknown as Bundle;

describe('browser shell preferences', () => {
  test('default to the Benson Panel in its Targ rendition', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      composition: 'panel',
      panelRendition: 'targ'
    });
    expect(readPreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  test('round-trip through storage', () => {
    const { storage } = memoryStorage();
    const preferences: Preferences = {
      composition: 'strip',
      panelRendition: 'damocles',
      presentationPreset: 'authentic'
    };
    writePreferences(storage, preferences);
    expect(readPreferences(storage)).toEqual(preferences);
  });

  test('store under one versioned key', () => {
    const { entries, storage } = memoryStorage();
    writePreferences(storage, DEFAULT_PREFERENCES);
    expect([...entries.keys()]).toEqual([PREFERENCES_STORAGE_KEY]);
  });

  test('fall back field by field rather than discarding everything', () => {
    expect(
      validatePreferences({
        composition: 'nonsense',
        panelRendition: 'damocles'
      })
    ).toEqual({ composition: 'panel', panelRendition: 'damocles' });
  });

  test('reject an unrecognised preset instead of passing it through', () => {
    expect(
      validatePreferences({ presentationPreset: 'cinematic' })
    ).not.toHaveProperty('presentationPreset');
  });

  test('ignore malformed and hostile storage', () => {
    const { entries, storage } = memoryStorage();
    entries.set(PREFERENCES_STORAGE_KEY, '{not json');
    expect(readPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
    entries.set(PREFERENCES_STORAGE_KEY, '[]');
    expect(readPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
    expect(readPreferences(hostileStorage())).toEqual(DEFAULT_PREFERENCES);
    expect(() =>
      writePreferences(hostileStorage(), DEFAULT_PREFERENCES)
    ).not.toThrow();
  });

  test('apply to the Game Surface as data attributes', () => {
    const element = surface();
    const store = createPreferences({
      storage: undefined,
      surface: element
    });
    expect(element.dataset['composition']).toBe('panel');
    expect(element.dataset['rendition']).toBe('targ');
    store.update({ composition: 'strip', panelRendition: 'damocles' });
    expect(element.dataset['composition']).toBe('strip');
    expect(element.dataset['rendition']).toBe('damocles');
  });

  test('persist and announce each change', () => {
    const { storage } = memoryStorage();
    const seen: Preferences[] = [];
    const store = createPreferences({
      onChange: preferences => seen.push(preferences),
      storage,
      surface: surface()
    });
    store.update({ panelRendition: 'damocles' });
    expect(store.current().panelRendition).toBe('damocles');
    expect(seen).toHaveLength(1);
    expect(readPreferences(storage).panelRendition).toBe('damocles');
  });

  test('override only the preset of the tuning document', () => {
    const presentation = defaultSettings().presentation;
    expect(effectivePresentation(presentation, DEFAULT_PREFERENCES)).toEqual(
      presentation
    );
    const overridden = effectivePresentation(presentation, {
      ...DEFAULT_PREFERENCES,
      presentationPreset: 'authentic'
    });
    expect(overridden.preset).toBe('authentic');
    expect(overridden.sky).toEqual(presentation.sky);
  });

  test('cannot change a Save environment', () => {
    // Preferences reach presentation only. If they ever touched flight, message or scripts,
    // a player changing a setting would make their own Saves unloadable.
    const settings = defaultSettings();
    const before = saveEnvironment(bundle(), settings);
    const after = saveEnvironment(bundle(), {
      ...settings,
      presentation: effectivePresentation(settings.presentation, {
        ...DEFAULT_PREFERENCES,
        presentationPreset: 'authentic'
      })
    });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});
