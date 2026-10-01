import { registerChipProcessor } from '../sound/workletHost.ts';
import { createDionChip, type DionSoundCommand } from './soundChip.ts';

registerChipProcessor<DionSoundCommand, object>(
  'dion-ym',
  'Mercenary III sound',
  (_document, sampleRate) => createDionChip(sampleRate)
);
