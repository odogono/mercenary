import type { SoundBatch } from './presenter.ts';

/// One title's sound chip at the register level: Targ's SID or Damocles's YM2149 (#513).
///
/// The chips stay title-specific, each faithful to its own machine. What they share is the shape
/// the worklet host drives: registers written, samples rendered on demand, and a reset back to
/// the state the title starts from.
export interface Chip<ResetArguments extends readonly unknown[] = []> {
  readonly render: (count: number) => Float32Array;
  readonly reset: (...values: ResetArguments) => void;
  readonly write: (register: number, value: number) => void;
}

type Reset<Command> = Extract<Command, { readonly kind: 'reset' }>;

/// What a title runs inside its AudioWorklet: a chip, how its commands play on it, and
/// optionally a driver the machine runs on its own clock, as the ST's VBL runs Damocles's.
export interface ChipProgram<Command extends { readonly kind: string }> {
  /// Plays one command at the sample its batch lands on.
  readonly apply: (command: Command) => void;
  readonly chip: Pick<Chip, 'render'>;
  /// Silences the chip, applied as the command arrives rather than at its time.
  readonly reset: (command: Reset<Command>) => void;
  readonly tick?: { readonly hertz: number; readonly run: () => void };
}

const QUEUE_LIMIT = 2048;

const isReset = <Command extends { readonly kind: string }>(
  command: Command
): command is Reset<Command> => command.kind === 'reset';

/// The audio-thread side every title's processor shares (#513, ADR 0036).
///
/// Batches wait in a queue ordered by time; each render quantum is split at every batch and
/// driver tick that falls inside it, so a command lands on its own sample. A batch that asks to
/// replace what is pending clears the queue, which is how the transport discards the previous
/// clock origin on resume. A reset is applied the moment it arrives: sent while the context is
/// suspended, it must not wait in a queue the resume then replaces, or the old tone plays on.
export class ChipHost<Command extends { readonly kind: string }> {
  private queue: SoundBatch<Command>[] = [];
  private readonly samplesPerTick: number;
  private untilTick: number;

  constructor(
    private readonly program: ChipProgram<Command>,
    private readonly sampleRate: number,
    private readonly label: string
  ) {
    this.samplesPerTick =
      program.tick === undefined ? Infinity : sampleRate / program.tick.hertz;
    this.untilTick = this.samplesPerTick;
  }

  receive(batch: SoundBatch<Command>): void {
    const resets = batch.commands.filter(isReset);
    if (batch.replacePending || resets.length > 0) {
      this.queue = [];
    }
    for (const reset of resets) {
      this.program.reset(reset);
    }
    const commands = batch.commands.filter(command => !isReset(command));
    if (commands.length === 0) {
      return;
    }
    if (this.queue.length >= QUEUE_LIMIT) {
      throw new Error(`${this.label} command queue overflow`);
    }
    this.queue.push({ at: batch.at, commands });
    this.queue.sort((left, right) => left.at - right.at);
  }

  /// Fills one render quantum starting at `currentTime`.
  process(channel: Float32Array, currentTime: number): void {
    const { chip, tick } = this.program;
    let position = 0;
    while (position < channel.length) {
      const batch = this.queue[0];
      const batchAt =
        batch === undefined
          ? Infinity
          : Math.max(
              position,
              Math.ceil((batch.at - currentTime) * this.sampleRate)
            );
      const tickAt = position + Math.ceil(this.untilTick - 1e-9);
      const next = Math.min(channel.length, batchAt, tickAt);
      channel.set(chip.render(next - position), position);
      this.untilTick -= next - position;
      position = next;
      if (next === batchAt) {
        this.queue.shift();
        for (const command of batch!.commands) {
          this.program.apply(command);
        }
      } else if (next === tickAt) {
        tick!.run();
        this.untilTick += this.samplesPerTick;
      }
    }
  }
}

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

interface ProcessorOptions<Document> extends AudioWorkletNodeOptions {
  readonly processorOptions: { readonly document: Document };
}

/// Registers `name` as an AudioWorklet processor hosting the program `create` builds from the
/// document its node was constructed with. Call it from the worklet module.
export const registerChipProcessor = <
  Command extends { readonly kind: string },
  Document
>(
  name: string,
  label: string,
  create: (document: Document, sampleRate: number) => ChipProgram<Command>
): void => {
  class ChipProcessor extends AudioWorkletProcessor {
    private readonly host: ChipHost<Command>;

    constructor(options: ProcessorOptions<Document>) {
      super(options);
      this.host = new ChipHost(
        create(options.processorOptions.document, sampleRate),
        sampleRate,
        label
      );
      this.port.onmessage = (message: MessageEvent<SoundBatch<Command>>) =>
        this.host.receive(message.data);
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const channel = outputs[0]?.[0];
      if (channel !== undefined) {
        this.host.process(channel, currentTime);
      }
      return true;
    }
  }
  registerProcessor(name, ChipProcessor);
};
