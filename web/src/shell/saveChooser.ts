import {
  ALL_SLOTS,
  type SavePersistence,
  type SaveSlot,
  type SlotDescription
} from './saves.ts';

export interface SaveChooserOptions {
  readonly page: HTMLElement;
  readonly persistence: SavePersistence;
}

/// How one slot reads as a row: what is in it, where, and when.
///
/// Separate parts rather than one line, because a refusal must be able to say why in its own
/// words — a Save is rejected without migration, so the reason is all a player has to go on.
export interface SlotRowText {
  readonly detail: string;
  readonly name: string;
  readonly refused: boolean;
}

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short'
});
const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit'
});

/// When a Save was written, in the panel's own voice: no punctuation to spare.
const stamp = (savedAt: Date): string =>
  `${DAY.format(savedAt).toUpperCase()} ${TIME.format(savedAt)}`;

export const slotRowText = (description: SlotDescription): SlotRowText => {
  const name = `SLOT ${description.slot}`;
  switch (description.state) {
    case 'empty':
      return { detail: 'EMPTY', name, refused: false };
    case 'invalid':
      return {
        detail: `UNREADABLE — ${description.reason.toUpperCase()}`,
        name,
        refused: true
      };
    case 'unavailable':
      return {
        detail: `UNAVAILABLE — ${description.reason.toUpperCase()}`,
        name,
        refused: true
      };
    case 'saved':
      return {
        detail: `${description.where} · ${stamp(description.savedAt)}`,
        name,
        refused: false
      };
  }
};

interface Row {
  readonly buttons: Readonly<
    Record<'delete' | 'load' | 'save', HTMLButtonElement>
  >;
  readonly detail: HTMLElement;
  readonly slot: SaveSlot;
}

const ACTIONS = ['save', 'load', 'delete'] as const;

/// Present the three Saves as rows, each acting on the one core.
///
/// Nothing about storage or the codec lives here: the chooser asks the core what a slot holds
/// and tells it what the player pressed, so the console reaching the same core cannot disagree
/// with what the chooser shows.
export const installSaveChooser = (options: SaveChooserOptions): void => {
  const { persistence } = options;
  const list = options.page.querySelector<HTMLElement>('[data-slot-rows]')!;
  const rows: Row[] = [];

  for (const slot of ALL_SLOTS) {
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.dataset['slot'] = String(slot);

    const name = document.createElement('span');
    name.className = 'slot-name';
    const detail = document.createElement('span');
    detail.className = 'slot-detail';
    const description = document.createElement('span');
    description.className = 'slot-description';
    description.append(name, detail);
    row.append(description);

    const buttons = {} as Record<'delete' | 'load' | 'save', HTMLButtonElement>;
    for (const action of ACTIONS) {
      const button = document.createElement('button');
      button.className = 'chrome-button';
      button.type = 'button';
      button.dataset['action'] = action;
      button.addEventListener('click', () => {
        persistence[action](slot);
      });
      button.addEventListener('blur', persistence.disarm);
      row.append(button);
      buttons[action] = button;
    }

    list.append(row);
    rows.push({ buttons, detail, slot });
    // The name never changes, so it is written once.
    name.textContent = `SLOT ${slot}`;
  }

  const refresh = (): void => {
    const armed = persistence.armed();
    for (const row of rows) {
      const description = persistence.describe(row.slot);
      const text = slotRowText(description);
      if (row.detail.textContent !== text.detail) {
        row.detail.textContent = text.detail;
      }
      row.detail.classList.toggle('refused', text.refused);
      for (const action of ACTIONS) {
        const button = row.buttons[action];
        const isArmed = armed?.slot === row.slot && armed.action === action;
        const label = isArmed ? 'CONFIRM' : action.toUpperCase();
        if (button.textContent !== label) {
          button.textContent = label;
        }
        button.classList.toggle('armed', isArmed);
        // Loading needs something to load; deleting needs something to clear.
        button.disabled =
          (action === 'load' && description.state !== 'saved') ||
          (action === 'delete' && description.state === 'empty');
      }
    }
  };

  persistence.onChange(refresh);
  refresh();
};
