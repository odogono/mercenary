import {
  RESERVED_CODES,
  SKIP_MESSAGE_CODE,
  browserChord,
  type BrowserKey
} from './input.ts';

/// A key press as the router sees it.
///
/// The Control Profile identifies keys by physical `code` alone. The router additionally
/// consults the printed `key`, because the console key's glyph moves between physical codes
/// across keyboard layouts.
export interface RoutedKey extends BrowserKey {
  readonly key?: string;
}

/// Which Browser Shell chrome currently owns the keyboard.
///
/// `none` means the Game Surface has it. Anything else is an open overlay whose own controls
/// must swallow keys rather than let them reach Movement Intent.
export type ShellLayer = 'none' | 'menu' | 'ownership' | 'settings' | 'saves';

/// Which authored opening currently holds the Game Surface's keys, if any.
///
/// The game is not yet the player's to move during either opening, so each answers only its own
/// keys: the carousel takes the keys that commit a Destination (ADR 0040), the journey takes
/// none — it is hurried by its Skip control, never by a key — and the Arrival takes only the key
/// that skips it (ADR 0032).
export type OpeningHold = 'arrival' | 'carousel' | 'journey' | 'none';

export interface RouterState {
  /// Whether a form control inside shell chrome currently holds focus.
  readonly chromeFocus: boolean;
  /// Whether the Shell Console is down. Independent of `layer`: the console opens over an
  /// open overlay rather than replacing it.
  readonly console: 'open' | 'closed';
  readonly layer: ShellLayer;
  readonly opening: OpeningHold;
}

/// Where one key press belongs.
///
/// `browser` keeps the browser's own chord behaviour; `chrome` gives the key to whichever
/// overlay or form control owns it; `opening` is a key the Departure's carousel acts on; `game`
/// is the only route that reaches the Control Profile.
export type KeyRoute =
  | 'browser'
  | 'chrome'
  | 'console-toggle'
  | 'escape'
  | 'game'
  | 'opening'
  | 'opening-held';

/// The keys that commit the carousel's Destination. Space is among them because it is the one
/// key the whole opening answers to: it hurries Benson, it skips the Arrival, and from deep space
/// it commits.
const COMMIT_CODES: ReadonlySet<string> = new Set([
  'Enter',
  'NumpadEnter',
  SKIP_MESSAGE_CODE
]);

/// Recognise the console key across keyboard layouts.
///
/// The reserved code comes from the Control Profile, so the two cannot disagree about which key
/// the shell keeps. Layouts that print the glyph on another physical key are honoured through
/// `key` rather than by reserving more codes: a code like `IntlBackslash` carries an unrelated
/// glyph on ISO layouts and must keep it.
const consoleKey = (key: RoutedKey): boolean =>
  RESERVED_CODES.has(key.code) || key.key === '`';

/// Whether any shell chrome currently holds the keyboard away from the Game Surface.
export const chromeHasKeyboard = (state: RouterState): boolean =>
  state.console === 'open' || state.layer !== 'none' || state.chromeFocus;

/// Decide where one key press goes, without touching the DOM.
///
/// Order matters and is the whole point of this function:
/// browser-reserved chords first, so no shell feature can swallow them; then the console key,
/// which would otherwise be consumed as an ordinary Control Profile code; then Escape, which
/// drives the layer stack; then anything typed while chrome owns the keyboard; then whichever
/// opening is presenting, which keeps only its own keys; and only then the Game Surface.
///
/// The openings come last of the four so the System Menu and the Shell Console stay reachable
/// throughout them: an opening the player cannot get out of is a worse opening than one they can
/// skip.
export const routeKey = (state: RouterState, key: RoutedKey): KeyRoute => {
  if (browserChord(key)) {
    return 'browser';
  }
  if (consoleKey(key)) {
    return key.repeat || state.layer === 'ownership'
      ? 'chrome'
      : 'console-toggle';
  }
  if (key.code === 'Escape') {
    return key.repeat ? 'chrome' : 'escape';
  }
  if (chromeHasKeyboard(state)) {
    return 'chrome';
  }
  switch (state.opening) {
    case 'carousel':
      return COMMIT_CODES.has(key.code) && !key.repeat
        ? 'opening'
        : 'opening-held';
    case 'journey':
      return 'opening-held';
    case 'arrival':
      return key.code === SKIP_MESSAGE_CODE ? 'game' : 'opening-held';
    case 'none':
      return 'game';
  }
};
