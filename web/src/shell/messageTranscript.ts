import type { BensonMessagePresentation } from '../benson/index.ts';
import type { SaveSlot } from './saves.ts';

/// Remember which complete occurrences have entered one page's transcript.
export class BensonMessageTranscript {
  private readonly printed = new WeakSet<object>();

  constructor(message?: BensonMessagePresentation) {
    // A complete occurrence restored into a new page predates that page's transcript and must
    // not be backfilled. An incomplete restored occurrence will cross the edge later and print.
    this.synchronize(message);
  }

  observe(message: BensonMessagePresentation | undefined): readonly string[] {
    if (
      message?.completedText === undefined ||
      this.printed.has(message.occurrence)
    ) {
      return [];
    }
    this.printed.add(message.occurrence);
    return [`BENSON · ${message.completedText}`];
  }

  synchronize(message: BensonMessagePresentation | undefined): void {
    if (message?.completedText !== undefined) {
      this.printed.add(message.occurrence);
    }
  }

  static loaded(slot: SaveSlot): readonly string[] {
    return [`— LOADED SLOT ${slot} —`];
  }

  static newGame(): readonly string[] {
    return ['— NEW GAME —'];
  }
}
