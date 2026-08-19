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
/// All three of the kit's blocks are read, though only `flight` has a consumer at this stage of
/// the port: the tracked `settings.json` names `message` and `scripts` too, and a loader that
/// ignored them would take a typo in either without a word and then have to grow the strictness
/// back when the script machine arrives (#93). What is deliberately not here is the kit's
/// `bensonTunables(framesPerTick:)`, which assembles those two blocks into the shape the
/// interpreter takes — there is nothing to assemble it for yet.

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

/// How long a fully revealed message stays up to be read, and how fast it reveals.
export interface MessageSettings {
  /// Characters per second, before the script timing scale.
  readonly charactersPerSecond: number;
  readonly holdSeconds: number;
}

export interface ScriptSettings {
  /// Instructions one advance may run before yielding, which stands in for the frame boundary
  /// the original interpreter had for free.
  readonly instructionBudget: number;
  /// Multiplies the pace of the Reference Build's own script timing: its waits and its message
  /// reveal. The reading hold is deliberately not scaled by it.
  readonly timeScale: number;
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

export interface Settings {
  readonly flight: FlightSettings;
  readonly message: MessageSettings;
  readonly scripts: ScriptSettings;
}

/// Characters per second a conditioned Reference Build advances a message at.
export const DEFAULT_MESSAGE_CHARACTERS_PER_SECOND = 2;

/// How long a revealed message is left up to be read. Unlike the reveal rate this is not the
/// Reference Build's number scaled — it is a reading pause, and reading speed belongs to the
/// reader rather than to the original's clock.
export const DEFAULT_MESSAGE_HOLD_SECONDS = 3;

export const DEFAULT_SCRIPT_TIME_SCALE = 6;
export const DEFAULT_SCRIPT_INSTRUCTION_BUDGET = 512;

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

const readMessage = (value: unknown): MessageSettings => {
  const source = block(value, 'message');
  return {
    charactersPerSecond: number(
      source,
      'charactersPerSecond',
      'message.charactersPerSecond',
      DEFAULT_MESSAGE_CHARACTERS_PER_SECOND
    ),
    holdSeconds: number(
      source,
      'holdSeconds',
      'message.holdSeconds',
      DEFAULT_MESSAGE_HOLD_SECONDS
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
    ),
    timeScale: number(
      source,
      'timeScale',
      'scripts.timeScale',
      DEFAULT_SCRIPT_TIME_SCALE
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

export const defaultSettings = (): Settings => ({
  flight: readFlight(undefined),
  message: readMessage(undefined),
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
    flight: readFlight(source['flight']),
    message: readMessage(source['message']),
    scripts: readScripts(source['scripts'])
  };
};
