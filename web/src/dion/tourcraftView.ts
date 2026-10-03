const signed = (value: number) => (value << 16) >> 16;

/// `$59D34..$59D94`: rotate signed scaled physical tilt into the live cabin
/// bearing using Dion's Q15 model-rotation table, with word truncation at each
/// original shift/swap. The copied surface roll is clamped; space retains roll.
export const tourcraftView = (
  table: readonly number[],
  physical: { pitch: number; roll: number; yaw: number },
  offset: number,
  space: boolean
) => {
  let roll = signed(physical.roll << 6),
    pitch = signed(physical.pitch << 7);
  const step = (offset >>> 2) & 255;
  if (step !== 0) {
    const sine = signed(table[step]!),
      cosine = signed(table[step + 64]!);
    const previous = roll;
    roll = signed((((previous * cosine - pitch * sine) | 0) >>> 16) << 1);
    pitch = signed((((pitch * cosine + previous * sine) | 0) >>> 16) << 1);
  }
  roll >>= 6;
  pitch >>= 7;
  return {
    pitch: (pitch ^ 512) & 65_535,
    roll: space ? physical.roll : Math.min(72, Math.max(-73, roll)) & 65_535,
    yaw: (physical.yaw + offset) & 65_535
  };
};
