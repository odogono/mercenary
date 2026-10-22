import {
  DEFAULT_WIREFRAME_GLOW,
  DEFAULT_WIREFRAME_THICKNESS,
  isLightLevel,
  isPresentationPreset,
  isShadowDepth,
  isStructureReach,
  readCastShadows,
  type CastShadows,
  type LightLevel,
  type PresentationSettings,
  type ShadowDepth
} from '../settings/index.ts';
import type { ReadStorage, WriteStorage } from './storage.ts';
import { titleStorageKeys, type TitleSlug } from './title.ts';

/// How thick the wireframe's lines are drawn, as named levels rather than raw pixels.
export type WireframeWeight = 'fine' | 'bold' | 'heavy';

/// How much soft halo each wireframe line carries.
export type WireframeGlow = 'off' | 'soft' | 'bright';

/// Which visual treatment the Benson Panel wears.
export type PanelRendition = 'targ' | 'damocles';

/// Which Display Composition the Game Surface presents.
export type Composition = 'panel' | 'strip';

/// The one record Targ and Damocles shared before preferences were kept per Title (ADR 0063).
export const SHARED_PREFERENCES_STORAGE_KEY =
  'mercenary.browser-shell.preferences.v1';

/// Mercenary III's presentation choice, kept alone before it had a preferences record.
const DION_PRESENTATION_STORAGE_KEY =
  'mercenary.browser-shell.dion.presentation.v1';

/// Where a Title keeps its preferences, and what it read before it had a record of its own.
export interface PreferencesLocation {
  /// Read only while `key` holds nothing, so no choice made before ADR 0063 is lost; the first
  /// change writes the Title's own record.
  readonly earlier?: (storage: ReadStorage) => unknown;
  readonly key: string;
}

const storedJson = (storage: ReadStorage, key: string): unknown => {
  const raw = storage.getItem(key);
  return raw === null ? undefined : JSON.parse(raw);
};

export const titlePreferences = (slug: TitleSlug): PreferencesLocation => ({
  earlier:
    slug === 'dion'
      ? storage => {
          const preset = storedJson(storage, DION_PRESENTATION_STORAGE_KEY);
          return preset === undefined
            ? undefined
            : { presentationPreset: preset };
        }
      : storage => storedJson(storage, SHARED_PREFERENCES_STORAGE_KEY),
  key: titleStorageKeys(slug).preferences
});

/// The player's own presentation choices, kept beside the tracked tuning document.
///
/// Only presentation belongs here. The flight, message and script blocks are part of a Save's
/// identity, so a player who could edit them would silently make their own Saves unloadable;
/// those stay in `settings.json` alone.
export interface Preferences {
  /// Absent means full ambient light; like the edge, only Enhanced presentation shows it.
  readonly ambientLight?: LightLevel;
  readonly audioMuted: boolean;
  readonly audioVolume: number;
  /// Absent means the shell's own default edge; Authentic presentation ignores it.
  readonly castShadows?: CastShadows;
  readonly composition: Composition;
  /// Extended Controls: the Strafe and Free Look Extensions (ADR 0059), off by default. It is
  /// kept here and never in Session State, so turning it on or off leaves every Save as it was.
  readonly extendedControls: boolean;
  readonly panelRendition: PanelRendition;
  /// Absent means "whatever the tuning document says".
  readonly presentationPreset?: PresentationSettings['preset'];
  readonly roadGlow?: WireframeGlow;
  readonly roadWeight?: WireframeWeight;
  /// Absent means a Cast Shadow takes all the Sunlight away.
  readonly shadowDepth?: ShadowDepth;
  readonly structureReach?: PresentationSettings['structureReach'];
  readonly wireframeGlow?: WireframeGlow;
  readonly wireframeWeight?: WireframeWeight;
}

export const DEFAULT_PREFERENCES: Preferences = {
  audioMuted: false,
  audioVolume: 100,
  composition: 'panel',
  extendedControls: false,
  panelRendition: 'targ'
};

/// The pixels each named weight and glow level stands for, one vocabulary shared with the
/// settings page and the console.
export const WIREFRAME_WEIGHT_PIXELS: Readonly<
  Record<WireframeWeight, number>
> = { bold: 2, fine: 1, heavy: 3 };
export const WIREFRAME_GLOW_AMOUNT: Readonly<Record<WireframeGlow, number>> = {
  bright: 0.7,
  off: 0,
  soft: 0.35
};

const isRendition = (value: unknown): value is PanelRendition =>
  value === 'targ' || value === 'damocles';

const isComposition = (value: unknown): value is Composition =>
  value === 'panel' || value === 'strip';

const isWeight = (value: unknown): value is WireframeWeight =>
  value === 'fine' || value === 'bold' || value === 'heavy';

const isGlow = (value: unknown): value is WireframeGlow =>
  value === 'off' || value === 'soft' || value === 'bright';

/// Narrow whatever was stored to a usable set of preferences.
///
/// Every field falls back independently, so one unrecognised value cannot discard the rest, and
/// a document from a future shell degrades to defaults rather than failing to start.
export const validatePreferences = (value: unknown): Preferences => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DEFAULT_PREFERENCES;
  }
  const source = value as Record<string, unknown>;
  const preset = source['presentationPreset'];
  const volume = source['audioVolume'];
  return {
    audioMuted:
      typeof source['audioMuted'] === 'boolean'
        ? source['audioMuted']
        : DEFAULT_PREFERENCES.audioMuted,
    audioVolume:
      Number.isInteger(volume) &&
      (volume as number) >= 0 &&
      (volume as number) <= 100
        ? (volume as number)
        : DEFAULT_PREFERENCES.audioVolume,
    composition: isComposition(source['composition'])
      ? source['composition']
      : DEFAULT_PREFERENCES.composition,
    extendedControls:
      typeof source['extendedControls'] === 'boolean'
        ? source['extendedControls']
        : DEFAULT_PREFERENCES.extendedControls,
    panelRendition: isRendition(source['panelRendition'])
      ? source['panelRendition']
      : DEFAULT_PREFERENCES.panelRendition,
    // Spread rather than assign: an absent choice must stay absent, not become `undefined`.
    ...(isLightLevel(source['ambientLight'])
      ? { ambientLight: source['ambientLight'] }
      : {}),
    ...(isShadowDepth(source['shadowDepth'])
      ? { shadowDepth: source['shadowDepth'] }
      : {}),
    ...(readCastShadows(source['castShadows']) === undefined
      ? {}
      : { castShadows: readCastShadows(source['castShadows'])! }),
    ...(isPresentationPreset(preset) ? { presentationPreset: preset } : {}),
    ...(isStructureReach(source['structureReach'])
      ? { structureReach: source['structureReach'] }
      : {}),
    ...(isGlow(source['roadGlow']) ? { roadGlow: source['roadGlow'] } : {}),
    ...(isWeight(source['roadWeight'])
      ? { roadWeight: source['roadWeight'] }
      : {}),
    ...(isGlow(source['wireframeGlow'])
      ? { wireframeGlow: source['wireframeGlow'] as WireframeGlow }
      : {}),
    ...(isWeight(source['wireframeWeight'])
      ? { wireframeWeight: source['wireframeWeight'] as WireframeWeight }
      : {})
  };
};

export const readPreferences = (
  storage: ReadStorage | undefined,
  location: PreferencesLocation
): Preferences => {
  if (storage === undefined) {
    return DEFAULT_PREFERENCES;
  }
  try {
    const raw = storage.getItem(location.key);
    if (raw !== null) {
      return validatePreferences(JSON.parse(raw));
    }
    const earlier = location.earlier?.(storage);
    return earlier === undefined
      ? DEFAULT_PREFERENCES
      : validatePreferences(earlier);
  } catch {
    // Unreadable or malformed storage is not a startup failure: the shell has defaults.
    return DEFAULT_PREFERENCES;
  }
};

export const writePreferences = (
  storage: WriteStorage | undefined,
  location: PreferencesLocation,
  preferences: Preferences
): void => {
  try {
    storage?.setItem(location.key, JSON.stringify(preferences));
  } catch {
    // Holding the choice in memory does not depend on storage being available.
  }
};

/// Apply preferences to the Game Surface element the panel CSS keys off.
export const applyPreferences = (
  surface: HTMLElement,
  preferences: Preferences
): void => {
  surface.dataset['composition'] = preferences.composition;
  surface.dataset['rendition'] = preferences.panelRendition;
};

/// Compose the presentation block the renderer should use.
///
/// The preset is resolved first: Authentic always keeps the Reference Build's hairline, while
/// Enhanced may take the tuning document's wireframe or the player's stored weight and glow.
/// The sky's own numbers stay authored, and nothing here reaches the blocks that identify a Save.
export const effectivePresentation = (
  settings: PresentationSettings,
  preferences: Preferences
): PresentationSettings => {
  let presentation = settings;
  if (preferences.presentationPreset !== undefined) {
    presentation = { ...presentation, preset: preferences.presentationPreset };
  }
  if (presentation.preset === 'authentic') {
    return {
      ...presentation,
      roads: {
        glow: DEFAULT_WIREFRAME_GLOW,
        thickness: DEFAULT_WIREFRAME_THICKNESS
      },
      structureReach: 'cell',
      wireframe: {
        glow: DEFAULT_WIREFRAME_GLOW,
        thickness: DEFAULT_WIREFRAME_THICKNESS
      }
    };
  }
  if (preferences.structureReach !== undefined) {
    presentation = {
      ...presentation,
      structureReach: preferences.structureReach
    };
  }
  if (preferences.wireframeWeight !== undefined) {
    presentation = {
      ...presentation,
      wireframe: {
        ...presentation.wireframe,
        thickness: WIREFRAME_WEIGHT_PIXELS[preferences.wireframeWeight]
      }
    };
  }
  if (preferences.wireframeGlow !== undefined) {
    presentation = {
      ...presentation,
      wireframe: {
        ...presentation.wireframe,
        glow: WIREFRAME_GLOW_AMOUNT[preferences.wireframeGlow]
      }
    };
  }
  presentation = {
    ...presentation,
    roads: {
      glow:
        preferences.roadGlow === undefined
          ? presentation.roads.glow
          : WIREFRAME_GLOW_AMOUNT[preferences.roadGlow],
      thickness:
        preferences.roadWeight === undefined
          ? presentation.roads.thickness
          : WIREFRAME_WEIGHT_PIXELS[preferences.roadWeight]
    }
  };
  return presentation;
};

/// What one edit to the preferences may say.
///
/// Choices are spelled with `undefined` allowed rather than merely optional, because handing
/// a choice back to the tuning document is itself a choice a player can make.
export interface PreferencesChange {
  readonly ambientLight?: LightLevel | undefined;
  readonly audioMuted?: boolean;
  readonly audioVolume?: number;
  readonly castShadows?: CastShadows | undefined;
  readonly composition?: Composition;
  readonly extendedControls?: boolean;
  readonly panelRendition?: PanelRendition;
  readonly presentationPreset?: PresentationSettings['preset'] | undefined;
  readonly roadGlow?: WireframeGlow | undefined;
  readonly roadWeight?: WireframeWeight | undefined;
  readonly shadowDepth?: ShadowDepth | undefined;
  readonly structureReach?: PresentationSettings['structureReach'] | undefined;
  readonly wireframeGlow?: WireframeGlow | undefined;
  readonly wireframeWeight?: WireframeWeight | undefined;
}

export interface PreferencesStore {
  readonly current: () => Preferences;
  readonly update: (change: PreferencesChange) => Preferences;
}

/// Own the live preferences: one place that narrows, persists, and applies them.
export const createPreferences = (options: {
  readonly location: PreferencesLocation;
  readonly onChange?: (preferences: Preferences) => void;
  readonly storage: Storage | undefined;
  readonly surface: HTMLElement;
}): PreferencesStore => {
  let preferences = readPreferences(options.storage, options.location);
  applyPreferences(options.surface, preferences);
  return {
    current: () => preferences,
    update: change => {
      const next = validatePreferences({ ...preferences, ...change });
      // Selecting what is already selected must not pay for a synchronous write, and must not
      // announce a change that later slices answer by rebuilding the renderer.
      if (
        next.ambientLight === preferences.ambientLight &&
        next.audioMuted === preferences.audioMuted &&
        next.audioVolume === preferences.audioVolume &&
        next.castShadows === preferences.castShadows &&
        next.composition === preferences.composition &&
        next.extendedControls === preferences.extendedControls &&
        next.panelRendition === preferences.panelRendition &&
        next.presentationPreset === preferences.presentationPreset &&
        next.structureReach === preferences.structureReach &&
        next.roadGlow === preferences.roadGlow &&
        next.roadWeight === preferences.roadWeight &&
        next.shadowDepth === preferences.shadowDepth &&
        next.wireframeGlow === preferences.wireframeGlow &&
        next.wireframeWeight === preferences.wireframeWeight
      ) {
        return preferences;
      }
      preferences = next;
      applyPreferences(options.surface, preferences);
      writePreferences(options.storage, options.location, preferences);
      options.onChange?.(preferences);
      return preferences;
    }
  };
};
