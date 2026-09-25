import { SoundLifecycle } from '../sound/lifecycle.ts';
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
/// transport (#508), through the lifecycle it shares with Targ's `SoundPresenter` (#513): nothing
/// sounds before a trusted gesture unlocks audio, cues drained while locked are dropped rather
/// than played late, and mute and volume are the shared preferences. It only reads cues the session has already
/// drained; it never touches Session State.
export class DamoclesSoundPresenter {
  private readonly lifecycle: SoundLifecycle<DamoclesSoundCommand>;

  constructor(transport: SoundTransport<DamoclesSoundCommand>) {
    this.lifecycle = new SoundLifecycle<DamoclesSoundCommand>(transport);
  }

  get state(): DamoclesSoundState {
    const phase = this.lifecycle.phase;
    if (phase === 'unlocked') {
      return this.lifecycle.suspended ? 'suspended' : 'running';
    }
    return phase;
  }

  unlock(): Promise<void> {
    return this.lifecycle.unlock();
  }

  /// The cues one session step drained, in the order it asked for them, at its elapsed time.
  /// Cues drained while audio is still unlocking are dropped along with the locked ones.
  present(cues: readonly DamoclesCue[], at: number): void {
    if (
      this.lifecycle.phase !== 'unlocked' ||
      this.lifecycle.suspended ||
      cues.length === 0
    ) {
      return;
    }
    this.lifecycle.send({
      at,
      commands: cues.map(cue => ({ cue, kind: 'cue' as const }))
    });
  }

  setMuted(value: boolean): void {
    this.lifecycle.setMuted(value);
  }

  setVolume(value: number): void {
    this.lifecycle.setVolume(value);
  }

  /// Silence every channel and forget the timebase: a session replaced, a Save loaded, or the
  /// session lost to another tab. No tone the old session started outlives it. `at` is the
  /// elapsed time of the session that follows, which the transport takes as its new timebase.
  reset(at: number): void {
    if (this.lifecycle.phase === 'unlocked') {
      this.lifecycle.send({ at, commands: [{ kind: 'reset' }] });
    }
  }

  suspend(): void {
    this.lifecycle.suspend();
  }

  resume(): void {
    this.lifecycle.resume();
  }

  dispose(): void {
    this.lifecycle.dispose();
  }
}
