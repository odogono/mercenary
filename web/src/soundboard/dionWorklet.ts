import type { DionSoundProgramme } from '../dion/narrative.ts';
import { registerChipProcessor } from '../sound/workletHost.ts';
import {
  createDionBoardProgram,
  type DionBoardCommand
} from './dionProgram.ts';

registerChipProcessor<DionBoardCommand, readonly DionSoundProgramme[]>(
  'dion-board-ym',
  'Mercenary III sound board',
  createDionBoardProgram
);
