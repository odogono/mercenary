import {
  blockFor,
  settle,
  speedFixedPoint,
  yawFixedPoint,
  type FlightMode,
  type Touchdown
} from '../flight/index.ts';
import { cos, sin } from '../math/index.ts';
import type { Containment } from '../navigation/index.ts';
import type { HeadingConvention, Vector3 } from '../orientation/index.ts';
import type {
  Block,
  EndgameDocument,
  FlightDocument,
  FlightRules,
  UndergroundEntrance,
  UndergroundLift
} from '../payload/documents.ts';
import { wrapSurfaceAxis } from '../world/surfaceCoordinates.ts';

/// The simulation. A pure function of state, intent and elapsed time.
///
/// Determinism is kept as a design property rather than a logging system: the same inputs always
/// produce the same state, which is what makes a side-by-side comparison against the Reference
/// Build meaningful — and what a Replay Gate is.
///
/// The Reference Build has two Movers: a craft reaches the filtered control loop over its Craft
/// Parameter Block, while a player on foot takes a fixed step and fixed turn (ADR 0016).
/// `integrate` selects between them. Every arithmetic order below is the kit's, down to which side
/// of a product a tuning scale is applied on, because a replay compares values rather than shapes.
///
/// `enter` and `surface` are not movers: they put the player where a lift ride would have left
/// them. `GameplaySession.rideLift` is the caller. Movement traces that start underground still
/// set `room` on the state they start from, as their trace headers do.

const TURN = 2 * Math.PI;

/// Captured Reference Build eye height, used by the opening and the on-foot view.
export const REFERENCE_WALKING_EYE_ALTITUDE = 128;

/// The altitude byte the tumble handler subtracts its drop from.
const ALTITUDE_MIDDLE_BYTE = 0x1_00;

/// The attitude the Interstellar Ship's phase-0 handler pins, in radians:
/// `$AA6E`'s stored pitch high byte against the decoded level of
/// `rules.levelPitch`, which for the exported byte is a quarter turn nose-up.
///
/// The byte itself is not written here. It lives in the endgame Data Payload
/// as `endingPresentation.slot7PitchHighByte`, guarded against the image by
/// the payload export, because a native constant duplicated into TypeScript
/// stops being evidence of anything (#110).
export const slot7Pitch = (rules: FlightRules, pitchHighByte: number): number =>
  wrapPitch(
    ((rules.levelPitch - (pitchHighByte << 8)) / rules.angleUnitsPerTurn) * TURN
  );

/// The `$A13D` box and its decoded entry/exit effects, as the endgame Data
/// Payload carries them.
export type ColonyCraftRules = EndgameDocument['orbitalTransition'];

/// The decoded endgame rules the control loop itself reads. Passed into `step`
/// by the session; a caller without endgame content — a mover trace, say —
/// simply has neither, and neither handler can then write a byte it was never
/// given.
export interface EndgameRules {
  readonly colonyCraft: ColonyCraftRules;
  /// `$AA6E`'s immediate: what the Interstellar Ship's phase-0 arm stores into
  /// the pitch high byte before returning.
  readonly slot7PitchHighByte: number;
}

/// The pure box predicate at `$A13D`: the Colony Craft's cell, a sixteen-
/// middle-byte square within it, and an altitude middle byte high enough that
/// it can only be reached by climbing.
export const withinColonyCraftBox = (
  colonyCraft: ColonyCraftRules,
  position: Vector3
): boolean => {
  const x = Math.trunc(position.x);
  const y = Math.trunc(position.y);
  const z = Math.trunc(position.z);
  const [lower, upper] = colonyCraft.axisMiddleByteWindow;
  const [cellX, cellZ] = colonyCraft.cell;
  return (
    ((x >>> 16) & 0xff) === cellX &&
    ((z >>> 16) & 0xff) === cellZ &&
    ((x >>> 8) & 0xff) >= lower &&
    ((x >>> 8) & 0xff) < upper &&
    ((z >>> 8) & 0xff) >= lower &&
    ((z >>> 8) & 0xff) < upper &&
    ((y >>> 8) & 0xff) >= colonyCraft.minimumAltitudeByte
  );
};

/// Where a craft grounded on the Colony Craft deck rests: the entry's high
/// byte kept, the wrapped middle byte, and the same low byte every touchdown
/// rests at.
const deckRestAltitude = (colonyCraft: ColonyCraftRules): number =>
  (colonyCraft.entry.altitudeHighByte << 16) |
  (colonyCraft.entry.wrappedAltitudeMiddleByte << 8) |
  colonyCraft.entry.restAltitudeLowByte;

/// Where the Reference Build's opening leaves the player: the captured crash position, at the
/// captured eye height.
///
/// One exported capture rather than the literal at each site, because the page draws its fixed
/// pose from it and every mover emitter starts its run from it — two spellings of one recorded
/// fact could disagree about where the game begins.
export const REFERENCE_OPENING_POSITION: Vector3 = {
  x: 559_104,
  y: REFERENCE_WALKING_EYE_ALTITUDE,
  z: 559_104
};

/// Longest step either Mover will be advanced by at once. A stalled frame becomes several bounded
/// steps instead of one teleport through the world.
export const MAXIMUM_STEP = 1 / 30;

/// A device-independent movement intent for one simulation step.
///
/// The app layer turns keys into this; the core never sees an input device. Throttle is not here:
/// in the Reference Build it is a persistent setting rather than a held input, so it lives in
/// `GameState` and is changed through `throttleNotch` and `throttleStep`.
export interface Intent {
  /// Free Look input on foot (ADR 0059), an Extension: positive tilts the view up. The profile
  /// leaves it at zero unless the player has turned Extended Controls on.
  readonly look: number;
  /// Pitch input. Positive is nose up.
  readonly pitch: number;
  readonly running: boolean;
  /// Strafe input on foot (ADR 0059), an Extension: positive sidesteps to the right. Like `look`
  /// it is zero unless Extended Controls is on.
  readonly strafe: number;
  /// Yaw input. Positive turns right, which the loop reaches by negating the craft's yaw
  /// authority exactly as the Reference Build's `INY` on a sign bit did.
  readonly turn: number;
  /// On foot only: how hard the player is walking.
  ///
  /// A held axis rather than a persistent setting, because there is no on-foot throttle for it to
  /// be: the Reference Build walks by a fixed step held at `$AA/$AB` and never reaches a Craft
  /// Parameter Block (ADR 0016). It scales that decoded step directly, so letting go stops the
  /// player rather than leaving a notch selected.
  readonly walk: number;
}

/// Axes are clamped on construction so a caller cannot smuggle in extra speed, and a value that
/// is not a number becomes no input rather than a state of NaNs.
const clampAxis = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0;

export const intent = (fields: {
  readonly look?: number;
  readonly pitch?: number;
  readonly running?: boolean;
  readonly strafe?: number;
  readonly turn?: number;
  readonly walk?: number;
}): Intent => ({
  look: clampAxis(fields.look ?? 0),
  pitch: clampAxis(fields.pitch ?? 0),
  running: fields.running ?? false,
  strafe: clampAxis(fields.strafe ?? 0),
  turn: clampAxis(fields.turn ?? 0),
  walk: clampAxis(fields.walk ?? 0)
});

export const IDLE: Intent = intent({});

/// Walking and strafing together, scaled so that the two at once go no faster than walking alone
/// (ADR 0059). With no strafe, which is all faithful play ever gives, the walk is returned as it
/// came.
export const footAxes = (
  intent: Intent
): { readonly strafe: number; readonly walk: number } => {
  if (intent.strafe === 0) {
    return { strafe: 0, walk: intent.walk };
  }
  const scale = 1 / Math.max(1, Math.hypot(intent.walk, intent.strafe));
  return { strafe: intent.strafe * scale, walk: intent.walk * scale };
};

/// How far Free Look tilts the view either way from level: about 60° (ADR 0059).
export const FREE_LOOK_LIMIT = Math.PI / 3;

/// How fast a held Free Look control tilts the view, in radians a second: from level to the
/// limit in one second.
export const FREE_LOOK_RATE = Math.PI / 3;

/// Free Look's pitch after `seconds` of `look`: a fixed rate, held within the limit, and left
/// where it is when the control is let go. Both Titles' sessions keep it and write it into the
/// Pose on foot; no Save carries it.
export const freeLook = (
  pitch: number,
  look: number,
  seconds: number
): number =>
  look === 0
    ? pitch
    : Math.min(
        FREE_LOOK_LIMIT,
        Math.max(-FREE_LOOK_LIMIT, pitch + look * FREE_LOOK_RATE * seconds)
      );

/// Host bounds and the tuning knobs for how the decoded dynamics feel.
///
/// The Reference Build's parameters are per-frame values, so the rate they were written for is the
/// one knob that changes everything at once; the scales are there for judging feel by playing
/// (ADR 0014).
export interface ControlLimits {
  /// Eye height on foot. Defaults to the captured Reference Build height and is here so it can be
  /// judged separately.
  readonly groundAltitude: number | undefined;
  readonly groundExtent: number;
  readonly pitchScale: number;
  /// Frames per second the decoded parameters were written for. The loop solves its filters for
  /// any timestep, so this sets the pace without setting the simulation's step.
  readonly referenceFrameRate: number;
  /// How much faster a held run key walks. The Reference Build had no run, so this is a Mac
  /// Adaptation on a decoded step rather than anything it did.
  readonly runMultiplier: number;
  readonly speedScale: number;
  /// The notch the lowest throttle key selects.
  ///
  /// The decoded ladder is ten notches each twice the last, so it spans 512 to 1 and its bottom
  /// rungs are imperceptible whatever the overall speed. Starting the keys part way up trades
  /// reach for ten keys that all do something. It maps keys to notches and changes nothing about
  /// the ladder itself.
  readonly throttleFloorNotch: number;
  readonly turnScale: number;
}

const DEFAULT_LIMITS: ControlLimits = {
  groundAltitude: undefined,
  groundExtent: 1_048_576,
  pitchScale: 1,
  referenceFrameRate: 20,
  runMultiplier: 3,
  speedScale: 1,
  throttleFloorNotch: 1,
  turnScale: 1
};

export const controlLimits = (
  overrides: Partial<ControlLimits> = {}
): ControlLimits => ({ ...DEFAULT_LIMITS, ...overrides });

/// The decoded craft dynamics the loop runs on, plus the few values that are ours.
///
/// Everything in `document` came out of the Reference Build; everything in `limits` is either a
/// host bound or a tuning knob, and none of it changes what the loop computes from the decoded
/// parameters. The derived members are computed once, where the kit computes them once, so that a
/// scale is applied to a decoded value the same number of times on both sides.
export interface FlightModel {
  readonly document: FlightDocument;
  /// Eye height on foot: the tuning knob's, or the captured Reference Build height.
  readonly groundAltitude: number;
  /// Only frozen Replay Gates use the pre-recovery heading convention.
  readonly headingConvention?: HeadingConvention;
  readonly limits: ControlLimits;
  /// One angle unit in radians. The Reference Build's turn is 1024 units.
  readonly radiansPerUnit: number;
  readonly rules: FlightRules;
  /// Decoded altitude where a craft settles after touchdown.
  readonly touchdownAltitude: number;
  /// The decoded on-foot step, already scaled by the tuning knob.
  readonly walkStep: number;
  /// The decoded on-foot turn, in angle units per frame, likewise scaled.
  readonly walkTurn: number;
}

export const flightModel = (
  document: FlightDocument,
  limits: ControlLimits = controlLimits()
): FlightModel => ({
  document,
  groundAltitude: limits.groundAltitude ?? REFERENCE_WALKING_EYE_ALTITUDE,
  limits,
  radiansPerUnit: TURN / document.rules.angleUnitsPerTurn,
  rules: document.rules,
  touchdownAltitude: document.rules.groundAltitude,
  walkStep: document.walk.step * limits.speedScale,
  walkTurn: document.walk.turnStep * limits.turnScale
});

export interface PlayerState {
  /// Reference yaw in radians: zero faces -Z; increasing yaw turns toward -X.
  readonly heading: number;
  /// Radians, positive nose up.
  readonly pitch: number;
  /// World position; the vertical component is altitude, which flight moves.
  readonly position: Vector3;
  /// Radians. Set from yaw velocity while flying, so a craft banks into its turn.
  readonly roll: number;
  /// World units per reference frame. Damped and driven by the throttle.
  readonly speed: number;
  /// Angle units per reference frame. Damped and driven by the yaw input.
  readonly yawVelocity: number;
}

export const playerState = (fields: {
  readonly heading?: number;
  readonly pitch?: number;
  readonly position: Vector3;
  readonly roll?: number;
  readonly speed?: number;
  readonly yawVelocity?: number;
}): PlayerState => ({
  heading: fields.heading ?? 0,
  pitch: fields.pitch ?? 0,
  position: fields.position,
  roll: fields.roll ?? 0,
  speed: fields.speed ?? 0,
  yawVelocity: fields.yawVelocity ?? 0
});

export interface GameState {
  /// The special transition flag the Reference Build keeps at `$FA`: `$FF`
  /// while the player is on the Colony Craft, zero otherwise. Set by flying
  /// into the `$A13D` box; cleared by every other flying frame, by lift rides,
  /// and by the tumble that ends a walk off the deck edge
  /// (`notes/decode/endgame.md`, "Colony Craft and `$A13D`").
  readonly colonyCraftFlag: number;
  /// The boarded craft's slot, or absent on foot. Selects the Craft Parameter Block.
  readonly craft: number | undefined;
  readonly elapsed: number;
  readonly mode: FlightMode;
  /// A Craft Parameter Block installed over the occupied craft's own, which the
  /// Reference Build does by copying that block's bytes into the live one. Only
  /// the crash tumble installs one, and reaching the ground clears it.
  readonly mover: number | undefined;
  readonly player: PlayerState;
  /// Whether a poweramp is fitted, which the Reference Build reads for one craft.
  readonly poweramp: boolean;
  /// The room the player is in, or absent on the surface.
  ///
  /// The Reference Build keeps this as a flag and a room id, and consults the flag before it
  /// decides anything else — underground, the on-foot mover runs whatever the player is standing
  /// in.
  readonly room: number | undefined;
  /// Walking frames left before another Doorway can be taken, counting down only while the player
  /// is actually walking.
  ///
  /// This is the interlock that matters. Arrival puts the player *inside* the Doorway on the other
  /// side, so without a gate that a stationary player cannot run down they would be handed
  /// straight back through it.
  readonly stepInterlock: number;
  /// Throttle in the engine's own world units, persistent as the original's was.
  readonly throttle: number;
  /// How the last touchdown ended, for the caller to act on once.
  readonly touchdown: Touchdown | undefined;
  /// Reference frames left in the transition a Doorway starts, counting down.
  ///
  /// While it runs, no Doorway can be taken. It is world time and not script time: the Reference
  /// Build counts it in the frame loop, so slowing the scripts down for legibility must not slow
  /// this down with them.
  readonly transitionCooldown: number;
  /// How many axes the Room's walls had to move the player back along this frame. Nonzero is wall
  /// contact, which is what a Doorway is opened by.
  readonly wallContact: number;
  /// The same count from the frame before, which is the only thing that keeps the wall from
  /// sounding once a frame for as long as the player leans on it.
  readonly wallContactLatch: number;
  /// Whether the world is mirrored left for right.
  ///
  /// One Room toggles this on arrival, and the Reference Build keeps it as a single bit read in two
  /// quite different places: the coordinate transform, where it negates camera-space X, and the
  /// input byte, where it swaps the two turn bits.
  readonly worldFlipped: boolean;
}

export const gameState = (fields: {
  readonly colonyCraftFlag?: number;
  readonly craft?: number;
  readonly elapsed?: number;
  readonly mode?: FlightMode;
  readonly mover?: number;
  readonly player: PlayerState;
  readonly poweramp?: boolean;
  readonly room?: number;
  readonly throttle?: number;
  readonly touchdown?: Touchdown;
}): GameState => ({
  colonyCraftFlag: fields.colonyCraftFlag ?? 0,
  craft: fields.craft,
  elapsed: fields.elapsed ?? 0,
  mode: fields.mode ?? 'grounded',
  mover: fields.mover,
  player: fields.player,
  poweramp: fields.poweramp ?? false,
  room: fields.room,
  stepInterlock: 0,
  throttle: fields.throttle ?? 0,
  touchdown: fields.touchdown,
  transitionCooldown: 0,
  wallContact: 0,
  wallContactLatch: 0,
  worldFlipped: false
});

/// Whether the wall should sound: contact now, and none last frame.
export const wallThud = (state: GameState): boolean =>
  state.wallContact !== 0 && state.wallContactLatch === 0;

/// The unit direction the player faces.
///
/// This is the basis the craft control loop translates along, named so that a
/// shot and the craft that fired it cannot drift apart: the Reference Build
/// builds both from the same three components — the pitch cosine times the
/// heading sine, the pitch sine, and the pitch cosine times the heading cosine.
/// Its raw level pitch is a half turn, hence the negative horizontal terms.
export const facing = (
  player: PlayerState,
  convention: HeadingConvention = 'reference'
): Vector3 => {
  const cosPitch = cos(player.pitch);
  const sign = convention === 'traceOracle' ? 1 : -1;
  return {
    x: cosPitch * sin(player.heading) * sign,
    y: sin(player.pitch),
    z: cosPitch * cos(player.heading) * sign
  };
};

/// Whether the Reference Build's one craft-conditioned bonus applies here.
const hasPoweramp = (flight: FlightModel, state: GameState): boolean =>
  state.poweramp && state.craft === flight.rules.poweramp.craft;

/// The throttle the loop sees, after the Reference Build's one Object-Conditioned Predicate on the
/// player's first craft.
export const effectiveThrottle = (
  flight: FlightModel,
  state: GameState
): number =>
  hasPoweramp(flight, state)
    ? state.throttle * flight.rules.poweramp.throttleScale
    : state.throttle;

/// This craft's ceiling, raised for the one craft the poweramp lifts.
export const ceilingFor = (
  flight: FlightModel,
  state: GameState,
  block: Block
): number =>
  hasPoweramp(flight, state)
    ? Math.max(block.ceiling, flight.rules.poweramp.ceiling)
    : block.ceiling;

/// Which notch a throttle key stands for, counting from the ladder window's floor and stopping at
/// the top rather than running off it.
export const notchForKey = (flight: FlightModel, key: number): number => {
  const ladder = flight.rules.throttleNotches.length;
  return Math.min(
    ladder,
    Math.max(1, flight.limits.throttleFloorNotch + key - 1)
  );
};

const wrap = (radians: number): number => {
  // JavaScript's `%` is a truncating remainder, which is the operation the kit calls by name.
  const remainder = radians % TURN;
  return remainder < 0 ? remainder + TURN : remainder;
};

/// The frozen Trace Oracle predates out-of-city travel and retains its accepted
/// city-edge clamp. Live play uses the Reference Build's full 24-bit surface.
export type SurfaceBounds = 'city' | 'world';

const surfaceAxis = (
  value: number,
  flight: FlightModel,
  bounds: SurfaceBounds
): number =>
  bounds === 'city'
    ? Math.min(flight.limits.groundExtent, Math.max(0, value))
    : wrapSurfaceAxis(value);

/// The shortest signed turn to an angle: what pitch wraps to, and what any caller steering toward
/// a heading needs.
///
/// Pitch wraps rather than clamps because the Reference Build's ten-bit pitch does: a craft can be
/// flown right over the top.
export const wrapPitch = (radians: number): number => {
  let wrapped = radians % TURN;
  if (wrapped > Math.PI) {
    wrapped -= TURN;
  }
  if (wrapped < -Math.PI) {
    wrapped += TURN;
  }
  return wrapped;
};

/// The Reference Build's ten-bit pitch, where level is half a turn and larger values are nose
/// down. The tests it applies are written in those terms.
export const rawPitch = (radians: number, rules: FlightRules): number => {
  const units = rules.angleUnitsPerTurn;
  const raw = rules.levelPitch - (radians / TURN) * units;
  const wrapped = raw % units;
  return wrapped < 0 ? wrapped + units : wrapped;
};

/// Stop everything at the supplied craft or walking altitude. Both crossings of the craft door
/// begin from rest, but their vertical positions differ.
const settleOnGround = (state: GameState, altitude: number): GameState => ({
  ...state,
  mode: 'grounded',
  player: {
    ...state.player,
    pitch: 0,
    position: { ...state.player.position, y: altitude },
    roll: 0,
    speed: 0,
    yawVelocity: 0
  },
  throttle: 0
});

/// Set the throttle to one of the ladder's notches, as a digit key did.
export const throttle = (
  state: GameState,
  notch: number,
  rules: FlightRules
): GameState => {
  const value = rules.throttleNotches[notch - 1];
  if (notch < 1 || value === undefined) {
    return state;
  }
  return { ...state, throttle: value };
};

/// Double or halve the throttle, as the relative keys did, stopping at the engine's own limit and
/// at the bottom of the ladder.
///
/// The kit spells this as a second `throttle(_:step:rules:)`; TypeScript has no overloads on a
/// label, so the two are named apart. `direction` is that `step:`, and only its sign is read.
export const throttleStep = (
  state: GameState,
  direction: number,
  rules: FlightRules
): GameState => {
  const lowest = rules.throttleNotches[0];
  if (direction === 0 || lowest === undefined) {
    return state;
  }
  if (direction > 0) {
    const raised = state.throttle === 0 ? lowest : state.throttle * 2;
    // The Reference Build refused the change rather than clamping it.
    if (!(raised < rules.throttleLimit)) {
      return state;
    }
    return { ...state, throttle: raised };
  }
  const lowered = state.throttle / 2;
  return { ...state, throttle: lowered < lowest ? 0 : lowered };
};

/// Board a craft: the Reference Build took its position and its heading. On the
/// Colony Craft deck there is no ordinary surface ground to settle onto, so the
/// deck altitude survives boarding just as it survives leaving.
export const board = (
  state: GameState,
  craft: number,
  position: Vector3,
  heading: number,
  flight: FlightModel
): GameState =>
  settleOnGround(
    {
      ...state,
      craft,
      player: {
        ...state.player,
        heading,
        position: { x: position.x, y: state.player.position.y, z: position.z }
      }
    },
    state.colonyCraftFlag !== 0
      ? state.player.position.y
      : flight.touchdownAltitude
  );

/// Leave the craft, which puts the player back on the walking block. On the
/// Colony Craft deck the altitude survives, as it does everywhere the native
/// walking routine runs: there is no ground down there to settle onto.
export const leave = (state: GameState, flight: FlightModel): GameState =>
  settleOnGround(
    { ...state, craft: undefined },
    state.colonyCraftFlag !== 0
      ? state.player.position.y
      : flight.groundAltitude
  );

/// The room id whose indoor lift ride leaves the special transition flag set.
///
/// `$B455-$B462` loads X with zero, compares the room id against an immediate
/// `$08`, and stores X into `$FA`: rooms below 8 leave X at zero, room 8
/// exactly decrements X to `$FF`, and rooms above 8 never reach the arm. So
/// this is the one indoor ride that surfaces onto the Colony Craft's own cell
/// with the flag still set.
export const COLONY_CRAFT_LIFT_ROOM = 8;

/// Take the lift down into a room. Puts the player where the ride would have left them.
///
/// The downward ride clears the special transition flag (`$A2F7`) but leaves
/// the boarded-craft byte alone, so a craft on the surface pad descends with
/// its Occupancy intact just as one in a hangar ascends with it intact.
export const enter = (
  state: GameState,
  entrance: UndergroundEntrance,
  lift: UndergroundLift,
  flight: FlightModel
): GameState => {
  const middle = lift.submergeMiddle << 8;
  return {
    ...state,
    colonyCraftFlag: 0,
    mode: 'grounded',
    player: {
      heading: state.player.heading,
      pitch: 0,
      position: { x: middle, y: flight.groundAltitude, z: middle },
      roll: 0,
      speed: 0,
      yawVelocity: 0
    },
    room: entrance.room,
    throttle: 0
  };
};

/// Take the lift back up, onto the surface cell it serves.
///
/// The decoded transition (`$A28E-$A2BA`) writes the horizontal pair only —
/// lows zeroed, middles at the pad, highs from the site tables — and leaves
/// the boarded-craft byte alone. Ordinary surface lifts retain their indoor
/// resting altitude. Room 8 instead completes on the Colony Craft deck, whose
/// decoded resting altitude replaces the room floor height.
///
/// The same arm writes the special transition flag, so the value it writes is
/// decided here rather than by the caller: see `COLONY_CRAFT_LIFT_ROOM`.
export const surface = (
  state: GameState,
  entrance: UndergroundEntrance,
  lift: UndergroundLift,
  cellSize: number,
  colonyCraft: ColonyCraftRules | undefined
): GameState => {
  const middle = lift.surfaceMiddle << 8;
  const column = entrance.cell[0] ?? 0;
  const row = entrance.cell.length === 2 ? entrance.cell[1]! : 0;
  return {
    ...state,
    colonyCraftFlag:
      entrance.room === COLONY_CRAFT_LIFT_ROOM
        ? (colonyCraft?.entry.flagValue ?? 0)
        : 0,
    mode: 'grounded',
    player: {
      ...state.player,
      pitch: state.player.pitch,
      position: {
        x: column * cellSize + middle,
        y:
          entrance.room === COLONY_CRAFT_LIFT_ROOM && colonyCraft !== undefined
            ? deckRestAltitude(colonyCraft)
            : state.player.position.y,
        z: row * cellSize + middle
      },
      speed: 0,
      yawVelocity: 0
    },
    room: undefined
  };
};

/// Whether a touchdown was a landing or a crash: descent rate, then pitch.
const verdict = (
  pitch: number,
  descentRate: number,
  rules: FlightRules
): Touchdown => {
  if (descentRate >= rules.crashDescentRate) {
    return 'crashed';
  }
  // The Reference Build tests only the nose-down side directly; a nose-up attitude has to wrap
  // past a half turn before it counts, which it lets land.
  return rawPitch(pitch, rules) >= rules.crashPitch ? 'crashed' : 'landed';
};

/// Cross the altitude band in either direction, which is the only way the Reference Build entered
/// or left flight.
const transition = (
  state: GameState,
  descentRate: number,
  flight: FlightModel,
  colonyCraft?: ColonyCraftRules
): GameState => {
  const rules = flight.rules;
  const band = rules.groundBand;
  const player = state.player;
  // On the Colony Craft deck the ground is four million units up, so the
  // take-off boundary is the deck's own rest altitude — the low byte passing
  // `$3F` — rather than the surface band.
  const takeoffAbove =
    state.colonyCraftFlag !== 0 && colonyCraft !== undefined
      ? deckRestAltitude(colonyCraft) + 1
      : band;
  if (state.mode === 'grounded' && player.position.y >= takeoffAbove) {
    return { ...state, mode: 'flying' };
  }
  if (state.mode === 'flying' && player.position.y < band) {
    return {
      ...state,
      mode: 'grounded',
      player: {
        ...player,
        // Touchdown forces pitch back to level when it is past it.
        pitch:
          rawPitch(player.pitch, rules) > rules.levelPitch ? 0 : player.pitch,
        position: { ...player.position, y: flight.touchdownAltitude },
        roll: 0
      },
      touchdown: verdict(player.pitch, descentRate, rules)
    };
  }
  return state;
};

/// The on-foot mover: a fixed step and a fixed turn, with no velocity to build and none to shed.
///
/// It cannot change altitude, because the routine it comes from has no vertical term at all —
/// which is also why a walker can never leave the ground.
const walk = (
  state: GameState,
  intent: Intent,
  dt: number,
  flight: FlightModel,
  colonyCraft: ColonyCraftRules | undefined,
  containment: Containment | undefined,
  surfaceBounds: SurfaceBounds
): GameState => {
  const player = state.player;
  const frames = dt * flight.limits.referenceFrameRate;
  if (!(frames > 0)) {
    return state;
  }

  const headingSign = flight.headingConvention === 'traceOracle' ? 1 : -1;
  const heading = wrap(
    player.heading +
      intent.turn *
        flight.walkTurn *
        frames *
        flight.radiansPerUnit *
        headingSign
  );
  // Walking backwards is the step negated, as the Reference Build did it by flipping the sign bit
  // of the one value rather than keeping two. Strafe, an Extension, is the same step at right
  // angles to the heading, and running scales it alike.
  const axes = footAxes(intent);
  const run = intent.running ? flight.limits.runMultiplier : 1;
  const advance = axes.walk * flight.walkStep * run * frames;
  const sidestep = axes.strafe * flight.walkStep * run * frames;
  // The routine this comes from has no vertical term. An ordinary walker is
  // held at the walking eye height as before, but a boarded craft taxiing
  // indoors and a walker on the Colony Craft deck keep the altitude they
  // have, because the Reference Build never writes it here at all.
  // The right of the heading is (cos, -sin) under either heading convention: a quarter turn
  // right negates the convention's sign along with the sines it multiplies.
  const stepped: Vector3 = {
    x:
      player.position.x +
      sin(heading) * advance * headingSign +
      (sidestep === 0 ? 0 : cos(heading) * sidestep),
    y:
      state.craft !== undefined || state.colonyCraftFlag !== 0
        ? player.position.y
        : flight.groundAltitude,
    z:
      player.position.z +
      cos(heading) * advance * headingSign -
      (sidestep === 0 ? 0 : sin(heading) * sidestep)
  };

  let position: Vector3;
  let wallContact = 0;
  let wallContactLatch = 0;
  let stepInterlock = state.stepInterlock;
  if (containment === undefined) {
    position = {
      x: surfaceAxis(stepped.x, flight, surfaceBounds),
      y: stepped.y,
      z: surfaceAxis(stepped.z, flight, surfaceBounds)
    };
  } else {
    // Inside a Room the walls are the bound, and touching one is recorded rather than merely
    // obeyed: the count is what the traversal path asks for before it will look for a Doorway at
    // all.
    wallContactLatch = state.wallContact;
    const contained = containment.clamp(stepped);
    wallContact = contained.contacts;
    position = contained.position;
    // The step interlock runs down inside the on-foot Mover, so it stalls while the player
    // stands still — which is the whole point of it being steps rather than time.
    if (intent.walk !== 0 || intent.strafe !== 0) {
      stepInterlock = Math.max(0, stepInterlock - frames);
    }
  }

  const walked: GameState = {
    ...state,
    elapsed: state.elapsed + dt,
    mode: 'grounded',
    player: {
      heading,
      // None of the craft's dynamics survive stepping out of one.
      pitch: 0,
      position,
      roll: 0,
      speed: intent.walk * flight.walkStep,
      yawVelocity: 0
    },
    stepInterlock,
    wallContact,
    wallContactLatch
  };
  // The walking caller at `$A1DA`: every on-foot surface frame with the
  // special transition flag set runs the box predicate, and a step outside it
  // installs mover 9 — the crash tumble. Walking off the Colony Craft's deck
  // edge is a fall back to Targ.
  if (
    colonyCraft !== undefined &&
    state.colonyCraftFlag !== 0 &&
    state.craft === undefined &&
    state.room === undefined &&
    !withinColonyCraftBox(colonyCraft, position)
  ) {
    return { ...walked, mode: 'flying', mover: colonyCraft.exitMover };
  }
  return walked;
};

/// The crash tumble: falling, spinning, and answering nothing.
///
/// The Reference Build installs this block over the craft's own and then reads
/// no input at all — the three angles each advance by their own fixed step and
/// the altitude falls by its own. Reaching the ground hands over to the same
/// resolution an ordinary crash reaches, so a tumble ends in play rather than
/// in an Ending.
const tumble = (
  state: GameState,
  block: Block,
  flight: FlightModel
): GameState => {
  const rates = block.tumble;
  const frames = 1;
  if (rates === undefined) {
    return state;
  }
  const player = state.player;
  const limits = flight.limits;
  // The handler subtracts its drop from the altitude's middle byte, so a step
  // is that many of them.
  const fall = rates.altitudeDrop * ALTITUDE_MIDDLE_BYTE;
  const y = player.position.y - fall * frames;
  const step = (units: number): number =>
    units * frames * flight.radiansPerUnit;
  const spun: GameState = {
    ...state,
    elapsed: state.elapsed,
    player: {
      ...player,
      heading: wrap(player.heading + step(rates.yawStep)),
      pitch: wrap(player.pitch + step(rates.pitchStep)),
      position: { ...player.position, y: Math.max(0, y) },
      roll: wrap(player.roll + step(rates.rollStep))
    }
  };
  if (y > 0) {
    return spun;
  }
  // The ground arrives, and the tumble is over: the same verdict an ordinary
  // touchdown gets, and the installed block goes with it. The altitude
  // underflow is also what clears the special transition flag (`$9ED0`),
  // which is why a walker who fell off the Colony Craft does not fall again.
  return transition(
    { ...spun, colonyCraftFlag: 0, mover: undefined },
    fall / Math.max(frames, 1),
    flight
  );
};

const integrate = (
  state: GameState,
  intent: Intent,
  dt: number,
  flight: FlightModel,
  containment: Containment | undefined,
  endgame: EndgameRules | undefined,
  surfaceBounds: SurfaceBounds
): GameState => {
  const colonyCraft = endgame?.colonyCraft;
  // A grounded craft is pinned only while the Colony Craft box is beneath it.
  // Once it has crossed that boundary there is no surface at this altitude:
  // promote it to ordinary flight before the take-off-speed gate can pin its
  // pitch as though it were still taxiing on Targ. The on-foot path remains a
  // separate tumble handled by `walk` below.
  const releasedFromDeck =
    state.mode === 'grounded' &&
    state.craft !== undefined &&
    state.room === undefined &&
    state.colonyCraftFlag !== 0 &&
    colonyCraft !== undefined &&
    !withinColonyCraftBox(colonyCraft, state.player.position);
  // The transition counts down in the frame loop rather than in either mover, so it runs whether
  // the player is walking, flying or standing still.
  const counted: GameState = {
    ...state,
    mode: releasedFromDeck ? 'flying' : state.mode,
    transitionCooldown: Math.max(
      0,
      state.transitionCooldown - dt * flight.limits.referenceFrameRate
    )
  };
  // On foot the Reference Build does not run the control loop at all: `MOVE` dispatches to its own
  // routine whenever the player is out of a craft or underground. Only a craft — or an installed
  // mover, which `MOVE` dispatches by the same positive byte whether or not the player boarded
  // anything — reaches the Craft Parameter Blocks (ADR 0016). Walking off the Colony Craft deck
  // installs the tumble over a walker, which is why the mover is consulted before the craft.
  //
  // An installed block replaces the craft's own, which is how the Reference
  // Build flies a crash: it copies that block's bytes over the live ones.
  const installed = counted.mover ?? counted.craft;
  if (installed === undefined || counted.room !== undefined) {
    return walk(
      counted,
      intent,
      dt,
      flight,
      colonyCraft,
      containment,
      surfaceBounds
    );
  }

  const player = counted.player;
  const block = blockFor(flight.document, installed);
  if (block.handler === 'tumble') {
    return tumble(counted, block, flight);
  }
  if (block.handler === 'slot7') {
    // The Interstellar Ship's handler pins pitch nose-up and returns
    // (`$AA6E-$AA72`): no yaw, throttle, translation or altitude step runs,
    // so slot 7 cannot be flown. The handler's nonzero-phase arm is
    // the terminal renderer, which is presentation rather than a Mover.
    //
    // Without endgame content there is no decoded byte to write, and the
    // handler writes nothing rather than inventing one.
    return {
      ...counted,
      elapsed: counted.elapsed + dt,
      player:
        endgame === undefined
          ? player
          : {
              ...player,
              pitch: slot7Pitch(flight.rules, endgame.slot7PitchHighByte)
            }
    };
  }
  const rules = flight.rules;
  const limits = flight.limits;
  // The decoded parameters are per-frame, so a step is a number of frames.
  const frames = dt * limits.referenceFrameRate;
  if (!(frames > 0)) {
    return counted;
  }

  // Yaw: velocity damps, then takes its input. Turning right negates the authority, which is all
  // the Reference Build's INY on the sign bit did.
  const headingSign = flight.headingConvention === 'traceOracle' ? 1 : -1;
  const authority =
    intent.turn * block.yawAuthority * limits.turnScale * headingSign;
  const yawTarget = yawFixedPoint(authority, block.yawDamping);
  const yawVelocity = settle(
    player.yawVelocity,
    yawTarget,
    block.yawDamping,
    frames
  );
  const heading = wrap(
    player.heading + yawVelocity * frames * flight.radiansPerUnit
  );

  // Speed: takes its input, then damps. The other filter's shape. The tuning scale is applied to
  // the target rather than to the settled value, so the filter converges on the scaled speed
  // instead of chasing a target it will never reach.
  const speedTarget = speedFixedPoint(
    effectiveThrottle(flight, counted),
    block.throttleGain,
    block.speedDamping
  );
  const speed = settle(
    player.speed,
    speedTarget * limits.speedScale,
    block.speedDamping,
    frames
  );

  // Pitch is a direct step with no filter, and only where the block allows one: the sinking craft
  // have their pitch step zeroed so they cannot be pitched. The take-off gate is a speed and
  // nothing else, which it can afford to be because only a craft reaches this loop at all — a
  // walker cannot leave the ground however fast they move, since `walk` has no vertical term.
  const mayLeaveTheGround =
    counted.mode === 'flying' || Math.abs(speed) >= rules.takeoffSpeed;
  // On the Colony Craft deck the grounded pin holds whatever the speed, but
  // only while the box predicate does (`$A01B-$A02C`): a craft cannot pitch
  // off the deck, though it can taxi past the box edge and take off there.
  const deckPinned =
    counted.mode === 'grounded' &&
    counted.colonyCraftFlag !== 0 &&
    colonyCraft !== undefined &&
    withinColonyCraftBox(colonyCraft, player.position);
  let pitch = player.pitch;
  if (!mayLeaveTheGround || deckPinned) {
    // Below the take-off run the loop pins pitch level, as it does on foot.
    pitch = 0;
  } else if (block.pitchStep > 0) {
    const pitchStep = intent.pitch * block.pitchStep * limits.pitchScale;
    pitch = wrapPitch(pitch + pitchStep * frames * flight.radiansPerUnit);
  }

  // Roll is set from yaw velocity rather than accumulated, and only in flight.
  // The camera uses the negative of raw roll: a right turn decreases raw yaw
  // and raw roll, but raises the right-hand horizon with positive camera roll.
  const roll =
    counted.mode === 'flying'
      ? wrap(
          yawVelocity * block.rollCoupling * flight.radiansPerUnit * headingSign
        )
      : 0;

  // Translation, one axis at a time as the Reference Build did it.
  const advance = speed * frames;
  const direction = facing(
    { ...player, heading, pitch },
    flight.headingConvention
  );
  const x = surfaceAxis(
    player.position.x + direction.x * advance,
    flight,
    surfaceBounds
  );
  const z = surfaceAxis(
    player.position.z + direction.z * advance,
    flight,
    surfaceBounds
  );

  // Altitude only moves once the craft has the speed for it, which is the take-off run: on the
  // ground below that speed the vertical step is skipped.
  let climb = 0;
  let y = player.position.y;
  if (mayLeaveTheGround) {
    climb = sin(pitch) * advance * block.liftFactor;
    const ceiling = ceilingFor(flight, counted, block) * rules.ceilingUnit;
    if (climb > 0 && y > ceiling) {
      climb *= rules.ceilingClimbScale;
    }
    y += climb;
  }
  // The sinking handler loses height every frame whatever the player does.
  if (block.handler === 'sinking' && counted.mode === 'flying') {
    const drop = rules.ceilingUnit * frames;
    climb -= drop;
    y -= drop;
  }

  let moved: GameState = {
    ...counted,
    elapsed: counted.elapsed + dt,
    player: { heading, pitch, position: { x, y, z }, roll, speed, yawVelocity }
  };
  // The flying altitude path (`$A08E-$A0FD`) has three arms. At exactly the
  // entry high byte inside the box, the craft grounds on the Colony Craft
  // deck: middle byte wrapped, low byte rested, a forced landed verdict, and
  // the special transition flag set. The landing arm is `transition` below.
  // Every other flying frame clears the flag, which is why it cannot survive
  // ordinary flight.
  if (colonyCraft !== undefined && counted.mode === 'flying') {
    const position = moved.player.position;
    const yHigh = (Math.trunc(position.y) >>> 16) & 0xff;
    if (
      yHigh === colonyCraft.entry.altitudeHighByte &&
      withinColonyCraftBox(colonyCraft, position)
    ) {
      return {
        ...moved,
        colonyCraftFlag: colonyCraft.entry.flagValue,
        mode: 'grounded',
        player: {
          ...moved.player,
          // The grounding tail forces pitch back to level when it is past it,
          // as every touchdown does.
          pitch:
            rawPitch(moved.player.pitch, rules) > rules.levelPitch
              ? 0
              : moved.player.pitch,
          position: { ...position, y: deckRestAltitude(colonyCraft) },
          roll: 0
        },
        touchdown: 'landed'
      };
    }
    if (position.y >= rules.groundBand && moved.colonyCraftFlag !== 0) {
      moved = { ...moved, colonyCraftFlag: 0 };
    }
  }
  // The verdict on a touchdown is about how fast the craft was going down, so the rate is what
  // crosses the boundary rather than the step it came from.
  return transition(moved, Math.abs(climb) / frames, flight, colonyCraft);
};

/// Advance the world by `dt`.
///
/// `containment` is the Room the player is walking inside, when they are in one. It is passed in
/// rather than looked up because this is a pure function of what it is given, and because a Room's
/// walls are the only thing underground that the surface's own world bounds cannot express.
///
/// The touchdown is cleared once, before the subdivision rather than inside it, so a landing
/// reported on one slice survives the slices after it and is still there for the caller.
export const step = (
  state: GameState,
  intent: Intent,
  dt: number,
  flight: FlightModel,
  containment?: Containment,
  endgame?: EndgameRules,
  surfaceBounds: SurfaceBounds = 'world'
): GameState => {
  if (!Number.isFinite(dt) || dt <= 0) {
    return state;
  }
  let result: GameState =
    state.touchdown === undefined ? state : { ...state, touchdown: undefined };
  let remaining = dt;
  while (remaining > 0) {
    const slice = Math.min(remaining, MAXIMUM_STEP);
    result = integrate(
      result,
      intent,
      slice,
      flight,
      containment,
      endgame,
      surfaceBounds
    );
    remaining -= slice;
  }
  return result;
};
