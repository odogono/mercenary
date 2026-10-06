import type { DamoclesMusicData } from '../damocles/psg.ts';
import type { ChipProgram } from '../sound/workletHost.ts';
import { BoardSid } from './boardSid.ts';
import { GhettoblasterSid } from './ghettoblasterSid.ts';

export interface GhettoblasterDocument {
  readonly clockHz: number;
  readonly music: DamoclesMusicData;
}

export type GhettoblasterCommand =
  | { readonly kind: 'play' }
  | { readonly kind: 'reset' }
  | { readonly kind: 'mute'; readonly value: boolean }
  | { readonly kind: 'volume'; readonly value: number };

/// The arrangement on the board's SID, a VBL at a time on the audio clock. Play starts the
/// tune from its top; reset stops it and silences the chip.
export const createGhettoblasterProgram = (
  document: GhettoblasterDocument,
  sampleRate: number
): ChipProgram<GhettoblasterCommand> => {
  const chip = new BoardSid(document.clockHz, sampleRate);
  let tune: GhettoblasterSid | undefined;
  return {
    apply: command => {
      // The transport's gain applies mute and volume.
      if (command.kind === 'play') {
        chip.reset();
        tune = new GhettoblasterSid(document.music, document.clockHz);
        for (const { register, value } of tune.start()) {
          chip.write(register, value);
        }
      }
    },
    chip,
    reset: () => {
      tune = undefined;
      chip.reset();
    },
    tick: {
      hertz: 50,
      run: () => {
        for (const { register, value } of tune?.vbl() ?? []) {
          chip.write(register, value);
        }
      }
    }
  };
};
