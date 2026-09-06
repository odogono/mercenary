import type { SoundDocument } from '../payload/documents.ts';
import type { SoundBatch, SoundCommand, SoundTransport } from './presenter.ts';

type AudioContextConstructor = new () => AudioContext;

export interface AudioWorkletTransportOptions {
  readonly context?: AudioContextConstructor;
  readonly node?: typeof AudioWorkletNode;
  readonly onFailure: (reason: string) => void;
  readonly workletUrl?: string;
}

/// Lazily owns the browser audio graph. Runtime or hardware failure is reported
/// once and leaves gameplay running in silence.
export class AudioWorkletTransport implements SoundTransport {
  private context: AudioContext | undefined;
  private gain: GainNode | undefined;
  private node: AudioWorkletNode | undefined;
  private disposed = false;
  private failed = false;
  private muted = false;
  private origin: number | undefined;
  private volume = 100;
  private suspended = false;

  constructor(
    private readonly document: SoundDocument,
    private readonly options: AudioWorkletTransportOptions
  ) {}

  async unlock(): Promise<void> {
    if (this.disposed || this.node !== undefined || this.failed) {
      return;
    }
    try {
      const Context = this.options.context ?? globalThis.AudioContext;
      if (Context === undefined) {
        throw new Error('Web Audio is unavailable');
      }
      const context = new Context();
      this.context = context;
      // Resume inside the trusted gesture, before asynchronous module loading.
      await Promise.all([
        context.resume(),
        context.audioWorklet.addModule(
          this.options.workletUrl ?? '/src/sound/worklet.ts'
        )
      ]);
      if (this.disposed) {
        await context.close();
        return;
      }
      const Node = this.options.node ?? globalThis.AudioWorkletNode;
      if (Node === undefined) {
        throw new Error('AudioWorklet is unavailable');
      }
      const node = new Node(context, 'mercenary-sid', {
        outputChannelCount: [1],
        processorOptions: { document: this.document }
      });
      const gain = context.createGain();
      gain.gain.value = this.muted ? 0 : this.volume / 100;
      node.connect(gain).connect(context.destination);
      this.context = context;
      this.node = node;
      this.gain = gain;
      node.onprocessorerror = () =>
        this.report(new Error('SID AudioWorklet failed'));
      if (this.suspended) {
        await context.suspend();
      }
    } catch (error) {
      this.report(error);
    }
  }

  send(batch: SoundBatch): void {
    const context = this.context;
    const node = this.node;
    if (
      this.disposed ||
      this.failed ||
      context === undefined ||
      node === undefined
    ) {
      return;
    }
    const audible: SoundCommand[] = [];
    for (const command of batch.commands) {
      if (command.kind === 'mute') {
        this.muted = command.value;
        this.applyGain(context.currentTime);
      } else if (command.kind === 'volume') {
        this.volume = command.value;
        this.applyGain(context.currentTime);
      } else {
        audible.push(command);
      }
    }
    if (audible.length > 0) {
      if (audible.some(command => command.kind === 'reset')) {
        this.origin = undefined;
      }
      this.origin ??= context.currentTime - batch.at;
      const at = Math.max(context.currentTime, this.origin + batch.at);
      node.port.postMessage({ at, commands: audible });
    }
  }

  suspend(): void {
    this.suspended = true;
    void this.context?.suspend().catch(error => this.report(error));
  }

  resume(): void {
    if (this.suspended) {
      this.origin = undefined;
      // Preserve synthesis phase while discarding future commands from the
      // previous clock origin. The presenter refreshes continuous registers.
      this.node?.port.postMessage({
        at: this.context?.currentTime ?? 0,
        commands: [],
        replacePending: true
      });
    }
    this.suspended = false;
    void this.context?.resume().catch(error => this.report(error));
  }

  dispose(): void {
    this.disposed = true;
    this.node?.disconnect();
    this.gain?.disconnect();
    void this.context?.close().catch(() => {});
    this.node = undefined;
    this.gain = undefined;
    this.context = undefined;
  }

  private applyGain(at: number): void {
    this.gain?.gain.setValueAtTime(this.muted ? 0 : this.volume / 100, at);
  }

  private report(error: unknown): void {
    if (this.failed || this.disposed) {
      return;
    }
    this.failed = true;
    this.node?.disconnect();
    void this.context?.close().catch(() => {});
    this.options.onFailure(String(error));
  }
}
