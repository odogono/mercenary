import type { FrameDescription } from '../rendering/description.ts';
import { FrameRenderer } from '../rendering/renderer.ts';

export type DionPresentationPreset = 'authentic' | 'enhanced';

/// A GPU world view over the existing screen. The Title still owns its indexed panel beneath it.
///
/// The settings page owns the choice and the preferences store keeps it; this shows it. A graphics
/// failure holds the view at Authentic without changing the stored choice, until the player
/// chooses again (ADR 0062).
export const installDionPresentation = (options: {
  readonly notice: (message: string) => void;
  readonly onRecovered: () => void;
  /// The view stopped or started showing what is stored.
  readonly onShownChange: () => void;
  readonly redraw: () => void;
  readonly screen: HTMLCanvasElement;
  /// The stored choice; Mercenary III has no tuning document, so absent is Authentic (ADR 0060).
  readonly stored: () => DionPresentationPreset;
}) => {
  let held = false;
  let retrying = false;
  let renderer: FrameRenderer | undefined;
  let gpu: HTMLCanvasElement | undefined;
  const shown = (): DionPresentationPreset =>
    held ? 'authentic' : options.stored();
  const refresh = (): void => {
    options.screen.dataset['presentation'] = shown();
  };
  const discardGpu = (): void => {
    renderer?.dispose();
    renderer = undefined;
    gpu?.remove();
    gpu = undefined;
  };
  const fallback = (error: unknown): void => {
    held = true;
    retrying = false;
    discardGpu();
    refresh();
    options.onShownChange();
    options.notice(
      `Enhanced unavailable. Using Authentic: ${error instanceof Error ? error.message : String(error)}`
    );
  };
  refresh();
  const redrawOnResize = (): void => {
    if (shown() === 'enhanced') {
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
    /// The player chose a preset, perhaps the one already stored: that is a retry.
    changed(): void {
      if (held) {
        held = false;
        retrying = true;
      }
      refresh();
      options.redraw();
    },
    dispose(): void {
      resize.disconnect();
      window.removeEventListener('resize', redrawOnResize);
      density.removeEventListener('change', densityChanged);
      discardGpu();
    },
    render(description: FrameDescription): void {
      if (shown() === 'authentic') {
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
        if (retrying) {
          retrying = false;
          options.onRecovered();
        }
      } catch (error) {
        fallback(error);
      }
    },
    shown
  };
};
