import type { ConsoleElements } from './consoleView.ts';
import type { MenuPages } from './menu.ts';

/// Title-owned labels on otherwise shared System Menu and Shell Console chrome.

export interface ShellChromeCopy {
  readonly catalogueLabel: string;
  readonly menuTitle: string;
}

export interface InstalledShellChrome {
  readonly console: ConsoleElements;
  readonly newGame: HTMLButtonElement;
  readonly pages: MenuPages;
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

const page = (
  id: string,
  label: string,
  title: string,
  children: readonly Node[]
): HTMLElement =>
  el('div', {
    attrs: { 'aria-label': label, id, role: 'dialog' },
    children: [
      el('p', { className: 'chrome-title', text: title }),
      ...children
    ],
    className: 'chrome-page bezel'
  });

/// Mount the System Menu, settings, save chooser, ownership page and Shell Console.
///
/// Markup lives here so both Title documents share one overlay rather than copying it. Tokens
/// and layout stay in `chrome.css`.
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

  const menu = page('page-menu', 'System Menu', copy.menuTitle, [
    el('a', {
      attrs: { href: '/catalogue' },
      className: 'chrome-button',
      text: copy.catalogueLabel
    }),
    el('button', {
      attrs: { 'data-goto': 'settings', type: 'button' },
      className: 'chrome-button',
      text: 'SETTINGS'
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

  const settings = page('page-settings', 'Settings', 'SETTINGS', [
    settingRow('PANEL RENDITION', 'rendition'),
    settingRow('COMPOSITION', 'composition'),
    settingRow('TYPEFACE', 'typeface'),
    settingRow('SKY PRESET', 'sky'),
    settingRow('SHADOWS', 'shadows'),
    settingRow('STRUCTURES', 'structures'),
    settingRow(
      'STRUCTURE / OBJECT WEIGHT',
      'weight',
      'Structure and object weight'
    ),
    settingRow('STRUCTURE / OBJECT GLOW', 'glow', 'Structure and object glow'),
    settingRow('ROAD WEIGHT', 'road-weight', 'Road weight'),
    settingRow('ROAD GLOW', 'road-glow', 'Road glow'),
    el('div', {
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
    }),
    el('button', {
      attrs: { 'data-goto': 'menu', type: 'button' },
      className: 'chrome-button',
      text: 'BACK'
    })
  ]);

  const saves = page('page-saves', 'Save and load', 'SAVE / LOAD', [
    el('div', { attrs: { 'data-slot-rows': '', id: 'slot-rows' } }),
    el('button', {
      attrs: { 'data-goto': 'menu', type: 'button' },
      className: 'chrome-button',
      text: 'BACK'
    })
  ]);

  const shell = el('div', {
    attrs: { 'data-shell-chrome': '', id: 'shell-chrome' },
    children: [menu, ownership, settings, saves]
  });

  surface.append(consoleRoot, shell);
  if (surface.dataset['layer'] === undefined) {
    surface.dataset['layer'] = 'none';
  }

  return {
    console: { input, log, surface },
    newGame,
    pages: { menu, ownership, saves, settings },
    takeOver
  };
};
