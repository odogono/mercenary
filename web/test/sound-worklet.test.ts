import { expect, test } from 'bun:test';

import type { SoundCommand } from '../src/sound/presenter.ts';
import { SidSynth } from '../src/sound/synth.ts';
import { loadPayload } from './replay/artifacts.ts';
import { offlineProcessor, rms } from './sound-processor.ts';

const { sound } = await loadPayload();

const sidProcessor = () =>
  offlineProcessor<SoundCommand>('../src/sound/worklet.ts', sound);

test('the worklet schedules within a block and reset discards old queued commands', async () => {
  const processor = await sidProcessor();
  expect(processor.name).toBe('mercenary-sid');
  processor.post({
    at: 64 / 48_000,
    commands: [{ kind: 'play', selector: 8, voice: 1 }]
  });
  const block = processor.renderSamples(128);
  expect(block.subarray(0, 64)).toEqual(new Float32Array(64));
  const expected = new SidSynth(sound, 48_000);
  expected.render(64);
  expected.play(8, 1);
  expect(Array.from(block.subarray(64))).toEqual(
    Array.from(expected.render(64))
  );

  // A new timebase clears queued old commands without changing voice phase.
  processor.post({
    at: processor.time() + 0.001,
    commands: [{ kind: 'write', register: 4, value: 0 }]
  });
  processor.post({ at: 0, commands: [], replacePending: true });
  expect(Array.from(processor.renderSamples(128))).toEqual(
    Array.from(expected.render(128))
  );

  processor.post({
    at: processor.time() + 0.001,
    commands: [{ kind: 'play', selector: 8, voice: 1 }]
  });
  processor.post({
    at: 0,
    commands: [{ kind: 'reset', registers: sound.initialRegisters }]
  });
  expect(processor.renderSamples(128)).toEqual(new Float32Array(128));
});

test('a reset sent while the context is suspended survives the resume', async () => {
  const processor = await sidProcessor();
  // The Lift Journey's continuous program on voice 2 sounds until something stops it.
  processor.post({
    at: processor.time(),
    commands: [
      {
        kind: 'play',
        selector: sound.liftJourney.programSelector,
        voice: 2
      }
    ]
  });
  expect(rms(processor.render(0.2))).toBeGreaterThan(1e-3);
  // Ownership lost: the presenter resets, the context suspends, and a later resume replaces
  // whatever the old timebase left queued. No block is rendered in between.
  processor.post({
    at: processor.time() + 0.05,
    commands: [{ kind: 'reset', registers: sound.initialRegisters }]
  });
  processor.post({ at: 0, commands: [], replacePending: true });
  processor.render(0.05);
  expect(rms(processor.render(0.5))).toBeLessThan(1e-4);
});
