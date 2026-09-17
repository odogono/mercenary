/// The Damocles Script bank's message text, extracted into the Data Payload by
/// `damocleslab.strings` (#304). Two forms share one document: the 64-slot system string
/// table at `$070000`, and the inline messages opcode `$01` carries in the bytecode.
///
/// Records are stored exactly as the bank holds them, padding included. The pool centres
/// each line within its field and that alignment is a presentation fact the message reveal
/// model (#307) reads, so trimming belongs to whatever presents a record, never here.

/// A record's payload identity. System strings are named by slot; inline messages by their
/// script and their ordinal within it, so Damocles Script slot 2's response is
/// `script2-inline-1` … `script2-inline-3` and its clearing line is `system-string-50`.
export type MessageId = string;

export interface SystemString {
  readonly address: string;
  readonly id: MessageId;
  readonly sha256: string;
  readonly slot: number;
  readonly text: string;
}

export interface InlineMessage {
  readonly address: string;
  readonly id: MessageId;
  readonly ordinal: number;
  /// The script scope the ordinal counts within: `script<slot>` for one of the 64 entry-table
  /// slots, `script<address>` for an entry the table does not name.
  readonly script: string;
  readonly scriptAddress: string;
  readonly sha256: string;
  readonly text: string;
}

export interface IndexedReference {
  readonly address: string;
  readonly operand: number;
  /// Null where the operand reaches the slot through the `$7A42` table instead of directly,
  /// which the extraction records rather than guesses.
  readonly target: MessageId | null;
}

export interface DamoclesStrings {
  readonly coverage: {
    readonly complete: boolean;
    readonly notes: readonly string[];
  };
  readonly encoding: {
    readonly alignment: 'word';
    readonly characterSet: 'ascii-printable';
    readonly formattingCodes: number;
    readonly note: string;
    readonly terminator: number;
    readonly unsupportedRecords: number;
  };
  readonly indexedReferences: readonly IndexedReference[];
  readonly inlineMessages: readonly InlineMessage[];
  readonly schemaVersion: 1;
  readonly source: {
    readonly authority: string;
    readonly evidence: string;
    readonly programSha256: string;
    readonly ramSha256: string;
    readonly run: string;
  };
  readonly statistics: {
    readonly inlineLengthMaximum: number;
    readonly inlineLengthMinimum: number;
    readonly systemStringLengthMaximum: number;
    readonly systemStringLengthMinimum: number;
  };
  readonly systemStrings: {
    readonly entries: readonly SystemString[];
    readonly poolEndAddress: string;
    readonly poolStartAddress: string;
    readonly scriptTableAddress: string;
    readonly slotCount: number;
    readonly tableAddress: string;
  };
  readonly title: 'Damocles';
}

/// The system string table the bank holds, and therefore the document, is exactly this wide.
export const SYSTEM_STRING_SLOTS = 64;

const fail = (message: string): never => {
  throw new Error(`Invalid Damocles strings: ${message}`);
};
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('expected a record');
  }
  return value as Record<string, unknown>;
};
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : fail('expected an array');
const string = (value: unknown): string =>
  typeof value === 'string' ? value : fail('expected text');
const strings = (value: unknown) => list(value).map(string);
const boolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : fail('expected a boolean');
const integer = (value: unknown): number => {
  const n = value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
    ? n
    : fail('expected a nonnegative integer');
};
const literal = <T extends number | string>(value: unknown, expected: T): T =>
  value === expected ? expected : fail(`expected ${expected}`);
const address = (value: unknown): string => {
  const text = string(value);
  return /^0x[\da-f]{6}$/.test(text) ? text : fail(`invalid address ${text}`);
};
const digest = (value: unknown): string => {
  const text = string(value);
  return /^[\da-f]{64}$/.test(text) ? text : fail('invalid record digest');
};

/// The extraction fails closed on anything outside printable ASCII, so a document carrying a
/// control code, a terminator or a non-ASCII character did not come from it. The bank's own
/// records go no further than `$5A`; that narrower observation is `encoding.note`, not a rule.
const record = (value: unknown): string => {
  const text = string(value);
  return /^[ -~]*$/.test(text)
    ? text
    : fail('record holds characters outside printable ASCII');
};

const uniqueIds = (ids: readonly string[]): Set<string> => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) {
      fail(`duplicate or empty identity ${id}`);
    }
    seen.add(id);
  }
  return seen;
};

export const parseDamoclesStrings = (value: unknown): DamoclesStrings => {
  const root = object(value);
  literal(root['schemaVersion'], 1);
  literal(root['title'], 'Damocles');

  const rawSource = object(root['source']);
  const source = {
    authority: string(rawSource['authority']),
    evidence: string(rawSource['evidence']),
    programSha256: digest(rawSource['programSha256']),
    ramSha256: digest(rawSource['ramSha256']),
    run: string(rawSource['run'])
  };

  const rawEncoding = object(root['encoding']);
  const encoding = {
    alignment: literal(rawEncoding['alignment'], 'word'),
    characterSet: literal(rawEncoding['characterSet'], 'ascii-printable'),
    formattingCodes: integer(rawEncoding['formattingCodes']),
    note: string(rawEncoding['note']),
    terminator: literal(rawEncoding['terminator'], 0),
    unsupportedRecords: integer(rawEncoding['unsupportedRecords'])
  } as const;

  const rawSystem = object(root['systemStrings']);
  const entries = list(rawSystem['entries']).map(
    (entry, index): SystemString => {
      const raw = object(entry);
      const slot = integer(raw['slot']);
      if (slot !== index) {
        fail(`system string slot ${slot} is out of table order`);
      }
      const id = string(raw['id']);
      if (id !== `system-string-${slot}`) {
        fail(`system string ${id} does not name its slot`);
      }
      return {
        address: address(raw['address']),
        id,
        sha256: digest(raw['sha256']),
        slot,
        text: record(raw['text'])
      };
    }
  );
  if (entries.length !== SYSTEM_STRING_SLOTS) {
    fail(`expected ${SYSTEM_STRING_SLOTS} system string slots`);
  }
  const slotIds = uniqueIds(entries.map(entry => entry.id));

  const inlineMessages = list(root['inlineMessages']).map(
    (entry): InlineMessage => {
      const raw = object(entry);
      const script = string(raw['script']);
      const ordinal = integer(raw['ordinal']);
      const id = string(raw['id']);
      if (!/^script(?:\d{1,2}|[\da-f]{6})$/.test(script)) {
        fail(`invalid script scope ${script}`);
      }
      if (ordinal < 1 || id !== `${script}-inline-${ordinal}`) {
        fail(`inline message ${id} does not name its script and ordinal`);
      }
      return {
        address: address(raw['address']),
        id,
        ordinal,
        script,
        scriptAddress: address(raw['scriptAddress']),
        sha256: digest(raw['sha256']),
        text: record(raw['text'])
      };
    }
  );
  uniqueIds(inlineMessages.map(message => message.id));

  // Ordinals count a scope's own records from 1 with no gaps, so a truncated or reordered
  // document is refused rather than silently renumbering the ids #300 depends on.
  const counted = new Map<string, number>();
  for (const message of inlineMessages) {
    const next = (counted.get(message.script) ?? 0) + 1;
    if (message.ordinal !== next) {
      fail(`script ${message.script} skips ordinal ${next}`);
    }
    counted.set(message.script, next);
  }

  const indexedReferences = list(root['indexedReferences']).map(
    (entry): IndexedReference => {
      const raw = object(entry);
      const target = raw['target'] === null ? null : string(raw['target']);
      if (target !== null && !slotIds.has(target)) {
        fail(`indexed reference names unknown ${target}`);
      }
      return {
        address: address(raw['address']),
        operand: integer(raw['operand']),
        target
      };
    }
  );

  const rawCoverage = object(root['coverage']);
  const rawStatistics = object(root['statistics']);
  return {
    coverage: {
      complete: boolean(rawCoverage['complete']),
      notes: strings(rawCoverage['notes'])
    },
    encoding,
    indexedReferences,
    inlineMessages,
    schemaVersion: 1,
    source,
    statistics: {
      inlineLengthMaximum: integer(rawStatistics['inlineLengthMaximum']),
      inlineLengthMinimum: integer(rawStatistics['inlineLengthMinimum']),
      systemStringLengthMaximum: integer(
        rawStatistics['systemStringLengthMaximum']
      ),
      systemStringLengthMinimum: integer(
        rawStatistics['systemStringLengthMinimum']
      )
    },
    systemStrings: {
      entries,
      poolEndAddress: address(rawSystem['poolEndAddress']),
      poolStartAddress: address(rawSystem['poolStartAddress']),
      scriptTableAddress: address(rawSystem['scriptTableAddress']),
      slotCount: literal(rawSystem['slotCount'], SYSTEM_STRING_SLOTS),
      tableAddress: address(rawSystem['tableAddress'])
    },
    title: 'Damocles'
  };
};

/// Look one record up by the id the payload names it with. Returns undefined rather than
/// throwing, so a caller decides whether a missing id is a programming error or a gap.
export const findMessage = (
  strings: DamoclesStrings,
  id: MessageId
): InlineMessage | SystemString | undefined =>
  strings.systemStrings.entries.find(entry => entry.id === id) ??
  strings.inlineMessages.find(message => message.id === id);
