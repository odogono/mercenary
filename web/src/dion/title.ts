import type { TitleRuntime } from '../shell/title.ts';
import { loadDionContent, type DionContent } from './content.ts';
import type { DionPanelView } from './panel.ts';
import { DION_STORAGE, DION_TITLE } from './save.ts';
import {
  DionSession,
  dionPanelView,
  type DionResumeRecord,
  type DionSnapshot
} from './session.ts';

/// Mercenary III as a Title (ADR 0041, ADR 0043, D1 #638).
///
/// It loads only `payload/dion/` and its own authored document, never Targ's or
/// Damocles's, and keeps its own storage keys. Its session and panel are its own: the
/// shell asks no more of it than of any Title.
export const dionTitle: TitleRuntime<
  DionSnapshot,
  DionContent,
  DionResumeRecord,
  DionPanelView
> = {
  create: (content, restore) => new DionSession(content, restore),
  load: loadDionContent,
  panelViewModel: dionPanelView,
  slug: DION_TITLE,
  storage: DION_STORAGE
};
