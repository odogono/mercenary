import { expect, test } from 'bun:test';

import {
  initialState,
  restore,
  snapshot,
  transition,
  type Action,
  type Key,
  type State
} from '../src/damocles/firstOffer.ts';

const execute: Action = { type: 'execute-step' };
const complete: Action = { id: 'first-offer', type: 'complete-message' };
const steps = (state: State, count: number): State => {
  for (let i = 0; i < count; i++) {
    state = transition(state, execute).state;
  }
  return state;
};
const pending = () => steps(initialState(), 3);
const polling = () =>
  transition(transition(pending(), complete).state, execute).state;
const keys: readonly Key[] = ['none', 'other', 'y', 'o', 'n'];
const trace = (state: State, actions: readonly Action[]) =>
  actions.map(action => {
    const result = transition(state, action);
    state = result.state;
    return result;
  });

test('manual start establishes reward, clears input and requests one suspended prompt', () => {
  const start = initialState();
  expect(start).toEqual({
    host: { counter: 0, key: 'none' },
    locals: { proposedReward: null },
    message: { status: 'absent' },
    step: 'set-reward',
    wait: { kind: 'none' }
  });
  const keyed = transition(start, { key: 'y', type: 'set-key' }).state;
  const reward = transition(keyed, execute);
  expect(reward.state.locals.proposedReward).toEqual([16, 0, 0]);
  expect(reward.effects).toEqual([]);
  const cleared = transition(reward.state, execute).state;
  expect(cleared.host.key).toBe('none');
  const prompt = transition(cleared, execute);
  expect(prompt.effects).toEqual([
    { id: 'first-offer', type: 'request-message' }
  ]);
  expect(prompt.state.step).toBe('reset-counter');
  expect(prompt.state.wait).toEqual({ id: 'first-offer', kind: 'message' });
});

test('message completion is explicit and reset preserves latched input', () => {
  let state = transition(pending(), {
    ticks: 499,
    type: 'advance-ticks'
  }).state;
  state = transition(state, { key: 'y', type: 'set-key' }).state;
  expect(transition(state, execute)).toEqual({ effects: [], state });
  state = transition(state, complete).state;
  expect(state.host).toEqual({ counter: 499, key: 'y' });
  expect(state.wait).toEqual({ kind: 'none' });
  expect(transition(state, complete)).toEqual({ effects: [], state });
  state = transition(state, execute).state;
  expect(state.host).toEqual({ counter: 0, key: 'y' });
  expect(state.step).toBe('check-y');
  expect(state.wait).toEqual({ kind: 'counter', threshold: 500 });
  expect(transition(initialState(), complete).state).toEqual(initialState());
});

for (const ticks of [499, 500]) {
  for (const key of keys) {
    test(`${key} at ${ticks}: ordered predicates precede timeout`, () => {
      let state = transition(polling(), { ticks, type: 'advance-ticks' }).state;
      state = transition(state, { key, type: 'set-key' }).state;
      const results = trace(state, Array<Action>(4).fill(execute));
      const branch =
        key === 'y' || key === 'o'
          ? 'accepted'
          : key === 'n' || ticks === 500
            ? 'next-offer'
            : 'check-y';
      expect(results.at(-1)!.state.step).toBe(branch);
      expect(results.at(-1)!.state.host).toEqual({ counter: ticks, key });
      expect(results.flatMap(result => result.effects)).toEqual([
        ...(key === 'y' || key === 'o' || key === 'n'
          ? [{ key, type: 'request-acknowledgement' as const }]
          : []),
        ...(branch !== 'check-y' ? [{ branch, type: 'handoff' } as const] : [])
      ]);
    });
  }
}

for (const key of keys) {
  test(`timeout checkpoint ignores ${key}`, () => {
    let state = transition(steps(polling(), 3), { key, type: 'set-key' }).state;
    state = transition(state, { ticks: 500, type: 'advance-ticks' }).state;
    expect(transition(state, execute).effects).toEqual([
      { branch: 'next-offer', type: 'handoff' }
    ]);
  });
}

for (const ticks of [499, 500]) {
  test(`late Y at ${ticks} waits for its next predicate`, () => {
    let state = transition(steps(polling(), 1), {
      key: 'y',
      type: 'set-key'
    }).state;
    state = transition(state, { ticks, type: 'advance-ticks' }).state;
    state = steps(state, 3);
    expect(state.step).toBe(ticks === 499 ? 'check-y' : 'next-offer');
    expect(transition(state, execute).effects).toEqual(
      ticks === 499
        ? [
            { key: 'y', type: 'request-acknowledgement' },
            { branch: 'accepted', type: 'handoff' }
          ]
        : []
    );
  });
}

test('ticks wrap without scheduling execution', () => {
  const state = steps(polling(), 3);
  expect(transition(state, { ticks: 0, type: 'advance-ticks' }).state).toEqual(
    state
  );
  const high = transition(state, {
    ticks: 65_535,
    type: 'advance-ticks'
  }).state;
  const wrapped = transition(high, { ticks: 1, type: 'advance-ticks' });
  expect(wrapped.state.host.counter).toBe(0);
  expect(wrapped.effects).toEqual([]);
  expect(transition(wrapped.state, execute).state.step).toBe('check-y');
  expect(transition(high, execute).state.step).toBe('next-offer');
  const large = transition(high, {
    ticks: Number.MAX_SAFE_INTEGER,
    type: 'advance-ticks'
  });
  expect(large.state.host.counter).toBe(65_534);
  expect(large.state.step).toBe('check-timeout');
});

test('terminal states freeze all valid actions', () => {
  for (const key of ['y', 'n'] as const) {
    const state = steps(
      transition(polling(), { key, type: 'set-key' }).state,
      3
    );
    for (const action of [
      execute,
      complete,
      { key: 'other', type: 'set-key' },
      { ticks: 10, type: 'advance-ticks' }
    ] as const) {
      expect(transition(state, action)).toEqual({ effects: [], state });
    }
  }
});

test('invalid actions are rejected even at terminal checkpoints', () => {
  const terminal = steps(
    transition(polling(), { key: 'y', type: 'set-key' }).state,
    1
  );
  const invalid = [
    null,
    {},
    { type: 'unknown' },
    { key: 'Y', type: 'set-key' },
    { id: 'other', type: 'complete-message' },
    { extra: true, type: 'execute-step' },
    ...[-1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'].map(
      ticks => ({ ticks, type: 'advance-ticks' })
    )
  ];
  for (const state of [initialState(), terminal]) {
    for (const action of invalid) {
      const before = structuredClone(state);
      expect(() => transition(state, action as Action)).toThrow(/action/i);
      expect(state).toEqual(before);
    }
  }
});

test('every checkpoint restores identical future states and effects', () => {
  for (const key of keys) {
    const actions: Action[] = [
      execute,
      execute,
      execute,
      { key, type: 'set-key' },
      { ticks: 499, type: 'advance-ticks' },
      execute,
      complete,
      execute,
      { ticks: 499, type: 'advance-ticks' },
      execute,
      execute,
      execute,
      execute,
      { ticks: 1, type: 'advance-ticks' },
      execute,
      execute,
      execute,
      execute,
      complete,
      execute
    ];
    let state = initialState();
    for (let i = 0; i <= actions.length; i++) {
      const serialized = JSON.stringify(snapshot(state));
      const result = restore(JSON.parse(serialized));
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error);
      }
      expect(result.state).toEqual(state);
      expect(trace(result.state, actions.slice(i))).toEqual(
        trace(state, actions.slice(i))
      );
      if (i < actions.length) {
        state = transition(state, actions[i]!).state;
      }
    }
  }
});

test('invalid snapshot identities, shapes and inconsistent phases fail clearly', () => {
  const good = snapshot(polling());
  const bad: unknown[] = [
    null,
    [],
    {},
    ...['formatVersion', 'scriptId', 'scriptRevision'].map(field => ({
      ...good,
      [field]: 'wrong'
    })),
    { ...good, extra: true }
  ];
  const changes = [
    { step: 'unknown' },
    { locals: { proposedReward: null } },
    { locals: { proposedReward: [16, 0, 1] } },
    { message: { id: 'first-offer', status: 'pending' } },
    { wait: { kind: 'none' } },
    { wait: { kind: 'counter', threshold: 499 } },
    { host: { counter: 0, key: 'Y' } },
    ...[-1, 65_536, 0.1, Number.NaN, Infinity].map(counter => ({
      host: { counter, key: 'none' }
    }))
  ];
  bad.push(
    ...changes.map(change => ({ ...good, state: { ...good.state, ...change } }))
  );
  for (const field of ['locals', 'host', 'message', 'wait'] as const) {
    bad.push({
      ...good,
      state: { ...good.state, [field]: { ...good.state[field], extra: 1 } }
    });
  }
  for (const value of bad) {
    const result = restore(value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  }
  expect(snapshot(polling())).toEqual(good);
});

test('transitions preserve previous values and snapshots are detached', () => {
  const state = pending();
  const before = structuredClone(state);
  Object.freeze(state.host);
  Object.freeze(state.locals.proposedReward);
  Object.freeze(state.locals);
  Object.freeze(state.message);
  Object.freeze(state.wait);
  Object.freeze(state);
  trace(state, [complete, execute, { key: 'y', type: 'set-key' }, execute]);
  expect(state).toEqual(before);
  const saved = snapshot(state);
  expect(saved.state).not.toBe(state);
  expect(saved.state.host).not.toBe(state.host);
  expect(saved.state.locals.proposedReward).not.toBe(
    state.locals.proposedReward
  );
  const result = restore(saved);
  if (!result.ok) {
    throw new Error(result.error);
  }
  expect(result.state).not.toBe(saved.state);
  expect(result.state.message).not.toBe(saved.state.message);
  expect(result.state.wait).not.toBe(saved.state.wait);
  expect(result.state.locals.proposedReward).not.toBe(
    saved.state.locals.proposedReward
  );
});

test('restore rejects inconsistent phase combinations at every kind of checkpoint', () => {
  const checkpoints = [
    initialState(),
    steps(initialState(), 1),
    steps(initialState(), 2),
    pending(),
    transition(pending(), complete).state,
    polling(),
    steps(transition(polling(), { key: 'y', type: 'set-key' }).state, 1),
    steps(transition(polling(), { key: 'n', type: 'set-key' }).state, 3)
  ];
  for (const state of checkpoints) {
    const saved = snapshot(state);
    const invalidWait =
      state.wait.kind === 'none'
        ? { kind: 'counter', threshold: 500 }
        : { kind: 'none' };
    expect(
      restore({ ...saved, state: { ...state, wait: invalidWait } }).ok
    ).toBe(false);
    const invalidReward =
      state.locals.proposedReward === null ? [16, 0, 0] : null;
    expect(
      restore({
        ...saved,
        state: { ...state, locals: { proposedReward: invalidReward } }
      }).ok
    ).toBe(false);
  }
});
