/// The Atari ST make codes of the keys a browser names, as the IKBD sends them and the input
/// poll writes them to `$7B61`. The prompts compare the latch with `Y` `$15`, `O` `$18` and
/// `N` `$31` (docs/research/damocles-first-offer.md). Every other key only replaces what was
/// latched, so a key the table lacks is one the latch never sees.

/// A run of keys whose make codes count up from `first`.
const run = (codes: readonly string[], first: number) =>
  codes.map((code, index) => [code, first + index] as const);

const letters = (row: string): readonly string[] =>
  [...row].map(letter => `Key${letter}`);

const MAKE_CODES: ReadonlyMap<string, number> = new Map([
  ...run(
    [
      ...[...'1234567890'].map(digit => `Digit${digit}`),
      'Minus',
      'Equal',
      'Backspace',
      'Tab'
    ],
    0x02
  ),
  ...run(
    [...letters('QWERTYUIOP'), 'BracketLeft', 'BracketRight', 'Enter'],
    0x10
  ),
  ...run([...letters('ASDFGHJKL'), 'Semicolon', 'Quote'], 0x1e),
  ...run([...letters('ZXCVBNM'), 'Comma', 'Period', 'Slash'], 0x2c),
  ...run(
    Array.from({ length: 10 }, (_, index) => `F${index + 1}`),
    0x3b
  ),
  ['Backslash', 0x2b],
  ['Space', 0x39],
  ['ArrowUp', 0x48],
  ['NumpadSubtract', 0x4a],
  ['ArrowLeft', 0x4b],
  ['ArrowRight', 0x4d],
  ['NumpadAdd', 0x4e],
  ['ArrowDown', 0x50],
  ['NumpadMultiply', 0x66],
  ['NumpadEnter', 0x72]
]);

export const stMakeCode = (code: string): number | undefined =>
  MAKE_CODES.get(code);
