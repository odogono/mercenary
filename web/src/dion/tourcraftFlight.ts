import {
  craftAdd,
  craftLongFloat,
  craftNegate,
  craftPass,
  craftSqrt,
  craftSquare,
  insideBox,
  stopPreset,
  throttleForEntry,
  type CraftConstants,
  type CraftProgram,
  type CraftState
} from '../craft/pass.ts';
import {
  enterSpace,
  land,
  landingPoint,
  spacePass,
  type SpaceState
} from '../craft/space.ts';
import type { CraftBody, CraftSlot } from '../craft/types.ts';
import { int, list, record } from './read.ts';
import { tourcraftBoxes } from './tourcraftBoxes.ts';
import type { TourcraftBody, TourcraftContent } from './tourcraftContent.ts';

/// Dion's low-frame-byte playback and unrotated Body scan over the evidenced common
/// numeric passes. R6 documents the matching cores and Dion's different callers.
/// There are no destination steering rules or frame-count transition overrides.

// Immediate operands in the aligned R6 surface/space cores. Launch is Dion's
// header initializer, rather than the Damocles reverse-throttle launch wrapper.
const CONSTANTS: CraftConstants = {
  altitudeCap: 0x5_10_00,
  altitudeScale: 0x10_00_00,
  arrivalGap: -7,
  collisionExponent: 0xff_f0,
  contact: 63,
  contactQuarter: 0x2_00_00,
  groundEye: 63,
  groundY: 64,
  landingPitch: 160,
  landingStep: -100,
  landingY: 0x1_80_00_00,
  launchGate: 100,
  launchSpeedExponent: 0xf0_00,
  launchThrottle: 0xe_f0_00,
  levelPitch: 511,
  nearestStart: 0x20_10_00,
  panelFastBound: 188,
  panelHalfLightScaled: 2_496_508,
  panelLight: 804_749_254,
  panelLightSquared: 3_871_226,
  panelLightSquaredScaled: 4_526_586,
  panelSlowBound: 32,
  panelSlowScale: 1_579_004,
  pitchMask: 1023,
  spaceAltitudeScale: 0x2_00_00,
  spaceDilationBias: 0xa_10_00,
  spaceEntry: 496,
  spaceHold: 50,
  spaceLevelPitch: 512,
  spacePitch: 511,
  spaceRangeScale: 0x10_10_00,
  spaceSpeedExponent: 16,
  spaceThrottleExponent: 14,
  spaceY: 64,
  supported: 63,
  supportEye: 63,
  swingBias: 128,
  swingHigh: 768,
  swingLow: 384,
  swingMask: 1023,
  swingStep: 16,
  takeOff: 0x4_ff_ff,
  throttleCap: 0xe_00_00,
  throttleDouble: 0x1_00_00,
  throttleDown: 0xff_ff_1f_80,
  throttleKeyBound: 68,
  throttleUp: 0x10_80,
  verticalHigh: 384,
  verticalLow: 128,
  wheeledDrop: 64,
  zero: 0xff_00_10_00
};

const bodyForPass = (body: TourcraftBody): CraftBody => ({
  extent: body.encodedSize,
  turn: 0,
  x: body.centre[0],
  y: body.centre[1],
  z: body.centre[2]
});

export interface TourcraftFlightState {
  readonly arrival: number | null;
  readonly body: number;
  readonly cabinOffset: number;
  readonly craft: CraftState;
  readonly frameWord: number;
  readonly heldControl: number;
  readonly mode: 'surface' | 'space' | 'foot';
  readonly nextAction: number;
  readonly priorPose: readonly [number, number, number];
  readonly rate: number;
  readonly space: SpaceState;
}

export class TourcraftFlight {
  state: TourcraftFlightState;
  private readonly program: CraftProgram;
  private readonly actions: readonly {
    frame: number;
    kind: string;
    value: number;
  }[];
  constructor(
    private readonly content: TourcraftContent,
    restore?: TourcraftFlightState
  ) {
    const slots: CraftSlot[] = list(
      content.craft['parameters'],
      'craft.parameters'
    ).map(v => {
      const p = record(v, 'parameters');
      return {
        class: p['slot'] === 0 ? 'space' : 'flying',
        fall: null,
        parameters: {
          ceiling: int(p['ceiling'], 'ceiling'),
          pitchStep: int(p['pitch'], 'pitch'),
          rollExponent: int(p['rollPitchExponent'], 'rollPitchExponent'),
          speedLag: int(p['lag'], 'lag', 0, 0xff_ff_ff_ff),
          thrustGain: int(p['gain'], 'gain', 0, 0xff_ff_ff_ff),
          turnAcceleration: int(
            p['acceleration'],
            'acceleration',
            0,
            0xff_ff_ff_ff
          ),
          turnDamping: int(p['damping'], 'damping', 0, 0xff_ff_ff_ff)
        },
        routine: 0,
        slot: int(p['slot'], 'slot')
      };
    });
    this.program = {
      arithmetic: content.arithmetic,
      constants: CONSTANTS,
      slots,
      throttleKeys: []
    };
    const playback = record(content.programmes['playback'], 'playback');
    this.actions = list(playback['actions'], 'actions').map(v => {
      const a = record(v, 'action');
      return {
        frame: int(a['frame'], 'frame'),
        kind: String(a['kind']),
        value: int(a['value'], 'value')
      };
    });
    const h = record(playback['header'], 'header');
    const systemEye = list(h['systemEye'], 'systemEye') as number[];
    const yaw = int(h['yaw'], 'header.yaw');
    this.state = restore ?? {
      arrival: null,
      body: 60,
      cabinOffset: 0,
      craft: {
        contact: 63,
        panelSpeed: 0,
        pitch: 511,
        roll: 0,
        speed: 0xff_f0_10_00,
        supported: 0,
        supportLevel: 0,
        swing: false,
        throttle: 0xff_f0_10_00,
        trig: { pitch: 511, yaw },
        turnRate: CONSTANTS.zero,
        x: int(h['x'], 'header.x'),
        y: 63,
        yaw,
        z: int(h['z'], 'header.z')
      },
      frameWord: 0,
      heldControl: 0,
      mode: 'surface',
      nextAction: 0,
      priorPose: [int(h['x'], 'header.x'), 63, int(h['z'], 'header.z')],
      rate: 32,
      space: {
        dilation: 32,
        hold: 0,
        nearest: 0,
        pitchRate: CONSTANTS.zero,
        range: 0x6_17_e8,
        x: systemEye[0]!,
        y: systemEye[1]!,
        z: systemEye[2]!
      }
    };
  }

  private consume(kind: string): number | null {
    const a = this.actions[this.state.nextAction];
    if (
      !a ||
      a.kind !== kind ||
      (a.frame & 255) !== (this.state.frameWord & 255)
    ) {
      return null;
    }
    this.state = { ...this.state, nextAction: this.state.nextAction + 1 };
    return a.value;
  }

  /// One original input/pass invocation. Space entry's second pass shares its
  /// frame word and ticks; the caller runs the matching interpreter reentry.
  frame(
    liveStick: number,
    service: () => void = () => {},
    collision: () => void = () => {}
  ): void {
    if (this.state.mode === 'foot') {
      return;
    }
    if (this.state.arrival !== null) {
      const b = this.content.system.bodies.find(
        b => b.offset === this.state.arrival
      )!;
      const point = landingPoint(
        this.program.arithmetic,
        this.state.space,
        bodyForPass(b),
        0
      );
      this.state = {
        ...this.state,
        arrival: null,
        body: b.offset,
        craft: land(
          this.program,
          this.state.craft,
          point,
          tourcraftBoxes(this.content, b.offset, point)
        ),
        mode: 'surface'
      };
    }
    let { cabinOffset, craft } = this.state;
    const key = this.consume('key');
    if (key !== null) {
      if (key >= 2 && key <= 11) {
        const throttle = throttleForEntry(craft, 8 + (key - 2) * 2, CONSTANTS);
        if (throttle !== undefined) {
          craft = { ...craft, swing: false, throttle };
        }
      } else if (key === 0x14) {
        craft = { ...craft, throttle: (craft.throttle + 0x1_00_00) >>> 0 };
      } else if (key === 0x39) {
        craft = { ...craft, swing: false, throttle: CONSTANTS.zero };
      } else if (key === 0x26 && craft.contact !== 0) {
        this.state = {
          ...this.state,
          craft: {
            ...stopPreset(craft, CONSTANTS),
            yaw: (craft.yaw + cabinOffset) & 65_535
          },
          mode: 'foot'
        };
        return;
      }
    }
    if (liveStick & 8) {
      cabinOffset = (cabinOffset + 16) & 65_535;
    } else if (liveStick & 4) {
      cabinOffset = (cabinOffset - 16) & 65_535;
    }
    this.state = { ...this.state, cabinOffset, craft };
    this.pass(service, collision);
    this.state = {
      ...this.state,
      frameWord: (this.state.frameWord + 1) & 65_535
    };
  }

  private pass(service: () => void, collision: () => void): void {
    const held = this.consume('stick') ?? this.state.heldControl;
    const { body } = this.state;
    let { craft, mode, space } = this.state;
    let rate = 32;
    if (mode === 'surface') {
      this.state = { ...this.state, priorPose: [craft.x, craft.y, craft.z] };
      const prior = craft;
      const priorY = craft.y;
      const boxes = tourcraftBoxes(this.content, body, craft);
      const moved = craftPass(
        this.program,
        this.program.slots[1]!,
        craft,
        held,
        boxes
      );
      craft = {
        ...moved.state,
        x: moved.state.x & 0x0f_ff_ff_ff,
        z: moved.state.z & 0x0f_ff_ff_ff
      };
      if (moved.landing) {
        throw new Error(
          'Unsupported hard touchdown outside the admitted playback route'
        );
      }
      service();
      if (insideBox(boxes, craft)) {
        const retry = craftPass(
          this.program,
          this.program.slots[1]!,
          {
            ...craft,
            speed: craftNegate(craft.speed),
            throttle: craftNegate(craft.throttle),
            x: prior.x,
            y: prior.y,
            z: prior.z
          },
          held,
          boxes
        );
        if (retry.landing) {
          throw new Error(
            'Unsupported retry touchdown outside the admitted playback route'
          );
        }
        const retried = retry.state;
        craft = {
          ...retried,
          throttle:
            ((CONSTANTS.collisionExponent << 16) |
              (retried.throttle & 65_535)) >>>
            0,
          x: retried.x & 0x0f_ff_ff_ff,
          z: retried.z & 0x0f_ff_ff_ff
        };
        collision();
      }
      if (priorY >>> 16 >= CONSTANTS.spaceEntry) {
        const entered = enterSpace(
          this.program,
          craft,
          space,
          bodyForPass(this.content.system.bodies.find(b => b.offset === body)!)
        );
        craft = entered.craft;
        space = entered.space;
        mode = 'space';
        this.state = {
          ...this.state,
          body: -1,
          craft,
          heldControl: held,
          mode,
          rate,
          space
        };
        // Recovered zero-tick loop reentry, with no new live input delivery.
        this.pass(service, collision);
        return;
      }
    } else {
      const moved = spacePass(
        this.program,
        this.program.slots[0]!,
        craft,
        space,
        held
      );
      craft = {
        ...moved.craft,
        panelSpeed: moved.craft.panelSpeed >>> 0,
        x: moved.craft.x >>> 0,
        y: moved.craft.y >>> 0,
        z: moved.craft.z >>> 0
      };
      space = {
        ...moved.space,
        x: moved.space.x >>> 0,
        y: moved.space.y >>> 0,
        z: moved.space.z >>> 0
      };
      rate = space.dilation;
      let range = CONSTANTS.nearestStart;
      let nearest = space.nearest;
      for (const i of this.content.system.spaceScan) {
        const b = this.content.system.bodies[i]!;
        if (b.centre[1] < 0) {
          continue;
        }
        const squares = [0, 1, 2].map(axis =>
          craftSquare(
            this.program.arithmetic,
            craftLongFloat(b.centre[axis]! - [space.x, space.y, space.z][axis]!)
          )
        );
        const length = craftSqrt(
          this.program.arithmetic,
          craftAdd(craftAdd(squares[0]!, squares[1]!), squares[2]!)
        );
        if (((length - range) | 0) < 0) {
          range = length;
          nearest = b.offset;
        }
      }
      if (space.hold !== 0) {
        space = { ...space, hold: space.hold - 1 };
      } else if (nearest !== 0) {
        const b = this.content.system.bodies.find(b => b.offset === nearest)!;
        if ((range >>> 16) - (b.encodedSize >>> 16) < CONSTANTS.arrivalGap) {
          this.state = { ...this.state, arrival: b.offset };
        }
      }
      space = { ...space, nearest, range };
    }
    craft = { ...craft, trig: { pitch: craft.pitch, yaw: craft.yaw } };
    this.state = {
      ...this.state,
      body,
      craft,
      heldControl: held,
      mode,
      rate,
      space
    };
  }
}
