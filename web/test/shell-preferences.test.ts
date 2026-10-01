import { describe, expect, test } from 'bun:test';

import { defaultSettings } from '../src/settings/index.ts';
import {
  DEFAULT_PREFERENCES,
  SHARED_PREFERENCES_STORAGE_KEY,
  createPreferences,
  effectivePresentation,
  readPreferences,
  titlePreferences,
  validatePreferences,
  writePreferences,
  type Preferences
} from '../src/shell/preferences.ts';
import { saveEnvironment } from '../src/shell/session.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();

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

const TARG = titlePreferences('targ');

const surface = () =>
  ({ dataset: {} as Record<string, string> }) as unknown as HTMLElement;

describe('browser shell preferences', () => {
  test('default to the Benson Panel in its Targ rendition', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      audioMuted: false,
      audioVolume: 100,
      composition: 'panel',
      extendedControls: false,
      panelRendition: 'targ'
    });
    expect(readPreferences(undefined, TARG)).toEqual(DEFAULT_PREFERENCES);
  });

  test('round-trip through storage', () => {
    const { storage } = memoryStorage();
    const preferences: Preferences = {
      audioMuted: true,
      audioVolume: 37,
      composition: 'strip',
      extendedControls: false,
      panelRendition: 'damocles',
      presentationPreset: 'authentic',
      structureReach: 'all',
      wireframeGlow: 'soft',
      wireframeWeight: 'bold'
    };
    writePreferences(storage, TARG, preferences);
    expect(readPreferences(storage, TARG)).toEqual(preferences);
  });

  test('store under one versioned key', () => {
    const { entries, storage } = memoryStorage();
    writePreferences(storage, TARG, DEFAULT_PREFERENCES);
    expect([...entries.keys()]).toEqual([TARG.key]);
  });

  test('fall back field by field rather than discarding everything', () => {
    expect(
      validatePreferences({
        composition: 'nonsense',
        panelRendition: 'damocles'
      })
    ).toEqual({
      audioMuted: false,
      audioVolume: 100,
      composition: 'panel',
      extendedControls: false,
      panelRendition: 'damocles'
    });
  });

  test('reads old stored preferences with audio defaults and rejects bad levels', () => {
    expect(
      validatePreferences({ composition: 'strip', panelRendition: 'targ' })
    ).toMatchObject({ audioMuted: false, audioVolume: 100 });
    expect(
      validatePreferences({ audioMuted: true, audioVolume: 42 })
    ).toMatchObject({ audioMuted: true, audioVolume: 42 });
    expect(validatePreferences({ audioVolume: 101 }).audioVolume).toBe(100);
    expect(validatePreferences({ audioVolume: 10.5 }).audioVolume).toBe(100);
  });

  test('reject an unrecognised preset instead of passing it through', () => {
    expect(
      validatePreferences({ presentationPreset: 'cinematic' })
    ).not.toHaveProperty('presentationPreset');
  });

  test('keep a Cast Shadow edge and reject an unrecognised one', () => {
    expect(validatePreferences({ castShadows: 'hard' }).castShadows).toBe(
      'hard'
    );
    expect(validatePreferences({ castShadows: 'off' }).castShadows).toBe('off');
    expect(validatePreferences({ castShadows: 'blurry' })).not.toHaveProperty(
      'castShadows'
    );
    expect(validatePreferences({})).not.toHaveProperty('castShadows');
  });

  test('reject an unrecognised Structure Reach instead of passing it through', () => {
    expect(validatePreferences({ structureReach: 'ring' })).not.toHaveProperty(
      'structureReach'
    );
  });

  test('reject unrecognised wireframe choices instead of passing them through', () => {
    expect(
      validatePreferences({ wireframeWeight: 'chunky' })
    ).not.toHaveProperty('wireframeWeight');
    expect(
      validatePreferences({ wireframeGlow: 'blinding' })
    ).not.toHaveProperty('wireframeGlow');
  });

  test('ignore malformed and hostile storage', () => {
    const { entries, storage } = memoryStorage();
    entries.set(TARG.key, '{not json');
    expect(readPreferences(storage, TARG)).toEqual(DEFAULT_PREFERENCES);
    entries.set(TARG.key, '[]');
    expect(readPreferences(storage, TARG)).toEqual(DEFAULT_PREFERENCES);
    expect(readPreferences(hostileStorage(), TARG)).toEqual(
      DEFAULT_PREFERENCES
    );
    expect(() =>
      writePreferences(hostileStorage(), TARG, DEFAULT_PREFERENCES)
    ).not.toThrow();
  });

  test('keep each Title apart, each reading what it kept before until it writes its own', () => {
    const { entries, storage } = memoryStorage();
    entries.set(
      SHARED_PREFERENCES_STORAGE_KEY,
      '{"audioMuted":true,"panelRendition":"damocles"}'
    );
    const damocles = titlePreferences('damocles');
    expect(readPreferences(storage, TARG).audioMuted).toBe(true);
    expect(readPreferences(storage, damocles).panelRendition).toBe('damocles');
    // Mercenary III never shared that record: it reads its own earlier presentation choice.
    const dion = titlePreferences('dion');
    expect(readPreferences(storage, dion)).toEqual(DEFAULT_PREFERENCES);
    entries.set('mercenary.browser-shell.dion.presentation.v1', '"enhanced"');
    expect(readPreferences(storage, dion).presentationPreset).toBe('enhanced');

    createPreferences({ location: TARG, storage, surface: surface() }).update({
      audioMuted: false
    });
    expect(readPreferences(storage, TARG).audioMuted).toBe(false);
    expect(readPreferences(storage, TARG).panelRendition).toBe('damocles');
    expect(readPreferences(storage, damocles).audioMuted).toBe(true);
    expect(entries.get(SHARED_PREFERENCES_STORAGE_KEY)).toBe(
      '{"audioMuted":true,"panelRendition":"damocles"}'
    );
    expect([TARG.key, damocles.key, dion.key]).toEqual([
      'mercenary.browser-shell.targ.preferences.v1',
      'mercenary.browser-shell.damocles.preferences.v1',
      'mercenary.browser-shell.dion.preferences.v1'
    ]);
  });

  test('apply to the Game Surface as data attributes', () => {
    const element = surface();
    const store = createPreferences({
      location: TARG,
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
      location: TARG,
      onChange: preferences => seen.push(preferences),
      storage,
      surface: surface()
    });
    store.update({ panelRendition: 'damocles' });
    expect(store.current().panelRendition).toBe('damocles');
    expect(seen).toHaveLength(1);
    expect(readPreferences(storage, TARG).panelRendition).toBe('damocles');
  });

  test('override only presentation of the tuning document', () => {
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

  test('Authentic forces occupied-cell reach and Enhanced restores the stored choice', () => {
    const presentation = {
      ...defaultSettings().presentation,
      structureReach: 'cell' as const
    };
    const preferences = {
      ...DEFAULT_PREFERENCES,
      structureReach: 'all' as const
    };

    expect(
      effectivePresentation(presentation, preferences).structureReach
    ).toBe('all');
    expect(
      effectivePresentation(
        { ...presentation, preset: 'authentic' },
        preferences
      ).structureReach
    ).toBe('cell');
    expect(
      effectivePresentation(
        { ...presentation, preset: 'authentic' },
        { ...preferences, presentationPreset: 'enhanced' }
      ).structureReach
    ).toBe('all');
  });

  test('hands Structure Reach back to the tuning document', () => {
    const presentation = {
      ...defaultSettings().presentation,
      structureReach: 'all' as const
    };
    expect(
      effectivePresentation(presentation, DEFAULT_PREFERENCES).structureReach
    ).toBe('all');
  });

  test('does not persist or announce an unchanged Structure Reach', () => {
    const { storage } = memoryStorage();
    const seen: Preferences[] = [];
    const store = createPreferences({
      location: TARG,
      onChange: preferences => seen.push(preferences),
      storage,
      surface: surface()
    });

    store.update({ structureReach: 'all' });
    store.update({ structureReach: 'all' });

    expect(seen).toHaveLength(1);
    expect(readPreferences(storage, TARG).structureReach).toBe('all');
  });

  test('map the named wireframe levels onto the pixels they stand for', () => {
    const presentation = defaultSettings().presentation;
    const weighted = effectivePresentation(presentation, {
      ...DEFAULT_PREFERENCES,
      wireframeWeight: 'heavy'
    });
    expect(weighted.wireframe.thickness).toBe(3);
    expect(weighted.wireframe.glow).toBe(presentation.wireframe.glow);
    const glowing = effectivePresentation(presentation, {
      ...DEFAULT_PREFERENCES,
      wireframeGlow: 'bright'
    });
    expect(glowing.wireframe.glow).toBeCloseTo(0.7);
    expect(glowing.wireframe.thickness).toBe(presentation.wireframe.thickness);
    const both = effectivePresentation(presentation, {
      ...DEFAULT_PREFERENCES,
      wireframeGlow: 'soft',
      wireframeWeight: 'bold'
    });
    expect(both.wireframe).toEqual({ glow: 0.35, thickness: 2 });
    // An explicit "off" is a choice, not an absence: it must reach the renderer.
    const off = effectivePresentation(
      { ...presentation, wireframe: { ...presentation.wireframe, glow: 1 } },
      { ...DEFAULT_PREFERENCES, wireframeGlow: 'off' }
    );
    expect(off.wireframe.glow).toBe(0);
  });

  test('cannot change a Save environment', () => {
    // Preferences reach presentation only. If they ever touched flight, message or scripts,
    // a player changing a setting would make their own Saves unloadable.
    const settings = defaultSettings();
    const before = saveEnvironment(bundle, settings);
    const after = saveEnvironment(bundle, {
      ...settings,
      presentation: effectivePresentation(settings.presentation, {
        ...DEFAULT_PREFERENCES,
        structureReach: 'all'
      })
    });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});
