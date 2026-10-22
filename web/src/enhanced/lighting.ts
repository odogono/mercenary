import type { Vector3 } from '../orientation/index.ts';
import {
  normalise,
  toViewDirection,
  type Channels,
  type FrameLighting,
  type ViewOrientation
} from '../rendering/lighting.ts';
import type { SkyItem } from './sky.ts';

/// Sunlight and its Cast Shadows for every Title the Enhanced planner draws (ADR 0066, #803).

export type {
  Channels,
  FrameLighting as SceneLighting,
  ViewOrientation
} from '../rendering/lighting.ts';

const channels = (colour: string): readonly [number, number, number] => [
  Number.parseInt(colour.slice(1, 3), 16) / 255,
  Number.parseInt(colour.slice(3, 5), 16) / 255,
  Number.parseInt(colour.slice(5, 7), 16) / 255
];

/// The elevation over which Sunlight fades in as the sun rises, and out as it sets.
export const SUNLIGHT_FADE_DEGREES = 2;

/// The Sunlight of one frame: the direction toward the sun in the Body's surface frame, x east,
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
  /// The sky pass's Bodies, where the sun is placed exactly as the sky draws it. A Destroyed
  /// sun is absent from them.
  readonly sky: readonly SkyItem[];
  /// The sky item that gives Sunlight: Damocles's DIALIS, `$00` in a draw list.
  readonly sun: string;
}

const smoothstep = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/// The sun's light for the frame, or null where there is none: by night, inside an Enclosed
/// Region, while the sun is destroyed, and while it stands below the horizon. The terminator
/// switches a few seconds after the sun crosses the horizon, so the two together keep the sun
/// from ever lighting a night palette or lighting from below the ground.
export const sunlight = (inputs: SunlightInputs): Sunlight | null => {
  if (!inputs.daylight || inputs.enclosed) {
    return null;
  }
  const sun = inputs.sky.find(item => item.id === inputs.sun);
  if (sun === undefined) {
    return null;
  }
  const direction = normalise(sun.offset);
  const elevationDegrees = (Math.asin(direction.y) * 180) / Math.PI;
  const strength = smoothstep(elevationDegrees / SUNLIGHT_FADE_DEGREES);
  return strength > 0 ? { direction, strength } : null;
};

/// The player's share of the ambient pair and of the Sunlight a Cast Shadow takes away, each
/// from 0 to 1; a shadow depth past 1 takes that share of the ambient fill from a Cast Shadow too.
export interface LightLevels {
  readonly ambient: number;
  readonly shadowDepth: number;
}

/// The presentation's light colours: the Sunlight at full strength and the neutral ambient pair.
export interface LightingColours {
  readonly ambientGround: string;
  readonly ambientSky: string;
  readonly sunColour: string;
}

export const FULL_LIGHT_LEVELS: LightLevels = { ambient: 1, shadowDepth: 1 };

const scaled = (colour: string, by: number): Channels => {
  const [r, g, b] = channels(colour);
  return [r * by, g * by, b * by];
};

/// The frame's lighting under the given Sunlight. The ambient pair is neutral in the document,
/// so at full levels a face Sunlight does not reach shows its recovered colour, and Sunlight
/// only brightens. A lower ambient level darkens every face out of the Sunlight, Cast Shadows
/// with them; a lower shadow depth lets some Sunlight through a Cast Shadow.
export const sceneLighting = (
  colours: LightingColours,
  view: ViewOrientation,
  sun: Sunlight,
  levels: LightLevels = FULL_LIGHT_LEVELS
): FrameLighting => {
  const sunWorld = normalise(sun.direction);
  const [r, g, b] = channels(colours.sunColour);
  return {
    ambientGround: scaled(colours.ambientGround, levels.ambient),
    ambientSky: scaled(colours.ambientSky, levels.ambient),
    shadowDepth: levels.shadowDepth,
    sunColour: [r * sun.strength, g * sun.strength, b * sun.strength],
    sunView: toViewDirection(sunWorld, view),
    sunWorld
  };
};
