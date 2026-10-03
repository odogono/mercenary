import type { TitleRuntime } from '../shell/title.ts';
import type { DionPanelView } from './panel.ts';
import { DION_STORAGE, DION_TITLE } from './save.ts';
import type { DionResumeRecord, DionSnapshot } from './session.ts';
import {
  loadTourcraftContent,
  type TourcraftContent
} from './tourcraftContent.ts';
import { TourcraftSession, tourcraftPanelView } from './tourcraftSession.ts';

/// One Dion Gameplay Session from the coherent prison opening to on-foot TOLOSA.
/// Destination and shell storage remain METIS throughout the Body change.
export const dionTitle: TitleRuntime<
  DionSnapshot,
  TourcraftContent,
  DionResumeRecord,
  DionPanelView
> = {
  create: (content, restore) => new TourcraftSession(content, restore),
  load: loadTourcraftContent,
  panelViewModel: tourcraftPanelView,
  slug: DION_TITLE,
  storage: DION_STORAGE
};
