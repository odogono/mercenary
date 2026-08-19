import {
  REFERENCE_OPENING_POSITION,
  board,
  gameState,
  intent,
  leave,
  playerState,
  step,
  throttle,
  wallThud
} from '../../src/gameCore/index.ts';
import { toFloat32 } from '../../src/math/index.ts';
import { Containment } from '../../src/navigation/index.ts';
import type { Bundle } from '../../src/payload/documents.ts';
import { indoorScene, type IndoorScene } from '../../src/scene/index.ts';
import { flightModel, type Settings } from '../../src/settings/index.ts';
import type { TraceObject, TraceValue } from '../../src/trace/index.ts';
import {
  SURFACE,
  World,
  room,
  type Location,
  type Residence
} from '../../src/world/index.ts';

/// Test-side stand-in for the part of GameplaySession that the mover emitters use.
///
/// There is deliberately no production GameplaySession module yet: #68 requires each module
/// to arrive behind its own Replay Gate. This shim reproduces emitter setup and the flight
/// branch of `advance` without moving that later session boundary into `src/`.
export class MoverReplay {
  readonly flight: ReturnType<typeof flightModel>;
  readonly world: World;
  readonly residence: Map<number, Residence>;
  readonly containment: Containment | undefined;
  readonly location: Location;
  readonly indoor: IndoorScene | undefined;
  private state: ReturnType<typeof gameState>;
  private readonly residenceTable: TraceValue;

  /// The world is passed in rather than built here. It is read-only from a driver's point of
  /// view, and building it walks every surface cell of Targ — which both gates would otherwise
  /// pay for twice per trace.
  constructor(
    bundle: Bundle,
    world: World,
    settings: Settings,
    header: TraceObject
  ) {
    const document = bundle.flight;
    if (document === undefined) {
      throw new Error('a mover replay needs flight.json');
    }
    this.world = world;
    this.flight = flightModel(
      settings.flight,
      document,
      this.world.groundExtent
    );
    this.residence = new Map(
      this.world.objects.map(object => [
        object.slot,
        object.room === 0
          ? ({ kind: 'surface' } as const)
          : ({ id: object.room, kind: 'room' } as const)
      ])
    );

    // OpeningScene.swift: every mover emitter starts at the captured crash position, at
    // whatever eye height the settings resolved to.
    this.state = gameState({
      player: playerState({
        heading: 0,
        pitch: 0,
        position: {
          x: REFERENCE_OPENING_POSITION.x,
          y: this.flight.groundAltitude,
          z: REFERENCE_OPENING_POSITION.z
        }
      })
    });

    const scenario = header['scenario'] as TraceObject;
    const roomId = scenario['room'];
    if (typeof roomId === 'number') {
      const here = this.world.rooms.get(roomId);
      if (here === undefined) {
        throw new Error(`no room ${roomId} in this payload`);
      }
      this.location = room(roomId);
      this.containment = new Containment(here, this.world.doorwayRules);

      // CoreTrace teleports first. That clamps OpeningScene's far-away position and records two
      // contacts; `place` then overwrites the position without clamping it again.
      const clamped = this.containment.clamp(this.state.player.position);
      const middleX = toFloat32(
        toFloat32(here.bounds.min.x + here.bounds.max.x) / 2
      );
      const middleZ = toFloat32(
        toFloat32(here.bounds.min.z + here.bounds.max.z) / 2
      );
      const at = scenario['at'] as TraceObject | null;
      this.state = {
        ...this.state,
        player: {
          ...this.state.player,
          position: {
            ...clamped.position,
            x: at === null ? middleX : (at['x'] as number),
            z: at === null ? middleZ : (at['z'] as number)
          }
        },
        room: roomId,
        wallContact: clamped.contacts
      };
      this.indoor = indoorScene(
        here,
        this.world.doorwayRules,
        this.residence.get(this.world.doorwayRules.photonEmitterSlot) ?? {
          kind: 'surface'
        }
      );
    } else {
      this.location = SURFACE;
      this.containment = undefined;
      this.indoor = undefined;
      const at = scenario['at'] as TraceObject | null | undefined;
      if (at !== null && at !== undefined) {
        this.state = {
          ...this.state,
          player: {
            ...this.state.player,
            position: {
              ...this.state.player.position,
              x: at['x'] as number,
              z: at['z'] as number
            }
          }
        };
      }
    }

    const craft = scenario['craft'];
    if (typeof craft === 'number') {
      this.residence.set(craft, { kind: 'gone' });
      this.state = board(
        this.state,
        craft,
        this.state.player.position,
        this.state.player.heading,
        this.flight
      );
      this.state = {
        ...this.state,
        poweramp: scenario['poweramp'] === true
      };
    }
    const notch = scenario['notch'];
    if (typeof notch === 'number') {
      this.state = throttle(this.state, notch, this.flight.rules);
    }

    // Nothing after setup moves an object, so the table every snapshot reports is shaped once
    // here rather than rebuilt for each of the run's several hundred steps.
    this.residenceTable = Object.fromEntries(
      [...this.residence].map(([slot, where]) => [
        String(slot),
        residenceValue(where)
      ])
    );
  }

  get elapsed(): number {
    return this.state.elapsed;
  }

  applyCommand(command: TraceObject): void {
    const notch = command['throttle'];
    if (typeof notch === 'number') {
      this.state = throttle(this.state, notch, this.flight.rules);
    }
  }

  advance(input: TraceObject, dt: number): TraceValue[] {
    let inputIntent = intent({
      pitch: input['pitch'] as number,
      running: input['running'] as boolean,
      turn: input['turn'] as number,
      walk: input['walk'] as number
    });
    // The trace scenarios never flip, but this one line mirrors the session seam exactly.
    if (this.state.worldFlipped) {
      inputIntent = { ...inputIntent, turn: -inputIntent.turn };
    }
    this.state = step(
      this.state,
      inputIntent,
      dt,
      this.flight,
      this.containment
    );

    const events: TraceValue[] = [];
    if (wallThud(this.state)) {
      events.push({
        wall: { sound: this.world.doorwayRules.wallThudSound }
      });
    }
    if (this.state.touchdown !== undefined) {
      const touchdown = this.state.touchdown;
      events.push('tone', { touchdown });
      if (touchdown === 'crashed') {
        this.state = leave(this.state, this.flight);
      }
    }
    return events;
  }

  snapshot(): TraceValue {
    return {
      core: {
        poweramp: this.state.poweramp,
        stepInterlock: this.state.stepInterlock,
        touchdown: this.state.touchdown ?? null,
        transitionCooldown: this.state.transitionCooldown,
        wallContact: this.state.wallContact,
        wallContactLatch: this.state.wallContactLatch
      },
      credits: 0,
      indoor:
        this.indoor === undefined
          ? null
          : {
              background: this.indoor.background,
              dark: this.indoor.dark,
              foreground: this.indoor.foreground,
              lineColour: this.indoor.lineColour
            },
      isScriptRunning: false,
      location:
        this.location.kind === 'surface'
          ? 'surface'
          : { room: this.location.id },
      message: '',
      mode: this.state.mode,
      occupancy:
        this.state.craft === undefined ? 'onFoot' : { craft: this.state.craft },
      player: {
        ...this.state.player,
        position: { ...this.state.player.position }
      },
      residence: this.residenceTable,
      throttle: this.state.throttle,
      throttleNotch: throttleNotch(
        this.state.throttle,
        this.flight.rules.throttleNotches
      ),
      worldFlipped: this.state.worldFlipped
    };
  }
}

const residenceValue = (residence: Residence): TraceValue => {
  switch (residence.kind) {
    case 'surface':
      return residence.at === undefined
        ? 'surface'
        : {
            surface: {
              x: residence.at.x,
              y: residence.at.y,
              z: residence.at.z
            }
          };
    case 'room':
      return { room: residence.id };
    case 'carried':
      return 'carried';
    case 'gone':
      return 'gone';
  }
};

const throttleNotch = (
  throttle: number,
  notches: readonly number[]
): number => {
  const index = notches.findIndex(notch => Math.abs(notch - throttle) < 0.5);
  return index < 0 ? 0 : index + 1;
};
