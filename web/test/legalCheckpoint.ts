import { join } from 'node:path';

import {
  BensonProgram,
  BensonSession,
  DEFAULT_SESSION_SEED
} from '../src/benson/index.ts';
import { intent } from '../src/gameCore/index.ts';
import type { Bundle } from '../src/payload/documents.ts';
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
    const doorway = this.session.content.rooms
      .get(here.id)
      ?.doorways?.find(
        exit =>
          'room' in exit.destination && exit.destination.room === destination
      );
    if (doorway === undefined) {
      throw new Error(`Room ${here.id} has no Doorway to Room ${destination}`);
    }
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
        turn: this.turnToward(doorway.position),
        walk: 1
      });
      this.session.advance(STEP);
    }
    this.session.intent = before;
    throw new Error(`the Doorway to Room ${destination} never opened`);
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
  | { readonly kind: 'drop' | 'leaveCraft' | 'rideLift' | 'shutThrottle' };
