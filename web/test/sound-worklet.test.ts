import { expect, test } from 'bun:test';

import type { SoundBatch } from '../src/sound/presenter.ts';
import { SidSynth } from '../src/sound/synth.ts';
import { loadPayload } from './replay/artifacts.ts';

test('the worklet schedules within a block and reset discards old queued commands', async () => {
  const { sound } = await loadPayload();
  class Processor {
    port: { onmessage?: (event: { data: SoundBatch }) => void } = {};
  }
  type Worklet = Processor & {
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  };
  let Registered: (new (options: unknown) => Worklet) | undefined;
  const globals = {
    AudioWorkletProcessor: Processor,
    currentTime: 0,
    registerProcessor: (_name: string, constructor: typeof Registered) => {
      Registered = constructor;
    },
    sampleRate: 48_000
  };
  const previous = Object.keys(globals).map(
    key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  try {
    Object.assign(globalThis, globals);
    await import('../src/sound/worklet.ts');
    const processor = new Registered!({
      processorOptions: { document: sound }
    });
    processor.port.onmessage!({
      data: {
        at: 64 / 48_000,
        commands: [{ kind: 'play', selector: 8, voice: 1 }]
      }
    });
    const block = new Float32Array(128);
    expect(processor.process([], [[block]])).toBeTrue();
    expect(block.subarray(0, 64)).toEqual(new Float32Array(64));
    const expected = new SidSynth(sound, 48_000);
    expected.render(64);
    expected.play(8, 1);
    expect(Array.from(block.subarray(64))).toEqual(
      Array.from(expected.render(64))
    );

    // A new timebase clears queued old commands without changing voice phase.
    processor.port.onmessage!({
      data: { at: 0.001, commands: [{ kind: 'write', register: 4, value: 0 }] }
    });
    processor.port.onmessage!({
      data: { at: 0, commands: [], replacePending: true }
    });
    processor.process([], [[block]]);
    expect(Array.from(block)).toEqual(Array.from(expected.render(128)));

    processor.port.onmessage!({
      data: { at: 0.001, commands: [{ kind: 'play', selector: 8, voice: 1 }] }
    });
    processor.port.onmessage!({
      data: {
        at: 0,
        commands: [{ kind: 'reset', registers: sound.initialRegisters }]
      }
    });
    processor.process([], [[block]]);
    expect(block).toEqual(new Float32Array(128));
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
  }
});
