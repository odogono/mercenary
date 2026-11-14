import type { NearestFlyoverBody } from './camera.ts';
import { rangeHandoff, type RangeHandoff } from './rangeHandoff.ts';
import { bodyCoordinatesOf, surfacePositionOf } from './surfaceFrame.ts';
import type { FlyoverSystem } from './system.ts';

/// Where a Camera is over Targ's surface, as the Coastal and Surface readouts print it.
export interface FlyoverSurfaceReading {
  readonly latitude: number;
  readonly longitude: number;
  /// Signed height above the surface in Body radii.
  readonly normalizedAltitude: number;
  readonly x: number;
  readonly z: number;
}

export interface FlyoverRangeReading {
  readonly handoff: RangeHandoff;
  /// Present outside Orbital Range.
  readonly surface?: FlyoverSurfaceReading;
}

/// The Range the Camera is in for its nearest Body, and its surface values when that Range is
/// not Orbital. Every value is derived from the Pose; none is kept between frames except the
/// outward direction `nearestFlyoverBody` holds for a Camera at a Body's exact centre.
export const flyoverRangeReading = (
  system: FlyoverSystem,
  nearest: NearestFlyoverBody
): FlyoverRangeReading => {
  const normalizedAltitude = nearest.normalizedSignedSurfaceDistance;
  const handoff = rangeHandoff(normalizedAltitude, nearest.body.rangeAltitudes);
  if (handoff.range === 'orbital' || system.systemId !== 'targ') {
    return { handoff };
  }
  const { frameLatitude, island } = system.surfaceFrame;
  const { latitude, longitude } = bodyCoordinatesOf(
    nearest.outwardDirection,
    frameLatitude
  );
  return {
    handoff,
    surface: {
      latitude,
      longitude,
      normalizedAltitude,
      ...surfacePositionOf(longitude, latitude, island)
    }
  };
};
