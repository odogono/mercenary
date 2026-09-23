import { readCatalogue } from '../catalogue/data.ts';
import type { PanelViewModel } from '../shell/panel.ts';
import { titleStorageKeys, type TitleRuntime } from '../shell/title.ts';
import { readErisPresentation } from './documents.ts';
import { damoclesPanelViewModel } from './panel.ts';
import { parseDamoclesArrivalPoses } from './poses.ts';
import type { DamoclesSaveSnapshot } from './save.ts';
import {
  DamoclesSession,
  type DamoclesContent,
  type DamoclesSnapshot
} from './session.ts';
import { parseDamoclesStrings } from './strings.ts';
import { erisSurfaceFrom } from './world.ts';

export const DAMOCLES_STRINGS_PATH = '/payload/damocles/strings.json';
export const DAMOCLES_ARRIVAL_POSES_PATH =
  '/payload/damocles/arrival-poses.json';
export const ERIS_PRESENTATION_PATH = '/damocles/eris.json';

/// One identity over every Damocles presentation document, in a fixed document order.
///
/// It hashes the bytes that were served rather than a declared schema version, so a document
/// edited without a version bump still refuses a save written before the edit. Today there is
/// one such document; the array is the seam along which the others join (#344).
export const presentationIdentity = async (
  texts: readonly string[]
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(texts.join('\u0000'))
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
};

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
  DamoclesSaveSnapshot
> = {
  create: (content, restore) => new DamoclesSession(content, restore),
  load: async fetch => {
    // The Catalogue is its shared document and one file per Model (ADR 0048); the reader
    // labels any failure with the path that failed.
    const [catalogue, rawPresentation, rawStrings, rawPoses] =
      await Promise.all([
        readCatalogue(async path => (await fetch(path)).value),
        fetch(ERIS_PRESENTATION_PATH),
        fetch(DAMOCLES_STRINGS_PATH),
        fetch(DAMOCLES_ARRIVAL_POSES_PATH)
      ]);
    const doc = labelled(ERIS_PRESENTATION_PATH, () =>
      readErisPresentation(rawPresentation.value)
    );
    const strings = labelled(DAMOCLES_STRINGS_PATH, () =>
      parseDamoclesStrings(rawStrings.value)
    );
    const poses = labelled(DAMOCLES_ARRIVAL_POSES_PATH, () =>
      parseDamoclesArrivalPoses(rawPoses.value)
    );
    if (strings.source.programSha256 !== catalogue.source.programSha256) {
      throw new Error(
        `${DAMOCLES_STRINGS_PATH}: program identity does not match the Catalogue`
      );
    }
    // The arrival Poses decide which Bodies are switchable and which a Save may name, so a
    // payload whose poses came from another program is refused rather than half-admitted.
    if (poses.programSha256 !== catalogue.source.programSha256) {
      throw new Error(
        `${DAMOCLES_ARRIVAL_POSES_PATH}: program identity does not match the Catalogue`
      );
    }
    return {
      catalogue,
      doc,
      poses,
      presentationSha256: await presentationIdentity([rawPresentation.text]),
      strings,
      surface: erisSurfaceFrom(catalogue, doc)
    };
  },
  panelViewModel: (snapshot, content): PanelViewModel =>
    damoclesPanelViewModel(snapshot, content.doc),
  slug: 'damocles',
  storage: titleStorageKeys('damocles')
};
