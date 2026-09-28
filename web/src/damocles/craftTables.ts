/// The craft pass's log table, regenerated rather than carried (ADR 0051).
///
/// A product in the craft pass is a table add: each mantissa word is replaced by the word at
/// `$64000` plus the signed mantissa, which is `log2(|m| / $1000)` as a twelve-bit fraction in
/// the top twelve bits, capped below 1.0, with bit 0 the mantissa's sign. The rule reproduces
/// the image's table word for word. No entry falls within 2×10⁻⁴ of a rounding tie, so any
/// `Math.log2` gives the same table. The exponent and sine tables are not regenerable and come
/// from the Catalogue.

/// The first and last mantissas the table serves: `$E000` (−2.0) to `$2000`. A sum in the range
/// scan can leave the unnormalised `$2000` (#558), which reads the word just past the table,
/// `$66000` = `$FFF0`: what the rule gives for 2.0.
const LOWEST = -0x20_00;
const HIGHEST = 0x20_00;

const entry = (magnitude: number): number =>
  Math.min(
    Math.floor(Math.log2(magnitude / 0x10_00) * 0x10_00 + 0.5),
    0xf_ff
  ) << 4;

const LOG = (() => {
  const table = new Uint16Array(HIGHEST - LOWEST + 1);
  for (let mantissa = 0x10_00; mantissa <= 0x20_00; mantissa += 2) {
    const fraction = entry(mantissa);
    table[mantissa - LOWEST] = fraction;
    table[-mantissa - LOWEST] = fraction | 1;
  }
  return table;
})();

/// The log table's word for a normalised mantissa word, read as signed.
export const craftLog = (mantissa: number): number => {
  const signed = (mantissa << 16) >> 16;
  if (
    signed < LOWEST ||
    signed > HIGHEST ||
    (signed > -0x10_00 && signed < 0x10_00) ||
    signed % 2 !== 0
  ) {
    throw new RangeError(`not a normalised mantissa: ${mantissa}`);
  }
  return LOG[signed - LOWEST]!;
};
