import type { DocumentMessageId } from './display.ts';

/// The documents the Head Commands read, extracted into the Data Payload by
/// `damocleslab.documents` (#598): the document rows of the Open table at `$04D2C4` and each
/// row's items from the bank at `$073500` (docs/research/damocles-head-commands.md).
///
/// Names and bodies are stored exactly as the bank holds them, padding included. A name is eight
/// characters wide and a body is lined up for the original's 48-cell message row, so trimming
/// belongs to whatever draws them.

export interface DocumentItem {
  readonly address: string;
  readonly body: string;
  readonly name: string;
}

export interface DamoclesDocument {
  readonly address: string;
  /// Colour 15, the centre box's ground, as ST `0RGB`.
  readonly colour15: number;
  /// Colour 3, the item name's field, as ST `0RGB`.
  readonly colour3: number;
  /// The Open table's index byte: a word offset into the bank's table, so always even.
  readonly index: number;
  readonly items: readonly DocumentItem[];
  readonly length: number;
  readonly openRow: string;
  readonly sha256: string;
  /// The resident object slot that opens it.
  readonly slot: number;
}

export interface DamoclesDocuments {
  readonly documents: readonly DamoclesDocument[];
  readonly schemaVersion: 1;
  readonly source: {
    readonly evidence: string;
    readonly programSha256: string;
    readonly ramSha256: string;
    readonly run: string;
  };
  readonly title: 'Damocles';
}

/// The 19 documents the Open table's mode-2 rows name.
export const DOCUMENT_COUNT = 19;
export const ITEM_NAME_LENGTH = 8;

const fail = (message: string): never => {
  throw new Error(`Invalid Damocles documents: ${message}`);
};
const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail('expected a record');
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : fail('expected an array');
const string = (value: unknown): string =>
  typeof value === 'string' ? value : fail('expected text');
const integer = (value: unknown, maximum: number): number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximum
    ? value
    : fail(`expected an integer up to ${maximum}`);
const address = (value: unknown): string => {
  const text = string(value);
  return /^0x[\da-f]{6}$/.test(text) ? text : fail(`invalid address ${text}`);
};
const digest = (value: unknown): string => {
  const text = string(value);
  return /^[\da-f]{64}$/.test(text) ? text : fail('invalid digest');
};
/// Three bits a channel: the ST's `0RGB`, not the STE's four.
const stColour = (value: unknown): number => {
  const word = integer(value, 0x7_77);
  return (word & ~0x7_77) === 0 ? word : fail('colour outside the ST 0RGB');
};
/// The message row's glyphs run from `$20` to `$5A`, and the extractor refuses anything else.
const glyphs = (value: unknown): string => {
  const text = string(value);
  return /^[ -Z]+$/.test(text) ? text : fail('text outside the row glyphs');
};

const itemOf = (value: unknown): DocumentItem => {
  const raw = object(value);
  const name = glyphs(raw['name']);
  if (name.length !== ITEM_NAME_LENGTH) {
    fail(`item name ${name} is not ${ITEM_NAME_LENGTH} characters`);
  }
  return {
    address: address(raw['address']),
    body: glyphs(raw['body']),
    name
  };
};

const documentOf = (value: unknown): DamoclesDocument => {
  const raw = object(value);
  const index = integer(raw['index'], 0xff);
  if (index % 2 !== 0) {
    fail(`document index ${index} is not a word offset`);
  }
  const items = list(raw['items']).map(itemOf);
  if (items.length === 0) {
    fail(`document ${index} has no items`);
  }
  return {
    address: address(raw['address']),
    colour15: stColour(raw['colour15']),
    colour3: stColour(raw['colour3']),
    index,
    items,
    length: integer(raw['length'], 0xff_ff),
    openRow: address(raw['openRow']),
    sha256: digest(raw['sha256']),
    slot: integer(raw['slot'], 0xff)
  };
};

export const parseDamoclesDocuments = (value: unknown): DamoclesDocuments => {
  const root = object(value);
  if (root['schemaVersion'] !== 1 || root['title'] !== 'Damocles') {
    fail('expected schema 1 for Damocles');
  }
  const rawSource = object(root['source']);
  const documents = list(root['documents']).map(documentOf);
  if (documents.length !== DOCUMENT_COUNT) {
    fail(`expected ${DOCUMENT_COUNT} documents`);
  }
  if (
    new Set(documents.map(document => document.slot)).size !==
      documents.length ||
    new Set(documents.map(document => document.index)).size !== documents.length
  ) {
    fail('two documents share an object or an index');
  }
  return {
    documents,
    schemaVersion: 1,
    source: {
      evidence: string(rawSource['evidence']),
      programSha256: digest(rawSource['programSha256']),
      ramSha256: digest(rawSource['ramSha256']),
      run: string(rawSource['run'])
    },
    title: 'Damocles'
  };
};

/// The document an object slot opens, or undefined where the Open table has no document row
/// for it.
export const documentFor = (
  documents: DamoclesDocuments,
  slot: number
): DamoclesDocument | undefined =>
  documents.documents.find(document => document.slot === slot);

/// The body a document message presents, or undefined where the documents hold no such item.
export const documentBody = (
  documents: DamoclesDocuments,
  id: DocumentMessageId
): string | undefined => {
  const [slot, item] = id.slice('document-'.length).split('-').map(Number);
  return documentFor(documents, slot!)?.items[item!]?.body;
};
