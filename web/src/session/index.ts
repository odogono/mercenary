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
import {
  decodeRandomState,
  encodeRandomState,
  type SaveSnapshot
} from './save.ts';

/// The Gameplay Session: the one owner of a play session's Session State (ADR 0018).
///
/// Every discrete change to that state passes through a Semantic Action: `reach`, `leaveCraft`,
/// `rideLift`, `teleport`, `place`, `carry`, `board`, `throttleNotchValue`, `throttleStep`,
/// `fitPoweramp`, `shutThrottle`, `press`, `skipMessage`, `start`, `show`, `describe`. Each moves
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
  | { readonly script: BensonEffect }
  | { readonly touchdown: Touchdown }
  | { readonly arrived: Location }
  | { readonly wall: { readonly sound: number } }
  | { readonly worldFlipped: boolean };

export interface SessionSnapshot {
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
  readonly flight: FlightModel | undefined;
  readonly interaction: Interaction | undefined;
  readonly objects: readonly ObjectPlacement[];
  readonly rooms: ReadonlyMap<number, Room>;
  readonly underground: UndergroundDocument | undefined;
}

export const sessionContent = (
  world: World,
  bundle: Bundle,
  flight: FlightModel | undefined
): SessionContent => ({
  cellSize: world.cellSize,
  doorwayRules: world.doorwayRules,
  flight,
  interaction:
    bundle.interaction === undefined
      ? undefined
      : new Interaction(bundle.interaction),
  objects: world.objects,
  rooms: world.rooms,
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
  for (const [slot, residence] of snapshot.residence) {
    if (!objectSlots.has(slot)) {
      throw new Error(`Save Snapshot refers to missing object slot ${slot}`);
    }
    if (residence.kind === 'room' && !content.rooms.has(residence.id)) {
      throw new Error(`Save Snapshot refers to missing Room ${residence.id}`);
    }
  }
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
  private residence = new Map<number, Residence>();
  scripts: BensonSession | undefined;
  private rewired = new Map<number, Alternate>();
  private ownRandomState: bigint;
  private readonly objectsBySlot: ReadonlyMap<number, ObjectPlacement>;
  private readonly baseFlags: ReadonlyMap<number, number>;

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
    const objectsBySlot = new Map<number, ObjectPlacement>();
    const flags = new Map<number, number>();
    for (const object of content.objects) {
      if (!objectsBySlot.has(object.slot)) {
        objectsBySlot.set(object.slot, object);
      }
      if (!flags.has(object.slot)) {
        flags.set(object.slot, object.stateFlags & 0xff);
      }
    }
    this.objectsBySlot = objectsBySlot;
    this.baseFlags = flags;
    if (this.scripts !== undefined) {
      this.scripts.host = this.project(this.scripts.host);
    }
  }

  captureSaveSnapshot(): SaveSnapshot {
    return {
      benson: this.scripts?.captureSaveSnapshot() ?? null,
      game: {
        ...this.game,
        craft: this.game.craft ?? null,
        room: this.game.room ?? null,
        touchdown: this.game.touchdown ?? null
      },
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
      room: snapshot.game.room ?? undefined,
      touchdown: snapshot.game.touchdown ?? undefined
    };
    session.residence = new Map(snapshot.residence);
    session.rewired = new Map(snapshot.rewired);
    session.ownRandomState = decodeRandomState(snapshot.randomState);
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

  private project(host: BensonHostState): BensonHostState {
    const objectRooms = new Map<number, number>();
    const objectFlags = new Map<number, number>();
    const inventory = new Set<number>();
    for (const object of this.content.objects) {
      const where = this.residenceOf(object.slot);
      objectRooms.set(object.slot, hostRoom(where));
      let slotFlags = this.baseFlags.get(object.slot) ?? 0;
      if (this.content.interaction !== undefined) {
        if (isCarried(where)) {
          slotFlags |= this.content.interaction.carriedMask;
        } else {
          slotFlags &= ~this.content.interaction.carriedMask;
        }
      }
      objectFlags.set(object.slot, slotFlags);
      if (isCarried(where)) {
        inventory.add(object.slot);
      }
    }
    return host.with({
      boardedCraft: occupancyHostValue(this.occupancy),
      currentRoom: locationHostValue(this.location),
      inventory,
      objectFlags,
      objectRooms
    });
  }

  private reconcile(host: BensonHostState): void {
    if (host.currentRoom !== locationHostValue(this.location)) {
      const next = locationFromHost(host.currentRoom);
      this.game = {
        ...this.game,
        room: next.kind === 'surface' ? undefined : next.id
      };
    }
    if (host.boardedCraft !== occupancyHostValue(this.occupancy)) {
      const occupancy = occupancyFromHost(host.boardedCraft);
      this.game = {
        ...this.game,
        craft: occupancy.kind === 'onFoot' ? undefined : occupancy.slot
      };
    }
    for (const object of this.content.objects) {
      const slot = object.slot;
      const written = host.objectRooms.get(slot);
      if (written === undefined) {
        continue;
      }
      const current = this.residenceOf(slot);
      const carried = host.inventory.has(slot);
      if (written === hostRoom(current) && carried === isCarried(current)) {
        continue;
      }
      if (carried) {
        this.residence.set(slot, { kind: 'carried' });
      } else if (written === BensonHostState.outOfTheWorld) {
        this.residence.set(slot, { kind: 'gone' });
      } else if (written === SURFACE_ROOM) {
        const at = displacement(current);
        this.residence.set(
          slot,
          at === undefined ? { kind: 'surface' } : { at, kind: 'surface' }
        );
      } else {
        this.residence.set(slot, { id: written, kind: 'room' });
      }
    }
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
    this.scripts.host = host;
    this.reconcile(host);
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
    this.residence.set(slot, { at: position, kind: 'surface' });
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
    this.residence.set(slot, { kind: 'carried' });
    this.republishHostState();
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

  fitPoweramp(fitted: boolean): void {
    this.game = { ...this.game, poweramp: fitted };
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
      this.scripts.host = this.project(this.scripts.host);
      const effects = this.scripts.advance(seconds);
      this.reconcile(this.scripts.host);
      for (const effect of effects) {
        events.push({ script: effect });
      }
    }
    return { events, snapshot: this.snapshot };
  }

  get snapshot(): SessionSnapshot {
    return {
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
      occupancy: this.occupancy,
      player: this.game.player,
      residence: this.sceneResidence,
      throttle: this.game.throttle,
      throttleNotch: this.throttleNotch,
      worldFlipped: this.game.worldFlipped
    };
  }

  private get sceneResidence(): Map<number, Residence> {
    const out = new Map<number, Residence>();
    for (const object of this.content.objects) {
      out.set(object.slot, this.residenceOf(object.slot));
    }
    return out;
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
