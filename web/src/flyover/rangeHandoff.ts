/// The normalized altitudes (height above the surface over the Body's radius) at which a view
/// of a Body changes Range (ADR 0094). Orbital is at or above `coastalBelow`, the dual
/// Coastal/Surface band runs from `surfaceBelow` up to `handoffBelow` inclusive, and Surface is
/// below `surfaceBelow`.
export interface RangeAltitudes {
  readonly coastalBelow: number;
  readonly handoffBelow: number;
  readonly surfaceBelow: number;
}

export type RangeReading =
  'orbital' | 'coastal' | 'coastal-surface' | 'surface';

export interface RangeHandoff {
  /// How much of the view is the Globe; always `1 - surfaceWeight`.
  readonly globeWeight: number;
  readonly range: RangeReading;
  /// How much of the view is the surface frame, from 0 above the dual band to 1 below it.
  readonly surfaceWeight: number;
}

const ORBITAL: RangeHandoff = {
  globeWeight: 1,
  range: 'orbital',
  surfaceWeight: 0
};

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const unit = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return unit * unit * (3 - 2 * unit);
};

/// The Range Handoff for one normalized altitude. It holds no state, so the same altitude
/// always gives the same view. A Body with no surface support (`altitudes` undefined) is
/// Orbital everywhere, even inside it.
export const rangeHandoff = (
  normalizedAltitude: number,
  altitudes: RangeAltitudes | undefined
): RangeHandoff => {
  if (altitudes === undefined || normalizedAltitude >= altitudes.coastalBelow) {
    return ORBITAL;
  }
  const globeWeight = smoothstep(
    altitudes.surfaceBelow,
    altitudes.handoffBelow,
    normalizedAltitude
  );
  return {
    globeWeight,
    range:
      normalizedAltitude > altitudes.handoffBelow
        ? 'coastal'
        : normalizedAltitude >= altitudes.surfaceBelow
          ? 'coastal-surface'
          : 'surface',
    surfaceWeight: 1 - globeWeight
  };
};
