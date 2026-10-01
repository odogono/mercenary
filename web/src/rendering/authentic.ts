import type { FrameColour, FrameDescription } from './description.ts';
import { IndexedFrame } from './raster.ts';

const indexOf = (colour: FrameColour): number => {
  if (!('index' in colour)) {
    throw new Error(
      'Authentic rendering requires a Title-allocated palette index'
    );
  }
  return colour.index;
};

export const renderAuthentic = (
  description: FrameDescription
): IndexedFrame => {
  const { height, width } = description.projection;
  const frame = new IndexedFrame(width, height);
  frame.clear(indexOf(description.background));
  for (const primitive of description.primitives) {
    const index = indexOf(primitive.colour);
    if (primitive.kind === 'polygon') {
      frame.fillPolygon(primitive.screen, index);
    } else if (primitive.kind === 'line') {
      frame.drawLine(primitive.screen[0], primitive.screen[1], index);
    } else {
      const [x, y] = primitive.screen;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        frame.pixels[y * width + x] = index;
      }
    }
  }
  return frame;
};

export const rgbaFromIndexed = (
  description: FrameDescription,
  frame: IndexedFrame,
  target: Uint8ClampedArray
): void => {
  let band = 0;
  for (let row = 0; row < frame.height; row += 1) {
    while (
      band + 1 < description.paletteBands.length &&
      row >= description.paletteBands[band + 1]!.fromRow
    ) {
      band += 1;
    }
    const colours = description.paletteBands[band]!.colours;
    for (let column = 0; column < frame.width; column += 1) {
      const pixel = row * frame.width + column;
      const [r, g, b] = colours[frame.pixels[pixel]!]!;
      const at = pixel * 4;
      target[at] = r;
      target[at + 1] = g;
      target[at + 2] = b;
      target[at + 3] = 255;
    }
  }
};
