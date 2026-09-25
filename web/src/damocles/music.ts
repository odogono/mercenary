/// The GHETTOBLASTER's tune, extracted into the Data Payload by `damocleslab.music` (#514):
/// the three voice streams the player at `$033F6A` reads and the volume and pitch tables they
/// walk (docs/research/damocles-sound-programmes.md#the-music-player).
///
/// The document holds data only. Which voice drives which channel, and the order the player
/// writes the chip in, are the player's own code facts, and `psg.ts` states them.

export const DAMOCLES_MUSIC_PATH = '/payload/damocles/music.json';

export type MusicOp =
  | { readonly op: 'note'; readonly period: number; readonly vbls: number }
  | { readonly op: 'pitch' | 'volume'; readonly table: number };

export interface MusicVoice {
  readonly address: string;
  /// The op the voice's closing jump lands on.
  readonly loop: number;
  readonly loopVbls: number;
  readonly notes: number;
  readonly ops: readonly MusicOp[];
  readonly sha256: string;
  readonly sourceEnd: string;
}

/// One (count, value) table as `$033F96` walks it: `loop` is the entry a `$80` marker jumps
/// to, or null where a zero count ends the table and the last value holds.
export interface MusicTable {
  readonly address: string;
  readonly entries: readonly (readonly [count: number, value: number])[];
  readonly index: number;
  readonly loop: number | null;
}

export interface DamoclesMusic {
  /// The eight bytes at address 0 the capture's machine held: its TOS ROM header. A voice
  /// with no table walks them, and the player writes byte 1 as the noise period.
  readonly addressZero: {
    readonly bytes: readonly number[];
    readonly note: string;
  };
  readonly coverage: {
    readonly complete: boolean;
    readonly notes: readonly string[];
  };
  readonly loopVbls: number;
  readonly pitchTables: readonly MusicTable[];
  readonly player: string;
  readonly schemaVersion: 1;
  readonly source: {
    readonly authority: string;
    readonly evidence: string;
    readonly programSha256: string;
    readonly ramSha256: string;
    readonly run: string;
    readonly tosSha256: string;
  };
  readonly title: 'Damocles';
  readonly voices: readonly MusicVoice[];
  readonly volumeTables: readonly MusicTable[];
}

const fail = (message: string): never => {
  throw new Error(`Invalid Damocles music: ${message}`);
};
const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail('expected a record');
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : fail('expected an array');
const string = (value: unknown): string =>
  typeof value === 'string' ? value : fail('expected text');
const integer = (value: unknown, low: number, high: number): number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= low &&
  value <= high
    ? value
    : fail(`expected an integer in ${low}..${high}`);
const literal = <T extends number | string>(value: unknown, expected: T): T =>
  value === expected ? expected : fail(`expected ${expected}`);
const address = (value: unknown): string => {
  const text = string(value);
  return /^0x[\da-f]{6}$/.test(text) ? text : fail(`invalid address ${text}`);
};
const digest = (value: unknown): string => {
  const text = string(value);
  return /^[\da-f]{64}$/.test(text) ? text : fail('invalid digest');
};

const table = (value: unknown): MusicTable => {
  const raw = object(value);
  const entries = list(raw['entries']).map(entry => {
    const pair = list(entry);
    if (pair.length !== 2) {
      fail('a table entry is a (count, value) pair');
    }
    // A count of zero ends a table and $80 and up is a jump, so an entry's count is 1..$7F.
    return [integer(pair[0], 1, 0x7f), integer(pair[1], -128, 127)] as const;
  });
  if (entries.length === 0) {
    fail('an empty table');
  }
  const loop =
    raw['loop'] === null ? null : integer(raw['loop'], 0, entries.length - 1);
  return {
    address: address(raw['address']),
    entries,
    index: integer(raw['index'], 1, 255),
    loop
  };
};

const op = (value: unknown): MusicOp => {
  const raw = object(value);
  switch (raw['op']) {
    case 'note':
      // A byte d ≥ 3 starts a note of d − 2 VBLs.
      return {
        op: 'note',
        period: integer(raw['period'], 0, 0xff_ff),
        vbls: integer(raw['vbls'], 1, 253)
      };
    case 'pitch':
    case 'volume':
      return { op: raw['op'], table: integer(raw['table'], 0, 255) };
    default:
      return fail(`unknown op ${String(raw['op'])}`);
  }
};

export const parseDamoclesMusic = (value: unknown): DamoclesMusic => {
  const root = object(value);
  literal(root['schemaVersion'], 1);
  literal(root['title'], 'Damocles');
  const rawSource = object(root['source']);
  const rawZero = object(root['addressZero']);
  const bytes = list(rawZero['bytes']).map(byte => integer(byte, 0, 255));
  if (bytes.length !== 8) {
    fail('addressZero holds eight bytes');
  }
  const volumeTables = list(root['volumeTables']).map(table);
  const pitchTables = list(root['pitchTables']).map(table);
  const loopVbls = integer(root['loopVbls'], 1, 0xff_ff);
  const known = {
    pitch: new Set([0, ...pitchTables.map(t => t.index)]),
    volume: new Set([0, ...volumeTables.map(t => t.index)])
  };
  const voices = list(root['voices']).map((entry): MusicVoice => {
    const raw = object(entry);
    const ops = list(raw['ops']).map(op);
    const loop = integer(raw['loop'], 0, ops.length - 1);
    for (const each of ops) {
      if (each.op !== 'note' && !known[each.op].has(each.table)) {
        fail(`${each.op} table ${each.table} is not in the document`);
      }
    }
    const notes = ops.filter(each => each.op === 'note');
    const looped = ops
      .slice(loop)
      .reduce((sum, each) => sum + (each.op === 'note' ? each.vbls : 0), 0);
    if (
      looped !== integer(raw['loopVbls'], 1, 0xff_ff) ||
      looped !== loopVbls
    ) {
      fail('a voice does not loop in the document loop');
    }
    if (notes.length !== integer(raw['notes'], 1, 0xff_ff)) {
      fail('a voice note count does not match its ops');
    }
    return {
      address: address(raw['address']),
      loop,
      loopVbls: looped,
      notes: notes.length,
      ops,
      sha256: digest(raw['sha256']),
      sourceEnd: address(raw['sourceEnd'])
    };
  });
  if (voices.length !== 3) {
    fail('the player has three voices');
  }
  const coverage = object(root['coverage']);
  return {
    addressZero: { bytes, note: string(rawZero['note']) },
    coverage: {
      complete: coverage['complete'] === true,
      notes: list(coverage['notes']).map(string)
    },
    loopVbls,
    pitchTables,
    player: address(root['player']),
    schemaVersion: 1,
    source: {
      authority: string(rawSource['authority']),
      evidence: string(rawSource['evidence']),
      programSha256: digest(rawSource['programSha256']),
      ramSha256: digest(rawSource['ramSha256']),
      run: string(rawSource['run']),
      tosSha256: digest(rawSource['tosSha256'])
    },
    title: 'Damocles',
    voices,
    volumeTables
  };
};
