import type { SoundDocument } from '../payload/documents.ts';
import type { SoundBatch, SoundCommand } from './presenter.ts';
import { SidSynth } from './synth.ts';

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(
  name: string,
  processor: typeof AudioWorkletProcessor
): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
}

interface ProcessorOptions extends AudioWorkletNodeOptions {
  readonly processorOptions: { readonly document: SoundDocument };
}

class MercenarySidProcessor extends AudioWorkletProcessor {
  private readonly synth: SidSynth;
  private queue: SoundBatch[] = [];

  constructor(options: ProcessorOptions) {
    super(options);
    this.synth = new SidSynth(options.processorOptions.document, sampleRate);
    this.port.onmessage = (message: MessageEvent<SoundBatch>) => {
      this.queue.push(message.data);
      this.queue.sort((left, right) => left.at - right.at);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channel = outputs[0]?.[0];
    if (channel === undefined) {
      return true;
    }
    while (this.queue[0] !== undefined && this.queue[0].at <= currentTime) {
      const batch = this.queue.shift()!;
      for (const command of batch.commands) {
        this.apply(command);
      }
    }
    channel.set(this.synth.render(channel.length));
    return true;
  }

  private apply(command: SoundCommand): void {
    switch (command.kind) {
      case 'play':
        this.synth.play(command.selector, command.voice);
        break;
      case 'write':
        this.synth.write(command.register, command.value);
        break;
      case 'reset':
        this.synth.reset(command.registers);
        break;
      case 'mute':
        this.synth.setMuted(command.value);
        break;
      case 'volume':
        this.synth.setVolume(command.value);
        break;
    }
  }
}

registerProcessor('mercenary-sid', MercenarySidProcessor);
