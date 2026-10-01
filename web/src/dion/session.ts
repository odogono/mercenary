import { IDLE, type Intent } from '../gameCore/index.ts';
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
  private readonly tickSeconds: number;
  private readonly ticksPerFrame: number;

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
