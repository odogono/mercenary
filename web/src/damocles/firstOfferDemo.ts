import {
  initialState,
  restore,
  snapshot,
  transition,
  type Action,
  type Effect,
  type Key
} from './firstOffer.ts';

const element = <T extends HTMLElement>(id: string) => {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing demo element: ${id}`);
  }
  return found as T;
};
const response = element<HTMLSelectElement>('response');
const ticks = element<HTMLInputElement>('ticks');
const saved = element<HTMLTextAreaElement>('snapshot');
const error = element('error');
const notice = element('notice');
let state = initialState();
let effects: readonly Effect[] = [];

const render = () => {
  element('step').textContent = state.step;
  element('reward').textContent = state.locals.proposedReward
    ? '[0x0010, 0, 0] — proposed only'
    : 'Not established';
  element('message').textContent = state.message.status;
  element('wait').textContent =
    state.wait.kind === 'counter' ? 'counter — threshold 500' : state.wait.kind;
  element('key').textContent = state.host.key;
  element('counter').textContent = String(state.host.counter);
  element('prompt').hidden = state.message.status === 'absent';
  element('effects').textContent = effects.length
    ? effects.map(effect => JSON.stringify(effect)).join('\n')
    : 'No effects since reset or restore.';
};
// Commit the whole supplied sequence only after validation succeeds.
const apply = (actions: readonly Action[]) => {
  let next = state;
  const emitted: Effect[] = [];
  for (const action of actions) {
    const result = transition(next, action);
    next = result.state;
    emitted.push(...result.effects);
  }
  state = next;
  effects = [...effects, ...emitted];
};
const keyAction = (): Action => ({
  key: response.value as Key,
  type: 'set-key'
});
const tickAction = (): Action => {
  if (ticks.value.trim() === '') {
    throw new Error('Enter a nonnegative whole number of ticks.');
  }
  return { ticks: Number(ticks.value), type: 'advance-ticks' };
};
const bind = (id: string, action: () => void) => {
  element(id).addEventListener('click', () => {
    error.textContent = '';
    notice.textContent = '';
    try {
      action();
      render();
    } catch (error_) {
      error.textContent =
        error_ instanceof Error ? error_.message : 'Action failed.';
    }
  });
};
bind('execute', () => apply([{ type: 'execute-step' }]));
bind('complete', () =>
  apply([{ id: 'first-offer', type: 'complete-message' }])
);
bind('set-key', () => apply([keyAction()]));
bind('advance', () => apply([tickAction()]));
bind('combined', () =>
  apply([keyAction(), tickAction(), { type: 'execute-step' }])
);
bind('reset', () => {
  state = initialState();
  effects = [];
  response.value = 'none';
  ticks.value = '0';
  notice.textContent = 'Demo reset. Snapshot text retained.';
});
bind('save', () => {
  saved.value = JSON.stringify(snapshot(state), null, 2);
  notice.textContent = 'Snapshot saved to the text area.';
});
bind('restore', () => {
  try {
    const result = restore(JSON.parse(saved.value));
    if (!result.ok) {
      throw new Error(result.error);
    }
    state = result.state;
    effects = [];
    notice.textContent = 'Snapshot restored. No effects replayed.';
  } catch (error_) {
    throw new Error(
      `Restore failed: ${error_ instanceof Error ? error_.message : 'invalid JSON'}. Current state retained.`
    );
  }
});
render();
