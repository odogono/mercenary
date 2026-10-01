import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readDionContent, type DionContent } from '../src/dion/content.ts';
import {
  DION_DOCUMENTS,
  type DionDocumentKind
} from '../src/dion/documents.ts';
import type { PayloadDocument } from '../src/shell/title.ts';

/// The tracked Mercenary III documents, read from disk as the dev server serves them.
const ROOT = join(import.meta.dir, '..', '..');

const document = (path: string): PayloadDocument => {
  const text = readFileSync(join(ROOT, path), 'utf8');
  return { text, value: JSON.parse(text) };
};

export const dionPayload = (): Map<DionDocumentKind, PayloadDocument> =>
  new Map(
    DION_DOCUMENTS.map(kind => [kind, document(`payload/dion/${kind}.json`)])
  );

export const dionPresentationDocument = (): PayloadDocument =>
  document('web/dion/metis.json');

/// A document with the value at each dotted path replaced, its text to match. A
/// replacement of `undefined` removes the key; `[]` paths name list indices.
export const edited = (
  source: PayloadDocument,
  changes: Readonly<Record<string, unknown>>
): PayloadDocument => {
  const value = structuredClone(source.value) as Record<string, unknown>;
  for (const [path, replacement] of Object.entries(changes)) {
    const steps = path.split('.');
    let cursor = value as Record<string, unknown>;
    for (const step of steps.slice(0, -1)) {
      cursor = cursor[step] as Record<string, unknown>;
    }
    const last = steps.at(-1)!;
    if (replacement === undefined) {
      delete cursor[last];
    } else {
      cursor[last] = replacement;
    }
  }
  return { text: JSON.stringify(value), value };
};

let cached: Promise<DionContent> | undefined;

export const dionContent = (): Promise<DionContent> => {
  cached ??= readDionContent(dionPayload(), dionPresentationDocument());
  return cached;
};
