/// The Carried Stack rules Damocles and Mercenary III share (#756). Both Take handlers,
/// Damocles's and Mercenary III's `$55364`, refuse on the same handling bits in the same order
/// and compare the stack's length with its capacity for equality. Both rotate the stack whole,
/// and both split it the same way when the BRIEFCASE is dropped. Each Title keeps its own
/// identities, Residence, messages and effects.

export type TakeRefusal = 'fixedInPlace' | 'handsFull' | 'tooHeavy';

/// Slot 0 held lifts both handling bits; POWERGLOVE (157) or ANTIGRAV (158) lifts only bit 5.
export const takeRefusal = (
  handling: number,
  held: (slot: number) => boolean,
  count: number,
  capacity: number
): TakeRefusal | null => {
  if ((handling & 0x10) !== 0 && !held(0)) {
    return 'fixedInPlace';
  }
  if ((handling & 0x20) !== 0 && !held(0) && !held(157) && !held(158)) {
    return 'tooHeavy';
  }
  // Equality, not `>=`: a stack already over capacity still takes.
  return count === capacity ? 'handsFull' : null;
};

/// The head goes to the tail.
export const rotateForward = <T>(stack: readonly T[]): T[] =>
  stack.length === 0 ? [] : [...stack.slice(1), stack[0]!];

/// The tail comes to the head.
export const rotateBackward = <T>(stack: readonly T[]): T[] =>
  stack.length === 0 ? [] : [stack.at(-1)!, ...stack.slice(0, -1)];

/// Dropping the BRIEFCASE at the head keeps nine of the rest carried and leaves the others in
/// the case.
export const briefcaseDrop = <T>(
  stack: readonly T[]
): { readonly carried: T[]; readonly stored: T[] } => ({
  carried: stack.slice(1, 10),
  stored: stack.slice(10)
});
