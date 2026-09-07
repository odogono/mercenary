import type { SoundDocument } from '../payload/documents.ts';
import type { PresentationEvent, SessionSnapshot } from '../session/index.ts';

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

export interface SoundBatch {
  readonly at: number;
  readonly commands: readonly SoundCommand[];
  readonly replacePending?: boolean;
}

export interface SoundTransport {
  readonly dispose: () => void;
  readonly resume: () => void;
  readonly send: (batch: SoundBatch) => void;
  readonly suspend: () => void;
  readonly unlock: () => Promise<void>;
}

export interface PresentSoundStep {
  readonly events: readonly PresentationEvent[];
  readonly snapshot: SessionSnapshot;
  readonly suppressTransient?: boolean;
}

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
  private state: 'locked' | 'unlocking' | 'unlocked' | 'disposed' = 'locked';
  private pending: SoundBatch[] = [];
  private muted = false;
  private volume = 100;
  private suspended = false;
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
    private readonly transport: SoundTransport
  ) {}

  async unlock(): Promise<void> {
    if (this.state === 'unlocked' || this.state === 'disposed') {
      return;
    }
    if (this.state === 'unlocking') {
      return;
    }
    this.state = 'unlocking';
    this.liftActive = false;
    this.lastLiftPitch = undefined;
    this.lastDisplay = '';
    this.lastCraft = undefined;
    this.craftActive = false;
    try {
      await this.transport.unlock();
      if ((this.state as string) === 'disposed') {
        return;
      }
      this.state = 'unlocked';
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
      this.state = 'locked';
      throw error;
    }
  }

  present(step: PresentSoundStep): void {
    if (this.state === 'disposed' || this.suspended) {
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
    const batch = { at: step.snapshot.elapsed, commands };
    if (this.state === 'unlocking') {
      this.pending.push(batch);
    } else if (this.state === 'unlocked') {
      this.transport.send(batch);
    }
    // In the locked state every audible event is deliberately discarded. The
    // first trusted gesture changes the state to unlocking before its action.
  }

  setMuted(value: boolean, at = 0): void {
    this.muted = value;
    this.sendControl({ at, commands: [{ kind: 'mute', value }] });
  }

  setVolume(value: number, at = 0): void {
    this.volume = value;
    this.sendControl({ at, commands: [{ kind: 'volume', value }] });
  }

  suspend(): void {
    this.suspended = true;
    if (this.state !== 'disposed') {
      this.transport.suspend();
    }
  }

  resume(): void {
    if (this.suspended) {
      this.refreshPersistent = true;
    }
    this.suspended = false;
    if (this.state !== 'disposed') {
      this.transport.resume();
    }
  }

  resetFromSnapshot(snapshot: SessionSnapshot): void {
    this.pending = [];
    // A reset clears voice 2, so an in-progress restored journey must start
    // its continuous program again before applying the retained pitch.
    this.liftActive = false;
    this.lastLiftPitch = undefined;
    this.craftActive = false;
    this.lastCraft = undefined;
    this.lastDisplay = '';
    this.sendControl({
      at: snapshot.elapsed,
      commands: [{ kind: 'reset', registers: this.document.initialRegisters }]
    });
    this.present({ events: [], snapshot, suppressTransient: true });
  }

  dispose(): void {
    this.state = 'disposed';
    this.pending = [];
    this.transport.dispose();
  }

  private sendControl(batch: SoundBatch): void {
    if (this.state === 'unlocking') {
      this.pending.push(batch);
    }
    if (this.state === 'unlocked') {
      this.transport.send(batch);
    }
  }

  private persistentCommands(snapshot: SessionSnapshot): SoundCommand[] {
    const commands: SoundCommand[] = [];
    const refresh = this.refreshPersistent;
    this.refreshPersistent = false;
    const display = snapshot.bensonMessage?.soundCharacter ?? '';
    if (refresh || display !== this.lastDisplay) {
      this.lastDisplay = display;
      const character = display.at(-1)?.charCodeAt(0);
      const rule = this.document.bensonDisplay;
      const value =
        character === undefined
          ? rule.stopFrequencyHigh
          : (((character & rule.characterMask) === rule.spaceCode
              ? rule.spaceFrequencyHigh
              : character & rule.characterMask) +
              rule.frequencyHighBias) &
            0xff;
      commands.push({
        kind: 'write',
        register: rule.frequencyHighRegister,
        value
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
