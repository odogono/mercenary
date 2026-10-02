/// Damocles's altitude curve at `$915A`, used by both titles by user decision
/// (#724). MIII's original `$7D4A` starts at radius 3; its table remains in the
/// recovered payload, while the shared presentation intentionally uses this one.
/// The camera's raw Y, rather than its cell high word, indexes it in 2048-unit steps.
export const roadRadius = (height: number): number => {
  const index = Math.max(0, Math.min(255, Math.floor(height / 2048)));
  if (index < 3) {
    return index;
  }
  if (index < 5) {
    return 3;
  }
  if (index < 10) {
    return 4;
  }
  if (index < 16) {
    return 5;
  }
  if (index < 24) {
    return 6;
  }
  if (index < 32) {
    return 7;
  }
  return Math.floor(index / 4);
};

/// A whole run is one packed pair of (z,x) cell bytes. Select the raw corner words,
/// not intersections with reconstructed runs: overwritten and crossing cells retain
/// their own bindings. The own cell seeds deduplication, the window is visited row
/// first, and neighbours are painted in reverse discovery order. No cache is needed:
/// cell crossings and radius changes immediately select the new window.
/// See docs/research/damocles-miii-road-lines.md for both titles' source addresses.
export const roadEdges = (
  corners: readonly number[],
  x: number,
  z: number,
  height: number
): readonly number[] => {
  const own = x >= 0 && x < 16 && z >= 0 && z < 16 ? corners[z * 16 + x]! : 0;
  const ownWords = [own >>> 16, own & 0xff_ff];
  const seen = new Set(ownWords);
  const neighbours: number[] = [];
  const radius = roadRadius(height);
  if (radius !== 0) {
    for (
      let row = Math.max(0, z - radius);
      row <= Math.min(15, z + radius);
      row += 1
    ) {
      for (
        let column = Math.max(0, x - radius);
        column <= Math.min(15, x + radius);
        column += 1
      ) {
        const value = corners[row * 16 + column]!;
        for (const word of [value & 0xff_ff, value >>> 16]) {
          if (word !== 0 && !seen.has(word)) {
            seen.add(word);
            neighbours.push(word);
          }
        }
      }
    }
  }
  neighbours.reverse();
  // `$54AFA` / `$55E14`: the own-cell pair is suppressed while scene Y's
  // high word is zero, even though neighbouring runs can already be selected.
  if (height >= 65_536) {
    neighbours.push(...ownWords.filter(word => (word & 0xff) !== 0));
  }
  return neighbours;
};
