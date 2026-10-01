import type { PayloadDocument } from '../shell/title.ts';
import {
  DION_DOCUMENTS,
  checkSameCapture,
  dionDocumentPath,
  readDionHeader,
  type DionDocumentKind,
  type DionSource
} from './documents.ts';
import {
  readDionMessages,
  readDionScripts,
  readDionService,
  readDionSound,
  type DionMessage,
  type DionScripts,
  type DionService,
  type DionSoundProgramme
} from './narrative.ts';
import { readDionPanelBody, type DionPanelDocument } from './panelDocument.ts';
import {
  DION_PRESENTATION_PATH,
  checkCoverage,
  readDionPresentation,
  type DionPresentation
} from './presentation.ts';
import { DionDocumentError } from './read.ts';
import { readDionWorldBody, type DionWorld } from './world.ts';

/// Everything the METIS Destination loads, validated against the pinned baseline.
export interface DionContent {
  /// SHA-256 over every document's served text, in a fixed order: the content a Save
  /// or Session Resume would continue (#344's rule, as Damocles applies it).
  readonly contentSha256: string;
  readonly messages: readonly DionMessage[];
  readonly panel: DionPanelDocument;
  readonly presentation: DionPresentation;
  readonly scripts: DionScripts;
  readonly service: DionService;
  readonly sound: readonly DionSoundProgramme[];
  readonly source: DionSource;
  readonly world: DionWorld;
}

const labelled = <T>(pathname: string, read: () => T): T => {
  try {
    return read();
  } catch (error) {
    throw new DionDocumentError(
      `${pathname}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const contentIdentity = async (
  texts: readonly string[]
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(texts.join('\u0000'))
  );
  return Array.from(new Uint8Array(digest), b =>
    b.toString(16).padStart(2, '0')
  ).join('');
};

/// Read the six payload documents and the authored presentation, refusing any that
/// belong to another Title or baseline, or that came from a different capture.
export const readDionContent = async (
  documents: ReadonlyMap<DionDocumentKind, PayloadDocument>,
  presentation: PayloadDocument
): Promise<DionContent> => {
  const headers = new Map<
    DionDocumentKind,
    ReturnType<typeof readDionHeader>
  >();
  for (const kind of DION_DOCUMENTS) {
    const document = documents.get(kind);
    if (document === undefined) {
      throw new DionDocumentError(`${dionDocumentPath(kind)} was not loaded`);
    }
    headers.set(
      kind,
      labelled(dionDocumentPath(kind), () =>
        readDionHeader(document.value, kind)
      )
    );
  }
  labelled(DION_PAYLOAD_LABEL, () =>
    checkSameCapture(
      new Map([...headers].map(([kind, header]) => [kind, header.source]))
    )
  );
  const body = (kind: DionDocumentKind) => headers.get(kind)!.body;
  const source = headers.get('world')!.source;
  const world = labelled(dionDocumentPath('world'), () =>
    readDionWorldBody(body('world'), source)
  );
  const panel = labelled(dionDocumentPath('panel'), () =>
    readDionPanelBody(body('panel'))
  );
  const messages = labelled(dionDocumentPath('messages'), () =>
    readDionMessages(body('messages'), 'messages')
  );
  const scripts = labelled(dionDocumentPath('scripts'), () =>
    readDionScripts(body('scripts'), 'scripts')
  );
  const sound = labelled(dionDocumentPath('sound'), () =>
    readDionSound(body('sound'), 'sound')
  );
  const service = labelled(dionDocumentPath('service'), () =>
    readDionService(body('service'), 'service')
  );
  const authored = labelled(DION_PRESENTATION_PATH, () =>
    readDionPresentation(presentation.value)
  );
  labelled(DION_PRESENTATION_PATH, () =>
    checkCoverage(
      authored,
      Object.fromEntries(DION_DOCUMENTS.map(kind => [kind, body(kind)]))
    )
  );
  return {
    contentSha256: await contentIdentity([
      ...DION_DOCUMENTS.map(kind => documents.get(kind)!.text),
      presentation.text
    ]),
    messages,
    panel,
    presentation: authored,
    scripts,
    service,
    sound,
    source,
    world
  };
};

const DION_PAYLOAD_LABEL = '/payload/dion';

/// Fetch and read the Destination's documents.
export const loadDionContent = async (
  fetch: (pathname: string) => Promise<PayloadDocument>
): Promise<DionContent> => {
  const [presentation, ...loaded] = await Promise.all([
    fetch(DION_PRESENTATION_PATH),
    ...DION_DOCUMENTS.map(kind => fetch(dionDocumentPath(kind)))
  ]);
  return readDionContent(
    new Map(DION_DOCUMENTS.map((kind, index) => [kind, loaded[index]!])),
    presentation!
  );
};
