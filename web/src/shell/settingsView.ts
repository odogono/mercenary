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
    },
    {
      apply: value => {
        preferences.update({
          structureReach:
            value === PRESET_DEFAULT
              ? undefined
              : value === 'all'
                ? 'all'
                : 'cell'
        });
      },
      current: () => preferences.current().structureReach ?? PRESET_DEFAULT,
      name: 'structures',
      options: [
        { label: 'AS TUNED', value: PRESET_DEFAULT },
        { label: 'THIS CELL', value: 'cell' },
        { label: 'ALL CELLS', value: 'all' }
      ]
    },
    {
      // Like the sky, the wireframe's own numbers stay authored; the player chooses among the
      // named levels or hands the choice back to the document.
      apply: value => {
        preferences.update({
          wireframeWeight:
            value === PRESET_DEFAULT
              ? undefined
              : (value as 'fine' | 'bold' | 'heavy')
        });
      },
      current: () => preferences.current().wireframeWeight ?? PRESET_DEFAULT,
      name: 'weight',
      options: [
        { label: 'AS TUNED', value: PRESET_DEFAULT },
        { label: 'FINE', value: 'fine' },
        { label: 'BOLD', value: 'bold' },
        { label: 'HEAVY', value: 'heavy' }
      ]
    },
    {
      apply: value => {
        preferences.update({
          wireframeGlow:
            value === PRESET_DEFAULT
              ? undefined
              : (value as 'off' | 'soft' | 'bright')
        });
      },
      current: () => preferences.current().wireframeGlow ?? PRESET_DEFAULT,
      name: 'glow',
      options: [
        { label: 'AS TUNED', value: PRESET_DEFAULT },
        { label: 'OFF', value: 'off' },
        { label: 'SOFT', value: 'soft' },
        { label: 'BRIGHT', value: 'bright' }
      ]
    },
    {
      // Like the sky, the wireframe's own numbers stay authored; the player chooses among the
      // named levels or hands the choice back to the document.
      apply: value => {
        preferences.update({
          roadWeight:
            value === PRESET_DEFAULT
              ? undefined
              : (value as 'fine' | 'bold' | 'heavy')
        });
      },
      current: () => preferences.current().roadWeight ?? PRESET_DEFAULT,
      name: 'road-weight',
      options: [
        { label: 'AS TUNED', value: PRESET_DEFAULT },
        { label: 'FINE', value: 'fine' },
        { label: 'BOLD', value: 'bold' },
        { label: 'HEAVY', value: 'heavy' }
      ]
    },
    {
      apply: value => {
        preferences.update({
          roadGlow:
            value === PRESET_DEFAULT
              ? undefined
              : (value as 'off' | 'soft' | 'bright')
        });
      },
      current: () => preferences.current().roadGlow ?? PRESET_DEFAULT,
      name: 'road-glow',
      options: [
        { label: 'AS TUNED', value: PRESET_DEFAULT },
        { label: 'OFF', value: 'off' },
        { label: 'SOFT', value: 'soft' },
        { label: 'BRIGHT', value: 'bright' }
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
