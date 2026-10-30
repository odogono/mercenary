import { join } from 'node:path';

import { intent } from '../src/gameCore/index.ts';
import type { Bundle } from '../src/payload/documents.ts';
import { GameplaySession, sessionContent } from '../src/session/index.ts';
import type { SemanticObservations } from '../src/session/observations.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
import { TextTable } from '../src/text/index.ts';
import { World } from '../src/world/index.ts';
import {
  BensonProgram,
  BensonSession,
  bensonTunables
} from './oracle/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

/// A craft flown over the city, bombing the Sites it is told to.
///
/// Everything here steers: it holds Movement Intent and a throttle notch and
/// lets the Mover do the rest, exactly as `LegalRoute` does on foot. It cannot
/// place the craft, cannot place a Site, and cannot set a counter — reaching a
/// Gratitude Threshold through it means the route to one exists.
///
/// It flies on the ground deliberately. A Site can only be struck from below a
/// decoded altitude, and a craft that never raises its nose never leaves the
/// ground, so taxiing at full throttle is both the fastest way across the city
/// and the only one that stays low enough to bomb it.
const CELL = 0x1_00_00;
const FRAME = 1 / 20;
const TURN = Math.PI * 2;

const shortest = (angle: number): number => {
  const wrapped = ((angle % TURN) + TURN) % TURN;
  return wrapped > Math.PI ? wrapped - TURN : wrapped;
};

export class CityRun {
  static async open(): Promise<CityRun> {
    const bundle = await loadPayload();
    const world = new World(bundle);
    const settings = loadSettings(
      await Bun.file(join(repositoryRoot, 'settings.json')).text()
    );
    if (
      bundle.flight === undefined ||
      bundle.benson === undefined ||
      bundle.text === undefined
    ) {
      throw new Error('the Data Payload is incomplete');
    }
    const program = BensonProgram.fromDocument(bundle.benson);
    const session = new GameplaySession(
      sessionContent(
        world,
        bundle,
        flightModel(settings.flight, bundle.flight, world.groundExtent)
      ),
      {
        heading: 0,
        pitch: 0,
        position: { x: 8 * CELL + 0x80_00, y: 0, z: 8 * CELL + 0x80_00 },
        roll: 0,
        speed: 0,
        yawVelocity: 0
      },
      new BensonSession(
        program,
        new TextTable(bundle.text),
        bensonTunables(settings, program.framesPerTick)
      )
    );
    session.board(1);
    return new CityRun(bundle, session);
  }

  readonly session: GameplaySession;
  private readonly bundle: Bundle;
  /// Frames flown, so a test can say how long a route took.
  frames = 0;

  private constructor(bundle: Bundle, session: GameplaySession) {
    this.bundle = bundle;
    this.session = session;
  }

  private get sites() {
    return this.bundle.endgame.combat.siteDestruction;
  }

  observations(): Readonly<Record<string, boolean | number | string>> {
    return this.session.observations().observations;
  }

  observed(): SemanticObservations {
    return this.session.observations();
  }

  /// Every Site one faction holds, in the order a flight would take them.
  sitesOf(faction: 'mechanoid' | 'palyar'): number[] {
    const rules = this.sites;
    const held: number[] = [];
    for (const [cell, byte] of rules.initialTable.entries()) {
      if ((byte & rules.neutralMask) !== 0) {
        continue;
      }
      const mechanoid = (byte & rules.mechanoidMask) !== 0;
      if (mechanoid === (faction === 'mechanoid')) {
        held.push(cell);
      }
    }
    return this.nearestFirst(held);
  }

  /// Bombs one Site. `true` when a counter moved for it.
  bomb(cell: number): boolean {
    const rules = this.sites;
    const centre = this.centreOf(cell);
    // Stage short of the Site so the run through its band is a straight line.
    if (!this.goTo({ x: centre.x, z: centre.z - 24_000 }, 3000)) {
      return false;
    }
    if (!this.settleOnHeading(Math.PI)) {
      return false;
    }
    const before = this.counters();
    for (let frame = 0; frame < 400; frame += 1) {
      if (this.session.occupancy.kind === 'onFoot') {
        return false;
      }
      if (this.cellOf(this.landing()) === cell && this.inBand(this.landing())) {
        if (this.session.fire().outcome.kind === 'fired') {
          this.advance(1);
          this.advance(rules.impactFrames);
          const after = this.counters();
          return (
            after.mechanoid !== before.mechanoid ||
            after.palyar !== before.palyar
          );
        }
      }
      this.hold(
        -shortest(Math.PI - this.session.snapshot.player.heading) * 4,
        3
      );
    }
    return false;
  }

  counters(): { mechanoid: number; palyar: number } {
    const observed = this.observations();
    return {
      mechanoid: observed['mechanoidDestroyed'] as number,
      palyar: observed['palyarDestroyed'] as number
    };
  }

  /// The lead one faction has, the way the engine measures it.
  lead(): number {
    const { mechanoid, palyar } = this.counters();
    return mechanoid - palyar;
  }

  /// Whether that lead is one the engine would dispatch a thank-you for.
  ///
  /// Measured the engine's way, in one byte and complementing a negative
  /// difference, because that is what makes the two sides land a Site apart.
  thresholdReached(): boolean {
    const { mechanoid, palyar } = this.counters();
    const difference = (mechanoid - palyar) & 0xff;
    const trailing = (difference & 0x80) !== 0;
    const magnitude = trailing ? difference ^ 0xff : difference;
    return magnitude >= this.sites.factionObjective.threshold;
  }

  /// Lets a dispatched script run itself out, skipping the message it prints.
  settle(): void {
    for (let tick = 0; tick < 600; tick += 1) {
      this.session.advance(FRAME * 10);
      this.session.skipMessage();
    }
  }

  advance(frames: number): void {
    this.frames += frames;
    this.session.advance(FRAME * frames);
  }

  private hold(turn: number, notch: number): void {
    this.frames += 1;
    this.session.intent = intent({
      pitch: 0,
      turn: Math.max(-1, Math.min(1, turn))
    });
    this.session.throttleNotchValue(notch);
    this.session.advance(FRAME);
  }

  private goTo(to: { x: number; z: number }, tolerance: number): boolean {
    for (let frame = 0; frame < 2000; frame += 1) {
      if (this.session.occupancy.kind === 'onFoot') {
        return false;
      }
      const at = this.session.snapshot.player.position;
      const away = Math.hypot(to.x - at.x, to.z - at.z);
      if (away < tolerance) {
        return true;
      }
      const wanted = Math.atan2(at.x - to.x, at.z - to.z);
      this.hold(
        -shortest(wanted - this.session.snapshot.player.heading) * 4,
        away > 2 * CELL ? 10 : away > 30_000 ? 7 : 4
      );
    }
    return false;
  }

  private settleOnHeading(heading: number): boolean {
    for (let frame = 0; frame < 200; frame += 1) {
      if (this.session.occupancy.kind === 'onFoot') {
        return false;
      }
      const error = shortest(heading - this.session.snapshot.player.heading);
      if (Math.abs(error) < 0.01) {
        return true;
      }
      this.hold(-error * 4, 1);
    }
    return false;
  }

  /// Where this shot would be a frame from now, which is what decides whether
  /// firing is worth it.
  private landing(): { x: number; y: number; z: number } {
    const player = this.session.snapshot.player;
    const speed = this.bundle.endgame.combat.fire.speedPerFrame;
    const flat = Math.cos(player.pitch);
    return {
      x: player.position.x - flat * Math.sin(player.heading) * speed,
      y: player.position.y + Math.sin(player.pitch) * speed,
      z: player.position.z - flat * Math.cos(player.heading) * speed
    };
  }

  private centreOf(cell: number): { x: number; z: number } {
    return {
      x: (cell & 0x0f) * CELL + 0x80_00,
      z: (cell >> 4) * CELL + 0x80_00
    };
  }

  private cellOf(at: { x: number; z: number }): number {
    return (
      ((Math.floor(at.z / CELL) & 0x0f) << 4) | (Math.floor(at.x / CELL) & 0x0f)
    );
  }

  private inBand(at: { x: number; z: number }): boolean {
    const [low, high] = this.sites.axisWindow;
    if (low === undefined || high === undefined) {
      return false;
    }
    const within = (value: number): boolean => {
      const offset = ((value % CELL) + CELL) % CELL;
      return offset >= low * 0x1_00 && offset < high * 0x1_00;
    };
    return within(at.x) && within(at.z);
  }

  private nearestFirst(cells: readonly number[]): number[] {
    const left = new Set(cells);
    const order: number[] = [];
    let at = 0x88;
    while (left.size > 0) {
      let best = -1;
      let bestAway = Infinity;
      for (const cell of left) {
        const one = this.centreOf(cell);
        const other = this.centreOf(at);
        const away = Math.hypot(one.x - other.x, one.z - other.z);
        if (away < bestAway) {
          bestAway = away;
          best = cell;
        }
      }
      order.push(best);
      left.delete(best);
      at = best;
    }
    return order;
  }
}
