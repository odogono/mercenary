import { describe, expect, test } from 'bun:test';

import { BLANK_DAMOCLES_ROW } from '../src/damocles/display.ts';
import {
  fireTrigger,
  initialScriptState,
  presentSystemMessage,
  runFrame,
  type ScriptRules,
  type ScriptState
} from '../src/damocles/script.ts';
import {
  CLEARING_LINE_FRAMES,
  ORDINARY_DISPLAY_FRAMES
} from '../src/damocles/scripts.ts';

const rules: ScriptRules = {
  messageFrames: 200,
  messageText: id =>
    id === 'system-string-50' ? ' '.repeat(48) : id.padEnd(48).slice(0, 48),
  waitFrames: 200
};

const run = (
  initial: ScriptState,
  frames: number,
  watch: (frame: number, state: ScriptState) => void = () => {}
): ScriptState => {
  let state = initial;
  for (let frame = 1; frame <= frames; frame += 1) {
    state = runFrame(state, rules).state;
    watch(frame, state);
  }
  return state;
};

/// Every id the response presented, in order, with the frame it started on.
const transcript = (
  initial: ScriptState,
  frames: number
): readonly { readonly frame: number; readonly id: string }[] => {
  const seen: { frame: number; id: string }[] = [];
  let previous = initial.message?.id ?? null;
  if (previous !== null) {
    seen.push({ frame: 0, id: previous });
  }
  run(initial, frames, (frame, state) => {
    const id = state.message?.id ?? null;
    if (id !== null && id !== previous) {
      seen.push({ frame, id });
    }
    previous = id;
  });
  return seen;
};

describe('Damocles Script slot 2', () => {
  test('runs from the one-shot trigger through the recovered 1000-frame response', () => {
    const fired = fireTrigger(initialScriptState(), 2, rules);
    expect(fired.state).toMatchObject({
      busy: true,
      execution: {
        returnStack: [],
        script: 'damocles.script.slot-2',
        step: 1
      },
      message: { id: 'script2-inline-1', remainingFrames: 200 }
    });
    expect(
      fired.state.triggers.find(trigger => trigger.index === 2)?.armed
    ).toBe(false);

    const state = run(fired.state, 1000, (frame, state) => {
      if (frame === 200) {
        expect(state.message?.id).toBe('script2-inline-2');
      }
      if (frame === 400) {
        expect(state.message?.id).toBe('script2-inline-3');
      }
      if (frame === 600) {
        expect(state).toMatchObject({ counter: 0, message: null });
      }
      if (frame === 800) {
        expect(state.message?.id).toBe('system-string-50');
      }
    });
    expect(state).toMatchObject({
      busy: false,
      execution: null,
      message: null
    });
    expect(state.display).toEqual({ cells: ' '.repeat(48), kind: 'held' });
  });

  test('its clearing line is the 200-frame exception, not the shared epilogue', () => {
    // Trigger 2's epilogue is inline at $0704BE and does not move the display duration.
    const fired = fireTrigger(initialScriptState(), 2, rules).state;
    const clearing = run(fired, 800);
    expect(clearing.message).toEqual({
      id: 'system-string-50',
      remainingFrames: ORDINARY_DISPLAY_FRAMES
    });
    expect(clearing.displayDuration).toBe(ORDINARY_DISPLAY_FRAMES);
  });

  test('does not re-arm or restart trigger 2', () => {
    const fired = fireTrigger(initialScriptState(), 2, rules).state;
    expect(fireTrigger(fired, 2, rules).state).toEqual(fired);
  });
});

describe('the five further pickup responses', () => {
  test('trigger 5 runs three messages, a 500-frame wait and the shared epilogue', () => {
    const fired = fireTrigger(initialScriptState(), 5, rules).state;
    expect(transcript(fired, 1200)).toEqual([
      { frame: 0, id: 'script5-inline-1' },
      { frame: 200, id: 'script5-inline-2' },
      { frame: 400, id: 'script5-inline-3' },
      { frame: 1100, id: 'system-string-50' }
    ]);
    // 600 + 500 + 50 = 1150 frames, 23.00 s at the recovered 50 Hz.
    expect(run(fired, 1149).busy).toBe(true);
    expect(run(fired, 1150)).toMatchObject({ busy: false, execution: null });
  });

  test('trigger 6 parks with its last row held and no clearing line', () => {
    const fired = fireTrigger(initialScriptState(), 6, rules).state;
    expect(transcript(fired, 600)).toEqual([
      { frame: 0, id: 'script6-inline-1' },
      { frame: 200, id: 'script6-inline-2' }
    ]);
    const parked = run(fired, 400);
    expect(parked).toMatchObject({ busy: false, execution: null });
    // The row the second message wrote outlives the script that wrote it.
    expect(parked.display).toEqual({
      cells: 'script6-inline-2'.padEnd(48),
      kind: 'held'
    });
  });

  test('trigger 11 runs two messages and the shared epilogue', () => {
    const fired = fireTrigger(initialScriptState(), 11, rules).state;
    expect(transcript(fired, 600)).toEqual([
      { frame: 0, id: 'script11-inline-1' },
      { frame: 200, id: 'script11-inline-2' },
      { frame: 400, id: 'system-string-50' }
    ]);
    expect(run(fired, 450)).toMatchObject({ busy: false, execution: null });
  });

  test('trigger 20 runs one message and the shared epilogue', () => {
    const fired = fireTrigger(initialScriptState(), 20, rules).state;
    expect(transcript(fired, 400)).toEqual([
      { frame: 0, id: 'script20-inline-1' },
      { frame: 200, id: 'system-string-50' }
    ]);
    expect(run(fired, 250)).toMatchObject({ busy: false, execution: null });
  });

  test('trigger 62 waits 150 frames before its first message', () => {
    const fired = fireTrigger(initialScriptState(), 62, rules).state;
    expect(fired.message).toBeNull();
    expect(transcript(fired, 1000)).toEqual([
      { frame: 150, id: 'script62-inline-1' },
      { frame: 350, id: 'script62-inline-2' },
      { frame: 550, id: 'script62-inline-3' },
      { frame: 750, id: 'system-string-50' }
    ]);
    expect(run(fired, 800)).toMatchObject({ busy: false, execution: null });
  });

  test('the shared epilogue drops the display duration to 50 and restores it', () => {
    const fired = fireTrigger(initialScriptState(), 20, rules).state;
    expect(fired.displayDuration).toBe(ORDINARY_DISPLAY_FRAMES);
    const clearing = run(fired, 200);
    expect(clearing.message).toEqual({
      id: 'system-string-50',
      remainingFrames: CLEARING_LINE_FRAMES
    });
    expect(clearing.displayDuration).toBe(CLEARING_LINE_FRAMES);
    // Restored once the clearing line has run its 50 frames.
    expect(run(fired, 250).displayDuration).toBe(ORDINARY_DISPLAY_FRAMES);
  });

  test('the same record presents for 50 frames here and 200 in trigger 2', () => {
    const shared = run(fireTrigger(initialScriptState(), 20, rules).state, 200);
    const inline = run(fireTrigger(initialScriptState(), 2, rules).state, 800);
    expect(shared.message?.id).toBe('system-string-50');
    expect(inline.message?.id).toBe('system-string-50');
    expect([
      shared.message?.remainingFrames,
      inline.message?.remainingFrames
    ]).toEqual([CLEARING_LINE_FRAMES, ORDINARY_DISPLAY_FRAMES]);
  });
});

/// Trigger 6's response, 400 frames long, as something for a second pickup to contend with.
const running = () => fireTrigger(initialScriptState(), 6, rules).state;

describe('the message tone', () => {
  test('each message asks for its tone once, with its text, on the frame it begins', () => {
    const fired = fireTrigger(initialScriptState(), 2, rules);
    expect(fired.effects).toEqual([
      { text: rules.messageText('script2-inline-1'), type: 'message' }
    ]);
    const asked: { frame: number; text: string }[] = [];
    let state = fired.state;
    for (let frame = 1; frame <= 1000; frame += 1) {
      const transition = runFrame(state, rules);
      state = transition.state;
      for (const effect of transition.effects) {
        if (effect.type === 'message') {
          asked.push({ frame, text: effect.text });
        }
      }
    }
    expect(asked).toEqual([
      { frame: 200, text: rules.messageText('script2-inline-2') },
      { frame: 400, text: rules.messageText('script2-inline-3') },
      { frame: 800, text: rules.messageText('system-string-50') }
    ]);
  });

  test('a system message asks for it too', () => {
    const shown = presentSystemMessage(
      initialScriptState(),
      'system-string-1',
      rules
    );
    expect(shown.effects).toEqual([
      { text: rules.messageText('system-string-1'), type: 'message' }
    ]);
    expect(runFrame(shown.state, rules).effects).toEqual([]);
  });
});

describe('busy arbitration', () => {
  test('a queueable trigger is queued and stays armed', () => {
    const queued = fireTrigger(running(), 5, rules).state;
    expect(queued.pending).toBe(5);
    // The queue path does not disarm: trigger 5's byte stays $A0.
    expect(queued.triggers.find(item => item.index === 5)).toMatchObject({
      armed: true,
      queueable: true
    });
  });

  test('a trigger without the queue bit is discarded and stays armed', () => {
    const busy = fireTrigger(running(), 5, rules).state;
    const discarded = fireTrigger(busy, 20, rules).state;
    expect(discarded.pending).toBe(5);
    expect(discarded.triggers.find(item => item.index === 20)?.armed).toBe(
      true
    );
    expect(fireTrigger(discarded, 62, rules).state.pending).toBe(5);
  });

  test('the queue path writes unconditionally, so a queued index is replaced', () => {
    // $7A88 is one word. Among the six pickup triggers only 5 is queueable, so two pickups can
    // never contend through the table alone -- the research made replacement visible with a
    // queueable index outside the table, which this port does not model. The unconditional
    // write is still the rule, so a pending index already held is overwritten.
    const busy: ScriptState = { ...running(), pending: 62 };
    expect(fireTrigger(busy, 5, rules).state.pending).toBe(5);
  });

  test('re-queueing the same trigger leaves it pending', () => {
    // Only trigger 5 is queueable among the six, so re-queueing it is the reachable case:
    // $7A88 is one word and the queue path writes it unconditionally.
    const busy = fireTrigger(running(), 5, rules).state;
    expect(fireTrigger(busy, 5, rules).state.pending).toBe(5);
  });

  test('an already-fired trigger is refused before the busy test', () => {
    const busy = fireTrigger(running(), 5, rules).state;
    // Trigger 6 launched this response, so its byte is $00.
    expect(fireTrigger(busy, 6, rules).state).toEqual(busy);
  });

  test('nothing re-arms a trigger', () => {
    let state = initialScriptState();
    for (const index of [2, 5, 6, 11, 20, 62]) {
      state = run(fireTrigger(state, index, rules).state, 1200);
    }
    expect(state.triggers.filter(trigger => trigger.armed)).toEqual([]);
    // A second pass changes nothing at all.
    expect(run(state, 100)).toMatchObject({ busy: false, execution: null });
    for (const index of [2, 5, 6, 11, 20, 62]) {
      expect(fireTrigger(state, index, rules).state).toEqual(state);
    }
  });
});

describe('a queued response nests inside the script it interrupted', () => {
  test('reproduces the run-pending trace', () => {
    // $070618 -> $07064A (pending $0005) -> script 5 in full -> $07064E -> $0703FC.
    const fired = fireTrigger(initialScriptState(), 6, rules).state;
    const queued = fireTrigger(run(fired, 100), 5, rules).state;
    expect(queued.pending).toBe(5);

    // Trigger 6's 400 frames end; the busy flag clears and the dispatch takes the pending
    // response up before trigger 6's own return has run.
    const nested = run(queued, 300);
    expect(nested.pending).toBeNull();
    expect(nested.execution).toMatchObject({
      returnStack: [{ script: 'damocles.script.slot-6' }],
      script: 'damocles.script.slot-5',
      step: 1
    });
    expect(nested.busy).toBe(true);
    expect(nested.message?.id).toBe('script5-inline-1');

    // Script 5 runs to completion and its return pops back into trigger 6, whose own return
    // then parks.
    expect(run(nested, 1149).busy).toBe(true);
    const parked = run(nested, 1150);
    expect(parked).toMatchObject({ busy: false, execution: null });
    expect(parked.display).toEqual({ cells: ' '.repeat(48), kind: 'held' });
  });

  test('a queued index whose trigger has since fired is consumed and refused', () => {
    // $054764 clears $7A88 before it tests the arming byte.
    const fired = fireTrigger(initialScriptState(), 6, rules).state;
    const queued: ScriptState = { ...fired, pending: 6 };
    // The word is consumed on the frame the busy flag clears, and the refused dispatch leaves
    // the interrupted script's own return to run on the next one.
    const refused = run(queued, 400);
    expect(refused.pending).toBeNull();
    expect(refused.execution).toMatchObject({
      script: 'damocles.script.slot-6'
    });
    expect(run(queued, 401)).toMatchObject({ busy: false, execution: null });
  });
});

describe('the recovered trigger table', () => {
  test('is six one-shot pickup triggers with one queueable byte', () => {
    const triggers = initialScriptState().triggers;
    expect(triggers.map(trigger => trigger.index)).toEqual([
      2, 5, 6, 11, 20, 62
    ]);
    expect(triggers.every(trigger => trigger.armed)).toBe(true);
    // Every pickup trigger has bit 6 clear; the table's one sticky byte is index $38.
    expect(triggers.every(trigger => !trigger.sticky)).toBe(true);
    expect(
      triggers.filter(trigger => trigger.queueable).map(item => item.index)
    ).toEqual([5]);
    expect(triggers.every(trigger => trigger.script !== null)).toBe(true);
  });

  test('opens on a blank held row with the ordinary display duration', () => {
    expect(initialScriptState()).toMatchObject({
      display: { cells: BLANK_DAMOCLES_ROW, kind: 'held' },
      displayDuration: ORDINARY_DISPLAY_FRAMES,
      pending: null
    });
  });
});
