import type { SoundDocument } from '../payload/documents.ts';
import type { SoundCommand } from './presenter.ts';
import { SidSynth } from './synth.ts';
import { registerChipProcessor } from './workletHost.ts';
import { Ym2149 } from './ym2149.ts';

/// Targ's SID on the audio thread (ADR 0036). The presenter derives every register write from
/// the Gameplay Session on the main thread; the processor only plays them at their times.
/// Beside it runs the ST's YM2149, silent unless an ST presentation writes it: the Doorway
/// Transition's door sound (#978). The two are summed.
registerChipProcessor<SoundCommand, SoundDocument>(
  'mercenary-sid',
  'SID',
  (document, sampleRate) => {
    const synth = new SidSynth(document, sampleRate);
    const ym = new Ym2149(sampleRate);
    return {
      apply: command => {
        switch (command.kind) {
          case 'play':
            synth.play(command.selector, command.voice);
            break;
          case 'write':
            synth.write(command.register, command.value);
            break;
          case 'ym':
            ym.write(command.register, command.value);
            break;
          case 'mute':
            synth.setMuted(command.value);
            break;
          case 'volume':
            synth.setVolume(command.value);
            break;
        }
      },
      chip: {
        render: count => {
          const samples = synth.render(count);
          const door = ym.render(count);
          for (let index = 0; index < count; index += 1) {
            samples[index]! += door[index]!;
          }
          return samples;
        }
      },
      reset: command => {
        synth.reset(command.registers);
        ym.reset();
      }
    };
  }
);
