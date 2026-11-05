/// A Body's Atmosphere and the Haze it gives Enhanced presentation (ADR 0088).
///
/// Whether a Body has an Atmosphere is recovered for Damocles (`$794D`) and Mercenary III
/// (`bodyAtmosphere`). How thick its Haze is was never part of either original: it is authored
/// here, per Title and Body id. TARG's Atmosphere is authored in the Targ System instead (ADR 0086).

/// A Body that has air, as the planner reads it.
export interface Atmosphere {
  /// The view distance, in raw engine units, at which Haze covers half of what lies there.
  /// Null where no thickness is authored, which draws no Haze.
  readonly hazeHalfDistance: number | null;
}

/// A frame's Haze: the horizon colour it fades toward and how thick it is.
export interface Haze {
  readonly colour: readonly [number, number, number];
  readonly halfDistance: number;
}

/// The Haze half distance every Body with air is tuned to: four Region cells (`0x1_0000` each),
/// the thickness TARG's Atmosphere is authored with in the Targ System.
const HAZE_HALF_DISTANCE = 0x4_00_00;

/// The authored Haze thickness of each Title's Bodies with air, by Body id. Damocles keys by
/// catalogue Body id, Mercenary III by `dion-` and the Body's System record offset. The Bodies
/// listed are exactly those whose recovered fact says they have an Atmosphere.
export const AUTHORED_HAZE: {
  readonly authority: 'authored';
  readonly damocles: Readonly<Record<string, number>>;
  readonly mercenaryIII: Readonly<Record<string, number>>;
} = {
  authority: 'authored',
  damocles: {
    'body-11': HAZE_HALF_DISTANCE, // ERIS
    'body-12': HAZE_HALF_DISTANCE, // SOLON
    'body-14': HAZE_HALF_DISTANCE, // VESTA
    'body-15': HAZE_HALF_DISTANCE, // METIS
    'body-17': HAZE_HALF_DISTANCE, // LOGOS
    'body-19': HAZE_HALF_DISTANCE, // TRITON
    'body-20': HAZE_HALF_DISTANCE, // PAN
    'body-21': HAZE_HALF_DISTANCE, // THALIA
    'body-22': HAZE_HALF_DISTANCE, // JUNO
    'body-23': HAZE_HALF_DISTANCE, // BACCHUS
    'body-25': HAZE_HALF_DISTANCE, // TOLOSA
    'body-26': HAZE_HALF_DISTANCE, // PERSEUS
    'body-4': HAZE_HALF_DISTANCE, // DION
    'body-8': HAZE_HALF_DISTANCE // GAEA
  },
  mercenaryIII: {
    'dion-100': HAZE_HALF_DISTANCE, // TOLOSA
    'dion-104': HAZE_HALF_DISTANCE, // PERSEUS
    'dion-16': HAZE_HALF_DISTANCE, // DION
    'dion-32': HAZE_HALF_DISTANCE, // GAEA
    'dion-44': HAZE_HALF_DISTANCE, // ERIS
    'dion-48': HAZE_HALF_DISTANCE, // SOLON
    'dion-56': HAZE_HALF_DISTANCE, // VESTA
    'dion-60': HAZE_HALF_DISTANCE, // METIS
    'dion-68': HAZE_HALF_DISTANCE, // LOGOS
    'dion-76': HAZE_HALF_DISTANCE, // TRITON
    'dion-80': HAZE_HALF_DISTANCE, // PAN
    'dion-84': HAZE_HALF_DISTANCE, // THALIA
    'dion-88': HAZE_HALF_DISTANCE, // JUNO
    'dion-92': HAZE_HALF_DISTANCE // BACCHUS
  }
};

/// A Body's Atmosphere from its recovered fact and its Title's authored thicknesses, or null
/// where it has none.
export const atmosphereOf = (
  hasAtmosphere: boolean,
  thickness: Readonly<Record<string, number>>,
  body: string
): Atmosphere | null =>
  hasAtmosphere ? { hazeHalfDistance: thickness[body] ?? null } : null;
