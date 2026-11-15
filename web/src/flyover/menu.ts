import type { EnhancedStrokes } from '../enhanced/frame.ts';
import {
  enhancedStrokeOf,
  type WireframeGlow,
  type WireframeWeight
} from '../enhanced/strokes.ts';

/// The Flyover's System Menu (#188): RESUME, LEAVE FLYOVER, and a few presentation rows that
/// last until reload. The rows start from the tuned values and never read or write preferences
/// (ADR 0094), so the Flyover's choices never reach a Title.

/// The stroke choices, unset where they keep the tuned stroke: one pixel and no glow.
export interface FlyoverStrokeChoices {
  readonly roadGlow?: WireframeGlow;
  readonly roadWeight?: WireframeWeight;
  readonly wireframeGlow?: WireframeGlow;
  readonly wireframeWeight?: WireframeWeight;
}

export const flyoverStrokesOf = (
  choices: FlyoverStrokeChoices
): EnhancedStrokes => ({
  lines: enhancedStrokeOf(choices.wireframeWeight, choices.wireframeGlow),
  roads: enhancedStrokeOf(choices.roadWeight, choices.roadGlow)
});

/// The value a row reads when it keeps the tuned choice.
export const AS_TUNED = 'tuned';

export interface FlyoverMenuRow {
  readonly apply: (value: string) => void;
  readonly current: () => string;
  readonly label: string;
  readonly name: string;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

const WEIGHTS = [
  { label: 'AS TUNED', value: AS_TUNED },
  { label: 'FINE', value: 'fine' },
  { label: 'BOLD', value: 'bold' },
  { label: 'HEAVY', value: 'heavy' }
] as const;

const GLOWS = [
  { label: 'AS TUNED', value: AS_TUNED },
  { label: 'OFF', value: 'off' },
  { label: 'SOFT', value: 'soft' },
  { label: 'BRIGHT', value: 'bright' }
] as const;

/// Day lengths offered beside the tuned one, in minutes.
const DAY_LENGTHS = [2, 6, 96] as const;

export interface FlyoverDayClock {
  readonly dayLengthMinutes: () => number;
  readonly setDayLength: (minutes: number) => void;
  readonly tunedDayLengthMinutes: number;
}

/// Targ's rows: its day length, then the surface frame's wireframe and road strokes. Gamma draws
/// no wireframe and has no clock, so it has none.
export const targFlyoverMenuRows = (
  clock: FlyoverDayClock,
  strokes: {
    readonly current: () => FlyoverStrokeChoices;
    readonly set: (choices: FlyoverStrokeChoices) => void;
  }
): readonly FlyoverMenuRow[] => {
  const strokeRow = (
    name: string,
    label: string,
    key: keyof FlyoverStrokeChoices,
    options: FlyoverMenuRow['options']
  ): FlyoverMenuRow => ({
    apply: value => {
      const { [key]: _dropped, ...rest } = strokes.current();
      strokes.set(
        value === AS_TUNED
          ? rest
          : ({ ...rest, [key]: value } as FlyoverStrokeChoices)
      );
    },
    current: () => strokes.current()[key] ?? AS_TUNED,
    label,
    name,
    options
  });
  return [
    {
      apply: value => {
        clock.setDayLength(
          value === AS_TUNED ? clock.tunedDayLengthMinutes : Number(value)
        );
      },
      current: () =>
        clock.dayLengthMinutes() === clock.tunedDayLengthMinutes
          ? AS_TUNED
          : String(clock.dayLengthMinutes()),
      label: 'TARG DAY LENGTH',
      name: 'day-length',
      options: [
        {
          label: `AS TUNED (${clock.tunedDayLengthMinutes} MIN)`,
          value: AS_TUNED
        },
        ...DAY_LENGTHS.filter(
          minutes => minutes !== clock.tunedDayLengthMinutes
        ).map(minutes => ({ label: `${minutes} MIN`, value: String(minutes) }))
      ]
    },
    strokeRow('weight', 'WIREFRAME WEIGHT', 'wireframeWeight', WEIGHTS),
    strokeRow('glow', 'WIREFRAME GLOW', 'wireframeGlow', GLOWS),
    strokeRow('road-weight', 'ROAD WEIGHT', 'roadWeight', WEIGHTS),
    strokeRow('road-glow', 'ROAD GLOW', 'roadGlow', GLOWS)
  ];
};

export interface FlyoverMenuElements {
  readonly leave: HTMLButtonElement;
  readonly resume: HTMLButtonElement;
  readonly root: HTMLElement;
  readonly rows: HTMLElement;
}

export interface FlyoverMenu {
  readonly close: () => void;
  readonly isOpen: () => boolean;
  readonly open: () => void;
}

/// Mount the menu's rows and buttons. Opening and closing call `onOpen` and `onClose`, which
/// pause and resume the Flyover.
export const installFlyoverMenu = (
  elements: FlyoverMenuElements,
  rows: readonly FlyoverMenuRow[],
  actions: {
    readonly onClose: () => void;
    readonly onLeave: () => void;
    readonly onOpen: () => void;
  }
): FlyoverMenu => {
  let open = false;
  const buttons: {
    button: HTMLButtonElement;
    row: FlyoverMenuRow;
    value: string;
  }[] = [];
  const refresh = (): void => {
    for (const { button, row, value } of buttons) {
      button.setAttribute('aria-pressed', String(row.current() === value));
    }
  };
  for (const row of rows) {
    const group = document.createElement('div');
    group.className = 'menu-row';
    group.dataset['setting'] = row.name;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', row.label);
    const label = document.createElement('span');
    label.textContent = row.label;
    group.append(label);
    for (const option of row.options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.dataset['value'] = option.value;
      button.addEventListener('click', () => {
        row.apply(option.value);
        refresh();
      });
      buttons.push({ button, row, value: option.value });
      group.append(button);
    }
    elements.rows.append(group);
  }
  const show = (next: boolean): void => {
    open = next;
    elements.root.hidden = !open;
    document.documentElement.dataset['layer'] = open ? 'menu' : 'none';
    if (open) {
      refresh();
      actions.onOpen();
      elements.resume.focus();
    } else {
      (document.activeElement as HTMLElement | null)?.blur();
      actions.onClose();
    }
  };
  elements.resume.addEventListener('click', () => {
    show(false);
  });
  elements.leave.addEventListener('click', actions.onLeave);
  document.documentElement.dataset['layer'] = 'none';
  return {
    close: () => {
      if (open) {
        show(false);
      }
    },
    isOpen: () => open,
    open: () => {
      if (!open) {
        show(true);
      }
    }
  };
};
