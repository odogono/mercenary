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
  private readonly recent: string[] = [];

  constructor(limits: ReactionLimits = DEFAULT_REACTION_LIMITS) {
    for (const value of [limits.events, limits.fuel]) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError('Reaction limits must be positive safe integers');
      }
    }
    this.fuel = limits.fuel;
    this.events = limits.events;
  }

  remember(detail: string): void {
    this.recent.push(detail);
    if (this.recent.length > 8) {
      this.recent.shift();
    }
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

  deliver(detail: string): void {
    this.remember(detail);
    if (this.events-- <= 0) {
      this.exhausted('delivered events');
    }
  }

  exhausted(reason: string): never {
    throw new ReactionLimitError(
      `${reason}; recent work: ${this.recent.join('; ')}`
    );
  }
}
