import { describe, expect, test } from 'bun:test';

import { AudioWorkletTransport } from '../src/sound/transport.ts';
import { loadPayload } from './replay/artifacts.ts';

const { sound } = await loadPayload();

const fixture = (fail = false) => {
  const calls: string[] = [];
  const messages: unknown[] = [];
  const gains: number[] = [];
  let processorError: (() => void) | undefined;
  class Context {
    currentTime = 10;
    destination = {};
    audioWorklet = {
      addModule: async () => {
        calls.push('module');
        if (fail) {
          throw new Error('module failure');
        }
      }
    };
    async resume() {
      calls.push('resume');
    }
    async suspend() {
      calls.push('suspend');
    }
    async close() {
      calls.push('close');
    }
    createGain() {
      return {
        connect: () => {},
        disconnect: () => {},
        gain: {
          setValueAtTime: (value: number) => gains.push(value),
          value: 1
        }
      };
    }
  }
  class Node {
    port = { postMessage: (message: unknown) => messages.push(message) };
    connect(gain: GainNode) {
      return gain;
    }
    disconnect() {
      calls.push('disconnect');
    }
    set onprocessorerror(callback: () => void) {
      processorError = callback;
    }
  }
  const failures: string[] = [];
  const transport = new AudioWorkletTransport(sound, {
    context: Context as unknown as typeof AudioContext,
    node: Node as unknown as typeof AudioWorkletNode,
    onFailure: reason => failures.push(reason)
  });
  return {
    calls,
    failures,
    gains,
    messages,
    processorError: () => processorError?.(),
    transport
  };
};

describe('the browser audio transport', () => {
  test('resume rebases elapsed gameplay time against frozen audio time', async () => {
    const f = fixture();
    await f.transport.unlock();
    const commands = [{ kind: 'play', selector: 8, voice: 1 }] as const;
    f.transport.send({ at: 5, commands });
    f.transport.suspend();
    f.transport.resume();
    f.transport.send({ at: 60, commands });
    expect(f.messages).toMatchObject([
      { at: 10 },
      { at: 10, commands: [], replacePending: true },
      { at: 10 }
    ]);
  });
  test('unlocks in gesture order and remembers suspension while loading', async () => {
    const f = fixture();
    expect(f.calls).toEqual([]);
    f.transport.suspend();
    await f.transport.unlock();
    expect(f.calls).toEqual(['resume', 'module', 'suspend']);
    f.transport.resume();
    expect(f.calls.at(-1)).toBe('resume');
  });

  test('gain preferences do not establish the session clock; reset rebases it', async () => {
    const f = fixture();
    await f.transport.unlock();
    f.transport.send({ at: 0, commands: [{ kind: 'volume', value: 50 }] });
    f.transport.send({
      at: 100,
      commands: [{ kind: 'play', selector: 8, voice: 1 }]
    });
    f.transport.send({
      at: 101,
      commands: [{ kind: 'play', selector: 8, voice: 1 }]
    });
    f.transport.send({
      at: 0,
      commands: [{ kind: 'reset', registers: sound.initialRegisters }]
    });
    f.transport.send({
      at: 1,
      commands: [{ kind: 'play', selector: 8, voice: 1 }]
    });
    expect(f.messages).toMatchObject([
      { at: 10 },
      { at: 11 },
      { at: 10 },
      { at: 11 }
    ]);
    f.transport.send({ at: 0, commands: [{ kind: 'mute', value: true }] });
    expect(f.gains).toEqual([0.5, 0]);
  });

  test('module and processor failures each report once and close the graph', async () => {
    const badModule = fixture(true);
    await badModule.transport.unlock();
    await badModule.transport.unlock();
    expect(badModule.failures).toHaveLength(1);
    expect(badModule.calls).toContain('close');
    const badProcessor = fixture();
    await badProcessor.transport.unlock();
    badProcessor.processorError();
    badProcessor.processorError();
    expect(badProcessor.failures).toHaveLength(1);
    badProcessor.transport.send({
      at: 0,
      commands: [{ kind: 'play', selector: 8, voice: 1 }]
    });
    expect(badProcessor.messages).toEqual([]);
  });

  test('disposal during module loading never creates an output graph', async () => {
    const f = fixture();
    const unlocked = f.transport.unlock();
    f.transport.dispose();
    await unlocked;
    f.transport.send({
      at: 0,
      commands: [{ kind: 'play', selector: 8, voice: 1 }]
    });
    expect(f.messages).toEqual([]);
    expect(f.failures).toEqual([]);
    expect(f.calls).toContain('close');
  });
});
