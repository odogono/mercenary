// Isolated prototype contract: docs/design/damocles-first-offer-script.md.
// Address provenance: docs/research/damocles-first-offer.md (Working Authority).
export type Step =
  | 'set-reward'
  | 'clear-key'
  | 'request-prompt'
  | 'reset-counter'
  | 'check-y'
  | 'check-o'
  | 'check-n'
  | 'check-timeout'
  | 'accepted'
  | 'next-offer';
export type Key = 'none' | 'y' | 'o' | 'n' | 'other';
export type PromptId = 'first-offer';
export type Reward = readonly [number, number, number];
export type Message =
  | { readonly status: 'absent' }
  | { readonly id: PromptId; readonly status: 'pending' | 'completed' };
export type Wait =
  | { readonly kind: 'none' }
  | { readonly id: PromptId; readonly kind: 'message' }
  | { readonly kind: 'counter'; readonly threshold: 500 };
export type State = {
  readonly host: { readonly counter: number; readonly key: Key };
  readonly locals: { readonly proposedReward: Reward | null };
  readonly message: Message;
  readonly step: Step;
  readonly wait: Wait;
};
export type Action =
  | { readonly key: Key; readonly type: 'set-key' }
  | { readonly ticks: number; readonly type: 'advance-ticks' }
  | { readonly id: PromptId; readonly type: 'complete-message' }
  | { readonly type: 'execute-step' };
export type Effect =
  | { readonly id: PromptId; readonly type: 'request-message' }
  | { readonly key: 'y' | 'o' | 'n'; readonly type: 'request-acknowledgement' }
  | { readonly branch: 'accepted' | 'next-offer'; readonly type: 'handoff' };
export type Transition = {
  readonly effects: readonly Effect[];
  readonly state: State;
};
export type PrototypeSnapshot = {
  readonly formatVersion: 1;
  readonly scriptId: 'damocles-first-offer';
  readonly scriptRevision: 1;
  readonly state: State;
};

export const initialState = (): State => ({
  host: { counter: 0, key: 'none' },
  locals: { proposedReward: null },
  message: { status: 'absent' },
  step: 'set-reward',
  wait: { kind: 'none' }
});
const unchanged = (state: State): Transition => ({ effects: [], state });
const terminal = (state: State) =>
  state.step === 'accepted' || state.step === 'next-offer';
const handoff = (
  state: State,
  branch: 'accepted' | 'next-offer',
  key?: 'y' | 'o' | 'n'
): Transition => ({
  effects: [
    ...(key ? [{ key, type: 'request-acknowledgement' as const }] : []),
    { branch, type: 'handoff' }
  ],
  state: { ...state, step: branch, wait: { kind: 'none' } }
});

// $0707DC: proposed reward only; its economic encoding remains unresolved.
const setReward = (state: State): Transition =>
  unchanged({
    ...state,
    locals: { proposedReward: [0x00_10, 0, 0] },
    step: 'clear-key'
  });
// $0707E6: the pre-prompt clear is the only script write to the key latch.
const clearKey = (state: State): Transition =>
  unchanged({
    ...state,
    host: { ...state.host, key: 'none' },
    step: 'request-prompt'
  });
// $0707E8: commit successor $070816 before suspending on the message gate.
const requestPrompt = (state: State): Transition => ({
  effects: [{ id: 'first-offer', type: 'request-message' }],
  state: {
    ...state,
    message: { id: 'first-offer', status: 'pending' },
    step: 'reset-counter',
    wait: { id: 'first-offer', kind: 'message' }
  }
});
// $070816: reset only the counter, after message completion.
const resetCounter = (state: State): Transition =>
  unchanged({
    ...state,
    host: { ...state.host, counter: 0 },
    step: 'check-y',
    wait: { kind: 'counter', threshold: 500 }
  });
// $070818 / $07081E / $070824: separate dispatches, persistent latch.
// Acknowledgement records a native sound request, not guaranteed audible output.
const checkY = (state: State): Transition =>
  state.host.key === 'y'
    ? handoff(state, 'accepted', 'y')
    : unchanged({ ...state, step: 'check-o' });
const checkO = (state: State): Transition =>
  state.host.key === 'o'
    ? handoff(state, 'accepted', 'o')
    : unchanged({ ...state, step: 'check-n' });
const checkN = (state: State): Transition =>
  state.host.key === 'n'
    ? handoff(state, 'next-offer', 'n')
    : unchanged({ ...state, step: 'check-timeout' });
// $07082A: unsigned comparison. Stop before $0709AA / $070830 effects.
const checkTimeout = (state: State): Transition =>
  state.host.counter < 500
    ? unchanged({ ...state, step: 'check-y' })
    : handoff(state, 'next-offer');
const dispatch: Readonly<Record<Step, (state: State) => Transition>> = {
  accepted: unchanged,
  'check-n': checkN,
  'check-o': checkO,
  'check-timeout': checkTimeout,
  'check-y': checkY,
  'clear-key': clearKey,
  'next-offer': unchanged,
  'request-prompt': requestPrompt,
  'reset-counter': resetCounter,
  'set-reward': setReward
};

const requireValue: (
  condition: boolean,
  message: string
) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};
const record = (value: unknown, name: string): Record<string, unknown> => {
  requireValue(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${name} must be an object`
  );
  return value as Record<string, unknown>;
};
const fields = (
  value: Record<string, unknown>,
  expected: readonly string[],
  name: string
) => {
  const actual = Reflect.ownKeys(value);
  requireValue(
    actual.length === expected.length &&
      expected.every(key => Object.hasOwn(value, key)),
    `${name} has missing or unknown fields`
  );
};
const isKey = (value: unknown): value is Key =>
  value === 'none' ||
  value === 'y' ||
  value === 'o' ||
  value === 'n' ||
  value === 'other';
const validateAction = (value: unknown) => {
  const action = record(value, 'action');
  switch (action.type) {
    case 'set-key':
      fields(action, ['type', 'key'], 'action');
      requireValue(isKey(action.key), 'action key is invalid');
      break;
    case 'advance-ticks':
      fields(action, ['type', 'ticks'], 'action');
      requireValue(
        typeof action.ticks === 'number' &&
          Number.isSafeInteger(action.ticks) &&
          action.ticks >= 0,
        'action ticks must be a nonnegative safe integer'
      );
      break;
    case 'complete-message':
      fields(action, ['type', 'id'], 'action');
      requireValue(action.id === 'first-offer', 'action message id is invalid');
      break;
    case 'execute-step':
      fields(action, ['type'], 'action');
      break;
    default:
      throw new Error('action type is invalid');
  }
};

export const transition = (state: State, action: Action): Transition => {
  validateAction(action);
  if (terminal(state)) {
    return unchanged(state);
  }
  switch (action.type) {
    case 'set-key':
      return unchanged({ ...state, host: { ...state.host, key: action.key } });
    case 'advance-ticks':
      return unchanged({
        ...state,
        host: {
          ...state.host,
          counter: (state.host.counter + (action.ticks % 65_536)) % 65_536
        }
      });
    case 'complete-message':
      return state.message.status === 'pending'
        ? unchanged({
            ...state,
            message: { id: action.id, status: 'completed' },
            wait: { kind: 'none' }
          })
        : unchanged(state);
    case 'execute-step':
      return state.message.status === 'pending'
        ? unchanged(state)
        : dispatch[state.step](state);
  }
};

export const snapshot = (state: State): PrototypeSnapshot => ({
  formatVersion: 1,
  scriptId: 'damocles-first-offer',
  scriptRevision: 1,
  state: structuredClone(state)
});

const validateState = (value: unknown): State => {
  const state = record(value, 'state');
  fields(state, ['step', 'locals', 'message', 'wait', 'host'], 'state');
  requireValue(
    typeof state.step === 'string' && Object.hasOwn(dispatch, state.step),
    'state step is invalid'
  );
  const locals = record(state.locals, 'locals');
  fields(locals, ['proposedReward'], 'locals');
  const reward = locals.proposedReward;
  requireValue(
    reward === null ||
      (Array.isArray(reward) &&
        reward.length === 3 &&
        Reflect.ownKeys(reward).length === 4 &&
        reward[0] === 16 &&
        reward[1] === 0 &&
        reward[2] === 0),
    'proposed reward is invalid'
  );
  const host = record(state.host, 'host');
  fields(host, ['key', 'counter'], 'host');
  requireValue(isKey(host.key), 'host key is invalid');
  requireValue(
    typeof host.counter === 'number' &&
      Number.isInteger(host.counter) &&
      host.counter >= 0 &&
      host.counter <= 65_535,
    'host counter must be an integer from 0 to 65535'
  );
  const message = record(state.message, 'message');
  if (message.status === 'absent') {
    fields(message, ['status'], 'message');
  } else {
    fields(message, ['status', 'id'], 'message');
    requireValue(
      (message.status === 'pending' || message.status === 'completed') &&
        message.id === 'first-offer',
      'message is invalid'
    );
  }
  const wait = record(state.wait, 'wait');
  switch (wait.kind) {
    case 'none':
      fields(wait, ['kind'], 'wait');
      break;
    case 'message':
      fields(wait, ['kind', 'id'], 'wait');
      requireValue(wait.id === 'first-offer', 'wait message is invalid');
      break;
    case 'counter':
      fields(wait, ['kind', 'threshold'], 'wait');
      requireValue(wait.threshold === 500, 'wait threshold is invalid');
      break;
    default:
      throw new Error('wait kind is invalid');
  }
  requireValue(
    (state.step === 'set-reward') === (reward === null),
    'reward is inconsistent with step'
  );
  let phaseValid: boolean;
  switch (state.step) {
    case 'set-reward':
    case 'clear-key':
    case 'request-prompt':
      phaseValid = message.status === 'absent' && wait.kind === 'none';
      break;
    case 'reset-counter':
      phaseValid =
        (message.status === 'pending' && wait.kind === 'message') ||
        (message.status === 'completed' && wait.kind === 'none');
      break;
    case 'accepted':
    case 'next-offer':
      phaseValid = message.status === 'completed' && wait.kind === 'none';
      break;
    default:
      phaseValid = message.status === 'completed' && wait.kind === 'counter';
  }
  requireValue(phaseValid, 'message or wait is inconsistent with step');
  return structuredClone(state) as State;
};

export const restore = (
  value: unknown
):
  | { readonly ok: true; readonly state: State }
  | { readonly error: string; readonly ok: false } => {
  try {
    const saved = record(value, 'snapshot');
    fields(
      saved,
      ['formatVersion', 'scriptId', 'scriptRevision', 'state'],
      'snapshot'
    );
    requireValue(
      saved.formatVersion === 1,
      'unsupported prototype formatVersion'
    );
    requireValue(
      saved.scriptId === 'damocles-first-offer',
      'incompatible prototype scriptId'
    );
    requireValue(
      saved.scriptRevision === 1,
      'incompatible prototype scriptRevision'
    );
    return { ok: true, state: validateState(saved.state) };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'invalid prototype snapshot',
      ok: false
    };
  }
};
