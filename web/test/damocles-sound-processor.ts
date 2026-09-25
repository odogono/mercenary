import type { DamoclesSoundCommand } from '../src/damocles/sound.ts';
import {
  SAMPLE_RATE,
  offlineProcessor,
  type OfflineProcessor
} from './sound-processor.ts';

/// The Damocles AudioWorklet processor run offline, and the measures its tests take of it.

export { SAMPLE_RATE };

export const damoclesProcessor = (): Promise<
  OfflineProcessor<DamoclesSoundCommand>
> =>
  offlineProcessor<DamoclesSoundCommand>('../src/damocles/soundWorklet.ts', {
    vblHertz: 50
  });

/// Root-mean-square level of each 20 ms VBL of `samples`, from its start.
export const vblLevels = (samples: Float32Array): number[] => {
  const size = SAMPLE_RATE / 50;
  const levels: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let sum = 0;
    for (let index = start; index < start + size; index += 1) {
      sum += samples[index]! ** 2;
    }
    levels.push(Math.sqrt(sum / size));
  }
  return levels;
};

/// Rising zero crossings a second: the pitch of a tone with no noise under it.
export const crossingsPerSecond = (samples: Float32Array): number => {
  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index - 1]! < 0 && samples[index]! >= 0) {
      crossings += 1;
    }
  }
  return (crossings * SAMPLE_RATE) / samples.length;
};
