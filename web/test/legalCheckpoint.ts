import { join } from 'node:path';

import { BensonChannel } from '../src/benson/channel.ts';
import {
  REFERENCE_WALKING_EYE_ALTITUDE,
  intent
} from '../src/gameCore/index.ts';
import { Containment, DoorwayPredicate } from '../src/navigation/index.ts';
import type { Bundle, Doorway } from '../src/payload/documents.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import type { SemanticObservations } from '../src/session/observations.ts';
import {
  bensonPacing,
  flightModel,
  loadSettings
} from '../src/settings/index.ts';
import type { TalkScript } from '../src/talk/host.ts';
import { TALK_SCRIPTS } from '../src/talk/scripts.ts';
import { TextTable } from '../src/text/index.ts';
import type { TraceValue } from '../src/trace/index.ts';
import {
  applySessionTraceCommand,
  decodeSessionScenarioLegs,
  type SessionScenarioLeg
} from '../src/trace/session.ts';
import { World } from '../src/world/index.ts';
import { DEFAULT_SESSION_SEED } from './oracle/index.ts';
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

export class LegalRoute {
  /// A fresh route wired as live play is: the Benson Display and the Talk
  /// Scripts, all of them unless named.
  static async open(options?: {
    /// The Data Payload, when not the recorded one alone.
    readonly bundle?: Bundle;
    /// Whether the new game begins, as live play does, and plays the opening.
    readonly opening?: boolean;
    readonly talk?: readonly TalkScript[];
  }): Promise<LegalRoute> {
    const bundle = options?.bundle ?? (await loadPayload());
    const settings = loadSettings(
      await Bun.file(join(repositoryRoot, 'settings.json')).text()
    );
    const world = new World(bundle);
    if (bundle.text === undefined || bundle.flight === undefined) {
      throw new Error('the Data Payload is incomplete');
    }
    const scripts = new BensonChannel(
      new TextTable(bundle.text),
      bensonPacing(settings)
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
    session.useTalkScripts(options?.talk ?? TALK_SCRIPTS);
    if (options?.opening === true) {
      session.begin();
    }
    return new LegalRoute(session);
  }

  private readonly checkpoints: LegalCheckpoint[] = [];

  /// Continues a route from a restored Save, so the legs that drove the
  /// original drive the continuation too. A Save is only evidence of
  /// deterministic continuation if the restored session is the one that
  /// carries on.
  static resume(session: GameplaySession): LegalRoute {
    return new LegalRoute(session);
  }

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
        if (leg.command.kind === 'rideLift') {
          this.advance(7);
          this.advance(STEP);
        }
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
    return this.steerUntil(
      () => this.positionOf(slot),
      () => this.session.reach(action, slot).outcome.kind !== 'nothingInReach',
      seconds,
      () => `slot ${slot} never came within ${action} range`
    );
  }

  /// Steer at a point until arrival, one Movement Intent at a time, and fail if
  /// the deadline passes first.
  ///
  /// The three walking helpers differ only in where they aim and what counts as
  /// arriving; the loop itself — restore the caller's intent on either exit, and
  /// never place the player — is the same one.
  private steerUntil(
    aim: () => { readonly x: number; readonly z: number },
    arrived: () => boolean,
    seconds: number,
    failure: () => string
  ): this {
    const deadline = Math.max(1, Math.round(seconds / STEP));
    const before = this.session.intent;
    for (let step = 0; step < deadline; step++) {
      if (arrived()) {
        this.session.intent = before;
        return this;
      }
      this.session.intent = intent({ turn: this.turnToward(aim()), walk: 1 });
      this.session.advance(STEP);
    }
    this.session.intent = before;
    throw new Error(failure());
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
    return this.steerUntil(
      () => aim,
      () =>
        this.session.location.kind === 'room' &&
        this.session.location.id === destination,
      seconds,
      () => `the Doorway to Room ${destination} never opened`
    );
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
    // The same walls the session holds the player at, asked of the engine's own
    // Containment rather than restated here: a hand-rolled far line that drifts
    // from it probes a place the player can never stand.
    const walls = new Containment(here, rules);
    for (const wall of [0, extent]) {
      // Where the walls actually hold the player, which is where the predicate
      // will be asked the question.
      const held = wall === 0 ? walls.near : alongIsZ ? walls.farX : walls.farZ;
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
        if (
          predicate.accepts(
            doorway,
            { ...probe, y: REFERENCE_WALKING_EYE_ALTITUDE },
            heading
          )
        ) {
          return alongIsZ ? { x: wall, z: value } : { x: value, z: wall };
        }
      }
    }
    return doorway.position;
  }

  /// Walks to a point on the surface, steering rather than being placed.
  walkToPoint(
    at: { readonly x: number; readonly z: number },
    within = 64,
    seconds = 900
  ): this {
    return this.steerUntil(
      () => at,
      () => {
        const position = this.session.snapshot.player.position;
        return Math.hypot(at.x - position.x, at.z - position.z) <= within;
      },
      seconds,
      () => `never walked within ${within} of ${at.x}:${at.z}`
    );
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

  /// Advances until the complete Benson occurrence names the expected text.
  waitForMessage(fragment: string, maxSeconds = 60): this {
    for (let left = maxSeconds; left > 0; left -= STEP) {
      if (
        this.session.snapshot.bensonMessage?.completedText?.includes(fragment)
      ) {
        return this;
      }
      this.session.advance(STEP);
    }
    throw new Error(
      `Benson never completed a message containing '${fragment}'`
    );
  }

  /// Advances until no script is running and the Talk Scripts are quiet.
  ///
  /// A Room's entry script will not start while another is still going, so
  /// anything that walks out of one Room and into the next has to let the first
  /// one finish -- exactly as a player would by standing there reading.
  settle(maxSeconds = 240): this {
    for (let left = maxSeconds; left > 0; left -= 0.5) {
      if (
        this.session.observations().observations['scriptPc'] === -1 &&
        (this.session.talk?.isQuiet ?? true)
      ) {
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
