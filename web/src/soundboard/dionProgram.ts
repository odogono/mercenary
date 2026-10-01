import type { DionSoundProgramme } from '../dion/narrative.ts';
import { emptyNarrative } from '../dion/script.ts';
import {
  freshSound,
  requestSound,
  soundRegisterChanges,
  tickSound
} from '../dion/sound.ts';
import { createDionChip } from '../dion/soundChip.ts';
import type { ChipProgram } from '../sound/workletHost.ts';

export type DionBoardCommand =
  | { readonly cue: string; readonly kind: 'cue' }
  | { readonly kind: 'control'; readonly value: number }
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'reset' }
  | { readonly kind: 'mute'; readonly value: boolean }
  | { readonly kind: 'volume'; readonly value: number };

/// The listening board runs the game's sound rules on the audio clock, without a
/// Gameplay Session. Its own reset clears the programmes as well as the synthesis.
export const createDionBoardProgram = (
  programmes: readonly DionSoundProgramme[],
  sampleRate: number
): ChipProgram<DionBoardCommand> => {
  const program = createDionChip(sampleRate);
  let sound = freshSound();
  let message = emptyNarrative().message;
  let control = 0;
  const reset = (): void => {
    sound = freshSound();
    message = emptyNarrative().message;
    program.reset({ kind: 'reset', state: sound });
  };
  const writeChanges = (next: typeof sound): void => {
    program.apply({
      kind: 'registers',
      registers: soundRegisterChanges(sound, next)
    });
    sound = next;
  };
  reset();
  return {
    apply: command => {
      switch (command.kind) {
        case 'cue':
          writeChanges(requestSound(sound, command.cue));
          return;
        case 'control':
          control = command.value;
          return;
        case 'message':
          message = {
            ...emptyNarrative().message,
            busy: true,
            text: command.text
          };
      }
    },
    chip: program.chip,
    reset,
    tick: {
      hertz: 50,
      run: () => {
        if (message.busy) {
          message = { ...message, age: message.age + 1 };
          if (message.age > 36) {
            message = { ...message, busy: false };
          }
        }
        writeChanges(tickSound(programmes, sound, control, message));
      }
    }
  };
};
