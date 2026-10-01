import {
  DEFAULT_CAST_SHADOWS,
  isCastShadowEdge,
  type PresentationSettings
} from '../settings/index.ts';
import type { SettingName } from './chrome.ts';
import type { PreferencesStore } from './preferences.ts';
import { applyTypeface, readTypefacePreference } from './typography.ts';

/// One row of the settings page: a closed vocabulary of choices, one of them current.
///
/// The page is built from these rather than from bespoke markup per setting, so adding a
/// presentation choice is a line here rather than a new control to wire and style. Only the rows
/// the Title declared to the chrome are on its page, and only those are wired.
interface SettingRow {
  readonly apply: (value: string) => void;
  readonly current: () => string;
  readonly name: Exclude<SettingName, 'audio'>;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

export interface SettingsViewOptions {
  /// Called on every presentation or shadow choice, even of what is already chosen: choosing
  /// Enhanced again is how a player retries it after a graphics failure (ADR 0062).
  readonly onPresentationChange?: () => void;
  readonly page: HTMLElement;
  readonly preferences: PreferencesStore;
  /// Set by a Title with no tuning document: the preset it is showing, which a graphics failure
  /// may hold at Authentic whatever is stored. Its row then offers no AS TUNED.
  readonly presentationShown?: () => PresentationSettings['preset'];
  readonly root: HTMLElement;
  readonly storage: Storage | undefined;
  /// The Title's typeface key (ADR 0063).
  readonly typefaceKey: string;
}

export interface SettingsView {
  readonly refresh: () => void;
}

const PRESET_DEFAULT = 'document';

export const installSettingsView = (
  options: SettingsViewOptions
): SettingsView => {
  const { preferences } = options;
  const { presentationShown, typefaceKey } = options;
  let typeface = readTypefacePreference(options.storage, typefaceKey);

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
        applyTypeface(options.root, typeface, {
          key: typefaceKey,
          storage: options.storage
        });
      },
      current: () => typeface,
      name: 'typeface',
      options: [
        { label: 'MERCENARY', value: 'mercenary' },
        { label: 'DAMOCLES', value: 'damocles' }
      ]
    },
    presentationShown === undefined
      ? {
          // The sky belongs to the tuning document; a player may override which preset it uses
          // and nothing else, and choosing the document's own value is itself a choice.
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
          current: () =>
            preferences.current().presentationPreset ?? PRESET_DEFAULT,
          name: 'presentation',
          options: [
            { label: 'AS TUNED', value: PRESET_DEFAULT },
            { label: 'AUTHENTIC', value: 'authentic' },
            { label: 'ENHANCED', value: 'enhanced' }
          ]
        }
      : {
          // With no document to defer to, the choice is only ever one preset or the other.
          apply: value => {
            preferences.update({
              presentationPreset:
                value === 'enhanced' ? 'enhanced' : 'authentic'
            });
          },
          current: presentationShown,
          name: 'presentation',
          options: [
            { label: 'AUTHENTIC', value: 'authentic' },
            { label: 'ENHANCED', value: 'enhanced' }
          ]
        },
    {
      // A Cast Shadow's edge is the player's taste, not the document's: there is no "as tuned"
      // here, only the shell's default. Authentic presentation draws no shadow whatever this says.
      apply: value => {
        preferences.update({
          castShadows: isCastShadowEdge(value) ? value : DEFAULT_CAST_SHADOWS
        });
      },
      current: () => preferences.current().castShadows ?? DEFAULT_CAST_SHADOWS,
      name: 'shadows',
      options: [
        { label: 'OFF', value: 'off' },
        { label: 'SOFT', value: 'soft' },
        { label: 'HARD', value: 'hard' }
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
    },
    {
      // Strafe and Free Look (ADR 0059): Extensions, so faithful play keeps them off.
      apply: value => {
        preferences.update({ extendedControls: value === 'on' });
      },
      current: () => (preferences.current().extendedControls ? 'on' : 'off'),
      name: 'extended',
      options: [
        { label: 'OFF', value: 'off' },
        { label: 'STRAFE + FREE LOOK', value: 'on' }
      ]
    }
  ];

  const buttons = new Map<SettingRow, readonly HTMLButtonElement[]>();
  const mute = options.page.querySelector<HTMLButtonElement>('#audio-mute');
  const volume = options.page.querySelector<HTMLInputElement>('#audio-volume');
  const volumeValue = options.page.querySelector<HTMLOutputElement>(
    '#audio-volume-value'
  );
  const refresh = (): void => {
    for (const [row, choices] of buttons) {
      const current = row.current();
      for (const button of choices) {
        button.setAttribute('aria-pressed', String(button.value === current));
      }
    }
    const audio = preferences.current();
    if (mute !== null) {
      mute.setAttribute('aria-pressed', String(audio.audioMuted));
      mute.textContent = audio.audioMuted ? 'SOUND OFF' : 'SOUND ON';
    }
    if (volume !== null) {
      volume.value = String(audio.audioVolume);
    }
    if (volumeValue !== null) {
      volumeValue.value = String(audio.audioVolume);
    }
  };

  mute?.addEventListener('click', () => {
    preferences.update({ audioMuted: !preferences.current().audioMuted });
    refresh();
  });
  volume?.addEventListener('input', () => {
    preferences.update({ audioVolume: Number(volume.value) });
    refresh();
  });

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
        if (row.name === 'presentation' || row.name === 'shadows') {
          options.onPresentationChange?.();
        }
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
