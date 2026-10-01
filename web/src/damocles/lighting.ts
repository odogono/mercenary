import {
  normalise,
  toViewDirection,
  type FrameLighting,
  type ViewOrientation
} from '../rendering/lighting.ts';
import type { ErisPresentationDocument } from './documents.ts';

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

export const erisLighting = (
  doc: ErisPresentationDocument,
  view: ViewOrientation
): FrameLighting => {
  const sunWorld = normalise(doc.lighting.sunDirection);
  return {
    ambientGround: channels(doc.lighting.ambientGround),
    ambientSky: channels(doc.lighting.ambientSky),
    sunColour: channels(doc.lighting.sunColour),
    sunView: toViewDirection(sunWorld, view),
    sunWorld
  };
};
