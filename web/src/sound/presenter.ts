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
  private lastDisplay = '';
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
    if (this.state === 'disposed') {
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
          const command = scriptCommand(event);
          if (command !== undefined) {
            commands.push(command);
          }
        } else if ('arrived' in event) {
          commands.push({
            kind: 'write',
            register: this.document.stopRules.oneShotControlRegister,
            value: this.document.stopRules.stoppedValue
          });
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
    if (this.state === 'unlocked') {
      this.transport.suspend();
    }
  }

  resume(): void {
    if (this.state === 'unlocked') {
      this.transport.resume();
    }
  }

  resetFromSnapshot(snapshot: SessionSnapshot): void {
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
    const display = snapshot.bensonMessage?.displayText ?? '';
    if (display !== this.lastDisplay) {
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

    const craftActive =
      snapshot.location.kind === 'surface' &&
      snapshot.occupancy.kind === 'aboard';
    if (!craftActive) {
      if (this.craftActive) {
        commands.push({
          kind: 'write',
          register: this.document.stopRules.secondVoiceControlRegister,
          value: this.document.stopRules.stoppedValue
        });
      }
      this.craftActive = false;
      this.lastCraft = undefined;
    } else {
      const speed = Math.abs(Math.round(snapshot.player.speed));
      const throttle = Math.max(
        this.document.craft.throttleFloor,
        Math.round(snapshot.throttle) - this.document.craft.throttleSubtract
      );
      const next = {
        frequencyHigh: ((throttle << 2) & 0xf0) | ((speed >> 4) & 0x0f),
        sustainRelease:
          ((throttle << 2) & 0xf0) | this.document.craft.sustainReleaseOr
      };
      if (
        !this.craftActive ||
        this.lastCraft?.frequencyHigh !== next.frequencyHigh ||
        this.lastCraft?.sustainRelease !== next.sustainRelease
      ) {
        if (
          !this.craftActive ||
          (this.lastCraft !== undefined &&
            next.sustainRelease > this.lastCraft.sustainRelease)
        ) {
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
}
