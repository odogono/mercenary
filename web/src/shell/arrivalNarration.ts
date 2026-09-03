/// What Benson says on the way down, before the opening script has anything to say.
///
/// The opening Benson Script starts at "CRASH IMMINENT," — the last ten seconds of a sequence
/// that, in the original releases, ran for about a minute. Everything before it was in the part
/// of the intro the Reference Build's crack stripped (`notes/decode/benson-scripts.md`), so it
/// is not in the Data Payload and cannot be: these lines are authored Arrival Narration, quoted
/// from the original releases and played by the Browser Shell (ADR 0032).
///
/// They are deliberately *not* Benson Messages. Nothing here reaches the interpreter, the Host
/// Callout or the message transcript; the Arrival borrows the message line the way a shell notice
/// does, and hands it back the moment the opening script has its own first word.

export interface NarrationItem {
  /// Multiplies the settings' hold for this line alone. The countdown wants to be read at a
  /// count's pace rather than a sentence's.
  readonly holdScale?: number;
  readonly text: string;
}

/// The panel's own title card, letter-spaced as the original's message window shows it.
export const ARRIVAL_TITLE = 'M E R C E N A R Y';

export const ARRIVAL_NARRATION: readonly NarrationItem[] = [
  { text: 'NOVADRIVE COUNTDOWN' },
  { holdScale: 0.35, text: '3' },
  { holdScale: 0.35, text: '2' },
  { holdScale: 0.35, text: '1' },
  { holdScale: 0.35, text: '0' },
  { text: 'NOVADRIVE ENGAGED' },
  { text: 'PRESTINIUM ON COURSE' },
  { text: 'DESTINATION-GAMMA FIVE' },
  { text: 'DAMAGE CONTROL REPORT' },
  { text: 'SOME CONFLICT DAMAGE' },
  { text: 'CHECKING' },
  { text: 'EMERGENCY!' },
  { text: 'GUIDANCE SYSTEM FAULT' },
  { text: 'COLLISION COURSE' },
  { text: 'DISENGAGING NOVADRIVE' },
  { text: 'UNABLE TO CORRECT' },
  { text: 'MAXIMUM REVERSE THRUST' }
];

/// The line Targ first appears on: the Novadrive comes off and the planet is suddenly there,
/// a dot in the middle of the field that grows until it is the whole screen.
export const PLANET_APPROACH_LINE = ARRIVAL_NARRATION.findIndex(
  item => item.text === 'DISENGAGING NOVADRIVE'
);

/// The line the world renderer takes over on. From here the view is Targ's own surface, seen
/// from a camera the session is not standing in, and the readouts stop being asterisks.
export const DESCENT_LINE = ARRIVAL_NARRATION.findIndex(
  item => item.text === 'UNABLE TO CORRECT'
);
