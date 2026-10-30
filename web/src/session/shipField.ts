import type { EndgameInterstellarShipField } from '../payload/documents.ts';
import type { EndingPhase } from './ending.ts';
import { stepReferencePrng } from './referencePrng.ts';

/// The Interstellar Ship Field: the 21 points craft slot 7's handler shows for
/// the whole of the Escape Ending.
///
/// This is Session State rather than presentation, for two reasons that both
/// come out of the decode. The terminal phase's move from 1 to 255 is written by
/// this field's own colour sequence, on the loop the sequence reaches its last
/// pair — so the field decides when the Ending matures. And a Save taken during
/// the terminal presentation has to continue it exactly, which means the point
/// components, both generations of projected position, the colour delay and
/// index, the depth delta and the shared generator's two bytes all have to
/// survive a restore. A renderer-owned animation could satisfy neither.
///
/// `notes/decode/escape-starfield.md` is the authority for everything here.
///
/// Three details the decode does not pin, chosen once and named so they can be
/// corrected against a future observation rather than rediscovered:
///
///  - **Byte order within a respawn's 24-bit source.** The note fixes the range
///    and says Y reuses "the `$07` residue left by X conversion, which derives
///    from draw 1". Reading the first draw as the low byte and the third as the
///    masked high byte is the only order that makes that sentence true, so that
///    is the order used.
///  - **Carry between the seven draws.** The generator is carry-sensitive and
///    the note fixes only the carry the respawn is *entered* with, which is set.
///    Each draw here passes its carry to the next, which is what a run of
///    consecutive calls does absent code between them that touches the flag.
///  - **Native multiplication's mantissa rounding.** The delta is accumulated in
///    exact arithmetic rather than through a re-normalised mantissa byte each
///    loop, because the note gives the multipliers and the exponent the delta
///    stops at but not the rounding rule of the multiply. Choosing a rule would
///    invent a fact; the stated ones are all honoured.

export interface ShipFieldSeed {
  readonly state: number;
  readonly value: number;
}

export interface ShipFieldPoint {
  readonly x: number;
  readonly y: number;
}

/// The pair in force this loop: the colour the points are drawn in, and the
/// colour behind them.
export interface ShipFieldColourPair {
  readonly line: number;
  readonly screen: number;
}

/// What one respawn drew, exposed so the coupling between the axes can be
/// asserted rather than taken on trust.
export interface ShipFieldRespawn {
  readonly draws: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/// The continuation boundary, as the decode names it.
export interface ShipFieldSaveSnapshot {
  readonly colourDelay: number;
  readonly colourIndex: number;
  readonly components: readonly {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }[];
  readonly current: readonly ShipFieldPoint[];
  readonly depthDelta: number;
  readonly loop: number;
  /// Seconds into the next loop.
  readonly loopSeconds: number;
  readonly matured: boolean;
  readonly prior: readonly ShipFieldPoint[];
  readonly random: ShipFieldSeed;
}

const BYTE = 0xff;

const RESPAWN_ATTEMPT_LIMIT = 64;

interface Component {
  x: number;
  y: number;
  z: number;
}

/// The exponent byte an engine float of this magnitude and sign would carry:
/// the octave two places up, with the sign in bit 0. The delta's own exponent
/// byte is what the acceleration stops climbing at.
const exponentByte = (value: number): number => {
  const octave = Math.floor(Math.log2(Math.abs(value)));
  return ((octave << 2) & BYTE) | (value < 0 ? 1 : 0);
};

/// One respawned axis: a signed 24-bit source, high byte masked and offset so
/// the span is centred on zero.
const signedAxis = (
  high: number,
  middle: number,
  low: number,
  rules: { readonly highMask: number; readonly highOffset: number }
): number =>
  (((high & rules.highMask) + rules.highOffset) << 16) | ((middle << 8) | low);

export class InterstellarShipField {
  private readonly rules: EndgameInterstellarShipField;
  private readonly components: Component[];
  private colourDelay: number;
  private colourIndex: number;
  private current: ShipFieldPoint[];
  private delta: number;
  private loop: number;
  private loopSeconds: number;
  private matured: boolean;
  private prior: ShipFieldPoint[];
  private random: ShipFieldSeed;

  private constructor(
    rules: EndgameInterstellarShipField,
    state: ShipFieldSaveSnapshot
  ) {
    this.rules = rules;
    this.colourDelay = state.colourDelay;
    this.colourIndex = state.colourIndex;
    this.components = state.components.map(component => ({ ...component }));
    this.current = [...state.current];
    this.delta = state.depthDelta;
    this.loop = state.loop;
    this.loopSeconds = state.loopSeconds;
    this.matured = state.matured;
    this.prior = [...state.prior];
    this.random = { ...state.random };
  }

  /// Enter the field, as the handler does on the loop after script 7's write.
  ///
  /// Entry primes every depth negative and clears the screen once, then runs the
  /// update pass before anything is drawn. Every slot fails the depth test on
  /// that pass, so the first visible loop shows 21 freshly respawned points and
  /// never the primed workspace.
  static begin(
    rules: EndgameInterstellarShipField,
    seed: ShipFieldSeed
  ): InterstellarShipField {
    const slots = rules.pointSlots.count;
    const primed: ShipFieldPoint = { x: 1, y: 1 };
    const field = new InterstellarShipField(rules, {
      colourDelay: rules.colours.entryDelayLoops,
      colourIndex: 0,
      components: Array.from({ length: slots }, () => ({ x: 0, y: 0, z: -1 })),
      current: Array.from({ length: slots }, () => primed),
      depthDelta: rules.motion.scriptedPhaseDepthDelta,
      loop: 0,
      loopSeconds: 0,
      matured: false,
      prior: Array.from({ length: slots }, () => primed),
      random: seed
    });
    field.updateProjectRespawn();
    return field;
  }

  static restore(
    rules: EndgameInterstellarShipField,
    state: ShipFieldSaveSnapshot
  ): InterstellarShipField {
    return new InterstellarShipField(rules, state);
  }

  /// The field animates at the native terminal loop's own rate.
  static readonly loopsPerSecond = 50;

  /// Runs as many loops as `seconds` brings due, carrying the rest of one
  /// (ADR 0083). Each loop reads the Ending Phase afresh and hands on any
  /// phase it writes; it stops once the phase is no longer the Escape's.
  advance(
    seconds: number,
    phase: () => EndingPhase | undefined,
    write: (phase: number) => void
  ): void {
    const loopSeconds = 1 / InterstellarShipField.loopsPerSecond;
    this.loopSeconds += seconds;
    while (this.loopSeconds >= loopSeconds - 1e-9) {
      this.loopSeconds = Math.max(0, this.loopSeconds - loopSeconds);
      const now = phase();
      if (now === undefined) {
        return;
      }
      const written = this.step(now).phaseWrite;
      if (written !== undefined) {
        write(written);
      }
    }
  }

  /// One native terminal loop, in the decoded order: advance the colour
  /// sequence when its delay has expired, then update, project or respawn every
  /// point. Erasing and drawing sit between those two and change no state a
  /// caller can see, because the browser redraws its frame rather than clearing
  /// pixels one at a time.
  ///
  /// Returns the Ending Phase the colour sequence wrote, if it wrote one. That
  /// is the only way the phase reaches 255.
  step(phase: EndingPhase): { readonly phaseWrite?: number } {
    this.loop++;
    const written = this.stepColours();
    this.accelerate(phase);
    this.updateProjectRespawn();
    return written === null ? {} : { phaseWrite: written };
  }

  get colourPair(): ShipFieldColourPair {
    const event = this.rules.colours.events[this.colourIndex];
    return {
      line: event?.lineColour ?? 0,
      screen: event?.screenColour ?? 0
    };
  }

  /// The 21 points to draw, in Reference Viewport coordinates.
  get points(): readonly ShipFieldPoint[] {
    return this.current;
  }

  get depthDelta(): number {
    return this.delta;
  }

  /// One slot's depth, for tests that watch the motion rather than the picture.
  depthOf(slot: number): number {
    return this.components[slot]?.z ?? 0;
  }

  captureSaveSnapshot(): ShipFieldSaveSnapshot {
    return {
      colourDelay: this.colourDelay,
      colourIndex: this.colourIndex,
      components: this.components.map(component => ({ ...component })),
      current: [...this.current],
      depthDelta: this.delta,
      loop: this.loop,
      loopSeconds: this.loopSeconds,
      matured: this.matured,
      prior: [...this.prior],
      random: { ...this.random }
    };
  }

  /// Draw one respawn from a given generator state, without disturbing the
  /// field. Present so the seven draws and the coupling between the axes can be
  /// asserted directly.
  respawnedFrom(seed: ShipFieldSeed & { readonly carryIn: number }): {
    readonly draws: number;
  } & Component {
    const kept = this.random;
    this.random = { state: seed.state, value: seed.value };
    const drawn = this.respawn(seed.carryIn);
    this.random = kept;
    return { draws: this.rules.respawn.randomDraws, ...drawn };
  }

  /// The colour sequence: hold the first pair for the entry delay, then step
  /// every three loops. The index stops at the last pair, so each later expiry
  /// reapplies that pair — and rewrites the phase it carries.
  private stepColours(): number | null {
    this.colourDelay--;
    if (this.colourDelay > 0) {
      return null;
    }
    this.colourDelay = this.rules.colours.repeatedDelayLoops;
    const last = this.rules.colours.events.length - 1;
    if (this.colourIndex < last) {
      this.colourIndex++;
    }
    return this.rules.colours.events[this.colourIndex]?.phaseWrite ?? null;
  }

  /// The depth delta, which the mature phase accelerates. The phase is read by
  /// its sign, which is why 255 and not 1 selects the accelerating branch.
  private accelerate(phase: EndingPhase): void {
    const signed = phase >= 0x80 ? phase - 0x1_00 : phase;
    if (signed >= 0) {
      return;
    }
    if (
      exponentByte(this.delta) >= this.rules.motion.maturePhaseStopsAtExponent
    ) {
      return;
    }
    this.delta *= this.matured
      ? this.rules.motion.maturePhaseLaterMultiplier
      : this.rules.motion.maturePhaseFirstMultiplier;
    this.matured = true;
  }

  /// Every pass covers all 21 slots, and each one ends up somewhere drawable:
  /// the decode's first visible loop "draws 21 newly respawned, projected
  /// slots". A respawn can land outside the bounds it was respawned for, and the
  /// decode does not say what the handler does about that, so the slot is drawn
  /// again until it projects — which keeps the stated property true without
  /// inventing a wrap or a hidden clamp.
  private updateProjectRespawn(): void {
    this.prior = this.current;
    this.current = this.components.map(component => {
      component.z += this.delta;
      let point = this.project(component);
      // Bounded, because this runs inside the frame loop: the generator always
      // advances, so a slot converges in a handful of draws, and a run this long
      // means the projection or the draw ranges have stopped agreeing with the
      // decode. Better to say so than to hang the page.
      for (let attempt = 0; point === undefined; attempt++) {
        if (attempt >= RESPAWN_ATTEMPT_LIMIT) {
          throw new Error(
            `Interstellar Ship Field could not place a point in ${RESPAWN_ATTEMPT_LIMIT} respawns`
          );
        }
        point = this.project(this.replace(component));
      }
      return point;
    });
  }

  /// Divide by the updated depth and centre. A negative depth, or either axis
  /// leaving its bound, sends the slot back for a respawn. The decode also names
  /// a float-to-screen overflow, which is a strictly narrower case than the
  /// bound it would have to pass through, so it needs no separate arm.
  private project(component: Component): ShipFieldPoint | undefined {
    if (component.z <= 0) {
      return undefined;
    }
    const { horizontal, vertical } = this.rules.projection;
    const x = Math.floor(horizontal.centre + component.x / component.z);
    const y = Math.floor(vertical.centre + component.y / component.z);
    if (x < horizontal.range[0] || x >= horizontal.range[1]) {
      return undefined;
    }
    if (y < vertical.range[0] || y >= vertical.range[1]) {
      return undefined;
    }
    return { x, y };
  }

  /// A respawn keeps the slot and replaces what is in it.
  private replace(component: Component): Component {
    const drawn = this.respawn(1);
    component.x = drawn.x;
    component.y = drawn.y;
    component.z = drawn.z;
    return component;
  }

  /// Seven consecutive draws. X takes the first three as a signed 24-bit
  /// source, Y takes the next three but throws the first of them away and
  /// reuses the residue X's first draw left behind as its own low byte, and Z
  /// takes the seventh onto its decoded grid.
  private respawn(carryIn: number): Component {
    const { x: xr, y: yr, z: zr } = this.rules.respawn;
    let carry = carryIn;
    const draws: number[] = [];
    for (let draw = 0; draw < this.rules.respawn.randomDraws; draw++) {
      const stepped = stepReferencePrng({
        carryIn: carry,
        state: this.random.state,
        value: this.random.value
      });
      draws.push(stepped.output);
      carry = stepped.carry;
      this.random = { state: stepped.state, value: stepped.value };
    }
    const low = draws[0] ?? 0;
    return {
      x: signedAxis(draws[2] ?? 0, draws[1] ?? 0, low, xr),
      y: signedAxis(draws[5] ?? 0, draws[4] ?? 0, low, yr),
      z: zr.range[0] + (draws[6] ?? 0) * zr.step
    };
  }
}
