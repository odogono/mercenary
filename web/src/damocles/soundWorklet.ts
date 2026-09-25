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
    const driver = new DamoclesPsgDriver(document.music ?? null);
    // The program's reset `$0508BC` runs at start-up, before anything sounds.
    driver.powerOn(chip);
    return {
      apply: command => {
        // The transport's gain applies mute and volume.
        switch (command.kind) {
          case 'cue':
            driver.request(command.cue, chip);
            return;
          case 'speed':
            driver.setSpeedExponent(command.exponent);
            return;
          case 'message':
            driver.messageCharacter(command.code, chip);
            return;
          case 'music':
            driver.setMusic(command.playing);
        }
      },
      chip,
      reset: () => {
        driver.reset();
        chip.reset();
        driver.powerOn(chip);
      },
      tick: { hertz: document.vblHertz, run: () => driver.vbl(chip) }
    };
  }
);
