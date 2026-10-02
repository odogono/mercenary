import type { ReadStorage, WriteStorage } from './storage.ts';

/// Bound both command recall and the transcript retained across page reloads.
export const CONSOLE_HISTORY_LIMIT = 400;

export interface ConsoleHistoryRecord {
  readonly commands: readonly string[];
  readonly scrollback: readonly string[];
}

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
