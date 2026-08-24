import type { BensonEffect } from '../benson/host.ts';
import {
  BensonHostState,
  BensonSession,
  BensonState,
  DEFAULT_SESSION_SEED,
  nextRandom,
  type BensonKey
} from '../benson/index.ts';
import type { Touchdown } from '../flight/index.ts';
import {
  IDLE,
  REFERENCE_OPENING_POSITION,
  board as boardCraft,
  enter,
  facing,
  gameState,
  leave as leaveCraftCore,
  playerState,
  throttle as setThrottle,
  step,
  throttleStep as stepThrottle,
  surface,
  wallThud,
  type FlightModel,
  type GameState,
  type Intent,
  type PlayerState
} from '../gameCore/index.ts';
import {
  Interaction,
  SURFACE_ROOM,
  type Description,
  type InteractionAction,
  type Outcome
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
  EndgameObjectHits,
  EndgameShipDelivery,
  EndgameSiteDestruction,
  SpecialSetup,
  UndergroundDocument
} from '../payload/documents.ts';
import { indoorScene, type IndoorScene } from '../scene/index.ts';
import {
  displacement,
  hostRoom,
  isCarried,
  isDrawable,
  locationFromHost,
  locationHostValue,
  type Location,
  type ObjectPlacement,
  type Residence,
  type Room,
  type World
} from '../world/index.ts';
import { observationsOf, type SemanticObservations } from './observations.ts';
import {
  decodeRandomState,
  encodeRandomState,
  type SaveSnapshot
} from './save.ts';
import { SiteLedger } from './sites.ts';

/// The Gameplay Session: the one owner of a play session's Session State (ADR 0018).
///
/// Every discrete change to that state passes through a Semantic Action: `reach`, `drop`,
/// `leaveCraft`, `rideLift`, `teleport`, `place`, `carry`, `board`, `throttleNotchValue`, `throttleStep`,
/// `shutThrottle`, `press`, `skipMessage`, `start`, `show`, `describe`. Each moves
/// everything or nothing, which is what ADR 0018 asks of them.
///
/// Two things are deliberately not actions. `intent` is a held input rather than an event, so a
/// caller assigns it and `advance` reads whatever it says at the time — that is the shape a
/// keyboard has. `game` is public because the Mover's own state is `gameCore`'s to define and
/// this class only carries it. Neither is `readonly` yet, so the single-owner rule is a
/// convention here rather than something the type enforces; tightening that is worth doing when
/// the shell lands a second caller (#95).
///
/// **The Host Callout is projected, not stored.** The interpreter reads its own flat
/// `BensonHostState` of bytes, and this module owns the typed Location, Occupancy and Object
/// Residence those bytes stand for. `project` writes the typed state down into a fresh Host
/// Callout, `reconcile` reads a script's writes back up into typed state, and
/// `acrossTheCallout` is the two of them around one interpreter call. There is deliberately no
/// second copy: the bytes are derived on the way in and consumed on the way out, so a script and
/// the session cannot hold divergent ideas of where the player is. Both values are persistent
/// (ADR 0023), so a projection cannot alias the state it came from.
///
/// What a script may change is therefore narrower than what it can write, and `reconcile` is
/// where that is decided — a byte the session owns outright is read back, one it does not is
/// dropped. That asymmetry is the point of the seam rather than an omission in it.
///
/// The two Movers are `gameCore`'s and are not re-implemented here: `advance` hands them the
/// intent and the Room's walls, then turns what came back — a touchdown, wall contact, a Doorway
/// taken — into PresentationEvents for the caller to sound and draw. Session State stays the
/// session's own; a PresentationEvent is what only presentation should answer.

export type Occupancy =
  | { readonly kind: 'onFoot' }
  | { readonly kind: 'aboard'; readonly slot: number };

const occupancyHostValue = (occupancy: Occupancy): number =>
  occupancy.kind === 'onFoot' ? BensonHostState.onFoot : occupancy.slot;

const occupancyFromHost = (value: number): Occupancy =>
  value === BensonHostState.onFoot
    ? { kind: 'onFoot' }
    : { kind: 'aboard', slot: value };

export type PresentationEvent =
  | 'tone'
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

export interface SessionSnapshot {
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
  readonly indoor: IndoorScene | undefined;
  readonly isScriptRunning: boolean;
  readonly location: Location;
  readonly message: string;
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
    heading: 0,
    pitch: 0,
    position: REFERENCE_OPENING_POSITION
  });

export interface SessionContent {
  readonly cellSize: number;
  readonly doorwayRules: DoorwayRules | undefined;
  readonly dropRules?: EndgameDropRules;
  /// What firing costs and how far a shot gets.
  readonly fire?: EndgameFire;
  readonly flight: FlightModel | undefined;
  /// How a hostile craft closes, shoots, and what its hit costs.
  readonly hostile?: EndgameHostileCraft;
  readonly interaction: Interaction | undefined;
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
  objectHits: bundle.endgame.combat.objectHits,
  objects: world.objects,
  powerampSlot: bundle.endgame.controls.powerampSlot,
  rooms: world.rooms,
  shipDelivery: bundle.endgame.shipDelivery,
  sites: bundle.endgame.combat.siteDestruction,
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

const TWO_PI = 2 * Math.PI;

/// A craft's heading, from the orientation bytes the payload carries for it.
///
/// Those bytes count 256 to a turn, which is the object tables' own unit and not the 1024 the
/// control loop's angles use. The half turn is the models' own facing: a craft's nose points
/// along decreasing Z when its orientation byte is zero, while a heading of zero looks along
/// increasing Z, so boarding one without this put the player in it back to front.
const craftHeading = (craft: ObjectPlacement): number => {
  const turn = ((craft.orientation.y & 0xff) / 256) * TWO_PI;
  return (turn + Math.PI) % TWO_PI;
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
  if (combat.impact !== null && combat.impact.framesLeft > sites.impactFrames) {
    throw new Error('Save Snapshot impact outlives its own lifecycle');
  }
  const agrees = (
    slot: number | undefined,
    flying: { readonly framesLeft: number } | null,
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
    if (flying !== null && limit !== undefined && flying.framesLeft > limit) {
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

  /// The fraction of a frame left over from the last ship-delivery step.
  private deliveryFrames = 0;
  private residence = new Map<number, Residence>();
  private objectFlags = new Map<number, number>();
  private carriedStack: number[] = [];
  scripts: BensonSession | undefined;
  private rewired = new Map<number, Alternate>();
  /// The Site Ledger, owned here and projected across the Host Callout for the
  /// scripts to read (ADR 0018). Absent when the content carries no Sites.
  private sites: SiteLedger | undefined;
  /// The part of a combat frame that had not elapsed yet.
  private combatFrames = 0;
  /// The one Player Projectile, while it is in flight. Its position is its
  /// Object Residence, because that is what draws it; only what residence
  /// cannot hold is kept here.
  private playerShot: { framesLeft: number; velocity: Vector3 } | undefined;
  /// The structure impact now playing, which firing waits for.
  private impact: { cell: number; framesLeft: number } | undefined;
  /// The Hostile Projectile on its way, while there is one.
  private hostileShot: { framesLeft: number; velocity: Vector3 } | undefined;
  /// How the attacker is travelling on its current approach.
  private attackerVelocity: Vector3 | undefined;
  /// Frames the attacker has left of its current approach. It counts down
  /// before the encounter looks at anything, which is what gives an attacker
  /// time to close rather than shooting the instant it is aimed.
  private approachFrames = 0;
  private ownRandomState: bigint;
  private readonly objectsBySlot: ReadonlyMap<number, ObjectPlacement>;

  constructor(
    content: SessionContent,
    player: PlayerState,
    scripts?: BensonSession,
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
    this.scripts = scripts;
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
        } else if (object.room === BensonHostState.outOfTheWorld) {
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
    if (this.scripts !== undefined) {
      this.scripts.host = this.project(this.scripts.host);
    }
  }

  captureSaveSnapshot(): SaveSnapshot {
    return {
      benson: this.scripts?.captureSaveSnapshot() ?? null,
      carriedStack: [...this.carriedStack],
      combat:
        this.sites === undefined
          ? null
          : {
              approachFrames: this.approachFrames,
              attackerVelocity:
                this.attackerVelocity === undefined
                  ? null
                  : { ...this.attackerVelocity },
              frames: this.combatFrames,
              hostileShot:
                this.hostileShot === undefined
                  ? null
                  : {
                      framesLeft: this.hostileShot.framesLeft,
                      velocity: { ...this.hostileShot.velocity }
                    },
              impact: this.impact === undefined ? null : { ...this.impact },
              mechanoidDestroyed: this.sites.mechanoidDestroyed,
              palyarDestroyed: this.sites.palyarDestroyed,
              playerShot:
                this.playerShot === undefined
                  ? null
                  : {
                      framesLeft: this.playerShot.framesLeft,
                      velocity: { ...this.playerShot.velocity }
                    },
              siteTable: [...this.sites.bytes]
            },
      deliveryFrames: this.deliveryFrames,
      game: {
        ...this.game,
        craft: this.game.craft ?? null,
        mover: this.game.mover ?? null,
        room: this.game.room ?? null,
        touchdown: this.game.touchdown ?? null
      },
      objectFlags: [...this.objectFlags.entries()].sort(([a], [b]) => a - b),
      randomState: encodeRandomState(this.ownRandomState),
      residence: [...this.residence.entries()].sort(([a], [b]) => a - b),
      rewired: [...this.rewired.entries()].sort(([a], [b]) => a - b)
    };
  }

  static restore(
    content: SessionContent,
    scripts: BensonSession | undefined,
    snapshot: SaveSnapshot
  ): GameplaySession {
    validateSnapshotReferences(content, snapshot);
    if ((scripts === undefined) !== (snapshot.benson === null)) {
      throw new Error(
        'Save Snapshot scripting state does not match the Gameplay Session content'
      );
    }
    const restoredScripts =
      scripts === undefined || snapshot.benson === null
        ? undefined
        : BensonSession.restore(
            scripts.program,
            scripts.text,
            scripts.tunables,
            snapshot.benson
          );
    const session = new GameplaySession(
      content,
      snapshot.game.player,
      restoredScripts,
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
    session.deliveryFrames = snapshot.deliveryFrames;
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
      session.combatFrames = snapshot.combat.frames;
      session.approachFrames = snapshot.combat.approachFrames;
      session.attackerVelocity =
        snapshot.combat.attackerVelocity === null
          ? undefined
          : { ...snapshot.combat.attackerVelocity };
      session.hostileShot =
        snapshot.combat.hostileShot === null
          ? undefined
          : {
              framesLeft: snapshot.combat.hostileShot.framesLeft,
              velocity: { ...snapshot.combat.hostileShot.velocity }
            };
      session.impact = snapshot.combat.impact ?? undefined;
      session.playerShot =
        snapshot.combat.playerShot === null
          ? undefined
          : {
              framesLeft: snapshot.combat.playerShot.framesLeft,
              velocity: { ...snapshot.combat.playerShot.velocity }
            };
    }
    session.republishHostState();
    return session;
  }

  get location(): Location {
    return locationFromHost(this.game.room ?? SURFACE_ROOM);
  }

  get occupancy(): Occupancy {
    return occupancyFromHost(this.game.craft ?? BensonHostState.onFoot);
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

  private project(host: BensonHostState): BensonHostState {
    const objectRooms = new Map<number, number>();
    for (const [slot, where] of this.residence) {
      objectRooms.set(slot, hostRoom(where));
    }
    return host.with({
      boardedCraft: occupancyHostValue(this.occupancy),
      currentRoom: locationHostValue(this.location),
      destroyedBlocks: new Set(this.sites?.destroyedCells() ?? []),
      inventory: new Set(this.carriedStack),
      objectFlags: new Map(this.objectFlags),
      objectRooms
    });
  }

  private reconcile(host: BensonHostState): void {
    const nextLocation = locationFromHost(host.currentRoom);
    const nextResidence = new Map<number, Residence>();
    const nextFlags = new Map<number, number>();
    const inventory = new Set(host.inventory);
    const knownSlots = new Set(this.objectsBySlot.keys());
    if (
      host.objectFlags.size !== knownSlots.size ||
      host.objectRooms.size !== knownSlots.size
    ) {
      throw new Error('Host Callout has an incomplete or extra object census');
    }
    for (const slot of host.objectFlags.keys()) {
      if (!knownSlots.has(slot)) {
        throw new Error(`Host Callout refers to missing object slot ${slot}`);
      }
    }
    for (const slot of host.objectRooms.keys()) {
      if (!knownSlots.has(slot)) {
        throw new Error(`Host Callout refers to missing object slot ${slot}`);
      }
    }
    for (const slot of inventory) {
      if (!knownSlots.has(slot)) {
        throw new Error(`Host Callout carries missing object slot ${slot}`);
      }
    }
    for (const slot of knownSlots) {
      const written = host.objectRooms.get(slot);
      const flags = host.objectFlags.get(slot);
      if (written === undefined || flags === undefined) {
        throw new Error(
          `Host Callout has an incomplete object census at slot ${slot}`
        );
      }
      const current = this.residenceOf(slot);
      const carried = host.inventory.has(slot);
      const carriedBit =
        this.carriedMask === undefined
          ? carried
          : (flags & this.carriedMask) !== 0;
      if (
        carried !== carriedBit ||
        (carried && written !== BensonHostState.outOfTheWorld)
      ) {
        throw new Error(
          `Host Callout carrying representations disagree at slot ${slot}`
        );
      }
      nextFlags.set(slot, flags);
      if (carried) {
        nextResidence.set(slot, { kind: 'carried' });
      } else if (written === BensonHostState.outOfTheWorld) {
        nextResidence.set(slot, { kind: 'gone' });
      } else if (written === SURFACE_ROOM) {
        const at = current.kind === 'surface' ? current.at : undefined;
        nextResidence.set(
          slot,
          at === undefined ? { kind: 'surface' } : { at, kind: 'surface' }
        );
      } else {
        if (!this.content.rooms.has(written)) {
          throw new Error(`Host Callout refers to missing Room ${written}`);
        }
        const at =
          current.kind === 'room' && current.id === written
            ? current.at
            : undefined;
        nextResidence.set(
          slot,
          at === undefined
            ? { id: written, kind: 'room' }
            : { at, id: written, kind: 'room' }
        );
      }
    }
    const retained = this.carriedStack.filter(slot => inventory.has(slot));
    const retainedSet = new Set(retained);
    const introduced = [...inventory]
      .filter(slot => !retainedSet.has(slot))
      .sort((a, b) => a - b);
    const occupancy = occupancyFromHost(host.boardedCraft);
    const nextGame = {
      ...this.game,
      craft: occupancy.kind === 'onFoot' ? undefined : occupancy.slot,
      room: nextLocation.kind === 'surface' ? undefined : nextLocation.id
    };
    this.game = nextGame;
    this.residence = nextResidence;
    this.objectFlags = nextFlags;
    this.carriedStack = [...retained, ...introduced];
  }

  private acrossTheCallout<T>(
    body: (host: BensonHostState) => {
      readonly host: BensonHostState;
      readonly result: T;
    }
  ): T | undefined {
    if (this.scripts === undefined) {
      return undefined;
    }
    const { host, result } = body(this.project(this.scripts.host));
    this.reconcile(host);
    this.scripts.host = host;
    return result;
  }

  private republishHostState(): void {
    if (this.scripts === undefined) {
      return;
    }
    this.scripts.host = this.project(this.scripts.host);
  }

  reach(
    action: InteractionAction,
    only?: number
  ): {
    readonly events: readonly PresentationEvent[];
    readonly outcome: Outcome;
  } {
    const interaction = this.content.interaction;
    if (interaction === undefined || this.scripts === undefined) {
      return { events: [], outcome: { kind: 'nothingInReach' } };
    }
    const candidates = this.content.objects
      .filter(object => only === undefined || object.slot === only)
      .filter(object =>
        isDrawable(object, this.location, this.residence.get(object.slot))
      )
      .map(object => ({
        position: displacement(this.residenceOf(object.slot)) ?? object.origin,
        slot: object.slot
      }));
    const position = this.game.player.position;
    const outcome = this.acrossTheCallout(host => {
      const attempted = interaction.attempt(action, position, candidates, host);
      return { host: attempted.host, result: attempted.outcome };
    });
    if (outcome === undefined) {
      return { events: [], outcome: { kind: 'nothingInReach' } };
    }
    const events: PresentationEvent[] = [];
    if (outcome.kind === 'took' || outcome.kind === 'boarded') {
      events.push('tone');
      if (outcome.kind === 'boarded' && this.content.flight !== undefined) {
        const craft = this.objectsBySlot.get(outcome.slot);
        if (craft !== undefined) {
          const at =
            displacement(this.residenceOf(outcome.slot)) ?? craft.origin;
          this.game = boardCraft(
            this.game,
            outcome.slot,
            { x: at.x, y: 0, z: at.z },
            craftHeading(craft),
            this.content.flight
          );
        }
      }
      const flags = this.scripts?.host.objectFlags.get(outcome.slot) ?? 0;
      this.describe(interaction.description(outcome.slot, flags));
    } else if (outcome.kind === 'tooHeavy') {
      this.show(interaction.tooHeavyMessage);
    }
    return { events, outcome };
  }

  leaveCraft():
    | { readonly events: readonly PresentationEvent[]; readonly slot: number }
    | undefined {
    const interaction = this.content.interaction;
    if (
      interaction === undefined ||
      this.content.flight === undefined ||
      this.game.mode !== 'grounded'
    ) {
      return undefined;
    }
    const position = this.game.player.position;
    const slot = this.acrossTheCallout(host => {
      const left = interaction.leave(host);
      return { host: left.host, result: left.slot };
    });
    if (slot === undefined) {
      return undefined;
    }
    const at = { x: position.x, y: position.y, z: position.z };
    // Left where the player stands: in the current Room when underground,
    // on the surface otherwise. The recovered route boards craft 7 in room 5
    // and must be able to step out without teleporting it away.
    this.residence.set(
      slot,
      this.location.kind === 'room'
        ? { at, id: this.location.id, kind: 'room' }
        : { at, kind: 'surface' }
    );
    this.game = leaveCraftCore(this.game, this.content.flight);
    return { events: ['tone'], slot };
  }

  rideLift(): PresentationEvent[] | undefined {
    const flight = this.content.flight;
    const underground = this.content.underground;
    if (flight === undefined || underground === undefined) {
      return undefined;
    }
    const previousRoom = locationHostValue(this.location);
    if (this.location.kind === 'room') {
      const id = this.location.id;
      const entrance = underground.entrances.find(item => item.room === id);
      if (entrance === undefined) {
        return undefined;
      }
      this.game = surface(
        this.game,
        entrance,
        underground.lift,
        this.content.cellSize,
        flight
      );
    } else {
      const column = Math.trunc(
        this.game.player.position.x / this.content.cellSize
      );
      const row = Math.trunc(
        this.game.player.position.z / this.content.cellSize
      );
      if (
        this.occupancy.kind !== 'onFoot' ||
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
      const entrance = underground.entrances.find(
        item =>
          item.cell.length === 2 &&
          item.cell[0] === column &&
          item.cell[1] === row
      );
      if (entrance === undefined) {
        return undefined;
      }
      this.game = enter(this.game, entrance, underground.lift, flight);
    }
    return [
      'tone',
      { arrived: this.location },
      ...this.settleIntoTheRoom(previousRoom)
    ];
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
      this.game = {
        ...this.game,
        player: {
          ...this.game.player,
          position: {
            ...this.game.player.position,
            x: rules.colonyCraftArrival.x,
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
    this.republishHostState();
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
    if (room.entry !== undefined && 'script' in room.entry) {
      // A script that is already running is not restarted, as the Reference Build's own
      // starter refuses.
      this.start(room.entry.script);
    } else if (room.entry !== undefined && 'message' in room.entry) {
      pending = room.entry.message;
    }
    if (pending !== undefined) {
      this.show(pending);
    }
  }

  place(position: Vector3, heading?: number): void {
    this.game = {
      ...this.game,
      player: {
        ...this.game.player,
        heading: heading ?? this.game.player.heading,
        position
      }
    };
  }

  carry(slot: number): void {
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
    this.republishHostState();
  }

  drop(): DropResult {
    const slot = this.carriedStack.at(-1);
    if (slot === undefined) {
      return { events: [], outcome: { kind: 'emptyInventory' } };
    }
    const exemption = this.content.dropRules?.carriedExemptionSlot;
    if (
      this.game.mode === 'flying' &&
      (exemption === undefined || !this.carriedStack.includes(exemption))
    ) {
      return { events: [], outcome: { kind: 'airborneRefused' } };
    }
    const mask = this.carriedMask ?? 0;
    const flags = (this.objectFlags.get(slot) ?? 0) & ~mask & 0xff;
    const position = this.game.player.position;
    const at = {
      x: position.x,
      y: Math.floor(position.y / 0x1_00) * 0x1_00,
      z: position.z
    };
    const where: Residence =
      this.location.kind === 'surface'
        ? { at, kind: 'surface' }
        : { at, id: this.location.id, kind: 'room' };
    this.carriedStack = this.carriedStack.slice(0, -1);
    this.objectFlags.set(slot, flags);
    this.residence.set(slot, where);
    this.republishHostState();
    return { events: ['tone'], outcome: { kind: 'dropped', slot } };
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
    const direction = facing(this.game.player);
    const speed = rules.speedPerFrame;
    this.playerShot = {
      framesLeft: rules.lifecycleFrames,
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
    this.republishHostState();
    return {
      events: [{ fire: { sound: rules.sound } }],
      outcome: { kind: 'fired' }
    };
  }

  board(slot: number): void {
    this.residence.set(slot, { kind: 'gone' });
    if (this.content.flight === undefined) {
      this.game = { ...this.game, craft: slot };
      this.republishHostState();
      return;
    }
    this.game = boardCraft(
      this.game,
      slot,
      this.game.player.position,
      this.game.player.heading,
      this.content.flight
    );
    this.republishHostState();
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

  press(key: BensonKey | undefined): void {
    this.scripts?.press(key);
  }

  skipMessage(): void {
    this.scripts?.skipMessage();
  }

  start(script: number): boolean {
    return this.scripts?.start(script) ?? false;
  }

  show(index: number): void {
    this.scripts?.showMessage(index);
  }

  describe(description: Description): void {
    this.scripts?.describe(description);
  }

  advance(seconds: number): {
    readonly events: readonly PresentationEvent[];
    readonly snapshot: SessionSnapshot;
  } {
    const events: PresentationEvent[] = [];
    // The Reference Build reads the override's own carried flag every frame, at
    // the throttle and again at the ceiling, rather than remembering a decision
    // taken when it was picked up. So this is derived rather than set: putting
    // it down mid-flight takes the rates away again.
    const powerampSlot = this.content.powerampSlot;
    if (powerampSlot !== undefined) {
      const fitted = this.carriedStack.includes(powerampSlot);
      if (fitted !== this.game.poweramp) {
        this.game = { ...this.game, poweramp: fitted };
      }
    }
    if (this.content.flight !== undefined && seconds > 0) {
      let steered = this.intent;
      if (this.game.worldFlipped) {
        steered = { ...steered, turn: -steered.turn };
      }
      this.game = step(
        this.game,
        steered,
        seconds,
        this.content.flight,
        this.containment
      );
      if (wallThud(this.game) && this.content.doorwayRules !== undefined) {
        events.push({
          wall: { sound: this.content.doorwayRules.wallThudSound }
        });
      }
      events.push(...this.traverse());
      if (this.game.touchdown !== undefined) {
        events.push('tone', { touchdown: this.game.touchdown });
        if (this.game.touchdown === 'crashed') {
          this.game = leaveCraftCore(this.game, this.content.flight);
        }
      }
    }
    if (this.scripts !== undefined && seconds > 0) {
      const before = this.scripts.captureSaveSnapshot();
      try {
        this.scripts.host = this.project(this.scripts.host);
        const effects = this.scripts.advance(seconds);
        this.reconcile(this.scripts.host);
        for (const effect of effects) {
          events.push({ script: effect });
        }
      } catch (error) {
        this.scripts = BensonSession.restore(
          this.scripts.program,
          this.scripts.text,
          this.scripts.tunables,
          before
        );
        this.republishHostState();
        throw error;
      }
    }
    this.advanceShipDelivery(seconds);
    events.push(...this.advanceCombat(seconds));
    return { events, snapshot: this.snapshot };
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
        this.impact = { cell, framesLeft: sites.impactFrames };
        events.push({ impact: { sound: sites.impactSound } });
        if (struck.kind === 'destroyed' && struck.reaction !== undefined) {
          this.start(struck.reaction);
        } else if (struck.kind === 'gratitude') {
          this.start(struck.reaction);
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
      if (hits.clearsAttackState && this.scripts !== undefined) {
        this.scripts.host = this.scripts.host.with({ attackingShip: false });
      }
      this.residence.set(slot, { kind: 'gone' });
      this.removeShot();
      // The first target announces itself; the second starts a script.
      if (index === 0) {
        this.show(hits.firstTargetMessage);
      } else {
        this.start(hits.secondTargetScript);
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

  /// Carries the attacker and its shot along the velocities they were given.
  ///
  /// They travel on the same table the Player Projectile does, so they move the
  /// same way: a velocity added to a place, once a frame, until a lifecycle runs
  /// out. Only the attacker keeps going when its own count reaches zero, because
  /// what runs out for it is the approach rather than the craft.
  private driftHostileEffects(): boolean {
    const rules = this.content.hostile;
    if (rules === undefined) {
      return false;
    }
    let moved = false;
    const drift = (slot: number, velocity: Vector3): void => {
      const at = this.surfacePlaceOf(slot);
      if (at === undefined) {
        return;
      }
      this.residence.set(slot, {
        at: {
          x: at.x + velocity.x,
          y: at.y + velocity.y,
          z: at.z + velocity.z
        },
        kind: 'surface'
      });
      moved = true;
    };
    if (this.attackerVelocity !== undefined) {
      drift(rules.attackingSlot, this.attackerVelocity);
    }
    const shot = this.hostileShot;
    if (shot !== undefined) {
      const framesLeft = shot.framesLeft - 1;
      if (framesLeft <= 0) {
        this.hostileShot = undefined;
        this.residence.set(rules.inboundSlot, { kind: 'gone' });
        moved = true;
      } else {
        this.hostileShot = { ...shot, framesLeft };
        drift(rules.inboundSlot, shot.velocity);
      }
    }
    return moved;
  }

  /// One frame of the hostile encounter.
  ///
  /// The Reference Build runs this only while the scripts have set the Attack
  /// State and only on the surface. An attacker closes in bursts: it turns
  /// toward the player, then flies blind for the length of its delay before
  /// looking again. Once the player is inside its firing range it shoots, and
  /// once its shot reaches the player the encounter is over — for the player's
  /// craft, not for the player.
  private advanceHostile(): readonly PresentationEvent[] {
    const rules = this.content.hostile;
    const events: PresentationEvent[] = [];
    const host = this.scripts?.host;
    if (rules === undefined || host === undefined || !host.attackingShip) {
      return events;
    }
    if (this.approachFrames > 0) {
      this.approachFrames -= 1;
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
      this.attackerVelocity = this.aimAtThePlayer(
        attacker,
        rules.approachAimShift
      );
      // The delay runs until the effect advance parks the attacker, which is
      // the distance from the lifecycle it was given down to the sentinel.
      this.approachFrames =
        rules.approachDelayLifecycle - rules.parkedLifecycle;
      return events;
    }
    if (this.hostileShot === undefined) {
      // In range and nothing in the air: shoot, from where the attacker is.
      this.hostileShot = {
        framesLeft: rules.inboundLifecycleFrames,
        velocity: this.aimAtThePlayer(attacker, rules.inboundAimShift)
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
    if (this.occupancy.kind === 'aboard') {
      this.show(rules.shipDestroyedMessage);
      this.game = { ...this.game, mover: rules.captureMover };
    }
    events.push({ impact: { sound: rules.hitSound } });
    if (rules.captureClearsAttackingShip && this.scripts !== undefined) {
      this.scripts.host = this.scripts.host.with({ attackingShip: false });
    }
    for (const slot of rules.captureRemovesSlots) {
      this.residence.set(slot, { kind: 'gone' });
    }
    this.hostileShot = undefined;
    this.attackerVelocity = undefined;
    this.approachFrames = 0;
    return events;
  }

  /// One frame of the Player Projectile: it moves, then answers for where it is.
  private stepPlayerShot(
    rules: EndgameFire,
    events: PresentationEvent[]
  ): boolean {
    const shot = this.playerShot;
    if (shot === undefined) {
      return false;
    }
    const framesLeft = shot.framesLeft - 1;
    if (framesLeft <= 0) {
      this.playerShot = undefined;
      this.residence.set(rules.effectSlot, { kind: 'gone' });
      return true;
    }
    const at = this.surfacePlaceOf(rules.effectSlot);
    if (at === undefined) {
      // Nothing is carrying the shot's position any more, so there is no shot;
      // this is the same removal its lifecycle would have reached.
      this.playerShot = undefined;
      return true;
    }
    const next = {
      x: at.x + shot.velocity.x,
      y: at.y + shot.velocity.y,
      z: at.z + shot.velocity.z
    };
    this.playerShot = { ...shot, framesLeft };
    this.residence.set(rules.effectSlot, { at: next, kind: 'surface' });
    events.push(...this.resolveShot(next));
    return true;
  }

  /// Advances what combat has in the air, a frame at a time.
  ///
  /// The order is the Reference Build's main loop: the structure impact first,
  /// then the effect slots. Firing itself is a Semantic Action rather than a
  /// step of this, which is the same relative order the original has, because it
  /// polls the fire input once per frame before advancing anything.
  ///
  /// Nothing here runs underground. The original reaches its combat calls only
  /// on the outdoor path, so a Room is not a place where a shot quietly keeps
  /// travelling.
  private advanceCombat(seconds: number): readonly PresentationEvent[] {
    const rules = this.content.fire;
    const rate = this.content.flight?.limits.referenceFrameRate;
    const events: PresentationEvent[] = [];
    if (
      rules === undefined ||
      rate === undefined ||
      seconds <= 0 ||
      this.location.kind !== 'surface'
    ) {
      return events;
    }
    this.combatFrames += seconds * rate;
    const frames = Math.floor(this.combatFrames);
    this.combatFrames -= frames;
    let moved = false;
    for (let frame = 0; frame < frames; frame += 1) {
      // The Reference Build's own order: the structure impact, then the effect
      // slots, then the hostile craft.
      if (this.impact !== undefined) {
        const framesLeft = this.impact.framesLeft - 1;
        this.impact =
          framesLeft > 0 ? { ...this.impact, framesLeft } : undefined;
      }
      if (this.stepPlayerShot(rules, events)) {
        moved = true;
      }
      if (this.driftHostileEffects()) {
        moved = true;
      }
      events.push(...this.advanceHostile());
    }
    if (moved) {
      this.republishHostState();
    }
    return events;
  }

  /// Flies a hired Interstellar Ship down to the surface, a frame at a time.
  ///
  /// The Reference Build calls this from the main loop before the branch that
  /// would skip it underground, so the ship keeps coming while the player is in
  /// a Room, mid-message, or anywhere else. Nothing here asks a script's
  /// permission and nothing here is a script's business: the scripts decide
  /// that a ship was hired, and this is what that decision does next.
  ///
  /// The altitude is not stored twice. It is read back out of the ship's own
  /// Object Residence, which the decoded write always leaves a whole multiple of
  /// `0x100`, so the only thing this has to carry between frames is the part of
  /// a frame that has not elapsed yet.
  private advanceShipDelivery(seconds: number): void {
    const rules = this.content.shipDelivery;
    if (rules === undefined || this.scripts === undefined || seconds <= 0) {
      return;
    }
    // The descent is a per-frame Reference Build quantity, like the control
    // loop's rates and the Room Transition's cooldown, so it advances on the
    // same reference frame rate they do rather than on a second clock of its
    // own (ADR 0016). It is deliberately not the scripts' tick clock: the
    // native routine counts main-loop iterations, not the 50 Hz interrupt.
    const rate = this.content.flight?.limits.referenceFrameRate;
    if (rate === undefined) {
      return;
    }
    this.deliveryFrames += seconds * rate;
    const frames = Math.floor(this.deliveryFrames);
    this.deliveryFrames -= frames;
    let moved = false;
    for (let frame = 0; frame < frames; frame++) {
      const state = this.scripts.host.shipInbound;
      if (state === rules.inactiveValue) {
        break;
      }
      moved = true;
      if ((state & rules.acceptedMask) !== 0) {
        this.beginShipDelivery(rules);
        continue;
      }
      this.stepShipDelivery(rules);
    }
    if (moved) {
      this.republishHostState();
    }
  }

  private beginShipDelivery(rules: EndgameShipDelivery): void {
    const { initialisation: start } = rules;
    this.residence.set(rules.slot, {
      at: { x: start.x, y: start.y, z: start.z },
      kind: 'surface'
    });
    this.scripts!.host = this.scripts!.host.with({
      shipInbound: rules.descendingValue
    });
  }

  private stepShipDelivery(rules: EndgameShipDelivery): void {
    const where = this.residence.get(rules.slot);
    const at = where !== undefined ? displacement(where) : undefined;
    if (at === undefined) {
      return;
    }
    const altitude = at.y >>> 8;
    const next = Math.max(
      0,
      altitude -
        (altitude >>> rules.descent.shift) -
        rules.descent.extraSubtraction
    );
    this.residence.set(rules.slot, {
      at: { x: at.x, y: next << 8, z: at.z },
      kind: 'surface'
    });
    if (next === 0) {
      this.scripts!.host = this.scripts!.host.with({
        shipInbound: rules.inactiveValue
      });
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
      lifecycles.set(slot, shot.framesLeft);
    }
    const inbound = this.hostileShot;
    const inboundSlot = this.content.hostile?.inboundSlot;
    if (inbound !== undefined && inboundSlot !== undefined) {
      lifecycles.set(inboundSlot, inbound.framesLeft);
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
      carriedStack: this.carriedStack,
      ...(combat === undefined ? {} : { combat }),
      location: this.location,
      objectFlags: this.objectFlags,
      occupancy: this.occupancy,
      orbitalFlag: this.game.orbitalFlag,
      position: this.game.player.position,
      residence: this.residence,
      scripts: this.scripts
    });
  }

  get snapshot(): SessionSnapshot {
    return {
      carriedStack: [...this.carriedStack],
      core: {
        poweramp: this.game.poweramp,
        stepInterlock: this.game.stepInterlock,
        touchdown: this.game.touchdown,
        transitionCooldown: this.game.transitionCooldown,
        wallContact: this.game.wallContact,
        wallContactLatch: this.game.wallContactLatch
      },
      credits: this.scripts?.credits ?? 0,
      elapsed: this.game.elapsed,
      indoor: this.indoor,
      isScriptRunning: this.scripts?.isRunning ?? false,
      location: this.location,
      message: this.scripts?.messageText ?? '',
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
    if (this.scripts !== undefined) {
      return this.scripts.nextRandomByte() % count;
    }
    const stepped = nextRandom(new BensonState(this.ownRandomState));
    this.ownRandomState = stepped.state.randomState;
    return stepped.byte % count;
  }
}
