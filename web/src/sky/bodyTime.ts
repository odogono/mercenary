/// Body Time: a local solar day scaled to a 24-hour face, independent of its real duration.
/// The recovered angles span 1024 steps. The far half of the latitude coordinate reverses
/// the surface frame, putting solar noon half a longitude turn from the near half's.
export const wrapBodyLongitude = (longitude: number): number =>
  ((longitude % 1024) + 1024) % 1024;

const noonLongitude = (subStellar: number, latitude: number): number =>
  subStellar + (wrapBodyLongitude(latitude) < 512 ? 512 : 0);

export const bodyTime = (
  longitude: number,
  latitude: number,
  subStellar: number
): number =>
  wrapBodyLongitude(longitude - noonLongitude(subStellar, latitude) + 512) *
  (86_400 / 1024);

export const longitudeAtBodyTime = (
  secondsOfDay: number,
  latitude: number,
  subStellar: number
): number =>
  wrapBodyLongitude(
    (secondsOfDay / 86_400) * 1024 + noonLongitude(subStellar, latitude) - 512
  );
