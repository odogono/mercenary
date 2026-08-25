/// The Reference Build's shared pseudo-random generator.
///
/// The Interstellar Ship Field respawns a point by taking seven consecutive
/// draws from this generator, so the field cannot be simulated without it. It is
/// ported rather than replaced by the session's own randomness for two reasons:
/// the sequence's character is decoded behaviour rather than an implementation
/// choice, and the laboratory already has this recurrence in Python, which gives
/// the port a cross-check instead of an opinion.
///
/// Two things about it are easy to get wrong. It is *carry-sensitive*: the carry
/// the caller arrives with is rotated in, and every invalidity branch that enters
/// a respawn arrives with it set, so the carry is a parameter rather than
/// internal state. And it keeps *two* bytes of state, a value and a state byte,
/// both of which the caller carries between draws — nothing here is seeded or
/// reset, which is why a Save has to carry both.

export interface ReferencePrngStep {
  readonly carryIn: number;
  readonly state: number;
  readonly value: number;
}

export interface ReferencePrngResult {
  readonly carry: number;
  /// The draw itself, left in the accumulator.
  readonly output: number;
  readonly state: number;
  readonly value: number;
}

const BYTE = 0xff;

const requireByte = (value: number, name: string): void => {
  if (!Number.isInteger(value) || value < 0 || value > BYTE) {
    throw new Error(`Reference PRNG ${name} must be one machine byte`);
  }
};

/// Rotate right through carry: the carry becomes the high bit, and the bit
/// rotated out becomes the new carry.
const rotateRight = (value: number, carry: number): [number, number] => [
  ((carry << 7) | (value >>> 1)) & BYTE,
  value & 0x01
];

/// One call to the generator, with no hidden processor state: everything it
/// reads and everything it leaves behind is in the argument and the result.
export const stepReferencePrng = ({
  carryIn,
  state,
  value
}: ReferencePrngStep): ReferencePrngResult => {
  requireByte(value, 'value');
  requireByte(state, 'state');
  if (carryIn !== 0 && carryIn !== 1) {
    throw new Error('Reference PRNG carry must be zero or one');
  }

  let accumulator = value;
  let carry = carryIn;
  for (let rotation = 0; rotation < 3; rotation++) {
    [accumulator, carry] = rotateRight(accumulator, carry);
  }
  accumulator ^= value;
  [accumulator, carry] = rotateRight(accumulator, carry);
  const [steppedState, stateCarry] = rotateRight(state, carry);
  const [steppedValue, finalCarry] = rotateRight(value, stateCarry);
  return {
    carry: finalCarry,
    output: accumulator,
    state: steppedState,
    value: steppedValue
  };
};
