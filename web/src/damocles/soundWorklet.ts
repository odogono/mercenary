import { registerChipProcessor } from '../sound/workletHost.ts';
import { Ym2149 } from '../sound/ym2149.ts';
import { DamoclesPsgDriver } from './psg.ts';
import type { DamoclesSoundCommand, DamoclesSoundDocument } from './sound.ts';

/// The Damocles YM2149 and its sound driver on the audio thread (#508).
///
/// The driver's VBL runs on the audio clock, free of the Gameplay Session's steps, as the ST's
/// VBL interrupt is free of its frame loop. A Sound Cue lands at the time the presenter gives
/// it and the next VBL plays it.
registerChipProcessor<DamoclesSoundCommand, DamoclesSoundDocument>(
  'damocles-ym',
  'Damocles sound',
  (document, sampleRate) => {
    const chip = new Ym2149(sampleRate);
    const driver = new DamoclesPsgDriver();
    return {
      apply: command => {
        // The transport's gain applies mute and volume.
        if (command.kind === 'cue') {
          driver.request(command.cue, chip);
        }
      },
      chip,
      reset: () => {
        driver.reset();
        chip.reset();
      },
      tick: { hertz: document.vblHertz, run: () => driver.vbl(chip) }
    };
  }
);
