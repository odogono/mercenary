// Research-only candidate enumeration for the retained single-trip family.
// Candidates are necessary timing matches, not source eligibility: every one
// must still pass a complete frozen-source replay and nested codec comparison.
// The last-reset offset must be calibrated from that family's actual script.
export const taxiCanonicalStartFrames = (
  tick: number,
  frame: number,
  wait: number,
  resetOffsetFrames: number,
  prefixFrame: number
): number[] => {
  if (
    ![tick, frame, wait, resetOffsetFrames, prefixFrame].every(
      value => Number.isSafeInteger(value) && value >= 0
    ) ||
    frame !== tick / 11 ||
    wait > 0xff_ff
  ) {
    throw new Error('Invalid full-frame source timing or replay calibration');
  }
  // wait = tick - 11 * (Start + offset), modulo 65536. Because 11 is
  // coprime with 65536, its inverse 35747 yields one residue class of Starts.
  const modulus = 65_536;
  const rawStart =
    ((tick % modulus) - wait) * 35_747 - (resetOffsetFrames % modulus);
  const residue = ((rawStart % modulus) + modulus) % modulus;
  const first =
    residue +
    Math.max(0, Math.ceil((prefixFrame - residue) / modulus)) * modulus;
  const candidates: number[] = [];
  // Leave is consumed on the final frame; Start must precede that frame.
  for (let start = first; start < frame - 1; start += modulus) {
    candidates.push(start);
  }
  return candidates;
};
