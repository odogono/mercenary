import { parseCatalogue } from '../catalogue/data.ts';
import type { PanelViewModel } from '../shell/panel.ts';
import { titleStorageKeys, type TitleRuntime } from '../shell/title.ts';
import { readErisPresentation } from './documents.ts';
import { damoclesPanelViewModel } from './panel.ts';
import { readDamoclesResume, type ResumeStorage } from './resume.ts';
import {
  DamoclesSession,
  type DamoclesContent,
  type DamoclesResumeRecord,
  type DamoclesSnapshot
} from './session.ts';
import { erisSurfaceFrom } from './world.ts';

export const DAMOCLES_CATALOGUE_PATH = '/payload/damocles/catalogue.json';
export const ERIS_PRESENTATION_PATH = '/damocles/eris.json';

const labelled = <T>(pathname: string, read: () => T): T => {
  try {
    return read();
  } catch (error) {
    throw new Error(
      `${pathname}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/// Damocles as a Title (ADR 0041, ADR 0043).
///
/// Loads only Damocles's Data Payload and its authored presentation, never Targ's; a visit to
/// `/damocles` costs a Targ player nothing and the other way round.
export const damoclesTitle: TitleRuntime<
  DamoclesSnapshot,
  DamoclesContent,
  DamoclesResumeRecord
> = {
  create: (content, restore) => new DamoclesSession(content, restore),
  load: async fetchJson => {
    const [rawCatalogue, rawPresentation] = await Promise.all([
      fetchJson(DAMOCLES_CATALOGUE_PATH),
      fetchJson(ERIS_PRESENTATION_PATH)
    ]);
    const doc = labelled(ERIS_PRESENTATION_PATH, () =>
      readErisPresentation(rawPresentation)
    );
    const catalogue = labelled(DAMOCLES_CATALOGUE_PATH, () =>
      parseCatalogue(rawCatalogue)
    );
    return { doc, surface: erisSurfaceFrom(catalogue, doc) };
  },
  panelViewModel: (snapshot, content): PanelViewModel =>
    damoclesPanelViewModel(snapshot, content.doc),
  slug: 'damocles',
  storage: titleStorageKeys('damocles')
};

export const restoreFor = (
  storage: ResumeStorage | undefined
): DamoclesResumeRecord | undefined => readDamoclesResume(storage);
