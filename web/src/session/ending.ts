/// The public shape of an Ending, projected from the Host Callout's own byte.
///
/// The Reference Build spells the whole of this as one byte a Benson Script
/// writes — 0 while play continues, 1 once script 7's Escape is accepted, 255
/// once the terminal presentation has matured — and that byte stays private to
/// `BensonHostState`, because the symbol the scripts write through is spelled
/// `gameComplete` in the Data Payload and cannot be renamed without re-exporting
/// it. What the rest of the app reads is this projection instead: the identity
/// of the Ending and how far its presentation has got, as two things rather than
/// a number to compare against constants.
///
/// The combinations the configured build admits are a short list, so the list is
/// the type: active play carries no Ending, and an Escape carries one of exactly
/// two Ending Phases. There is no state here for "ended, phase 0" or "active,
/// phase 255", because the Reference Build has none.

/// How far an Ending's own presentation has got. The Reference Build's terminal
/// loop advances 1 to 255 from inside its colour sequence; nothing else moves it.
export type EndingPhase = 1 | 255;

export type EndingState =
  /// Play continues. No Ending has been reached, and none is pending.
  | { readonly kind: 'activePlay' }
  /// The one successful Ending, at the Ending Phase its presentation has reached.
  | { readonly kind: 'escape'; readonly phase: EndingPhase }
  /// The unsuccessful Ending the Reference Build recognises. Retained because the
  /// domain has two Endings, and produced by nothing: no crash, hostile hit,
  /// craft destruction, capture, or refusal reaches it.
  | { readonly kind: 'defeat' };

/// Read the Host Callout's Ending Phase byte as an Ending.
///
/// Throws on any other value. A byte outside the three the configured build
/// writes means the Host Callout has been driven somewhere the Reference Build
/// does not go, and a silently-invented state would be worse than a stop.
export const endingStateOf = (endingPhase: number): EndingState => {
  switch (endingPhase) {
    case 0:
      return { kind: 'activePlay' };
    case 1:
      return { kind: 'escape', phase: 1 };
    case 255:
      return { kind: 'escape', phase: 255 };
    default:
      throw new Error(`unsupported Ending Phase ${endingPhase}`);
  }
};
