/// Structural inputs to the independently recovered common numeric passes (ADR 0074).
export interface DetailBox {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}
/**
 * The two box lists the cell bind `$053AF0` copies to `$CB88` (#550, #556). `supports` are the
 * seven-word groups, which the refusal test `$0590AE` and the support search `$0583EA` both
 * read, with the tag word the search stores as the support level. `walls` are the six-word
 * groups, which only the refusal test reads. The bind multiplies X and Z by the structure's
 * scale, adds the intra-cell origin and swaps a pair under a negative scale; Y is taken as is.
 */
export interface DetailBoxes {
  readonly supports: readonly (DetailBox & { readonly tag: number })[];
  readonly walls: readonly DetailBox[];
}
export type CraftClass = 'fall' | 'flying' | 'space' | 'wheeled';
/**
 * The seven words the craft pass reads through `a0`, as the table holds them. The four
 * floats are raw longs in the program's number system: a signed exponent word over a signed
 * mantissa word in units of `$1000` (ADR 0051).
 */
export interface CraftParameters {
  readonly ceiling: number;
  readonly pitchStep: number;
  readonly rollExponent: number;
  readonly speedLag: number;
  readonly thrustGain: number;
  readonly turnAcceleration: number;
  readonly turnDamping: number;
}
/** The four words the slot-9 fall `$057D64` reads instead. */
export interface CraftFall {
  readonly pitchStep: number;
  readonly tumbleStep: number;
  readonly yawStep: number;
  readonly yStep: number;
}
export interface CraftSlot {
  readonly class: CraftClass;
  readonly fall: CraftFall | null;
  readonly parameters: CraftParameters | null;
  readonly routine: number;
  readonly slot: number;
}
/** Every craft pass constant the Catalogue publishes, named for what the pass does with it. */
export const CRAFT_PASS_CONSTANTS = [
  'altitudeCap',
  'altitudeScale',
  'arrivalGap',
  'collisionExponent',
  'contact',
  'contactQuarter',
  'groundEye',
  'groundY',
  'landingPitch',
  'landingStep',
  'landingY',
  'launchGate',
  'launchSpeedExponent',
  'launchThrottle',
  'levelPitch',
  'nearestStart',
  'panelFastBound',
  'panelHalfLightScaled',
  'panelLight',
  'panelLightSquared',
  'panelLightSquaredScaled',
  'panelSlowBound',
  'panelSlowScale',
  'pitchMask',
  'spaceAltitudeScale',
  'spaceDilationBias',
  'spaceEntry',
  'spaceHold',
  'spaceLevelPitch',
  'spacePitch',
  'spaceRangeScale',
  'spaceSpeedExponent',
  'spaceThrottleExponent',
  'spaceY',
  'supportEye',
  'supported',
  'swingBias',
  'swingHigh',
  'swingLow',
  'swingMask',
  'swingStep',
  'takeOff',
  'throttleCap',
  'throttleDouble',
  'throttleDown',
  'throttleKeyBound',
  'throttleUp',
  'verticalHigh',
  'verticalLow',
  'wheeledDrop',
  'zero'
] as const;
export type CraftConstant = (typeof CRAFT_PASS_CONSTANTS)[number];
export interface CraftBody {
  readonly extent: number;
  /// `$62EA`: the rotation accumulator as the first world holds it, an unsigned long.
  readonly turn: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
