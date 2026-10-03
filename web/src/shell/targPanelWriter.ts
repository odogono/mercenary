import type { PanelViewModel } from './panel.ts';
import { PanelPlanes, panelRgba, type PanelImage } from './panelPixels.ts';
import type { TargPanelDocument } from './targPanelDocument.ts';

/// Synthetic native presentation inputs, never C64 session raw words.
export interface TargPanelReadouts {
  readonly altitude: string;
  readonly headingWord: number;
  readonly lamps: {
    readonly altitude: number;
    readonly location: number;
    readonly speed: number;
  };
  readonly location: string;
  readonly locationNegative?: readonly [boolean, boolean];
  readonly message: string;
  readonly messageColour?: number;
  readonly pitchWord: number;
  readonly speed: string;
}
type Model = Pick<
  PanelViewModel,
  | 'altitude'
  | 'compassDegrees'
  | 'elevationDegrees'
  | 'groundLamp'
  | 'altitudeLamp'
  | 'runLamp'
  | 'locationLabel'
  | 'message'
  | 'speed'
> &
  Partial<Pick<PanelViewModel, 'messageColour'>>;
const bounded = (text: string, width: number): string =>
  text.length > width ? '*'.repeat(width) : text.padStart(width, '0');

/// Authored C64 adapter (ADR 0072): preserve #715's bearings and nose-up pitch,
/// using the descending compass and 1024 tape units per turn and level at 512. Retain altitude /256 and
/// whole speed units; neither reproduces ST state evolution or raw-word units.
export const targPanelReadouts = (model: Model): TargPanelReadouts => ({
  altitude: bounded(model.altitude, 5),
  headingWord: Math.round((-model.compassDegrees * 1024) / 360) & 0x3_ff,
  lamps: {
    altitude: model.altitudeLamp ? 5 : 15,
    location: model.groundLamp ? 5 : 15,
    speed: model.runLamp ? 4 : 15
  },
  location: /^RM \d+$/.test(model.locationLabel)
    ? `${bounded(model.locationLabel.slice(3), 2)}-**`
    : model.locationLabel,
  message: model.message.toUpperCase().slice(0, 23).padEnd(23, ' '),
  ...(model.messageColour === undefined
    ? {}
    : { messageColour: model.messageColour }),
  pitchWord: Math.round(512 - (model.elevationDegrees * 1024) / 360) & 0x3_ff,
  speed:
    model.speed === '*****'
      ? '*****'
      : `${model.speed.startsWith('-') ? '-' : '+'}${bounded(model.speed.slice(1), 4)}`
});
const slot = (word: number): number =>
  (Math.floor(((word & 0x3_ff) * 576) / 1024) + 561) % 576;

/// Compose afresh: native writers replace individual planes and preserve frame
/// pixels in the other planes. Targ's geometry remains separate from other Titles.
export const drawTargPanel = (
  doc: TargPanelDocument,
  view: TargPanelReadouts
): PanelImage => {
  const pixels = doc.art.slice();
  const planes = new PanelPlanes(pixels);
  const glyph = (
    name: string,
    character: string,
    x: number,
    y: number,
    plane: number
  ): void => {
    const font = doc.fonts.get(name)!;
    const rows =
      font.glyphs.get(character) ??
      font.glyphs.get(name === 'number' ? '*' : '?')!;
    rows.forEach((row, dy) =>
      [...row].forEach((bit, dx) =>
        planes.set(x + dx, y + dy, plane, bit === '1')
      )
    );
  };
  const number = (text: string, cells: readonly number[]): void => {
    cells.forEach((x, index) => glyph('number', text[index] ?? '*', x, 149, 2));
  };
  number(view.altitude, [144, 152, 160, 168, 176]);
  number(view.speed, [216, 224, 232, 240, 248]);
  // The separator already exists in the disk art; native writers touch axes only.
  number(view.location.slice(0, 2), [72, 80]);
  number(view.location.slice(3, 5), [96, 104]);
  [72, 80, 96, 104].forEach((x, index) => {
    const negative = view.locationNegative?.[Math.floor(index / 2)] === true;
    for (let y = 149; y < 154; y++) {
      for (let dx = 0; dx < 8; dx++) {
        const at = (y - 136) * 320 + x + dx;
        const on = (pixels[at]! & 4) !== 0;
        planes.set(x + dx, y, 0, negative && dx > 0 !== on);
        if (negative) {
          planes.set(x + dx, y, 2, dx > 0);
        }
      }
    }
  });
  Array.from(view.message.padEnd(23, ' ').slice(0, 23)).forEach((c, i) =>
    glyph('message', c, 64 + i * 8, 175, 0)
  );
  const pitch = slot(view.pitchWord ^ 512);
  for (let row = 0; row < 32; row++) {
    for (let x = 0; x < 16; x++) {
      planes.set(16 + x, 149 + row, 2, doc.pitch[pitch + row]![0]![x] === '1');
      planes.set(16 + x, 149 + row, 3, doc.pitch[pitch + row]![1]![x] === '1');
    }
  }
  const heading = slot(view.headingWord);
  doc.compass.frames[heading]!.forEach((row, y) =>
    [...row].forEach((bit, x) => planes.set(272 + x, 170 + y, 3, bit === '1'))
  );
  doc.compass.ticks[-heading & 15]!.forEach((row, y) => {
    for (let x = 0; x < 32; x++) {
      planes.set(272 + x, 165 + y, 3, row[x % 16] === '1');
      planes.set(272 + x, 180 - y, 3, row[x % 16] === '1');
    }
  });
  for (const [left, colour] of [
    [55, view.lamps.location],
    [127, view.lamps.altitude],
    [199, view.lamps.speed]
  ] as const) {
    for (let y = 149; y < 155; y++) {
      for (let x = left; x < left + 5; x++) {
        pixels[(y - 136) * 320 + x] = colour;
      }
    }
  }
  return { palette: { lower: doc.palette, upper: doc.palette }, pixels };
};

const MESSAGE_INK = new Map([
  [2, [0xab, 0x3c, 0x65]],
  [5, [0x5e, 0xd6, 0x38]],
  [6, [0x3a, 0x31, 0xff]]
]);

/// Preserve the C64 Metal Detector's existing authored text colours in only the
/// message ink. These RGB values are the shell's colours, never ST palette words.
export const targPanelRgba = (
  image: PanelImage,
  target: Uint8ClampedArray,
  messageColour?: number
): void => {
  panelRgba(image, target);
  const ink = MESSAGE_INK.get(messageColour ?? -1);
  if (ink === undefined) {
    return;
  }
  for (let y = 39; y < 46; y++) {
    for (let x = 64; x < 248; x++) {
      const at = y * 320 + x;
      if ((image.pixels[at]! & 1) === 0) {
        target.set(ink, at * 4);
      }
    }
  }
};
