import type { Vector3 } from '../orientation/index.ts';
import {
  normalise,
  toViewDirection,
  type FrameLighting,
  type ViewOrientation
} from '../rendering/lighting.ts';
import type { ErisPresentationDocument } from './documents.ts';
import type { SkyItem } from './sky.ts';

export { lightMatrix } from '../rendering/lighting.ts';
export type {
  Channels,
  FrameLighting as ErisLighting,
  ViewOrientation,
  ShadowWindow
} from '../rendering/lighting.ts';

const channels = (colour: string): readonly [number, number, number] => [
  Number.parseInt(colour.slice(1, 3), 16) / 255,
  Number.parseInt(colour.slice(3, 5), 16) / 255,
  Number.parseInt(colour.slice(5, 7), 16) / 255
];

/// The Body that gives Sunlight: `$00` in a draw list, the sky pass's `dialis`.
const SUN_ID = 'dialis';

/// The elevation over which Sunlight fades in as DIALIS rises, and out as it sets.
export const SUNLIGHT_FADE_DEGREES = 2;

/// The Sunlight of one frame: the direction toward DIALIS in the Body's surface frame, x east,
/// y up and z north as the sky offsets are, and how strong it is from 0 to 1.
export interface Sunlight {
  readonly direction: Vector3;
  readonly strength: number;
}

export interface SunlightInputs {
  /// The terminator's answer (`$7A4E`), which also chooses the palette half.
  readonly daylight: boolean;
  /// Whether the eye is in an Enclosed Region, where none of the outdoor world is drawn.
  readonly enclosed: boolean;
  /// The sky pass's Bodies, where DIALIS is placed exactly as the sky draws it. A Destroyed
  /// DIALIS is absent from them.
  readonly sky: readonly SkyItem[];
}

const smoothstep = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/// DIALIS's light for the frame, or null where there is none: by night, inside an Enclosed
/// Region, while DIALIS is destroyed, and while it stands below the horizon. The terminator
/// switches a few seconds after DIALIS crosses the horizon, so the two together keep the sun
/// from ever lighting a night palette or lighting from below the ground.
export const sunlight = (inputs: SunlightInputs): Sunlight | null => {
  if (!inputs.daylight || inputs.enclosed) {
    return null;
  }
  const sun = inputs.sky.find(item => item.id === SUN_ID);
  if (sun === undefined) {
    return null;
  }
  const direction = normalise(sun.offset);
  const elevationDegrees = (Math.asin(direction.y) * 180) / Math.PI;
  const strength = smoothstep(elevationDegrees / SUNLIGHT_FADE_DEGREES);
  return strength > 0 ? { direction, strength } : null;
};

/// One step of the engine's Body turn, 1/1024 of a turn, as an angle the sun moves through.
const SUN_STEP_RADIANS = (2 * Math.PI) / 1024;

let heldSun: Vector3 | undefined;

/// #380 prototype: the Sunlight with its direction held still until DIALIS has moved a whole
/// 1/1024-turn step, so the shadow map's texel grid stands still between steps.
export const steppedSun = (sun: Sunlight): Sunlight => {
  const d = sun.direction;
  if (heldSun !== undefined) {
    const cosine = d.x * heldSun.x + d.y * heldSun.y + d.z * heldSun.z;
    if (Math.acos(Math.min(1, cosine)) < SUN_STEP_RADIANS) {
      return { direction: heldSun, strength: sun.strength };
    }
  }
  heldSun = d;
  return sun;
};

/// The frame's lighting under the given Sunlight. The ambient pair is neutral in the document,
/// so a face Sunlight does not reach shows its recovered colour, and Sunlight only brightens.
export const erisLighting = (
  doc: ErisPresentationDocument,
  view: ViewOrientation,
  sun: Sunlight
): FrameLighting => {
  const sunWorld = normalise(sun.direction);
  const [r, g, b] = channels(doc.lighting.sunColour);
  return {
    ambientGround: channels(doc.lighting.ambientGround),
    ambientSky: channels(doc.lighting.ambientSky),
    sunColour: [r * sun.strength, g * sun.strength, b * sun.strength],
    sunView: toViewDirection(sunWorld, view),
    sunWorld
  };
};
