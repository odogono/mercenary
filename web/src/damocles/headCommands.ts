import type { HeadCommand } from '../interaction/index.ts';
import { documentFor, type DamoclesDocuments } from './documentBank.ts';

/// The document mode of the Head Commands (#598, docs/research/damocles-head-commands.md).
///
/// Only Open reads the Carried Stack's head. Read, Next and Previous act on the document already
/// open, whatever the head has rotated to since. The open document shows on the Benson Panel's
/// centre box, which scrolls the old panel out and the new one in over 64 VBLs; the keypad is
/// ignored until it finishes. A Read hands the current item's body to the message reveal, which
/// the script state owns, so this module only says which body to queue.

/// The document open on the centre box: `$785E`'s object, the item `$7858` points at, and the
/// item index `$7854`. The index is not the item's position after a backward wrap, which sets
/// it to 8 whatever the document's length, so it is kept on its own.
export interface OpenDocument {
  /// `$7854`, a word: it counts on from 8 after a backward wrap and below 0 wraps to `$FFFF`.
  readonly index: number;
  readonly item: number;
  readonly slot: number;
}

/// The centre box's transition, `$52938`, and what it scrolls. `null` is the DAMOCLES logo.
export interface CentreBox {
  /// The panel scrolling out, or showing once the transition is over.
  readonly from: number | null;
  /// The item whose name the panel scrolling out carries, or null where none was drawn on it.
  /// At rest the name is the open document's current item's.
  readonly fromItem: number | null;
  /// VBLs of the transition still to run, from `TRANSITION_VBLS` down to 0.
  readonly steps: number;
  /// The panel scrolling in, which `from` becomes when the transition ends.
  readonly to: number | null;
}

/// A document's panel as the centre box draws it: the object's name, the item name drawn in its
/// field if one has been, and the Open table row's two colours as ST `0RGB`.
export interface DocumentPanel {
  readonly colour15: number;
  readonly colour3: number;
  readonly item: string | null;
  readonly title: string;
}

/// The centre box with its panels resolved for drawing. `null` is the DAMOCLES logo.
export interface CentreBoxSnapshot {
  readonly from: DocumentPanel | null;
  readonly steps: number;
  readonly to: DocumentPanel | null;
}

export interface HeadCommandState {
  readonly box: CentreBox;
  /// `$7856`/`$7857`: the object and the low byte of the index the last Read copied, which the
  /// BOOK's page action reads. The action itself needs the MAGIC CRYSTAL and is not ported.
  readonly lastRead: { readonly index: number; readonly slot: number } | null;
  readonly open: OpenDocument | null;
}

/// `$058F1E`: `$40` steps, 32 scrolling the old panel out and 32 scrolling the new one in.
export const TRANSITION_VBLS = 0x40;
/// The window's height in rows, and the step at which the colours switch (`$052976`).
export const CENTRE_BOX_ROWS = 32;
/// `$04D7D8`: a backward wrap sets the index to 8, whatever the document's length.
export const BACKWARD_WRAP_INDEX = 8;
/// `$04D25C`: the NOVAGEN SAFE opens only once `$7A60` is set, which only an explosion does.
/// The explosion is not ported, so the safe stays shut.
export const NOVAGEN_SAFE_SLOT = 102;

export const initialHeadCommands = (): HeadCommandState => ({
  box: { from: null, fromItem: null, steps: 0, to: null },
  lastRead: null,
  open: null
});

export type HeadCommandOutcome =
  | { readonly kind: 'ignored' }
  | {
      readonly kind: 'closed' | 'opened' | 'paged';
      readonly state: HeadCommandState;
    }
  | {
      /// The item whose body the message reveal is to queue.
      readonly item: number;
      readonly kind: 'read';
      readonly slot: number;
      readonly state: HeadCommandState;
    };

const IGNORED = { kind: 'ignored' } as const;

/// `$058EC8`: start the transition toward `to`. A transition already running is restarted from
/// what the box shows at that moment, which is the panel scrolling in once the old one is gone.
/// Only a panel that has arrived has had its item's name drawn (`$0529D6`).
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

/// Close the open document: `$054686` clears `$785E` and scrolls the logo back. `$7858` and
/// `$7854` survive the close, but the next Open resets them, so nothing needs keeping.
export const closeDocument = (state: HeadCommandState): HeadCommandState =>
  state.open === null
    ? state
    : { ...state, box: transition(state, null), open: null };

/// One VBL of `$05293E`.
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

/// `$04D3D2` for the document mode. `head` is the Carried Stack's head slot, if it has one, and
/// `readPending` is `$7B96`, which a Read waits on.
export const headCommand = (
  state: HeadCommandState,
  command: HeadCommand,
  head: number | undefined,
  documents: DamoclesDocuments,
  readPending: boolean
): HeadCommandOutcome => {
  // `$04D3EA`: every keypad key, Enter included, waits for the transition.
  if (state.box.steps !== 0) {
    return IGNORED;
  }
  if (command === 'open') {
    if (head === undefined || head === NOVAGEN_SAFE_SLOT) {
      return IGNORED;
    }
    if (documentFor(documents, head) === undefined) {
      return IGNORED;
    }
    // `$04D282`: the original ignores Open on the object already open. Closing it here is one of
    // the #595 Accommodations, since the original has no key that closes a document.
    if (state.open?.slot === head) {
      return { kind: 'closed', state: closeDocument(state) };
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
  const document =
    open === null ? undefined : documentFor(documents, open.slot);
  if (open === null || document === undefined) {
    return IGNORED;
  }
  const last = document.items.length - 1;
  switch (command) {
    case 'next':
      // `$04D7A0`: a forward wrap lands on item 0 and clears the index.
      return {
        kind: 'paged',
        state: {
          ...state,
          open:
            open.item === last
              ? { ...open, index: 0, item: 0 }
              : {
                  ...open,
                  index: (open.index + 1) & 0xff_ff,
                  item: open.item + 1
                }
        }
      };
    case 'previous':
      // `$04D7C6`: a backward wrap lands on the last item and sets the index to 8.
      return {
        kind: 'paged',
        state: {
          ...state,
          open:
            open.item === 0
              ? { ...open, index: BACKWARD_WRAP_INDEX, item: last }
              : {
                  ...open,
                  index: (open.index - 1) & 0xff_ff,
                  item: open.item - 1
                }
        }
      };
    case 'read':
      // `$04D776`: only while `$7B96` is clear, so a second Read before the first presents is
      // ignored. `$7857` takes `$7855`, the index word's low byte.
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
