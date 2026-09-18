import {
  BLANK_DAMOCLES_ROW,
  advanceDisplay,
  startDisplay,
  type DamoclesDisplay,
  type DamoclesMessageId
} from './display.ts';
import {
  SLOT_2_MESSAGES,
  SLOT_2_REVISION,
  SLOT_2_SCRIPT,
  type ScriptId,
  type Step
} from './slot2.ts';

export interface Presenting {
  readonly id: DamoclesMessageId;
  readonly remainingFrames: number;
}

export interface Execution {
  readonly returnStack: readonly Step[];
  readonly revision: number;
  readonly script: ScriptId;
  readonly step: Step;
}

export interface Trigger {
  readonly armed: boolean;
  readonly index: number;
  readonly script: ScriptId | null;
}

export interface ScriptState {
  readonly busy: boolean;
  readonly counter: number;
  readonly display: DamoclesDisplay;
  readonly execution: Execution | null;
  readonly message: Presenting | null;
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

const triggerTable = (): readonly Trigger[] => [
  { armed: true, index: 2, script: SLOT_2_SCRIPT },
  { armed: true, index: 5, script: null },
  { armed: true, index: 6, script: null },
  { armed: true, index: 20, script: null },
  { armed: true, index: 11, script: null },
  { armed: true, index: 62, script: null }
];

export const initialScriptState = (): ScriptState => ({
  busy: false,
  counter: 0,
  display: { cells: BLANK_DAMOCLES_ROW, kind: 'held' },
  execution: null,
  message: null,
  triggers: triggerTable()
});

const present = (
  state: ScriptState,
  id: DamoclesMessageId,
  rules: ScriptRules
): ScriptState => ({
  ...state,
  display: startDisplay(
    id,
    state.display.kind === 'held'
      ? state.display.cells
      : state.display.reveal.beneath
  ),
  message: { id, remainingFrames: rules.messageFrames }
});

const runToBlock = (initial: ScriptState, rules: ScriptRules): ScriptState => {
  let state = initial;
  while (state.execution !== null) {
    const execution = state.execution;
    if (state.message !== null) {
      return state;
    }
    switch (execution.step) {
      case 'announce-1':
      case 'announce-2':
      case 'announce-3':
      case 'clear-line': {
        const id = SLOT_2_MESSAGES[execution.step]!;
        const next: Step =
          execution.step === 'announce-1'
            ? 'announce-2'
            : execution.step === 'announce-2'
              ? 'announce-3'
              : execution.step === 'announce-3'
                ? 'call-delay'
                : 'clear-busy';
        state = present(
          { ...state, execution: { ...execution, step: next } },
          id,
          rules
        );
        break;
      }
      case 'call-delay':
        state = {
          ...state,
          execution: {
            ...execution,
            returnStack: [...execution.returnStack, 'return-from-delay'],
            step: 'reset-wait'
          }
        };
        break;
      case 'reset-wait':
        state = {
          ...state,
          counter: 0,
          execution: { ...execution, step: 'poll-wait' }
        };
        break;
      case 'poll-wait':
        if (state.counter < rules.waitFrames) {
          return state;
        }
        state = {
          ...state,
          execution: { ...execution, step: 'return-from-delay' }
        };
        break;
      case 'return-from-delay':
        state = {
          ...state,
          execution: {
            ...execution,
            returnStack: execution.returnStack.slice(0, -1),
            step: 'clear-line'
          }
        };
        break;
      case 'clear-busy':
        state = {
          ...state,
          busy: false,
          execution: { ...execution, step: 'return' }
        };
        break;
      case 'return':
        state = { ...state, execution: null };
        break;
      case 'idle':
        return { ...state, execution: null };
    }
  }
  return state;
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
  return { effects: [], state: runToBlock(state, rules) };
};

export const fireTrigger = (
  input: ScriptState,
  index: number,
  rules: ScriptRules
): ScriptTransition => {
  const trigger = input.triggers.find(item => item.index === index);
  if (trigger === undefined || !trigger.armed || trigger.script === null) {
    return { effects: [], state: input };
  }
  const state: ScriptState = {
    ...input,
    busy: true,
    execution: {
      returnStack: ['idle'],
      revision: SLOT_2_REVISION,
      script: SLOT_2_SCRIPT,
      step: 'announce-1'
    },
    triggers: input.triggers.map(item =>
      item.index === index ? { ...item, armed: false } : item
    )
  };
  return { effects: [], state: runToBlock(state, rules) };
};

export const presentSystemMessage = (
  input: ScriptState,
  id: 'system-string-9',
  rules: ScriptRules
): ScriptState => present(input, id, rules);
