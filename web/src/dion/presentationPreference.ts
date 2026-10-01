import type { ReadStorage, WriteStorage } from '../shell/storage.ts';

export type DionPresentationPreset = 'authentic' | 'enhanced';
export const DION_PRESENTATION_KEY =
  'mercenary.browser-shell.dion.presentation.v1';

export const readDionPresentation = (
  storage: ReadStorage | undefined
): DionPresentationPreset => {
  try {
    const stored = storage?.getItem(DION_PRESENTATION_KEY);
    return stored !== null &&
      stored !== undefined &&
      JSON.parse(stored) === 'enhanced'
      ? 'enhanced'
      : 'authentic';
  } catch {
    return 'authentic';
  }
};
export const writeDionPresentation = (
  storage: WriteStorage | undefined,
  preset: DionPresentationPreset
): void => {
  try {
    storage?.setItem(DION_PRESENTATION_KEY, JSON.stringify(preset));
  } catch {
    /* The in-memory presentation choice survives unavailable storage. */
  }
};
