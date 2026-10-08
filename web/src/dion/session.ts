import type { PassPhase } from '../enhanced/interpolation.ts';
import { IDLE, type Intent } from '../gameCore/index.ts';
import {
  clampRegionStep,
  regionAt,
  walk,
  type ClampRegion,
  type WalkRules
} from '../onFoot/index.ts';
import type { TitleSession } from '../shell/title.ts';
import {
  bodyTime,
  longitudeAtBodyTime,
  wrapBodyLongitude
} from '../sky/bodyTime.ts';
import type { DionContent } from './content.ts';
import {
  dionDoorKey,
  dionDoorTravel,
  planDionFrame,
  type DionCandidate,
  type DionDoorState,
  type DionFrameState,
  type Vec3
} from './frame.ts';
import type { DionPanelView } from './panel.ts';
import { readDionResume } from './restore.ts';
import { DionNarrative, type DionScriptState } from './script.ts';
import {
  createTaxi,
  stepTaxi,
  taxiControl,
  type DionTaxi,
  type DionTaxiProfile
} from './service.ts';
import { dionDay } from './sky.ts';
import {
  freshSound,
  requestSound,
  soundRegisterChanges,
  tickSound,
  type DionSoundState
} from './sound.ts';
import type { TourcraftState } from './tourcraftState.ts';

/// The Mercenary III Gameplay Session, a sibling of Targ's and Damocles's (ADR 0043).
///
/// It runs game time as ADR 0058 sets it: fifty ticks a second, each tick one game
/// VBL, and one atomic simulation frame every eleven ticks after that tick's VBL rules.
/// Time is counted in ticks and frames, never in browser frames, so a session stepped
/// at any display rate reaches the same state.
///
export interface DionClock {
  readonly accumulator: number;
  readonly day: number;
  readonly seconds: number;
}

export type DionAction =
  | 'activate'
  | 'star'
  | 'plus'
  | 'minus'
  | 'board'
  | 'leave'
  | 'take'
  | 'drop'
  | 'forward'
  | 'backward';

export interface DionSnapshot {
  readonly admission: number;
  readonly candidate: DionCandidate | null;
  readonly card: boolean;
  readonly cardDestination: number;
  readonly cash: string;
  readonly cell: number;
  readonly clock: DionClock;
  readonly day: boolean;
  readonly doors: ReadonlyMap<number, DionDoorState>;
  readonly driver: {
    readonly index: number;
    readonly profile: boolean;
    readonly remaining: number;
    readonly selector: number;
  };
  readonly eye: Vec3;
  /// Simulation frames run since the session began.
  readonly frame: number;
  /// `$7180`, the frame counter the beacon blink reads.
  readonly frameCounter: number;
  readonly gauges: {
    readonly inventory: number;
    readonly p: number;
    readonly t: number;
  };
  readonly heading: number;
  readonly location: number;
  readonly narrative: DionScriptState;
  readonly pending: DionAction | null;
  readonly phase: number;
  readonly pitch: number;
  readonly position: readonly [number, number];
  readonly region: number;
  readonly reveal: number;
  /// The animated sign: its buffer character and script index (`$B3F2`/`$B3F4`).
  readonly sign: { readonly code: number; readonly index: number };
  readonly sound: DionSoundState;
  readonly taxi: DionTaxi;
  /// Ticks run since the session began.
  readonly tick: number;
  readonly tourcraft?: TourcraftState;
}

export interface DionResumeRecord {
  readonly remainder: number;
  readonly snapshot: Omit<DionSnapshot, 'doors'> & {
    readonly doors: readonly (readonly [number, DionDoorState])[];
  };
}

const SPACE = 0x20;
/// `$50F22`, the R key's toggle (`$568C4`, scancode `$13`): running latches the walk step `$71CE`
/// to `$31400`, the log-float 10.0 against the opening's `$21800` (6.0), and the turn `$71D2` to 3
/// against 2. Walking puts both back. The ratios are Damocles's recovered 5/3 and 3/2.
const RUN_STEP = 10;
const RUN_TURN = 3;
const SIGN_BUFFER = 0xb3_f2;

export class DionSession implements TitleSession<
  DionSnapshot,
  DionResumeRecord
> {
  intent: Intent = IDLE;
  /// `$71D2`: the run toggle, which the R key latches and the run lamp shows. It is Session State
  /// rather than the Control Profile's, so a Save and a reload keep it, as Damocles's do.
  protected runMode = false;
  protected remainder = 0;
  protected narrative: DionNarrative;
  protected events: {
    readonly at: number;
    readonly registers: readonly (readonly [number, number])[];
  }[] = [];
  protected state: DionSnapshot;
  protected readonly substeps: number;
  protected readonly tickSeconds: number;
  protected readonly ticksPerFrame: number;
  protected readonly walkRules: WalkRules;

  constructor(
    protected content: DionContent,
    restore?: DionResumeRecord
  ) {
    const { opening } = content.world;
    this.tickSeconds = 1 / content.presentation.ticksPerSecond.value;
    this.ticksPerFrame = content.presentation.ticksPerFrame.value;
    this.substeps = content.presentation.walkingSubsteps.value;
    // One shared step a substep at the recovered increments, which the R mode raises.
    this.walkRules = {
      eyeHeight: opening.eye[1],
      runMultiplier: RUN_STEP / opening.walk.step,
      runTurnMultiplier: RUN_TURN / opening.walk.turn,
      turnRadiansPerSecond: (2 * Math.PI * opening.walk.turn) / 1024,
      unitsPerSecond: opening.walk.step
    };
    this.narrative = new DionNarrative(content);
    this.narrative.start(0x19);
    this.state = {
      admission: 0,
      candidate: null,
      card: false,
      cardDestination: 0,
      cash: opening.cash,
      cell: opening.cell,
      clock: {
        accumulator: opening.clock.accumulator,
        day: opening.clock.day,
        seconds: opening.clock.seconds
      },
      day: dionDay(content.world.sky),
      driver: { index: 0, profile: false, remaining: 0, selector: 0 },
      narrative: this.narrative.state,
      pending: null,
      phase: content.world.sky.phase,
      reveal: 0,
      sound: freshSound(),
      taxi: createTaxi(content),
      // `$5AE62`: the prison binds its door shut, and with no key held it stays shut.
      doors: new Map(),
      eye: opening.eye,
      frame: 0,
      frameCounter: opening.frameCounter,
      gauges: opening.gauges,
      heading: opening.heading,
      location: opening.location,
      pitch: opening.pitch,
      position: opening.position,
      region: opening.region,
      sign: { code: SPACE, index: 0 },
      tick: 0
    };
    if (restore !== undefined) {
      restore = readDionResume(restore, content);
      this.state = {
        ...structuredClone(restore.snapshot),
        doors: new Map(restore.snapshot.doors)
      };
      this.remainder = restore.remainder;
      this.narrative.state = this.state.narrative;
    }
    if (new.target === DionSession) {
      this.selectCandidate();
    }
  }

  /// Local solar time follows the observer's current longitude. The recovered sky's cached
  /// latitude and frame-sampled day test stay as recovered, including aboard a taxi.
  bodyTime(): number {
    const sky = this.content.world.sky;
    return bodyTime(
      this.state.eye[0] / 0x4_00_00 + this.state.phase / 0x1_00_00,
      sky.latitude,
      sky.sunAngle
    );
  }

  setBodyTime(secondsOfDay: number): void {
    const sky = this.content.world.sky;
    const longitude = longitudeAtBodyTime(
      secondsOfDay,
      sky.latitude,
      sky.sunAngle
    );
    const target =
      wrapBodyLongitude(longitude - this.state.eye[0] / 0x4_00_00) * 0x1_00_00;
    // Retain the turns above the visible ten-bit angle and round up by at most one phase
    // unit so a set integer second reads back as itself.
    const phase =
      (Math.floor(this.state.phase / 0x04_00_00_00) * 0x04_00_00_00 +
        Math.ceil(target)) >>>
      0;
    this.state = { ...this.state, day: dionDay({ ...sky, phase }), phase };
  }

  setPanelClock(secondsOfDay: number): void {
    this.state = {
      ...this.state,
      clock: { ...this.state.clock, seconds: secondsOfDay }
    };
  }

  press(action: DionAction): void {
    this.state = { ...this.state, pending: action };
  }

  /// Whether the run toggle is on.
  get running(): boolean {
    return this.runMode;
  }

  /// The run key: latch running on, or off again.
  toggleRunning(): void {
    this.runMode = !this.runMode;
  }

  drainSound(): typeof this.events {
    const events = this.events;
    this.events = [];
    return events;
  }

  get snapshot(): DionSnapshot {
    return this.state;
  }

  /// How far the clock has run toward the next frame, with `ahead` seconds the display has
  /// given but the session not yet taken, for the Enhanced view to draw between frames
  /// (ADR 0078). Read only: nothing here is state.
  passPhase(ahead = 0): PassPhase {
    const tick = this.state.tick;
    return {
      fraction:
        ((tick % this.ticksPerFrame) +
          (this.remainder + ahead) / this.tickSeconds) /
        this.ticksPerFrame,
      pass: Math.floor(tick / this.ticksPerFrame)
    };
  }

  advance(seconds: number): DionSnapshot {
    this.remainder += Math.max(0, seconds);
    while (this.remainder + 1e-12 >= this.tickSeconds) {
      this.remainder -= this.tickSeconds;
      this.tick();
    }
    if (Math.abs(this.remainder) < 1e-12) {
      this.remainder = 0;
    }
    return this.state;
  }

  protected taxiProfile(): DionTaxiProfile {
    return 'd1';
  }

  protected serviceContent(): DionContent {
    return this.content;
  }

  protected clockRate(): number {
    return this.content.world.opening.clock.step;
  }
  protected tickExtra(): void {}
  protected advanceSound(previous: DionSoundState, control: number) {
    const sound = tickSound(
      this.content.sound,
      previous,
      control,
      this.narrative.state.message
    );
    return { registers: soundRegisterChanges(previous, sound), sound };
  }
  protected emitSound(
    at: number,
    registers: readonly (readonly [number, number])[]
  ): void {
    if (registers.length) {
      this.events.push({ at, registers });
    }
  }

  /// One tick: the VBL rules, then the frame if this tick ends one.
  protected tick(): void {
    const { opening } = this.content.world;
    // `$53164..$531D0`: the step comes off the accumulator; at or below zero a
    // second is counted and the refill added, and the day rolls at 86,400.
    let { accumulator, day, seconds } = this.state.clock;
    accumulator -= this.clockRate();
    while (accumulator <= 0) {
      seconds += 1;
      accumulator += opening.clock.refill;
    }
    if (seconds >= 86_400) {
      seconds -= 86_400;
      day = (day + 1) & 0xff_ff;
    }
    const tick = this.state.tick + 1;
    this.narrative.tick();
    const beforeSound = this.state.sound;
    const control = taxiControl(
      this.content,
      this.state.taxi,
      this.taxiProfile()
    );
    const { registers, sound } = this.advanceSound(beforeSound, control);
    this.emitSound(tick / 50, registers);
    this.state = {
      ...this.state,
      clock: { accumulator, day, seconds },
      narrative: this.narrative.state,
      phase: (this.state.phase + this.content.world.sky.rate) >>> 0,
      reveal: Math.max(0, this.state.reveal - 1),
      sound,
      tick
    };
    this.tickExtra();
    if (tick % this.ticksPerFrame === 0) {
      this.frame();
    }
  }

  /// One simulation frame, atomic, after the tick's VBL rules.
  protected frame(): void {
    this.handleInput();
    this.narrative.frame();
    this.state = { ...this.state, narrative: this.narrative.state };
    for (let substep = 0; substep < this.substeps; substep += 1) {
      this.walkSubstep();
    }
    const previousTaxi = this.state.taxi;
    const service = stepTaxi(
      this.serviceContent(),
      previousTaxi,
      this.state.cell,
      this.taxiProfile()
    );
    this.state = { ...this.state, taxi: service.taxi };
    if (service.liftOff) {
      this.cue('lift_off');
    }
    if (service.setDown) {
      this.cue('taxi_set_down');
    }
    if (service.arrived) {
      this.narrative.idMessage(0x25);
    }
    if (service.taxi.passenger) {
      const eye: Vec3 = [
        service.taxi.position[0],
        service.taxi.position[1] + 63,
        service.taxi.position[2]
      ];
      const cell = this.cellAt(eye);
      if (cell !== this.state.cell) {
        this.cue('cut');
        this.state = { ...this.state, doors: new Map() };
      }
      this.state = {
        ...this.state,
        cell,
        eye,
        heading:
          (this.state.heading + service.taxi.heading - previousTaxi.heading) &
          65_535,
        region: this.regionAtEye(cell, eye)
      };
    } else {
      this.admit();
    }
    this.animateDriver();
    const sign = this.signBound()
      ? this.advanceSign(this.state.sign)
      : this.state.sign;
    this.state = {
      ...this.state,
      day: dionDay({ ...this.content.world.sky, phase: this.state.phase }),
      frame: this.state.frame + 1,
      frameCounter: (this.state.frameCounter + 1) & 0xff_ff,
      narrative: this.narrative.state,
      sign
    };
    this.selectCandidate();
  }

  /// One substep of the on-foot loop `$5A4C2`: the shared foot Mover (`$59A36`), then the
  /// shared region scan and eye clamp (`$5B2D2..$5B620`) in the bound structure's frame.
  ///
  /// The step and turn are MIII's recovered increments, one `walk` a substep. The original
  /// multiplies the step through its log tables by the heading's half-step sine and cosine
  /// and rounds each product into the pose; the shared step works in radians, so the half
  /// step is carried into the bearing and each axis's move is rounded to whole units.
  protected walkSubstep(): void {
    const { eye, heading } = this.state;
    const bearing = (2 * Math.PI * (heading + 512.5)) / 1024;
    const moved = walk(
      { heading: bearing, position: { x: eye[0], y: eye[1], z: eye[2] } },
      this.intent,
      1,
      this.walkRules
    );
    const turned = moved.heading - bearing;
    const wrapped = turned - 2 * Math.PI * Math.round(turned / (2 * Math.PI));
    const nextHeading =
      (heading + Math.round((wrapped * 1024) / (2 * Math.PI))) & 0xff_ff;
    let next: Vec3 = [
      eye[0] + Math.round(moved.position.x - eye[0]),
      eye[1],
      eye[2] + Math.round(moved.position.z - eye[2])
    ];
    if (this.state.taxi.passenger) {
      this.state = { ...this.state, heading: nextHeading };
      return;
    }
    this.moveDoor(next);
    let { cell, region } = this.state;
    const bound = this.bound(cell);
    if (bound !== null) {
      const step = clampRegionStep(
        bound.regions,
        region === 0 ? null : region - 1,
        [next[0] - bound.origin[0], next[2] - bound.origin[1]]
      );
      next = [
        bound.origin[0] + step.point[0],
        eye[1],
        bound.origin[1] + step.point[1]
      ];
      region = step.regionIndex === null ? 0 : step.regionIndex + 1;
    }
    // `$56002`: crossing into another cell binds it and walks its regions afresh.
    const reached = this.cellAt(next);
    if (reached !== cell) {
      cell = reached;
      this.state = { ...this.state, doors: new Map() };
      const entered = this.bound(cell);
      const found =
        entered === null
          ? null
          : regionAt(entered.regions, [
              next[0] - entered.origin[0],
              next[2] - entered.origin[1]
            ]);
      region = found === null ? 0 : found + 1;
    }
    this.state = {
      ...this.state,
      cell,
      eye: next,
      heading: nextHeading,
      region
    };
  }

  /// The bound structure's regions as the shared clamp sees them, and its origin. A door
  /// region is selectable only while its door's latch is open (`$5B320`).
  protected bound(cell: number): {
    readonly origin: readonly [number, number];
    readonly regions: readonly ClampRegion[];
  } | null {
    const { world } = this.content;
    const entry = world.cells.find(item => item.cell === cell);
    const structure =
      entry &&
      world.structures.get(entry.structure)?.get(entry.scale.join(','));
    if (entry === undefined || structure === undefined) {
      return null;
    }
    const [gx, gz] = world.opening.groupOrigin;
    return {
      origin: [
        (gx + entry.x) * 0x1_00_00 + entry.origin[0],
        (gz + entry.z) * 0x1_00_00 + entry.origin[1]
      ],
      regions: structure.regions.map(item => {
        const named = item.flags & 0x03_fc;
        const door =
          named === 0 || named === 0x02_00
            ? undefined
            : structure.attachments.find(
                attachment => attachment.slot + 0x1_a8 === named
              );
        return {
          available:
            door === undefined ||
            this.state.doors.get(door.slot)?.latch === 'open',
          bounds: [item.bounds.x, item.bounds.z],
          flags: item.flags
        };
      })
    };
  }

  protected cellAt(eye: Vec3): number {
    const [gx, gz] = this.content.world.opening.groupOrigin;
    const x = Math.floor(eye[0] / 0x1_00_00) - gx;
    const z = Math.floor(eye[2] / 0x1_00_00) - gz;
    return (z & 15) * 16 + (x & 15);
  }

  /// `$5600C..$560B0`: the cell's token set binds the animated buffer only at `(3,0)`.
  protected signBound(): boolean {
    const cell = this.content.world.cells.find(
      item => item.cell === this.state.cell
    );
    if (cell?.tokenSet === null || cell === undefined) {
      return false;
    }
    return (
      this.content.world.lettering.bindings89[cell.tokenSet] === SIGN_BUFFER
    );
  }

  /// `$54F20`: the index steps once a frame, wrapping on the script's zero.
  protected advanceSign(sign: DionSnapshot['sign']): DionSnapshot['sign'] {
    const script = this.content.world.lettering.signScript;
    const index = sign.index + 1;
    const code = script[index];
    return code === undefined || code === 0
      ? { code: script[0] ?? SPACE, index: 0 }
      : { code, index };
  }

  protected cue(name: string): void {
    const previous = this.state.sound;
    const sound = requestSound(previous, name);
    this.state = { ...this.state, sound };
    const registers = soundRegisterChanges(previous, sound);
    this.emitSound(this.state.tick / 50, registers);
  }

  protected handleInput(): void {
    const action = this.state.pending;
    this.state = { ...this.state, pending: null };
    // The Carried Stack is the expanded session's; this one does not reach it.
    if (
      action === null ||
      action === 'take' ||
      action === 'drop' ||
      action === 'forward' ||
      action === 'backward'
    ) {
      return;
    }
    const taxi = this.state.taxi;
    if (action === 'board') {
      if (!taxi.passenger) {
        this.state = { ...this.state, admission: 10 };
      }
      return;
    }
    if (action === 'leave') {
      if (taxi.passenger && taxi.counter === 2) {
        this.state = {
          ...this.state,
          admission: 0,
          cardDestination: 0,
          taxi: { ...taxi, passenger: false, start: false }
        };
        this.cue('key_click');
        this.cue('leave');
      }
      return;
    }
    if (action === 'activate') {
      if (!this.state.card) {
        this.state = { ...this.state, card: true, reveal: 64 };
        this.cue('key_click');
      }
      return;
    }
    if (!this.state.card || this.state.reveal !== 0) {
      return;
    }
    if (action === 'star') {
      if (taxi.passenger) {
        if (taxi.destination === 0 || taxi.start) {
          return;
        }
        this.state = { ...this.state, taxi: { ...taxi, start: true } };
        if (this.state.cell === 0x62) {
          this.narrative.start(taxi.destination === 0x60 ? 0x34 : 0x33);
        }
      } else {
        this.state = { ...this.state, taxi: { ...taxi, call: true } };
      }
      this.cue('key_click');
      return;
    }
    if (taxi.passenger && !taxi.start) {
      const choices = this.content.service.destinations
        .map(item => item.code)
        .filter(code => code !== this.state.cell);
      const index = choices.indexOf(taxi.destination);
      const direction = action === 'plus' ? 1 : -1;
      const next =
        index < 0
          ? direction > 0
            ? 0
            : choices.length - 1
          : (index + direction + choices.length) % choices.length;
      this.state = {
        ...this.state,
        cardDestination: choices[next]!,
        taxi: { ...taxi, destination: choices[next]! }
      };
      this.cue('key_click');
    }
  }

  protected admit(): void {
    if (this.state.admission === 0) {
      return;
    }
    this.state = { ...this.state, admission: this.state.admission - 1 };
    const { candidate, taxi } = this.state;
    // R1's ordered guards. Candidate is the preceding simulation frame's draw selection.
    if (taxi.counter < 2 || taxi.counter > 30) {
      return;
    }
    if (candidate === null || candidate.exponent > 9) {
      return;
    }
    const flags = this.admissionFlags();
    if (!(flags & 0x40_00)) {
      return;
    }
    if (
      candidate.slot < 16 ||
      candidate.slot >= 20 ||
      this.state.location === 0x78
    ) {
      return;
    }
    const eye: Vec3 = [
      taxi.position[0],
      taxi.position[1] + 63,
      taxi.position[2]
    ];
    this.state = {
      ...this.state,
      admission: 0,
      eye,
      heading: taxi.heading,
      taxi: { ...taxi, call: false, passenger: true }
    };
    this.narrative.idMessage(0x28);
  }

  protected admissionFlags(): number {
    const entry = this.content.world.cells.find(
      item => item.cell === this.state.cell
    );
    const flags =
      entry === undefined
        ? 0
        : (this.content.world.structures
            .get(entry.structure)
            ?.get(entry.scale.join(','))?.regions[this.state.region - 1]
            ?.flags ?? 0);
    return flags;
  }

  protected regionAtEye(cell: number, eye: Vec3): number {
    const bound = this.bound(cell);
    if (bound === null) {
      return 0;
    }
    const index = regionAt(bound.regions, [
      eye[0] - bound.origin[0],
      eye[2] - bound.origin[1]
    ]);
    return index === null ? 0 : index + 1;
  }

  protected frameState(): DionFrameState {
    return dionFrameState(this.state);
  }

  protected selectCandidate(): void {
    const candidate = planDionFrame(
      this.content.world,
      this.frameState()
    ).candidate;
    this.state = { ...this.state, candidate };
  }

  /// Whether the player holds object `key`: bit 7 of its state byte (`$641E`+4·key).
  /// The D1 slice holds only DOOR KEY A `$26`, which the opening script hands over.
  protected holdsKey(key: number): boolean {
    return key === 0x26 && this.narrative.state.keyA;
  }

  /// `$5BA24`: one pass over each door of the bound cell. A door opens a unit a substep
  /// while the eye is inside its box and it is keyless or its key is held, and closes
  /// otherwise. Its latch settles a substep after the leaves arrive, or on arrival where
  /// a single leaf's edge falls toward its endpoint (as Damocles's `$05AA3C` does). The
  /// first pass to move a door arms door-moving and the last arms door-stop (`$5B9D6`).
  protected moveDoor(eye: Vec3): void {
    const entry = this.content.world.cells.find(
      item => item.cell === this.state.cell
    );
    const structure =
      entry &&
      this.content.world.structures
        .get(entry.structure)
        ?.get(entry.scale.join(','));
    if (entry === undefined || !structure?.attachments.length) {
      return;
    }
    const [gx, gz] = this.content.world.opening.groupOrigin;
    const x = eye[0] - ((gx + entry.x) * 65_536 + entry.origin[0]);
    const z = eye[2] - ((gz + entry.z) * 65_536 + entry.origin[1]);
    const doors = new Map(this.state.doors);
    let wasMoving = false;
    let moved = false;
    for (const door of structure.attachments) {
      const previous = doors.get(door.slot) ?? {
        latch: 'shut',
        openUnits: 0
      };
      wasMoving ||= previous.latch === 'moving';
      const key = dionDoorKey(door, entry);
      const opening =
        x >= door.box.x[0] &&
        x < door.box.x[1] &&
        z >= door.box.z[0] &&
        z < door.box.z[1] &&
        (key === 0 || this.holdsKey(key));
      if (previous.latch === (opening ? 'open' : 'shut')) {
        continue;
      }
      const travel = dionDoorTravel(door);
      const proposed = previous.openUnits + (opening ? 1 : -1);
      const beyond = opening ? proposed - travel : -proposed;
      const falling = (door.control & 0x01_00) === 0 ? opening : !opening;
      const latch =
        beyond > 0 || (beyond === 0 && !door.twoLeaves && falling)
          ? opening
            ? 'open'
            : 'shut'
          : 'moving';
      doors.set(door.slot, {
        latch,
        openUnits: Math.max(0, Math.min(travel, proposed))
      });
      moved ||= latch === 'moving';
    }
    this.state = { ...this.state, doors };
    if (!wasMoving && moved) {
      this.cue('door_moving');
    }
    if (wasMoving && !moved) {
      this.cue('door_stop');
    }
  }

  protected canInstallDriver(): boolean {
    return true;
  }

  protected finishDriver(): DionSnapshot['driver'] {
    return { index: 0, profile: false, remaining: 0, selector: 0 };
  }

  protected animateDriver(): void {
    let driver = this.state.driver;
    const selector = this.narrative.state.cabin;
    if (selector !== 0 && this.canInstallDriver()) {
      const counts = this.content.service.headTurns.get(selector)!;
      driver = { index: 1, profile: false, remaining: counts[0]!, selector };
      this.narrative.state = { ...this.narrative.state, cabin: 0 };
    }
    if (driver.remaining > 0) {
      driver = { ...driver, remaining: driver.remaining - 1 };
      if (driver.remaining === 0) {
        const count = this.content.service.headTurns.get(driver.selector)?.[
          driver.index
        ];
        driver =
          count === undefined
            ? this.finishDriver()
            : {
                ...driver,
                index: driver.index + 1,
                profile: !driver.profile,
                remaining: count
              };
      }
    }
    this.state = { ...this.state, driver };
  }

  captureResume(): DionResumeRecord {
    return {
      remainder: Math.max(0, this.remainder),
      snapshot: structuredClone({ ...this.state, doors: [...this.state.doors] })
    };
  }
}

export const dionFrameState = (snapshot: DionSnapshot): DionFrameState => ({
  cell: snapshot.cell,
  day: snapshot.day,
  doors: snapshot.doors,
  driverProfile: snapshot.driver.profile,
  eye: snapshot.eye,
  frameCounter: snapshot.frameCounter,
  heading: snapshot.heading,
  passenger: snapshot.taxi.passenger ? 16 : null,
  pitch: snapshot.pitch,
  region: snapshot.region,
  residents: new Map([
    [16, { position: snapshot.taxi.position, yaw: snapshot.taxi.heading >> 2 }]
  ]),
  roll: 0,
  signCode: snapshot.sign.code
});

export const dionPanelView = (
  snapshot: DionSnapshot,
  content: DionContent
): DionPanelView => {
  const [gx, gz] = content.world.opening.groupOrigin;
  const roster = content.panel.strings.roster;
  return {
    cash: snapshot.cash,
    centre: !snapshot.card
      ? { kind: 'logo' }
      : {
          kind: 'card',
          lines: snapshot.taxi.passenger
            ? snapshot.cardDestination === 0
              ? (content.panel.strings.card.get('selectToStart') ?? [
                  '+ SELECT -',
                  '* TO START'
                ])
              : (content.panel.labels.find(
                  item => item.code === snapshot.cardDestination
                )?.lines ?? ['', ''])
            : (content.panel.strings.card.get('pressToCall') ?? [
                'PRESS *',
                'TO CALL'
              ]),
          reveal: snapshot.reveal
        },
    clockSeconds: snapshot.clock.seconds,
    eyeY: snapshot.eye[1],
    gauges: snapshot.gauges,
    grid: [
      Math.floor(snapshot.eye[0] / 0x1_00_00) - gx,
      Math.floor(snapshot.eye[2] / 0x1_00_00) - gz
    ],
    heading: snapshot.heading,
    inventory: content.panel.strings.inventory,
    location:
      roster[(2 * snapshot.location) / 8] ?? content.panel.strings.location,
    message: snapshot.narrative.message.bar,
    pitch: snapshot.pitch,
    position: snapshot.position
  };
};
