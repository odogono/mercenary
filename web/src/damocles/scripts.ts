import type { DamoclesMessageId } from './display.ts';

/// The six Damocles Scripts a pickup can launch, as the recovered object-to-trigger table at
/// `$0543EC` maps them, and the trigger table that arbitrates them.
///
/// A script identity is named for its **trigger index**, which is also the slot the strings
/// payload names its inline records after: trigger 5 runs `script5-inline-1..3`. The resident
/// that launches it is a separate identity and is not part of the script's name -- `KEY- V.I.P.
/// LIMO` is resident slot 183 and launches `damocles.script.slot-2`.
///
/// Evidence: docs/research/damocles-pickup-responses.md (#317), whose probe walked the original
/// table at `$0543D2` for each resident and ran each response to its parked stopping point.

export const SCRIPT_IDS = [
  'damocles.script.slot-11',
  'damocles.script.slot-2',
  'damocles.script.slot-20',
  'damocles.script.slot-5',
  'damocles.script.slot-6',
  'damocles.script.slot-62'
] as const;

export type ScriptId = (typeof SCRIPT_IDS)[number];

export const isScriptId = (value: unknown): value is ScriptId =>
  SCRIPT_IDS.includes(value as ScriptId);

/// One recovered interpreter operation. A `Step` is an index into a script's operation list, so
/// a suspended execution names a script and a position in it.
///
/// `poll-wait` carries its own threshold because the bank's delay subroutines are a family of
/// fixed-threshold members (`$072CD6`-`$072D2E`), not one routine taking an argument: trigger 5
/// calls the 500-frame member at `$072D08` and trigger 62 the 150-frame one at `$072CEA`.
export type Op =
  | { readonly frames: number; readonly kind: 'poll-wait' }
  | { readonly frames: number; readonly kind: 'set-duration' }
  | { readonly id: DamoclesMessageId; readonly kind: 'message' }
  | { readonly kind: 'clear-busy' }
  | { readonly kind: 'reset-wait' }
  | { readonly kind: 'return' };

export type Step = number;

/// `$0523B8`'s reload source, bank word `$070102`. Every inline message presents for this many
/// frames, and the shared epilogue moves it rather than passing a duration.
export const ORDINARY_DISPLAY_FRAMES = 0x00_c8;
/// The value the shared epilogue writes before its clearing line.
export const CLEARING_LINE_FRAMES = 0x00_32;

const message = (id: DamoclesMessageId): Op => ({ id, kind: 'message' });

/// `$072CD6`-`$072D2E`: reset `$7B9C`, then loop while it is below the member's threshold.
const wait = (frames: number): readonly Op[] => [
  { kind: 'reset-wait' },
  { frames, kind: 'poll-wait' }
];

/// The shared epilogue at `$072CAE`, four instructions: drop the display duration to `$0032`,
/// present indexed record `$0032`, restore `$00C8`, clear `$0040` in `$7BD8` and return. Sixty-two
/// of the bank's scripts end on it. The clearing line therefore runs for 50 frames, not 200.
const sharedEpilogue = (): readonly Op[] => [
  { frames: CLEARING_LINE_FRAMES, kind: 'set-duration' },
  message('system-string-50'),
  { frames: ORDINARY_DISPLAY_FRAMES, kind: 'set-duration' },
  { kind: 'clear-busy' },
  { kind: 'return' }
];

export interface Script {
  readonly entry: number;
  readonly ops: readonly Op[];
  /// Bumped when a step index, the operation list, or the meaning of a continuation changes.
  readonly revision: number;
}

/// Trigger 2's own epilogue is inline at `$0704BE` and does **not** move the duration, so its
/// clearing line presents for the ordinary 200 frames. The research records this as the
/// exception rather than the rule.
///
/// Its delay threshold is the authored document's `waitFrames` rather than a bank member: the
/// limo-key work took it from the presentation document and no bank threshold is recovered for
/// it, so `WAIT_FROM_DOCUMENT` marks the place the rules supply.
export const WAIT_FROM_DOCUMENT = -1;

export const SCRIPTS: Readonly<Record<ScriptId, Script>> = {
  // $07042A. KEY- V.I.P. LIMO, resident slot 183.
  'damocles.script.slot-2': {
    entry: 0x07_04_2a,
    ops: [
      message('script2-inline-1'),
      message('script2-inline-2'),
      message('script2-inline-3'),
      ...wait(WAIT_FROM_DOCUMENT),
      message('system-string-50'),
      { kind: 'clear-busy' },
      { kind: 'return' }
    ],
    revision: 2
  },
  // $070AEA. KEY - EAGLE 9SE, resident slot 181. 600 + 500 + 50 frames.
  'damocles.script.slot-5': {
    entry: 0x07_0a_ea,
    ops: [
      message('script5-inline-1'),
      message('script5-inline-2'),
      message('script5-inline-3'),
      ...wait(500),
      ...sharedEpilogue()
    ],
    revision: 1
  },
  // $0705E6. DAMOCLES FILE, resident slot 151. 400 frames, and **no clearing line**: it clears
  // the busy flag and returns with its second message still presenting, so the row it wrote
  // outlives it until another message scrolls over it.
  'damocles.script.slot-6': {
    entry: 0x07_05_e6,
    ops: [
      message('script6-inline-1'),
      message('script6-inline-2'),
      { kind: 'clear-busy' },
      { kind: 'return' }
    ],
    revision: 1
  },
  // $070BDE. AUTHORS COMPUTER, resident slot 101. 400 + 50 frames.
  'damocles.script.slot-11': {
    entry: 0x07_0b_de,
    ops: [
      message('script11-inline-1'),
      message('script11-inline-2'),
      ...sharedEpilogue()
    ],
    revision: 1
  },
  // $0710B6. MAGIC CRYSTAL, resident slot 95. 200 + 50 frames.
  'damocles.script.slot-20': {
    entry: 0x07_10_b6,
    ops: [message('script20-inline-1'), ...sharedEpilogue()],
    revision: 1
  },
  // $071E8A. CASH REGISTER, resident slot 94. 150 + 600 + 50 frames: the wait comes first.
  'damocles.script.slot-62': {
    entry: 0x07_1e_8a,
    ops: [
      ...wait(150),
      message('script62-inline-1'),
      message('script62-inline-2'),
      message('script62-inline-3'),
      ...sharedEpilogue()
    ],
    revision: 1
  }
};

/// The recovered object-to-trigger table at `$0543EC`, as the walk at `$0543D2` reads it.
export const TRIGGER_FOR_RESIDENT: Readonly<Record<string, number>> = {
  'object-slot-101': 11,
  'object-slot-151': 6,
  'object-slot-181': 5,
  'object-slot-183': 2,
  'object-slot-94': 62,
  'object-slot-95': 20
};

export const SCRIPT_FOR_TRIGGER: Readonly<Record<number, ScriptId>> = {
  11: 'damocles.script.slot-11',
  2: 'damocles.script.slot-2',
  20: 'damocles.script.slot-20',
  5: 'damocles.script.slot-5',
  6: 'damocles.script.slot-6',
  62: 'damocles.script.slot-62'
};

/// The arming table at `$7CB4` as the pinned capture holds it, for the six pickup triggers.
///
/// Bit 7 is armed, bit 5 queues while busy and bit 6 is sticky. Only trigger 5 is queueable
/// (`$A0`); every pickup trigger has bit 6 clear, so all six are one-shot. The whole 64-byte
/// table holds exactly one sticky byte, at index `$38`, which is not a pickup trigger and is
/// not represented here.
///
/// Nothing in the recovered program re-arms a trigger: `$7CB4` is referenced by one instruction,
/// the `lea` at `$054774` inside the launcher. Armed values are what the loaded image supplies.
export const TRIGGER_ARMING: readonly {
  readonly byte: number;
  readonly index: number;
}[] = [
  { byte: 0x80, index: 2 },
  { byte: 0xa0, index: 5 },
  { byte: 0x80, index: 6 },
  { byte: 0x80, index: 11 },
  { byte: 0x80, index: 20 },
  { byte: 0x80, index: 62 }
];
