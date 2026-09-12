import {
  SAVE_SCHEMA_VERSION,
  decodeSave,
  encodeSave,
  type SaveEnvironment,
  type SaveSnapshot
} from '../session/save.ts';
import { locationText, type Location } from '../world/index.ts';
import {
  installStorageWatch,
  type ReadStorage,
  type RemoveStorage,
  type WriteStorage
} from './storage.ts';

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
  constructor(
    private readonly storage: SlotStorage,
    private readonly keyFor: (slot: SaveSlot) => string = slotStorageKey
  ) {}

  read(value: number): string | null {
    return this.storage.getItem(this.keyFor(slot(value)));
  }

  write(value: number, encoded: string): void {
    this.storage.setItem(this.keyFor(slot(value)), encoded);
  }

  delete(value: number): void {
    this.storage.removeItem(this.keyFor(slot(value)));
  }
}

export const ALL_SLOTS = [1, 2, 3] as const;

/// What one slot holds, as far as any chooser needs to know.
///
/// A union rather than optional fields: `invalid` and `unavailable` always carry the codec's or
/// the store's own words — a Save is refused loudly and without migration, so the reason is the
/// only useful thing to show — and a described Save always has both a place and a time.
export type SlotDescription =
  | { readonly slot: SaveSlot; readonly state: 'empty' }
  | {
      readonly reason: string;
      readonly slot: SaveSlot;
      readonly state: 'invalid' | 'unavailable';
    }
  | {
      readonly savedAt: Date;
      readonly slot: SaveSlot;
      readonly state: 'saved';
      readonly where: string;
    };

export type SlotState = SlotDescription['state'];

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

export interface SlotPersistenceOptions<Snapshot, Captured> {
  readonly capture: () => Captured;
  readonly decode: (encoded: string) => {
    readonly savedAt: string;
    readonly snapshot: Snapshot;
    readonly where: string;
  };
  readonly encode: (captured: Captured, savedAt: string) => string;
  readonly now?: () => Date;
  readonly release: () => void;
  readonly restore: (snapshot: Snapshot, slot: SaveSlot) => void;
  readonly slotKey: (slot: SaveSlot) => string;
  readonly storage: SlotStorage | undefined;
  readonly time?: () => number;
}

export interface SavePersistenceOptions {
  readonly capture: () => {
    readonly location: Location;
    readonly snapshot: SaveSnapshot;
  };
  readonly environment: SaveEnvironment;
  readonly now?: () => Date;
  readonly release: () => void;
  readonly restore: (snapshot: SaveSnapshot, slot: SaveSlot) => void;
  readonly storage: SlotStorage | undefined;
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

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/// Own the three Saves: reading, writing, arming, and what to say about each.
///
/// Nothing here draws. The chooser, the console and the current controls all ask the same core,
/// so a Save made one way is described and refused identically the other way. Title-specific
/// codecs plug in at encode/decode; arming and notices stay here.
export const createSlotPersistence = <Snapshot, Captured>(
  options: SlotPersistenceOptions<Snapshot, Captured>
): SavePersistence => {
  const slots =
    options.storage === undefined
      ? undefined
      : new SaveSlots(options.storage, options.slotKey);
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
    const reason = reasonOf(error);
    armed = undefined;
    show(`${action} FAILED — ${reason}`.toUpperCase(), true);
    announce();
    return { kind: 'failed', reason };
  };
  /// Finish an action that changed something, mirroring `failed`.
  const done = (text: string): SaveOutcome => {
    armed = undefined;
    show(text);
    announce();
    return { kind: 'done' };
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
  const clear = (): void => {
    armed = undefined;
    notice = undefined;
    announce();
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
      // A structurally valid Save is still unreadable when its payload or settings identity no
      // longer matches. Describe it through the same compatibility gate as Load so the chooser
      // never offers an action that the persistence core must refuse.
      const saved = options.decode(encoded);
      return {
        savedAt: new Date(saved.savedAt),
        slot: target,
        state: 'saved',
        where: saved.where
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
        store.delete(target);
        return done(`DELETED SLOT ${target}`);
      } catch (error) {
        return failed('delete', error);
      }
    },
    describe,
    // Looking away from an armed button cancels it, but leaves any other notice standing.
    disarm: () => {
      if (armed !== undefined) {
        clear();
      }
    },
    // Choosing a different slot, or another tab writing one, makes any standing notice stale —
    // including a sticky failure, which would otherwise outlive what it described.
    dismiss: clear,
    load: target => {
      notice = undefined;
      armed = undefined;
      try {
        const encoded = requiredSlots().read(target);
        if (encoded === null) {
          throw new Error(`slot ${target} is empty`);
        }
        const saved = options.decode(encoded);
        options.restore(saved.snapshot, target);
        options.release();
        return done(`LOADED SLOT ${target}`);
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
        options.release();
        const captured = options.capture();
        store.write(target, options.encode(captured, now().toISOString()));
        return done(`SAVED SLOT ${target}`);
      } catch (error) {
        return failed('save', error);
      }
    }
  };
};

/// Targ Saves: the shared core plus Targ's envelope, Location text, and un-namespaced keys.
export const createSavePersistence = (
  options: SavePersistenceOptions
): SavePersistence =>
  createSlotPersistence({
    capture: options.capture,
    decode: encoded => {
      const saved = decodeSave(encoded, options.environment);
      return {
        savedAt: saved.savedAt,
        snapshot: saved.snapshot,
        where: locationText(saved.location)
      };
    },
    encode: (captured, savedAt) =>
      encodeSave({
        environment: options.environment,
        location: captured.location,
        savedAt,
        schemaVersion: SAVE_SCHEMA_VERSION,
        snapshot: captured.snapshot
      }),
    release: options.release,
    restore: options.restore,
    slotKey: slotStorageKey,
    storage: options.storage,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.time === undefined ? {} : { time: options.time })
  });

interface SaveControlElements {
  readonly deleteButton: HTMLButtonElement;
  readonly loadButton: HTMLButtonElement;
  readonly saveButton: HTMLButtonElement;
  readonly slot: HTMLSelectElement;
}

export type SaveControls = Pick<SavePersistence, 'message'>;

interface SaveControlsOptions extends SavePersistenceOptions {
  readonly elements: SaveControlElements;
  readonly storageEvents: Window;
}

/// How one slot reads in the single line of chrome the select offers.
///
/// This belongs to the select, not to the Saves: the chooser renders a slot as separate
/// elements, so it formats its own parts and this dies with the widget it serves.
const SLOT_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: 'short'
});

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
      return `${prefix}${description.where} — ${SLOT_TIME.format(description.savedAt)}`;
  }
};

export const installSaveControls = (
  controlOptions: SaveControlsOptions
): SaveControls => {
  const { elements } = controlOptions;
  const persistence = createSavePersistence(controlOptions);

  const selectedSlot = (): SaveSlot => Number(elements.slot.value) as SaveSlot;
  // The three options never change identity, so they are found once rather than per redraw.
  const options = ALL_SLOTS.map(
    candidate =>
      [
        candidate,
        elements.slot.querySelector<HTMLOptionElement>(
          `option[value="${candidate}"]`
        )!
      ] as const
  );
  const refresh = (): void => {
    for (const [candidate, option] of options) {
      option.textContent = slotLabel(persistence.describe(candidate));
    }
    const armed = persistence.armed();
    elements.saveButton.textContent =
      armed?.action === 'save' ? 'CONFIRM SAVE' : 'SAVE';
    elements.deleteButton.textContent =
      armed?.action === 'delete' ? 'CONFIRM DELETE' : 'DELETE';
  };

  // The core announces whatever changed, so the caller never has to remember to redraw — and
  // a press that changed nothing costs no redraw at all.
  persistence.onChange(refresh);
  elements.saveButton.addEventListener('click', () =>
    persistence.save(selectedSlot())
  );
  elements.loadButton.addEventListener('click', () =>
    persistence.load(selectedSlot())
  );
  elements.deleteButton.addEventListener('click', () =>
    persistence.delete(selectedSlot())
  );
  elements.saveButton.addEventListener('blur', persistence.disarm);
  elements.deleteButton.addEventListener('blur', persistence.disarm);
  elements.slot.addEventListener('change', persistence.dismiss);
  installStorageWatch(
    controlOptions.storageEvents,
    ALL_SLOTS.map(slotStorageKey),
    persistence.dismiss
  );
  refresh();

  return { message: persistence.message };
};
