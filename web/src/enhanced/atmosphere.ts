/// A Body's Atmosphere and the Haze it gives Enhanced presentation (ADR 0088).
///
/// Whether a Body has an Atmosphere is recovered for Damocles (`$794D`) and Mercenary III
/// (`bodyAtmosphere`). How thick its Haze is was never part of either original: it is authored
/// here, per Title and Body id, and ships unset, so neither Title shows Haze until its Bodies
/// are tuned. TARG's Atmosphere is authored in the Targ System instead (ADR 0086).

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

/// The authored Haze thickness of each Title's Bodies, by Body id: none yet.
export const AUTHORED_HAZE: {
  readonly authority: 'authored';
  readonly damocles: Readonly<Record<string, number>>;
  readonly mercenaryIII: Readonly<Record<string, number>>;
} = {
  authority: 'authored',
  damocles: {},
  mercenaryIII: {}
};

/// A Body's Atmosphere from its recovered fact and its Title's authored thicknesses, or null
/// where it has none.
export const atmosphereOf = (
  hasAtmosphere: boolean,
  thickness: Readonly<Record<string, number>>,
  body: string
): Atmosphere | null =>
  hasAtmosphere ? { hazeHalfDistance: thickness[body] ?? null } : null;
