import type { BensonEffect } from '../benson/effect.ts';
import {
  DEFAULT_SESSION_SEED,
  randomByte,
  type BensonChannel,
  type BensonMessagePresentation
} from '../benson/index.ts';
import { blockFor, type Touchdown } from '../flight/index.ts';
import {
  COLONY_CRAFT_LIFT_ROOM,
  IDLE,
  REFERENCE_OPENING_POSITION,
  board as boardCraft,
  enter,
  facing,
  freeLook,
  gameState,
  leave as leaveCraftCore,
  playerState,
  throttle as setThrottle,
  step,
  throttleStep as stepThrottle,
  surface,
  wallThud,
  type EndgameRules,
  type FlightModel,
  type GameState,
  type Intent,
  type PlayerState
} from '../gameCore/index.ts';
import {
  Interaction,
  OUT_OF_THE_WORLD,
  SURFACE_ROOM,
  type Description,
  type InteractionAction,
  type Outcome,
  type Reach
} from '../interaction/index.ts';
import { Containment, DoorwayPredicate } from '../navigation/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import type {
  Alternate,
  Bundle,
  Doorway,
  DoorwayRules,
  EndgameDropRules,
  EndgameFire,
  EndgameHostileCraft,
  EndgameInterstellarShipField,
  EndgameObjectHits,
  EndgameShipDelivery,
  EndgameSiteDestruction,
  EndgameSurfaceFlyby,
  ObjectEffectsDocument,
  SpecialSetup,
  UndergroundDocument
} from '../payload/documents.ts';
import { indoorScene, type IndoorScene } from '../scene/index.ts';
import {
  TalkHost,
  type TalkHostOptions,
  type TalkScript
} from '../talk/host.ts';
import type { TalkSaveSnapshot } from '../talk/save.ts';
import type { WorldPort } from '../talk/worldPort.ts';
import {
  SURFACE,
  craftHeading,
  displacement,
  isCarried,
  isDrawable,
  locationFromHost,
  locationHostValue,
  room,
  type Location,
  type ObjectPlacement,
  type Residence,
  type Room,
  type World
} from '../world/index.ts';
import { wrapSurfaceAxis } from '../world/surfaceCoordinates.ts';
import { endingStateOf, type EndingState } from './ending.ts';
import {
  advanceLiftJourney,
  liftCameraAltitude,
  liftJourneyAt,
  liftPhaseIndex,
  liftSecondsToNextEvent,
  startLiftJourney,
  type LiftJourneyState
} from './liftJourney.ts';
import { observationsOf, type SemanticObservations } from './observations.ts';
import {
  decodeRandomState,
  encodeRandomState,
  type SaveSnapshot
} from './save.ts';
import {
  InterstellarShipField,
  type ShipFieldColourPair,
  type ShipFieldPoint
} from './shipField.ts';
import { SiteLedger } from './sites.ts';
import {
  WorldEventLog,
  type WorldEvent,
  type WorldSeen
} from './worldEvents.ts';

export {
  comparableObservations,
  TALK_KEPT_ENGINE_FLAGS,
  TALK_KEPT_OBJECT_FLAGS
} from './observations.ts';

export type { WorldEvent } from './worldEvents.ts';

/// The Gameplay Session: the one owner of a play session's Session State (ADR 0018).
///
/// Every discrete change to that state passes through a Semantic Action: `reach`, `drop`,
/// `leaveCraft`, `rideLift`, `teleport`, `place`, `placeAtObject`, `takeObject`, `carry`, `board`,
/// `throttleNotchValue`, `throttleStep`, `placeInAir`, `shutThrottle`, `press`, `skipMessage`,
/// `start`, `show`, `describe`. Each moves everything or nothing, which is what ADR 0018 asks of
/// them.
///
/// Two things are deliberately not actions. `intent` is a held input rather than an event, so a
/// caller assigns it and `advance` reads whatever it says at the time — that is the shape a
/// keyboard has. `game` is public because the Mover's own state is `gameCore`'s to define and
/// this class only carries it. Neither is `readonly` yet, so the single-owner rule is a
/// convention here rather than something the type enforces; tightening that is worth doing when
/// the shell lands a second caller (#95).
///
/// **One owner for the world.** Talk Scripts and reaching work on this module's typed
/// Location, Occupancy, Object Residence, credits and Ending through the World Port (ADR 0083).
/// No Benson Script runs in a session, so there is no byte-level copy of any of it (#924).
///
/// The two Movers are `gameCore`'s and are not re-implemented here: `advance` hands them the
/// intent and the Room's walls, then turns what came back — a touchdown, wall contact, a Doorway
/// taken — into PresentationEvents for the caller to sound and draw. Session State stays the
/// session's own; a PresentationEvent is what only presentation should answer.

/// A hired ship's altitude after each of the original's frames, from where it
/// starts down to the ground: each frame takes 1/2^shift of the altitude and
/// a little more.
const descentTracks = new WeakMap<EndgameShipDelivery, readonly number[]>();
const descentTrack = (rules: EndgameShipDelivery): readonly number[] => {
  const known = descentTracks.get(rules);
  if (known !== undefined) {
    return known;
  }
  const track = [rules.initialisation.y >>> 8];
  while (track.at(-1)! > 0) {
    const altitude = track.at(-1)!;
    track.push(
      Math.max(
        0,
        altitude -
          (altitude >>> rules.descent.shift) -
          rules.descent.extraSubtraction
      )
    );
  }
  descentTracks.set(rules, track);
  return track;
};

export type Occupancy =
  | { readonly kind: 'onFoot' }
  | { readonly kind: 'aboard'; readonly slot: number };

/// An object's description bit that makes boarding or taking it start its
/// Talk, as it started the Benson Script of its slot.
const STARTS_TALK = 4;
/// The bits the Dart's sale clears on its object at first boarding.
const DISARMED = STARTS_TALK | 8;
const FIXED = 16;
/// What starts the Ship Delivery, as Benson Script 2 wrote it.
const SHIP_INBOUND = 0xff;
/// What a new game's player holds.
const STARTING_CREDITS = 9000;
/// Credits wrap at eight digits, as the original's decimal does.
const CREDITS_LIMIT = 100_000_000;
/// The original's occupancy byte on foot. Slot 0 is a real ship.
const ON_FOOT = 0x80;

/// The longest stretch combat moves in one go (ADR 0083).
const MAX_COMBAT_SUBSTEP = 1 / 60;

const occupancyHostValue = (occupancy: Occupancy): number =>
  occupancy.kind === 'onFoot' ? ON_FOOT : occupancy.slot;

const occupancyFromHost = (value: number): Occupancy =>
  value === ON_FOOT ? { kind: 'onFoot' } : { kind: 'aboard', slot: value };

export type PresentationEvent =
  | 'tone'
  | { readonly lift: 'up' | 'down' }
  | { readonly fire: { readonly sound: number } }
  | { readonly impact: { readonly sound: number } }
  | { readonly script: BensonEffect }
  | { readonly touchdown: Touchdown }
  | { readonly arrived: Location }
  | { readonly wall: { readonly sound: number } }
  | { readonly worldFlipped: boolean };

export type DropOutcome =
  | { readonly kind: 'dropped'; readonly slot: number }
  | { readonly kind: 'emptyInventory' }
  | { readonly kind: 'airborneRefused' };

export interface DropResult {
  readonly events: readonly PresentationEvent[];
  readonly outcome: DropOutcome;
}

export type TakeObjectOutcome =
  | { readonly kind: 'took'; readonly slot: number }
  | { readonly kind: 'fixedInPlace'; readonly slot: number }
  | { readonly kind: 'tooHeavy'; readonly slot: number }
  | { readonly kind: 'handsFull' }
  | { readonly kind: 'alreadyCarried'; readonly slot: number }
  | { readonly kind: 'gone'; readonly slot: number }
  | { readonly kind: 'missing'; readonly slot: number }
  | { readonly kind: 'unsupported' };

export interface TakeObjectResult {
  readonly events: readonly PresentationEvent[];
  readonly outcome: TakeObjectOutcome;
}

export type FetchObjectOutcome =
  | { readonly kind: 'fetched'; readonly slot: number }
  | { readonly kind: 'fixedInPlace'; readonly slot: number }
  | { readonly kind: 'airborneRefused' }
  | { readonly kind: 'alreadyCarried'; readonly slot: number }
  | { readonly kind: 'gone'; readonly slot: number }
  | { readonly kind: 'missing'; readonly slot: number }
  | { readonly kind: 'unsupported' };

export interface FetchObjectResult {
  readonly events: readonly PresentationEvent[];
  readonly outcome: FetchObjectOutcome;
}

/// What asking to fire did.
///
/// The Reference Build refuses silently in all three decoded cases, so the
/// outcome is here for the tests and traces that have to tell them apart rather
/// than for anything the player sees.
export type FireOutcome =
  /// A Player Projectile is away.
  | { readonly kind: 'fired' }
  /// On foot. Firing belongs to the craft, not the player in it.
  | { readonly kind: 'onFootRefused' }
  /// A structure impact is still playing.
  | { readonly kind: 'impactActiveRefused' }
  /// The one Player Projectile is still in flight.
  | { readonly kind: 'shotActiveRefused' }
  /// This content carries no decoded fire rules at all, which is not one of the
  /// Reference Build's refusals but an absence in what was loaded.
  | { readonly kind: 'unsupported' };

export interface FireResult {
  readonly events: readonly PresentationEvent[];
  readonly outcome: FireOutcome;
}

/// What the Escape's terminal presentation is showing: already projected, so a
/// renderer draws it without knowing how a point got there.
export interface EscapePresentation {
  readonly colourPair: ShipFieldColourPair;
  readonly points: readonly ShipFieldPoint[];
}

export interface SessionSnapshot {
  readonly bensonColour?: number;
  readonly bensonMessage: BensonMessagePresentation | undefined;
  readonly carriedStack: readonly number[];
  /// The Mover's own bookkeeping for this moment.
  ///
  /// Carried here rather than left on `game` because a Session Snapshot is the thing a renderer
  /// or a Replay Gate compares "instead of reading the session's parts" (CONTEXT.md), and
  /// without these six a caller comparing two snapshots had to reach past the Snapshot for the
  /// rest — which is the shape that sentence rules out. The names are the Trace Oracle's, since
  /// they are what a recorded `core` block is keyed by.
  readonly core: {
    readonly poweramp: boolean;
    readonly stepInterlock: number;
    readonly touchdown: Touchdown | undefined;
    readonly transitionCooldown: number;
    readonly wallContact: number;
    readonly wallContactLatch: number;
  };
  readonly credits: number;
  readonly elapsed: number;
  /// Which Ending this moment belongs to, and how far its presentation has got.
  /// `activePlay` throughout ordinary play; what draws an Ending reads this
  /// rather than the phase byte.
  readonly ending: EndingState;
  /// What the Escape's terminal presentation is showing at this moment: the
  /// colour pair in force and the 21 points, already projected. Present only
  /// while an Escape is being presented, which is what a renderer branches on.
  readonly escapePresentation?: EscapePresentation;
  readonly indoor: IndoorScene | undefined;
  readonly isScriptRunning: boolean;
  readonly liftJourney?: {
    readonly destination: Location;
    readonly direction: 'down' | 'up';
    readonly instrumentAltitude?: number;
    readonly lineColour: number;
    readonly pitchHighByte: number;
    readonly position: number;
    readonly scene: 'room' | 'surface';
    readonly screenSplit: number | undefined;
    readonly stage: number;
    readonly upperColour?: number;
  };
  readonly location: Location;
  readonly mode: GameState['mode'];
  readonly objectFlags: ReadonlyMap<number, number>;
  readonly occupancy: Occupancy;
  readonly player: PlayerState;
  readonly residence: ReadonlyMap<number, Residence>;
  readonly throttle: number;
  readonly throttleNotch: number;
  readonly worldFlipped: boolean;
}

export const openingPlayer = (): PlayerState =>
  playerState({
    // The Reference Build starts with YAW_HI=$02: a half turn toward +Z.
    heading: Math.PI,
    pitch: 0,
    position: REFERENCE_OPENING_POSITION
  });

/// The Reference Build's terminal loop is raster-locked, so it runs at the
/// display's rate rather than at the browser's step.

export interface SessionContent {
  readonly cellSize: number;
  readonly doorwayRules: DoorwayRules | undefined;
  readonly dropRules?: EndgameDropRules;
  /// The decoded endgame rules the control loop reads: the `$A13D` box the
  /// Colony Craft transition runs on, and the byte the Interstellar Ship's
  /// handler writes. Absent when the content carries no endgame rules.
  readonly endgame?: EndgameRules;
  /// The Interstellar Ship Field the Escape's terminal presentation runs.
  /// Absent when the content carries no endgame rules, in which case an Ending
  /// simply freezes rather than presenting.
  readonly endingField?: EndgameInterstellarShipField;
  /// What firing costs and how far a shot gets.
  readonly fire?: EndgameFire;
  readonly flight: FlightModel | undefined;
  /// How a hostile craft closes, shoots, and what its hit costs.
  readonly hostile?: EndgameHostileCraft;
  readonly interaction: Interaction | undefined;
  readonly metalDetector?: ObjectEffectsDocument['metalDetector'];
  /// What a shot does when it reaches one of the two objects it can hit.
  readonly objectHits?: EndgameObjectHits;
  readonly objects: readonly ObjectPlacement[];
  /// The object whose being carried turns on the flight rules' one
  /// craft-conditioned override.
  readonly powerampSlot?: number;
  readonly rooms: ReadonlyMap<number, Room>;
  readonly shipDelivery?: EndgameShipDelivery;
  /// The Sites a shot can destroy, and the rules the commit path follows.
  readonly sites?: EndgameSiteDestruction;
  /// The surface craft advanced once per outdoor reference frame.
  readonly surfaceFlyby?: EndgameSurfaceFlyby;
  readonly underground: UndergroundDocument | undefined;
}

export const sessionContent = (
  world: World,
  bundle: Bundle,
  flight: FlightModel | undefined
): SessionContent => ({
  cellSize: world.cellSize,
  doorwayRules: world.doorwayRules,
  dropRules: bundle.endgame.controls.drop,
  endgame: {
    colonyCraft: bundle.endgame.orbitalTransition,
    slot7PitchHighByte: bundle.endgame.endingPresentation.slot7PitchHighByte
  },
  endingField: bundle.endgame.endingPresentation.interstellarShipField,
  fire: bundle.endgame.combat.fire,
  flight,
  hostile: bundle.endgame.combat.hostileCraft,
  interaction:
    bundle.interaction === undefined
      ? undefined
      : new Interaction(
          bundle.interaction,
          bundle.endgame.controls.takeOverrides
        ),
  metalDetector: bundle.objectEffects.metalDetector,
  objectHits: bundle.endgame.combat.objectHits,
  objects: world.objects,
  powerampSlot: bundle.endgame.controls.powerampSlot,
  rooms: world.rooms,
  shipDelivery: bundle.endgame.shipDelivery,
  sites: bundle.endgame.combat.siteDestruction,
  surfaceFlyby: bundle.endgame.surfaceFlyby,
  underground: bundle.underground
});

const padCovers = (
  pad: UndergroundDocument['pad'],
  position: number,
  cellSize: number
): boolean => {
  const within = position % cellSize;
  const middle = Math.trunc(within) >> 8;
  return middle >> pad.shift === pad.x;
};

const rewriteDoorway = (doorway: Doorway, alternate: Alternate): Doorway => {
  const rewritten: Doorway = {
    ...doorway,
    arrivalCommandIndex: alternate.arrivalCommandIndex,
    arrivalWithinDestination: alternate.arrivalWithinDestination,
    destination: alternate.destination
  };
  if (alternate.arrival !== undefined) {
    return { ...rewritten, arrival: alternate.arrival };
  }
  const { arrival: _, ...rest } = rewritten;
  return rest;
};

const samePoint = (
  left: Alternate['arrival'],
  right: Alternate['arrival']
): boolean =>
  left === right ||
  (left !== undefined &&
    right !== undefined &&
    left.x === right.x &&
    left.z === right.z);

const sameAlternate = (left: Alternate, right: Alternate): boolean =>
  left.arrivalCommandIndex === right.arrivalCommandIndex &&
  left.arrivalWithinDestination === right.arrivalWithinDestination &&
  left.room === right.room &&
  samePoint(left.arrival, right.arrival) &&
  ('colonyCraft' in left.destination
    ? 'colonyCraft' in right.destination
    : 'room' in right.destination &&
      left.destination.room === right.destination.room);

/// What a restored combat state has to agree with before it is played on.
///
/// Two things here cannot be caught by decoding the Save on its own. A shot's
/// place lives in its Object Residence while whether there *is* a shot lives
/// beside it, so a Save carrying one without the other would restore a shot
/// nothing could draw or a mark nothing was flying. And a counter is a byte on
/// its own, so one standing higher than the Sites that could have moved it
/// describes a session that could not have happened.
const validateCombatSnapshot = (
  content: SessionContent,
  snapshot: SaveSnapshot
): void => {
  const combat = snapshot.combat;
  const sites = content.sites;
  if (combat === null) {
    if (sites !== undefined) {
      throw new Error(
        'Save Snapshot has no combat state for a world with Sites'
      );
    }
    return;
  }
  if (sites === undefined) {
    throw new Error(
      'Save Snapshot carries combat state for a world without Sites'
    );
  }
  if (combat.siteTable.length !== sites.initialTable.length) {
    throw new Error('Save Snapshot Site Ledger is the wrong size');
  }
  // A Site the payload never had cannot have been destroyed, and a counter
  // cannot have counted more than its faction had to lose.
  const totals = { mechanoid: 0, palyar: 0 };
  for (const [cell, byte] of sites.initialTable.entries()) {
    const saved = combat.siteTable[cell]!;
    if ((saved & ~sites.destroyedMask & 0xff) > (byte & 0xff)) {
      throw new Error(`Save Snapshot Site Ledger gained state at cell ${cell}`);
    }
    if ((byte & sites.neutralMask) !== 0) {
      continue;
    }
    if ((byte & sites.mechanoidMask) === 0) {
      totals.palyar += 1;
    } else {
      totals.mechanoid += 1;
    }
  }
  if (
    combat.mechanoidDestroyed > totals.mechanoid ||
    combat.palyarDestroyed > totals.palyar
  ) {
    throw new Error('Save Snapshot faction counter is beyond its Sites');
  }
  const rate = content.flight?.limits.referenceFrameRate ?? 1;
  // A hair over a lifetime is float noise in the seconds left, not a forgery.
  const outlives = (secondsLeft: number, frames: number): boolean =>
    secondsLeft > frames / rate + 1e-9;
  if (
    combat.impact !== null &&
    outlives(combat.impact.secondsLeft, sites.impactFrames)
  ) {
    throw new Error('Save Snapshot impact outlives its own lifecycle');
  }
  const agrees = (
    slot: number | undefined,
    flying: { readonly secondsLeft: number } | null,
    limit: number | undefined,
    what: string
  ): void => {
    if (slot === undefined) {
      return;
    }
    const where = snapshot.residence.find(([at]) => at === slot)?.[1];
    const placed = where?.kind === 'surface' && where.at !== undefined;
    if ((flying !== null) !== placed) {
      throw new Error(`Save Snapshot ${what} and its place disagree`);
    }
    if (
      flying !== null &&
      limit !== undefined &&
      outlives(flying.secondsLeft, limit)
    ) {
      throw new Error(`Save Snapshot ${what} outlives its own lifecycle`);
    }
  };
  agrees(
    content.fire?.effectSlot,
    combat.playerShot,
    content.fire?.lifecycleFrames,
    'Player Projectile'
  );
  agrees(
    content.hostile?.inboundSlot,
    combat.hostileShot,
    content.hostile?.inboundLifecycleFrames,
    'Hostile Projectile'
  );
  const blocks = content.flight?.document.blocks;
  if (
    snapshot.game.mover !== null &&
    blocks !== undefined &&
    !blocks.some(block => block.index === snapshot.game.mover)
  ) {
    throw new Error(
      `Save Snapshot installs missing mover ${snapshot.game.mover}`
    );
  }
};

const validateSnapshotReferences = (
  content: SessionContent,
  snapshot: SaveSnapshot
): void => {
  if (snapshot.game.room !== null && !content.rooms.has(snapshot.game.room)) {
    throw new Error(
      `Save Snapshot refers to missing Room ${snapshot.game.room}`
    );
  }
  if (snapshot.liftJourney !== null) {
    const journey = snapshot.liftJourney;
    const ordinary = content.underground?.entrances.some(
      entrance => entrance.room === journey.entranceRoom
    );
    const colony =
      journey.entranceRoom === COLONY_CRAFT_LIFT_ROOM &&
      content.endgame?.colonyCraft !== undefined;
    if (ordinary !== true && !colony) {
      throw new Error(
        `Save Snapshot Lift Journey refers to missing entrance ${journey.entranceRoom}`
      );
    }
    const lift = content.underground?.lift;
    if (
      lift?.timing.find(item => item.room === journey.entranceRoom)?.[
        journey.direction
      ] === undefined
    ) {
      throw new Error(
        `Save Snapshot Lift Journey has no timing for entrance ${journey.entranceRoom}`
      );
    }
    const at = liftJourneyAt(journey, journey.elapsedSeconds, lift);
    if (at === undefined) {
      throw new Error('Save Snapshot Lift Journey has already completed');
    }
    const visibleRoom = at.scene === 'room' ? journey.entranceRoom : null;
    if (snapshot.game.room !== visibleRoom) {
      throw new Error(
        'Save Snapshot Lift Journey visible scene disagrees with Room'
      );
    }
  }
  const objectSlots = new Set(content.objects.map(object => object.slot));
  if (snapshot.game.craft !== null && !objectSlots.has(snapshot.game.craft)) {
    throw new Error(
      `Save Snapshot refers to missing craft slot ${snapshot.game.craft}`
    );
  }
  const savedResidence = new Map(snapshot.residence);
  const savedFlags = new Map(snapshot.objectFlags);
  for (const [slot, residence] of savedResidence) {
    if (!objectSlots.has(slot)) {
      throw new Error(`Save Snapshot refers to missing object slot ${slot}`);
    }
    if (residence.kind === 'room' && !content.rooms.has(residence.id)) {
      throw new Error(`Save Snapshot refers to missing Room ${residence.id}`);
    }
  }
  for (const slot of savedFlags.keys()) {
    if (!objectSlots.has(slot)) {
      throw new Error(`Save Snapshot refers to missing object slot ${slot}`);
    }
  }
  if (
    snapshot.residence.length !== objectSlots.size ||
    savedResidence.size !== objectSlots.size ||
    snapshot.objectFlags.length !== objectSlots.size ||
    savedFlags.size !== objectSlots.size
  ) {
    throw new Error('Save Snapshot has an incomplete or extra object census');
  }
  for (const slot of objectSlots) {
    if (!savedResidence.has(slot) || !savedFlags.has(slot)) {
      throw new Error(`Save Snapshot is missing object slot ${slot}`);
    }
  }
  if (new Set(snapshot.carriedStack).size !== snapshot.carriedStack.length) {
    throw new Error('Save Snapshot Carried Stack members must be unique');
  }
  const carried = new Set(snapshot.carriedStack);
  const carriedMask =
    content.interaction?.carriedMask ?? content.dropRules?.carriedMask;
  for (const slot of snapshot.carriedStack) {
    if (!objectSlots.has(slot)) {
      throw new Error(`Save Snapshot carries missing object slot ${slot}`);
    }
  }
  for (const slot of objectSlots) {
    const inStack = carried.has(slot);
    const inResidence = savedResidence.get(slot)?.kind === 'carried';
    const inFlags =
      carriedMask === undefined
        ? inStack
        : ((savedFlags.get(slot) ?? 0) & carriedMask) !== 0;
    if (inStack !== inResidence || inStack !== inFlags) {
      throw new Error(
        `Save Snapshot carrying representations disagree at slot ${slot}`
      );
    }
  }
  validateCombatSnapshot(content, snapshot);
  for (const [roomId, alternate] of snapshot.rewired) {
    const room = content.rooms.get(roomId);
    if (
      room?.specialSetup === undefined ||
      !room.specialSetup.alternates.some(candidate =>
        sameAlternate(candidate, alternate)
      )
    ) {
      throw new Error(
        `Save Snapshot has an invalid rewired choice for Room ${roomId}`
      );
    }
    if (
      'room' in alternate.destination &&
      !content.rooms.has(alternate.destination.room)
    ) {
      throw new Error(
        `Save Snapshot refers to missing Room ${alternate.destination.room}`
      );
    }
  }
};

/// The one owner of a play session's mutable state (ADR 0018).
export class GameplaySession {
  readonly content: SessionContent;
  game: GameState;
  intent: Intent = IDLE;

  /// Free Look's pitch on foot (ADR 0059), an Extension. The on-foot Mover levels the Pose every
  /// step, so after one this is the Pose's whole pitch, and it is written there: drawing and
  /// picking both see it. No Save or Session Resume carries it. A Location change, boarding and
  /// leaving level it, as do recentring and turning Extended Controls off.
  private lookPitch = 0;
  /// The Room Free Look last tilted the view in, so a step that changed the Location levels it.
  private lookRoom: number | undefined;

  /// The fraction of a frame left over from the last ship-delivery step.
  /// Seconds since a hired ship began its descent, while it descends.
  private deliverySeconds: number | undefined;
  private liftJourney: LiftJourneyState | undefined;
  private liftBensonColour: number | undefined;
  private residence = new Map<number, Residence>();
  private objectFlags = new Map<number, number>();
  private carriedStack: number[] = [];
  /// The Benson Display, where messages play.
  benson: BensonChannel | undefined;
  /// The Talk Scripts, once `useTalkScripts` has loaded them (ADR 0080).
  talk: TalkHost | undefined;
  private rewired = new Map<number, Alternate>();
  /// The Site Ledger, owned here (ADR 0018). Absent when the content carries no Sites.
  private sites: SiteLedger | undefined;
  /// The part of a combat frame that had not elapsed yet.
  /// The Escape's terminal presentation, once the Ending has produced it.
  /// Created on the edge into an Ending and never taken down: the Reference
  /// Build's terminal loop does not return.
  private endingField: InterstellarShipField | undefined;
  /// The part of a terminal loop that had not elapsed yet. The native loop runs
  /// at the Reference Build's 50 a second, which is not this session's step, so
  /// the remainder is carried the way Benson frames are.
  /// The one Player Projectile, while it is in flight. Its position is its
  /// Object Residence, because that is what draws it; only what residence
  /// cannot hold is kept here.
  /// Velocities are per second, lifetimes in seconds left (ADR 0083).
  private playerShot: { secondsLeft: number; velocity: Vector3 } | undefined;
  /// The structure impact now playing, which firing waits for.
  private impact: { cell: number; secondsLeft: number } | undefined;
  /// The Hostile Projectile on its way, while there is one.
  private hostileShot: { secondsLeft: number; velocity: Vector3 } | undefined;
  /// How the attacker is travelling on its current approach.
  private attackerVelocity: Vector3 | undefined;
  /// Frames the attacker has left of its current approach. It counts down
  /// before the encounter looks at anything, which is what gives an attacker
  /// time to close rather than shooting the instant it is aimed.
  private approachSeconds = 0;
  private ownRandomState: bigint;
  /// The player's credits (#906).
  private credits = 0;
  /// The Ending phase byte: 0 in active play, 1 once the Escape is accepted,
  /// 255 in the mature terminal presentation. A byte rather than a Boolean
  /// because the Reference Build reads all three values apart
  /// (`notes/decode/endgame.md`, "Ending phases"). What the rest of the app
  /// reads is `ending`, projected from it.
  private endingPhase = 0;
  /// Whether a hostile ship has been sent after the player.
  private attackingShip = false;
  /// The hired ship's delivery byte, as the Ship Delivery rules read it.
  private shipInbound = 0;
  private readonly objectsBySlot: ReadonlyMap<number, ObjectPlacement>;
  /// The World Events since the last frame was told.
  private world: WorldEventLog;

  constructor(
    content: SessionContent,
    player: PlayerState,
    benson?: BensonChannel,
    randomSeed: bigint = DEFAULT_SESSION_SEED
  ) {
    this.content = content;
    this.ownRandomState = randomSeed;
    let game = gameState({ player });
    if (content.flight !== undefined) {
      game = {
        ...game,
        player: {
          ...game.player,
          position: {
            ...game.player.position,
            y: content.flight.groundAltitude
          }
        }
      };
    }
    this.game = game;
    this.benson = benson;
    if (content.sites !== undefined) {
      this.sites = new SiteLedger(content.sites);
    }
    const objectsBySlot = new Map<number, ObjectPlacement>();
    for (const object of content.objects) {
      if (!objectsBySlot.has(object.slot)) {
        objectsBySlot.set(object.slot, object);
        const flags = object.stateFlags & 0xff;
        this.objectFlags.set(object.slot, flags);
        const carriedMask = this.carriedMask;
        if (carriedMask !== undefined && (flags & carriedMask) !== 0) {
          this.residence.set(object.slot, { kind: 'carried' });
          this.carriedStack.push(object.slot);
        } else if (object.room === OUT_OF_THE_WORLD) {
          this.residence.set(object.slot, { kind: 'gone' });
        } else if (
          object.placement === 'surface' ||
          object.room === SURFACE_ROOM
        ) {
          this.residence.set(object.slot, { kind: 'surface' });
        } else {
          this.residence.set(object.slot, { id: object.room, kind: 'room' });
        }
      }
    }
    this.carriedStack.sort((a, b) => a - b);
    this.objectsBySlot = objectsBySlot;
    if (this.benson !== undefined) {
      this.credits = STARTING_CREDITS;
    }
    this.world = new WorldEventLog(this.seeWorld());
  }

  captureSaveSnapshot(): SaveSnapshot {
    return {
      attackingShip: this.attackingShip,
      benson: this.benson?.captureSaveSnapshot() ?? null,
      carriedStack: [...this.carriedStack],
      combat:
        this.sites === undefined
          ? null
          : {
              approachSeconds: this.approachSeconds,
              attackerVelocity:
                this.attackerVelocity === undefined
                  ? null
                  : { ...this.attackerVelocity },
              hostileShot:
                this.hostileShot === undefined
                  ? null
                  : {
                      secondsLeft: this.hostileShot.secondsLeft,
                      velocity: { ...this.hostileShot.velocity }
                    },
              impact: this.impact === undefined ? null : { ...this.impact },
              mechanoidDestroyed: this.sites.mechanoidDestroyed,
              palyarDestroyed: this.sites.palyarDestroyed,
              playerShot:
                this.playerShot === undefined
                  ? null
                  : {
                      secondsLeft: this.playerShot.secondsLeft,
                      velocity: { ...this.playerShot.velocity }
                    },
              siteTable: [...this.sites.bytes]
            },
      credits: this.credits,
      deliverySeconds: this.deliverySeconds ?? null,
      ending:
        this.endingField === undefined
          ? null
          : { field: this.endingField.captureSaveSnapshot() },
      endingPhase: this.endingPhase,
      game: {
        ...this.game,
        craft: this.game.craft ?? null,
        mover: this.game.mover ?? null,
        // Free Look is never saved: a loaded Save starts level.
        player: {
          ...this.game.player,
          pitch: this.game.player.pitch - this.lookPitch
        },
        room: this.game.room ?? null,
        touchdown: this.game.touchdown ?? null
      },
      liftJourney:
        this.liftJourney === undefined
          ? null
          : {
              direction: this.liftJourney.direction,
              elapsedSeconds: this.liftJourney.elapsedSeconds,
              entranceRoom: this.liftJourney.entranceRoom,
              restingAltitude: this.liftJourney.restingAltitude,
              retainedBensonColour: this.liftBensonColour ?? null
            },
      objectFlags: [...this.objectFlags.entries()].sort(([a], [b]) => a - b),
      randomState: encodeRandomState(this.ownRandomState),
      residence: [...this.residence.entries()].sort(([a], [b]) => a - b),
      rewired: [...this.rewired.entries()].sort(([a], [b]) => a - b),
      shipInbound: this.shipInbound,
      talk: this.talk?.captureSaveSnapshot() ?? null
    };
  }

  /// A new game as live play begins one: the opening player, the Talk Scripts
  /// loaded, and `begin` told to them.
  static newGame(
    content: SessionContent,
    benson: BensonChannel,
    talk: {
      readonly options?: TalkHostOptions;
      readonly scripts: readonly TalkScript[];
    }
  ): GameplaySession {
    const session = new GameplaySession(content, openingPlayer(), benson);
    session.useTalkScripts(talk.scripts, talk.options);
    session.begin();
    return session;
  }

  /// A session as the Save left it. Given Talk Scripts, it restores theirs
  /// beside Benson, or loads them fresh where the Save has none.
  static restore(
    content: SessionContent,
    benson: BensonChannel | undefined,
    snapshot: SaveSnapshot,
    talk?: {
      readonly options?: TalkHostOptions;
      readonly scripts: readonly TalkScript[];
    }
  ): GameplaySession {
    validateSnapshotReferences(content, snapshot);
    if ((benson === undefined) !== (snapshot.benson === null)) {
      throw new Error(
        'Save Snapshot Benson Display does not match the Gameplay Session content'
      );
    }
    const restoredBenson =
      benson === undefined || snapshot.benson === null
        ? undefined
        : benson.restore(snapshot.benson);
    const session = new GameplaySession(
      content,
      snapshot.game.player,
      restoredBenson,
      decodeRandomState(snapshot.randomState)
    );
    session.game = {
      ...snapshot.game,
      craft: snapshot.game.craft ?? undefined,
      mover: snapshot.game.mover ?? undefined,
      room: snapshot.game.room ?? undefined,
      touchdown: snapshot.game.touchdown ?? undefined
    };
    session.carriedStack = [...snapshot.carriedStack];
    session.credits = snapshot.credits;
    session.endingPhase = snapshot.endingPhase;
    session.attackingShip = snapshot.attackingShip;
    session.shipInbound = snapshot.shipInbound;
    session.deliverySeconds = snapshot.deliverySeconds ?? undefined;
    session.liftJourney =
      snapshot.liftJourney === null
        ? undefined
        : liftJourneyAt(
            snapshot.liftJourney,
            snapshot.liftJourney.elapsedSeconds,
            content.underground!.lift
          );
    session.liftBensonColour =
      snapshot.liftJourney?.retainedBensonColour ?? undefined;
    // A terminal presentation is restored where it was rather than begun again:
    // the field's own generator state is what makes the continuation exact.
    if (snapshot.ending !== null && content.endingField !== undefined) {
      session.endingField = InterstellarShipField.restore(
        content.endingField,
        snapshot.ending.field
      );
    }
    session.objectFlags = new Map(snapshot.objectFlags);
    session.residence = new Map(snapshot.residence);
    session.rewired = new Map(snapshot.rewired);
    session.ownRandomState = decodeRandomState(snapshot.randomState);
    if (content.sites !== undefined && snapshot.combat !== null) {
      session.sites = SiteLedger.restore(
        content.sites,
        snapshot.combat.siteTable,
        snapshot.combat.palyarDestroyed,
        snapshot.combat.mechanoidDestroyed
      );
      session.approachSeconds = snapshot.combat.approachSeconds;
      session.attackerVelocity =
        snapshot.combat.attackerVelocity === null
          ? undefined
          : { ...snapshot.combat.attackerVelocity };
      session.hostileShot =
        snapshot.combat.hostileShot === null
          ? undefined
          : {
              secondsLeft: snapshot.combat.hostileShot.secondsLeft,
              velocity: { ...snapshot.combat.hostileShot.velocity }
            };
      session.impact = snapshot.combat.impact ?? undefined;
      session.playerShot =
        snapshot.combat.playerShot === null
          ? undefined
          : {
              secondsLeft: snapshot.combat.playerShot.secondsLeft,
              velocity: { ...snapshot.combat.playerShot.velocity }
            };
    }
    // A Save is where play resumes, not a change in it.
    session.world.resume(session.seeWorld());
    if (talk !== undefined) {
      session.useTalkScripts(
        talk.scripts,
        talk.options,
        snapshot.talk ?? undefined
      );
    }
    return session;
  }

  get location(): Location {
    return locationFromHost(this.game.room ?? SURFACE_ROOM);
  }

  /// The Room byte used by Benson and object Drop can lead the visible scene
  /// during descent, just as CURRENT_ROOM leads PLANET_UNDERGROUND in the
  /// Reference Build.
  private get semanticLocation(): Location {
    if (this.liftJourney?.direction === 'down') {
      return { id: this.liftJourney.entranceRoom, kind: 'room' };
    }
    return this.location;
  }

  private liftEntrance(
    room: number
  ): UndergroundDocument['entrances'][number] | undefined {
    const ordinary = this.content.underground?.entrances.find(
      entrance => entrance.room === room
    );
    if (ordinary !== undefined) {
      return ordinary;
    }
    const colonyCraft = this.content.endgame?.colonyCraft;
    if (room === COLONY_CRAFT_LIFT_ROOM && colonyCraft !== undefined) {
      return { cell: colonyCraft.cell, room, site: room };
    }
    return undefined;
  }

  private applyLiftScene(
    before: LiftJourneyState,
    scene: LiftJourneyState['scene']
  ): void {
    if (before.scene === scene) {
      return;
    }
    const underground = this.content.underground;
    const flight = this.content.flight;
    if (underground === undefined || flight === undefined) {
      return;
    }
    const colonyCraft = this.content.endgame?.colonyCraft;
    const entrance = this.liftEntrance(before.entranceRoom);
    if (entrance === undefined) {
      throw new Error(
        `Lift Journey refers to missing Room ${before.entranceRoom}`
      );
    }
    this.game =
      scene === 'room'
        ? enter(this.game, entrance, underground.lift, flight)
        : surface(
            this.game,
            entrance,
            underground.lift,
            this.content.cellSize,
            colonyCraft
          );
  }

  private get bensonColour(): number | undefined {
    const detector = this.content.metalDetector;
    if (detector === undefined) {
      return undefined;
    }
    if (this.liftJourney !== undefined) {
      return this.liftBensonColour;
    }
    if (!this.carriedStack.includes(detector.slot)) {
      return undefined;
    }
    if (
      this.location.kind !== 'surface' ||
      Math.floor(this.game.player.position.y / 0x1_00_00) >=
        detector.altitudeHighByteLimit
    ) {
      return detector.colours.neutral;
    }
    const across = Math.floor(
      this.game.player.position.x / this.content.cellSize
    );
    const depth = Math.floor(
      this.game.player.position.z / this.content.cellSize
    );
    if (across < 0 || across >= 16 || depth < 0 || depth >= 16) {
      return detector.colours.neutral;
    }
    const cell = depth * 16 + across;
    if (cell === 0) {
      return detector.colours.neutral;
    }
    const flags = this.sites?.bytes[cell];
    if (flags === undefined || (flags & detector.neutralMask) !== 0) {
      return detector.colours.neutral;
    }
    return (flags & detector.mechanoidMask) !== 0
      ? detector.colours.mechanoid
      : detector.colours.palyar;
  }

  get occupancy(): Occupancy {
    return occupancyFromHost(this.game.craft ?? ON_FOOT);
  }

  residenceOf(slot: number): Residence {
    const known = this.residence.get(slot);
    if (known !== undefined) {
      return known;
    }
    const object = this.objectsBySlot.get(slot);
    if (object === undefined) {
      return { kind: 'surface' };
    }
    return locationFromHost(object.room);
  }

  private get carriedMask(): number | undefined {
    return (
      this.content.interaction?.carriedMask ??
      this.content.dropRules?.carriedMask
    );
  }

  /// What reaching sees of the world (#907).
  private get reachable(): Reach {
    return {
      boarded:
        this.occupancy.kind === 'aboard' ? this.occupancy.slot : undefined,
      carriedCount: this.carriedStack.length,
      carries: slot => this.carriedStack.includes(slot),
      flags: slot => this.objectFlags.get(slot) ?? 0
    };
  }

  /// Carries out a Take or Boarding that reaching decided on.
  private carryOut(outcome: Outcome, carriedMask: number): void {
    if (outcome.kind === 'took') {
      this.carriedStack.push(outcome.slot);
      this.objectFlags.set(
        outcome.slot,
        (this.objectFlags.get(outcome.slot) ?? 0) | carriedMask
      );
      this.residence.set(outcome.slot, { kind: 'carried' });
    } else if (outcome.kind === 'boarded') {
      this.game = { ...this.game, craft: outcome.slot };
      this.residence.set(outcome.slot, { kind: 'gone' });
    } else {
      return;
    }
  }

  reach(
    action: InteractionAction,
    only?: number
  ): {
    readonly events: readonly PresentationEvent[];
    readonly outcome: Outcome;
  } {
    this.noteWorld();
    const interaction = this.content.interaction;
    if (interaction === undefined) {
      return { events: [], outcome: { kind: 'nothingInReach' } };
    }
    const candidates = this.content.objects
      .filter(object => only === undefined || object.slot === only)
      .filter(object =>
        isDrawable(object, this.location, this.residence.get(object.slot))
      )
      .map(object => {
        const where = this.residenceOf(object.slot);
        return {
          heading:
            where.kind === 'surface' || where.kind === 'room'
              ? where.heading
              : undefined,
          position: displacement(where) ?? object.origin,
          slot: object.slot
        };
      });
    const position = this.game.player.position;
    const outcome = interaction.attempt(
      action,
      position,
      candidates,
      this.reachable
    );
    this.carryOut(outcome, interaction.carriedMask);
    const events: PresentationEvent[] = [];
    if (outcome.kind === 'took' || outcome.kind === 'boarded') {
      events.push('tone');
      if (outcome.kind === 'boarded' && this.content.flight !== undefined) {
        const craft = this.objectsBySlot.get(outcome.slot);
        if (craft !== undefined) {
          // Boarding has already changed the craft's Residence to `gone`. Keep the candidate position selected before that write,
          // otherwise a moved craft falls back to its Data Payload origin.
          const at =
            candidates.find(candidate => candidate.slot === outcome.slot)
              ?.position ?? craft.origin;
          const heading = candidates.find(
            candidate => candidate.slot === outcome.slot
          )?.heading;
          this.game = boardCraft(
            this.game,
            outcome.slot,
            { x: at.x, y: 0, z: at.z },
            heading ??
              craftHeading(craft, this.content.flight?.headingConvention),
            this.content.flight
          );
        }
      }
      const flags = this.objectFlags.get(outcome.slot) ?? 0;
      this.describe(interaction.description(outcome.slot, flags));
    } else if (outcome.kind === 'tooHeavy') {
      this.show(interaction.tooHeavyMessage);
    }
    return { events, outcome };
  }

  /// Take one named object without requiring it to be nearby.
  ///
  /// This is the Shell Console's remote equivalent of reaching: it skips only Location and
  /// distance, while the Interaction still owns fixed/heavy checks and the Carried Stack limit.
  takeObject(slot: number): TakeObjectResult {
    this.noteWorld();
    const object = this.objectsBySlot.get(slot);
    if (object === undefined) {
      return { events: [], outcome: { kind: 'missing', slot } };
    }
    const residence = this.residenceOf(slot);
    if (residence.kind === 'carried') {
      return { events: [], outcome: { kind: 'alreadyCarried', slot } };
    }
    if (residence.kind === 'gone') {
      return { events: [], outcome: { kind: 'gone', slot } };
    }
    const interaction = this.content.interaction;
    if (interaction === undefined) {
      return { events: [], outcome: { kind: 'unsupported' } };
    }
    const position = this.game.player.position;
    const outcome = interaction.attempt(
      'take',
      position,
      [{ position, slot }],
      this.reachable
    );
    this.carryOut(outcome, interaction.carriedMask);
    switch (outcome.kind) {
      case 'took': {
        const flags = this.objectFlags.get(slot) ?? 0;
        this.describe(interaction.description(slot, flags));
        return { events: ['tone'], outcome };
      }
      case 'tooHeavy':
        this.show(interaction.tooHeavyMessage);
        return { events: [], outcome };
      case 'fixedInPlace':
      case 'handsFull':
        return { events: [], outcome };
      case 'nothingInReach':
      case 'boarded':
      case 'notACraft':
      case 'alreadyAboard':
        throw new Error(`unexpected remote take outcome '${outcome.kind}'`);
    }
  }

  /// Move one named object to where a Drop would put it, leaving the Carried Stack alone.
  ///
  /// The Shell Console's `fetch`: a move rather than an acquisition, so only the fixed-in-place
  /// rule of a Take applies — weight, the Carried Stack limit and the take script do not — and
  /// Drop's own airborne refusal stands in for whether there is room.
  fetchObject(slot: number): FetchObjectResult {
    if (!this.objectsBySlot.has(slot)) {
      return { events: [], outcome: { kind: 'missing', slot } };
    }
    const residence = this.residenceOf(slot);
    if (residence.kind === 'carried') {
      return { events: [], outcome: { kind: 'alreadyCarried', slot } };
    }
    if (residence.kind === 'gone') {
      return { events: [], outcome: { kind: 'gone', slot } };
    }
    const interaction = this.content.interaction;
    if (interaction === undefined) {
      return { events: [], outcome: { kind: 'unsupported' } };
    }
    if (interaction.isFixedInPlace(slot, this.reachable)) {
      return { events: [], outcome: { kind: 'fixedInPlace', slot } };
    }
    if (this.airborneRefusesDrop()) {
      return { events: [], outcome: { kind: 'airborneRefused' } };
    }
    this.residence.set(slot, this.dropResidence());
    return { events: ['tone'], outcome: { kind: 'fetched', slot } };
  }

  leaveCraft():
    | { readonly events: readonly PresentationEvent[]; readonly slot: number }
    | undefined {
    this.noteWorld();
    const interaction = this.content.interaction;
    if (
      interaction === undefined ||
      this.content.flight === undefined ||
      this.game.mode !== 'grounded'
    ) {
      return undefined;
    }
    if (this.occupancy.kind !== 'aboard') {
      return undefined;
    }
    const { slot } = this.occupancy;
    const position = this.game.player.position;
    // On the Colony Craft deck the player's low altitude byte is eye height,
    // not part of the surface under the parked craft. Clear it as the Reference
    // Build does at `$993E-$994A`; ordinary leaving retains the accepted Golden
    // Trace's full position.
    const at = {
      x: position.x,
      y:
        this.game.colonyCraftFlag !== 0
          ? Math.floor(position.y / 0x1_00) * 0x1_00
          : position.y,
      z: position.z
    };
    // Left where the player stands: in the current Room when underground,
    // on the surface otherwise. The recovered route boards craft 7 in room 5
    // and must be able to step out without teleporting it away.
    this.residence.set(
      slot,
      this.location.kind === 'room'
        ? {
            at,
            heading: this.game.player.heading,
            id: this.location.id,
            kind: 'room'
          }
        : { at, heading: this.game.player.heading, kind: 'surface' }
    );
    this.game = leaveCraftCore(this.game, this.content.flight);
    return { events: ['tone'], slot };
  }

  rideLift(): PresentationEvent[] | undefined {
    this.noteWorld();
    const flight = this.content.flight;
    const underground = this.content.underground;
    if (flight === undefined || underground === undefined) {
      return undefined;
    }
    if (this.liftJourney !== undefined) {
      return undefined;
    }
    const direction = this.location.kind === 'room' ? 'up' : 'down';
    let entrance: UndergroundDocument['entrances'][number] | undefined;
    if (this.location.kind === 'room') {
      entrance = this.liftEntrance(this.location.id);
      if (entrance === undefined) {
        return undefined;
      }
    } else {
      const column = Math.trunc(
        this.game.player.position.x / this.content.cellSize
      );
      const row = Math.trunc(
        this.game.player.position.z / this.content.cellSize
      );
      if (
        !padCovers(
          underground.pad,
          this.game.player.position.x,
          this.content.cellSize
        ) ||
        !padCovers(
          underground.pad,
          this.game.player.position.z,
          this.content.cellSize
        )
      ) {
        return undefined;
      }
      const ordinaryEntrance = underground.entrances.find(
        item =>
          item.cell.length === 2 &&
          item.cell[0] === column &&
          item.cell[1] === row
      );
      const colonyCraft = this.content.endgame?.colonyCraft;
      entrance =
        ordinaryEntrance ??
        (this.game.colonyCraftFlag !== 0 &&
        colonyCraft !== undefined &&
        colonyCraft.cell[0] === column &&
        colonyCraft.cell[1] === row
          ? {
              cell: colonyCraft.cell,
              room: COLONY_CRAFT_LIFT_ROOM,
              site: COLONY_CRAFT_LIFT_ROOM
            }
          : undefined);
      if (entrance === undefined) {
        return undefined;
      }
      const access = underground.lift.access;
      if (
        entrance.room === access.restrictedRoom &&
        !this.carriedStack.includes(access.passSlot)
      ) {
        this.show(access.refusalMessage);
        return undefined;
      }
    }
    // The ride leaves this Location, which levels Free Look.
    this.recentreLook();
    this.liftBensonColour = this.bensonColour;
    this.liftJourney = startLiftJourney(
      direction,
      entrance.room,
      underground.lift,
      this.game.player.position.y
    );
    return [{ lift: direction }];
  }

  private traverse(): PresentationEvent[] {
    if (this.location.kind !== 'room') {
      return [];
    }
    const here = this.content.rooms.get(this.location.id);
    const rules = this.content.doorwayRules;
    if (
      here === undefined ||
      rules === undefined ||
      this.game.wallContact === 0 ||
      this.game.stepInterlock > 0 ||
      this.game.transitionCooldown > 0
    ) {
      return [];
    }
    const predicate = new DoorwayPredicate(rules);
    const doorway = predicate.doorway(
      this.doorwaysOf(here),
      this.game.player.position,
      this.game.player.heading
    );
    if (doorway === undefined) {
      return [];
    }
    if (!predicate.opens(doorway, slot => isCarried(this.residenceOf(slot)))) {
      this.show(rules.lockedMessage);
      return [];
    }
    return this.take(doorway, rules);
  }

  private take(doorway: Doorway, rules: DoorwayRules): PresentationEvent[] {
    const previousRoom = locationHostValue(this.location);
    if ('room' in doorway.destination) {
      const arrival = doorway.arrival;
      this.game = {
        ...this.game,
        player: {
          ...this.game.player,
          position: {
            ...this.game.player.position,
            x: arrival === undefined ? this.game.player.position.x : arrival.x,
            z: arrival === undefined ? this.game.player.position.z : arrival.z
          }
        },
        room: doorway.destination.room,
        stepInterlock: rules.stepInterlock
      };
    } else {
      // The one Doorway out of the underground (`$90C0-$90EA`): the player is
      // put at the Colony Craft's hull — all three coordinates, four million
      // units up — with the crash-tumble mover installed over them, and falls
      // back to Targ from there. It never writes the Ending phase.
      this.game = {
        ...this.game,
        mode: 'flying',
        mover: this.content.endgame?.colonyCraft.exitMover ?? this.game.mover,
        player: {
          ...this.game.player,
          position: {
            x: rules.colonyCraftArrival.x,
            y: rules.colonyCraftArrival.y,
            z: rules.colonyCraftArrival.z
          }
        },
        room: undefined,
        stepInterlock: rules.stepInterlock
      };
    }
    return [
      { arrived: this.location },
      ...this.settleIntoTheRoom(previousRoom)
    ];
  }

  private applySpecialSetup(
    previousRoom: number,
    rules: DoorwayRules
  ): PresentationEvent[] {
    if (this.location.kind !== 'room') {
      return [];
    }
    const here = this.content.rooms.get(this.location.id);
    if (here === undefined || here.specialSetup === undefined) {
      return [];
    }
    const alternate = this.choose(here.specialSetup, previousRoom);
    if (alternate === undefined) {
      return [];
    }
    this.rewired.set(this.location.id, alternate);
    const flips = this.location.id === rules.worldFlipRoom;
    this.game = {
      ...this.game,
      transitionCooldown: flips
        ? rules.worldFlipCooldownFrames
        : rules.cooldownFrames
    };
    if (!flips) {
      return [];
    }
    this.game = { ...this.game, worldFlipped: !this.game.worldFlipped };
    return [{ worldFlipped: this.game.worldFlipped }];
  }

  doorwaysOf(room: Room): Doorway[] {
    const alternate = this.rewired.get(room.id);
    const first = room.doorways[0];
    if (alternate === undefined || first === undefined) {
      return [...room.doorways];
    }
    const doorways = [...room.doorways];
    doorways[0] = rewriteDoorway(first, alternate);
    return doorways;
  }

  private choose(
    setup: SpecialSetup,
    previousRoom: number
  ): Alternate | undefined {
    if (setup.selector === 'random') {
      if (setup.alternates.length === 0) {
        return undefined;
      }
      return setup.alternates[this.nextRandom(setup.alternates.length)];
    }
    const first = setup.alternates[0];
    if (first === undefined) {
      return undefined;
    }
    if (first.room !== previousRoom) {
      return first;
    }
    const second = setup.alternates[1];
    if (second === undefined) {
      return undefined;
    }
    return second.room === previousRoom ? undefined : second;
  }

  private settleIntoTheRoom(previousRoom: number): PresentationEvent[] {
    const events =
      this.content.doorwayRules === undefined
        ? []
        : this.applySpecialSetup(previousRoom, this.content.doorwayRules);
    const walls = this.containment;
    const clamped =
      walls === undefined
        ? { contacts: 0, position: this.game.player.position }
        : walls.clamp(this.game.player.position);
    this.game = {
      ...this.game,
      player: { ...this.game.player, position: clamped.position },
      wallContact: clamped.contacts,
      wallContactLatch: this.game.wallContact
    };
    if (this.location.kind === 'room') {
      const here = this.content.rooms.get(this.location.id);
      if (here !== undefined && this.content.doorwayRules !== undefined) {
        this.react(here, this.content.doorwayRules);
      }
    }
    return events;
  }

  teleport(location: Location): void {
    this.noteWorld();
    this.recentreLook();
    const previousRoom = locationHostValue(this.location);
    this.game = {
      ...this.game,
      room: location.kind === 'surface' ? undefined : location.id
    };
    this.settleIntoTheRoom(previousRoom);
  }

  get indoor(): IndoorScene | undefined {
    if (
      this.location.kind !== 'room' ||
      this.content.doorwayRules === undefined
    ) {
      return undefined;
    }
    const here = this.content.rooms.get(this.location.id);
    if (here === undefined) {
      return undefined;
    }
    return indoorScene(
      here,
      this.content.doorwayRules,
      this.residenceOf(this.content.doorwayRules.photonEmitterSlot)
    );
  }

  /// What a Room says when the player arrives in it.
  ///
  /// The order is the Reference Build's, and it decides one case that is otherwise arbitrary:
  /// darkness queues its message first, and then the header's own reaction runs. So a Room that
  /// is both dark and carries an entry *message* shows the entry message — it overwrote the
  /// pending one — while a dark Room with an entry *script* still says it is dark, because
  /// starting a script does not touch that byte. See PQ-0004 for the darkness itself.
  private react(room: Room, rules: DoorwayRules): void {
    let pending: number | undefined = this.indoor?.dark
      ? rules.darkMessage
      : undefined;
    // A Room whose entry is a script is the Talk Scripts' to answer, from its World Event.
    if (room.entry !== undefined && 'message' in room.entry) {
      pending = room.entry.message;
    }
    if (pending !== undefined) {
      this.show(pending);
    }
  }

  place(position: Vector3, heading?: number): void {
    this.noteWorld();
    this.recentreLook();
    this.game = {
      ...this.game,
      player: {
        ...this.game.player,
        heading: heading ?? this.game.player.heading,
        position
      }
    };
  }

  /// Place the player at an object's current residence.
  ///
  /// Surface positions are normalised into the unsigned 24-bit world because
  /// the payload parks some remote objects in the equivalent signed range.
  /// Room objects retain their room-local coordinates. Carried and removed
  /// objects have no independent place to visit.
  placeAtObject(
    slot: number
  ):
    | { readonly kind: 'carried' | 'gone' | 'missing' }
    | { readonly kind: 'placed'; readonly location: Location } {
    this.noteWorld();
    const object = this.objectsBySlot.get(slot);
    if (object === undefined) {
      return { kind: 'missing' };
    }
    const residence = this.residenceOf(slot);
    if (residence.kind === 'carried' || residence.kind === 'gone') {
      return { kind: residence.kind };
    }
    const at = displacement(residence) ?? object.origin;
    if (residence.kind === 'room') {
      const location = { id: residence.id, kind: 'room' } as const;
      this.teleport(location);
      this.place(at);
      return { kind: 'placed', location };
    }

    const location = { kind: 'surface' } as const;
    const position = {
      x: wrapSurfaceAxis(at.x),
      y: at.y,
      z: wrapSurfaceAxis(at.z)
    };
    this.teleport(location);
    if (this.content.flight !== undefined) {
      this.placeInAir(position);
    } else {
      this.place(position);
    }
    return { kind: 'placed', location };
  }

  /// Place the player on the surface at an airborne height. A craft whose
  /// control block can be flown takes over normally; on foot, or in a craft
  /// whose handler cannot fly, the crash-tumble Mover brings the player down.
  placeInAir(position: Vector3, heading?: number): void {
    this.noteWorld();
    const flight = this.content.flight;
    const craft = this.game.craft;
    const block =
      flight === undefined || craft === undefined
        ? undefined
        : blockFor(flight.document, craft);
    const flyable =
      block?.handler === 'standard' || block?.handler === 'sinking';
    const airborne =
      flight !== undefined && position.y >= flight.rules.groundBand;
    const falling = airborne && !flyable;
    const tumble = falling
      ? flight.document.blocks.find(candidate => candidate.handler === 'tumble')
      : undefined;

    this.recentreLook();
    this.game = {
      ...this.game,
      colonyCraftFlag: 0,
      mode: airborne ? 'flying' : 'grounded',
      mover: falling ? tumble?.index : undefined,
      player: {
        ...this.game.player,
        heading: heading ?? this.game.player.heading,
        position
      }
    };
  }

  carry(slot: number): void {
    this.noteWorld();
    if (!this.objectsBySlot.has(slot)) {
      throw new Error(`Cannot carry missing object slot ${slot}`);
    }
    if (!this.carriedStack.includes(slot)) {
      this.carriedStack.push(slot);
    }
    this.residence.set(slot, { kind: 'carried' });
    const mask = this.carriedMask;
    if (mask !== undefined) {
      this.objectFlags.set(slot, (this.objectFlags.get(slot) ?? 0) | mask);
    }
  }

  drop(selectedSlot?: number): DropResult {
    this.noteWorld();
    const slot = selectedSlot ?? this.carriedStack.at(-1);
    if (slot === undefined) {
      return { events: [], outcome: { kind: 'emptyInventory' } };
    }
    const carriedIndex = this.carriedStack.indexOf(slot);
    if (carriedIndex === -1) {
      throw new Error(`Cannot drop object slot ${slot} that is not carried`);
    }
    if (this.airborneRefusesDrop()) {
      return { events: [], outcome: { kind: 'airborneRefused' } };
    }
    const mask = this.carriedMask ?? 0;
    const flags = (this.objectFlags.get(slot) ?? 0) & ~mask & 0xff;
    const where = this.dropResidence();
    this.carriedStack = [
      ...this.carriedStack.slice(0, carriedIndex),
      ...this.carriedStack.slice(carriedIndex + 1)
    ];
    this.objectFlags.set(slot, flags);
    this.residence.set(slot, where);
    return { events: ['tone'], outcome: { kind: 'dropped', slot } };
  }

  private airborneRefusesDrop(): boolean {
    const exemption = this.content.dropRules?.carriedExemptionSlot;
    return (
      this.game.mode === 'flying' &&
      (exemption === undefined || !this.carriedStack.includes(exemption))
    );
  }

  /// Where a Drop puts an object: at the player, on the storey they stand on.
  private dropResidence(): Residence {
    const position = this.game.player.position;
    const at = {
      x: position.x,
      y: Math.floor(position.y / 0x1_00) * 0x1_00,
      z: position.z
    };
    return this.semanticLocation.kind === 'surface'
      ? { at, kind: 'surface' }
      : { at, id: this.semanticLocation.id, kind: 'room' };
  }

  /// Fire.
  ///
  /// Surface-only falls out of the mover rather than being tested for: firing
  /// belongs to a craft, and a player underground is always on foot (ADR 0016).
  /// A shot leaves at the player's own position, along the direction the craft
  /// is pointing, and carries a speed of its own — the Reference Build converts
  /// the direction with an exponent offset rather than scaling it by how fast
  /// the craft is going, so a slow craft's shot is no slower.
  fire(): FireResult {
    const rules = this.content.fire;
    if (rules === undefined) {
      return { events: [], outcome: { kind: 'unsupported' } };
    }
    if (this.occupancy.kind === 'onFoot') {
      return { events: [], outcome: { kind: 'onFootRefused' } };
    }
    if (this.impact !== undefined) {
      return { events: [], outcome: { kind: 'impactActiveRefused' } };
    }
    if (this.playerShot !== undefined) {
      return { events: [], outcome: { kind: 'shotActiveRefused' } };
    }
    const direction = facing(
      this.game.player,
      this.content.flight?.headingConvention
    );
    const rate = this.content.flight?.limits.referenceFrameRate ?? 1;
    const speed = rules.speedPerFrame * rate;
    this.playerShot = {
      secondsLeft: rules.lifecycleFrames / rate,
      velocity: {
        x: direction.x * speed,
        y: direction.y * speed,
        z: direction.z * speed
      }
    };
    this.residence.set(rules.effectSlot, {
      at: { ...this.game.player.position },
      kind: 'surface'
    });
    return {
      events: [{ fire: { sound: rules.sound } }],
      outcome: { kind: 'fired' }
    };
  }

  board(slot: number): void {
    this.noteWorld();
    // Free Look does not come aboard: the craft keeps the view's own pitch.
    this.recentreLook();
    this.residence.set(slot, { kind: 'gone' });
    if (this.content.flight === undefined) {
      this.game = { ...this.game, craft: slot };
      return;
    }
    this.game = boardCraft(
      this.game,
      slot,
      this.game.player.position,
      this.game.player.heading,
      this.content.flight
    );
  }

  /// Level the view Free Look tilted: the recentre control, and turning Extended Controls off.
  recentreLook(): void {
    if (this.lookPitch !== 0) {
      this.game = {
        ...this.game,
        player: { ...this.game.player, pitch: 0 }
      };
      this.lookPitch = 0;
    }
  }

  /// Tilt the view on foot by the Intent's Free Look for `seconds`, after the step. Aboard, in
  /// a fall, or in a Location the step has just reached, the view is level again.
  private look(seconds: number): void {
    const walking =
      this.game.craft === undefined && this.game.mover === undefined;
    if (!walking || this.game.room !== this.lookRoom) {
      // The step has written the Pose's own pitch, so only the share is dropped.
      this.lookPitch = 0;
      this.lookRoom = this.game.room;
      if (!walking) {
        return;
      }
    }
    this.lookPitch = freeLook(this.lookPitch, this.intent.look, seconds);
    if (this.lookPitch !== 0) {
      this.game = {
        ...this.game,
        player: { ...this.game.player, pitch: this.lookPitch }
      };
    }
  }

  throttleNotchValue(notch: number): void {
    if (this.content.flight === undefined || this.occupancy.kind === 'onFoot') {
      return;
    }
    this.game = setThrottle(this.game, notch, this.content.flight.rules);
  }

  throttleStep(delta: number): void {
    if (this.content.flight === undefined || this.occupancy.kind === 'onFoot') {
      return;
    }
    this.game = stepThrottle(this.game, delta, this.content.flight.rules);
  }

  shutThrottle(): void {
    if (this.occupancy.kind === 'onFoot') {
      return;
    }
    this.game = { ...this.game, throttle: 0 };
  }

  /// Loads or restores the session's Talk Scripts. They hear World Events
  /// and Player Input and share its Benson Display.
  useTalkScripts(
    scripts: readonly TalkScript[],
    options: TalkHostOptions = {},
    saved?: TalkSaveSnapshot
  ): TalkHost {
    if (this.benson === undefined) {
      throw new Error('Talk Scripts need the Benson Display and host state');
    }
    const benson = this.benson;
    this.talk = new TalkHost(scripts, benson, this.worldPort(), options, saved);
    return this.talk;
  }

  /// A new game has begun: the Talk Scripts hear `begin`.
  begin(): void {
    this.talk?.begin();
  }

  /// A key no Binding took, by its code: Player Input for the Talk Scripts.
  input(code: string): void {
    this.talk?.input(code);
  }

  private portObject(slot: number): number {
    if (!this.objectsBySlot.has(slot)) {
      throw new Error(`the world has no object ${slot}`);
    }
    return slot;
  }

  private portFlag(slot: number, change: (flags: number) => number): void {
    this.portObject(slot);
    this.objectFlags.set(slot, change(this.objectFlags.get(slot) ?? 0));
  }

  /// Sets the credits or the Attack State outright, as a scenario or a test
  /// does; play changes them only through the World Port and combat.
  adjust(patch: {
    readonly attackingShip?: boolean;
    readonly credits?: number;
  }): void {
    this.attackingShip = patch.attackingShip ?? this.attackingShip;
    this.credits = patch.credits ?? this.credits;
  }

  private addCredits(amount: number): void {
    const limit = CREDITS_LIMIT;
    this.credits = (((this.credits + amount) % limit) + limit) % limit;
  }

  /// The World Port (ADR 0083): Talk Scripts read and change the session's
  /// own state, one named operation at a time.
  protected worldPort(): WorldPort {
    const object = this.portObject.bind(this);
    const flag = this.portFlag.bind(this);
    return {
      arm: slot => flag(slot, flags => flags | STARTS_TALK),
      armed: slot =>
        ((this.objectFlags.get(object(slot)) ?? 0) & STARTS_TALK) !== 0,
      boarded: () =>
        this.occupancy.kind === 'aboard' ? this.occupancy.slot : undefined,
      carries: slot => this.carriedStack.includes(object(slot)),
      credits: () => this.credits,
      destroyed: cell => this.sites?.destroyedCells().includes(cell) ?? false,
      disarm: slot => flag(slot, flags => flags & ~DISARMED & 0xff),
      escape: () => {
        this.endingPhase = 1;
      },
      fix: slot => flag(slot, flags => flags | FIXED),
      here: () => this.semanticLocation,
      lies: slot => {
        const where = this.residenceOf(object(slot));
        return where.kind === 'room'
          ? room(where.id)
          : where.kind === 'surface'
            ? SURFACE
            : undefined;
      },
      move: (slot, to) => {
        const where = this.residenceOf(object(slot));
        if (where.kind === 'carried') {
          throw new Error('cannot move a carried object');
        }
        if (to.kind === 'room') {
          if (!this.content.rooms.has(to.id)) {
            throw new Error(`the world has no Room ${to.id}`);
          }
          if (where.kind !== 'room' || where.id !== to.id) {
            this.residence.set(slot, { id: to.id, kind: 'room' });
          }
        } else if (where.kind !== 'surface') {
          this.residence.set(slot, { kind: 'surface' });
        }
      },
      pay: amount => this.addCredits(amount),
      random: () => this.nextRandomByte(),
      sendAttacker: () => {
        this.attackingShip = true;
      },
      sendShip: () => {
        this.shipInbound = SHIP_INBOUND;
      },
      spend: amount => this.addCredits(-amount)
    };
  }

  skipMessage(): void {
    this.benson?.skipMessage();
  }

  show(index: number): void {
    this.benson?.showMessage(index, this.credits);
  }

  /// An object's message, if it has one. One whose description is a script is
  /// the Talk Scripts' to answer, from the Take or Boarding's World Event.
  describe(description: Description): void {
    if (description.kind === 'message') {
      this.show(description.index);
    }
  }

  /// One frame of play. Its World Events are everything raised or changed
  /// since the last frame, in the order it happened.
  advance(seconds: number): {
    readonly events: readonly PresentationEvent[];
    readonly snapshot: SessionSnapshot;
    readonly worldEvents: readonly WorldEvent[];
  } {
    const frame = this.advanceFrame(seconds);
    const worldEvents = this.world.take(this.seeWorld());
    if (this.talk === undefined) {
      return { ...frame, worldEvents };
    }
    // The frame's events go before the Talk Scripts' clock moves on, so a
    // Handler's queries see the world exactly as the frame left it.
    const talk = this.talk;
    talk.deliver(worldEvents);
    talk.advance(seconds);
    return {
      events: [
        ...frame.events,
        ...this.talk.takeEffects().map(effect => ({ script: effect }))
      ],
      snapshot: this.snapshot,
      worldEvents
    };
  }

  /// Records what changed since the world was last looked at, before an
  /// operation changes it again.
  private noteWorld(): void {
    this.world.note(this.seeWorld());
  }

  private seeWorld(): WorldSeen {
    const occupancy = this.occupancy;
    return {
      carried: [...this.carriedStack],
      craft: occupancy.kind === 'aboard' ? occupancy.slot : undefined,
      location: this.location
    };
  }

  private advanceFrame(seconds: number): {
    readonly events: readonly PresentationEvent[];
    readonly snapshot: SessionSnapshot;
  } {
    const lift = this.content.underground?.lift;
    if (this.liftJourney === undefined || lift === undefined || seconds <= 0) {
      return this.advanceInterval(seconds);
    }
    // A step is split where the journey's scene changes and where it stops,
    // so what follows either is given only the time after it.
    const events: PresentationEvent[] = [];
    let remaining = seconds;
    while (remaining > 0) {
      const until =
        this.liftJourney === undefined
          ? remaining
          : liftSecondsToNextEvent(this.liftJourney, lift);
      const slice = until > 0 ? Math.min(remaining, until) : remaining;
      events.push(...this.advanceInterval(slice).events);
      // A journey's scene changes at a slice's edge, so each is told apart.
      this.noteWorld();
      remaining -= slice;
    }
    return { events, snapshot: this.snapshot };
  }

  private advanceInterval(seconds: number): {
    readonly events: readonly PresentationEvent[];
    readonly snapshot: SessionSnapshot;
  } {
    const events: PresentationEvent[] = [];
    // Once script 7 has written the Ending phase, the Reference Build's main
    // loop is replaced by the slot-7 handler's non-returning terminal loop,
    // which steps Benson and samples input and runs nothing else: no Mover,
    // no Ship Delivery, no combat.
    const terminal = this.ending.kind !== 'activePlay';
    const journeyAtStart = this.liftJourney !== undefined;
    // A slice never crosses one of the journey's events (`advanceFrame`), so
    // its scene holds for the whole slice.
    const liftSurfaceSeconds =
      this.liftJourney?.scene === 'surface' ? seconds : 0;
    // The Reference Build reads the override's own carried flag every frame, at
    // the throttle and again at the ceiling, rather than remembering a decision
    // taken when it was picked up. So this is derived rather than set: putting
    // it down mid-flight takes the rates away again.
    const powerampSlot = terminal ? undefined : this.content.powerampSlot;
    if (powerampSlot !== undefined) {
      const fitted = this.carriedStack.includes(powerampSlot);
      if (fitted !== this.game.poweramp) {
        this.game = { ...this.game, poweramp: fitted };
      }
    }
    if (
      this.content.flight !== undefined &&
      seconds > 0 &&
      !terminal &&
      !journeyAtStart
    ) {
      let steered = this.intent;
      // A mirrored world mirrors a sidestep as it does a turn.
      if (this.game.worldFlipped) {
        steered = {
          ...steered,
          strafe: -steered.strafe,
          turn: -steered.turn
        };
      }
      this.game = step(
        this.game,
        steered,
        seconds,
        this.content.flight,
        this.containment,
        this.content.endgame
      );
      if (wallThud(this.game) && this.content.doorwayRules !== undefined) {
        events.push({
          wall: { sound: this.content.doorwayRules.wallThudSound }
        });
      }
      events.push(...this.traverse());
      this.look(seconds);
      if (this.game.touchdown !== undefined) {
        events.push('tone', { touchdown: this.game.touchdown });
        if (this.game.touchdown === 'crashed') {
          this.game = leaveCraftCore(this.game, this.content.flight);
        }
      }
    }
    if (this.benson !== undefined && seconds > 0) {
      for (const effect of this.benson.advance(seconds)) {
        events.push({ script: effect });
      }
    }
    if (terminal) {
      this.advanceEndingPresentation(seconds);
    } else {
      this.advanceShipDelivery(seconds);
      events.push(
        ...this.advanceCombat(
          journeyAtStart ? liftSurfaceSeconds : seconds,
          journeyAtStart,
          journeyAtStart
        )
      );
    }
    this.advanceLift(seconds, events);
    return { events, snapshot: this.snapshot };
  }

  /// Moves a Lift Journey on to the end of a slice, after the slice's other
  /// systems: a scene change or arrival at its end gets only the time after.
  private advanceLift(seconds: number, events: PresentationEvent[]): void {
    if (
      this.liftJourney !== undefined &&
      this.content.underground !== undefined
    ) {
      const before = this.liftJourney;
      const advanced = advanceLiftJourney(
        before,
        seconds,
        this.content.underground.lift
      );
      if (advanced.journey !== undefined) {
        this.liftJourney = advanced.journey;
        this.applyLiftScene(before, advanced.journey.scene);
        const colonyEntry =
          advanced.journey.entranceRoom === COLONY_CRAFT_LIFT_ROOM &&
          advanced.journey.scene === 'surface'
            ? this.content.endgame?.colonyCraft.entry
            : undefined;
        const deckOffset =
          colonyEntry === undefined
            ? 0
            : colonyEntry.altitudeHighByte * 0x1_00_00 +
              colonyEntry.wrappedAltitudeMiddleByte * 0x1_00;
        this.game = {
          ...this.game,
          player: {
            ...this.game.player,
            position: {
              ...this.game.player.position,
              y:
                liftCameraAltitude(
                  advanced.journey,
                  this.content.underground.lift
                ) + deckOffset
            }
          }
        };
      } else {
        const previousRoom =
          before.direction === 'down' ? SURFACE_ROOM : before.entranceRoom;
        this.applyLiftScene(
          before,
          before.direction === 'down' ? 'room' : 'surface'
        );
        this.game = {
          ...this.game,
          player: {
            ...this.game.player,
            position: {
              ...this.game.player.position,
              y:
                before.direction === 'up'
                  ? before.restingAltitude
                  : (advanced.finalAltitude ?? this.game.player.position.y)
            }
          }
        };
        if (
          before.direction === 'up' &&
          before.entranceRoom === COLONY_CRAFT_LIFT_ROOM
        ) {
          const colonyCraft = this.content.endgame?.colonyCraft;
          if (colonyCraft !== undefined) {
            this.game = surface(
              this.game,
              {
                cell: colonyCraft.cell,
                room: COLONY_CRAFT_LIFT_ROOM,
                site: COLONY_CRAFT_LIFT_ROOM
              },
              this.content.underground.lift,
              this.content.cellSize,
              colonyCraft
            );
          }
        }
        this.liftJourney = undefined;
        this.liftBensonColour = undefined;
        events.push(
          { arrived: this.location },
          ...this.settleIntoTheRoom(previousRoom)
        );
      }
      this.game = { ...this.game, elapsed: this.game.elapsed + seconds };
    }
  }

  /// Which Site a position is over, formed the way the Reference Build forms it:
  /// the depth axis contributes the high nibble and the across axis the low one.
  private cellAt(
    at: Vector3,
    rules: EndgameSiteDestruction
  ): number | undefined {
    const across = Math.floor(at.x / 0x1_00_00);
    const depth = Math.floor(at.z / 0x1_00_00);
    if (across < 0 || across > 0x0f || depth < 0 || depth > 0x0f) {
      return undefined;
    }
    return rules.cellDepthAxisIsHighNibble
      ? (depth << 4) | across
      : (across << 4) | depth;
  }

  /// Whether a position is inside the band across a cell that carries its Site.
  private withinTheCity(at: Vector3, rules: EndgameSiteDestruction): boolean {
    const [lower, upper] = rules.axisWindow;
    if (lower === undefined || upper === undefined) {
      return false;
    }
    const band = (value: number): boolean => {
      const middle = Math.floor(Math.abs(value) / 0x1_00) & 0xff;
      return middle >= lower && middle < upper;
    };
    // A shot too high passes over the city rather than into it.
    const altitude = at.y;
    const high = Math.floor(altitude / 0x1_00_00);
    if (altitude >= 0 && high !== 0) {
      return false;
    }
    if (
      altitude >= 0 &&
      (Math.floor(altitude / 0x1_00) & 0xff) >= rules.altitudeMidByteLimit
    ) {
      return false;
    }
    return band(at.x) && band(at.z);
  }

  /// What the Player Projectile reached this frame, if it reached anything.
  ///
  /// The three families are the Reference Build's, in its order: a Site in the
  /// city, then the hostile craft, then the one object a shot can start a script
  /// on. A Site is struck wherever the shot is; whether anyone reacts to it is
  /// the Site Ledger's question, not this one's.
  private resolveShot(at: Vector3): readonly PresentationEvent[] {
    const sites = this.content.sites;
    const hits = this.content.objectHits;
    const events: PresentationEvent[] = [];
    if (
      sites !== undefined &&
      this.sites !== undefined &&
      this.withinTheCity(at, sites)
    ) {
      const cell = this.cellAt(at, sites);
      const player = this.cellAt(this.game.player.position, sites);
      if (cell !== undefined) {
        const struck = this.sites.strike(cell, {
          playerCell: player ?? -1,
          restorationCarried: this.carriedStack.includes(sites.restorationSlot)
        });
        this.removeShot();
        this.impact = {
          cell,
          secondsLeft:
            sites.impactFrames /
            (this.content.flight?.limits.referenceFrameRate ?? 1)
        };
        events.push({ impact: { sound: sites.impactSound } });
        if (struck.kind === 'destroyed' || struck.kind === 'gratitude') {
          this.world.raise({
            cell,
            faction: struck.faction,
            kind: 'destroyed',
            reacting:
              struck.kind === 'destroyed' && struck.reaction !== undefined,
            site: struck.site
          });
        }
        if (struck.kind === 'gratitude') {
          this.world.raise({
            faction: struck.grateful,
            kind: 'gratitude'
          });
        }
        return events;
      }
    }
    if (hits === undefined) {
      return events;
    }
    for (const [index, slot] of hits.targetSlots.entries()) {
      if (!this.hitObject(slot, at, hits)) {
        continue;
      }
      events.push({ impact: { sound: hits.sound } });
      if (hits.clearsAttackState && this.benson !== undefined) {
        this.attackingShip = false;
      }
      this.residence.set(slot, { kind: 'gone' });
      this.removeShot();
      this.world.raise({ kind: 'struck', object: slot });
      // The first target announces itself; the Talk Scripts answer the
      // second, from its World Event.
      if (index === 0) {
        this.show(hits.firstTargetMessage);
      }
      return events;
    }
    return events;
  }

  /// Whether the shot is inside the cube the Reference Build calls a hit, with
  /// an object that is on the surface to be hit at all.
  private hitObject(
    slot: number,
    at: Vector3,
    hits: EndgameObjectHits
  ): boolean {
    const where = this.residence.get(slot);
    if (where === undefined || where.kind !== 'surface') {
      return false;
    }
    const target = where.at ?? this.objectsBySlot.get(slot)?.origin;
    if (target === undefined) {
      return false;
    }
    // The Reference Build compares the bytes above the least significant one,
    // so the size it carries counts in `cubeUnit`s rather than world units.
    const reach = hits.cubeSize * hits.cubeUnit;
    return (
      Math.abs(at.x - target.x) < reach &&
      Math.abs(at.y - target.y) < reach &&
      Math.abs(at.z - target.z) < reach
    );
  }

  /// Takes the Player Projectile out of the air.
  private removeShot(): void {
    const slot = this.content.fire?.effectSlot;
    this.playerShot = undefined;
    if (slot !== undefined) {
      this.residence.set(slot, { kind: 'gone' });
    }
  }

  /// The velocity that carries something at slot `from` toward the player,
  /// which is the delta between them shifted right and then negated.
  private aimAtThePlayer(from: Vector3, shift: number): Vector3 {
    const player = this.game.player.position;
    // Shifted as a signed quantity and then complemented, so it points back
    // along the gap rather than across it.
    const toward = (theirs: number, ours: number): number =>
      -Math.floor((theirs - ours) / 2 ** shift) - 1;
    return {
      x: toward(from.x, player.x),
      y: toward(from.y, player.y),
      z: toward(from.z, player.z)
    };
  }

  /// Where an object is, if it is anywhere a shot could reach it.
  private surfacePlaceOf(slot: number): Vector3 | undefined {
    const where = this.residence.get(slot);
    if (where === undefined || where.kind !== 'surface') {
      return undefined;
    }
    return where.at ?? this.objectsBySlot.get(slot)?.origin;
  }

  /// Where an object is, whether or not it is anywhere the player could meet it.
  ///
  /// The Reference Build keeps a position for every slot and consults it before
  /// it decides where the slot should be, which is how an attacker that has not
  /// been sent for yet still has somewhere to be sent from.
  private placeOf(slot: number): Vector3 | undefined {
    const where = this.residence.get(slot);
    const at = where !== undefined && 'at' in where ? where.at : undefined;
    return at ?? this.objectsBySlot.get(slot)?.origin;
  }

  /// The original's frame rate, which turns its per-frame rules into rates and
  /// durations (ADR 0083).
  private get frameRate(): number {
    return this.content.flight?.limits.referenceFrameRate ?? 1;
  }

  /// A lifetime in seconds as the original's whole frames, for comparison.
  private framesOf(seconds: number): number {
    return Math.ceil(seconds * this.frameRate - 1e-9);
  }

  /// Carries the attacker and its shot along their velocities for `seconds`.
  ///
  /// They move the way the Player Projectile does: a velocity, per second,
  /// until a lifetime runs out. Only the attacker keeps going when its own
  /// time is up, because what runs out for it is the approach rather than the
  /// craft.
  private driftHostileEffects(seconds: number, pauseAttacker = false): void {
    const rules = this.content.hostile;
    if (rules === undefined) {
      return;
    }
    const drift = (slot: number, velocity: Vector3): void => {
      const at = this.surfacePlaceOf(slot);
      if (at === undefined) {
        return;
      }
      this.residence.set(slot, {
        at: {
          x: at.x + velocity.x * seconds,
          y: at.y + velocity.y * seconds,
          z: at.z + velocity.z * seconds
        },
        kind: 'surface'
      });
    };
    if (!pauseAttacker && this.attackerVelocity !== undefined) {
      drift(rules.attackingSlot, this.attackerVelocity);
    }
    const shot = this.hostileShot;
    if (shot !== undefined) {
      const secondsLeft = shot.secondsLeft - seconds;
      if (secondsLeft <= 1e-9) {
        this.hostileShot = undefined;
        this.residence.set(rules.inboundSlot, { kind: 'gone' });
      } else {
        this.hostileShot = { ...shot, secondsLeft };
        drift(rules.inboundSlot, shot.velocity);
      }
    }
    return;
  }

  /// The velocity, per second, that carries something at `from` toward the
  /// player: the original's per-frame aim at its frame rate.
  private aimPerSecond(from: Vector3, shift: number): Vector3 {
    const aim = this.aimAtThePlayer(from, shift);
    const rate = this.frameRate;
    return { x: aim.x * rate, y: aim.y * rate, z: aim.z * rate };
  }

  /// The hostile encounter over `seconds`.
  ///
  /// The Reference Build runs this only while the scripts have set the Attack
  /// State and only on the surface. An attacker closes in bursts: it turns
  /// toward the player, then flies blind for the length of its delay before
  /// looking again. Once the player is inside its firing range it shoots, and
  /// once its shot reaches the player the encounter is over — for the player's
  /// craft, not for the player.
  private advanceHostile(seconds: number): readonly PresentationEvent[] {
    const rules = this.content.hostile;
    const events: PresentationEvent[] = [];
    if (
      rules === undefined ||
      this.benson === undefined ||
      !this.attackingShip
    ) {
      return events;
    }
    if (this.approachSeconds > 1e-9) {
      this.approachSeconds = Math.max(0, this.approachSeconds - seconds);
      return events;
    }
    const attacker = this.placeOf(rules.attackingSlot);
    if (attacker === undefined) {
      return events;
    }
    const player = this.game.player.position;
    const reach = rules.firingRange * rules.rangeUnit;
    const near =
      Math.abs(attacker.x - player.x) < reach &&
      Math.abs(attacker.y - player.y) < reach &&
      Math.abs(attacker.z - player.z) < reach;
    if (!near) {
      // Too far to shoot: turn toward the player and close the distance. This
      // is also what brings an attacker into the world in the first place.
      this.residence.set(rules.attackingSlot, {
        at: attacker,
        kind: 'surface'
      });
      this.attackerVelocity = this.aimPerSecond(
        attacker,
        rules.approachAimShift
      );
      // The delay runs until the effect advance parks the attacker, which is
      // the distance from the lifecycle it was given down to the sentinel.
      this.approachSeconds =
        (rules.approachDelayLifecycle - rules.parkedLifecycle) / this.frameRate;
      return events;
    }
    if (this.hostileShot === undefined) {
      // In range and nothing in the air: shoot, from where the attacker is.
      this.hostileShot = {
        secondsLeft: rules.inboundLifecycleFrames / this.frameRate,
        velocity: this.aimPerSecond(attacker, rules.inboundAimShift)
      };
      this.residence.set(rules.inboundSlot, { at: attacker, kind: 'surface' });
      events.push({ impact: { sound: rules.inboundSound } });
      return events;
    }
    const shot = this.surfacePlaceOf(rules.inboundSlot);
    if (shot === undefined) {
      return events;
    }
    const cube = rules.hitCubeSize * rules.rangeUnit;
    const struck =
      Math.abs(shot.x - player.x) < cube &&
      Math.abs(shot.y - player.y) < cube &&
      Math.abs(shot.z - player.z) < cube;
    if (!struck) {
      return events;
    }
    // The hit. A craft is lost and said to be lost; on foot there is nothing to
    // lose and nothing to say. Either way the encounter ends and play does not.
    this.world.raise({
      aboard: this.occupancy.kind === 'aboard',
      kind: 'hit'
    });
    if (this.occupancy.kind === 'aboard') {
      this.show(rules.shipDestroyedMessage);
      this.game = { ...this.game, mover: rules.captureMover };
    }
    events.push({ impact: { sound: rules.hitSound } });
    if (rules.captureClearsAttackingShip && this.benson !== undefined) {
      this.attackingShip = false;
    }
    for (const slot of rules.captureRemovesSlots) {
      this.residence.set(slot, { kind: 'gone' });
    }
    this.hostileShot = undefined;
    this.attackerVelocity = undefined;
    this.approachSeconds = 0;
    return events;
  }

  /// The Player Projectile over `seconds`: it moves, then answers for where it
  /// is.
  private stepPlayerShot(
    seconds: number,
    rules: EndgameFire,
    events: PresentationEvent[]
  ): void {
    const shot = this.playerShot;
    if (shot === undefined) {
      return;
    }
    const secondsLeft = shot.secondsLeft - seconds;
    if (secondsLeft <= 1e-9) {
      this.playerShot = undefined;
      this.residence.set(rules.effectSlot, { kind: 'gone' });
      return;
    }
    const at = this.surfacePlaceOf(rules.effectSlot);
    if (at === undefined) {
      // Nothing is carrying the shot's position any more, so there is no shot;
      // this is the same removal its lifetime would have reached.
      this.playerShot = undefined;
      return;
    }
    const next = {
      x: at.x + shot.velocity.x * seconds,
      y: at.y + shot.velocity.y * seconds,
      z: at.z + shot.velocity.z * seconds
    };
    this.playerShot = { ...shot, secondsLeft };
    this.residence.set(rules.effectSlot, { at: next, kind: 'surface' });
    events.push(...this.resolveShot(next));
    return;
  }

  /// Advances the outdoor objects that move by themselves, and combat.
  ///
  /// The order is the Reference Build's main loop: the permanent flyby, then
  /// the structure impact, the effect slots and the hostile craft. Firing
  /// itself is a Semantic Action rather than a step of this, which is the same
  /// relative order the original has.
  ///
  /// Nothing here runs underground. The original reaches its combat calls only
  /// on the outdoor path, so a Room is not a place where a shot quietly keeps
  /// travelling.
  private advanceCombat(
    seconds: number,
    pauseAttacker = false,
    forceSurface = false
  ): readonly PresentationEvent[] {
    const rules = this.content.fire;
    const events: PresentationEvent[] = [];
    if (
      this.content.flight === undefined ||
      seconds <= 0 ||
      (!forceSurface && this.location.kind !== 'surface')
    ) {
      return events;
    }
    // Sub-steps, so a long step neither carries a shot through what it should
    // hit nor leaves a craft placed and unmoved for the whole of it.
    const substeps = Math.ceil(seconds / MAX_COMBAT_SUBSTEP - 1e-9);
    const each = seconds / substeps;
    for (let substep = 0; substep < substeps; substep += 1) {
      this.stepSurfaceFlyby(each);
      if (this.impact !== undefined) {
        const secondsLeft = this.impact.secondsLeft - each;
        this.impact =
          secondsLeft > 1e-9 ? { ...this.impact, secondsLeft } : undefined;
      }
      if (rules !== undefined) {
        this.stepPlayerShot(each, rules, events);
      }
      this.driftHostileEffects(each, pauseAttacker);
      if (!pauseAttacker) {
        events.push(...this.advanceHostile(each));
      }
    }
    return events;
  }

  /// The Reference Build carries slot 0 along Z every outdoor frame. In world
  /// coordinates that is a constant speed, wrapping at `wrapAt`.
  private stepSurfaceFlyby(seconds: number): void {
    const rules = this.content.surfaceFlyby;
    if (rules === undefined) {
      return;
    }
    const at = this.surfacePlaceOf(rules.slot);
    if (at === undefined) {
      return;
    }
    this.residence.set(rules.slot, {
      at: {
        ...at,
        z: (at.z + rules.stepPerFrame * this.frameRate * seconds) % rules.wrapAt
      },
      kind: 'surface'
    });
    return;
  }

  /// Runs the Escape's star field, which keeps its own loop rate. The field
  /// is what writes phase 255, from inside its colour sequence.
  private advanceEndingPresentation(seconds: number): void {
    const rules = this.content.endingField;
    if (rules === undefined || this.benson === undefined || seconds <= 0) {
      return;
    }
    this.endingField ??= InterstellarShipField.begin(
      rules,
      this.endingFieldSeed()
    );
    this.endingField.advance(
      seconds,
      () => {
        const ending = this.ending;
        return ending.kind === 'escape' ? ending.phase : undefined;
      },
      written => {
        this.endingPhase = written;
      }
    );
  }

  /// The two bytes the field's generator continues from.
  ///
  /// The Reference Build never seeds this generator: a respawn continues
  /// whatever random history the session already had, so there is no first-frame
  /// seed to reproduce. What matters is that the same session always reaches the
  /// same field, which taking the bytes from the session's random stream gives.
  private endingFieldSeed(): { state: number; value: number } {
    const random = this.ownRandomState;
    return {
      state: Number((random >> 8n) & 0xffn),
      value: Number(random & 0xffn)
    };
  }

  /// Flies a hired ship down: its altitude follows the descent track by the
  /// seconds since it began (ADR 0083), and it lands at the track's end.
  ///
  /// The Reference Build runs this before the branch that would skip it
  /// underground, so the ship keeps coming while the player is in a Room,
  /// mid-message, or anywhere else. The scripts decide that a ship was hired;
  /// this is what that decision does next.
  private advanceShipDelivery(seconds: number): void {
    const rules = this.content.shipDelivery;
    const rate = this.content.flight?.limits.referenceFrameRate;
    if (
      rules === undefined ||
      rate === undefined ||
      this.benson === undefined ||
      seconds <= 0
    ) {
      return;
    }
    const state = this.shipInbound;
    if (state === rules.inactiveValue) {
      this.deliverySeconds = undefined;
      return;
    }
    if ((state & rules.acceptedMask) !== 0) {
      this.shipInbound = rules.descendingValue;
      this.deliverySeconds = 0;
    }
    this.deliverySeconds = (this.deliverySeconds ?? 0) + seconds;
    const track = descentTrack(rules);
    const step = Math.floor(this.deliverySeconds * rate + 1e-9);
    const altitude = track[Math.min(step, track.length - 1)]!;
    const { initialisation: start } = rules;
    this.residence.set(rules.slot, {
      at: { x: start.x, y: altitude << 8, z: start.z },
      kind: 'surface'
    });
    if (altitude === 0) {
      this.shipInbound = rules.inactiveValue;
      this.deliverySeconds = undefined;
    }
  }

  /// This session as flat scalars, for comparison against the Reference Build.
  ///
  /// Frames left on each occupied Effect Slot, keyed by the slot the payload
  /// puts it in rather than by a number spelled here.
  private effectLifecycles(): ReadonlyMap<number, number> {
    const lifecycles = new Map<number, number>();
    const shot = this.playerShot;
    const slot = this.content.fire?.effectSlot;
    if (shot !== undefined && slot !== undefined) {
      lifecycles.set(slot, this.framesOf(shot.secondsLeft));
    }
    const inbound = this.hostileShot;
    const inboundSlot = this.content.hostile?.inboundSlot;
    if (inbound !== undefined && inboundSlot !== undefined) {
      lifecycles.set(inboundSlot, this.framesOf(inbound.secondsLeft));
    }
    return lifecycles;
  }

  /// Separate from `snapshot` on purpose: a Session Snapshot is what renderers
  /// draw from, and widening it to carry script counters and engine flags would
  /// push them through every renderer and every trace that compares one.
  observations(): SemanticObservations {
    const sites = this.sites;
    // One block for everything combat owns, present whenever the content
    // carries combat at all rather than only when it carries Sites.
    const combat =
      sites === undefined && this.content.fire === undefined
        ? undefined
        : {
            destroyedCells: sites?.destroyedCells() ?? [],
            effectLifecycles: this.effectLifecycles(),
            mechanoidDestroyed: sites?.mechanoidDestroyed ?? 0,
            mover: this.game.mover,
            palyarDestroyed: sites?.palyarDestroyed ?? 0
          };
    return observationsOf({
      attackingShip: this.attackingShip,
      carriedStack: this.carriedStack,
      ...(combat === undefined ? {} : { combat }),
      benson: this.benson,
      colonyCraftFlag: this.game.colonyCraftFlag,
      credits: this.credits,
      endingPhase: this.endingPhase,
      location: this.location,
      objectFlags: this.objectFlags,
      occupancy: this.occupancy,
      position: this.game.player.position,
      residence: this.residence,
      shipInbound: this.shipInbound
    });
  }

  get snapshot(): SessionSnapshot {
    const lift = this.content.underground?.lift;
    const journey = this.liftJourney;
    const bensonColour = this.bensonColour;
    const liftIndex =
      journey === undefined ? undefined : liftPhaseIndex(journey);
    return {
      ...(bensonColour === undefined ? {} : { bensonColour }),
      bensonMessage: this.benson?.messagePresentation,
      carriedStack: [...this.carriedStack],
      core: {
        poweramp: this.game.poweramp,
        stepInterlock: this.game.stepInterlock,
        touchdown: this.game.touchdown,
        transitionCooldown: this.game.transitionCooldown,
        wallContact: this.game.wallContact,
        wallContactLatch: this.game.wallContactLatch
      },
      credits: this.credits,
      elapsed: this.game.elapsed,
      ending: this.ending,
      ...(this.endingField === undefined
        ? {}
        : {
            escapePresentation: {
              colourPair: this.endingField.colourPair,
              points: this.endingField.points
            }
          }),
      indoor: this.indoor,
      isScriptRunning: false,
      location: this.location,
      ...(journey === undefined || lift === undefined || liftIndex === undefined
        ? {}
        : {
            liftJourney: {
              destination:
                journey.direction === 'down'
                  ? ({ id: journey.entranceRoom, kind: 'room' } as const)
                  : ({ kind: 'surface' } as const),
              direction: journey.direction,
              instrumentAltitude: journey.restingAltitude,
              lineColour:
                lift.screen.indoorLineColours[journey.stage - 8] ??
                (journey.stage === 12
                  ? lift.screen.descendingInitialLineColour
                  : 0),
              pitchHighByte: lift.pitchHighBytes[liftIndex] ?? 0,
              position: journey.position,
              scene: journey.scene,
              screenSplit:
                journey.stage >= 7 && journey.position < lift.screen.rasterLimit
                  ? journey.position + lift.screen.rasterBase
                  : undefined,
              stage: journey.stage,
              upperColour:
                lift.screen.indoorLineColours[journey.stage - 7] ??
                (journey.stage === 11
                  ? lift.screen.descendingInitialLineColour
                  : 0)
            }
          }),
      mode: this.game.mode,
      objectFlags: new Map(this.objectFlags),
      occupancy: this.occupancy,
      player: this.game.player,
      residence: this.sceneResidence,
      throttle: this.game.throttle,
      throttleNotch: this.throttleNotch,
      worldFlipped: this.game.worldFlipped
    };
  }

  /// The Ending this session has reached, as the rest of the app reads it.
  ///
  /// Projected from the phase byte on every read rather than held beside it,
  /// so there is no second copy to keep in step.
  get ending(): EndingState {
    return endingStateOf(this.endingPhase);
  }

  private get sceneResidence(): Map<number, Residence> {
    return new Map(this.residence);
  }

  get throttleNotch(): number {
    const notches = this.content.flight?.rules.throttleNotches;
    if (notches === undefined) {
      return 0;
    }
    const index = notches.findIndex(
      notch => Math.abs(notch - this.game.throttle) < 0.5
    );
    return index < 0 ? 0 : index + 1;
  }

  get containment(): Containment | undefined {
    if (
      this.location.kind !== 'room' ||
      this.content.doorwayRules === undefined
    ) {
      return undefined;
    }
    const here = this.content.rooms.get(this.location.id);
    if (here === undefined) {
      return undefined;
    }
    return new Containment(here, this.content.doorwayRules);
  }

  private nextRandom(count: number): number {
    if (count <= 0) {
      return 0;
    }
    return this.nextRandomByte() % count;
  }

  /// Sets where the session's random stream goes on from, as a replay or a
  /// test that needs a particular roll does.
  seedRandom(state: bigint): void {
    this.ownRandomState = state;
  }

  /// The next byte of the session's random stream (ADR 0083).
  nextRandomByte(): number {
    const stepped = randomByte(this.ownRandomState);
    this.ownRandomState = stepped.state;
    return stepped.byte;
  }
}
