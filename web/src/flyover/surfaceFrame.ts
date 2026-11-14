import { atan, cos, sin } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import { wrapSurfaceAxis } from '../world/surfaceCoordinates.ts';
import type { IslandPresentation } from './documents.ts';

/// Targ's body-fixed coordinates as the Flyover sees them (ADR 0094).
///
/// The Flyover draws Targ in the city's horizon frame: x east, y up, z north, at the latitude
/// the game's Targ sky is drawn from. That frame turns with Targ, so it is already body-fixed.
/// Longitude and latitude are measured in Targ's equatorial frame, with the prime meridian
/// through the city, so the city stands at longitude 0 and the horizon frame's latitude.

export interface BodyCoordinates {
  /// Radians north of the equator, in [-π/2, π/2].
  readonly latitude: number;
  /// Radians east of the prime meridian, in [-π, π].
  readonly longitude: number;
}

export interface TangentFrame {
  readonly east: Vector3;
  readonly north: Vector3;
  readonly up: Vector3;
}

const TURN = 2 * Math.PI;

/// The angle of (x, y) from the x axis, from governed `atan` so ADR 0022's math seam stays
/// complete.
const angleOf = (x: number, y: number): number => {
  if (x === 0) {
    return y === 0 ? 0 : y > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  const base = atan(y / x);
  if (x > 0) {
    return base;
  }
  return y >= 0 ? base + Math.PI : base - Math.PI;
};

/// An angle in [-π, π).
const wrappedAngle = (radians: number): number =>
  radians - TURN * Math.floor((radians + Math.PI) / TURN);

/// From the Flyover frame into Targ's equatorial frame: x towards longitude 0 on the equator,
/// y towards 90°E, z towards the north pole.
const toEquatorial = (value: Vector3, frameLatitude: number): Vector3 => {
  const s = sin(frameLatitude);
  const c = cos(frameLatitude);
  return {
    x: value.y * c - value.z * s,
    y: value.x,
    z: value.y * s + value.z * c
  };
};

const fromEquatorial = (value: Vector3, frameLatitude: number): Vector3 => {
  const s = sin(frameLatitude);
  const c = cos(frameLatitude);
  return {
    x: value.y,
    y: value.x * c + value.z * s,
    z: -value.x * s + value.z * c
  };
};

/// The longitude and latitude under a direction from Targ's centre. At a pole, where longitude
/// has no value, it reads 0.
export const bodyCoordinatesOf = (
  outward: Vector3,
  frameLatitude: number
): BodyCoordinates => {
  const equatorial = toEquatorial(outward, frameLatitude);
  const horizontal = Math.hypot(equatorial.x, equatorial.y);
  return {
    latitude:
      horizontal === 0
        ? Math.sign(equatorial.z) * (Math.PI / 2)
        : atan(equatorial.z / horizontal),
    longitude: horizontal === 0 ? 0 : angleOf(equatorial.x, equatorial.y)
  };
};

/// The unit direction from Targ's centre to a longitude and latitude, in the Flyover frame.
export const bodyDirectionOf = (
  longitude: number,
  latitude: number,
  frameLatitude: number
): Vector3 =>
  fromEquatorial(
    {
      x: cos(latitude) * cos(longitude),
      y: cos(latitude) * sin(longitude),
      z: sin(latitude)
    },
    frameLatitude
  );

/// East, north and up at a longitude and latitude, in the Flyover frame. At a pole the frame is
/// the one longitude 0 would have, so it stays finite.
export const tangentFrameOf = (
  longitude: number,
  latitude: number,
  frameLatitude: number
): TangentFrame => ({
  east: fromEquatorial(
    { x: -sin(longitude), y: cos(longitude), z: 0 },
    frameLatitude
  ),
  north: fromEquatorial(
    {
      x: -sin(latitude) * cos(longitude),
      y: -sin(latitude) * sin(longitude),
      z: cos(latitude)
    },
    frameLatitude
  ),
  up: bodyDirectionOf(longitude, latitude, frameLatitude)
});

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/// Where a longitude and latitude fall on an Island's surface patch, extended over the whole
/// Body. The mapping is equirectangular with true scale at the Island centre's latitude: one
/// surface unit per System unit both east and north there. Both axes wrap like Targ's own, so
/// the mapping is not one-to-one far from the Island and claims no whole-surface geography.
export const surfacePositionOf = (
  longitude: number,
  latitude: number,
  island: IslandPresentation
): { readonly x: number; readonly z: number } => {
  const patch = island.surfacePatch;
  if (patch === undefined) {
    throw new Error(`Island ${island.id} has no surface patch`);
  }
  const centreLatitude = radians(island.centreDegrees.latitude);
  const east =
    wrappedAngle(longitude - radians(island.centreDegrees.longitude)) *
    patch.unitsPerRadian *
    cos(centreLatitude);
  const north = (latitude - centreLatitude) * patch.unitsPerRadian;
  return {
    x: wrapSurfaceAxis(patch.sourceCentre.x + east),
    z: wrapSurfaceAxis(patch.sourceCentre.z + north)
  };
};
