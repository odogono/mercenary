/// Unicode scalar count, not UTF-16 units and not grapheme clusters.
///
/// `isRevealed` is trace-visible. Payload text is ASCII today, so this agrees with Swift's
/// `Character` count and with `.length`; the iterator is what keeps a later non-ASCII line
/// from silently switching to UTF-16.
export const codePointCount = (text: string): number => {
  let count = 0;
  for (const _ of text) {
    count += 1;
  }
  return count;
};
