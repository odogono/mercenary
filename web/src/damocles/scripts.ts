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
  'damocles.script.slot-15',
  'damocles.script.slot-18',
  'damocles.script.slot-2',
  'damocles.script.slot-20',
  'damocles.script.slot-21',
  'damocles.script.slot-22',
  'damocles.script.slot-23',
  'damocles.script.slot-24',
  'damocles.script.slot-25',
  'damocles.script.slot-3',
  'damocles.script.slot-32',
  'damocles.script.slot-33',
  'damocles.script.slot-34',
  'damocles.script.slot-35',
  'damocles.script.slot-36',
  'damocles.script.slot-37',
  'damocles.script.slot-38',
  'damocles.script.slot-39',
  'damocles.script.slot-40',
  'damocles.script.slot-4',
  'damocles.script.slot-41',
  'damocles.script.slot-43',
  'damocles.script.slot-44',
  'damocles.script.slot-45',
  'damocles.script.slot-46',
  'damocles.script.slot-47',
  'damocles.script.slot-48',
  'damocles.script.slot-49',
  'damocles.script.slot-5',
  'damocles.script.slot-50',
  'damocles.script.slot-51',
  'damocles.script.slot-52',
  'damocles.script.slot-53',
  'damocles.script.slot-54',
  'damocles.script.slot-55',
  'damocles.script.slot-56',
  'damocles.script.slot-57',
  'damocles.script.slot-58',
  'damocles.script.slot-59',
  'damocles.script.slot-6',
  'damocles.script.slot-60',
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
///
/// The landing scripts add four (#576). `random-skip` is `if.random` `$051A5E`: it draws the
/// word at the noise pointer and goes to step `to` when the word is below `below`. `if-flag` goes
/// to `to` when `$7BD8` has any of `mask`, and `set-flag` ors `mask` in. `set-encounter` is
/// TOLOSA's `bank.write $0104`, the encounter gate `$070104`.
///
/// The first offer adds five (#612). `set-reward` is `record.write $00F9`, the proposed reward at
/// `$7C4A`: its first BCD word, since every write slot 4 makes leaves the other four bytes zero.
/// `clear-key` is `$1C`, the word write `$00FF` to `$7B60` that empties the key latch `$7B61`.
/// `if-key` is `$0B`: it goes to `to` when the latch holds `code`, asking for the key effect
/// `$054848` as it does, and never consumes the key. `if-wait` is `$07` with a target: it goes
/// to `to` while the unsigned counter is below `below` and falls through at or above it.
/// `set-carried` is `word.write $00FE` (`$7C3E` = `slot`) and `record.bits $0080` together: bit 7
/// of `$6FAA + 4 * slot`, the slot's carried flag, with nothing put on the Carried Stack.
///
/// The endings add two (#625), both on the balance, record `$00F8`. `add-balance` is
/// `record.bcd.add $00F8`, six `abcd` steps of `amount` into it. `pay-reward` is
/// `record.bcd.three $00F8 $00F8 $00F9`, which adds the proposed reward. Each asks for the key
/// effect `$054848` first (`$051AEE`, `$051BAA`), as the handlers do for record `$00F8` alone.
export type Op =
  | { readonly amount: number; readonly kind: 'add-balance' }
  | { readonly below: number; readonly kind: 'if-wait'; readonly to: Step }
  | { readonly below: number; readonly kind: 'random-skip'; readonly to: Step }
  | { readonly code: number; readonly kind: 'if-key'; readonly to: Step }
  | { readonly frames: number; readonly kind: 'poll-wait' }
  | { readonly frames: number; readonly kind: 'set-duration' }
  | { readonly id: DamoclesMessageId; readonly kind: 'message' }
  | { readonly kind: 'clear-busy' }
  | { readonly kind: 'clear-key' }
  | { readonly kind: 'if-flag'; readonly mask: number; readonly to: Step }
  | { readonly kind: 'pay-reward' }
  | { readonly kind: 'reset-wait' }
  | { readonly kind: 'return' }
  | { readonly kind: 'set-carried'; readonly slot: number }
  | { readonly kind: 'set-encounter'; readonly value: number }
  | { readonly kind: 'set-flag'; readonly mask: number }
  | { readonly kind: 'set-reward'; readonly reward: number };

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

/// `$072D1C`, the call-shaped variant of the shared epilogue: the 50-frame clearing line, and no
/// busy clear.
const clearingLine = (): readonly Op[] => [
  { frames: CLEARING_LINE_FRAMES, kind: 'set-duration' },
  message('system-string-50'),
  { frames: ORDINARY_DISPLAY_FRAMES, kind: 'set-duration' }
];

/// The shared epilogue at `$072CAE`, four instructions: drop the display duration to `$0032`,
/// present indexed record `$0032`, restore `$00C8`, clear `$0040` in `$7BD8` and return. Sixty-two
/// of the bank's scripts end on it. The clearing line therefore runs for 50 frames, not 200.
const sharedEpilogue = (): readonly Op[] => [
  ...clearingLine(),
  { kind: 'clear-busy' },
  { kind: 'return' }
];

/// The operand every landing script's `if.random` compares with: a drawn word below it skips.
export const LANDING_RANDOM_BELOW = 0xa0_00;
/// `$072CE0`, the delay member every landing script calls first.
const LANDING_WAIT_FRAMES = 0x00_64;
/// Bit 1 of `$7BD8`, which only TOLOSA's script sets: it has been landed on before.
export const TOLOSA_VISITED_FLAG = 0x00_02;

/// A gazetteer (docs/research/damocles-landing-messages.md): `if.random $A000` to the epilogue's
/// busy clear at `$072CBE`, the 100-frame wait, the Body's lines, then the shared epilogue. A
/// skipped draw presents nothing and leaves the row as it was.
const gazetteer = (
  entry: number,
  lines: readonly DamoclesMessageId[]
): Script => {
  const body: readonly Op[] = [
    ...wait(LANDING_WAIT_FRAMES),
    ...lines.map(message),
    ...clearingLine()
  ];
  return {
    entry,
    ops: [
      { below: LANDING_RANDOM_BELOW, kind: 'random-skip', to: body.length + 1 },
      ...body,
      { kind: 'clear-busy' },
      { kind: 'return' }
    ],
    revision: 1
  };
};

/// Bit 0 of `$7BD8`, which only the first offer's acceptance `$0709AA` sets: the assignment has
/// been accepted (docs/research/damocles-location-triggers.md). The deflection ending reads it.
export const OFFER_ACCEPTED_FLAG = 0x00_01;

/// The key latch `$7B61` with nothing in it: `$1C` writes `$00FF` to the word `$7B60`.
export const NO_KEY = 0xff;

/// The ST make codes the `(OK?)` prompts compare `$7B61` with: `Y` and `O` accept, `N` declines.
export const ANSWER_KEYS = { n: 0x31, o: 0x18, y: 0x15 } as const;

/// The polls' `if.wait $01F4`: a prompt is answered within 500 counter ticks or times out.
export const ANSWER_FRAMES = 0x01_f4;

/// `$0707DC`, `$070830`, `$070888` and `$070914`: the four offers, 10, 15, 20 and 25 million,
/// as the BCD word `record.write $00F9` leads with. The refusal `$070968` writes zero.
export const OFFER_REWARDS = [0x00_10, 0x00_15, 0x00_20, 0x00_25] as const;

/// `$07090E`, `if.random $4000`: after the third offer, a word below it skips the fourth offer
/// and goes straight to the refusal.
export const FOURTH_OFFER_BELOW = 0x40_00;

/// The slot `$0709AE` writes to `$7C3E`, DOOR KEY A's, whose carried flag the acceptance sets.
export const OFFER_KEY_SLOT = 38;

/// An `(OK?)` prompt as it follows its question: `reset.wait`, then `Y`, `O` and `N` against
/// the latch, then the counter, looping to the `Y` test while it is below 500. The loop yields
/// once a frame, so the keys are read every VBL.
const answer = (at: Step, accept: Step, decline: Step): readonly Op[] => [
  { kind: 'reset-wait' },
  { code: ANSWER_KEYS.y, kind: 'if-key', to: accept },
  { code: ANSWER_KEYS.o, kind: 'if-key', to: accept },
  { code: ANSWER_KEYS.n, kind: 'if-key', to: decline },
  { below: ANSWER_FRAMES, kind: 'if-wait', to: at + 1 }
];

/// `$070650`, location trigger 4: the first work offer, on first entering region 7 of Floor 2 in
/// the Eris STATE OFFICE (docs/research/damocles-location-triggers.md). Eight lines of briefing
/// in three runs, then the bargaining ladder: 10, 15 and 20 million, each asked with the key
/// latch cleared first. N or the timeout climbs a rung. After 20 an `if.random $4000` decides
/// whether 25 is offered or the refusal comes at once. The refusal zeroes the reward and ends on
/// the shared epilogue. Y or O at any rung accepts at `$0709AA`: bit 0 of `$7BD8`, DOOR KEY A's
/// carried flag, six lines, and the script's own busy clear, which holds the last row.
const firstOffer = (): Script => {
  const briefing: readonly Op[] = [
    message('script4-inline-1'),
    message('script4-inline-2'),
    message('script4-inline-3'),
    message('script4-inline-4'),
    ...clearingLine(),
    message('script4-inline-5'),
    message('script4-inline-6'),
    ...clearingLine(),
    message('script4-inline-7'),
    message('script4-inline-8')
  ];
  // Each rung's length is fixed, so the branch targets are the running sums.
  const ten = briefing.length;
  const fifteen = ten + 8;
  const twenty = fifteen + 8;
  const draw = twenty + 9;
  const twentyFive = draw + 1;
  const refusal = twentyFive + 8;
  const accepted = refusal + 7;
  const ops: readonly Op[] = [
    ...briefing,
    // $0707DC
    { kind: 'set-reward', reward: OFFER_REWARDS[0] },
    { kind: 'clear-key' },
    message('script4-inline-9'),
    ...answer(ten + 3, accepted, fifteen),
    // $070830
    { kind: 'set-reward', reward: OFFER_REWARDS[1] },
    { kind: 'clear-key' },
    message('script4-inline-10'),
    ...answer(fifteen + 3, accepted, twenty),
    // $070888: the third rung writes the reward and a line before it clears the key.
    { kind: 'set-reward', reward: OFFER_REWARDS[2] },
    message('script4-inline-11'),
    { kind: 'clear-key' },
    message('script4-inline-12'),
    ...answer(twenty + 4, accepted, draw),
    // $07090E
    { below: FOURTH_OFFER_BELOW, kind: 'random-skip', to: refusal },
    // $070914
    { kind: 'set-reward', reward: OFFER_REWARDS[3] },
    { kind: 'clear-key' },
    message('script4-inline-13'),
    ...answer(twentyFive + 3, accepted, refusal),
    // $070968, then `jump $072CAE`.
    { kind: 'set-reward', reward: 0 },
    message('script4-inline-14'),
    ...sharedEpilogue(),
    // $0709AA
    { kind: 'set-flag', mask: OFFER_ACCEPTED_FLAG },
    { kind: 'set-carried', slot: OFFER_KEY_SLOT },
    message('script4-inline-15'),
    message('script4-inline-16'),
    ...clearingLine(),
    message('script4-inline-17'),
    message('script4-inline-18'),
    ...wait(LANDING_WAIT_FRAMES),
    message('script4-inline-19'),
    ...clearingLine(),
    message('script4-inline-20'),
    { kind: 'clear-busy' },
    { kind: 'return' }
  ];
  if (
    ops[accepted]?.kind !== 'set-flag' ||
    ops[refusal - 1]?.kind !== 'if-wait'
  ) {
    throw new Error("the first offer's branch targets do not line up");
  }
  return { entry: 0x07_06_50, ops, revision: 1 };
};

/// The BOOK, WISHFUL THINKING OF A MERCENARY, whose Read `$0547F2` compares `$7856` with.
export const BOOK_SLOT = 0x83;
/// The MAGIC CRYSTAL, whose carried flag is bit 7 of `$7126`. Every wish takes it (`$04CAF4`).
export const MAGIC_CRYSTAL_SLOT = 0x5f;
/// CHEESE SANDWICH, page 1's gift (`$0541E0`).
export const CHEESE_SANDWICH_SLOT = 0xdb;

/// Page 5's drift anchor `$7A7E`, `$FFFFEDCC`.
export const WISH_DRIFT = -0x12_34;
/// Page 6's palette XOR mask `$7A50`.
export const COLOURFUL_MASK = 0x02_13;

/// Record `$00F8`, the balance at `$7C42`, read as its twelve packed-decimal digits. The last two
/// are hundredths, so the offers' `$0010` leading word is 10 million. Every one of the 62
/// memstates and the pinned first world hold `00 00 00 90 00 00`, 9,000 credits.
export const NEW_GAME_BALANCE = 900_000;
/// Twelve digits: `abcd` carries out of the sixth byte into nothing.
export const BALANCE_MODULUS = 1_000_000_000_000;

/// The six-byte field a `record.bcd.add` operand or record `$00F9` holds, as digits: the first
/// BCD word is the top four digits and the other four bytes are zero.
export const leadingWordDigits = (word: number): number =>
  Number.parseInt(word.toString(16).padStart(4, '0'), 10) * 100_000_000;

/// `record.bcd.add $00F8 $0001 $0000 $0000` in `$16`: one million credits.
export const MILLION_CREDITS = leadingWordDigits(0x00_01);
/// `record.bcd.add $00F8 $0025 $0000 $0000` in `$3C`: twenty-five million, Lloyds' reward.
export const SPECIAL_REWARD = leadingWordDigits(0x00_25);

/// `$072CFE`, the 250-frame member of the delay family.
const WISH_WAIT_FRAMES = 0x00_fa;
/// `$072CEA`, the 150-frame member the State President's endings open on.
const PRESIDENT_WAIT_FRAMES = 0x00_96;

/// `$071184`, a call: THE MYSTICAL ORDER OF CARPENTERS GRANT YOUR WISH. Every wish but `$19`
/// opens on it.
const grant = (): Op => message('script21-inline-1');

/// `$0714D6`–`$07162A`: the State President's reward tail. With the offer's accepted bit, the
/// `accepted` lines and record `$00F9` paid into the balance; without it the `declined` lines.
/// Laid out as the `$0F` port is, the accepted run second, because `if-flag` branches when the
/// bit is set and the bank's `if.flags :not` when it is clear. `at` is the tail's first step.
const presidentTail = (
  at: Step,
  accepted: readonly DamoclesMessageId[],
  declined: readonly DamoclesMessageId[]
): readonly Op[] => [
  {
    kind: 'if-flag',
    mask: OFFER_ACCEPTED_FLAG,
    to: at + 1 + declined.length + sharedEpilogue().length
  },
  ...declined.map(message),
  ...sharedEpilogue(),
  ...accepted.map(message),
  { kind: 'pay-reward' },
  ...sharedEpilogue()
];

/// `$0714D2`, trigger `$12`: MESSAGE FROM THE STATE PRESIDENT / CONGRATULATIONS ON SAVING ERIS,
/// after the 150-frame wait. Its lines are extracted under trigger 16's scope, because `$10`
/// falls into it. `$3C` jumps here after its own lines, so `at` is the step it starts on.
const erisSaved = (at: Step): readonly Op[] => [
  ...wait(PRESIDENT_WAIT_FRAMES),
  ...presidentTail(
    at + 2,
    ['script16-inline-5', 'script16-inline-6', 'script16-inline-7'],
    [
      'script16-inline-8',
      'script16-inline-9',
      'script16-inline-10',
      'script16-inline-11'
    ]
  )
];

/// `$071254`, trigger `$3C`, BOOK page 5: the grant line, `$072D1C`'s clearing line, the
/// 150-frame wait, Lloyds' five lines and the special reward, then `message.indexed $0032` at the
/// restored 200 frames and a jump into `$12`.
const bothSaved = (): Script => {
  const own: readonly Op[] = [
    grant(),
    ...clearingLine(),
    ...wait(PRESIDENT_WAIT_FRAMES),
    ...[1, 2, 3, 4, 5].map(index =>
      message(`script60-inline-${index}` as DamoclesMessageId)
    ),
    { amount: SPECIAL_REWARD, kind: 'add-balance' },
    message('system-string-50')
  ];
  return {
    entry: 0x07_12_54,
    ops: [...own, ...erisSaved(own.length)],
    revision: 1
  };
};

/// `$0711BA`, trigger `$17`, BOOK page 3: the grant line, the clearing line, the 250-frame wait,
/// the State President's WE DON'T KNOW HOW YOU'VE DONE IT - BUT, then `$12`'s tail from its
/// reward line (`$071532`) or its last two refusal lines (`$0715C4`).
const erisSavedByWish = (): Script => {
  const own: readonly Op[] = [
    grant(),
    ...clearingLine(),
    ...wait(WISH_WAIT_FRAMES),
    message('script23-inline-1'),
    message('script23-inline-2'),
    message('script23-inline-3')
  ];
  return {
    entry: 0x07_11_ba,
    ops: [
      ...own,
      ...presidentTail(
        own.length,
        ['script16-inline-7'],
        ['script16-inline-10', 'script16-inline-11']
      )
    ],
    revision: 1
  };
};

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
  // $07169E, trigger $0F: zero on the impact clock. After the 150-frame wait the State President
  // answers according to the first offer's accepted bit; neither branch changes the balance.
  'damocles.script.slot-15': {
    entry: 0x07_16_9e,
    ops: [
      ...wait(PRESIDENT_WAIT_FRAMES),
      { kind: 'if-flag', mask: OFFER_ACCEPTED_FLAG, to: 13 },
      ...[6, 7, 8, 9, 10].map(index =>
        message(`script15-inline-${index}` as DamoclesMessageId)
      ),
      ...sharedEpilogue(),
      ...[1, 2, 3, 4, 5].map(index =>
        message(`script15-inline-${index}` as DamoclesMessageId)
      ),
      ...sharedEpilogue()
    ],
    revision: 2
  },
  'damocles.script.slot-18': {
    entry: 0x07_14_d2,
    ops: erisSaved(0),
    revision: 1
  },
  // $0710EE, trigger $15: the grant line and the shared epilogue. Pages 1, 4 and 6.
  'damocles.script.slot-21': {
    entry: 0x07_10_ee,
    ops: [grant(), ...sharedEpilogue()],
    revision: 1
  },
  // $0710F6, trigger $16, page 2: the grant line, then a million credits.
  'damocles.script.slot-22': {
    entry: 0x07_10_f6,
    ops: [
      grant(),
      { amount: MILLION_CREDITS, kind: 'add-balance' },
      ...sharedEpilogue()
    ],
    revision: 1
  },
  'damocles.script.slot-23': erisSavedByWish(),
  // $071108, trigger $18, page 7: the grant line, the clearing line, TO ACTIVATE - BOARD THE
  // AUTHOR'S CHAIR, and the 250-frame wait.
  'damocles.script.slot-24': {
    entry: 0x07_11_08,
    ops: [
      grant(),
      ...clearingLine(),
      message('script24-inline-1'),
      ...wait(WISH_WAIT_FRAMES),
      ...sharedEpilogue()
    ],
    revision: 1
  },
  // $07114C, trigger $19, page 8: WE SAID WE'D GRANT YOU A WISH - NOT A MIRACLE, with no grant.
  'damocles.script.slot-25': {
    entry: 0x07_11_4c,
    ops: [message('script25-inline-1'), ...sharedEpilogue()],
    revision: 1
  },
  'damocles.script.slot-60': bothSaved(),
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
  // $0704C8, location trigger 3: the State President's welcome, on first entering an indoor
  // region of the Eris STATE OFFICE on Floor 0. 800 + 50 + 400 frames, and like trigger 6 its
  // own ending clears the busy flag with no clearing line, so the last row stays held.
  'damocles.script.slot-3': {
    entry: 0x07_04_c8,
    ops: [
      message('script3-inline-1'),
      message('script3-inline-2'),
      message('script3-inline-3'),
      message('script3-inline-4'),
      ...clearingLine(),
      message('script3-inline-5'),
      message('script3-inline-6'),
      { kind: 'clear-busy' },
      { kind: 'return' }
    ],
    revision: 1
  },
  'damocles.script.slot-4': firstOffer(),
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
  // $0720B2, trigger $20. ICARUS, Body 1.
  'damocles.script.slot-32': gazetteer(0x07_20_b2, [
    'script32-inline-1',
    'script32-inline-2'
  ]),
  // $07211A, trigger $21. MIDAS, Body 2.
  'damocles.script.slot-33': gazetteer(0x07_21_1a, [
    'script33-inline-1',
    'script33-inline-2',
    'script33-inline-3'
  ]),
  // $0721B0, trigger $22. ACHERON, Body 3.
  'damocles.script.slot-34': gazetteer(0x07_21_b0, [
    'script34-inline-1',
    'script34-inline-2'
  ]),
  // $072222, trigger $23. DION, Body 4.
  'damocles.script.slot-35': gazetteer(0x07_22_22, [
    'script35-inline-1',
    'script35-inline-2',
    'script35-inline-3'
  ]),
  // $0723C6, trigger $24. ATROPOS, Body 5.
  'damocles.script.slot-36': gazetteer(0x07_23_c6, [
    'script36-inline-1',
    'script36-inline-2'
  ]),
  // $0722C0, trigger $25. CLOTHO, Body 6.
  'damocles.script.slot-37': gazetteer(0x07_22_c0, [
    'script37-inline-1',
    'script37-inline-2'
  ]),
  // $07232A, trigger $26. LACHESIS, Body 7.
  'damocles.script.slot-38': gazetteer(0x07_23_2a, [
    'script38-inline-1',
    'script38-inline-2',
    'script38-inline-3'
  ]),
  // $072438, trigger $27. GAEA, Body 8.
  'damocles.script.slot-39': gazetteer(0x07_24_38, [
    'script39-inline-1',
    'script39-inline-2',
    'script39-inline-3'
  ]),
  // $072574, trigger $28. CRONUS, Body 9.
  'damocles.script.slot-40': gazetteer(0x07_25_74, [
    'script40-inline-1',
    'script40-inline-2'
  ]),
  // $0724D8, trigger $29. CYCLOPES, Body 10.
  'damocles.script.slot-41': gazetteer(0x07_24_d8, [
    'script41-inline-1',
    'script41-inline-2',
    'script41-inline-3'
  ]),
  // $07264E, trigger $2B. SOLON, Body 12.
  'damocles.script.slot-43': gazetteer(0x07_26_4e, [
    'script43-inline-1',
    'script43-inline-2'
  ]),
  // $0727A4, trigger $2C. THEON, Body 13.
  'damocles.script.slot-44': gazetteer(0x07_27_a4, [
    'script44-inline-1',
    'script44-inline-2'
  ]),
  // $0726C2, trigger $2D. VESTA, Body 14.
  'damocles.script.slot-45': gazetteer(0x07_26_c2, [
    'script45-inline-1',
    'script45-inline-2'
  ]),
  // $0725E2, trigger $2E. METIS, Body 15.
  'damocles.script.slot-46': gazetteer(0x07_25_e2, [
    'script46-inline-1',
    'script46-inline-2'
  ]),
  // $072734, trigger $2F. LUCAN, Body 16.
  'damocles.script.slot-47': gazetteer(0x07_27_34, [
    'script47-inline-1',
    'script47-inline-2'
  ]),
  // $072816, trigger $30. LOGOS, Body 17.
  'damocles.script.slot-48': gazetteer(0x07_28_16, ['script48-inline-1']),
  // $072852, trigger $31. AURORA, Body 18.
  'damocles.script.slot-49': gazetteer(0x07_28_52, ['script49-inline-1']),
  // $072892, trigger $32. TRITON, Body 19.
  'damocles.script.slot-50': gazetteer(0x07_28_92, ['script50-inline-1']),
  // $0728D4, trigger $33. PAN, Body 20.
  'damocles.script.slot-51': gazetteer(0x07_28_d4, [
    'script51-inline-1',
    'script51-inline-2'
  ]),
  // $072948, trigger $34. THALIA, Body 21.
  'damocles.script.slot-52': gazetteer(0x07_29_48, [
    'script52-inline-1',
    'script52-inline-2'
  ]),
  // $0729BC, trigger $35. JUNO, Body 22.
  'damocles.script.slot-53': gazetteer(0x07_29_bc, ['script53-inline-1']),
  // $072B92, trigger $36. BACCHUS, Body 23.
  'damocles.script.slot-54': gazetteer(0x07_2b_92, [
    'script54-inline-1',
    'script54-inline-2'
  ]),
  // $072B20, trigger $37. JASON, Body 24.
  'damocles.script.slot-55': gazetteer(0x07_2b_20, [
    'script55-inline-1',
    'script55-inline-2'
  ]),
  // $0729FC, trigger $39. PERSEUS, Body 26.
  'damocles.script.slot-57': gazetteer(0x07_29_fc, [
    'script57-inline-1',
    'script57-inline-2'
  ]),
  // $072C04, trigger $3A. MENTOR, Body 27.
  'damocles.script.slot-58': gazetteer(0x07_2c_04, [
    'script58-inline-1',
    'script58-inline-2'
  ]),
  // $072C6E, trigger $3B. SAPPHIRE, Body 28.
  'damocles.script.slot-59': gazetteer(0x07_2c_6e, ['script59-inline-1']),
  // $072A6E. TOLOSA, Body 25: sticky, and no random skip. A first landing takes
  // 100 + 400 + 50 + 100 + 200 + 50 frames, a later one 100 + 200 + 50: bit 1 of $7BD8 skips
  // straight to the attack line at $072AE8. Every landing then arms the encounter gate $070104.
  'damocles.script.slot-56': {
    entry: 0x07_2a_6e,
    ops: [
      ...wait(LANDING_WAIT_FRAMES),
      { kind: 'if-flag', mask: TOLOSA_VISITED_FLAG, to: 11 },
      { kind: 'set-flag', mask: TOLOSA_VISITED_FLAG },
      message('script56-inline-1'),
      message('script56-inline-2'),
      ...clearingLine(),
      ...wait(LANDING_WAIT_FRAMES),
      message('script56-inline-3'),
      { kind: 'set-encounter', value: 0x00_01 },
      ...sharedEpilogue()
    ],
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

/// The location triggers the port runs (docs/research/damocles-location-triggers.md): the State
/// President's welcome and the first offer. The tables name twelve more, whose scripts are not
/// yet authored. The walk still finds their entries; with no trigger here the launcher refuses
/// them.
export const LOCATION_TRIGGERS: readonly number[] = [3, 4];

/// The landing triggers `body + $1F` the port runs: `$20`-`$3B` without ERIS's `$2A`, which the
/// landing skips and whose script is the author's computer's (#576). DAMOCLES's `$3C` is the
/// deflection ending, and the landing skips it too.
export const LANDING_TRIGGERS: readonly number[] = [
  32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51,
  52, 53, 54, 55, 56, 57, 58, 59
];

/// The endings the BOOK's wishes fire (#625), and `$12`, whose body `$3C` runs after its own.
/// Nothing but the dispatcher fires `$12` itself, which is not ported yet. Every ending's arming
/// byte is `$A0`, so it queues behind a running script and fires once.
export const ENDING_TRIGGERS: readonly number[] = [18, 21, 22, 23, 24, 25, 60];

export const SCRIPT_FOR_TRIGGER: Readonly<Record<number, ScriptId>> = {
  11: 'damocles.script.slot-11',
  15: 'damocles.script.slot-15',
  18: 'damocles.script.slot-18',
  2: 'damocles.script.slot-2',
  20: 'damocles.script.slot-20',
  21: 'damocles.script.slot-21',
  22: 'damocles.script.slot-22',
  23: 'damocles.script.slot-23',
  24: 'damocles.script.slot-24',
  25: 'damocles.script.slot-25',
  3: 'damocles.script.slot-3',
  4: 'damocles.script.slot-4',
  5: 'damocles.script.slot-5',
  6: 'damocles.script.slot-6',
  60: 'damocles.script.slot-60',
  62: 'damocles.script.slot-62',
  ...Object.fromEntries(
    LANDING_TRIGGERS.map(index => [
      index,
      `damocles.script.slot-${index}` as ScriptId
    ])
  )
};

/// The arming table at `$7CB4` as the pinned capture holds it, for the six pickup triggers, the
/// two State Office location triggers and the 27 landing triggers.
///
/// Bit 7 is armed, bit 5 queues while busy and bit 6 is sticky. Triggers 4 and 5 are queueable
/// (`$A0`): the first offer waits in `$7A88` behind the State President's welcome. The whole 64-byte table holds exactly one sticky byte, TOLOSA's `$38` (`$C0`), so
/// every other trigger here is one-shot.
///
/// Nothing in the recovered program re-arms a trigger: `$7CB4` is referenced by one instruction,
/// the `lea` at `$054774` inside the launcher. Armed values are what the loaded image supplies.
export const TRIGGER_ARMING: readonly {
  readonly byte: number;
  readonly index: number;
}[] = [
  { byte: 0xa0, index: 15 },
  { byte: 0x80, index: 2 },
  { byte: 0xa0, index: 5 },
  { byte: 0x80, index: 6 },
  { byte: 0x80, index: 11 },
  { byte: 0x80, index: 20 },
  { byte: 0x80, index: 62 },
  { byte: 0x80, index: 3 },
  { byte: 0xa0, index: 4 },
  ...ENDING_TRIGGERS.map(index => ({ byte: 0xa0, index })),
  ...LANDING_TRIGGERS.map(index => ({
    byte: index === 0x38 ? 0xc0 : 0x80,
    index
  }))
];
