import {
  closePanel,
  runHeadCommand,
  type HeadCommandState,
  type HeadTable
} from '../interaction/headCommands.ts';
import type { HeadCommand } from '../interaction/index.ts';
import { documentFor, type DamoclesDocuments } from './documentBank.ts';

export {
  CENTRE_BOX_ROWS,
  initialHeadCommands,
  tickCentreBox,
  TRANSITION_VBLS,
  type CentreBox,
  type HeadCommandState,
  type OpenPanel as OpenDocument
} from '../interaction/headCommands.ts';

/// The document, switch, TIMED DETONATOR and AUTHORS COMPUTER modes of the Head Commands (#598, #627, #628, #635,
/// docs/research/damocles-head-commands.md).
///
/// Only Open reads the Carried Stack's head. Read, Next and Previous act on the document already
/// open, whatever the head has rotated to since. The open document shows on the Benson Panel's
/// centre box, which scrolls the old panel out and the new one in over 64 VBLs; the keypad is
/// ignored until it finishes. A Read hands the current item's body to the message reveal, which
/// the script state owns, so this module only says which body to queue.

/// A panel as the centre box draws it: the title, what is drawn in its field if anything has
/// been, and the Open table row's two colours as ST `0RGB`. A document's field is its current
/// item's name; a switch's is its lamp, ON or OFF (`$04D992`); the AUTHORS COMPUTER's is its
/// option's value, three digits (`$04DA5A`).
export interface DocumentPanel {
  readonly colour15: number;
  readonly colour3: number;
  readonly item: string | null;
  readonly kind: 'computer' | 'document' | 'switch' | 'timedDetonator';
  /// The AUTHORS COMPUTER's option, `PARAMETER No`, once drawn; null on every other panel.
  readonly parameter: number | null;
  /// The activation-table item identity, also needed by the recovered panel art selector.
  readonly slot: number;
  readonly title: string;
}

/// A mode-6 row of the Open table at `$04D2C4`: a switch, whose index halved is its bit of the
/// long `$7872` (`$04D420`). The port opens the four disguised detonators, bits 3 to 6, whose
/// title strips read NOVA TRIGGER 1 to 4 in the #626 captures. The TV CONTROL, the GHETTOBLASTER
/// and the GEIGER COUNTER share the mode, but what their bits drive is not ported, so they have
/// no row here yet.
export interface SwitchRow {
  readonly colour15: number;
  readonly colour3: number;
  readonly index: number;
  readonly slot: number;
  readonly title: string;
}

export const SWITCH_ROWS: readonly SwitchRow[] = [
  {
    colour15: 0x6_00,
    colour3: 0x7_55,
    index: 0x06,
    slot: 84,
    title: 'NOVA TRIGGER 1'
  },
  {
    colour15: 0x6_00,
    colour3: 0x7_55,
    index: 0x08,
    slot: 85,
    title: 'NOVA TRIGGER 2'
  },
  {
    colour15: 0x6_00,
    colour3: 0x7_55,
    index: 0x0a,
    slot: 86,
    title: 'NOVA TRIGGER 3'
  },
  {
    colour15: 0x6_00,
    colour3: 0x7_55,
    index: 0x0c,
    slot: 87,
    title: 'NOVA TRIGGER 4'
  }
];

/// The AUTHORS COMPUTER's row of the Open table, mode 4 (`$04D364`).
export const AUTHORS_COMPUTER_SLOT = 101;
/// The TIMED DETONATOR, slot 145, the object table's only type 3 (`$04D69C`, #635).
export const TIMED_DETONATOR_SLOT = 145;
export const COMPUTER_ROW = {
  colour15: 0x6_66,
  colour3: 0x4_44,
  slot: AUTHORS_COMPUTER_SLOT,
  title: 'AUTHORS COMPUTER'
} as const;

/// The switch row an object slot opens, if it has one.
export const switchFor = (
  slot: number | null | undefined
): SwitchRow | undefined => SWITCH_ROWS.find(row => row.slot === slot);

/// A switch, the AUTHORS COMPUTER or the TIMED DETONATOR: a panel that pages no items, so its
/// index and item stay 0.
export const pagesNoItems = (slot: number): boolean =>
  switchFor(slot) !== undefined ||
  slot === AUTHORS_COMPUTER_SLOT ||
  slot === TIMED_DETONATOR_SLOT;

/// Bits 3 to 6 of `$7872`, the four disguised detonators, all of which the NOVABOMB waits on
/// (`$04D44E`).
export const DETONATOR_BITS = 0x78;

/// The bit of `$7872` a switch sets and clears: `$7860`, the row's index, shifted right once.
export const switchBit = (row: SwitchRow): number => row.index >> 1;

/// The centre box with its panels resolved for drawing. `null` is the DAMOCLES logo.
export interface CentreBoxSnapshot {
  readonly from: DocumentPanel | null;
  readonly steps: number;
  readonly to: DocumentPanel | null;
}

/// `$04D7D8`: a backward wrap sets the index to 8, whatever the document's length.
export const BACKWARD_WRAP_INDEX = 8;
/// `$04D25C`: the NOVAGEN SAFE opens only once `$7A60` is set, which only an explosion does.
/// A small EXPLOSIVE blast sets this gate.
export const NOVAGEN_SAFE_SLOT = 102;

export type HeadCommandOutcome =
  | { readonly kind: 'ignored' }
  | {
      /// `+`, `-` or `*` on the open AUTHORS COMPUTER (`$04D4D0`): the session owns its options.
      readonly key: '*' | '+' | '-';
      readonly kind: 'computer';
    }
  | {
      /// `$04D69C`: the TIMED DETONATOR's `+`, `-` and `*`; the session owns the charge and fuse.
      readonly key: '*' | '+' | '-';
      readonly kind: 'timedDetonator';
    }
  | {
      /// `+` (on) or `-` (off) on the open switch: the session owns `$7872`.
      readonly kind: 'switch';
      readonly on: boolean;
      readonly row: SwitchRow;
    }
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

/// Close the open document: `$054686` clears `$785E` and scrolls the logo back. `$7858` and
/// `$7854` survive the close, but the next Open resets them, so nothing needs keeping.
export const closeDocument = closePanel;

/// Whether Open acts on `head`, the Carried Stack's head slot, once the transition allows a key:
/// it has a document, a switch or the computer in the Open table and is not the shut NOVAGEN
/// SAFE. The computer opens only while `seated` on the AUTHOR'S CHAIR (`$04D268`).
export const opensHead = (
  head: number | undefined,
  documents: DamoclesDocuments,
  seated = false,
  safeGate = false
): head is number =>
  head !== undefined &&
  (head !== NOVAGEN_SAFE_SLOT || safeGate) &&
  (documentFor(documents, head) !== undefined ||
    switchFor(head) !== undefined ||
    head === TIMED_DETONATOR_SLOT ||
    (head === AUTHORS_COMPUTER_SLOT && seated));

/// Damocles's Open table as the shared Head Commands read it.
const damoclesTable = (
  documents: DamoclesDocuments,
  seated: boolean,
  safeGate: boolean
): HeadTable => ({
  items: slot => documentFor(documents, slot)?.items.length ?? 0,
  kind: slot =>
    documentFor(documents, slot) !== undefined
      ? 'document'
      : switchFor(slot) !== undefined
        ? 'switch'
        : slot === TIMED_DETONATOR_SLOT
          ? 'timedDetonator'
          : slot === AUTHORS_COMPUTER_SLOT
            ? 'computer'
            : undefined,
  opens: slot => opensHead(slot, documents, seated, safeGate)
});

/// `$04D3D2` for the document, switch, TIMED DETONATOR and AUTHORS COMPUTER modes. `head` is the
/// Carried Stack's head slot, if it has one, and `readPending` is `$7B96`, which a Read waits on.
/// The shared rules are in `interaction/headCommands.ts`; Damocles closes a panel opened again
/// (#595) and leaves index 8 after a backward wrap (`$04D7D8`).
export const headCommand = (
  state: HeadCommandState,
  command: HeadCommand,
  head: number | undefined,
  documents: DamoclesDocuments,
  readPending: boolean,
  seated = false,
  safeGate = false
): HeadCommandOutcome => {
  const outcome = runHeadCommand(
    state,
    command,
    head,
    damoclesTable(documents, seated, safeGate),
    { backwardWrapIndex: () => BACKWARD_WRAP_INDEX, reopen: 'close' },
    readPending
  );
  if (outcome.kind === 'key') {
    return outcome.panel === 'computer' || outcome.panel === 'timedDetonator'
      ? { key: outcome.key, kind: outcome.panel }
      : { kind: 'ignored' };
  }
  if (outcome.kind === 'switch') {
    return { kind: 'switch', on: outcome.on, row: switchFor(outcome.slot)! };
  }
  return outcome;
};
