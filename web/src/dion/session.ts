import { IDLE, type Intent } from '../gameCore/index.ts';
import {
  clampRegionStep,
  regionAt,
  walk,
  type ClampRegion,
  type WalkRules
} from '../onFoot/index.ts';
import type { TitleSession } from '../shell/title.ts';
import type { DionContent } from './content.ts';
import type { DionDoorState, DionFrameState, Vec3 } from './frame.ts';
import type { DionPanelView } from './panel.ts';

/// The Mercenary III Gameplay Session, a sibling of Targ's and Damocles's (ADR 0043).
///
/// It runs game time as ADR 0058 sets it: fifty ticks a second, each tick one game
/// VBL, and one atomic simulation frame every eleven ticks after that tick's VBL rules.
/// Time is counted in ticks and frames, never in browser frames, so a session stepped
/// at any display rate reaches the same state.
///
/// This is I1's session (#647): the recovered fresh game standing in the prison cell
/// of TIMEWARP PRISON, with the elapsed clock's VBL rule, the frame counter and the
/// animated sign's frame rule running. The opening script, the prison door's mover,
/// the on-foot Mover, the TAXICARD and the taxi service are I2's (#648); until then
/// the Movement Intent is accepted and has no effect, and nothing here claims the
/// journeys are playable.

export interface DionClock {
  readonly accumulator: number;
  readonly day: number;
  readonly seconds: number;
}

export interface DionSnapshot {
  readonly cash: string;
  readonly cell: number;
  readonly clock: DionClock;
  readonly doors: ReadonlyMap<number, DionDoorState>;
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
  readonly pitch: number;
  readonly position: readonly [number, number];
  readonly region: number;
  /// The animated sign: its buffer character and script index (`$B3F2`/`$B3F4`).
  readonly sign: { readonly code: number; readonly index: number };
  /// Ticks run since the session began.
  readonly tick: number;
}

/// The record a Mercenary III Session Resume will store. I1 reserves its identity and
/// storage (`dionRecordIdentity`) but admits no restore: restore-complete persistence
/// is I2's, so a session never accepts one yet.
export interface DionResumeRecord {
  readonly tick: number;
}

const SPACE = 0x20;
const SIGN_BUFFER = 0xb3_f2;

export class DionSession implements TitleSession<
  DionSnapshot,
  DionResumeRecord
> {
  intent: Intent = IDLE;
  private remainder = 0;
  private state: DionSnapshot;
  private readonly substeps: number;
  private readonly tickSeconds: number;
  private readonly ticksPerFrame: number;
  private readonly walkRules: WalkRules;

  constructor(
    private readonly content: DionContent,
    restore?: DionResumeRecord
  ) {
    if (restore !== undefined) {
      throw new Error(
        'Mercenary III Session Resume is reserved: restore arrives with #648'
      );
    }
    const { opening } = content.world;
    this.tickSeconds = 1 / content.presentation.ticksPerSecond.value;
    this.ticksPerFrame = content.presentation.ticksPerFrame.value;
    this.substeps = content.presentation.walkingSubsteps.value;
    // One shared step a substep at the recovered increments; MIII has no R mode.
    this.walkRules = {
      eyeHeight: opening.eye[1],
      runMultiplier: 1,
      runTurnMultiplier: 1,
      turnRadiansPerSecond: (2 * Math.PI * opening.walk.turn) / 1024,
      unitsPerSecond: opening.walk.step
    };
    this.state = {
      cash: opening.cash,
      cell: opening.cell,
      clock: {
        accumulator: opening.clock.accumulator,
        day: opening.clock.day,
        seconds: opening.clock.seconds
      },
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
  }

  get snapshot(): DionSnapshot {
    return this.state;
  }

  advance(seconds: number): DionSnapshot {
    this.remainder += Math.max(0, seconds);
    while (this.remainder + 1e-12 >= this.tickSeconds) {
      this.remainder -= this.tickSeconds;
      this.tick();
    }
    return this.state;
  }

  /// One tick: the VBL rules, then the frame if this tick ends one.
  private tick(): void {
    const { opening } = this.content.world;
    // `$53164..$531D0`: the step comes off the accumulator; at or below zero a
    // second is counted and the refill added, and the day rolls at 86,400.
    let { accumulator, day, seconds } = this.state.clock;
    accumulator -= opening.clock.step;
    while (accumulator <= 0) {
      seconds += 1;
      accumulator += opening.clock.refill;
    }
    if (seconds >= 86_400) {
      seconds -= 86_400;
      day = (day + 1) & 0xff_ff;
    }
    const tick = this.state.tick + 1;
    this.state = { ...this.state, clock: { accumulator, day, seconds }, tick };
    if (tick % this.ticksPerFrame === 0) {
      this.frame();
    }
  }

  /// One simulation frame, atomic, after the tick's VBL rules.
  private frame(): void {
    for (let substep = 0; substep < this.substeps; substep += 1) {
      this.walkSubstep();
    }
    const sign = this.signBound()
      ? this.advanceSign(this.state.sign)
      : this.state.sign;
    this.state = {
      ...this.state,
      frame: this.state.frame + 1,
      frameCounter: (this.state.frameCounter + 1) & 0xff_ff,
      sign
    };
  }

  /// One substep of the on-foot loop `$5A4C2`: the shared foot Mover (`$59A36`), then the
  /// shared region scan and eye clamp (`$5B2D2..$5B620`) in the bound structure's frame.
  ///
  /// The step and turn are MIII's recovered increments, one `walk` a substep. The original
  /// multiplies the step through its log tables by the heading's half-step sine and cosine
  /// and rounds each product into the pose; the shared step works in radians, so the half
  /// step is carried into the bearing and each axis's move is rounded to whole units.
  private walkSubstep(): void {
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
  private bound(cell: number): {
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
            this.state.doors.get(door.slot)?.openUnits === 142,
          bounds: [item.bounds.x, item.bounds.z],
          flags: item.flags
        };
      })
    };
  }

  private cellAt(eye: Vec3): number {
    const [gx, gz] = this.content.world.opening.groupOrigin;
    const x = Math.floor(eye[0] / 0x1_00_00) - gx;
    const z = Math.floor(eye[2] / 0x1_00_00) - gz;
    return (z & 15) * 16 + (x & 15);
  }

  /// `$5600C..$560B0`: the cell's token set binds the animated buffer only at `(3,0)`.
  private signBound(): boolean {
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
  private advanceSign(sign: DionSnapshot['sign']): DionSnapshot['sign'] {
    const script = this.content.world.lettering.signScript;
    const index = sign.index + 1;
    const code = script[index];
    return code === undefined || code === 0
      ? { code: script[0] ?? SPACE, index: 0 }
      : { code, index };
  }

  captureResume(): DionResumeRecord {
    return { tick: this.state.tick };
  }
}

export const dionFrameState = (snapshot: DionSnapshot): DionFrameState => ({
  cell: snapshot.cell,
  day: true,
  doors: snapshot.doors,
  driverProfile: false,
  eye: snapshot.eye,
  frameCounter: snapshot.frameCounter,
  heading: snapshot.heading,
  passenger: null,
  pitch: snapshot.pitch,
  region: snapshot.region,
  residents: new Map(),
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
    centre: { kind: 'logo' },
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
    pitch: snapshot.pitch,
    position: snapshot.position
  };
};
