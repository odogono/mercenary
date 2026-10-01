import type { FrameDescription } from '../rendering/description.ts';
import { FrameRenderer } from '../rendering/renderer.ts';
import {
  readDionPresentation,
  writeDionPresentation,
  type DionPresentationPreset
} from './presentationPreference.ts';

/// A GPU world view over the existing screen. The Title still owns its indexed panel beneath it.
export const installDionPresentation = (options: {
  readonly notice: (message: string) => void;
  readonly onRecovered: () => void;
  readonly page: HTMLElement;
  readonly redraw: () => void;
  readonly screen: HTMLCanvasElement;
  readonly storage: Storage | undefined;
}) => {
  let effective = readDionPresentation(options.storage);
  let failed = false;
  let renderer: FrameRenderer | undefined;
  let gpu: HTMLCanvasElement | undefined;
  const row = options.page
    .querySelector<HTMLElement>('[data-setting="sky"]')!
    .closest('.setting-row')!;
  row.querySelector('.chrome-label')!.textContent = 'PRESENTATION';
  const choices = row.querySelector<HTMLElement>('.setting-choices')!;
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', 'Presentation');
  const buttons = new Map<DionPresentationPreset, HTMLButtonElement>();
  const refresh = (): void => {
    options.screen.dataset['presentation'] = effective;
    for (const [mode, button] of buttons) {
      button.setAttribute('aria-pressed', String(mode === effective));
    }
  };
  const discardGpu = (): void => {
    renderer?.dispose();
    renderer = undefined;
    gpu?.remove();
    gpu = undefined;
  };
  const fallback = (error: unknown): void => {
    effective = 'authentic';
    failed = true;
    discardGpu();
    refresh();
    options.notice(
      `Enhanced unavailable. Using Authentic: ${error instanceof Error ? error.message : String(error)}`
    );
  };
  for (const mode of ['authentic', 'enhanced'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chrome-button';
    button.textContent = mode.toUpperCase();
    button.addEventListener('click', () => {
      effective = mode;
      writeDionPresentation(options.storage, mode);
      refresh();
      options.redraw();
    });
    buttons.set(mode, button);
    choices.append(button);
  }
  refresh();
  const redrawOnResize = (): void => {
    if (effective === 'enhanced') {
      options.redraw();
    }
  };
  const resize = new ResizeObserver(redrawOnResize);
  resize.observe(options.screen);
  window.addEventListener('resize', redrawOnResize);
  let density = window.matchMedia(
    `(resolution: ${window.devicePixelRatio}dppx)`
  );
  const densityChanged = (): void => {
    density.removeEventListener('change', densityChanged);
    density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    density.addEventListener('change', densityChanged);
    redrawOnResize();
  };
  density.addEventListener('change', densityChanged);
  return {
    dispose(): void {
      resize.disconnect();
      window.removeEventListener('resize', redrawOnResize);
      density.removeEventListener('change', densityChanged);
      discardGpu();
    },
    render(description: FrameDescription): void {
      if (effective === 'authentic') {
        if (gpu !== undefined) {
          gpu.hidden = true;
        }
        return;
      }
      try {
        if (renderer === undefined) {
          gpu = document.createElement('canvas');
          gpu.id = 'dion-enhanced-view';
          gpu.setAttribute('aria-hidden', 'true');
          options.screen.parentElement!.append(gpu);
          renderer = new FrameRenderer(gpu, { cullBackFaces: false }, () => {
            fallback(new Error('The graphics context was lost.'));
            options.redraw();
          });
        }
        gpu!.hidden = false;
        renderer.renderDescription(description);
        if (failed) {
          failed = false;
          options.onRecovered();
        }
      } catch (error) {
        fallback(error);
      }
    }
  };
};
