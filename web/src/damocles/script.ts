import {
  BLANK_DAMOCLES_DISPLAY,
  DAMOCLES_ROW_CELLS,
  advanceDisplay,
  beneathOf,
  isDocumentMessage,
  startDisplay,
  type DamoclesDisplay,
  type DamoclesMessageId,
  type DocumentMessageId
} from './display.ts';
import {
  ORDINARY_DISPLAY_FRAMES,
  SCRIPTS,
  SCRIPT_FOR_TRIGGER,
  TRIGGER_ARMING,
  WAIT_FROM_DOCUMENT,
  type ScriptId,
  type Step
} from './scripts.ts';

export interface Presenting {
  readonly id: DamoclesMessageId;
  /// Where in the record the block presenting starts: 0 but for a document body, which is
  /// longer than the row and so shown 48 cells at a time.
  readonly offset: number;
  readonly remainingFrames: number;
}

/// `$0523A2`: with the shorten flag `$0523BC` set, reading the terminator cuts the live duration
/// to 50 frames. A Read's deferred path sets the flag (`$0547E4`), so a body's last block holds
/// for 50 frames where every block before it holds for the full 200.
export const SHORTENED_DISPLAY_FRAMES = 50;

/// One suspended script and where it stopped. A queued response is taken up as soon as the busy
/// flag clears, which is **before** the running script returns, so it nests one frame inside a
/// script that is still mid-step: a stack of one script's own steps cannot represent that
/// (docs/research/damocles-pickup-responses.md, the `run-pending` case).
export interface Frame {
  readonly script: ScriptId;
  readonly step: Step;
}

export interface Execution {
  readonly returnStack: readonly Frame[];
  readonly revision: number;
  readonly script: ScriptId;
  readonly step: Step;
}

export interface Trigger {
  readonly armed: boolean;
  readonly index: number;
  /// Bit 5. While busy, a queueable trigger is written to `pending` and is **not** disarmed.
  readonly queueable: boolean;
  readonly script: ScriptId | null;
  /// Bit 6. No pickup trigger sets it; the table's one sticky byte is index `$38`.
  readonly sticky: boolean;
}

export interface ScriptState {
  readonly busy: boolean;
  readonly counter: number;
  readonly display: DamoclesDisplay;
  /// Bank word `$070102`. State, not a per-message constant: the shared epilogue drops it to 50
  /// and restores it, so one indexed record presents for 50 frames here and 200 elsewhere.
  readonly displayDuration: number;
  /// Bank word `$070104`, the encounter gate TOLOSA's script arms (#576). The panel's second
  /// lamp reads it, and the attack ship runs while it is set (#581).
  readonly encounter: number;
  readonly execution: Execution | null;
  /// `$7BD8` without the busy bit 6, which `busy` is. Only TOLOSA's bit 1 is written here.
  readonly flags: number;
  readonly message: Presenting | null;
  /// The word index of `$7E18` into the noise table: `(pointer - $77000) / 2`. A New Game
  /// starts at `NEW_GAME_NOISE`, each pass steps it (`stepNoise`), and each random skip reads
  /// one.
  readonly noise: number;
  /// `$7A88`. One word, so a second queueable trigger replaces the first rather than joining a
  /// queue. Consumed by the frame loop once the busy flag clears, not by the trigger itself.
  readonly pending: number | null;
  /// `$7B96` and `$7B92`: the document body a Read has queued. The dispatch head presents it
  /// the first frame the gate is down, ahead of any pending trigger or script (`$051944`).
  readonly read: DocumentMessageId | null;
  readonly triggers: readonly Trigger[];
  /// The table words zaps have turned, one entry a zap, in the order they fell (#581). `$050ECC`
  /// rotates the word two before the pointer left by one bit each time, so the table is state and
  /// not only content. The original's save covers neither the table nor the pointer.
  readonly zaps: readonly number[];
}

/// The 2,048 words `$77000`-`$77FFE` the pointer wraps inside (`and.w #$FFF`, `or.w #$7000`).
export const NOISE_WORDS = 0x8_00;

/// Where the pointer stands when a New Game hands the player the start pose (#582). `$051090`
/// seeds word 0, the descent's streaks then draw 10,085 words and the arrival steps 1,196 passes,
/// and the ship comes to rest at word 1,041 (`docs/research/damocles-noise-draws.md`). The port
/// has neither the descent nor the arrival, so it starts where they leave the pointer.
export const NEW_GAME_NOISE = 1041;

/// The noise word at `index` as the zaps have left it: the Catalogue's word turned left once for
/// every zap that fell on it.
export const noiseWord = (
  state: ScriptState,
  rules: ScriptRules,
  index: number
): number | undefined => {
  const word = rules.noise[index];
  if (word === undefined) {
    return undefined;
  }
  const turns = state.zaps.filter(zapped => zapped === index).length % 16;
  return ((word << turns) | (word >>> (16 - turns))) & 0xff_ff;
};

/// `$050ECC`, the zap's palette-noise loop: 65,535 steps from the pointer, each rotating the word
/// it visits right by one. 1,023 of the 1,024 words it visits turn 64 times and come back; the word
/// two before the pointer turns 63 times, a rotate left by one. The pointer does not move.
export const zapNoise = (state: ScriptState): ScriptState => ({
  ...state,
  zaps: [...state.zaps, (state.noise - 2 + NOISE_WORDS) % NOISE_WORDS]
});

/// `$05948C`, the main loop's join: one word a pass, with nothing read.
export const stepNoise = (state: ScriptState): ScriptState => ({
  ...state,
  noise: (state.noise + 1) % NOISE_WORDS
});

export type Effect =
  | {
      /// `door-start` and `door-stop` are the second sound vector's door tone and noise burst
      /// (`$04C37A`, `$04C2B8`), asked for as any door starts and stops moving. `thud` is the
      /// first vector's noise `$04C630`, asked for as an on-foot step is first refused at a
      /// region edge. Aboard (#556), `bump` is `$04C470` on a refused move, `blast` (`$04C5A8`)
      /// and `splash` (`$04C016`) a hard landing on land and at sea, and `throttle` the key
      /// effect `$054848` a throttle key asks for, as a take or a drop does.
      ///
      /// The TOLOSA encounter (#581) asks for `shot` (`$04C610`) as the player fires or downs the
      /// ship, `thud` as the ship fires (`$04C630`, the same programme), and `zap` (`$04C652`) as
      /// its shot hits.
      readonly cue:
        | 'blast'
        | 'bump'
        | 'door-start'
        | 'door-stop'
        | 'drop'
        | 'shot'
        | 'splash'
        | 'take'
        | 'throttle'
        | 'thud'
        | 'zap';
      readonly type: 'sound-request';
    }
  | {
      /// A message has raised the gate and begins to scroll in, with the text it presents. The
      /// ST's VBL sounds channel A from that text as it arrives (#522).
      readonly text: string;
      readonly type: 'message';
    };

export interface ScriptTransition {
  readonly effects: readonly Effect[];
  readonly state: ScriptState;
}

export interface ScriptRules {
  readonly messageFrames: number;
  readonly messageText: (id: DamoclesMessageId) => string;
  /// The Catalogue's `craft.noise` words, which a random skip draws from.
  readonly noise: Uint16Array;
  readonly waitFrames: number;
}

/// Arming values are what the loaded image supplies. Nothing re-arms a trigger.
const triggerTable = (): readonly Trigger[] =>
  TRIGGER_ARMING.map(({ byte, index }) => ({
    armed: (byte & 0x80) !== 0,
    index,
    queueable: (byte & 0x20) !== 0,
    script: SCRIPT_FOR_TRIGGER[index] ?? null,
    sticky: (byte & 0x40) !== 0
  }));

export const initialScriptState = (): ScriptState => ({
  busy: false,
  counter: 0,
  display: BLANK_DAMOCLES_DISPLAY,
  displayDuration: ORDINARY_DISPLAY_FRAMES,
  encounter: 0,
  execution: null,
  flags: 0,
  message: null,
  noise: NEW_GAME_NOISE,
  pending: null,
  read: null,
  triggers: triggerTable(),
  zaps: []
});

const present = (
  state: ScriptState,
  id: DamoclesMessageId,
  frames: number,
  offset = 0
): ScriptState => ({
  ...state,
  display: startDisplay(id, beneathOf(state.display), offset),
  message: { id, offset, remainingFrames: frames }
});

/// How long one block of a Read's body holds: the default 200 frames (`$0523BA`), or 50 where
/// the block reads the terminator, which it does when fewer than 48 characters are left.
const readBlockFrames = (
  text: string,
  offset: number,
  rules: ScriptRules
): number =>
  text.length - offset < DAMOCLES_ROW_CELLS
    ? SHORTENED_DISPLAY_FRAMES
    : rules.messageFrames;

/// `$0523BE`, at the end of a block: another block from where the pointer stopped if the record
/// has characters left, and otherwise the gate falls. Only a document body is longer than the
/// row; the bank's records are not given a second block here.
const endBlock = (
  state: ScriptState,
  message: Presenting,
  rules: ScriptRules
): ScriptState => {
  const offset = message.offset + DAMOCLES_ROW_CELLS;
  const text = rules.messageText(message.id);
  return isDocumentMessage(message.id) && offset < text.length
    ? present(state, message.id, readBlockFrames(text, offset, rules), offset)
    : { ...state, message: null };
};

/// `$0547C6`: the dispatch head's deferred path, which a Read queued.
const presentRead = (
  state: ScriptState,
  id: DocumentMessageId,
  rules: ScriptRules
): ScriptState =>
  present(
    { ...state, read: null },
    id,
    readBlockFrames(rules.messageText(id), 0, rules)
  );

/// `$04D776`: queue a document body, unless a Read is already waiting.
export const queueRead = (
  state: ScriptState,
  id: DocumentMessageId
): ScriptState => (state.read === null ? { ...state, read: id } : state);

const enter = (state: ScriptState, script: ScriptId): ScriptState => ({
  ...state,
  busy: true,
  execution: {
    returnStack:
      state.execution === null
        ? []
        : [
            ...state.execution.returnStack,
            { script: state.execution.script, step: state.execution.step }
          ],
    revision: SCRIPTS[script].revision,
    script,
    step: 0
  }
});

const runToBlock = (initial: ScriptState, rules: ScriptRules): ScriptState => {
  let state = initial;
  for (let guard = 0; guard < 1024; guard += 1) {
    const execution = state.execution;
    if (execution === null || state.message !== null) {
      return state;
    }
    const op = SCRIPTS[execution.script].ops[execution.step];
    if (op === undefined) {
      return { ...state, execution: null };
    }
    const advanced: Execution = { ...execution, step: execution.step + 1 };
    switch (op.kind) {
      case 'message':
        state = present(
          { ...state, execution: advanced },
          op.id,
          state.displayDuration
        );
        break;
      case 'set-duration':
        state = { ...state, displayDuration: op.frames, execution: advanced };
        break;
      case 'reset-wait':
        state = { ...state, counter: 0, execution: advanced };
        break;
      case 'random-skip': {
        // `$051A5E` reads the word and steps the pointer before it compares.
        const word = noiseWord(state, rules, state.noise);
        if (word === undefined) {
          throw new Error(`the noise table has no word ${state.noise}`);
        }
        state = {
          ...state,
          execution: word < op.below ? { ...execution, step: op.to } : advanced,
          noise: (state.noise + 1) % NOISE_WORDS
        };
        break;
      }
      case 'if-flag':
        state = {
          ...state,
          execution:
            (state.flags & op.mask) === 0
              ? advanced
              : { ...execution, step: op.to }
        };
        break;
      case 'set-flag':
        state = {
          ...state,
          execution: advanced,
          flags: state.flags | op.mask
        };
        break;
      case 'set-encounter':
        state = { ...state, encounter: op.value, execution: advanced };
        break;
      case 'poll-wait': {
        const threshold =
          op.frames === WAIT_FROM_DOCUMENT ? rules.waitFrames : op.frames;
        if (state.counter < threshold) {
          return state;
        }
        state = { ...state, execution: advanced };
        break;
      }
      case 'clear-busy':
        // Script 6 cleared $0040 at $07064A and, with its return at $07064E not yet executed,
        // the dispatch loop launched the pending script and pushed $07064E. So the flag clears
        // one step before the return and the dispatch runs in that gap: blocking here is what
        // makes the queued response nest inside a script that has not returned.
        state = { ...state, busy: false, execution: advanced };
        if (state.pending !== null) {
          return state;
        }
        break;
      case 'return': {
        const [outer, ...rest] = [...execution.returnStack].reverse();
        state =
          outer === undefined
            ? { ...state, execution: null }
            : {
                ...state,
                execution: {
                  returnStack: rest.reverse(),
                  revision: SCRIPTS[outer.script].revision,
                  script: outer.script,
                  step: outer.step
                }
              };
        break;
      }
    }
  }
  throw new Error('Damocles Script did not block');
};

/// Take up a queued response. The dispatch loop at `$05194C` picks `$7A88` up and `$054764` arms
/// and enters the script, clearing the word first -- so a pending index that no longer names an
/// armed trigger is consumed and refused, exactly as the `run-N` re-arm cases observed.
const takePending = (state: ScriptState, rules: ScriptRules): ScriptState => {
  if (state.pending === null || state.busy) {
    return state;
  }
  const cleared: ScriptState = { ...state, pending: null };
  const trigger = cleared.triggers.find(item => item.index === state.pending);
  if (
    trigger === undefined ||
    !trigger.armed ||
    trigger.script === null ||
    !(trigger.script in SCRIPTS)
  ) {
    return cleared;
  }
  return runToBlock(
    {
      ...enter(cleared, trigger.script),
      triggers: cleared.triggers.map(item =>
        item.index === trigger.index && !item.sticky
          ? { ...item, armed: false }
          : item
      )
    },
    rules
  );
};

/// The message a transition began, if it began one: a reveal at its start that was not there
/// before.
const shown = (
  before: ScriptState,
  after: ScriptState,
  rules: ScriptRules
): readonly Effect[] =>
  after.display !== before.display &&
  after.display.kind === 'scrolling' &&
  after.display.reveal.pixels === 0
    ? [
        {
          text: rules
            .messageText(after.display.id)
            .slice(after.display.reveal.offset),
          type: 'message'
        }
      ]
    : [];

export const runFrame = (
  input: ScriptState,
  rules: ScriptRules
): ScriptTransition => {
  let state: ScriptState = {
    ...input,
    counter: (input.counter + 1) % 65_536
  };
  if (state.message !== null) {
    const message = state.message;
    const remainingFrames = message.remainingFrames - 1;
    state = {
      ...state,
      display: advanceDisplay(state.display, rules.messageText(message.id))
    };
    state =
      remainingFrames === 0
        ? endBlock(state, message, rules)
        : { ...state, message: { ...message, remainingFrames } };
  }
  // `$05193E`: nothing is dispatched while the gate is up, and a queued Read goes first.
  const next =
    state.message === null && state.read !== null
      ? presentRead(state, state.read, rules)
      : takePending(runToBlock(state, rules), rules);
  return { effects: shown(input, next, rules), state: next };
};

/// `$054770`, entered past the busy test and the `$7A88` clear the dispatch loop performs.
///
/// The order is the recovered one. An already-fired trigger is refused **before** the busy test,
/// because its arming byte is `$00` and the `bpl` at `$054776` returns before anything else is
/// read. While busy, bit 5 queues and anything else is discarded and stays armed. The queue path
/// writes `pending` unconditionally, so a second queueable trigger replaces the first.
export const fireTrigger = (
  input: ScriptState,
  index: number,
  rules: ScriptRules
): ScriptTransition => {
  const trigger = input.triggers.find(item => item.index === index);
  if (trigger === undefined || !trigger.armed || trigger.script === null) {
    return { effects: [], state: input };
  }
  if (input.busy) {
    return {
      effects: [],
      state: trigger.queueable ? { ...input, pending: index } : input
    };
  }
  // The launch path clears bit 7 only, so trigger 5's $A0 becomes $20 and stays queueable.
  const entered: ScriptState = {
    ...enter(input, trigger.script),
    triggers: input.triggers.map(item =>
      item.index === index && !item.sticky ? { ...item, armed: false } : item
    )
  };
  const state = runToBlock(entered, rules);
  return { effects: shown(input, state, rules), state };
};

/// The system strings a native routine presents.
export type SystemMessageId =
  | 'system-string-0'
  | 'system-string-1'
  | 'system-string-2'
  | 'system-string-21'
  | 'system-string-22'
  | 'system-string-3'
  | 'system-string-33'
  | 'system-string-48'
  | 'system-string-49'
  | 'system-string-9';

export const presentSystemMessage = (
  input: ScriptState,
  id: SystemMessageId,
  rules: ScriptRules
): ScriptTransition => {
  const state = present(input, id, rules.messageFrames);
  return { effects: shown(input, state, rules), state };
};
