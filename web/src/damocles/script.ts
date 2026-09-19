import {
  BLANK_DAMOCLES_ROW,
  advanceDisplay,
  startDisplay,
  type DamoclesDisplay,
  type DamoclesMessageId
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
  readonly remainingFrames: number;
}

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
  readonly execution: Execution | null;
  readonly message: Presenting | null;
  /// `$7A88`. One word, so a second queueable trigger replaces the first rather than joining a
  /// queue. Consumed by the frame loop once the busy flag clears, not by the trigger itself.
  readonly pending: number | null;
  readonly triggers: readonly Trigger[];
}

export interface Effect {
  readonly cue: 'drop' | 'take';
  readonly type: 'sound-request';
}

export interface ScriptTransition {
  readonly effects: readonly Effect[];
  readonly state: ScriptState;
}

export interface ScriptRules {
  readonly messageFrames: number;
  readonly messageText: (id: DamoclesMessageId) => string;
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
  display: { cells: BLANK_DAMOCLES_ROW, kind: 'held' },
  displayDuration: ORDINARY_DISPLAY_FRAMES,
  execution: null,
  message: null,
  pending: null,
  triggers: triggerTable()
});

const present = (
  state: ScriptState,
  id: DamoclesMessageId,
  frames: number
): ScriptState => ({
  ...state,
  display: startDisplay(
    id,
    state.display.kind === 'held'
      ? state.display.cells
      : state.display.reveal.beneath
  ),
  message: { id, remainingFrames: frames }
});

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

export const runFrame = (
  input: ScriptState,
  rules: ScriptRules
): ScriptTransition => {
  let state: ScriptState = {
    ...input,
    counter: (input.counter + 1) % 65_536
  };
  if (state.message !== null) {
    const remainingFrames = state.message.remainingFrames - 1;
    state = {
      ...state,
      display: advanceDisplay(
        state.display,
        rules.messageText(state.message.id)
      ),
      message:
        remainingFrames === 0 ? null : { ...state.message, remainingFrames }
    };
  }
  return { effects: [], state: takePending(runToBlock(state, rules), rules) };
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
  const state: ScriptState = {
    ...enter(input, trigger.script),
    triggers: input.triggers.map(item =>
      item.index === index && !item.sticky ? { ...item, armed: false } : item
    )
  };
  return { effects: [], state: runToBlock(state, rules) };
};

export const presentSystemMessage = (
  input: ScriptState,
  id: 'system-string-1' | 'system-string-2' | 'system-string-9',
  rules: ScriptRules
): ScriptState => present(input, id, rules.messageFrames);
