import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';

import {
  SYSTEM_STRING_SLOTS,
  findMessage,
  parseDamoclesStrings
} from '../src/damocles/strings.ts';

const payload = parseDamoclesStrings(
  await Bun.file('../payload/damocles/strings.json').json()
);

const tracked = async () =>
  (await Bun.file('../payload/damocles/strings.json').json()) as Record<
    string,
    unknown
  >;

describe('the tracked Damocles message strings', () => {
  test('carries the whole system string table and the whole inline message set', () => {
    expect(payload.systemStrings.entries).toHaveLength(SYSTEM_STRING_SLOTS);
    expect(payload.inlineMessages).toHaveLength(206);
    expect(payload.coverage.complete).toBe(false);
    expect(payload.source.run).toMatch(/^observe-first-world-/);
  });

  test('resolves the four message ids the limo-key contract names', () => {
    const response = [
      'script2-inline-1',
      'script2-inline-2',
      'script2-inline-3',
      'system-string-50'
    ].map(id => findMessage(payload, id));
    expect(response.map(entry => entry?.address)).toEqual([
      '0x07042a',
      '0x07045a',
      '0x070488',
      '0x0732a6'
    ]);
    for (const entry of response) {
      expect(entry?.text.length).toBeGreaterThan(0);
    }
  });

  test('holds the clearing line as a full-width run of spaces, not an empty record', () => {
    const clearing = findMessage(payload, 'system-string-50');
    expect(clearing?.text).toHaveLength(49);
    expect(clearing?.text.trim()).toBe('');
  });

  test('keeps each record padded exactly as the bank stores it', () => {
    const inline = findMessage(payload, 'script2-inline-1');
    expect(inline?.text.startsWith(' ')).toBe(true);
    expect(inline?.text).not.toBe(inline?.text.trim());
    expect(payload.statistics.inlineLengthMinimum).toBe(29);
    expect(payload.statistics.inlineLengthMaximum).toBe(48);
    expect(payload.statistics.systemStringLengthMaximum).toBe(49);
  });

  test('digests every record over its stored text', () => {
    const records = [
      ...payload.systemStrings.entries,
      ...payload.inlineMessages
    ];
    for (const entry of records) {
      expect(entry.sha256).toBe(
        createHash('sha256').update(entry.text, 'ascii').digest('hex')
      );
    }
    expect(records).toHaveLength(SYSTEM_STRING_SLOTS + 206);
  });

  test('records no unsupported or unresolved case', () => {
    expect(payload.encoding.terminator).toBe(0);
    expect(payload.encoding.unsupportedRecords).toBe(0);
    expect(payload.encoding.formattingCodes).toBe(0);
    expect(
      payload.indexedReferences.filter(entry => entry.target === null)
    ).toHaveLength(0);
    expect(
      payload.indexedReferences.every(
        entry => entry.target === 'system-string-50'
      )
    ).toBe(true);
  });

  test('shares one record between the slots whose pointers repeat', () => {
    const frozen = payload.systemStrings.entries.filter(
      entry => entry.address === '0x073162'
    );
    expect(frozen.length).toBeGreaterThan(1);
    expect(new Set(frozen.map(entry => entry.sha256)).size).toBe(1);
  });
});

describe('reading the Damocles message strings', () => {
  test('refuses an unsupported schema version', async () => {
    const document = { ...(await tracked()), schemaVersion: 2 };
    expect(() => parseDamoclesStrings(document)).toThrow('expected 1');
  });

  test('refuses a system string slot that is out of table order', async () => {
    const document = await tracked();
    const system = document['systemStrings'] as Record<string, unknown>;
    const entries = [...(system['entries'] as unknown[])];
    entries.reverse();
    expect(() =>
      parseDamoclesStrings({
        ...document,
        systemStrings: { ...system, entries }
      })
    ).toThrow('out of table order');
  });

  test('refuses a short system string table', async () => {
    const document = await tracked();
    const system = document['systemStrings'] as Record<string, unknown>;
    const entries = (system['entries'] as unknown[]).slice(0, 63);
    expect(() =>
      parseDamoclesStrings({
        ...document,
        systemStrings: { ...system, entries }
      })
    ).toThrow('expected 64 system string slots');
  });

  test('refuses an id that disagrees with its script and ordinal', async () => {
    const document = await tracked();
    const messages = [
      ...(document['inlineMessages'] as Record<string, unknown>[])
    ];
    messages[0] = { ...messages[0], id: 'script9-inline-1' };
    expect(() =>
      parseDamoclesStrings({ ...document, inlineMessages: messages })
    ).toThrow('does not name its script and ordinal');
  });

  test('refuses a gap in a script scope ordinals', async () => {
    const document = await tracked();
    const messages = (
      document['inlineMessages'] as Record<string, unknown>[]
    ).filter(message => message['id'] !== 'script2-inline-2');
    expect(() =>
      parseDamoclesStrings({ ...document, inlineMessages: messages })
    ).toThrow('skips ordinal 2');
  });

  test('refuses a record holding characters the bank cannot store', async () => {
    const document = await tracked();
    const messages = [
      ...(document['inlineMessages'] as Record<string, unknown>[])
    ];
    messages[0] = {
      ...messages[0],
      text: `PROCEED${String.fromCodePoint(1)}`
    };
    expect(() =>
      parseDamoclesStrings({ ...document, inlineMessages: messages })
    ).toThrow('outside printable ASCII');
  });

  test('refuses an indexed reference to a slot the table does not hold', async () => {
    const document = await tracked();
    const references = [
      ...(document['indexedReferences'] as Record<string, unknown>[])
    ];
    references[0] = { ...references[0], target: 'system-string-99' };
    expect(() =>
      parseDamoclesStrings({ ...document, indexedReferences: references })
    ).toThrow('unknown system-string-99');
  });

  test('refuses a malformed source digest', async () => {
    const document = await tracked();
    const source = document['source'] as Record<string, unknown>;
    expect(() =>
      parseDamoclesStrings({
        ...document,
        source: { ...source, ramSha256: 'not-a-digest' }
      })
    ).toThrow('invalid record digest');
  });
});
