import { describe, expect, test } from 'bun:test';

import {
  CONSOLE_HISTORY_LIMIT,
  readConsoleHistory,
  writeConsoleHistory
} from '../src/shell/consoleHistory.ts';
import { CommandHistory } from '../src/shell/consoleView.ts';
import { titleStorageKeys } from '../src/shell/title.ts';

const key = titleStorageKeys('damocles').consoleHistory;
const empty = { commands: [], scrollback: [] };

describe('Shell Console history storage', () => {
  test('retains commands and their output independently for each Title', () => {
    const records = new Map<string, string>();
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value)
    };
    const history = {
      commands: ['HELP'],
      scrollback: ['] HELP', 'help · where · inventory']
    };
    writeConsoleHistory(storage, key, history);
    expect(readConsoleHistory(storage, key)).toEqual(history);
    expect(
      readConsoleHistory(storage, titleStorageKeys('targ').consoleHistory)
    ).toEqual(empty);
  });

  test('starts empty when storage is absent, unreadable or malformed', () => {
    expect(readConsoleHistory(undefined, key)).toEqual(empty);
    expect(
      readConsoleHistory(
        {
          getItem: () => {
            throw new Error('blocked');
          }
        },
        key
      )
    ).toEqual(empty);
    for (const raw of [
      null,
      '{',
      'null',
      '[]',
      '{}',
      '{"commands":[3],"scrollback":["output"]}'
    ]) {
      expect(readConsoleHistory({ getItem: () => raw }, key)).toEqual(empty);
    }
  });

  test('restores only the most recent bounded history', () => {
    const lines = Array.from(
      { length: CONSOLE_HISTORY_LIMIT + 2 },
      (_, i) => `${i}`
    );
    const history = readConsoleHistory(
      { getItem: () => JSON.stringify({ commands: lines, scrollback: lines }) },
      key
    );
    expect(history.commands).toEqual(lines.slice(2));
    expect(history.scrollback).toEqual(lines.slice(2));
    const recall = new CommandHistory(history.commands);
    expect(recall.earlier('')).toBe(lines.at(-1)!);
    expect(recall.later()).toBe('');
  });

  test('keeps command recall bounded as more commands are submitted', () => {
    const recall = new CommandHistory();
    for (let i = 0; i < CONSOLE_HISTORY_LIMIT + 2; i += 1) {
      recall.remember(`${i}`);
    }
    expect(recall.entries).toHaveLength(CONSOLE_HISTORY_LIMIT);
    expect(recall.entries[0]).toBe('2');
  });

  test('storage write failures do not prevent console use', () => {
    expect(() => writeConsoleHistory(undefined, key, empty)).not.toThrow();
    expect(() =>
      writeConsoleHistory(
        {
          setItem: () => {
            throw new Error('quota');
          }
        },
        key,
        empty
      )
    ).not.toThrow();
  });
});
