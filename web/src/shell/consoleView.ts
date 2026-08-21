import {
  executeConsoleCommand,
  parseConsoleCommand,
  type ConsoleDeps
} from './console.ts';

/// How much transcript the console keeps.
///
/// A session left running for hours would otherwise grow the log without bound; nothing further
/// back than this is worth the memory it costs.
export const SCROLLBACK_LINES = 400;

/// Recall of what has been typed, in the order it was typed.
///
/// Held in memory only: a debug console's history is not worth a storage key, and the transcript
/// it produced is already on screen.
export class CommandHistory {
  private readonly lines: string[] = [];
  private cursor = 0;

  remember(line: string): void {
    this.lines.push(line);
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
}

const BANNER = [
  'benson shell console',
  'a development tool: type help for commands'
];

/// Own the Shell Console overlay.
///
/// It deliberately does not pause: the world runs while the console is open, so a command's effect
/// is visible in the panel the moment it is typed.
export const installConsole = (
  elements: ConsoleElements,
  deps: ConsoleDeps
): ShellConsole => {
  const history = new CommandHistory();
  let open = false;

  const print = (lines: readonly string[]): void => {
    for (const line of lines) {
      const entry = document.createElement('div');
      entry.textContent = line;
      elements.log.append(entry);
    }
    while (elements.log.childElementCount > SCROLLBACK_LINES) {
      elements.log.firstElementChild?.remove();
    }
    elements.log.scrollTop = elements.log.scrollHeight;
  };

  const run = (line: string): void => {
    print([`] ${line}`]);
    try {
      const command = parseConsoleCommand(line);
      if (command !== undefined) {
        print(executeConsoleCommand(command, deps));
      }
    } catch (error) {
      print([error instanceof Error ? error.message : String(error)]);
    }
  };

  const show = (next: boolean): void => {
    open = next;
    elements.surface.dataset['console'] = open ? 'open' : 'closed';
    if (open) {
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

  print(BANNER);
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
    }
  };
};
