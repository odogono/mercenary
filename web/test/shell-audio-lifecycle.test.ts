import { describe, expect, test } from 'bun:test';

import { installAudioLifecycle } from '../src/shell/audioLifecycle.ts';

/// A target whose events can claim to be trusted, which a dispatched `Event` never can.
class Target {
  hidden = false;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  fire(type: string, isTrusted = true): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ isTrusted } as Event);
    }
  }
}

const fixture = () => {
  const calls: string[] = [];
  const window = new Target();
  const document = new Target();
  let owned = true;
  const audio = installAudioLifecycle({
    document,
    ownership: { mayAdvance: () => owned },
    presenter: {
      dispose: () => calls.push('dispose'),
      resume: () => calls.push('resume'),
      suspend: () => calls.push('suspend'),
      unlock: async () => {
        calls.push('unlock');
      }
    },
    window
  });
  return {
    audio,
    calls,
    document,
    lose: () => {
      owned = false;
    },
    window
  };
};

describe('the shared audio lifecycle', () => {
  test('unlocks once, on the first trusted gesture only', async () => {
    const { calls, window } = fixture();
    window.fire('keydown', false);
    expect(calls).toEqual([]);
    window.fire('pointerdown');
    window.fire('keydown');
    await Promise.resolve();
    expect(calls).toEqual(['unlock']);
  });

  test('an unlock under a chrome layer suspends at once', async () => {
    const { audio, calls, window } = fixture();
    audio.layerChanged('menu');
    window.fire('keydown');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls).toEqual(['suspend', 'unlock', 'suspend']);
  });

  test('suspends on blur, hiding and chrome; resumes only when play may go on', () => {
    const { audio, calls, document, lose, window } = fixture();
    window.fire('blur');
    window.fire('focus');
    expect(calls).toEqual(['suspend', 'resume']);

    document.hidden = true;
    document.fire('visibilitychange');
    window.fire('focus');
    document.hidden = false;
    audio.layerChanged('settings');
    document.fire('visibilitychange');
    window.fire('focus');
    expect(calls.slice(2)).toEqual(['suspend', 'suspend']);

    audio.layerChanged('none');
    lose();
    window.fire('focus');
    document.fire('visibilitychange');
    window.fire('pagehide');
    expect(calls.slice(4)).toEqual(['resume', 'dispose']);
  });
});
