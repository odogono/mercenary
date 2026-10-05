import type { HeadCommand } from './index.ts';

/// The Head Commands Damocles and Mercenary III share (#756): Open looks the Carried Stack's head
/// up in the Title's Open table (Damocles `$04D2C4`, Mercenary III `$4D6EA`), scrolls its panel
/// onto the centre box over 64 VBLs, and the keypad then acts on the open panel whatever the head
/// has rotated to since. A document pages its items and Reads one into the message bar; a switch
/// sets and clears its bit; the other panels hand their keys to the Title.
///
/// Each Title supplies its table, its Open gates and two rules where the games differ: what Open
/// on the panel already open does, and the item index a backward wrap leaves.

/// What a panel does with the keypad: an Open table row's mode, by name.
export type PanelKind =
  'card' | 'computer' | 'document' | 'log' | 'switch' | 'timedDetonator';

/// The open panel: its object, the item it shows, and the item index word, which on Damocles
/// is not always the item's position (`$7854`).
export interface OpenPanel {
  readonly index: number;
  readonly item: number;
  readonly slot: number;
}

/// The centre box's transition. `null` is the Title's logo.
export interface CentreBox {
  /// The panel scrolling out, or showing once the transition is over.
  readonly from: number | null;
  /// The item whose name the panel scrolling out carries, or null where none was drawn on it.
  readonly fromItem: number | null;
  /// VBLs of the transition still to run, from `TRANSITION_VBLS` down to 0.
  readonly steps: number;
  /// The panel scrolling in, which `from` becomes when the transition ends.
  readonly to: number | null;
}

export interface HeadCommandState {
  readonly box: CentreBox;
  /// The object and the low byte of the index the last Read copied (Damocles `$7856`/`$7857`,
  /// Mercenary III `$6F06`/`$6F07`).
  readonly lastRead: { readonly index: number; readonly slot: number } | null;
  readonly open: OpenPanel | null;
}

/// What a Title's Open table says about an object slot.
export interface HeadTable {
  /// A document's item count.
  readonly items: (slot: number) => number;
  /// The panel the slot's row opens, or undefined where it has no row.
  readonly kind: (slot: number) => PanelKind | undefined;
  /// The Title's own Open gates, such as a shut safe or an unseated computer.
  readonly opens: (slot: number) => boolean;
}

export interface HeadRules {
  /// The item index a backward wrap leaves, given the last item.
  readonly backwardWrapIndex: (last: number) => number;
  /// Open on the panel already open: the originals ignore it; Damocles's port closes it (#595).
  readonly reopen: 'close' | 'ignore';
}

/// 64 steps, 32 scrolling the old panel out and 32 scrolling the new one in (Damocles `$058F1E`,
/// Mercenary III `$53956`).
export const TRANSITION_VBLS = 0x40;
/// The window's height in rows, and the step at which the colours switch.
export const CENTRE_BOX_ROWS = 32;

export const initialHeadCommands = (): HeadCommandState => ({
  box: { from: null, fromItem: null, steps: 0, to: null },
  lastRead: null,
  open: null
});

export type HeadOutcome =
  | { readonly kind: 'ignored' }
  | {
      /// A key on a panel whose keys the Title owns.
      readonly key: '*' | '+' | '-';
      readonly kind: 'key';
      readonly panel: Exclude<PanelKind, 'document' | 'switch'>;
      readonly slot: number;
    }
  | {
      /// `+` (on) or `-` (off) on the open switch.
      readonly kind: 'switch';
      readonly on: boolean;
      readonly slot: number;
    }
  | {
      readonly kind: 'closed' | 'opened' | 'paged';
      readonly state: HeadCommandState;
    }
  | {
      /// The item whose body the message bar is to show.
      readonly item: number;
      readonly kind: 'read';
      readonly slot: number;
      readonly state: HeadCommandState;
    };

const IGNORED = { kind: 'ignored' } as const;

/// Start the transition toward `to`. A transition already running is restarted from what the
/// box shows at that moment, which is the panel scrolling in once the old one is gone. Only a
/// panel that has arrived has had its item's name drawn.
const transition = (state: HeadCommandState, to: number | null): CentreBox => {
  const box = state.box;
  if (box.steps === 0) {
    return {
      from: box.to,
      fromItem: state.open?.item ?? null,
      steps: TRANSITION_VBLS,
      to
    };
  }
  return box.steps > CENTRE_BOX_ROWS
    ? { ...box, steps: TRANSITION_VBLS, to }
    : { from: box.to, fromItem: null, steps: TRANSITION_VBLS, to };
};

/// Close the open panel and scroll the logo back, as dropping the open object does.
export const closePanel = (state: HeadCommandState): HeadCommandState =>
  state.open === null
    ? state
    : { ...state, box: transition(state, null), open: null };

/// One VBL of the centre box.
export const tickCentreBox = (state: HeadCommandState): HeadCommandState =>
  state.box.steps === 0
    ? state
    : {
        ...state,
        box:
          state.box.steps === 1
            ? { from: state.box.to, fromItem: null, steps: 0, to: state.box.to }
            : { ...state.box, steps: state.box.steps - 1 }
      };

/// The keypad key a Head Command presses on a panel that reads `+`, `-` and `*`.
const keypadKey = (command: HeadCommand): '*' | '+' | '-' =>
  command === 'next' ? '+' : command === 'previous' ? '-' : '*';

/// One Head Command. `head` is the Carried Stack's head slot, if any, and `readPending` is
/// whether a Read is still waiting to present, which a second Read waits on.
export const runHeadCommand = (
  state: HeadCommandState,
  command: HeadCommand,
  head: number | undefined,
  table: HeadTable,
  rules: HeadRules,
  readPending: boolean
): HeadOutcome => {
  // Every keypad key, Enter included, waits for the transition.
  if (state.box.steps !== 0) {
    return IGNORED;
  }
  if (command === 'open') {
    if (
      head === undefined ||
      table.kind(head) === undefined ||
      !table.opens(head)
    ) {
      return IGNORED;
    }
    if (state.open?.slot === head) {
      return rules.reopen === 'close'
        ? { kind: 'closed', state: closePanel(state) }
        : IGNORED;
    }
    return {
      kind: 'opened',
      state: {
        ...state,
        box: transition(state, head),
        open: { index: 0, item: 0, slot: head }
      }
    };
  }
  const open = state.open;
  if (open === null) {
    return IGNORED;
  }
  const kind = table.kind(open.slot);
  if (kind === 'switch') {
    return command === 'next' || command === 'previous'
      ? { kind: 'switch', on: command === 'next', slot: open.slot }
      : IGNORED;
  }
  if (kind !== 'document') {
    return kind === undefined
      ? IGNORED
      : { key: keypadKey(command), kind: 'key', panel: kind, slot: open.slot };
  }
  const last = table.items(open.slot) - 1;
  switch (command) {
    case 'next':
      // A forward wrap lands on item 0 and clears the index.
      return {
        kind: 'paged',
        state: {
          ...state,
          open:
            open.item >= last
              ? { ...open, index: 0, item: 0 }
              : {
                  ...open,
                  index: (open.index + 1) & 0xff_ff,
                  item: open.item + 1
                }
        }
      };
    case 'previous':
      return {
        kind: 'paged',
        state: {
          ...state,
          open:
            open.item === 0
              ? { ...open, index: rules.backwardWrapIndex(last), item: last }
              : {
                  ...open,
                  index: (open.index - 1) & 0xff_ff,
                  item: open.item - 1
                }
        }
      };
    case 'read':
      // The last Read keeps the index word's low byte.
      return readPending
        ? IGNORED
        : {
            item: open.item,
            kind: 'read',
            slot: open.slot,
            state: {
              ...state,
              lastRead: { index: open.index & 0xff, slot: open.slot }
            }
          };
  }
};
