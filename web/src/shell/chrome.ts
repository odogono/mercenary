import type { ConsoleElements } from './consoleView.ts';
import { CONTROL_PROFILE_NAME } from './input.ts';
import type { MenuPages } from './menu.ts';
import type { TypefaceId } from './typography.ts';

/// A row the settings page may carry. Each Title declares the rows it offers, in its order, and
/// the page has no others (ADR 0063).
export type SettingName =
  | 'audio'
  | 'composition'
  | 'extended'
  | 'glow'
  | 'presentation'
  | 'rendition'
  | 'road-glow'
  | 'road-weight'
  | 'shadows'
  | 'structures'
  | 'typeface'
  | 'weight';

/// The rows of the Titles that wear the Benson Panel and read the tuning document: Targ and
/// Damocles.
export const PANEL_SETTINGS: readonly SettingName[] = [
  'rendition',
  'composition',
  'typeface',
  'presentation',
  'shadows',
  'structures',
  'weight',
  'glow',
  'road-weight',
  'road-glow',
  'extended',
  'audio'
];

/// The Title Logo's stand-in until the Title's own mark is recovered: its name, in its typeface.
export interface TitleLogoCopy {
  readonly name: string;
  readonly typeface: TypefaceId;
}

/// Title-owned labels on otherwise shared System Menu and Shell Console chrome.

export interface ShellChromeCopy {
  /// Set only by a Title whose System the Atlas presents; omitted, the menu has no Atlas link.
  readonly atlasLabel?: string;
  /// The Title's catalogue link, if it has a catalogue; its destination is title-local.
  readonly catalogueLabel?: string;
  readonly cataloguePath?: string;
  readonly logo: TitleLogoCopy;
  readonly menuTitle: string;
  readonly settings: readonly SettingName[];
}

export interface InstalledShellChrome {
  readonly console: ConsoleElements;
  readonly newGame: HTMLButtonElement;
  readonly pages: MenuPages;
  /// Put the Title's recovered logo in place of its name on every page (ADR 0063).
  readonly showLogo: (image: ImageData) => void;
  readonly takeOver: HTMLButtonElement;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    readonly attrs?: Readonly<Record<string, string>>;
    readonly children?: readonly (Node | string)[];
    readonly className?: string;
    readonly text?: string;
  } = {}
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.attrs !== undefined) {
    for (const [name, value] of Object.entries(options.attrs)) {
      node.setAttribute(name, value);
    }
  }
  if (options.children !== undefined) {
    node.append(...options.children);
  }
  return node;
};

const settingRow = (
  label: string,
  setting: string,
  extra?: string
): HTMLElement =>
  el('div', {
    children: [
      el('span', { className: 'chrome-label', text: label }),
      el('div', {
        attrs:
          extra === undefined
            ? { 'data-setting': setting }
            : {
                'aria-label': extra,
                'data-setting': setting,
                role: 'group'
              },
        className: 'setting-choices'
      })
    ],
    className: 'setting-row'
  });

const SETTING_ROWS: Readonly<
  Record<
    Exclude<SettingName, 'audio'>,
    { readonly extra?: string; readonly label: string }
  >
> = {
  composition: { label: 'COMPOSITION' },
  extended: { extra: 'Extended controls', label: 'EXTENDED CONTROLS' },
  glow: {
    extra: 'Structure and object glow',
    label: 'STRUCTURE / OBJECT GLOW'
  },
  presentation: { extra: 'Presentation', label: 'PRESENTATION' },
  rendition: { label: 'PANEL RENDITION' },
  'road-glow': { extra: 'Road glow', label: 'ROAD GLOW' },
  'road-weight': { extra: 'Road weight', label: 'ROAD WEIGHT' },
  shadows: { label: 'SHADOWS' },
  structures: { label: 'STRUCTURES' },
  typeface: { label: 'TYPEFACE' },
  weight: {
    extra: 'Structure and object weight',
    label: 'STRUCTURE / OBJECT WEIGHT'
  }
};

/// The Title Logo at the head of a page: the Title's name until its mark is shown.
const titleLogo = (logo: TitleLogoCopy): HTMLElement =>
  el('div', {
    attrs: { 'data-typeface': logo.typeface },
    className: 'chrome-logo',
    text: logo.name
  });

const page = (
  logo: TitleLogoCopy,
  id: string,
  label: string,
  title: string,
  children: readonly Node[]
): HTMLElement =>
  el('div', {
    attrs: { 'aria-label': label, id, role: 'dialog' },
    children: [
      titleLogo(logo),
      el('p', { className: 'chrome-title', text: title }),
      ...children
    ],
    className: 'chrome-page bezel'
  });

/// Mount the System Menu, settings, Controls Page, save chooser, ownership page and Shell Console.
///
/// Markup lives here so every Title document shares one overlay rather than copying it. Tokens
/// are each Title document's own; layout stays in `chrome.css`.
export const installShellChrome = (
  surface: HTMLElement,
  copy: ShellChromeCopy
): InstalledShellChrome => {
  const log = el('div', {
    attrs: { 'aria-live': 'polite', id: 'console-log', role: 'log' }
  });
  const input = el('input', {
    attrs: {
      'aria-label': 'console command',
      autocapitalize: 'characters',
      autocomplete: 'off',
      id: 'console-input',
      spellcheck: 'false',
      type: 'text'
    }
  });
  const consoleRoot = el('div', {
    attrs: {
      'aria-label': 'Shell Console',
      'data-shell-chrome': '',
      id: 'console'
    },
    children: [
      log,
      el('div', {
        attrs: { id: 'console-input-row' },
        children: [
          el('span', { attrs: { 'aria-hidden': 'true' }, text: ']' }),
          input
        ]
      })
    ]
  });

  const newGame = el('button', {
    attrs: { id: 'new-game', type: 'button' },
    className: 'chrome-button',
    text: 'NEW GAME'
  });
  const takeOver = el('button', {
    attrs: { id: 'take-over', type: 'button' },
    className: 'chrome-button',
    text: 'TAKE OVER'
  });

  const menu = page(copy.logo, 'page-menu', 'System Menu', copy.menuTitle, [
    ...(copy.catalogueLabel === undefined
      ? []
      : [
          el('a', {
            attrs: { href: copy.cataloguePath ?? '/catalogue' },
            className: 'chrome-button',
            text: copy.catalogueLabel
          })
        ]),
    ...(copy.atlasLabel === undefined
      ? []
      : [
          el('a', {
            attrs: { href: '/damocles/atlas', id: 'menu-atlas' },
            className: 'chrome-button',
            text: copy.atlasLabel
          })
        ]),
    el('button', {
      attrs: { 'data-goto': 'settings', type: 'button' },
      className: 'chrome-button',
      text: 'SETTINGS'
    }),
    el('button', {
      attrs: { 'data-goto': 'controls', type: 'button' },
      className: 'chrome-button',
      text: 'CONTROLS'
    }),
    el('button', {
      attrs: { 'data-goto': 'saves', type: 'button' },
      className: 'chrome-button',
      text: 'SAVE / LOAD'
    }),
    newGame,
    el('button', {
      attrs: { 'data-goto': 'none', type: 'button' },
      className: 'chrome-button',
      text: 'RESUME'
    })
  ]);

  const ownership = page(
    copy.logo,
    'page-ownership',
    'Session ownership',
    'SESSION ACTIVE IN ANOTHER TAB',
    [takeOver]
  );

  const mute = el('button', {
    attrs: {
      'aria-label': 'Mute audio',
      'aria-pressed': 'false',
      id: 'audio-mute',
      type: 'button'
    },
    className: 'chrome-button',
    text: 'SOUND ON'
  });
  const volume = el('input', {
    attrs: {
      'aria-label': 'Audio volume',
      id: 'audio-volume',
      max: '100',
      min: '0',
      step: '1',
      type: 'range',
      value: '100'
    }
  });
  const volumeValue = el('output', {
    attrs: { for: 'audio-volume', id: 'audio-volume-value' },
    text: '100'
  });

  const audio = el('div', {
    children: [
      el('label', {
        attrs: { for: 'audio-volume' },
        className: 'chrome-label',
        text: 'AUDIO'
      }),
      el('div', {
        children: [mute, volume, volumeValue],
        className: 'setting-choices audio-controls'
      })
    ],
    className: 'setting-row'
  });
  const settings = page(copy.logo, 'page-settings', 'Settings', 'SETTINGS', [
    ...copy.settings.map(name =>
      name === 'audio'
        ? audio
        : settingRow(SETTING_ROWS[name].label, name, SETTING_ROWS[name].extra)
    ),
    el('button', {
      attrs: { 'data-goto': 'menu', type: 'button' },
      className: 'chrome-button',
      text: 'BACK'
    })
  ]);

  const saves = page(copy.logo, 'page-saves', 'Save and load', 'SAVE / LOAD', [
    el('div', { attrs: { 'data-slot-rows': '', id: 'slot-rows' } }),
    el('button', {
      attrs: { 'data-goto': 'menu', type: 'button' },
      className: 'chrome-button',
      text: 'BACK'
    })
  ]);

  // Filled from the Title's Bindings each time it opens: see `controlsView.ts`.
  const controls = page(
    copy.logo,
    'page-controls',
    'Controls',
    `CONTROLS · ${CONTROL_PROFILE_NAME.toUpperCase()}`,
    [
      el('div', { attrs: { id: 'controls-groups' } }),
      el('button', {
        attrs: { 'data-goto': 'menu', type: 'button' },
        className: 'chrome-button',
        text: 'BACK'
      })
    ]
  );

  const shell = el('div', {
    attrs: { 'data-shell-chrome': '', id: 'shell-chrome' },
    children: [menu, ownership, settings, controls, saves]
  });

  surface.append(consoleRoot, shell);
  if (surface.dataset['layer'] === undefined) {
    surface.dataset['layer'] = 'none';
  }

  const pages = { controls, menu, ownership, saves, settings };
  return {
    console: { input, log, surface },
    newGame,
    pages,
    showLogo: image => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d')?.putImageData(image, 0, 0);
      const source = canvas.toDataURL();
      for (const shown of Object.values(pages)) {
        const slot = shown.querySelector<HTMLElement>('.chrome-logo')!;
        slot.replaceChildren(
          el('img', {
            attrs: {
              alt: copy.logo.name,
              height: String(image.height),
              src: source,
              width: String(image.width)
            }
          })
        );
      }
    },
    takeOver
  };
};
