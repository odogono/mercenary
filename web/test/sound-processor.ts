import type { SoundBatch } from '../src/sound/presenter.ts';

/// A title's AudioWorklet processor run offline (#513): the worklet module is imported with the
/// AudioWorkletGlobalScope names it reads stood in for, and each render advances its clock.

export const SAMPLE_RATE = 48_000;
const BLOCK = 128;

interface Processor<Command> {
  port: { onmessage?: (event: { data: SoundBatch<Command> }) => void };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

type ProcessorConstructor = new (options: unknown) => Processor<never>;

interface Registration {
  readonly constructor: ProcessorConstructor;
  readonly name: string;
}

/// Each worklet module registers its processor once, as it first evaluates.
const registrations = new Map<string, Registration>();

/// Stands in the AudioWorkletGlobalScope names a processor reads, and answers how to put back
/// what was there.
const installScope = (
  currentTime: number,
  register: (registration: Registration) => void = () => {}
): (() => void) => {
  class AudioWorkletProcessor {
    port = {};
  }
  const scope = {
    AudioWorkletProcessor,
    currentTime,
    registerProcessor: (name: string, constructor: ProcessorConstructor) =>
      register({ constructor, name }),
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

export interface OfflineProcessor<Command> {
  readonly name: string;
  readonly post: (batch: SoundBatch<Command>) => void;
  /// The next `seconds` of output, rounded up to whole render quanta.
  readonly render: (seconds: number) => Float32Array;
  /// The next `samples` of output, rounded up to whole render quanta.
  readonly renderSamples: (samples: number) => Float32Array;
  readonly time: () => number;
}

/// A fresh processor from the worklet module at `specifier`, relative to this file, given the
/// document its node would be constructed with.
export const offlineProcessor = async <Command>(
  specifier: string,
  document: unknown
): Promise<OfflineProcessor<Command>> => {
  let registration = registrations.get(specifier);
  if (registration === undefined) {
    // The module registers its processor as it evaluates, so the scope stands until it has.
    const restore = installScope(0, registered => {
      registration = registered;
    });
    try {
      await import(specifier);
    } finally {
      restore();
    }
    if (registration === undefined) {
      throw new Error(`${specifier} registered no processor`);
    }
    registrations.set(specifier, registration);
  }
  const { constructor, name } = registration;
  const processor = withScope(
    0,
    () =>
      new constructor({ processorOptions: { document } }) as Processor<Command>
  );
  let rendered = 0;
  const renderSamples = (samples: number): Float32Array => {
    const blocks = Math.ceil(samples / BLOCK);
    const output = new Float32Array(blocks * BLOCK);
    for (let index = 0; index < blocks; index += 1) {
      const block = new Float32Array(BLOCK);
      withScope(rendered / SAMPLE_RATE, () => processor.process([], [[block]]));
      output.set(block, index * BLOCK);
      rendered += BLOCK;
    }
    return output;
  };
  return {
    name,
    post: batch => processor.port.onmessage!({ data: batch }),
    render: seconds => renderSamples(seconds * SAMPLE_RATE),
    renderSamples,
    time: () => rendered / SAMPLE_RATE
  };
};

/// Root-mean-square level of `samples`.
export const rms = (samples: Float32Array): number => {
  let sum = 0;
  for (const sample of samples) {
    sum += sample ** 2;
  }
  return samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
};
