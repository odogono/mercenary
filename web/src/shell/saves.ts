import {
  SAVE_SCHEMA_VERSION,
  decodeSave,
  encodeSave,
  inspectSave,
  type SaveEnvironment,
  type SaveSnapshot
} from '../session/save.ts';
import type { Location } from '../world/index.ts';

export type SaveSlot = 1 | 2 | 3;

export interface SlotStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

const slot = (value: number): SaveSlot => {
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new RangeError('slot must be 1, 2, or 3');
  }
  return value;
};

export const slotStorageKey = (value: number): string =>
  `mercenary.browser-shell.save.v1.slot-${slot(value)}`;

export class SaveSlots {
  constructor(private readonly storage: SlotStorage) {}

  read(value: number): string | null {
    return this.storage.getItem(slotStorageKey(value));
  }

  write(value: number, encoded: string): void {
    this.storage.setItem(slotStorageKey(value), encoded);
  }

  delete(value: number): void {
    this.storage.removeItem(slotStorageKey(value));
  }
}

interface SaveControlElements {
  readonly deleteButton: HTMLButtonElement;
  readonly loadButton: HTMLButtonElement;
  readonly saveButton: HTMLButtonElement;
  readonly slot: HTMLSelectElement;
}

interface SaveControlsOptions {
  readonly capture: () => {
    readonly location: Location;
    readonly snapshot: SaveSnapshot;
  };
  readonly elements: SaveControlElements;
  readonly environment: SaveEnvironment;
  readonly now?: () => Date;
  readonly release: () => void;
  readonly restore: (snapshot: SaveSnapshot) => void;
  readonly storage: SlotStorage | undefined;
  readonly storageEvents: Window;
  readonly time?: () => number;
}

export interface SaveControls {
  message(gameMessage: string): {
    readonly source: 'game' | 'shell';
    readonly text: string;
  };
}

const ALL_SLOTS = [1, 2, 3] as const;

const labelFor = (slot: SaveSlot, encoded: string | null): string => {
  if (encoded === null) {
    return `SLOT ${slot} — EMPTY`;
  }
  try {
    const saved = inspectSave(encoded);
    const where =
      saved.location.kind === 'surface'
        ? 'SURFACE'
        : `ROOM ${String(saved.location.id).padStart(2, '0')}`;
    const when = new Date(saved.savedAt).toLocaleString('en-GB', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: 'short'
    });
    return `SLOT ${slot} — ${where} — ${when}`;
  } catch {
    return `SLOT ${slot} — INVALID`;
  }
};

export const installSaveControls = (
  options: SaveControlsOptions
): SaveControls => {
  const { elements } = options;
  const slots =
    options.storage === undefined ? undefined : new SaveSlots(options.storage);
  const now = options.now ?? (() => new Date());
  const time = options.time ?? (() => performance.now());
  let armed: 'delete' | 'save' | undefined;
  let notice:
    { readonly expires: number | undefined; readonly text: string } | undefined;

  const selectedSlot = (): SaveSlot => Number(elements.slot.value) as SaveSlot;
  const show = (text: string, sticky = false): void => {
    notice = { expires: sticky ? undefined : time() + 2000, text };
  };
  const clearArmed = (): void => {
    armed = undefined;
    elements.saveButton.textContent = 'SAVE';
    elements.deleteButton.textContent = 'DELETE';
  };
  const refresh = (): void => {
    for (const candidate of ALL_SLOTS) {
      const option = elements.slot.querySelector<HTMLOptionElement>(
        `option[value="${candidate}"]`
      )!;
      try {
        option.textContent =
          slots === undefined
            ? `SLOT ${candidate} — UNAVAILABLE`
            : labelFor(candidate, slots.read(candidate));
      } catch {
        option.textContent = `SLOT ${candidate} — UNAVAILABLE`;
      }
    }
  };
  const requiredSlots = (): SaveSlots => {
    if (slots === undefined) {
      throw new Error('browser storage is unavailable');
    }
    return slots;
  };
  const fail = (action: string, error: unknown): void => {
    const reason = error instanceof Error ? error.message : String(error);
    show(`${action} FAILED — ${reason}`.toUpperCase(), true);
  };
  const beginAction = (): void => {
    notice = undefined;
    refresh();
  };

  elements.saveButton.addEventListener('click', () => {
    beginAction();
    const selected = selectedSlot();
    try {
      const store = requiredSlots();
      if (store.read(selected) !== null && armed !== 'save') {
        clearArmed();
        armed = 'save';
        elements.saveButton.textContent = 'CONFIRM SAVE';
        show(`PRESS CONFIRM SAVE TO OVERWRITE SLOT ${selected}`);
        return;
      }
      clearArmed();
      options.release();
      const captured = options.capture();
      store.write(
        selected,
        encodeSave({
          environment: options.environment,
          location: captured.location,
          savedAt: now().toISOString(),
          schemaVersion: SAVE_SCHEMA_VERSION,
          snapshot: captured.snapshot
        })
      );
      refresh();
      show(`SAVED SLOT ${selected}`);
    } catch (error) {
      clearArmed();
      fail('save', error);
    }
  });

  elements.loadButton.addEventListener('click', () => {
    beginAction();
    clearArmed();
    const selected = selectedSlot();
    try {
      const encoded = requiredSlots().read(selected);
      if (encoded === null) {
        throw new Error(`slot ${selected} is empty`);
      }
      const saved = decodeSave(encoded, options.environment);
      options.restore(saved.snapshot);
      options.release();
      show(`LOADED SLOT ${selected}`);
    } catch (error) {
      fail('load', error);
    }
  });

  elements.deleteButton.addEventListener('click', () => {
    beginAction();
    const selected = selectedSlot();
    try {
      const store = requiredSlots();
      if (store.read(selected) === null) {
        throw new Error(`slot ${selected} is empty`);
      }
      if (armed !== 'delete') {
        clearArmed();
        armed = 'delete';
        elements.deleteButton.textContent = 'CONFIRM DELETE';
        show(`PRESS CONFIRM DELETE TO CLEAR SLOT ${selected}`);
        return;
      }
      clearArmed();
      store.delete(selected);
      refresh();
      show(`DELETED SLOT ${selected}`);
    } catch (error) {
      clearArmed();
      fail('delete', error);
    }
  });

  const cancelArmed = (): void => {
    if (armed !== undefined) {
      clearArmed();
      notice = undefined;
    }
  };
  elements.saveButton.addEventListener('blur', cancelArmed);
  elements.deleteButton.addEventListener('blur', cancelArmed);
  elements.slot.addEventListener('change', () => {
    notice = undefined;
    clearArmed();
    refresh();
  });
  options.storageEvents.addEventListener('storage', event => {
    if (
      event.key === null ||
      ALL_SLOTS.some(candidate => event.key === slotStorageKey(candidate))
    ) {
      clearArmed();
      notice = undefined;
      refresh();
    }
  });
  refresh();

  return {
    message: gameMessage => {
      if (notice?.expires !== undefined && time() >= notice.expires) {
        notice = undefined;
      }
      return notice === undefined
        ? { source: 'game', text: gameMessage === '' ? '—' : gameMessage }
        : { source: 'shell', text: notice.text };
    }
  };
};
