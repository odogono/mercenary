import type { SoundDocument } from '../payload/documents.ts';
import type { PresentationEvent, SessionSnapshot } from '../session/index.ts';
import { SoundLifecycle } from './lifecycle.ts';

export type SoundCommand =
  | { readonly kind: 'play'; readonly selector: number; readonly voice: 1 | 2 }
  | {
      readonly kind: 'write';
      readonly register: number;
      readonly value: number;
    }
  | { readonly kind: 'reset'; readonly registers: readonly number[] }
  | { readonly kind: 'mute'; readonly value: boolean }
  | { readonly kind: 'volume'; readonly value: number };

export interface SoundBatch<Command = SoundCommand> {
  readonly at: number;
  readonly commands: readonly Command[];
  readonly replacePending?: boolean;
}

export interface SoundTransport<Command = SoundCommand> {
  readonly dispose: () => void;
  readonly resume: () => void;
  readonly send: (batch: SoundBatch<Command>) => void;
  readonly suspend: () => void;
  readonly unlock: () => Promise<void>;
}

export interface PresentSoundStep {
  readonly events: readonly PresentationEvent[];
  readonly snapshot: SessionSnapshot;
  readonly suppressTransient?: boolean;
}

/// Benson's voice 3 frequency high byte for the character the display last shifted in, or the
/// silence byte when no burst is shifting.
export const bensonFrequencyHigh = (
  rule: SoundDocument['bensonDisplay'],
  character: string | undefined
): number => {
  if (character === undefined) {
    return rule.stopFrequencyHigh;
  }
  const code = character.charCodeAt(0) & rule.characterMask;
  return (
    ((code === rule.spaceCode ? rule.spaceFrequencyHigh : code) +
      rule.frequencyHighBias) &
    0xff
  );
};

const scriptCommand = (
  event: Extract<PresentationEvent, { readonly script: unknown }>
): SoundCommand | undefined => {
  const effect = event.script;
  if (effect === 'keyAcknowledged') {
    return { kind: 'play', selector: 0, voice: 1 };
  }
  if (typeof effect !== 'object' || !('sound' in effect)) {
    return undefined;
  }
  const match = /^voice([1-3])\.control$/.exec(effect.sound.symbol);
  if (match === null) {
    return undefined;
  }
  return {
    kind: 'write',
    register: (Number(match[1]) - 1) * 7 + 4,
    value: effect.sound.value
  };
};

/// Translates ordered presentation steps into the bounded command vocabulary
/// understood by the AudioWorklet. It never owns or mutates Session State.
export class SoundPresenter {
  private readonly lifecycle: SoundLifecycle<SoundCommand>;
  private refreshPersistent = false;
  private lastDisplay = '';
  private liftActive = false;
  private lastLiftPitch: number | undefined;
  private craftActive = false;
  private lastCraft:
    | { readonly frequencyHigh: number; readonly sustainRelease: number }
    | undefined;

  constructor(
    private readonly document: SoundDocument,
    transport: SoundTransport
  ) {
    this.lifecycle = new SoundLifecycle<SoundCommand>(transport);
  }

  async unlock(): Promise<void> {
    if (this.lifecycle.phase !== 'locked') {
      return;
    }
    this.liftActive = false;
    this.lastLiftPitch = undefined;
    this.lastDisplay = '';
    this.lastCraft = undefined;
    this.craftActive = false;
    await this.lifecycle.unlock();
  }

  present(step: PresentSoundStep): void {
    if (this.lifecycle.phase === 'disposed' || this.lifecycle.suspended) {
      return;
    }
    const commands: SoundCommand[] = [];
    if (!step.suppressTransient) {
      for (const event of step.events) {
        if (event === 'tone') {
          if (
            step.snapshot.location.kind === 'surface' &&
            step.snapshot.occupancy.kind === 'aboard'
          ) {
            commands.push({ kind: 'play', selector: 0, voice: 1 });
          }
        } else if ('lift' in event) {
          this.liftActive = true;
          this.lastLiftPitch = undefined;
          commands.push(
            {
              kind: 'play',
              selector: this.document.liftJourney.dingSelector,
              voice: 1
            },
            {
              kind: 'play',
              selector: this.document.liftJourney.programSelector,
              voice: 2
            }
          );
        } else if ('fire' in event) {
          commands.push({ kind: 'play', selector: event.fire.sound, voice: 1 });
        } else if ('impact' in event) {
          commands.push({
            kind: 'play',
            selector: event.impact.sound,
            voice: 1
          });
        } else if ('wall' in event) {
          commands.push({ kind: 'play', selector: event.wall.sound, voice: 1 });
        } else if ('script' in event) {
          const command =
            event.script === 'keyAcknowledged' &&
            !(
              step.snapshot.location.kind === 'surface' &&
              step.snapshot.occupancy.kind === 'aboard'
            )
              ? undefined
              : scriptCommand(event);
          if (command !== undefined) {
            commands.push(command);
          }
        } else if ('arrived' in event) {
          if (
            !step.events.some(
              item => typeof item === 'object' && 'lift' in item
            )
          ) {
            this.liftActive = false;
            this.lastLiftPitch = undefined;
            this.craftActive = false;
            this.lastCraft = undefined;
            commands.push(...this.restoreSceneVoices());
            if (step.snapshot.core.transitionCooldown > 0) {
              commands.push(
                { kind: 'play', selector: 28, voice: 1 },
                { kind: 'play', selector: 32, voice: 2 }
              );
            }
          }
        } else if ('touchdown' in event && event.touchdown === 'crashed') {
          commands.push({ kind: 'play', selector: 24, voice: 1 });
        }
      }
    }
    commands.push(...this.persistentCommands(step.snapshot));
    if (commands.length === 0) {
      return;
    }
    // In the locked state every audible event is deliberately discarded. The
    // first trusted gesture changes the state to unlocking before its action.
    this.lifecycle.send({ at: step.snapshot.elapsed, commands });
  }

  setMuted(value: boolean, at = 0): void {
    this.lifecycle.setMuted(value, at);
  }

  setVolume(value: number, at = 0): void {
    this.lifecycle.setVolume(value, at);
  }

  suspend(): void {
    this.lifecycle.suspend();
  }

  resume(): void {
    if (this.lifecycle.suspended) {
      this.refreshPersistent = true;
    }
    this.lifecycle.resume();
  }

  resetFromSnapshot(snapshot: SessionSnapshot): void {
    this.lifecycle.clearPending();
    // A reset clears voice 2, so an in-progress restored journey must start
    // its continuous program again before applying the retained pitch.
    this.liftActive = false;
    this.lastLiftPitch = undefined;
    this.craftActive = false;
    this.lastCraft = undefined;
    this.lastDisplay = '';
    this.lifecycle.send({
      at: snapshot.elapsed,
      commands: [{ kind: 'reset', registers: this.document.initialRegisters }]
    });
    this.present({ events: [], snapshot, suppressTransient: true });
  }

  dispose(): void {
    this.lifecycle.dispose();
  }

  private persistentCommands(snapshot: SessionSnapshot): SoundCommand[] {
    const commands: SoundCommand[] = [];
    const refresh = this.refreshPersistent;
    this.refreshPersistent = false;
    const display = snapshot.bensonMessage?.soundCharacter ?? '';
    if (refresh || display !== this.lastDisplay) {
      this.lastDisplay = display;
      const rule = this.document.bensonDisplay;
      commands.push({
        kind: 'write',
        register: rule.frequencyHighRegister,
        value: bensonFrequencyHigh(rule, display.at(-1))
      });
    }

    if (snapshot.liftJourney !== undefined) {
      if (!this.liftActive) {
        this.liftActive = true;
        commands.push({
          kind: 'play',
          selector: this.document.liftJourney.programSelector,
          voice: 2
        });
      }
      const pitch = snapshot.liftJourney.pitchHighByte;
      if (refresh || pitch !== this.lastLiftPitch) {
        commands.push({
          kind: 'write',
          register: this.document.liftJourney.pitchHighRegister,
          value: pitch
        });
        this.lastLiftPitch = pitch;
      }
      return commands;
    }
    if (this.liftActive) {
      this.liftActive = false;
      this.lastLiftPitch = undefined;
      this.craftActive = false;
      this.lastCraft = undefined;
      commands.push({
        kind: 'write',
        register: this.document.liftJourney.controlRegister,
        value: this.document.liftJourney.stoppedValue
      });
    }
    const craftActive =
      snapshot.location.kind === 'surface' &&
      snapshot.occupancy.kind === 'aboard';
    if (!craftActive) {
      if (
        this.craftActive ||
        (refresh && snapshot.core.transitionCooldown === 0)
      ) {
        commands.push({
          kind: 'write',
          register: this.document.stopRules.secondVoiceControlRegister,
          value: this.document.stopRules.stoppedValue
        });
      }
      this.craftActive = false;
      this.lastCraft = undefined;
    } else {
      // $26/$27 are speed's mantissa and signed exponent, not throttle bytes.
      const speed = Math.max(2 ** -32, Math.abs(snapshot.player.speed));
      const exponent = Math.max(
        -32,
        Math.min(31, Math.floor(Math.log2(speed)))
      );
      const mantissa = Math.min(
        255,
        Math.max(0, Math.floor((speed / 2 ** exponent - 1) * 256))
      );
      const exponentByte =
        (exponent * 4 + (snapshot.player.speed < 0 ? 1 : 0)) & 255;
      const adjusted = exponentByte - this.document.craft.throttleSubtract;
      const envelope =
        (exponentByte & 128) !== 0
          ? 0
          : (((adjusted <= 0 ? this.document.craft.throttleFloor : adjusted) <<
              2) |
              this.document.craft.sustainReleaseOr) &
            255;
      const next = {
        frequencyHigh:
          (envelope & 0xf0) | (mantissa >> this.document.craft.speedHighShift),
        sustainRelease: envelope
      };
      if (
        refresh ||
        !this.craftActive ||
        this.lastCraft?.frequencyHigh !== next.frequencyHigh ||
        this.lastCraft?.sustainRelease !== next.sustainRelease
      ) {
        if (next.sustainRelease > (this.lastCraft?.sustainRelease ?? 0)) {
          commands.push({
            kind: 'play',
            selector: this.document.craft.programSelector,
            voice: 2
          });
        }
        commands.push(
          {
            kind: 'write',
            register: this.document.craft.frequencyHighRegister,
            value: next.frequencyHigh
          },
          {
            kind: 'write',
            register: this.document.craft.sustainReleaseRegister,
            value: next.sustainRelease
          }
        );
        this.lastCraft = next;
      }
      this.craftActive = true;
    }
    return commands;
  }

  private restoreSceneVoices(): SoundCommand[] {
    return this.document.initialRegisters
      .slice(0, 14)
      .map((value, register) => ({
        kind: 'write',
        register,
        value
      }));
  }
}
