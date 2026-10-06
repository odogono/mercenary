import { registerChipProcessor } from '../sound/workletHost.ts';
import {
  createGhettoblasterProgram,
  type GhettoblasterCommand,
  type GhettoblasterDocument
} from './ghettoblasterProgram.ts';

registerChipProcessor<GhettoblasterCommand, GhettoblasterDocument>(
  'board-sid',
  'Sound board SID',
  createGhettoblasterProgram
);
