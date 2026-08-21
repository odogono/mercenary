import type { ShellLayer } from './router.ts';

/// Where Escape takes the System Menu from wherever it is.
///
/// Escape closes what is open and otherwise opens the menu, so one key both enters and leaves
/// the chrome: from a page it steps back to the menu, and from the menu it returns to play.
export const escapeFrom = (layer: ShellLayer): ShellLayer => {
  switch (layer) {
    case 'none':
      return 'menu';
    case 'menu':
      return 'none';
    case 'saves':
    case 'settings':
      return 'menu';
  }
};

export interface MenuPages {
  readonly menu: HTMLElement;
  readonly saves: HTMLElement;
  readonly settings: HTMLElement;
}

export interface SystemMenuOptions {
  readonly onLayer?: (layer: ShellLayer) => void;
  readonly pages: MenuPages;
  /// Releases held input, exactly as suspension does.
  readonly release: () => void;
  readonly surface: HTMLElement;
}

export interface SystemMenu {
  readonly layer: () => ShellLayer;
  readonly show: (layer: ShellLayer) => void;
}

/// Own the System Menu and the pages it leads to.
///
/// The menu is Browser Shell chrome over a paused Game Surface, so opening it releases held
/// input the way losing focus does: a key held as the menu opened must not still be held when
/// play resumes.
export const installSystemMenu = (options: SystemMenuOptions): SystemMenu => {
  let layer: ShellLayer = 'none';

  const show = (next: ShellLayer): void => {
    if (next === layer) {
      return;
    }
    layer = next;
    options.surface.dataset['layer'] = layer;
    if (layer !== 'none') {
      options.release();
    }
    // Focus follows the page, so the keyboard reaches the buttons a player just revealed and
    // returns to the Game Surface when they leave.
    const page = layer === 'none' ? undefined : options.pages[layer];
    const first = page?.querySelector<HTMLElement>(
      'button:not([disabled]), [tabindex="0"]'
    );
    if (first === undefined || first === null) {
      (document.activeElement as HTMLElement | null)?.blur();
    } else {
      first.focus();
    }
    options.onLayer?.(layer);
  };

  options.surface.dataset['layer'] = 'none';
  for (const [name, page] of Object.entries(options.pages) as [
    string,
    HTMLElement
  ][]) {
    for (const button of page.querySelectorAll<HTMLElement>('[data-goto]')) {
      button.addEventListener('click', () => {
        show(button.dataset['goto'] as ShellLayer);
      });
    }
    // A page knows which layer it is, so nothing has to be told twice.
    page.dataset['page'] = name;
  }

  return { layer: () => layer, show };
};
