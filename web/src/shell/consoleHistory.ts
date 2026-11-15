import {
  CONSOLE_HISTORY_LIMIT,
  type ConsoleHistoryRecord,
  type ConsolePersistence
} from './consoleView.ts';
import type { ReadStorage, WriteStorage } from './storage.ts';

export { CONSOLE_HISTORY_LIMIT, type ConsoleHistoryRecord };

const isLines = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(line => typeof line === 'string');

export const readConsoleHistory = (
  storage: ReadStorage | undefined,
  key: string
): ConsoleHistoryRecord => {
  try {
    const raw = storage?.getItem(key);
    const value: unknown = raw == null ? undefined : JSON.parse(raw);
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      if (isLines(record['commands']) && isLines(record['scrollback'])) {
        return {
          commands: record['commands'].slice(-CONSOLE_HISTORY_LIMIT),
          scrollback: record['scrollback'].slice(-CONSOLE_HISTORY_LIMIT)
        };
      }
    }
  } catch {
    // An unreadable history must never stop the Title from starting.
  }
  return { commands: [], scrollback: [] };
};

export const writeConsoleHistory = (
  storage: WriteStorage | undefined,
  key: string,
  history: ConsoleHistoryRecord
): void => {
  try {
    storage?.setItem(key, JSON.stringify(history));
  } catch {
    // The live console remains usable when browser storage is unavailable or full.
  }
};

/// A console's history kept in browser storage under one key.
export const storedConsoleHistory = (
  storage: (ReadStorage & WriteStorage) | undefined,
  key: string
): ConsolePersistence => ({
  read: () => readConsoleHistory(storage, key),
  write: history => {
    writeConsoleHistory(storage, key, history);
  }
});
