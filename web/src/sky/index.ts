import type {
  TargSystemBody,
  TargSystemBodyId,
  TargSystemDocument
} from '../flyover/documents.ts';
import { atan, cos, sin } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import { ScenePalette, type RGB8 } from '../scene/index.ts';
import type { PresentationSettings, SkySettings } from '../settings/index.ts';
import { TARG_EPOCH_HOUR } from './time.ts';
import { dot, normalized } from './vector.ts';

const TURN = 2 * Math.PI;
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
const MOON_DARK = rgb(0x10, 0x18, 0x20);

interface FixedStar {
  readonly alpha: number;
  readonly equatorial: Vector3;
}

/// A view of Targ's sky read from the Targ System (ADR 0086). The System is static, so the only
/// thing that moves is TARG turning under it: the sun, the moons and the stars all cross the
/// sky once a Body Day, and each moon keeps the one phase its place in the System gives it.
export interface TargOrrery {
  readonly settings: SkySettings;
  readonly stars: readonly FixedStar[];
  readonly system: TargSystemDocument;
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

/// The angle of (x, y) from the x axis, from governed `atan` so ADR 0022's math seam stays
/// complete.
const angleOf = (x: number, y: number): number => {
  if (x === 0) {
    return y >= 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  const base = atan(y / x);
  if (x > 0) {
    return base;
  }
  return y >= 0 ? base + Math.PI : base - Math.PI;
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

export const createTargOrrery = (
  system: TargSystemDocument,
  settings: SkySettings
): TargOrrery => ({
  settings,
  stars: starSphere(settings.starCount, settings.starSeed),
  system
});

export const targOrreryFor = (
  system: TargSystemDocument,
  presentation: PresentationSettings
): TargOrrery | undefined =>
  presentation.preset === 'enhanced'
    ? createTargOrrery(system, presentation.sky)
    : undefined;

export interface TargOrreryBodyPosition {
  readonly angularDiameterRadians: number;
  /// Targ-relative, in the System's units, turned into the observer's horizon frame.
  readonly position: Vector3;
}

export interface TargOrreryBodyPositions {
  readonly moons: readonly [TargOrreryBodyPosition, TargOrreryBodyPosition];
  readonly sun: TargOrreryBodyPosition;
}

const systemBody = (
  system: TargSystemDocument,
  id: TargSystemBodyId
): TargSystemBody => {
  const body = system.bodies.find(candidate => candidate.id === id);
  if (body === undefined) {
    throw new Error(`The Targ System has no ${id}`);
  }
  return body;
};

/// Targ sits at the System's origin, so a Body's position is already Targ-relative, in Targ's
/// equatorial frame with north along z.
const lengthOf = (value: Vector3): number =>
  Math.hypot(value.x, value.y, value.z);

const angularDiameter = (body: TargSystemBody): number =>
  2 * arcsine(Math.min(1, body.radius / lengthOf(body.position)));

/// Where the observer's horizon is after `elapsedSeconds` of Targ turning.
///
/// With the sun fixed in the System, a solar day and a sidereal day are the same turn. The
/// epoch is placed so that the sun's hour angle reads `TARG_EPOCH_HOUR`, wherever the System
/// puts the sun.
const horizonAt = (orrery: TargOrrery, elapsedSeconds: number): LocalFrame => {
  const { settings } = orrery;
  const days = Math.max(0, elapsedSeconds) / (settings.dayLengthMinutes * 60);
  const sun = systemBody(orrery.system, 'sun').position;
  const localSiderealTime =
    angleOf(sun.x, sun.y) + radians((TARG_EPOCH_HOUR - 12) * 15) + TURN * days;
  return localFrame(radians(settings.latitudeDegrees), localSiderealTime);
};

/// The Orrery's Targ-relative Body positions in the observer's horizon frame, in System units.
export const targOrreryBodyPositionsAt = (
  orrery: TargOrrery,
  elapsedSeconds: number
): TargOrreryBodyPositions => {
  const horizon = horizonAt(orrery, elapsedSeconds);
  const at = (id: TargSystemBodyId): TargOrreryBodyPosition => {
    const body = systemBody(orrery.system, id);
    return {
      angularDiameterRadians: angularDiameter(body),
      position: localDirection(body.position, horizon)
    };
  };
  return { moons: [at('inner-moon'), at('outer-moon')], sun: at('sun') };
};

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

/// The cool end of the Enhanced twilight gradient, away from the horizon glow.
export const skyZenithColourAt = (solarAltitudeDegrees: number): RGB8 => {
  if (solarAltitudeDegrees <= NIGHT_ALTITUDE_DEGREES) {
    return NIGHT;
  }
  if (solarAltitudeDegrees >= DAY_ALTITUDE_DEGREES) {
    return ScenePalette.sky;
  }
  return mixed(
    NIGHT,
    ScenePalette.sky,
    smoothstep(
      NIGHT_ALTITUDE_DEGREES,
      DAY_ALTITUDE_DEGREES,
      solarAltitudeDegrees
    )
  );
};

export const skyGradientAt = (
  solarAltitudeDegrees: number
): { readonly horizon: RGB8; readonly zenith: RGB8 } | undefined =>
  solarAltitudeDegrees <= NIGHT_ALTITUDE_DEGREES ||
  solarAltitudeDegrees >= DAY_ALTITUDE_DEGREES
    ? undefined
    : {
        horizon: skyColourAt(solarAltitudeDegrees),
        zenith: skyZenithColourAt(solarAltitudeDegrees)
      };

export const starVisibilityAt = (solarAltitudeDegrees: number): number =>
  1 -
  smoothstep(
    NIGHT_ALTITUDE_DEGREES,
    SUNRISE_ALTITUDE_DEGREES,
    solarAltitudeDegrees
  );

const colourOf = (hex: string): RGB8 =>
  rgb(
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  );

/// A Body as a disc in the sky. A moon's phase is the angle at it between the sun and Targ,
/// which a static System fixes for good.
const disc = (
  body: TargSystemBody,
  horizon: LocalFrame,
  sun?: TargSystemBody
): SkyDisc => {
  const toward = normalized(body.position);
  let phaseCosine = 1;
  if (sun !== undefined) {
    const toSun = normalized({
      x: sun.position.x - body.position.x,
      y: sun.position.y - body.position.y,
      z: sun.position.z - body.position.z
    });
    // Fully lit when the sun is behind the observer, as seen from the moon.
    phaseCosine = -dot(toSun, toward);
  }
  return {
    angularDiameterRadians: angularDiameter(body),
    ...(sun === undefined ? {} : { darkColour: MOON_DARK }),
    direction: localDirection(toward, horizon),
    illuminatedFraction: (1 + phaseCosine) / 2,
    litColour: colourOf(body.baseColour),
    phaseCosine
  };
};

export const skyStateAt = (
  orrery: TargOrrery,
  elapsedSeconds: number
): SkyState => {
  const horizon = horizonAt(orrery, elapsedSeconds);
  const sun = systemBody(orrery.system, 'sun');
  const sunDisc = disc(sun, horizon);
  const sunEquatorial = normalized(sun.position);
  const solarAltitudeDegrees = degrees(arcsine(sunDisc.direction.y));
  return {
    clear: skyColourAt(solarAltitudeDegrees),
    moons: [
      disc(systemBody(orrery.system, 'inner-moon'), horizon, sun),
      disc(systemBody(orrery.system, 'outer-moon'), horizon, sun)
    ],
    solarAltitudeDegrees,
    solarDeclinationDegrees: degrees(arcsine(sunEquatorial.z)),
    starColour: STAR_COLOUR,
    stars: orrery.stars.map(star => ({
      alpha: star.alpha,
      direction: localDirection(star.equatorial, horizon)
    })),
    starVisibility: starVisibilityAt(solarAltitudeDegrees),
    sun: sunDisc
  };
};
