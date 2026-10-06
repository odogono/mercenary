import { sceneLighting, sunlight } from '../enhanced/lighting.ts';
import { placementUnderPointer } from '../enhanced/pointer.ts';
import { ENHANCED_PRESENTATION } from '../enhanced/presentation.ts';
import { FrameRenderer } from '../rendering/renderer.ts';
import {
  DEFAULT_AMBIENT_LIGHT,
  DEFAULT_CAST_SHADOWS,
  DEFAULT_SHADOW_DEPTH,
  type CastShadows,
  type LightLevel
} from '../settings/index.ts';
import {
  planDionEnhancedFrame,
  type DionEnhancedScene
} from './enhancedScene.ts';

export type DionPresentationPreset = 'authentic' | 'enhanced';

export interface DionLightPreferences {
  readonly ambientLight?: LightLevel | undefined;
  readonly castShadows?: CastShadows | undefined;
  readonly shadowDepth?: LightLevel | undefined;
}

/// The Enhanced viewer Damocles shows, for Mercenary III (ADR 0077): the shared planner's
/// frame of the session's Enhanced scene, drawn by the shared renderer with Sunlight and Cast
/// Shadows, filling the surface above the panel. The panel keeps the ST's own pixels, in a
/// canvas of its own below the view.
///
/// The settings page owns the choice and the preferences store keeps it; this shows it. A graphics
/// failure holds the view at Authentic without changing the stored choice, until the player
/// chooses again (ADR 0062).
export const installDionPresentation = (options: {
  readonly light: () => DionLightPreferences;
  readonly notice: (message: string) => void;
  readonly onRecovered: () => void;
  /// The view stopped or started showing what is stored.
  readonly onShownChange: () => void;
  readonly redraw: () => void;
  /// The Authentic screen, whose parent holds the Enhanced view and panel beside it.
  readonly screen: HTMLCanvasElement;
  /// The stored choice; absent is Enhanced, as Damocles's is (ADR 0077).
  readonly stored: () => DionPresentationPreset;
}) => {
  let held = false;
  let retrying = false;
  let renderer: FrameRenderer | undefined;
  let gpu: HTMLCanvasElement | undefined;
  let panel: HTMLCanvasElement | undefined;
  let last: DionEnhancedScene | undefined;
  const container = options.screen.parentElement!;
  const shown = (): DionPresentationPreset =>
    held ? 'authentic' : options.stored();
  const refresh = (): void => {
    options.screen.dataset['presentation'] = shown();
    container.dataset['presentation'] = shown();
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
  resize.observe(container);
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
  const panelCanvas = (): HTMLCanvasElement => {
    if (panel === undefined) {
      panel = document.createElement('canvas');
      panel.id = 'dion-panel';
      panel.width = 320;
      panel.height = 64;
      panel.setAttribute('aria-hidden', 'true');
      container.append(panel);
    }
    return panel;
  };
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
      panel?.remove();
      panel = undefined;
    },
    /// The panel's 320 by 64 pixels and the scene the view is drawn from, built only while
    /// the view is Enhanced.
    render(
      sceneOf: () => DionEnhancedScene,
      panelPixels: Uint8ClampedArray<ArrayBuffer>
    ): void {
      refresh();
      if (shown() === 'authentic') {
        if (gpu !== undefined) {
          gpu.hidden = true;
        }
        if (panel !== undefined) {
          panel.hidden = true;
        }
        return;
      }
      try {
        if (renderer === undefined) {
          gpu = document.createElement('canvas');
          gpu.id = 'dion-enhanced-view';
          gpu.setAttribute('aria-hidden', 'true');
          container.prepend(gpu);
          renderer = new FrameRenderer(
            gpu,
            {
              cullBackFaces: ENHANCED_PRESENTATION.rendering.cullBackFaces,
              lighting: true
            },
            () => {
              fallback(new Error('The graphics context was lost.'));
              options.redraw();
            }
          );
        }
        gpu!.hidden = false;
        const strip = panelCanvas();
        strip.hidden = false;
        strip
          .getContext('2d')
          ?.putImageData(new ImageData(panelPixels, 320, 64), 0, 0);
        const scene = sceneOf();
        const plan = planDionEnhancedFrame(scene, renderer.outputHeight);
        last = scene;
        // A Cast Shadow is Enhanced only, and the player may turn it off. Only Sunlight casts
        // one, and a frame without Sunlight draws every face in its recovered colour.
        const light = options.light();
        const sun =
          scene.sun === null ||
          scene.inSpace ||
          (light.castShadows ?? DEFAULT_CAST_SHADOWS) !== 'on'
            ? null
            : sunlight({
                daylight: scene.daylight,
                enclosed: plan.enclosed,
                sky: scene.sky?.bodies ?? [],
                sun: scene.sun
              });
        renderer.render(
          plan,
          sun === null
            ? undefined
            : {
                lighting: sceneLighting(
                  ENHANCED_PRESENTATION.lighting,
                  scene.pose,
                  sun,
                  {
                    ambient:
                      (light.ambientLight ?? DEFAULT_AMBIENT_LIGHT) / 100,
                    shadowDepth:
                      (light.shadowDepth ?? DEFAULT_SHADOW_DEPTH) / 100
                  }
                )
              }
        );
        if (retrying) {
          retrying = false;
          options.onRecovered();
        }
      } catch (error) {
        fallback(error);
      }
    },
    shown,
    /// Whether a press at the client point lands on the resident in `slot`, as the Enhanced
    /// view draws it; undefined while the view is Authentic.
    targetAt(
      client: { readonly x: number; readonly y: number },
      slot: number | undefined,
      hitSlop: number
    ): boolean | undefined {
      if (shown() === 'authentic' || gpu === undefined || last === undefined) {
        return undefined;
      }
      const resident = last.residents.find(
        placement => placement.id === `object-slot-${slot}`
      );
      if (slot === undefined || resident?.mesh === undefined) {
        return false;
      }
      const box = gpu.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        return false;
      }
      return placementUnderPointer(
        last.pose,
        { ...resident, mesh: resident.mesh },
        ENHANCED_PRESENTATION.camera,
        { height: box.height, width: box.width },
        { x: client.x - box.left, y: client.y - box.top },
        hitSlop
      );
    }
  };
};
