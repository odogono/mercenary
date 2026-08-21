import {
  SAVE_SCHEMA_VERSION,
  decodeSave,
  encodeSave,
  inspectSave,
  type SaveEnvironment,
  type SaveSnapshot
} from '../session/save.ts';
import type { Location } from '../world/index.ts';
import type { ReadStorage, RemoveStorage, WriteStorage } from './storage.ts';

export type SaveSlot = 1 | 2 | 3;

export interface SlotStorage extends ReadStorage, RemoveStorage, WriteStorage {}

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

export const ALL_SLOTS = [1, 2, 3] as const;

/// What one slot holds, as far as any chooser needs to know.
///
/// `invalid` and `unavailable` carry the codec's or the store's own words: a Save is refused
/// loudly and without migration, so the reason it was refused is the only useful thing to show.
export type SlotState = 'empty' | 'invalid' | 'saved' | 'unavailable';

export interface SlotDescription {
  readonly reason?: string;
  readonly savedAt?: Date;
  readonly slot: SaveSlot;
  readonly state: SlotState;
  readonly where?: string;
}

/// Which action is one press away from happening, and to which slot.
export interface ArmedAction {
  readonly action: 'delete' | 'save';
  readonly slot: SaveSlot;
}

/// What asking for an action actually did.
///
/// `armed` means nothing has happened yet and the same call repeated will do it: overwriting or
/// clearing a Save always costs two presses.
export type SaveOutcome =
  | { readonly kind: 'armed' }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly reason: string };

export interface SavePersistenceOptions {
  readonly capture: () => {
    readonly location: Location;
    readonly snapshot: SaveSnapshot;
  };
  readonly environment: SaveEnvironment;
  readonly now?: () => Date;
  readonly release: () => void;
  readonly restore: (snapshot: SaveSnapshot) => void;
  readonly storage: SlotStorage | undefined;
  readonly storageEvents?: Window;
  readonly time?: () => number;
}

export interface SavePersistence {
  readonly armed: () => ArmedAction | undefined;
  readonly delete: (slot: SaveSlot) => SaveOutcome;
  readonly describe: (slot: SaveSlot) => SlotDescription;
  readonly disarm: () => void;
  readonly dismiss: () => void;
  readonly load: (slot: SaveSlot) => SaveOutcome;
  readonly message: (gameMessage: string) => {
    readonly source: 'game' | 'shell';
    readonly text: string;
  };
  readonly onChange: (listener: () => void) => void;
  readonly save: (slot: SaveSlot) => SaveOutcome;
}

const placeOf = (location: Location): string =>
  location.kind === 'surface'
    ? 'SURFACE'
    : `ROOM ${String(location.id).padStart(2, '0')}`;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/// Own the three Saves: reading, writing, arming, and what to say about each.
///
/// Nothing here draws. The chooser, the console and the current controls all ask the same core,
/// so a Save made one way is described and refused identically the other way.
export const createSavePersistence = (
  options: SavePersistenceOptions
): SavePersistence => {
  const slots =
    options.storage === undefined ? undefined : new SaveSlots(options.storage);
  const now = options.now ?? (() => new Date());
  const time = options.time ?? (() => performance.now());
  const listeners: (() => void)[] = [];
  let armed: ArmedAction | undefined;
  let notice:
    { readonly expires: number | undefined; readonly text: string } | undefined;

  const show = (text: string, sticky = false): void => {
    notice = { expires: sticky ? undefined : time() + 2000, text };
  };
  const announce = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  const requiredSlots = (): SaveSlots => {
    if (slots === undefined) {
      throw new Error('browser storage is unavailable');
    }
    return slots;
  };
  const failed = (action: string, error: unknown): SaveOutcome => {
    armed = undefined;
    show(`${action} FAILED — ${reasonOf(error)}`.toUpperCase(), true);
    announce();
    return { kind: 'failed', reason: reasonOf(error) };
  };
  const arm = (action: 'delete' | 'save', target: SaveSlot): SaveOutcome => {
    armed = { action, slot: target };
    show(
      action === 'save'
        ? `PRESS CONFIRM SAVE TO OVERWRITE SLOT ${target}`
        : `PRESS CONFIRM DELETE TO CLEAR SLOT ${target}`
    );
    announce();
    return { kind: 'armed' };
  };
  const isArmed = (action: 'delete' | 'save', target: SaveSlot): boolean =>
    armed?.action === action && armed.slot === target;

  const describe = (target: SaveSlot): SlotDescription => {
    if (slots === undefined) {
      return {
        reason: 'browser storage is unavailable',
        slot: target,
        state: 'unavailable'
      };
    }
    let encoded: string | null;
    try {
      encoded = slots.read(target);
    } catch (error) {
      return { reason: reasonOf(error), slot: target, state: 'unavailable' };
    }
    if (encoded === null) {
      return { slot: target, state: 'empty' };
    }
    try {
      const saved = inspectSave(encoded);
      return {
        savedAt: new Date(saved.savedAt),
        slot: target,
        state: 'saved',
        where: placeOf(saved.location)
      };
    } catch (error) {
      return { reason: reasonOf(error), slot: target, state: 'invalid' };
    }
  };

  return {
    armed: () => armed,
    delete: target => {
      notice = undefined;
      try {
        const store = requiredSlots();
        if (store.read(target) === null) {
          throw new Error(`slot ${target} is empty`);
        }
        if (!isArmed('delete', target)) {
          return arm('delete', target);
        }
        armed = undefined;
        store.delete(target);
        show(`DELETED SLOT ${target}`);
        announce();
        return { kind: 'done' };
      } catch (error) {
        return failed('delete', error);
      }
    },
    describe,
    disarm: () => {
      // Looking away from an armed button cancels it, but leaves any other notice standing.
      if (armed !== undefined) {
        armed = undefined;
        notice = undefined;
        announce();
      }
    },
    dismiss: () => {
      // Choosing a different slot, or another tab writing one, makes any standing notice stale
      // — including a sticky failure, which would otherwise outlive what it described.
      armed = undefined;
      notice = undefined;
      announce();
    },
    load: target => {
      notice = undefined;
      armed = undefined;
      try {
        const encoded = requiredSlots().read(target);
        if (encoded === null) {
          throw new Error(`slot ${target} is empty`);
        }
        const saved = decodeSave(encoded, options.environment);
        options.restore(saved.snapshot);
        options.release();
        show(`LOADED SLOT ${target}`);
        announce();
        return { kind: 'done' };
      } catch (error) {
        return failed('load', error);
      }
    },
    message: gameMessage => {
      if (notice?.expires !== undefined && time() >= notice.expires) {
        notice = undefined;
      }
      return notice === undefined
        ? { source: 'game', text: gameMessage === '' ? '—' : gameMessage }
        : { source: 'shell', text: notice.text };
    },
    onChange: listener => {
      listeners.push(listener);
    },
    save: target => {
      notice = undefined;
      try {
        const store = requiredSlots();
        if (store.read(target) !== null && !isArmed('save', target)) {
          return arm('save', target);
        }
        armed = undefined;
        options.release();
        const captured = options.capture();
        store.write(
          target,
          encodeSave({
            environment: options.environment,
            location: captured.location,
            savedAt: now().toISOString(),
            schemaVersion: SAVE_SCHEMA_VERSION,
            snapshot: captured.snapshot
          })
        );
        show(`SAVED SLOT ${target}`);
        announce();
        return { kind: 'done' };
      } catch (error) {
        return failed('save', error);
      }
    }
  };
};

/// Watch for Saves changed by another tab sharing this storage.
export const installStorageWatch = (
  storageEvents: Window,
  onChange: () => void
): void => {
  storageEvents.addEventListener('storage', event => {
    if (
      event.key === null ||
      ALL_SLOTS.some(candidate => event.key === slotStorageKey(candidate))
    ) {
      onChange();
    }
  });
};

interface SaveControlElements {
  readonly deleteButton: HTMLButtonElement;
  readonly loadButton: HTMLButtonElement;
  readonly saveButton: HTMLButtonElement;
  readonly slot: HTMLSelectElement;
}

interface SaveControlsOptions extends SavePersistenceOptions {
  readonly elements: SaveControlElements;
  readonly storageEvents: Window;
}

export interface SaveControls {
  message(gameMessage: string): {
    readonly source: 'game' | 'shell';
    readonly text: string;
  };
}

/// How one slot reads in a single line of chrome.
export const slotLabel = (description: SlotDescription): string => {
  const prefix = `SLOT ${description.slot} — `;
  switch (description.state) {
    case 'empty':
      return `${prefix}EMPTY`;
    case 'invalid':
      return `${prefix}INVALID`;
    case 'unavailable':
      return `${prefix}UNAVAILABLE`;
    case 'saved':
      return `${prefix}${description.where} — ${description.savedAt!.toLocaleString(
        'en-GB',
        {
          day: '2-digit',
          hour: '2-digit',
          hour12: false,
          minute: '2-digit',
          month: 'short'
        }
      )}`;
  }
};

export const installSaveControls = (
  options: SaveControlsOptions
): SaveControls => {
  const { elements } = options;
  const persistence = createSavePersistence(options);

  const selectedSlot = (): SaveSlot => Number(elements.slot.value) as SaveSlot;
  const refresh = (): void => {
    for (const candidate of ALL_SLOTS) {
      const option = elements.slot.querySelector<HTMLOptionElement>(
        `option[value="${candidate}"]`
      )!;
      option.textContent = slotLabel(persistence.describe(candidate));
    }
    const armed = persistence.armed();
    elements.saveButton.textContent =
      armed?.action === 'save' ? 'CONFIRM SAVE' : 'SAVE';
    elements.deleteButton.textContent =
      armed?.action === 'delete' ? 'CONFIRM DELETE' : 'DELETE';
  };

  elements.saveButton.addEventListener('click', () => {
    persistence.save(selectedSlot());
    refresh();
  });
  elements.loadButton.addEventListener('click', () => {
    persistence.load(selectedSlot());
    refresh();
  });
  elements.deleteButton.addEventListener('click', () => {
    persistence.delete(selectedSlot());
    refresh();
  });

  const disarm = (): void => {
    persistence.disarm();
    refresh();
  };
  const dismiss = (): void => {
    persistence.dismiss();
    refresh();
  };
  elements.saveButton.addEventListener('blur', disarm);
  elements.deleteButton.addEventListener('blur', disarm);
  elements.slot.addEventListener('change', dismiss);
  installStorageWatch(options.storageEvents, dismiss);
  refresh();

  return { message: persistence.message };
};
