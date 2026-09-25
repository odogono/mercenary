import type { SoundBatch } from '../sound/presenter.ts';
import { Ym2149 } from '../sound/ym2149.ts';
import { DamoclesPsgDriver } from './psg.ts';
import type { DamoclesSoundCommand, DamoclesSoundDocument } from './sound.ts';

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
  readonly processorOptions: { readonly document: DamoclesSoundDocument };
}

type Batch = SoundBatch<DamoclesSoundCommand>;

/// The Damocles YM2149 and its sound driver on the audio thread (#508).
///
/// The driver's VBL runs on the audio clock, free of the Gameplay Session's steps, as the ST's
/// VBL interrupt is free of its frame loop. A Sound Cue lands at the time the presenter gives
/// it and the next VBL plays it.
class DamoclesYmProcessor extends AudioWorkletProcessor {
  private readonly chip = new Ym2149(sampleRate);
  private readonly driver = new DamoclesPsgDriver();
  private readonly samplesPerVbl: number;
  private untilVbl: number;
  private queue: Batch[] = [];

  constructor(options: ProcessorOptions) {
    super(options);
    this.samplesPerVbl =
      sampleRate / options.processorOptions.document.vblHertz;
    this.untilVbl = this.samplesPerVbl;
    this.port.onmessage = (message: MessageEvent<Batch>) => {
      const reset = message.data.commands.some(
        command => command.kind === 'reset'
      );
      if (message.data.replacePending || reset) {
        this.queue = [];
      }
      if (reset) {
        // Silence at once rather than at `at`: a reset sent while the context is suspended
        // must not wait in a queue the resume then replaces, or the old tone plays on.
        this.driver.reset();
        this.chip.reset();
        return;
      }
      if (this.queue.length >= 2048) {
        throw new Error('Damocles sound command queue overflow');
      }
      this.queue.push(message.data);
      this.queue.sort((left, right) => left.at - right.at);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channel = outputs[0]?.[0];
    if (channel === undefined) {
      return true;
    }
    let position = 0;
    while (position < channel.length) {
      const batch = this.queue[0];
      const batchAt =
        batch === undefined
          ? Infinity
          : Math.max(
              position,
              Math.ceil((batch.at - currentTime) * sampleRate)
            );
      const vblAt = position + Math.ceil(this.untilVbl - 1e-9);
      const next = Math.min(channel.length, batchAt, vblAt);
      channel.set(this.chip.render(next - position), position);
      this.untilVbl -= next - position;
      position = next;
      if (next === batchAt) {
        this.queue.shift();
        for (const command of batch!.commands) {
          this.apply(command);
        }
      } else if (next === vblAt) {
        this.driver.vbl(this.chip);
        this.untilVbl += this.samplesPerVbl;
      }
    }
    return true;
  }

  private apply(command: DamoclesSoundCommand): void {
    switch (command.kind) {
      case 'cue':
        this.driver.request(command.cue, this.chip);
        break;
      case 'reset':
      case 'mute':
      case 'volume':
        // A reset is applied on arrival; the transport's gain applies mute and volume.
        break;
    }
  }
}

registerProcessor('damocles-ym', DamoclesYmProcessor);
