import type { SoundDocument } from '../payload/documents.ts';
import type { SoundCommand } from './presenter.ts';
import { SidSynth } from './synth.ts';
import { registerChipProcessor } from './workletHost.ts';

/// Targ's SID on the audio thread (ADR 0036). The presenter derives every register write from
/// the Gameplay Session on the main thread; the processor only plays them at their times.
registerChipProcessor<SoundCommand, SoundDocument>(
  'mercenary-sid',
  'SID',
  (document, sampleRate) => {
    const synth = new SidSynth(document, sampleRate);
    return {
      apply: command => {
        switch (command.kind) {
          case 'play':
            synth.play(command.selector, command.voice);
            break;
          case 'write':
            synth.write(command.register, command.value);
            break;
          case 'mute':
            synth.setMuted(command.value);
            break;
          case 'volume':
            synth.setVolume(command.value);
            break;
        }
      },
      chip: synth,
      reset: command => synth.reset(command.registers)
    };
  }
);
