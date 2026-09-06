import type { SoundDocument } from '../payload/documents.ts';
import { SidSynth } from './synth.ts';

export interface SidWrite {
  readonly cycle: number;
  readonly register: number;
  readonly value: number;
}

/// Offline rendering of the same register history supplied to the live core.
export const renderSidSequence = (
  document: SoundDocument,
  writes: readonly SidWrite[],
  frames: number,
  sampleRate = 48_000
): Float32Array => {
  if (!Number.isInteger(frames) || frames < 0 || frames > sampleRate * 30) {
    throw new Error('SID comparison duration must be bounded to 30 seconds');
  }
  const synth = new SidSynth(document, sampleRate);
  const output = new Float32Array(frames);
  let position = 0;
  let lastCycle = -1;
  for (const write of writes) {
    if (
      !Number.isSafeInteger(write.cycle) ||
      write.cycle < 0 ||
      write.cycle < lastCycle
    ) {
      throw new Error('SID writes must have ordered non-negative cycles');
    }
    lastCycle = write.cycle;
    const target = Math.min(
      frames,
      Math.round((write.cycle * sampleRate) / document.sid.clockHz)
    );
    if (target > position) {
      output.set(synth.render(target - position), position);
    }
    position = target;
    synth.write(write.register, write.value);
  }
  output.set(synth.render(frames - position), position);
  return output;
};
