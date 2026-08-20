import { atan, cos, sin } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import { ScenePalette, type RGB8 } from '../scene/index.ts';
import type { PresentationSettings, SkySettings } from '../settings/index.ts';
import { dot, normalized } from './vector.ts';

const TURN = 2 * Math.PI;
const EPOCH_HOUR = 9;
const NIGHT_ALTITUDE_DEGREES = -12;
const SUNRISE_ALTITUDE_DEGREES = 0;
const DAY_ALTITUDE_DEGREES = 12;

const rgb = (red: number, green: number, blue: number): RGB8 => ({
  blue,
  green,
  red
});

const NIGHT = rgb(0x08, 0x10, 0x18);
const DUSK = rgb(0xc8, 0x68, 0x38);
const STAR_COLOUR = rgb(0xa0, 0xa8, 0xc0);
const SUN_COLOUR = rgb(0xff, 0xd0, 0x70);
const INNER_MOON_COLOUR = rgb(0xd8, 0xc8, 0xa8);
const OUTER_MOON_COLOUR = rgb(0xb8, 0xc8, 0xd8);
const MOON_DARK = rgb(0x10, 0x18, 0x20);

interface Orbit {
  readonly angularDiameterDegrees: number;
  readonly argumentOfPeriapsisDegrees: number;
  readonly eccentricity: number;
  readonly inclinationDegrees: number;
  readonly meanAnomalyAtEpochDegrees: number;
  readonly nodeDegrees: number;
  readonly periodDays: number;
}

const SUN_ORBIT: Orbit = {
  angularDiameterDegrees: 1.8,
  argumentOfPeriapsisDegrees: 0,
  eccentricity: 0.06,
  inclinationDegrees: 0,
  meanAnomalyAtEpochDegrees: 0,
  nodeDegrees: 0,
  periodDays: 96
};

const MOON_ORBITS: readonly [Orbit, Orbit] = [
  {
    angularDiameterDegrees: 1.6,
    argumentOfPeriapsisDegrees: 25,
    eccentricity: 0.11,
    inclinationDegrees: 9,
    meanAnomalyAtEpochDegrees: 210,
    nodeDegrees: 125,
    periodDays: 2.6
  },
  {
    angularDiameterDegrees: 0.9,
    argumentOfPeriapsisDegrees: 40,
    eccentricity: 0.18,
    inclinationDegrees: 32,
    meanAnomalyAtEpochDegrees: 35.519,
    nodeDegrees: 334,
    periodDays: 14.3
  }
];

interface FixedStar {
  readonly alpha: number;
  readonly equatorial: Vector3;
}

export interface TargOrrery {
  readonly settings: SkySettings;
  readonly stars: readonly FixedStar[];
}

export interface SkyStar {
  readonly alpha: number;
  readonly direction: Vector3;
}

export interface SkyDisc {
  readonly angularDiameterRadians: number;
  readonly darkColour?: RGB8;
  readonly direction: Vector3;
  readonly illuminatedFraction: number;
  readonly litColour: RGB8;
  readonly phaseCosine: number;
}

export interface SkyState {
  readonly clear: RGB8;
  readonly moons: readonly [SkyDisc, SkyDisc];
  readonly solarAltitudeDegrees: number;
  readonly solarDeclinationDegrees: number;
  readonly starColour: RGB8;
  readonly stars: readonly SkyStar[];
  readonly starVisibility: number;
  readonly sun: SkyDisc;
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const degrees = (value: number): number => (value * 180) / Math.PI;

const wrapSigned = (angle: number): number => {
  const wrapped = (((angle + Math.PI) % TURN) + TURN) % TURN;
  return wrapped - Math.PI;
};

export const kepler = (meanAnomaly: number, eccentricity: number): number => {
  let eccentricAnomaly = meanAnomaly;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly - eccentricity * sin(eccentricAnomaly) - meanAnomaly) /
      (1 - eccentricity * cos(eccentricAnomaly));
  }
  return eccentricAnomaly;
};

const rotateX = (value: Vector3, angle: number): Vector3 => ({
  x: value.x,
  y: value.y * cos(angle) - value.z * sin(angle),
  z: value.y * sin(angle) + value.z * cos(angle)
});

const rotateZ = (value: Vector3, angle: number): Vector3 => ({
  x: value.x * cos(angle) - value.y * sin(angle),
  y: value.x * sin(angle) + value.y * cos(angle),
  z: value.z
});

const equatorialDirection = (
  orbit: Orbit,
  days: number,
  obliquity: number
): Vector3 => {
  const meanAnomaly = wrapSigned(
    radians(orbit.meanAnomalyAtEpochDegrees) + (TURN * days) / orbit.periodDays
  );
  const eccentricAnomaly = kepler(meanAnomaly, orbit.eccentricity);
  let direction: Vector3 = {
    x: cos(eccentricAnomaly) - orbit.eccentricity,
    y:
      Math.sqrt(1 - orbit.eccentricity * orbit.eccentricity) *
      sin(eccentricAnomaly),
    z: 0
  };
  direction = rotateZ(direction, radians(orbit.argumentOfPeriapsisDegrees));
  direction = rotateX(direction, radians(orbit.inclinationDegrees));
  direction = rotateZ(direction, radians(orbit.nodeDegrees));
  return normalized(rotateX(direction, obliquity));
};

interface LocalFrame {
  readonly east: Vector3;
  readonly north: Vector3;
  readonly up: Vector3;
}

const localFrame = (
  latitude: number,
  localSiderealTime: number
): LocalFrame => {
  const sineTime = sin(localSiderealTime);
  const cosineTime = cos(localSiderealTime);
  const sineLatitude = sin(latitude);
  const cosineLatitude = cos(latitude);
  return {
    east: { x: -sineTime, y: cosineTime, z: 0 },
    north: {
      x: -sineLatitude * cosineTime,
      y: -sineLatitude * sineTime,
      z: cosineLatitude
    },
    up: {
      x: cosineLatitude * cosineTime,
      y: cosineLatitude * sineTime,
      z: sineLatitude
    }
  };
};

const localDirection = (equatorial: Vector3, frame: LocalFrame): Vector3 => ({
  x: dot(equatorial, frame.east),
  y: dot(equatorial, frame.up),
  z: dot(equatorial, frame.north)
});

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x01_00_00_00_00;
  };
};

const starSphere = (count: number, seed: number): readonly FixedStar[] => {
  const random = mulberry32(seed);
  const stars: FixedStar[] = [];
  for (let index = 0; index < count; index += 1) {
    const north = 1 - 2 * random();
    const radius = Math.sqrt(Math.max(0, 1 - north * north));
    const turn = TURN * random();
    stars.push({
      alpha: 0.35 + 0.55 * random(),
      equatorial: {
        x: radius * cos(turn),
        y: radius * sin(turn),
        z: north
      }
    });
  }
  return stars;
};

export const createTargOrrery = (settings: SkySettings): TargOrrery => ({
  settings,
  stars: starSphere(settings.starCount, settings.starSeed)
});

export const targOrreryFor = (
  presentation: PresentationSettings
): TargOrrery | undefined =>
  presentation.preset === 'enhanced'
    ? createTargOrrery(presentation.sky)
    : undefined;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const unit = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return unit * unit * (3 - 2 * unit);
};

const mixed = (a: RGB8, b: RGB8, amount: number): RGB8 =>
  rgb(
    Math.round(a.red + (b.red - a.red) * amount),
    Math.round(a.green + (b.green - a.green) * amount),
    Math.round(a.blue + (b.blue - a.blue) * amount)
  );

/// Derived from governed `atan` and IEEE-754 `sqrt`, so ADR 0022's math seam remains complete.
const arcsine = (value: number): number =>
  atan(value / Math.sqrt(Math.max(0, 1 - value * value)));

export const skyColourAt = (solarAltitudeDegrees: number): RGB8 => {
  if (solarAltitudeDegrees <= NIGHT_ALTITUDE_DEGREES) {
    return NIGHT;
  }
  if (solarAltitudeDegrees <= SUNRISE_ALTITUDE_DEGREES) {
    return mixed(
      NIGHT,
      DUSK,
      smoothstep(
        NIGHT_ALTITUDE_DEGREES,
        SUNRISE_ALTITUDE_DEGREES,
        solarAltitudeDegrees
      )
    );
  }
  if (solarAltitudeDegrees < DAY_ALTITUDE_DEGREES) {
    return mixed(
      DUSK,
      ScenePalette.sky,
      smoothstep(
        SUNRISE_ALTITUDE_DEGREES,
        DAY_ALTITUDE_DEGREES,
        solarAltitudeDegrees
      )
    );
  }
  return ScenePalette.sky;
};

export const starVisibilityAt = (solarAltitudeDegrees: number): number =>
  1 -
  smoothstep(
    NIGHT_ALTITUDE_DEGREES,
    SUNRISE_ALTITUDE_DEGREES,
    solarAltitudeDegrees
  );

const disc = (
  orbit: Orbit,
  direction: Vector3,
  litColour: RGB8,
  sunEquatorial?: Vector3,
  bodyEquatorial?: Vector3
): SkyDisc => {
  const phaseCosine =
    sunEquatorial === undefined || bodyEquatorial === undefined
      ? 1
      : -dot(sunEquatorial, bodyEquatorial);
  return {
    angularDiameterRadians: radians(orbit.angularDiameterDegrees),
    ...(sunEquatorial === undefined ? {} : { darkColour: MOON_DARK }),
    direction,
    illuminatedFraction: (1 + phaseCosine) / 2,
    litColour,
    phaseCosine
  };
};

export const skyStateAt = (
  orrery: TargOrrery,
  elapsedSeconds: number
): SkyState => {
  const { settings } = orrery;
  const daySeconds = settings.dayLengthMinutes * 60;
  const days = Math.max(0, elapsedSeconds) / daySeconds;
  const obliquity = radians(settings.obliquityDegrees);
  const latitude = radians(settings.latitudeDegrees);
  const localSiderealTime =
    radians((EPOCH_HOUR - 12) * 15) + TURN * days * (1 + 1 / settings.yearDays);
  const horizon = localFrame(latitude, localSiderealTime);
  const sunEquatorial = equatorialDirection(
    { ...SUN_ORBIT, periodDays: settings.yearDays },
    days,
    obliquity
  );
  const sunDirection = localDirection(sunEquatorial, horizon);
  const moonAt = (orbit: Orbit, litColour: RGB8): SkyDisc => {
    const equatorial = equatorialDirection(orbit, days, obliquity);
    return disc(
      orbit,
      localDirection(equatorial, horizon),
      litColour,
      sunEquatorial,
      equatorial
    );
  };
  const moonValues: readonly [SkyDisc, SkyDisc] = [
    moonAt(MOON_ORBITS[0], INNER_MOON_COLOUR),
    moonAt(MOON_ORBITS[1], OUTER_MOON_COLOUR)
  ];
  const solarAltitudeDegrees = degrees(arcsine(sunDirection.y));
  return {
    clear: skyColourAt(solarAltitudeDegrees),
    moons: moonValues,
    solarAltitudeDegrees,
    solarDeclinationDegrees: degrees(arcsine(sunEquatorial.z)),
    starColour: STAR_COLOUR,
    stars: orrery.stars.map(star => ({
      alpha: star.alpha,
      direction: localDirection(star.equatorial, horizon)
    })),
    starVisibility: starVisibilityAt(solarAltitudeDegrees),
    sun: disc(SUN_ORBIT, sunDirection, SUN_COLOUR)
  };
};
