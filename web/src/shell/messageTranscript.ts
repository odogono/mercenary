import type { CompletedBensonMessage } from '../benson/session.ts';
import type { SaveSlot } from './saves.ts';

/// Remember which completed message occurrences have already entered one page's transcript.
///
/// Identity, not text, is the discriminator: Benson may legitimately say the same words twice.
/// A WeakSet avoids turning the transcript observer into a second owner of old message tickers.
export class BensonMessageTranscript {
  private readonly printed = new WeakSet<object>();

  observe(message: CompletedBensonMessage | undefined): readonly string[] {
    if (message === undefined || this.printed.has(message.occurrence)) {
      return [];
    }
    this.printed.add(message.occurrence);
    return [`BENSON · ${message.text}`];
  }

  static loaded(slot: SaveSlot): readonly string[] {
    return [`— LOADED SLOT ${slot} —`];
  }

  static newGame(): readonly string[] {
    return ['— NEW GAME —'];
  }
}
