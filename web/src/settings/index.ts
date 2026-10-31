import type { BensonPacing } from '../benson/index.ts';
import {
  flightModel as buildFlightModel,
  controlLimits,
  type ControlLimits,
  type FlightModel
} from '../gameCore/index.ts';
import type { FlightDocument } from '../payload/documents.ts';

/// The app's tuned values, kept as data so they can be changed without a rebuild.
///
/// Everything here is a feel choice rather than a decoded fact: the Reference Build's own
/// numbers live in the Data Payload and in the decode notes, while these are the speeds and
/// pauses chosen for a modern player (ADR 0014). They are settings precisely because judging
/// them means playing, and playing them should not mean editing a source file.
///
/// **Every field has a default, so a document may name only what it changes.** That rule is
/// the whole shape of this module: a block that is absent is the block's defaults, and a field
/// absent within a block it names is that field's default. The kit gets the two levels from
/// `decodeIfPresent(_:forKey:) ?? default` written out in each `init(from:)`; here they are
/// written out the same way, because the alternative — a deep merge over untyped objects —
/// would accept a misspelled field as a new one and change nothing.
///
/// The three ported kit blocks remain joined by one presentation block owned by the Browser
/// Shell. `bensonPacing` turns `message` into the Benson Display's pacing;
/// presentation never crosses that boundary.

export const SETTINGS_FILE_NAME = 'settings.json';

/// Why a settings document could not be read.
///
/// The kit's `Settings.LoadError` has exactly one case, `unreadable(path, reason)`, so this is
/// one class with those two values rather than the tagged union `payload/errors.ts` carries for
/// its five. Thrown rather than returned, and thrown for a malformed document rather than
/// falling back: a typo in a tuning file would otherwise leave the session running the defaults
/// it was trying to change, which reads as a knob that does nothing rather than a file that did
/// not parse. The `reason` prose is this implementation's own, since the kit's text is a Swift
/// decoder's description and no port can reproduce it.
export class SettingsError extends Error {
  /// The document the failure is about, as the kit reports its `lastPathComponent`.
  readonly fileName: string;
  readonly reason: string;

  constructor(reason: string, fileName: string = SETTINGS_FILE_NAME) {
    super(`Could not read settings from ${fileName}: ${reason}`);
    this.name = 'SettingsError';
    this.fileName = fileName;
    this.reason = reason;
  }
}

/// How long a completed Benson message stays up to be read.
/// The Benson Display's pacing in play (ADR 0083).
export interface MessageSettings {
  /// How long a message rests on the row once it has arrived.
  readonly holdSeconds: number;
  /// The silent wait between a message's 25-character bursts.
  readonly waitSeconds: number;
}

/// How the Arrival paces itself: the authored opening's own clock (ADR 0032).
///
/// Separate from `message` and `scripts` because the Arrival is played once, before the game is
/// under the player's hand, and wants the original's unhurried rhythm rather than the brisker
/// pacing chosen for play. It is deliberately absent from the blocks that identify a Save, so
/// retuning the opening cannot make an existing Save unloadable.
export interface ArrivalSettings {
  /// Authored line-duration rate for Arrival Narration, before its time scale.
  readonly charactersPerSecond: number;
  /// How long a fully revealed narration line is held.
  readonly holdSeconds: number;
  /// Multiplies the Arrival's own pacing.
  readonly timeScale: number;
  /// How long the title card holds the panel before the first narration line.
  readonly titleCardSeconds: number;
}

/// Durations of the Departure, the shell-owned opening that precedes the Arrival (ADR 0040).
/// Presentation only, like `arrival`: none of it identifies a Save.
export interface DepartureSettings {
  /// How long the committed journey takes, from commit to the join with the Arrival.
  readonly journeySeconds: number;
  /// The journey's duration when the browser asks for reduced motion.
  readonly reducedMotionJourneySeconds: number;
  /// How long the carousel takes to settle on an entry after it is turned.
  readonly snapSeconds: number;
}

export interface ScriptSettings {
  /// Instructions one advance may run before yielding, which stands in for the frame boundary
  /// the original interpreter had for free.
  readonly instructionBudget: number;
}

/// The knobs the control loop takes, minus the one bound that is not a knob.
///
/// Every field here is also a field of `ControlLimits`, because these *are* the control loop's
/// knobs and a settings file is how they get set. `groundExtent` is the exception and is
/// deliberately absent: it is a decoded fact about the world rather than a feel choice, so it
/// arrives from the payload when the limits are built. A settings file that could name it could
/// contradict the world it is played against.
export interface FlightSettings {
  /// Eye height on foot. Absent means the captured Reference Build height.
  readonly groundAltitude: number | undefined;
  readonly pitchScale: number;
  /// Frames per second the decoded craft parameters were written for. This is the one knob that
  /// paces every craft at once, walking included.
  readonly referenceFrameRate: number;
  /// How much faster a held run key walks. The Reference Build had no run.
  readonly runMultiplier: number;
  readonly speedScale: number;
  /// The notch the lowest throttle key selects. The decoded ladder spans 512 to 1, so starting
  /// part way up is what makes all ten keys do something.
  readonly throttleFloorNotch: number;
  readonly turnScale: number;
}

export type PresentationPreset = 'authentic' | 'enhanced';
export type StructureReach = 'all' | 'cell';
/// Whether Enhanced presentation draws Cast Shadows. A player's choice rather than a
/// document's, so it lives in the preferences alone.
export type CastShadows = 'off' | 'on';
/// A share of a light, in percent, from the steps the settings page offers. AMBIENT LIGHT scales
/// the fill every face out of Sunlight shows; SHADOW DEPTH is how much of the Sunlight a Cast
/// Shadow takes away. Both are the player's, like the shadows themselves.
export type LightLevel = 25 | 50 | 75 | 100;
export const LIGHT_LEVELS: readonly LightLevel[] = [25, 50, 75, 100];
/// SHADOW DEPTH goes past 100%: beyond all of the Sunlight, a Cast Shadow takes away that
/// much of the ambient fill as well, so 120% leaves a shadow four-fifths of the fill.
export type ShadowDepth = LightLevel | 110 | 120;
export const SHADOW_DEPTHS: readonly ShadowDepth[] = [
  ...LIGHT_LEVELS,
  110,
  120
];

/// How the wireframe itself is drawn, as the Reference Build drew it unless told otherwise.
///
/// A thickness of one pixel and no glow is the decoded presentation; anything else is this
/// port's own flourish, so both fields keep the authentic values as their defaults and a
/// document that names neither block changes nothing.
export interface WireframeSettings {
  /// How much soft halo each line carries, from none to fully bright.
  readonly glow: number;
  /// Line width in pixels, from one (the Reference Build's hairline) to four.
  readonly thickness: number;
}

/// Camera distance in world units: selected glow is full nearby and absent beyond fadeEnd.
export interface GlowDistanceSettings {
  readonly fadeEnd: number;
  readonly fadeStart: number;
}

export const DEFAULT_GLOW_DISTANCE: GlowDistanceSettings = {
  fadeEnd: 16_384,
  fadeStart: 4096
};

export interface SkySettings {
  readonly dayLengthMinutes: number;
  readonly latitudeDegrees: number;
  readonly starCount: number;
  readonly starSeed: number;
}

export interface PresentationSettings {
  readonly glowDistance: GlowDistanceSettings;
  readonly preset: PresentationPreset;
  readonly roads: WireframeSettings;
  readonly sky: SkySettings;
  readonly structureReach: StructureReach;
  readonly wireframe: WireframeSettings;
}

export interface Settings {
  readonly arrival: ArrivalSettings;
  readonly departure: DepartureSettings;
  readonly flight: FlightSettings;
  readonly message: MessageSettings;
  readonly presentation: PresentationSettings;
  readonly scripts: ScriptSettings;
}

/// How long a revealed message is left up to be read. Unlike the reveal rate this is not the
/// Reference Build's number scaled — it is a reading pause, and reading speed belongs to the
/// reader rather than to the original's clock.
export const DEFAULT_MESSAGE_HOLD_SECONDS = 3;
/// A third of a second: the original's 100-frame wait at the browser's pace.
export const DEFAULT_MESSAGE_WAIT_SECONDS = 1 / 3;

/// The Arrival's defaults, tuned so the title card reaches touchdown in about the
/// sixty-five seconds the original release's opening takes. They are a feel choice judged by
/// playing it beside the reference recording (ADR 0011), not decoded values.
export const DEFAULT_ARRIVAL_CHARACTERS_PER_SECOND = 4;
export const DEFAULT_ARRIVAL_HOLD_SECONDS = 2.1;
export const DEFAULT_ARRIVAL_TITLE_CARD_SECONDS = 2.5;
export const DEFAULT_ARRIVAL_TIME_SCALE = 3;

/// The Departure's recipe as settled by the prototype study (`departure-opening-prototype.md`).
export const DEFAULT_DEPARTURE_JOURNEY_SECONDS = 10;
export const DEFAULT_DEPARTURE_REDUCED_MOTION_JOURNEY_SECONDS = 4;
export const DEFAULT_DEPARTURE_SNAP_SECONDS = 0.32;
export const DEFAULT_SCRIPT_INSTRUCTION_BUDGET = 512;
export const DEFAULT_PRESENTATION_PRESET: PresentationPreset = 'enhanced';
export const DEFAULT_STRUCTURE_REACH: StructureReach = 'cell';
export const DEFAULT_CAST_SHADOWS: CastShadows = 'on';
export const DEFAULT_AMBIENT_LIGHT: LightLevel = 100;
export const DEFAULT_SHADOW_DEPTH: ShadowDepth = 100;
export const DEFAULT_SKY_DAY_LENGTH_MINUTES = 24;
export const DEFAULT_SKY_LATITUDE_DEGREES = 34;
export const DEFAULT_SKY_STAR_COUNT = 450;
export const DEFAULT_SKY_STAR_SEED = 1985;
export const DEFAULT_WIREFRAME_THICKNESS = 1;
export const DEFAULT_WIREFRAME_GLOW = 0;

/// Each flight knob's default is the control loop's own.
///
/// It lives once, on `ControlLimits`, rather than being restated here: these are the same knobs,
/// and two copies of a tuning default would let the value a settings file falls back to drift
/// from the value the loop runs with when there is no settings file at all.
const FLIGHT_DEFAULTS: ControlLimits = controlLimits();

/// A field that is absent, or explicitly null, is a field the document does not name.
///
/// The kit's `decodeIfPresent` treats both the same way, and a hand-edited tuning file is
/// exactly where a `null` gets left behind by a knob someone cleared.
const unnamed = (value: unknown): boolean =>
  value === undefined || value === null;

const shown = (value: unknown): string =>
  value === undefined ? 'absent' : JSON.stringify(value);

const refuse = (reason: string): never => {
  throw new SettingsError(reason);
};

/// One block of the document: its members, or none when it is not named.
///
/// Returning an empty object for an unnamed block is what makes the outer level of the merge
/// fall out of the inner one — every field then takes its default by the same code path that a
/// named block's omitted field does.
const block = (value: unknown, path: string): Record<string, unknown> => {
  if (unnamed(value)) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return refuse(`${path} should be an object, and is ${shown(value)}`);
  }
  return value as Record<string, unknown>;
};

const number = (
  source: Record<string, unknown>,
  key: string,
  path: string,
  fallback: number
): number => {
  const value = source[key];
  if (unnamed(value)) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return refuse(`${path} should be a finite number, and is ${shown(value)}`);
  }
  return value;
};

const integer = (
  source: Record<string, unknown>,
  key: string,
  path: string,
  fallback: number
): number => {
  const value = source[key];
  if (unnamed(value)) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return refuse(`${path} should be an integer, and is ${shown(value)}`);
  }
  return value;
};

const inRange = (
  value: number,
  path: string,
  minimum: number,
  maximum: number
): number => {
  if (value < minimum || value > maximum) {
    return refuse(
      `${path} should be between ${minimum} and ${maximum}, and is ${shown(value)}`
    );
  }
  return value;
};

const positive = (value: number, path: string): number => {
  if (value <= 0) {
    return refuse(
      `${path} should be greater than zero, and is ${shown(value)}`
    );
  }
  return value;
};

const readMessage = (value: unknown): MessageSettings => {
  const source = block(value, 'message');
  return {
    holdSeconds: number(
      source,
      'holdSeconds',
      'message.holdSeconds',
      DEFAULT_MESSAGE_HOLD_SECONDS
    ),
    waitSeconds: number(
      source,
      'waitSeconds',
      'message.waitSeconds',
      DEFAULT_MESSAGE_WAIT_SECONDS
    )
  };
};

const readArrival = (value: unknown): ArrivalSettings => {
  const source = block(value, 'arrival');
  return {
    charactersPerSecond: positive(
      number(
        source,
        'charactersPerSecond',
        'arrival.charactersPerSecond',
        DEFAULT_ARRIVAL_CHARACTERS_PER_SECOND
      ),
      'arrival.charactersPerSecond'
    ),
    holdSeconds: number(
      source,
      'holdSeconds',
      'arrival.holdSeconds',
      DEFAULT_ARRIVAL_HOLD_SECONDS
    ),
    timeScale: positive(
      number(
        source,
        'timeScale',
        'arrival.timeScale',
        DEFAULT_ARRIVAL_TIME_SCALE
      ),
      'arrival.timeScale'
    ),
    titleCardSeconds: number(
      source,
      'titleCardSeconds',
      'arrival.titleCardSeconds',
      DEFAULT_ARRIVAL_TITLE_CARD_SECONDS
    )
  };
};

const readDeparture = (value: unknown): DepartureSettings => {
  const source = block(value, 'departure');
  return {
    journeySeconds: positive(
      number(
        source,
        'journeySeconds',
        'departure.journeySeconds',
        DEFAULT_DEPARTURE_JOURNEY_SECONDS
      ),
      'departure.journeySeconds'
    ),
    reducedMotionJourneySeconds: positive(
      number(
        source,
        'reducedMotionJourneySeconds',
        'departure.reducedMotionJourneySeconds',
        DEFAULT_DEPARTURE_REDUCED_MOTION_JOURNEY_SECONDS
      ),
      'departure.reducedMotionJourneySeconds'
    ),
    snapSeconds: positive(
      number(
        source,
        'snapSeconds',
        'departure.snapSeconds',
        DEFAULT_DEPARTURE_SNAP_SECONDS
      ),
      'departure.snapSeconds'
    )
  };
};

const readScripts = (value: unknown): ScriptSettings => {
  const source = block(value, 'scripts');
  return {
    instructionBudget: integer(
      source,
      'instructionBudget',
      'scripts.instructionBudget',
      DEFAULT_SCRIPT_INSTRUCTION_BUDGET
    )
  };
};

/// A field whose default is absence itself.
///
/// The kit decodes `groundAltitude` with a bare `decodeIfPresent` and no `?? default`, which
/// looks like an oversight beside its neighbours and is not: the default *is* absent, and
/// "no height named" is the thing that tells the flight model to use the captured Reference Build
/// height. Substituting a number here — a zero above all — would put the player at ground level.
const optionalNumber = (
  source: Record<string, unknown>,
  key: string,
  path: string
): number | undefined =>
  // Delegates rather than restating the check and its wording: once the field is named, the
  // fallback `number` would return is unreachable, so what it is cannot matter.
  unnamed(source[key]) ? undefined : number(source, key, path, 0);

const readFlight = (value: unknown): FlightSettings => {
  const source = block(value, 'flight');
  return {
    groundAltitude: optionalNumber(
      source,
      'groundAltitude',
      'flight.groundAltitude'
    ),
    pitchScale: number(
      source,
      'pitchScale',
      'flight.pitchScale',
      FLIGHT_DEFAULTS.pitchScale
    ),
    referenceFrameRate: number(
      source,
      'referenceFrameRate',
      'flight.referenceFrameRate',
      FLIGHT_DEFAULTS.referenceFrameRate
    ),
    runMultiplier: number(
      source,
      'runMultiplier',
      'flight.runMultiplier',
      FLIGHT_DEFAULTS.runMultiplier
    ),
    speedScale: number(
      source,
      'speedScale',
      'flight.speedScale',
      FLIGHT_DEFAULTS.speedScale
    ),
    // A notch is an index into the decoded ladder, so a fraction is a mistake rather than a
    // finer setting: there is no rung between the tenth and the ninth.
    throttleFloorNotch: integer(
      source,
      'throttleFloorNotch',
      'flight.throttleFloorNotch',
      FLIGHT_DEFAULTS.throttleFloorNotch
    ),
    turnScale: number(
      source,
      'turnScale',
      'flight.turnScale',
      FLIGHT_DEFAULTS.turnScale
    )
  };
};

const readSky = (value: unknown): SkySettings => {
  const source = block(value, 'presentation.sky');
  return {
    dayLengthMinutes: positive(
      number(
        source,
        'dayLengthMinutes',
        'presentation.sky.dayLengthMinutes',
        DEFAULT_SKY_DAY_LENGTH_MINUTES
      ),
      'presentation.sky.dayLengthMinutes'
    ),
    latitudeDegrees: inRange(
      number(
        source,
        'latitudeDegrees',
        'presentation.sky.latitudeDegrees',
        DEFAULT_SKY_LATITUDE_DEGREES
      ),
      'presentation.sky.latitudeDegrees',
      -90,
      90
    ),
    starCount: inRange(
      integer(
        source,
        'starCount',
        'presentation.sky.starCount',
        DEFAULT_SKY_STAR_COUNT
      ),
      'presentation.sky.starCount',
      0,
      10_000
    ),
    starSeed: inRange(
      integer(
        source,
        'starSeed',
        'presentation.sky.starSeed',
        DEFAULT_SKY_STAR_SEED
      ),
      'presentation.sky.starSeed',
      0,
      0xff_ff_ff_ff
    )
  };
};

const readWireframe = (
  value: unknown,
  path = 'presentation.wireframe'
): WireframeSettings => {
  const source = block(value, path);
  return {
    glow: inRange(
      number(source, 'glow', `${path}.glow`, DEFAULT_WIREFRAME_GLOW),
      `${path}.glow`,
      0,
      1
    ),
    thickness: inRange(
      number(
        source,
        'thickness',
        `${path}.thickness`,
        DEFAULT_WIREFRAME_THICKNESS
      ),
      `${path}.thickness`,
      1,
      4
    )
  };
};

/// The closed preset vocabulary, narrowed where the vocabulary itself is declared.
export const isPresentationPreset = (
  value: unknown
): value is PresentationPreset => value === 'authentic' || value === 'enhanced';

export const isStructureReach = (value: unknown): value is StructureReach =>
  value === 'cell' || value === 'all';

export const isCastShadows = (value: unknown): value is CastShadows =>
  value === 'off' || value === 'on';

export const isLightLevel = (value: unknown): value is LightLevel =>
  (LIGHT_LEVELS as readonly unknown[]).includes(value);

export const isShadowDepth = (value: unknown): value is ShadowDepth =>
  (SHADOW_DEPTHS as readonly unknown[]).includes(value);

/// A stored choice from before the edge was exact (ADR 0069): `soft` and `hard` were both
/// shadows on.
export const readCastShadows = (value: unknown): CastShadows | undefined =>
  isCastShadows(value)
    ? value
    : value === 'soft' || value === 'hard'
      ? 'on'
      : undefined;

const readGlowDistance = (value: unknown): GlowDistanceSettings => {
  const path = 'presentation.glowDistance';
  const source = block(value, path);
  const fadeStart = inRange(
    number(
      source,
      'fadeStart',
      `${path}.fadeStart`,
      DEFAULT_GLOW_DISTANCE.fadeStart
    ),
    `${path}.fadeStart`,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const fadeEnd = positive(
    number(source, 'fadeEnd', `${path}.fadeEnd`, DEFAULT_GLOW_DISTANCE.fadeEnd),
    `${path}.fadeEnd`
  );
  if (fadeEnd <= fadeStart) {
    return refuse(`${path}.fadeEnd must be greater than fadeStart`);
  }
  return { fadeEnd, fadeStart };
};

const readPresentation = (value: unknown): PresentationSettings => {
  const source = block(value, 'presentation');
  const namedPreset = source['preset'];
  const namedStructureReach = source['structureReach'];
  let preset: PresentationPreset = DEFAULT_PRESENTATION_PRESET;
  let structureReach: StructureReach = DEFAULT_STRUCTURE_REACH;
  if (!unnamed(namedPreset)) {
    if (!isPresentationPreset(namedPreset)) {
      return refuse(
        `presentation.preset should be "authentic" or "enhanced", and is ${shown(namedPreset)}`
      );
    }
    preset = namedPreset;
  }
  if (!unnamed(namedStructureReach)) {
    if (!isStructureReach(namedStructureReach)) {
      return refuse(
        `presentation.structureReach should be "cell" or "all", and is ${shown(namedStructureReach)}`
      );
    }
    structureReach = namedStructureReach;
  }
  return {
    glowDistance: readGlowDistance(source['glowDistance']),
    preset,
    roads: readWireframe(source['roads'], 'presentation.roads'),
    sky: readSky(source['sky']),
    structureReach,
    wireframe: readWireframe(source['wireframe'])
  };
};

export const defaultSettings = (): Settings => ({
  arrival: readArrival(undefined),
  departure: readDeparture(undefined),
  flight: readFlight(undefined),
  message: readMessage(undefined),
  presentation: readPresentation(undefined),
  scripts: readScripts(undefined)
});

/// The host bounds and knobs the control loop takes, for one world's extent.
///
/// Every field is named rather than spread across from the block, so that a knob added to the
/// settings without a home in `ControlLimits` is a type error here rather than a value that
/// travels into the loop and is quietly ignored.
export const flightLimits = (
  flight: FlightSettings,
  groundExtent: number
): ControlLimits =>
  controlLimits({
    groundAltitude: flight.groundAltitude,
    groundExtent,
    pitchScale: flight.pitchScale,
    referenceFrameRate: flight.referenceFrameRate,
    runMultiplier: flight.runMultiplier,
    speedScale: flight.speedScale,
    throttleFloorNotch: flight.throttleFloorNotch,
    turnScale: flight.turnScale
  });

/// The flight model these knobs produce for one payload's parameters.
export const flightModel = (
  flight: FlightSettings,
  document: FlightDocument,
  groundExtent: number
): FlightModel =>
  buildFlightModel(document, flightLimits(flight, groundExtent));

/// The Benson Display's pacing in play (ADR 0083).
export const bensonPacing = (settings: Settings): BensonPacing => ({
  holdSeconds: settings.message.holdSeconds,
  waitSeconds: settings.message.waitSeconds
});

/// Load a settings document, or the defaults when there is none.
///
/// The kit's `Settings.load(at:read:)` takes the file's location and a way to read it, so that
/// a test can supply bytes without a file existing. The port keeps the seam and moves it one
/// step further out: the caller has already done the reading, and passes the text, or
/// `undefined` when there was nothing to read. That suits every host the port has — a browser
/// fetch that 404s, a `Bun.file` that is not there, a test with a string literal — and none of
/// them has to agree about what a path is.
export const loadSettings = (text: string | undefined): Settings => {
  if (text === undefined) {
    return defaultSettings();
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return refuse(String(error));
  }
  if (
    typeof document !== 'object' ||
    document === null ||
    Array.isArray(document)
  ) {
    return refuse(
      `the document should be an object, and is ${shown(document)}`
    );
  }
  const source = document as Record<string, unknown>;
  return {
    arrival: readArrival(source['arrival']),
    departure: readDeparture(source['departure']),
    flight: readFlight(source['flight']),
    message: readMessage(source['message']),
    presentation: readPresentation(source['presentation']),
    scripts: readScripts(source['scripts'])
  };
};
