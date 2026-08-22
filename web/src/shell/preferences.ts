import {
  DEFAULT_WIREFRAME_GLOW,
  DEFAULT_WIREFRAME_THICKNESS,
  isPresentationPreset,
  type PresentationSettings
} from '../settings/index.ts';
import type { ReadStorage, WriteStorage } from './storage.ts';

/// How thick the wireframe's lines are drawn, as named levels rather than raw pixels.
export type WireframeWeight = 'fine' | 'bold' | 'heavy';

/// How much soft halo each wireframe line carries.
export type WireframeGlow = 'off' | 'soft' | 'bright';

/// Which visual treatment the Benson Panel wears.
export type PanelRendition = 'targ' | 'damocles';

/// Which Display Composition the Game Surface presents.
export type Composition = 'panel' | 'strip';

export const PREFERENCES_STORAGE_KEY = 'mercenary.browser-shell.preferences.v1';

/// The player's own presentation choices, kept beside the tracked tuning document.
///
/// Only presentation belongs here. The flight, message and script blocks are part of a Save's
/// identity, so a player who could edit them would silently make their own Saves unloadable;
/// those stay in `settings.json` alone.
export interface Preferences {
  readonly composition: Composition;
  readonly panelRendition: PanelRendition;
  /// Absent means "whatever the tuning document says".
  readonly presentationPreset?: PresentationSettings['preset'];
  readonly wireframeGlow?: WireframeGlow;
  readonly wireframeWeight?: WireframeWeight;
}

export const DEFAULT_PREFERENCES: Preferences = {
  composition: 'panel',
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
  return {
    composition: isComposition(source['composition'])
      ? source['composition']
      : DEFAULT_PREFERENCES.composition,
    panelRendition: isRendition(source['panelRendition'])
      ? source['panelRendition']
      : DEFAULT_PREFERENCES.panelRendition,
    // Spread rather than assign: an absent choice must stay absent, not become `undefined`.
    ...(isPresentationPreset(preset) ? { presentationPreset: preset } : {}),
    ...(isGlow(source['wireframeGlow'])
      ? { wireframeGlow: source['wireframeGlow'] as WireframeGlow }
      : {}),
    ...(isWeight(source['wireframeWeight'])
      ? { wireframeWeight: source['wireframeWeight'] as WireframeWeight }
      : {})
  };
};

export const readPreferences = (
  storage: ReadStorage | undefined
): Preferences => {
  try {
    const raw = storage?.getItem(PREFERENCES_STORAGE_KEY) ?? null;
    return raw === null
      ? DEFAULT_PREFERENCES
      : validatePreferences(JSON.parse(raw));
  } catch {
    // Unreadable or malformed storage is not a startup failure: the shell has defaults.
    return DEFAULT_PREFERENCES;
  }
};

export const writePreferences = (
  storage: WriteStorage | undefined,
  preferences: Preferences
): void => {
  try {
    storage?.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
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
      wireframe: {
        glow: DEFAULT_WIREFRAME_GLOW,
        thickness: DEFAULT_WIREFRAME_THICKNESS
      }
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
  return presentation;
};

/// What one edit to the preferences may say.
///
/// Choices are spelled with `undefined` allowed rather than merely optional, because handing
/// a choice back to the tuning document is itself a choice a player can make.
export interface PreferencesChange {
  readonly composition?: Composition;
  readonly panelRendition?: PanelRendition;
  readonly presentationPreset?: PresentationSettings['preset'] | undefined;
  readonly wireframeGlow?: WireframeGlow | undefined;
  readonly wireframeWeight?: WireframeWeight | undefined;
}

export interface PreferencesStore {
  readonly current: () => Preferences;
  readonly update: (change: PreferencesChange) => Preferences;
}

/// Own the live preferences: one place that narrows, persists, and applies them.
export const createPreferences = (options: {
  readonly onChange?: (preferences: Preferences) => void;
  readonly storage: Storage | undefined;
  readonly surface: HTMLElement;
}): PreferencesStore => {
  let preferences = readPreferences(options.storage);
  applyPreferences(options.surface, preferences);
  return {
    current: () => preferences,
    update: change => {
      const next = validatePreferences({ ...preferences, ...change });
      // Selecting what is already selected must not pay for a synchronous write, and must not
      // announce a change that later slices answer by rebuilding the renderer.
      if (
        next.composition === preferences.composition &&
        next.panelRendition === preferences.panelRendition &&
        next.presentationPreset === preferences.presentationPreset &&
        next.wireframeGlow === preferences.wireframeGlow &&
        next.wireframeWeight === preferences.wireframeWeight
      ) {
        return preferences;
      }
      preferences = next;
      applyPreferences(options.surface, preferences);
      writePreferences(options.storage, preferences);
      options.onChange?.(preferences);
      return preferences;
    }
  };
};
