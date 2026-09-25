import type { SoundBatch, SoundTransport } from './presenter.ts';

/// The master controls every title's command vocabulary carries. The transport applies them
/// through its gain rather than forwarding them to the chip.
export type ControlCommand =
  | { readonly kind: 'mute'; readonly value: boolean }
  | { readonly kind: 'volume'; readonly value: number };

export type SoundPhase = 'locked' | 'unlocking' | 'unlocked' | 'disposed';

/// The lifecycle every title's sound presenter shares (#513).
///
/// Nothing reaches the transport before a trusted gesture unlocks it: a batch sent while locked
/// is dropped, not played late. While the transport unlocks, batches are held and follow the
/// master controls once it has. Mute and volume set at any time are remembered and replayed on
/// unlock. Suspend, resume and dispose pass straight to the transport. What the title plays,
/// and whether it plays while suspended, stays with its presenter.
export class SoundLifecycle<Command extends { readonly kind: string }> {
  private current: SoundPhase = 'locked';
  private isSuspended = false;
  private muted = false;
  private volume = 100;
  private pending: SoundBatch<Command | ControlCommand>[] = [];

  constructor(
    private readonly transport: SoundTransport<Command | ControlCommand>
  ) {}

  get phase(): SoundPhase {
    return this.current;
  }

  get suspended(): boolean {
    return this.isSuspended;
  }

  async unlock(): Promise<void> {
    if (this.current !== 'locked') {
      return;
    }
    this.current = 'unlocking';
    try {
      await this.transport.unlock();
      if ((this.current as SoundPhase) === 'disposed') {
        return;
      }
      this.current = 'unlocked';
      this.transport.send({
        at: 0,
        commands: [
          { kind: 'mute', value: this.muted },
          { kind: 'volume', value: this.volume }
        ]
      });
      for (const batch of this.pending) {
        this.transport.send(batch);
      }
      this.pending = [];
    } catch (error) {
      this.pending = [];
      this.current = 'locked';
      throw error;
    }
  }

  /// Sends `batch` once unlocked, holds it while unlocking, and drops it otherwise.
  send(batch: SoundBatch<Command | ControlCommand>): void {
    if (this.current === 'unlocking') {
      this.pending.push(batch);
    } else if (this.current === 'unlocked') {
      this.transport.send(batch);
    }
  }

  /// Forgets the batches held for an unlock still under way.
  clearPending(): void {
    this.pending = [];
  }

  setMuted(value: boolean, at = 0): void {
    this.muted = value;
    this.send({ at, commands: [{ kind: 'mute', value }] });
  }

  setVolume(value: number, at = 0): void {
    this.volume = value;
    this.send({ at, commands: [{ kind: 'volume', value }] });
  }

  suspend(): void {
    this.isSuspended = true;
    if (this.current !== 'disposed') {
      this.transport.suspend();
    }
  }

  resume(): void {
    this.isSuspended = false;
    if (this.current !== 'disposed') {
      this.transport.resume();
    }
  }

  dispose(): void {
    this.current = 'disposed';
    this.pending = [];
    this.transport.dispose();
  }
}
