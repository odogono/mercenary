import type { ShellLayer } from './router.ts';
import type { VisibilityTarget } from './suspension.ts';

type ListenerTarget = Pick<
  EventTarget,
  'addEventListener' | 'removeEventListener'
>;

export interface AudioLifecyclePresenter {
  readonly dispose: () => void;
  readonly resume: () => void;
  readonly suspend: () => void;
  readonly unlock: () => Promise<void>;
}

export interface AudioLifecycleOptions {
  readonly document: ListenerTarget & Pick<VisibilityTarget, 'hidden'>;
  readonly ownership: { readonly mayAdvance: () => boolean };
  readonly presenter: AudioLifecyclePresenter;
  readonly window: ListenerTarget;
}

export interface AudioLifecycle {
  /// The System Menu's `onLayer`: audio suspends under any chrome layer and resumes when play
  /// does.
  readonly layerChanged: (layer: ShellLayer) => void;
}

/// When a title's sound plays, shared by every boot that has a Gameplay Session (#513).
///
/// Audio starts only inside the first trusted `pointerdown` or `keydown`, captured before the
/// gesture's own action. It suspends when the window loses focus, the tab is hidden or a chrome
/// layer opens, and resumes only once none of those holds and the session may advance, so a
/// session owned elsewhere stays silent. The page hiding for good disposes it.
///
/// The layer is followed through `layerChanged` rather than read from the menu, so this can be
/// installed before the menu that reports to it.
export const installAudioLifecycle = ({
  document,
  ownership,
  presenter,
  window
}: AudioLifecycleOptions): AudioLifecycle => {
  let layer: ShellLayer = 'none';
  const mayPlay = (): boolean =>
    !document.hidden && layer === 'none' && ownership.mayAdvance();

  window.addEventListener('pagehide', () => presenter.dispose());
  window.addEventListener('blur', () => presenter.suspend());
  window.addEventListener('focus', () => {
    if (mayPlay()) {
      presenter.resume();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      presenter.suspend();
    } else if (mayPlay()) {
      presenter.resume();
    }
  });

  const unlock = (event: Event): void => {
    if (!event.isTrusted) {
      return;
    }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    void presenter
      .unlock()
      .then(() => {
        if (!mayPlay()) {
          presenter.suspend();
        }
      })
      .catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  return {
    layerChanged: next => {
      layer = next;
      if (layer === 'none') {
        presenter.resume();
      } else {
        presenter.suspend();
      }
    }
  };
};
