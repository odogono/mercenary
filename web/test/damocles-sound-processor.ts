import type { DamoclesSoundCommand } from '../src/damocles/sound.ts';
import type { SoundBatch } from '../src/sound/presenter.ts';

/// The Damocles AudioWorklet processor run offline: the worklet module is imported with the
/// AudioWorkletGlobalScope names it reads stood in for, and each render advances its clock.

export const SAMPLE_RATE = 48_000;
const BLOCK = 128;

type Batch = SoundBatch<DamoclesSoundCommand>;

interface Processor {
  port: { onmessage?: (event: { data: Batch }) => void };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

let Registered: (new (options: unknown) => Processor) | undefined;
let registeredName: string | undefined;

/// Stands in the AudioWorkletGlobalScope names the processor reads, and answers how to put
/// back what was there.
const installScope = (currentTime: number): (() => void) => {
  class AudioWorkletProcessor {
    port = {};
  }
  const scope = {
    AudioWorkletProcessor,
    currentTime,
    registerProcessor: (name: string, constructor: typeof Registered) => {
      registeredName = name;
      Registered = constructor;
    },
    sampleRate: SAMPLE_RATE
  };
  const previous = Object.keys(scope).map(
    key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  Object.assign(globalThis, scope);
  return () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
  };
};

const withScope = <T>(currentTime: number, run: () => T): T => {
  const restore = installScope(currentTime);
  try {
    return run();
  } finally {
    restore();
  }
};

export interface OfflineProcessor {
  readonly name: string;
  readonly post: (batch: Batch) => void;
  /// The next `seconds` of output, rounded up to whole render quanta.
  readonly render: (seconds: number) => Float32Array;
  readonly time: () => number;
}

export const damoclesProcessor = async (): Promise<OfflineProcessor> => {
  if (Registered === undefined) {
    // The module registers its processor as it evaluates, so the scope stands until it has.
    const restore = installScope(0);
    try {
      await import('../src/damocles/soundWorklet.ts');
    } finally {
      restore();
    }
  }
  const processor = withScope(
    0,
    () => new Registered!({ processorOptions: { document: { vblHertz: 50 } } })
  );
  let rendered = 0;
  return {
    name: registeredName!,
    post: batch => processor.port.onmessage!({ data: batch }),
    render: seconds => {
      const blocks = Math.ceil((seconds * SAMPLE_RATE) / BLOCK);
      const output = new Float32Array(blocks * BLOCK);
      for (let index = 0; index < blocks; index += 1) {
        const block = new Float32Array(BLOCK);
        withScope(rendered / SAMPLE_RATE, () =>
          processor.process([], [[block]])
        );
        output.set(block, index * BLOCK);
        rendered += BLOCK;
      }
      return output;
    },
    time: () => rendered / SAMPLE_RATE
  };
};

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
