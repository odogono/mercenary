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
import type { Vector3 } from '../orientation/index.ts';
import type {
  Block,
  FlightDocument,
  FlightRules,
  UndergroundEntrance,
  UndergroundLift
} from '../payload/documents.ts';

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

/// The one write the Interstellar Ship's phase-0 handler makes: `$AA6E`
/// stores this into the pitch high byte and returns. Mirrored by
/// `endgame.json`'s `endingPresentation.slot7PitchHighByte`, which the
/// payload export guards against the image; the mover tests tie the two.
export const SLOT7_PITCH_HIGH_BYTE = 0x01;

/// The attitude that write pins, in radians: raw pitch `$0100` against the
/// decoded level of `rules.levelPitch`, a quarter turn nose-up.
export const slot7Pitch = (rules: FlightRules): number =>
  wrapPitch(
    ((rules.levelPitch - (SLOT7_PITCH_HIGH_BYTE << 8)) /
      rules.angleUnitsPerTurn) *
      TURN
  );

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
  /// Pitch input. Positive is nose up.
  readonly pitch: number;
  readonly running: boolean;
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
  readonly pitch?: number;
  readonly running?: boolean;
  readonly turn?: number;
  readonly walk?: number;
}): Intent => ({
  pitch: clampAxis(fields.pitch ?? 0),
  running: fields.running ?? false,
  turn: clampAxis(fields.turn ?? 0),
  walk: clampAxis(fields.walk ?? 0)
});

export const IDLE: Intent = intent({});

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
  /// Radians clockwise from +Z.
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
  /// The boarded craft's slot, or absent on foot. Selects the Craft Parameter Block.
  readonly craft: number | undefined;
  readonly elapsed: number;
  readonly mode: FlightMode;
  /// A Craft Parameter Block installed over the occupied craft's own, which the
  /// Reference Build does by copying that block's bytes into the live one. Only
  /// the crash tumble installs one, and reaching the ground clears it.
  readonly mover: number | undefined;
  /// The special transition flag the Reference Build keeps at `$FA`: `$FF`
  /// while the player is on the Colony Craft, zero otherwise. Set by flying
  /// into the `$A13D` box; cleared by every other flying frame, by lift rides,
  /// and by the tumble that ends a walk off the deck edge
  /// (`notes/decode/endgame.md`, "Colony Craft and `$A13D`").
  readonly orbitalFlag: number;
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
  readonly craft?: number;
  readonly elapsed?: number;
  readonly mode?: FlightMode;
  readonly mover?: number;
  readonly orbitalFlag?: number;
  readonly player: PlayerState;
  readonly poweramp?: boolean;
  readonly room?: number;
  readonly throttle?: number;
  readonly touchdown?: Touchdown;
}): GameState => ({
  craft: fields.craft,
  elapsed: fields.elapsed ?? 0,
  mode: fields.mode ?? 'grounded',
  mover: fields.mover,
  orbitalFlag: fields.orbitalFlag ?? 0,
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
export const facing = (player: PlayerState): Vector3 => {
  const cosPitch = cos(player.pitch);
  return {
    x: cosPitch * sin(player.heading),
    y: sin(player.pitch),
    z: cosPitch * cos(player.heading)
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

const clampToWorld = (value: number, extent: number): number =>
  Math.min(extent, Math.max(0, value));

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

/// Board a craft: the Reference Build took its position and its heading.
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
    flight.touchdownAltitude
  );

/// Leave the craft, which puts the player back on the walking block.
export const leave = (state: GameState, flight: FlightModel): GameState =>
  settleOnGround({ ...state, craft: undefined }, flight.groundAltitude);

/// Take the lift down into a room. Puts the player where the ride would have left them.
export const enter = (
  state: GameState,
  entrance: UndergroundEntrance,
  lift: UndergroundLift,
  flight: FlightModel
): GameState => {
  const middle = lift.submergeMiddle << 8;
  return {
    ...state,
    craft: undefined,
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
/// both the altitude and the boarded-craft byte alone. That is what lets
/// recovered craft 7 surface still occupied and still at a craft's resting
/// altitude rather than at the walking eye height.
export const surface = (
  state: GameState,
  entrance: UndergroundEntrance,
  lift: UndergroundLift,
  cellSize: number
): GameState => {
  const middle = lift.surfaceMiddle << 8;
  const column = entrance.cell[0] ?? 0;
  const row = entrance.cell.length === 2 ? entrance.cell[1]! : 0;
  return {
    ...state,
    mode: 'grounded',
    player: {
      ...state.player,
      pitch: state.player.pitch,
      position: {
        x: column * cellSize + middle,
        y: state.player.position.y,
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
  flight: FlightModel
): GameState => {
  const rules = flight.rules;
  const band = rules.groundBand;
  const player = state.player;
  if (state.mode === 'grounded' && player.position.y >= band) {
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
  containment: Containment | undefined
): GameState => {
  const player = state.player;
  const frames = dt * flight.limits.referenceFrameRate;
  if (!(frames > 0)) {
    return state;
  }

  const heading = wrap(
    player.heading +
      intent.turn * flight.walkTurn * frames * flight.radiansPerUnit
  );
  // Walking backwards is the step negated, as the Reference Build did it by flipping the sign bit
  // of the one value rather than keeping two.
  const advance =
    intent.walk *
    flight.walkStep *
    (intent.running ? flight.limits.runMultiplier : 1) *
    frames;
  // The routine this comes from has no vertical term. An ordinary walker is
  // held at the walking eye height as before, but a boarded craft taxiing
  // indoors and a walker on the Colony Craft deck keep the altitude they
  // have, because the Reference Build never writes it here at all.
  const stepped: Vector3 = {
    x: player.position.x + sin(heading) * advance,
    y:
      state.craft !== undefined || state.orbitalFlag !== 0
        ? player.position.y
        : flight.groundAltitude,
    z: player.position.z + cos(heading) * advance
  };

  let position: Vector3;
  let wallContact = 0;
  let wallContactLatch = 0;
  let stepInterlock = state.stepInterlock;
  if (containment === undefined) {
    position = {
      x: clampToWorld(stepped.x, flight.limits.groundExtent),
      y: stepped.y,
      z: clampToWorld(stepped.z, flight.limits.groundExtent)
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
    if (intent.walk !== 0) {
      stepInterlock = Math.max(0, stepInterlock - frames);
    }
  }

  return {
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
  // touchdown gets, and the installed block goes with it.
  return transition(
    { ...spun, mover: undefined },
    fall / Math.max(frames, 1),
    flight
  );
};

const integrate = (
  state: GameState,
  intent: Intent,
  dt: number,
  flight: FlightModel,
  containment: Containment | undefined
): GameState => {
  // The transition counts down in the frame loop rather than in either mover, so it runs whether
  // the player is walking, flying or standing still.
  const counted: GameState = {
    ...state,
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
  if (
    (counted.mover ?? counted.craft) === undefined ||
    counted.room !== undefined
  ) {
    return walk(counted, intent, dt, flight, containment);
  }

  const player = counted.player;
  // An installed block replaces the craft's own, which is how the Reference
  // Build flies a crash: it copies that block's bytes over the live ones.
  const block = blockFor(flight.document, counted.mover ?? counted.craft);
  if (block.handler === 'tumble') {
    return tumble(counted, block, flight);
  }
  if (block.handler === 'slot7') {
    // The Interstellar Ship's handler pins pitch nose-up and returns
    // (`$AA6E-$AA72`): no yaw, throttle, translation or altitude step runs,
    // so slot 7 cannot be flown. The handler's nonzero-gameComplete arm is
    // the terminal renderer, which is presentation rather than a Mover.
    return {
      ...counted,
      elapsed: counted.elapsed + dt,
      player: { ...player, pitch: slot7Pitch(flight.rules) }
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
  const authority = intent.turn * block.yawAuthority * limits.turnScale;
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
  let pitch = player.pitch;
  if (!mayLeaveTheGround) {
    // Below the take-off run the loop pins pitch level, as it does on foot.
    pitch = 0;
  } else if (block.pitchStep > 0) {
    const pitchStep = intent.pitch * block.pitchStep * limits.pitchScale;
    pitch = wrapPitch(pitch + pitchStep * frames * flight.radiansPerUnit);
  }

  // Roll is set from yaw velocity rather than accumulated, and only in flight.
  const roll =
    counted.mode === 'flying'
      ? wrap(yawVelocity * block.rollCoupling * flight.radiansPerUnit)
      : 0;

  // Translation, one axis at a time as the Reference Build did it.
  const advance = speed * frames;
  const direction = facing({ ...player, heading, pitch });
  const x = clampToWorld(
    player.position.x + direction.x * advance,
    limits.groundExtent
  );
  const z = clampToWorld(
    player.position.z + direction.z * advance,
    limits.groundExtent
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

  const moved: GameState = {
    ...counted,
    elapsed: counted.elapsed + dt,
    player: { heading, pitch, position: { x, y, z }, roll, speed, yawVelocity }
  };
  // The verdict on a touchdown is about how fast the craft was going down, so the rate is what
  // crosses the boundary rather than the step it came from.
  return transition(moved, Math.abs(climb) / frames, flight);
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
  containment?: Containment
): GameState => {
  if (!Number.isFinite(dt) || dt <= 0) {
    return state;
  }
  let result: GameState =
    state.touchdown === undefined ? state : { ...state, touchdown: undefined };
  let remaining = dt;
  while (remaining > 0) {
    const slice = Math.min(remaining, MAXIMUM_STEP);
    result = integrate(result, intent, slice, flight, containment);
    remaining -= slice;
  }
  return result;
};
