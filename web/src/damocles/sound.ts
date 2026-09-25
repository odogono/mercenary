import { SoundLifecycle } from '../sound/lifecycle.ts';
import type { SoundTransport } from '../sound/presenter.ts';
import type { DamoclesMusicData, DamoclesRequest } from './psg.ts';
import type { Effect } from './script.ts';

/// What the Damocles processor needs to know: how often its VBL runs, and the
/// GHETTOBLASTER's tune where something may ask for it (the sound board; no session does).
export interface DamoclesSoundDocument {
  readonly music?: DamoclesMusicData;
  readonly vblHertz: number;
}

/// A session sends its Sound Cues and the text of each message it begins. The sound board also
/// sends the driver's other programmes and the state the ST's own code would feed it: the
/// craft's speed, the GHETTOBLASTER's switch.
export type DamoclesSoundCommand =
  | { readonly cue: DamoclesRequest; readonly kind: 'cue' }
  | { readonly exponent: number; readonly kind: 'speed' }
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'music'; readonly playing: boolean }
  | { readonly kind: 'reset' }
  | { readonly kind: 'mute'; readonly value: boolean }
  | { readonly kind: 'volume'; readonly value: number };

export type DamoclesSoundState =
  'locked' | 'unlocking' | 'running' | 'suspended' | 'disposed';

/// Presents a Damocles Gameplay Session's Sound Cues and message tone through the Browser Shell's audio
/// transport (#508), through the lifecycle it shares with Targ's `SoundPresenter` (#513): nothing
/// sounds before a trusted gesture unlocks audio, cues drained while locked are dropped rather
/// than played late, and mute and volume are the shared preferences. It only reads effects the session has already
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

  /// The effects one session step drained, in the order it made them, at its elapsed time: its
  /// Sound Cues, and the messages whose scroll-in the driver sounds. Effects drained while audio
  /// is still unlocking are dropped along with the locked ones.
  present(effects: readonly Effect[], at: number): void {
    if (
      this.lifecycle.phase !== 'unlocked' ||
      this.lifecycle.suspended ||
      effects.length === 0
    ) {
      return;
    }
    this.lifecycle.send({
      at,
      commands: effects.map(effect =>
        effect.type === 'message'
          ? { kind: 'message' as const, text: effect.text }
          : { cue: effect.cue, kind: 'cue' as const }
      )
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
