import { join } from 'node:path';

import {
  BensonProgram,
  BensonSession,
  DEFAULT_SESSION_SEED
} from '../src/benson/index.ts';
import { intent } from '../src/gameCore/index.ts';
import { DoorwayPredicate } from '../src/navigation/index.ts';
import type { Bundle, Doorway } from '../src/payload/documents.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import type { SemanticObservations } from '../src/session/observations.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings
} from '../src/settings/index.ts';
import { TextTable } from '../src/text/index.ts';
import type { TraceValue } from '../src/trace/index.ts';
import {
  applySessionTraceCommand,
  decodeSessionScenarioLegs,
  type SessionScenarioLeg
} from '../src/trace/session.ts';
import { World } from '../src/world/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

/// Drives a Gameplay Session the way a player would and reports what it observed.
///
/// The point of it is what it cannot do. There is no way in here to place the
/// player somewhere, hand them an object, or set a balance: a checkpoint is only
/// reachable if the route to it exists, so a test that reaches one has shown the
/// route as well as the outcome. Tests that only need to pin a rule build a
/// session directly instead — that is cheaper and says something different.
export interface LegalCheckpoint {
  readonly at: string;
  readonly observations: SemanticObservations;
}

export interface LegalRun {
  readonly checkpoints: readonly LegalCheckpoint[];
  readonly session: GameplaySession;
}

/// One simulation step. Small enough that a reach leg gets several chances to
/// find its object as the player walks into range.
const STEP = 1 / 50;

/// The Rewired Rooms that choose an exit at random rather than by arrival.
const RANDOM_ROOMS: ReadonlySet<number> = new Set([114]);

export class LegalRoute {
  static async open(options?: {
    readonly script?: number;
    readonly timeScale?: number;
  }): Promise<LegalRoute> {
    const bundle: Bundle = await loadPayload();
    const settings = loadSettings(
      await Bun.file(join(repositoryRoot, 'settings.json')).text()
    );
    const world = new World(bundle);
    if (
      bundle.benson === undefined ||
      bundle.text === undefined ||
      bundle.flight === undefined
    ) {
      throw new Error('the Data Payload is incomplete');
    }
    const program = BensonProgram.fromDocument(bundle.benson);
    const tunables = bensonTunables(settings, program.framesPerTick);
    const scripts = new BensonSession(
      program,
      new TextTable(bundle.text),
      options?.timeScale === undefined
        ? tunables
        : { ...tunables, timeScale: options.timeScale },
      DEFAULT_SESSION_SEED
    );
    const session = new GameplaySession(
      sessionContent(
        world,
        bundle,
        flightModel(settings.flight, bundle.flight, world.groundExtent)
      ),
      openingPlayer(),
      scripts,
      DEFAULT_SESSION_SEED
    );
    if (options?.script !== undefined && !session.start(options.script)) {
      throw new Error(`script ${options.script} would not start`);
    }
    return new LegalRoute(session);
  }

  private readonly checkpoints: LegalCheckpoint[] = [];

  private constructor(readonly session: GameplaySession) {}

  observe(at: string): this {
    this.checkpoints.push({ at, observations: this.session.observations() });
    return this;
  }

  /// Runs one leg. A `reach` leg keeps trying as the player closes on the
  /// object, and fails loudly rather than silently proving nothing.
  run(leg: SessionScenarioLeg, seconds = 4): this {
    switch (leg.kind) {
      case 'walk': {
        this.session.intent = intent({
          running: leg.running,
          turn: leg.turn,
          walk: 1
        });
        this.advance(leg.seconds);
        this.session.intent = intent({});
        break;
      }
      case 'wait':
        this.advance(leg.seconds);
        break;
      case 'reach':
        return this.approach(leg.action, leg.slot, seconds);
      case 'command':
        applySessionTraceCommand(this.session, this.encode(leg.command));
        break;
    }
    return this;
  }

  /// Turns toward the object and walks until it is close enough to act on.
  ///
  /// Only ever writes Movement Intent, so the player still has to be able to
  /// get there: this steers, it does not carry. It beelines, which is enough on
  /// open ground and not enough through a Room's walls — indoors, put explicit
  /// walk legs in front of it.
  private approach(
    action: 'board' | 'take',
    slot: number,
    seconds: number
  ): this {
    const deadline = Math.max(1, Math.round(seconds / STEP));
    const before = this.session.intent;
    for (let step = 0; step < deadline; step++) {
      const { outcome } = this.session.reach(action, slot);
      if (outcome.kind !== 'nothingInReach') {
        this.session.intent = before;
        return this;
      }
      this.session.intent = intent({
        turn: this.turnToward(this.positionOf(slot)),
        walk: 1
      });
      this.session.advance(STEP);
    }
    this.session.intent = before;
    throw new Error(`slot ${slot} never came within ${action} range`);
  }

  /// Walks through the Doorway that leads to `destination`, and fails if it
  /// does not open.
  ///
  /// Only Movement Intent again: the player has to steer into the opening and
  /// earn the Wall Contact the Doorway wants, so arriving proves the Doorway
  /// works rather than asserting that it does.
  walkThroughTo(destination: number, seconds = 60): this {
    const here = this.session.location;
    if (here.kind !== 'room') {
      throw new Error('Doorways are taken from inside a Room');
    }
    const inside = this.session.content.rooms.get(here.id);
    // The live Doorways rather than the recorded ones: a Rewired Room's first
    // Doorway leads somewhere chosen on arrival, and the recorded destination
    // is not where it goes.
    const doorway = (
      inside === undefined ? [] : this.session.doorwaysOf(inside)
    ).find(
      exit =>
        'room' in exit.destination && exit.destination.room === destination
    );
    if (doorway === undefined) {
      throw new Error(`Room ${here.id} has no Doorway to Room ${destination}`);
    }
    const aim = this.windowOf(doorway, here.id);
    const before = this.session.intent;
    for (let step = 0; step < Math.round(seconds / STEP); step++) {
      if (
        this.session.location.kind === 'room' &&
        this.session.location.id === destination
      ) {
        this.session.intent = before;
        return this;
      }
      this.session.intent = intent({
        turn: this.turnToward(aim),
        walk: 1
      });
      this.session.advance(STEP);
    }
    this.session.intent = before;
    throw new Error(`the Doorway to Room ${destination} never opened`);
  }

  /// A point that presses into the Doorway's own window, found by asking the
  /// predicate.
  ///
  /// A Doorway's window is offset along its wall from the position the payload
  /// records for it, by byte arithmetic this helper deliberately does not
  /// duplicate: walking at the recorded position stands beside the opening
  /// rather than in it, which reads as a Doorway that will not open. So the
  /// candidates are probed against the real predicate instead.
  ///
  /// The point returned is *on* the wall rather than at the line the walls hold
  /// the player at, because Wall Contact is the precondition for taking a
  /// Doorway: a player steered at the holding line walks parallel to the wall,
  /// never touches it, and is never offered the opening.
  private windowOf(
    doorway: Doorway,
    id: number
  ): { readonly x: number; readonly z: number } {
    const rules = this.session.content.doorwayRules;
    const here = this.session.content.rooms.get(id);
    if (rules === undefined || here === undefined) {
      return doorway.position;
    }
    const predicate = new DoorwayPredicate(rules);
    const alongIsZ = doorway.plane === 'zy';
    const along = alongIsZ ? doorway.position.z : doorway.position.x;
    const extent = alongIsZ ? here.bounds.max.x : here.bounds.max.z;
    for (const wall of [0, extent]) {
      // Where the walls actually hold the player, which is where the predicate
      // will be asked the question.
      const held = wall === 0 ? rules.nearMargin : extent - 33;
      const heading = alongIsZ
        ? wall === 0
          ? Math.PI * 1.5
          : Math.PI / 2
        : wall === 0
          ? Math.PI
          : 0;
      for (let offset = 0; offset < 0x1_00; offset += 4) {
        const value = (along & ~0xff) + offset;
        const probe = alongIsZ ? { x: held, z: value } : { x: value, z: held };
        if (predicate.accepts(doorway, { ...probe, y: 128 }, heading)) {
          return alongIsZ ? { x: wall, z: value } : { x: value, z: wall };
        }
      }
    }
    return doorway.position;
  }

  /// Walks to a Room, re-planning from what the Rooms actually offer now.
  ///
  /// The static payload graph is only a guide underground: a Rewired Room
  /// chooses its exit on arrival, so the route is recomputed at every hop from
  /// the Doorways the session is presently willing to show, and a hop that
  /// will not open is struck off and routed around. Which is how a player
  /// crosses the maze, rather than how a map does.
  walkTo(target: number, hops = 120): this {
    const refused = new Map<string, number>();
    const keep = this.canReach(target);
    for (let hop = 0; hop < hops; hop++) {
      const here = this.session.location;
      if (here.kind !== 'room') {
        throw new Error('walkTo travels between Rooms');
      }
      if (here.id === target) {
        return this;
      }
      const next =
        this.nextHop(here.id, target, refused, keep) ??
        // The Room whose exit is drawn at random can hand the player out
        // somewhere the target cannot be reached from at all. A player would
        // walk back out of it, so this does too, rather than giving up where
        // the map ran out.
        this.exitsOf(here.id, true).find(
          room => (refused.get(`${here.id}->${room}`) ?? 0) < 2
        );
      if (next === undefined) {
        throw new Error(`no route from Room ${here.id} to Room ${target}`);
      }
      try {
        this.walkThroughTo(next, 90);
        this.settle();
      } catch {
        // A Doorway that would not open on one approach is worth a second try
        // before it is written off: the walk beelines, and a beeline can be
        // held up by the corner of a wall it started behind.
        const edge = `${here.id}->${next}`;
        refused.set(edge, (refused.get(edge) ?? 0) + 1);
      }
    }
    throw new Error(`Room ${target} was still not reached after ${hops} hops`);
  }

  /// The Rooms a Room can lead to, as planning must model them.
  ///
  /// A Rewired Room replaces its *first* Doorway on arrival, so the recorded
  /// destination of that Doorway is not an exit at all while its alternates
  /// are. The Room the player is standing in needs none of this: the session
  /// will say what it is presently offering.
  private exitsOf(id: number, live: boolean): number[] {
    const here = this.session.content.rooms.get(id);
    if (here === undefined) {
      return [];
    }
    const asRoom = (destination: Doorway['destination']): number | undefined =>
      'room' in destination ? destination.room : undefined;
    if (live) {
      return this.session
        .doorwaysOf(here)
        .map(doorway => asRoom(doorway.destination))
        .filter((room): room is number => room !== undefined);
    }
    const rewired = here.specialSetup !== undefined;
    const fixed = here.doorways
      .slice(rewired ? 1 : 0)
      .map(doorway => asRoom(doorway.destination));
    const alternates = (here.specialSetup?.alternates ?? []).map(alternate =>
      asRoom(alternate.destination)
    );
    return [...fixed, ...alternates].filter(
      (room): room is number => room !== undefined
    );
  }

  /// Every Room the target can still be reached from, over the recorded graph.
  ///
  /// Room Links are directed, so a wrong turn can land somewhere the target is
  /// no longer reachable from at all. Routing refuses to step outside this set
  /// rather than discovering that by being stuck in it.
  private canReach(target: number): ReadonlySet<number> {
    const inbound = new Map<number, number[]>();
    for (const id of this.session.content.rooms.keys()) {
      for (const to of this.exitsOf(id, false)) {
        inbound.set(to, [...(inbound.get(to) ?? []), id]);
      }
    }
    const seen = new Set([target]);
    const queue = [target];
    while (queue.length > 0) {
      for (const from of inbound.get(queue.shift()!) ?? []) {
        if (!seen.has(from)) {
          seen.add(from);
          queue.push(from);
        }
      }
    }
    return seen;
  }

  /// The first hop of a shortest route, over the live Doorways of the Room the
  /// player is in and the recorded ones everywhere else.
  private nextHop(
    from: number,
    target: number,
    refused: ReadonlyMap<string, number>,
    keep: ReadonlySet<number>
  ): number | undefined {
    const exits = (id: number, avoid: ReadonlySet<number>): number[] =>
      this.exitsOf(id, id === from).filter(
        room =>
          keep.has(room) &&
          !avoid.has(room) &&
          (refused.get(`${id}->${room}`) ?? 0) < 2
      );
    // The one Room whose exit is drawn at random is planned around while any
    // other route exists, because a plan through it is a guess.
    for (const avoid of [RANDOM_ROOMS, new Set<number>()]) {
      const parent = new Map<number, number>();
      const seen = new Set([from]);
      const queue = [from];
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (id === target) {
          break;
        }
        for (const next of exits(id, avoid)) {
          if (!seen.has(next)) {
            seen.add(next);
            parent.set(next, id);
            queue.push(next);
          }
        }
      }
      if (!seen.has(target)) {
        continue;
      }
      let step = target;
      while (parent.get(step) !== from) {
        const previous = parent.get(step);
        if (previous === undefined) {
          return undefined;
        }
        step = previous;
      }
      return step;
    }
    return undefined;
  }

  /// Walks to a point on the surface, steering rather than being placed.
  walkToPoint(
    at: { readonly x: number; readonly z: number },
    within = 64,
    seconds = 900
  ): this {
    const before = this.session.intent;
    for (let step = 0; step < Math.round(seconds / STEP); step++) {
      const position = this.session.snapshot.player.position;
      const dx = at.x - position.x;
      const dz = at.z - position.z;
      if (Math.hypot(dx, dz) <= within) {
        this.session.intent = before;
        return this;
      }
      this.session.intent = intent({ turn: this.turnToward(at), walk: 1 });
      this.session.advance(STEP);
    }
    this.session.intent = before;
    throw new Error(`never walked within ${within} of ${at.x}:${at.z}`);
  }

  private positionOf(slot: number): { x: number; z: number } {
    const target = this.session.content.objects.find(
      object => object.slot === slot
    );
    if (target === undefined) {
      throw new Error(`the payload has no slot ${slot}`);
    }
    const moved = this.session.snapshot.residence.get(slot);
    return moved !== undefined && 'at' in moved && moved.at !== undefined
      ? moved.at
      : target.origin;
  }

  /// Heading is measured from +z toward +x, so a bearing is `atan2(dx, dz)`.
  private turnToward(at: { readonly x: number; readonly z: number }): number {
    const player = this.session.snapshot.player;
    const bearing = Math.atan2(
      at.x - player.position.x,
      at.z - player.position.z
    );
    let error = bearing - player.heading;
    while (error > Math.PI) {
      error -= 2 * Math.PI;
    }
    while (error < -Math.PI) {
      error += 2 * Math.PI;
    }
    // Full deflection until nearly lined up, then ease off so it settles.
    return Math.max(-1, Math.min(1, error * 4));
  }

  follow(legs: TraceValue): this {
    for (const leg of decodeSessionScenarioLegs(legs)) {
      this.run(leg);
    }
    return this;
  }

  advance(seconds: number): this {
    for (let left = seconds; left > 1e-9; left -= STEP) {
      this.session.advance(Math.min(STEP, left));
    }
    return this;
  }

  /// Advances until no script is running.
  ///
  /// A Room's entry script will not start while another is still going, so
  /// anything that walks out of one Room and into the next has to let the first
  /// one finish -- exactly as a player would by standing there reading.
  settle(maxSeconds = 240): this {
    for (let left = maxSeconds; left > 0; left -= 0.5) {
      if (this.session.observations().observations['scriptPc'] === -1) {
        return this;
      }
      this.advance(0.5);
    }
    throw new Error('a script was still running after waiting it out');
  }

  get results(): LegalRun {
    return { checkpoints: [...this.checkpoints], session: this.session };
  }

  observationAt(
    at: string
  ): Readonly<Record<string, boolean | number | string>> {
    const found = this.checkpoints.find(checkpoint => checkpoint.at === at);
    if (found === undefined) {
      throw new Error(`no checkpoint named '${at}'`);
    }
    return found.observations.observations;
  }

  private encode(command: SessionTraceCommandLike): TraceValue {
    switch (command.kind) {
      case 'press':
        return { press: command.key };
      case 'throttleNotch':
        return { throttleNotch: command.notch };
      default:
        return { [command.kind]: true };
    }
  }
}

type SessionTraceCommandLike =
  | { readonly key: string | null; readonly kind: 'press' }
  | { readonly kind: 'throttleNotch'; readonly notch: number }
  | {
      readonly kind:
        'drop' | 'fire' | 'leaveCraft' | 'rideLift' | 'shutThrottle';
    };
