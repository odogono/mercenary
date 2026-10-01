import type { ChipProgram } from '../sound/workletHost.ts';
import { Ym2149 } from '../sound/ym2149.ts';
import type { DionSoundState } from './sound.ts';

export type DionSoundCommand =
  | {
      readonly kind: 'registers';
      readonly registers: readonly (readonly [number, number])[];
    }
  | { readonly kind: 'reset'; readonly state: DionSoundState }
  | { readonly kind: 'mute'; readonly value: boolean }
  | { readonly kind: 'volume'; readonly value: number };

export const createDionChip = (
  sampleRate: number
): ChipProgram<DionSoundCommand> => {
  const chip = new Ym2149(sampleRate);
  return {
    apply: command => {
      if (command.kind === 'registers') {
        for (const [register, value] of command.registers) {
          chip.write(register, value);
        }
      }
    },
    chip,
    reset: command => {
      chip.reset();
      // Shape 9's 32-step click expires after 7936*32/250000 seconds.
      // Power-on already holds the envelope at zero: leave it there for an
      // expired click, avoiding seconds of discarded audio on the worklet thread.
      const active = command.state.clickAge / 50 < (7936 * 32) / 250_000;
      command.state.registers.forEach((value, index) => {
        if (index !== 13 || active) {
          chip.write(index, value);
        }
      });
      if (active) {
        chip.render(Math.round((command.state.clickAge * sampleRate) / 50));
      }
    }
  };
};
