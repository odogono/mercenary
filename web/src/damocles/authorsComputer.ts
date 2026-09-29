/// The AUTHORS COMPUTER's options (#628, docs/research/damocles-endgame.md, answer 3).
///
/// Five options, each a value and a maximum in the records at `$7C8C`. The option in hand is
/// `$786C` and its value `$786E`. A digit only selects an option: `$04D576` saves the old value to
/// its record and loads the new one. `+` and `-` step the value by one, clamp it to 0 and the
/// option's maximum, save it, and apply it through the option's handler (`$04D5AE`). `*` acts
/// only in option 4, where it destroys Body number value through the dispatcher.
///
/// The session keeps the records; the value in hand always equals its option's record, because
/// every step saves it at once.

export interface AuthorsComputer {
  /// `$786C`, 0 to 4.
  readonly option: number;
  /// The value words of the five records at `$7C8C`.
  readonly values: readonly number[];
}

/// The records' maximum words, which nothing writes: 511, 511, 10, 10 and 29.
export const OPTION_MAXIMA: readonly number[] = [0x1_ff, 0x1_ff, 10, 10, 29];

/// The records as every memstate and the pinned first world hold them: 327, 139, 8, 6 and 0.
export const initialAuthorsComputer = (): AuthorsComputer => ({
  option: 0,
  values: [0x1_47, 0x8b, 8, 6, 0]
});

/// The option that destroys a Body with `*`.
export const DESTROY_OPTION = 4;

/// `$04D5DA` and `$04D5E8` XOR the value with these before spreading it into a mask.
const PALETTE_KEY = 0x1_47;
const PANEL_KEY = 0x8b;

/// `$04D684`: a 9-bit value's three 3-bit fields moved into ST `0RGB` nibbles.
export const spread = (value: number): number => {
  const low = value + (value & 0x1_f8);
  return (low + (low & 0x3_80)) & 0xff_ff;
};

/// What an option's handler writes, as the session applies it.
export type OptionEffect =
  | { readonly kind: 'clock-level'; readonly level: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'palette-mask'; readonly mask: number }
  | { readonly kind: 'panel-mask'; readonly mask: number }
  | { readonly exponent: number; readonly kind: 'view-exponent' };

/// `$04D5AE`'s handler for `option` at `value`.
export const optionEffect = (option: number, value: number): OptionEffect => {
  switch (option) {
    case 0:
      // `$7A50`, the world palette mask, as BOOK page 6.
      return { kind: 'palette-mask', mask: spread(value ^ PALETTE_KEY) };
    case 1:
      // `$7A52`, the Benson Panel's palette mask.
      return { kind: 'panel-mask', mask: spread(value ^ PANEL_KEY) };
    case 2:
      // `$7964`'s high word, the projection's scale exponent.
      return { exponent: value, kind: 'view-exponent' };
    case 3:
      // `$04D612`, the clock rate level, as BOOK page 4.
      return { kind: 'clock-level', level: value };
    default:
      return { kind: 'none' };
  }
};

/// The value in hand.
export const optionValue = (computer: AuthorsComputer): number =>
  computer.values[computer.option]!;

/// `+` (`$04D506`) or `-` (`$04D538`): the stepped value, clamped and saved.
export const stepOption = (
  computer: AuthorsComputer,
  delta: 1 | -1
): AuthorsComputer => {
  const value = Math.min(
    OPTION_MAXIMA[computer.option]!,
    Math.max(0, optionValue(computer) + delta)
  );
  return {
    ...computer,
    values: computer.values.map((item, index) =>
      index === computer.option ? value : item
    )
  };
};

/// A keypad digit (`$04D562`): 0 to 4 select an option, and a higher digit does nothing.
export const selectOption = (
  computer: AuthorsComputer,
  digit: number
): AuthorsComputer | null =>
  digit >= 0 && digit <= DESTROY_OPTION ? { ...computer, option: digit } : null;
