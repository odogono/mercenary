import type { DoorwayRules } from '../payload/documents.ts';
import {
  hostRoom,
  isCarried,
  type Residence,
  type Room
} from '../world/index.ts';

/// The colours a frame is drawn with, and how a Room looks right now.
///
/// This is not the projection: nothing here moves a point. It is here because a projection
/// Golden Trace records the backdrop alongside the lines — a horizon in the wrong place or a
/// Room lit when it should be dark is not a line-list problem, and the trace pins it either
/// way. The palette tables come with it because the demo page has to draw those colours and
/// there is no sense in a second, hardcoded copy of them.
///
/// `GameplaySession` asks for an `IndoorScene`; what lives here is the resolution rule itself,
/// which both renderers ask and which must not differ between them.
///
/// Room records retain the Reference Build's colour indices, but Enhanced presentation resolves
/// them through the Atari ST-inspired table below. The C64 table remains for Authentic Rooms and
/// recovered presentation sequences whose values really are C64 palette indices.

/// An eight-bit sRGB colour, as both renderers name it.
export interface RGB8 {
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}

const rgb = (red: number, green: number, blue: number): RGB8 => ({
  blue,
  green,
  red
});

/// Intentional Atari ST-inspired presentation colours sampled from the overhead airstrip
/// reference. These are not decoded C64 colours.
export const ScenePalette = {
  blackInk: rgb(0x00, 0x00, 0x00),
  distantInk: rgb(0xa0, 0xa0, 0xa0),
  ground: rgb(0x00, 0x80, 0x00),
  sky: rgb(0x60, 0xa0, 0xe0),
  whiteInk: rgb(0xff, 0xff, 0xff)
} as const;

/// Atari ST-inspired equivalents for the sixteen colour names used by Room records. Values are
/// sampled from the ST presentation: its low-resolution palette uses channel steps of `$20`, and
/// unlike the C64 bitmap clear it presents a Room as a solid field.
export const ATARI_ST_PALETTE: readonly RGB8[] = [
  rgb(0x00, 0x00, 0x00),
  rgb(0xe0, 0xe0, 0xe0),
  rgb(0xe0, 0x40, 0x40),
  rgb(0x00, 0xe0, 0xc0),
  rgb(0xe0, 0x40, 0x80),
  rgb(0x00, 0x80, 0x60),
  rgb(0x00, 0x00, 0x40),
  rgb(0xe0, 0xa0, 0x00),
  rgb(0xa0, 0x40, 0x00),
  rgb(0x60, 0x00, 0x00),
  rgb(0xe0, 0x80, 0x80),
  rgb(0x40, 0x40, 0x40),
  rgb(0xa0, 0xa0, 0xa0),
  rgb(0x00, 0xc0, 0xa0),
  rgb(0x60, 0x80, 0xe0),
  rgb(0xc0, 0xc0, 0xc0)
];

export const atariSTColour = (index: number): RGB8 | undefined =>
  ATARI_ST_PALETTE[index];

/// The local VICE 3.8 C64 PAL palette used to produce the reference captures.
export const C64_PALETTE: readonly RGB8[] = [
  rgb(0x00, 0x00, 0x00),
  rgb(0xff, 0xff, 0xff),
  rgb(0xab, 0x3c, 0x65),
  rgb(0x87, 0xf0, 0xcb),
  rgb(0xb2, 0x3d, 0xef),
  rgb(0x5e, 0xd6, 0x38),
  rgb(0x3a, 0x31, 0xff),
  rgb(0xff, 0xff, 0x3b),
  rgb(0xb7, 0x64, 0x18),
  rgb(0x81, 0x4c, 0x00),
  rgb(0xea, 0x79, 0xa3),
  rgb(0x62, 0x62, 0x62),
  rgb(0x94, 0x94, 0x94),
  rgb(0xb2, 0xff, 0x8d),
  rgb(0x81, 0x78, 0xff),
  rgb(0xcd, 0xcd, 0xcd)
];

export const c64Colour = (index: number): RGB8 | undefined =>
  C64_PALETTE[index];

/// The width recorded by projection Golden Traces for the Reference Build's decoded indoor
/// bitmap. Enhanced presentation replaces that texture with the solid Atari ST colour.
export const INDOOR_BACKDROP_COLUMNS = 320;

/// The Reference Build clears an indoor bitmap with `$AA`: foreground bit first, then
/// background, alternating through all 320 bitmap columns. Authentic presentation retains it.
export class IndoorBackdrop {
  static readonly columnCount = INDOOR_BACKDROP_COLUMNS;
  readonly background: RGB8;
  readonly foreground: RGB8;

  constructor(background: number, foreground: number) {
    this.background = c64Colour(background) ?? ScenePalette.blackInk;
    this.foreground = c64Colour(foreground) ?? ScenePalette.whiteInk;
  }

  colorAtColumn(column: number): RGB8 | undefined {
    if (column < 0 || column >= IndoorBackdrop.columnCount) {
      return undefined;
    }
    return column % 2 === 0 ? this.foreground : this.background;
  }
}

/// How the Room the player is in looks right now.
///
/// A session fact rather than a property of the Room: darkness depends on where the photon
/// emitter is, which changes during play.
export interface IndoorScene {
  /// The two colours the indoor backdrop alternates between.
  readonly background: number;
  /// Whether the Room is dark *now*. Nothing is drawn in a dark Room; the three colours are
  /// all zero, which is the Reference Build's own way of saying it.
  readonly dark: boolean;
  readonly foreground: number;
  /// The colour the Room's wireframe is drawn in. Global in the Reference Build — every Room
  /// setup stores the same value — which is why no Room carries it.
  readonly lineColour: number;
}

/// How a Room looks, given where the photon emitter has got to.
///
/// A Room the payload marks dark is dark unless the emitter is in the player's hands or lying
/// in that same Room. Darkness zeroes all three colours together.
export const indoorScene = (
  room: Room,
  rules: DoorwayRules,
  emitter: Residence
): IndoorScene => {
  const lit = isCarried(emitter) || hostRoom(emitter) === room.id;
  if (room.dark && !lit) {
    return { background: 0, dark: true, foreground: 0, lineColour: 0 };
  }
  return {
    background: room.palette.background,
    dark: false,
    foreground: room.palette.foreground,
    lineColour: rules.lineColour
  };
};
