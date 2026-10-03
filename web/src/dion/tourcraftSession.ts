import { IDLE } from '../gameCore/index.ts';
import type { DionContent } from './content.ts';
import {
  planDionFrame,
  zoneOf,
  type DionFrameState,
  type DionFrameWorld
} from './frame.ts';
import { list, record } from './read.ts';
import { initializeBodyTaxi, stepTaxi } from './service.ts';
import {
  DionSession,
  dionFrameState,
  dionPanelView,
  type DionResumeRecord
} from './session.ts';
import { requestSound, tickSound, type DionSoundState } from './sound.ts';
import type { TourcraftContent } from './tourcraftContent.ts';
import {
  encounterTail,
  initialEncounter,
  resetEncounter
} from './tourcraftEncounter.ts';
import {
  appendEvent,
  consumeEvent,
  freshEvents,
  type TourcraftBatch
} from './tourcraftEvents.ts';
import { TourcraftFlight } from './tourcraftFlight.ts';
import { tourcraftFrameWorld } from './tourcraftFrame.ts';
import {
  TourcraftNarrative,
  tourcraftNarrativeContent,
  type TourcraftScriptState
} from './tourcraftNarrative.ts';
import { updateTourcraftOwners } from './tourcraftOwners.ts';
import { readTourcraftResume } from './tourcraftRestore.ts';
import {
  advanceFaces,
  faceOutputs,
  initialTourcraftOwners,
  initialTourcraftPhases,
  initialTourcraftResidents,
  type TourcraftState
} from './tourcraftState.ts';
import { tourcraftView } from './tourcraftView.ts';
import { readDionOpening } from './world.ts';

const gameplayContent = (
  promoted: TourcraftContent,
  group: 3 | 23
): DionContent => {
  const world = tourcraftFrameWorld(promoted, group);
  const narrative = tourcraftNarrativeContent(promoted);
  return {
    ...narrative,
    contentSha256: promoted.contentSha256,
    service:
      group === 23
        ? {
            ...narrative.service,
            route: list(
              record(promoted.programmes['ambientTaxi'], 'ambientTaxi')[
                'route'
              ],
              'route'
            ) as DionContent['service']['route']
          }
        : narrative.service,
    world: {
      ...promoted.legacy.world,
      ...world,
      opening: {
        ...readDionOpening(promoted.gameplay.initial['opening']),
        groupOrigin: world.opening.groupOrigin
      }
    }
  };
};

/// The expanded Gameplay Session. Taxi input/service stays on the existing D1
/// machine; flight, Body binding, campaign and atomic reentry are Dion-owned.
export class TourcraftSession extends DionSession {
  declare protected narrative: TourcraftNarrative;
  private readonly metisContent: DionContent;
  private readonly worlds: ReadonlyMap<number, DionFrameWorld>;
  constructor(
    readonly promoted: TourcraftContent,
    restore?: DionResumeRecord
  ) {
    const content = gameplayContent(promoted, 3);
    if (restore) {
      restore = readTourcraftResume(restore, promoted);
    }
    super(content);
    this.metisContent = content;
    this.worlds = new Map([
      [60, tourcraftFrameWorld(promoted, 3)],
      [100, tourcraftFrameWorld(promoted, 23)]
    ]);
    this.narrative = new TourcraftNarrative(content);
    const owners = initialTourcraftOwners(promoted);
    this.state = {
      ...this.state,
      candidate: { distance: 0, exponent: 31, slot: 10 },
      narrative: this.narrative.state,
      reveal: 49,
      sound: {
        ...this.state.sound,
        cLevelLatch: 0,
        mixer: 254,
        registers: list(
          promoted.gameplay.initial['soundRegisters'],
          'soundRegisters'
        ) as number[],
        slew: 3840,
        streams: {
          cLevel: { count: 0, cursor: null },
          doorLevel: { count: 0, cursor: null },
          doorTone: { count: 0, cursor: null }
        }
      },
      tourcraft: {
        armed: false,
        collision: { nextPeriod: null, routine: 'idle' },
        encounter: initialEncounter(promoted, this.state.eye),
        events: freshEvents(
          list(
            promoted.gameplay.initial['soundRegisters'],
            'soundRegisters'
          ) as number[]
        ),
        faceInvocations: 0,
        faces: {
          $A1: { alternate: 0, base: 0 },
          $A5: { alternate: 0, base: 0 }
        },
        faceSelection: 'initial',
        flight: null,
        liveIntent: IDLE,
        owners,
        phases: initialTourcraftPhases(promoted),
        playerZone: Number(promoted.gameplay.initial['playerZone']),
        residents: initialTourcraftResidents(promoted)
      }
    };
    if (restore) {
      if (!restore.snapshot.tourcraft) {
        throw new Error('Incompatible prototype Save. Start a New Game.');
      }
      this.state = {
        ...structuredClone(restore.snapshot),
        doors: new Map(restore.snapshot.doors)
      };
      this.remainder = restore.remainder;
      this.narrative.state = this.state.narrative as TourcraftScriptState;

      this.intent = this.state.tourcraft!.liveIntent;
      if (this.state.location === 100) {
        this.content = gameplayContent(promoted, 23);
      }
    }
    // Validate/rebuild without refreshing the preceding-frame candidate or
    // consuming the mailbox. All first readers use the saved face selection.
    faceOutputs(promoted, this.expanded);
    this.planFrame();
  }
  private get expanded(): TourcraftState {
    return this.state.tourcraft!;
  }
  protected override taxiProfile() {
    return 'tourcraft' as const;
  }

  protected override serviceContent(): DionContent {
    return this.state.location === 100 ? this.content : this.metisContent;
  }
  protected override clockRate(): number {
    return this.expanded.flight?.mode === 'space'
      ? this.expanded.flight.rate
      : 32;
  }
  protected override emitSound(
    at: number,
    registers: readonly (readonly [number, number])[]
  ): void {
    if (!this.state.tourcraft) {
      super.emitSound(at, registers);
      return;
    }
    if (registers.length === 0) {
      return;
    }
    this.state = {
      ...this.state,
      tourcraft: {
        ...this.expanded,
        events: appendEvent(
          this.expanded.events,
          Math.round(at * 50),
          registers.map(([register, value]) => ({ register, value })),
          null
        )
      }
    };
  }
  deliverEvents(send: (batch: TourcraftBatch) => boolean): void {
    while (this.expanded.events.pending.length) {
      const batch = this.expanded.events.pending[0]!;
      if (!send(batch)) {
        return;
      }
      this.state = {
        ...this.state,
        tourcraft: {
          ...this.expanded,
          events: consumeEvent(this.expanded.events, batch)
        }
      };
    }
  }
  override drainSound() {
    const result: {
      at: number;
      registers: readonly (readonly [number, number])[];
    }[] = [];
    this.deliverEvents(batch => {
      result.push({
        at: batch.tick / 50,
        registers: batch.writes.map(w => [w.register, w.value] as const)
      });
      return true;
    });
    return result;
  }
  protected override cue(name: string): void {
    if (name === 'collision') {
      this.state = {
        ...this.state,
        tourcraft: {
          ...this.expanded,
          collision: {
            ...this.expanded.collision,
            routine: 'start'
          }
        }
      };
      return;
    }
    if (name === 'key_click') {
      this.state = {
        ...this.state,
        tourcraft: {
          ...this.expanded,
          collision: {
            ...this.expanded.collision,
            routine: 'idle'
          }
        }
      };
    }
    if (name !== 'cut') {
      super.cue(name);
      return;
    }
    this.state = {
      ...this.state,
      sound: requestSound(this.state.sound, 'cut')
    };
    this.emitSound(this.state.tick / 50, [
      [9, 0],
      [10, 0],
      [6, 31],
      [7, this.state.sound.mixer]
    ]);
  }
  protected override advanceSound(previous: DionSoundState, control: number) {
    const registers: (readonly [number, number])[] = [];
    let input = previous;
    let collision = this.expanded.collision;
    const write = (register: number, value: number) => {
      registers.push([register, value]);
      const image = [...input.registers];
      image[register] = value;
      input = {
        ...input,
        registers: image,
        ...(register === 7 ? { mixer: value } : {})
      };
    };
    if (collision.routine === 'start') {
      write(2, 0);
      write(3, 0);
      write(7, (input.mixer & 0xfd) | 0x10);
      for (const pair of list(
        record(this.promoted.programmes['collisionTone'], 'collisionTone')[
          'registers'
        ],
        'collision registers'
      )) {
        const [r, v] = list(pair, 'register pair') as number[];
        write(r!, v!);
      }
      collision = { ...collision, nextPeriod: 0, routine: 'running' };
    }
    if (collision.routine === 'running') {
      const periods = list(
        record(this.promoted.programmes['collisionTone'], 'collisionTone')[
          'periods'
        ],
        'periods'
      ) as number[];
      const period = periods[collision.nextPeriod!]!;
      if (period === 65_535) {
        collision = { ...collision, nextPeriod: 0 };
      } else {
        write(2, period & 255);
        write(3, period >>> 8);
        collision = { ...collision, nextPeriod: collision.nextPeriod! + 1 };
      }
    }
    this.state = { ...this.state, tourcraft: { ...this.expanded, collision } };
    const sound = tickSound(
      this.content.sound,
      input,
      control,
      this.narrative.state.message,
      {
        messageWasBusy: this.state.narrative.message.busy,
        onWrite: (r, v) => registers.push([r, v]),
        speed: this.expanded.flight?.craft.speed ?? 0xff_00_10_00
      }
    );
    return { registers, sound };
  }
  protected override tick(): void {
    const previous = this.state;
    super.tick();
    this.state = {
      ...this.state,
      tourcraft: updateTourcraftOwners(this.promoted, this.state, previous)
    };
    if (
      this.narrative.state.message.serial !== previous.narrative.message.serial
    ) {
      this.state = {
        ...this.state,
        tourcraft: {
          ...this.expanded,
          events: appendEvent(
            this.expanded.events,
            this.state.tick,
            [],
            this.narrative.state.message.serial
          )
        }
      };
    }
    if (this.state.location !== 65_535) {
      this.state = {
        ...this.state,
        day: this.expanded.owners['sky']!['dayBits'] !== 0,
        phase: this.expanded.phases[this.state.location / 4]!
      };
    }
  }
  protected override tickExtra(): void {
    const e = this.expanded;
    const animation = {
      ...e.owners['animation'],
      tickAngle: (e.owners['animation']!['tickAngle']! + 256) & 65_535
    };
    this.state = {
      ...this.state,
      tourcraft: {
        ...e,
        owners: { ...e.owners, animation },
        phases: e.phases.map(
          (phase, i) =>
            (phase + (this.promoted.system.bodies[i]?.rate ?? 0)) >>> 0
        )
      }
    };
  }
  protected override handleInput(): void {
    // The TOLOSA service is admitted only as an ambient resident. Its onward
    // passenger programmes are outside the promoted gameplay closure.
    if (
      this.state.location === 100 &&
      (this.state.pending === 'star' || this.state.pending === 'board')
    ) {
      this.state = { ...this.state, pending: null };
      return;
    }
    const candidate = this.state.candidate;
    if (
      this.state.pending === 'board' &&
      candidate?.slot === 13 &&
      !this.state.taxi.passenger &&
      this.state.location === 60
    ) {
      this.state = { ...this.state, pending: null };
      const header = this.content.world.models.get(13)?.header;
      if (
        !(this.expanded.owners['candidate']!['regionFlags']! & 0x40_00) ||
        this.expanded.flight?.mode === 'surface' ||
        this.expanded.flight?.mode === 'space' ||
        candidate.exponent > 9 ||
        ![1, 13].includes(header?.op ?? 0) ||
        header?.mode !== 64
      ) {
        this.state = { ...this.state, admission: 10 };
        return;
      }
      if (!/[1-9]/.test(this.state.cash.slice(0, 8))) {
        this.narrative.idMessage(12);
        this.state = { ...this.state, admission: 10 };
        return;
      }
      this.cue('key_click');
      this.narrative.start(0x29);
      this.state = {
        ...this.state,
        admission: 0,
        tourcraft: { ...this.expanded, armed: true }
      };
      return;
    }
    super.handleInput();
  }
  protected override frame(): void {
    const previous = this.expanded;
    if (this.state.frame > 0) {
      this.state = {
        ...this.state,
        tourcraft: updateTourcraftOwners(
          this.promoted,
          this.state,
          this.state,
          true
        )
      };
      this.state = {
        ...this.state,
        tourcraft: {
          ...this.expanded,
          encounter: encounterTail(
            this.promoted,
            previous.encounter,
            previous.flight
              ? [
                  previous.flight.craft.x,
                  previous.flight.craft.y,
                  previous.flight.craft.z
                ]
              : this.state.eye,
            previous.flight?.craft.trig.pitch ?? this.state.pitch,
            previous.flight?.craft.trig.yaw ?? this.state.heading,
            this.state.location,
            this.state.location === 100 ? 23 : 3,
            previous.flight?.mode === 'space',
            [
              previous.owners['view']!['eyeX']!,
              previous.owners['view']!['relativeY']!,
              previous.owners['view']!['eyeZ']!
            ]
          )
        }
      };
    }
    const e = this.expanded;
    this.narrative.top(this.state.clock.seconds);
    if (
      this.state.pending === 'board' &&
      this.state.candidate?.slot === 13 &&
      !this.state.taxi.passenger
    ) {
      this.handleInput();
      if (this.expanded.armed) {
        this.state = {
          ...this.state,
          frame: this.state.frame + 1,
          frameCounter: (this.state.frameCounter + 1) & 65_535
        };
        this.animateDriver();
        this.animateFaces();
        this.selectCandidate();
        return;
      }
    }

    if (e.armed) {
      const flight = new TourcraftFlight(this.promoted);
      // Header initialization owns this atomic frame, retaining the global tick
      // phase and existing VM; the first pilot fetch is playback frame 2.
      flight.frame(0);
      this.cue('ambient');
      this.state = {
        ...this.state,
        frame: this.state.frame + 1,
        frameCounter: 1,
        pending: null,
        tourcraft: {
          ...e,
          armed: false,
          encounter: { ...e.encounter, priorEye: flight.state.priorPose },
          flight: flight.state
        }
      };
      this.publishFlight();
      this.animateFaces();
      return;
    }
    if (e.flight !== null && e.flight.mode !== 'foot') {
      const flight = new TourcraftFlight(this.promoted, e.flight);
      const before = flight.state.mode;
      if (flight.state.frameWord >= 2) {
        this.narrative.frame();
      }
      const stick =
        (this.intent.walk > 0 ? 1 : this.intent.walk < 0 ? 2 : 0) |
        (this.intent.turn < 0 ? 4 : this.intent.turn > 0 ? 8 : 0);
      const enteringBody = flight.state.arrival !== null;
      const bodyYaw = enteringBody
        ? (Number(
            record(
              this.promoted.programmes['arrivalResidence'],
              'arrivalResidence'
            )['heading']
          ) >>>
            2) &
          255
        : undefined;
      if (enteringBody) {
        this.content = gameplayContent(this.promoted, 23);
        this.state = {
          ...this.state,
          cell: 0,
          doors: new Map(),
          location: 100,
          region: 0,
          taxi: initializeBodyTaxi(this.content)
        };
      }
      flight.frame(
        stick,
        () => {
          const service = stepTaxi(
            this.serviceContent(),
            this.state.taxi,
            this.state.cell
          );
          this.state = { ...this.state, taxi: service.taxi };
          this.publishTaxi(flight.state.body, this.state.cell);
          if (service.liftOff) {
            this.cue('lift_off');
          }
          if (service.setDown) {
            this.cue('taxi_set_down');
          }
          if (service.arrived) {
            this.narrative.idMessage(0x25);
          }
        },
        () => this.cue('collision')
      );
      if (enteringBody) {
        this.state = {
          ...this.state,
          tourcraft: {
            ...this.expanded,
            encounter: resetEncounter(this.expanded.encounter)
          }
        };
      }
      this.state = {
        ...this.state,
        frame: this.state.frame + 1,
        frameCounter: flight.state.frameWord,
        pending: null,
        tourcraft: {
          ...this.expanded,
          encounter: {
            ...this.expanded.encounter,
            priorEye: flight.state.priorPose
          },
          flight: flight.state
        }
      };
      this.animateDriver();
      this.animateFaces();
      if (before === 'surface' && flight.state.mode === 'space') {
        this.cue('ambient');
        this.narrative.top(this.state.clock.seconds);
        this.narrative.frame();
        this.animateDriver();
        this.animateFaces();
      }
      if (flight.state.mode === 'foot') {
        this.cue('cut');
        this.cue('key_click');
      }
      this.publishFlight(bodyYaw);
    } else {
      const priorPose = this.state.eye;
      const priorCell = this.state.cell;
      super.frame();
      // Passenger `$51966..$51982` binds and samples after the taxi copy;
      // an empty service samples against the preceding player binding.
      const sampledCell = this.state.taxi.passenger
        ? this.state.cell
        : priorCell;
      this.state = {
        ...this.state,
        tourcraft: {
          ...this.expanded,
          playerZone: this.zoneAt(
            this.state.eye,
            this.state.location,
            sampledCell
          )
        }
      };
      this.publishTaxi(this.state.location, sampledCell);
      this.state = {
        ...this.state,
        tourcraft: {
          ...this.expanded,
          encounter: { ...this.expanded.encounter, priorEye: priorPose }
        }
      };
      if (this.expanded.flight?.mode === 'foot') {
        const flight = this.expanded.flight;
        this.state = {
          ...this.state,
          tourcraft: {
            ...this.expanded,
            flight: {
              ...flight,
              craft: {
                ...flight.craft,
                pitch: this.state.pitch,
                trig: { pitch: this.state.pitch, yaw: this.state.heading },
                x: this.state.eye[0],
                y: this.state.eye[1],
                yaw: this.state.heading,
                z: this.state.eye[2]
              },
              priorPose
            }
          }
        };
      }
      this.animateFaces();
    }
    for (const effect of this.narrative.drainEffects()) {
      this.state =
        effect.kind === 'cash'
          ? { ...this.state, cash: effect.value }
          : {
              ...this.state,
              tourcraft: {
                ...this.expanded,
                encounter: {
                  ...this.expanded.encounter,
                  request: effect.request
                }
              }
            };
    }
    this.state = { ...this.state, narrative: this.narrative.state };
  }
  protected override canInstallDriver(): boolean {
    return this.state.driver.remaining === 0;
  }

  protected override finishDriver() {
    return { ...this.state.driver, profile: false, remaining: 0 };
  }
  private animateFaces(): void {
    this.state = {
      ...this.state,
      narrative: this.narrative.state,
      tourcraft: advanceFaces(
        this.promoted,
        this.expanded,
        this.narrative.state.message.busy &&
          this.expanded.owners['message']!['mode'] === 0 &&
          Boolean(this.narrative.state.flags[13])
      )
    };
  }
  private publishFlight(bodyYaw?: number): void {
    const e = this.expanded;
    const f = e.flight!;
    const c = f.craft;
    const copied =
      f.mode === 'foot'
        ? { pitch: c.pitch, roll: c.roll, yaw: c.yaw }
        : tourcraftView(
            this.content.world.rotationTable,
            c,
            f.cabinOffset,
            f.mode === 'space'
          );
    if (f.body === 100 && this.content.world.metisGroup !== 23) {
      this.content = gameplayContent(this.promoted, 23);
      this.state = { ...this.state, doors: new Map(), region: 0 };
    }
    const eye = [
      c.x >>> 0,
      (c.y + (f.mode === 'surface' ? 64 : 0)) >>> 0,
      c.z >>> 0
    ] as const;
    const location = f.mode === 'space' ? 65_535 : f.body;
    const cell = f.mode === 'space' ? this.state.cell : this.cellAt(eye);
    const residents = e.residents.map(r =>
      r.slot === 13
        ? {
            ...r,
            bodyOffset: location & 255,
            cell,
            position: [
              c.x,
              (f.mode === 'foot' ? c.y - 63 : c.y + 56) >>> 0,
              c.z
            ] as const,
            yaw:
              f.mode === 'foot'
                ? (((c.yaw - f.cabinOffset) & 65_535) >>> 2) & 255
                : (bodyYaw ?? r.yaw),
            zone:
              f.mode === 'space'
                ? this.expanded.playerZone
                : this.zoneAt([c.x, c.y, c.z], f.body, this.state.cell)
          }
        : r
    );
    this.state = {
      ...this.state,
      cell,
      eye: f.mode === 'foot' ? [c.x, 63, c.z] : eye,
      heading: copied.yaw,
      location,
      pitch: copied.pitch,
      region: f.mode === 'foot' ? this.regionAtEye(cell, [c.x, 63, c.z]) : 0,
      tourcraft: {
        ...e,
        playerZone: residents.find(r => r.slot === 13)!.zone,
        residents
      }
    };
  }
  private publishTaxi(body: number, playerCell: number): void {
    const taxi = this.state.taxi;
    this.state = {
      ...this.state,
      tourcraft: {
        ...this.expanded,
        residents: this.expanded.residents.map(r =>
          r.slot === 16
            ? {
                ...r,
                bodyOffset: body,
                cell: taxi.cell,
                position: taxi.position,
                yaw: (taxi.heading >>> 2) & 255,
                zone:
                  taxi.cell === playerCell
                    ? this.zoneAt(taxi.position, body, playerCell)
                    : 0
              }
            : r
        )
      }
    };
  }
  private zoneAt(
    eye: readonly [number, number, number],
    body: number,
    at: number
  ): number {
    const world = this.worlds.get(body === 100 ? 100 : 60)!;
    const cell = world.cells.find(c => c.cell === at);
    const detail = cell && world.details.get(cell.detail);
    return cell && detail ? zoneOf({ cell, detail }, eye[0], eye[2]) : 0;
  }
  protected override cellAt(eye: readonly [number, number, number]): number {
    const [gx, gz] = this.content.world.opening.groupOrigin;
    const x = Math.floor(eye[0] / 65_536) - gx;
    const z = Math.floor(eye[2] / 65_536) - gz;
    // `$55E90..$55EC0`: the admitted Bodies have `$70C0=0`.
    return x >= 0 && x < 16 && z >= 0 && z < 16 ? z * 16 + x : 0;
  }
  protected override frameState(): DionFrameState {
    return this.expandedFrameState();
  }
  expandedFrameState(): DionFrameState {
    const e = this.state.tourcraft;
    if (!e) {
      return dionFrameState(this.state);
    }
    const f = e.flight;
    const space = f?.mode === 'space';
    const surface = this.state.location === 100 ? 100 : 60;
    const c = f?.craft;
    const v = e.owners['view']!;
    const yaw = v['yaw']!;
    const pitch = v['pitch']!;
    const roll = v['roll']!;
    const body = this.promoted.system.bodies.find(b => b.offset === surface)!;
    return {
      ...dionFrameState(this.state),
      articulationAngle: e.owners['animation']!['sampledAngle']!,
      cameraAngles: { pitch, roll, yaw },
      driverProfile: this.narrative.state.flags[15]
        ? this.state.driver.profile
        : this.narrative.state.message.busy &&
          e.owners['message']!['selectedGlyph'] !== 0,
      eye: [v['eyeX']!, v['eyeY']!, v['eyeZ']!] as const,
      heading: yaw,
      passenger:
        f && f.mode !== 'foot' ? 13 : this.state.taxi.passenger ? 16 : null,
      pilotHead: f && f.mode !== 'foot' ? 279 : 263,
      pitch,
      residents: new Map([
        [
          16,
          {
            position: this.state.taxi.position,
            yaw: this.state.taxi.heading >>> 2
          }
        ],
        ...this.drawnResidents()
          .filter(r => r.slot !== 16)
          .map(r => [r.slot, { position: r.position, yaw: r.yaw }] as const)
      ]),
      roll,
      skyView: {
        body: space ? null : surface,
        clipRow: e.owners['sky']!['clipRows']!,
        day: this.state.day,
        latitude: e.owners['location']!['latitudeSample']!,
        longitude: e.owners['location']!['longitudeSample']!,
        pitch,
        roll,
        routine: space
          ? 'space'
          : f && f.mode === 'surface'
            ? 'flight'
            : 'onFoot',
        systemEye: f
          ? [f.space.x, f.space.y, f.space.z]
          : [body.centre[0], 64, body.centre[2]],
        yaw
      },
      tokens: faceOutputs(this.promoted, e)
    };
  }
  private drawnResidents() {
    return [
      ...this.expanded.residents.filter(
        r => r.bodyOffset === (this.state.location & 255)
      ),
      ...this.expanded.encounter.actors
        .filter(
          a =>
            a.state !== 0 &&
            a.slot >= 56 &&
            a.slot <= 58 &&
            a.bodyOffset === this.state.location
        )
        .map(a => ({
          association: 0,
          body: a.floor,
          cell: a.cell,
          group: a.group,
          model: 320,
          position: [a.x, a.y, a.z] as const,
          slot: a.slot,
          state: a.objectState,
          yaw: a.yaw,
          zone: a.zone
        }))
    ];
  }
  panelView() {
    return tourcraftPanelView(this.state, this.promoted);
  }
  planFrame() {
    const world = this.worlds.get(this.state.location === 100 ? 100 : 60)!;
    return planDionFrame(
      {
        ...world,
        drawList: {
          ...world.drawList,
          fixed: [
            ...world.drawList.fixed,
            ...this.drawnResidents()
              .filter(
                r =>
                  r.slot >= 56 &&
                  r.slot <= 58 &&
                  !world.drawList.fixed.includes(r.slot)
              )
              .map(r => r.slot)
          ]
        },
        residents: this.drawnResidents()
      },
      this.expandedFrameState()
    );
  }
  protected override admissionFlags(): number {
    return this.state.tourcraft
      ? this.expanded.owners['candidate']!['regionFlags']!
      : super.admissionFlags();
  }
  protected override selectCandidate(): void {
    if (!this.state.tourcraft) {
      super.selectCandidate();
      return;
    }
    const oldLocation = this.expanded.owners['location']!;
    const land =
      (((this.state.eye[0] & 65_535) - 16_384) |
        ((this.state.eye[2] & 65_535) - 16_384)) &
      65_535;
    const flags =
      this.expanded.owners['craft']!['support']! & 32_768 || land & 32_768
        ? 49_152
        : oldLocation['cell'] !== this.state.cell ||
            oldLocation['region'] !== this.state.region
          ? this.state.region > 0
            ? super.admissionFlags()
            : 49_152
          : this.admissionFlags();
    this.state = {
      ...this.state,
      tourcraft: updateTourcraftOwners(this.promoted, this.state, {
        ...this.state,
        frame: this.state.frame - 1
      })
    };
    const candidate = this.planFrame().candidate;
    this.state = {
      ...this.state,
      candidate,
      tourcraft: {
        ...this.expanded,
        owners: {
          ...this.expanded.owners,
          candidate: {
            ...this.expanded.owners['candidate'],
            regionFlags: flags
          }
        }
      }
    };
  }
  override captureResume(): DionResumeRecord {
    const record = super.captureResume();
    return {
      ...record,
      snapshot: {
        ...record.snapshot,
        tourcraft: { ...this.expanded, liveIntent: this.intent }
      }
    };
  }
}

export const tourcraftPanelView = (
  state: import('./session.ts').DionSnapshot,
  content: TourcraftContent
) => {
  const view = dionPanelView(state, content.legacy);
  const flight = state.tourcraft!.flight;
  const body = flight?.mode === 'space' ? flight.space.nearest : state.location;
  const home = content.promotion.bodyPlacements
    .find(b => b.offset === (state.location === 100 ? 100 : 60))!
    .islands.find(i => i.group === (state.location === 100 ? 23 : 3))!;
  return {
    ...view,
    grid: [
      Math.floor(state.eye[0] / 65_536) - home.origin[0],
      Math.floor(state.eye[2] / 65_536) - home.origin[1]
    ] as const,
    location:
      content.system.bodies.find(b => b.offset === body)?.name ?? view.location,
    ...(flight && flight.mode !== 'foot'
      ? {
          speed: {
            reverse: (flight.craft.throttle & 0x80_00) !== 0,
            value: flight.craft.panelSpeed
          }
        }
      : {})
  };
};
