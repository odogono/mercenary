import type { SoundTransport } from '../sound/presenter.ts';
import type { DamoclesCue } from './psg.ts';

/// What the Damocles processor needs to know: how often its VBL runs.
export interface DamoclesSoundDocument {
  readonly vblHertz: number;
}

export type DamoclesSoundCommand =
  | { readonly cue: DamoclesCue; readonly kind: 'cue' }
  | { readonly kind: 'reset' }
  | { readonly kind: 'mute'; readonly value: boolean }
  | { readonly kind: 'volume'; readonly value: number };

export type DamoclesSoundState =
  'locked' | 'unlocking' | 'running' | 'suspended' | 'disposed';

/// Presents a Damocles Gameplay Session's Sound Cues through the Browser Shell's audio
/// transport (#508). It follows Targ's `SoundPresenter`: nothing sounds before a trusted
/// gesture unlocks audio, cues drained while locked are dropped rather than played late, and
/// mute and volume are the shared preferences. It only reads cues the session has already
/// drained; it never touches Session State.
export class DamoclesSoundPresenter {
  private phase: 'locked' | 'unlocking' | 'unlocked' | 'disposed' = 'locked';
  private suspended = false;
  private muted = false;
  private volume = 100;

  constructor(
    private readonly transport: SoundTransport<DamoclesSoundCommand>
  ) {}

  get state(): DamoclesSoundState {
    if (this.phase === 'unlocked') {
      return this.suspended ? 'suspended' : 'running';
    }
    return this.phase;
  }

  async unlock(): Promise<void> {
    if (this.phase !== 'locked') {
      return;
    }
    this.phase = 'unlocking';
    try {
      await this.transport.unlock();
      if ((this.phase as string) === 'disposed') {
        return;
      }
      this.phase = 'unlocked';
      this.transport.send({
        at: 0,
        commands: [
          { kind: 'mute', value: this.muted },
          { kind: 'volume', value: this.volume }
        ]
      });
    } catch (error) {
      this.phase = 'locked';
      throw error;
    }
  }

  /// The cues one session step drained, in the order it asked for them, at its elapsed time.
  present(cues: readonly DamoclesCue[], at: number): void {
    if (this.phase !== 'unlocked' || this.suspended || cues.length === 0) {
      return;
    }
    this.transport.send({
      at,
      commands: cues.map(cue => ({ cue, kind: 'cue' as const }))
    });
  }

  setMuted(value: boolean): void {
    this.muted = value;
    this.sendControl({ kind: 'mute', value });
  }

  setVolume(value: number): void {
    this.volume = value;
    this.sendControl({ kind: 'volume', value });
  }

  /// Silence every channel and forget the timebase: a session replaced, a Save loaded, or the
  /// session lost to another tab. No tone the old session started outlives it. `at` is the
  /// elapsed time of the session that follows, which the transport takes as its new timebase.
  reset(at: number): void {
    if (this.phase === 'unlocked') {
      this.transport.send({ at, commands: [{ kind: 'reset' }] });
    }
  }

  suspend(): void {
    this.suspended = true;
    if (this.phase !== 'disposed') {
      this.transport.suspend();
    }
  }

  resume(): void {
    this.suspended = false;
    if (this.phase !== 'disposed') {
      this.transport.resume();
    }
  }

  dispose(): void {
    this.phase = 'disposed';
    this.transport.dispose();
  }

  private sendControl(
    command: Extract<DamoclesSoundCommand, { kind: 'mute' | 'volume' }>
  ): void {
    if (this.phase === 'unlocked') {
      this.transport.send({ at: 0, commands: [command] });
    }
  }
}
