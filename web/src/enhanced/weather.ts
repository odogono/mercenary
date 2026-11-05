/// Weather: a daily pick over a Body's Haze (ADR 0090).
///
/// Weather only scales the Haze half distance of a Body's Atmosphere. It is picked once per
/// local Body Day from a hash of the Body id and the observer's day number, weighted by the
/// Body's Weather profile, and Body Time shapes it within the day. It is presentation only:
/// recomputed from the clock each frame, never stored, and absent wherever Haze is.

import type { Atmosphere } from './atmosphere.ts';

export type WeatherState = 'clear' | 'hazy' | 'mist';

export const WEATHER_STATES: readonly WeatherState[] = [
  'clear',
  'hazy',
  'mist'
];

/// Each state's multiplier on the Haze half distance. Hazy is ADR 0088's tuning.
export const WEATHER_SCALE: Readonly<Record<WeatherState, number>> = {
  clear: 2,
  hazy: 1,
  mist: 0.25
};

/// How often a Body's days fall to each state: relative, non-negative weights.
export type WeatherProfile = Readonly<Record<WeatherState, number>>;

/// The one profile every Body with an Atmosphere starts on. Authored, not recovered.
export const DEFAULT_WEATHER_PROFILE: {
  readonly authority: 'authored';
  readonly weights: WeatherProfile;
} = {
  authority: 'authored',
  weights: { clear: 3, hazy: 5, mist: 2 }
};

/// The Weather profile of a Body by its id. Every Body shares the default for now.
export const weatherProfileOf = (_body: string): WeatherProfile =>
  DEFAULT_WEATHER_PROFILE.weights;

/// A uniform value in [0, 1) from the Body id and day number: FNV-1a, then a final mix.
const dayHash = (body: string, day: number): number => {
  let hash = 0x81_1c_9d_c5;
  for (const char of `${body}#${day}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01_00_01_93);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85_eb_ca_6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2_b2_ae_35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2 ** 32;
};

/// The Weather picked for a Body on one local Body Day.
export const weatherOn = (
  body: string,
  day: number,
  profile: WeatherProfile = weatherProfileOf(body)
): WeatherState => {
  const total = WEATHER_STATES.reduce((sum, state) => sum + profile[state], 0);
  let left = dayHash(body, day) * total;
  for (const state of WEATHER_STATES) {
    left -= profile[state];
    if (left < 0) {
      return state;
    }
  }
  return 'hazy';
};

/// Half the width of the blend across local midnight, in days: half an hour.
const MIDNIGHT_BLEND = 1 / 48;
/// The dawn mist rises from 03:00, is whole at 06:00 and clears by noon.
const MIST_RISES = 3 / 24;
const MIST_WHOLE = 6 / 24;
const MIST_CLEARS = 12 / 24;

const smooth = (from: number, to: number, at: number): number => {
  const t = Math.min(1, Math.max(0, (at - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/// The Haze half distance multiplier for a Body at the observer's local Body Days (whole days
/// plus Body Time as a fraction). An override pins one state's multiplier with no shaping.
export const weatherScale = (
  body: string,
  localDays: number,
  override: WeatherState | null = null
): number => {
  if (override !== null) {
    return WEATHER_SCALE[override];
  }
  const day = Math.floor(localDays);
  const time = localDays - day;
  // Blending in log space keeps a doubling and a halving equally gradual.
  const level = (offset: number): number =>
    Math.log2(WEATHER_SCALE[weatherOn(body, day + offset)]);
  const base =
    time < MIDNIGHT_BLEND
      ? mix(level(-1), level(0), smooth(-MIDNIGHT_BLEND, MIDNIGHT_BLEND, time))
      : time > 1 - MIDNIGHT_BLEND
        ? mix(
            level(0),
            level(1),
            smooth(1 - MIDNIGHT_BLEND, 1 + MIDNIGHT_BLEND, time)
          )
        : level(0);
  const mist =
    time < MIST_WHOLE
      ? smooth(MIST_RISES, MIST_WHOLE, time)
      : 1 - smooth(MIST_WHOLE, MIST_CLEARS, time);
  return 2 ** mix(base, Math.log2(WEATHER_SCALE.mist), mist);
};

/// An Atmosphere with its Haze thickened or thinned by Weather. No Atmosphere, or no Haze,
/// stays as it is.
export const weathered = (
  atmosphere: Atmosphere | null | undefined,
  scale: number
): Atmosphere | null =>
  atmosphere == null
    ? null
    : atmosphere.hazeHalfDistance === null
      ? atmosphere
      : { hazeHalfDistance: atmosphere.hazeHalfDistance * scale };

/// Read the `weather` console argument: a state, or `auto` to clear the override.
export const parseWeather = (value: string): WeatherState | null => {
  if (value === 'auto') {
    return null;
  }
  if ((WEATHER_STATES as readonly string[]).includes(value)) {
    return value as WeatherState;
  }
  throw new Error(
    `weather must be clear, hazy, mist or auto, and is '${value}'`
  );
};

/// The `weather` console reply. A Body without an Atmosphere, or space, has no Weather; an
/// override is reported as pinned.
export const describeWeather = (
  where: { readonly body: string; readonly localDays: number } | null,
  override: WeatherState | null
): string => {
  if (override !== null) {
    return `weather ${override} (pinned)`;
  }
  if (where === null) {
    return 'weather none';
  }
  const today = weatherOn(where.body, Math.floor(where.localDays));
  const scale = weatherScale(where.body, where.localDays);
  return `weather ${today} today, haze x${scale.toFixed(2)} now`;
};
