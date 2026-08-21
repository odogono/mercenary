import type { PreferencesStore } from './preferences.ts';
import { applyTypeface, readTypefacePreference } from './typography.ts';

/// One row of the settings page: a closed vocabulary of choices, one of them current.
///
/// The page is built from these rather than from bespoke markup per setting, so adding a
/// presentation choice is a line here rather than a new control to wire and style.
interface SettingRow {
  readonly apply: (value: string) => void;
  readonly current: () => string;
  readonly name: string;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

export interface SettingsViewOptions {
  readonly page: HTMLElement;
  readonly preferences: PreferencesStore;
  readonly root: HTMLElement;
  readonly storage: Storage | undefined;
}

export interface SettingsView {
  readonly refresh: () => void;
}

const PRESET_DEFAULT = 'document';

export const installSettingsView = (
  options: SettingsViewOptions
): SettingsView => {
  const { preferences } = options;
  let typeface = readTypefacePreference(options.storage);

  const rows: readonly SettingRow[] = [
    {
      apply: value => {
        preferences.update({
          panelRendition: value === 'damocles' ? 'damocles' : 'targ'
        });
      },
      current: () => preferences.current().panelRendition,
      name: 'rendition',
      options: [
        { label: 'TARG', value: 'targ' },
        { label: 'DAMOCLES', value: 'damocles' }
      ]
    },
    {
      apply: value => {
        preferences.update({
          composition: value === 'strip' ? 'strip' : 'panel'
        });
      },
      current: () => preferences.current().composition,
      name: 'composition',
      options: [
        { label: 'BENSON PANEL', value: 'panel' },
        { label: 'CLASSIC STRIP', value: 'strip' }
      ]
    },
    {
      apply: value => {
        typeface = value === 'damocles' ? 'damocles' : 'mercenary';
        applyTypeface(options.root, typeface, options.storage);
      },
      current: () => typeface,
      name: 'typeface',
      options: [
        { label: 'MERCENARY', value: 'mercenary' },
        { label: 'DAMOCLES', value: 'damocles' }
      ]
    },
    {
      // The sky belongs to the tuning document; a player may override which preset it uses and
      // nothing else, and choosing the document's own value is itself a choice.
      apply: value => {
        preferences.update(
          value === PRESET_DEFAULT
            ? { presentationPreset: undefined }
            : {
                presentationPreset:
                  value === 'authentic' ? 'authentic' : 'enhanced'
              }
        );
      },
      current: () => preferences.current().presentationPreset ?? PRESET_DEFAULT,
      name: 'sky',
      options: [
        { label: 'AS TUNED', value: PRESET_DEFAULT },
        { label: 'AUTHENTIC', value: 'authentic' },
        { label: 'ENHANCED', value: 'enhanced' }
      ]
    }
  ];

  const buttons = new Map<SettingRow, readonly HTMLButtonElement[]>();
  const refresh = (): void => {
    for (const [row, choices] of buttons) {
      const current = row.current();
      for (const button of choices) {
        button.setAttribute('aria-pressed', String(button.value === current));
      }
    }
  };

  for (const row of rows) {
    const group = options.page.querySelector<HTMLElement>(
      `[data-setting="${row.name}"]`
    );
    if (group === null) {
      continue;
    }
    const choices = row.options.map(choice => {
      const button = document.createElement('button');
      button.className = 'chrome-button';
      button.type = 'button';
      button.value = choice.value;
      button.textContent = choice.label;
      button.addEventListener('click', () => {
        row.apply(choice.value);
        refresh();
      });
      group.append(button);
      return button;
    });
    buttons.set(row, choices);
  }

  refresh();
  return { refresh };
};
