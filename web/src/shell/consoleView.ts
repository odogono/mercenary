import {
  parseConsoleCommand,
  type ConsoleCommand,
  type ConsoleParseContext
} from './console.ts';
import {
  CONSOLE_HISTORY_LIMIT,
  readConsoleHistory,
  writeConsoleHistory
} from './consoleHistory.ts';
import type { ReadStorage, WriteStorage } from './storage.ts';

/// How much transcript the console keeps.
///
/// A session left running for hours would otherwise grow the log without bound; nothing further
/// back than this is worth the memory it costs.
export const SCROLLBACK_LINES = CONSOLE_HISTORY_LIMIT;

/// Recall of what has been typed, in the order it was typed.
///
/// Restoring command recall never executes the commands again.
export class CommandHistory {
  private readonly lines: string[];
  private cursor: number;

  constructor(lines: readonly string[] = []) {
    this.lines = lines.slice(-CONSOLE_HISTORY_LIMIT);
    this.cursor = this.lines.length;
  }

  get entries(): readonly string[] {
    return this.lines;
  }

  remember(line: string): void {
    this.lines.push(line);
    if (this.lines.length > CONSOLE_HISTORY_LIMIT) {
      this.lines.shift();
    }
    this.cursor = this.lines.length;
  }

  /// The previous line, or the current one when there is nothing older.
  earlier(current: string): string {
    if (this.cursor === 0) {
      return current;
    }
    this.cursor -= 1;
    return this.lines[this.cursor] ?? current;
  }

  /// The next line, or an empty line once past the newest.
  later(): string {
    if (this.cursor >= this.lines.length - 1) {
      this.cursor = this.lines.length;
      return '';
    }
    this.cursor += 1;
    return this.lines[this.cursor] ?? '';
  }
}

export interface ConsoleElements {
  readonly input: HTMLInputElement;
  readonly log: HTMLElement;
  readonly surface: HTMLElement;
}

export interface ShellConsole {
  readonly close: () => void;
  readonly isOpen: () => boolean;
  readonly toggle: () => void;
  readonly write: (lines: readonly string[]) => void;
}

export interface ConsoleViewOptions<Deps extends ConsoleParseContext> {
  readonly banner?: readonly string[];
  readonly execute: (command: ConsoleCommand, deps: Deps) => readonly string[];
  readonly persistence?: {
    readonly key: string;
    readonly storage: (ReadStorage & WriteStorage) | undefined;
  };
}

const DEFAULT_BANNER = [
  'benson shell console',
  'a development tool: type help for commands'
];

/// Own the Shell Console overlay.
///
/// It deliberately does not pause: the world runs while the console is open, so a command's effect
/// is visible in the panel the moment it is typed. `release` empties held input, exactly as any
/// other layer opening does.
export const installConsole = <Deps extends ConsoleParseContext>(
  elements: ConsoleElements,
  deps: Deps,
  release: () => void,
  options: ConsoleViewOptions<Deps>
): ShellConsole => {
  const persistence = options.persistence;
  const stored =
    persistence === undefined
      ? { commands: [], scrollback: [] }
      : readConsoleHistory(persistence.storage, persistence.key);
  const history = new CommandHistory(stored.commands);
  const scrollback: string[] = [];
  let open = false;
  const execute = options.execute;
  const banner = options.banner ?? DEFAULT_BANNER;

  const print = (lines: readonly string[]): void => {
    if (lines.length === 0) {
      return;
    }
    for (const line of lines) {
      scrollback.push(line);
      const entry = document.createElement('div');
      entry.textContent = line;
      elements.log.append(entry);
    }
    while (elements.log.childElementCount > SCROLLBACK_LINES) {
      elements.log.firstElementChild?.remove();
    }
    scrollback.splice(0, Math.max(0, scrollback.length - SCROLLBACK_LINES));
    elements.log.scrollTop = elements.log.scrollHeight;
    if (persistence !== undefined) {
      writeConsoleHistory(persistence.storage, persistence.key, {
        commands: history.entries,
        scrollback
      });
    }
  };

  const run = (line: string): void => {
    print([`] ${line}`]);
    try {
      const command = parseConsoleCommand(
        line,
        deps.cellsPerAxis(),
        deps.objectSlots(),
        deps.objectActions?.() ?? 'named'
      );
      if (command !== undefined) {
        print(execute(command, deps));
      }
    } catch (error) {
      print([error instanceof Error ? error.message : String(error)]);
    }
  };

  const show = (next: boolean): void => {
    open = next;
    elements.surface.dataset['console'] = open ? 'open' : 'closed';
    if (open) {
      // The console owns the keyboard while it is down, so a key held as it opened must not
      // still be held when play resumes.
      release();
      elements.input.focus();
    } else {
      elements.input.blur();
    }
  };

  elements.input.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key === 'Enter') {
      const line = elements.input.value.trim();
      elements.input.value = '';
      if (line !== '') {
        history.remember(line);
        run(line);
      }
      event.preventDefault();
      return;
    }
    // The arrows recall history here rather than reaching the Control Profile, which is what a
    // focused control is for; the router already keeps them out of Movement Intent.
    if (event.key === 'ArrowUp') {
      elements.input.value = history.earlier(elements.input.value);
      event.preventDefault();
    } else if (event.key === 'ArrowDown') {
      elements.input.value = history.later();
      event.preventDefault();
    }
  });

  print(stored.scrollback.length > 0 ? stored.scrollback : banner);
  show(false);
  return {
    close: () => {
      if (open) {
        show(false);
      }
    },
    isOpen: () => open,
    toggle: () => {
      show(!open);
    },
    write: print
  };
};
