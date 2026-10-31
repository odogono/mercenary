/// One deterministic allowance for a complete chain of Talk reactions (ADR 0085).
/// Per-Run limits cannot stop scripts that repeatedly start fresh Runs.
export interface ReactionLimits {
  readonly events: number;
  readonly fuel: number;
}

export const DEFAULT_REACTION_LIMITS: ReactionLimits = {
  events: 4096,
  fuel: 1_000_000
};

const RECENT_EVENTS = 8;

export class ReactionLimitError extends Error {
  constructor(detail: string) {
    super(
      `Talk reactions stopped: ${detail}. Load a Save or start a New Game.`
    );
    this.name = 'ReactionLimitError';
  }
}

export class ReactionBudget {
  private fuel: number;
  private events: number;
  /// The scripts whose Runs this step has taken, for the diagnostic.
  private readonly scripts = new Set<string>();
  /// The last few delivered events, formatted only if the budget runs out.
  private readonly recent: unknown[] = [];

  constructor(limits: ReactionLimits = DEFAULT_REACTION_LIMITS) {
    for (const value of [limits.events, limits.fuel]) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError('Reaction limits must be positive safe integers');
      }
    }
    this.fuel = limits.fuel;
    this.events = limits.events;
  }

  ran(script: string): void {
    this.scripts.add(script);
  }

  get fuelLeft(): number {
    if (this.fuel <= 0) {
      this.exhausted('execution fuel');
    }
    return this.fuel;
  }

  spendFuel(amount: number): void {
    this.fuel -= amount;
  }

  deliver(event: unknown): void {
    this.recent.push(event);
    if (this.recent.length > RECENT_EVENTS) {
      this.recent.shift();
    }
    if (this.events-- <= 0) {
      this.exhausted('delivered events');
    }
  }

  exhausted(reason: string): never {
    const scripts = [...this.scripts].join(', ') || 'none';
    const events = this.recent.map(event => JSON.stringify(event)).join('; ');
    throw new ReactionLimitError(
      `${reason}; scripts that ran: ${scripts}; recent events: ${events || 'none'}`
    );
  }
}
