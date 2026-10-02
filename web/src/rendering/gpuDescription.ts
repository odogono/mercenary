import { triangulate } from '../catalogue/geometry.ts';
import type {
  CameraPoint,
  FrameColour,
  FrameDescription,
  ScreenPoint
} from './description.ts';
import { clipNear, screenLine } from './raster.ts';

/// Camera u/v/d, resolved RGB, palette index (-1 for resolved RGB).
export const DESCRIPTION_STRIDE = 7;

export const descriptionVertices = (
  description: FrameDescription,
  output = {
    height: description.projection.height,
    width: description.projection.width
  }
): Float32Array => {
  const values: number[] = [];
  const projection = description.projection;
  const append = (point: CameraPoint, colour: FrameColour): void => {
    const rgb = 'rgb' in colour ? colour.rgb : [0, 0, 0];
    values.push(
      point.u,
      point.v,
      point.d,
      rgb[0]! / 255,
      rgb[1]! / 255,
      rgb[2]! / 255,
      'index' in colour ? colour.index : -1
    );
  };
  const cameraAt = ([x, y]: ScreenPoint): CameraPoint => ({
    d: 1,
    u: (projection.centre[0] - x) / projection.focal,
    v: (y - projection.centre[1]) / projection.focal
  });
  const quad = (points: readonly ScreenPoint[], colour: FrameColour): void => {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      append(cameraAt(points[index]!), colour);
    }
  };
  quad(
    [
      [-0.5, -0.5],
      [projection.width - 0.5, -0.5],
      [projection.width - 0.5, projection.height - 0.5],
      [-0.5, projection.height - 0.5]
    ],
    description.background
  );
  for (const primitive of description.primitives) {
    if (primitive.kind === 'polygon') {
      const points = clipNear(primitive.camera, projection.near);
      const indices = triangulate(
        points.map(p => [p.u, p.v, p.d]),
        points.map((_p, i) => i)
      );
      for (const index of indices) {
        append(points[index]!, primitive.colour);
      }
    } else if (primitive.kind === 'line') {
      const line = screenLine(
        primitive.camera[0],
        primitive.camera[1],
        projection
      );
      if (line === null) {
        continue;
      }
      const [[ax, ay], [bx, by]] = line;
      const sx =
        primitive.displayPixelWidth === undefined
          ? 1
          : output.width / projection.width;
      const sy =
        primitive.displayPixelWidth === undefined
          ? 1
          : output.height / projection.height;
      const halfWidth = (primitive.displayPixelWidth ?? 1) / 2;
      const length = Math.hypot((bx - ax) * sx, (by - ay) * sy);
      if (length < 1e-9) {
        quad(
          [
            [ax - halfWidth / sx, ay - halfWidth / sy],
            [ax + halfWidth / sx, ay - halfWidth / sy],
            [ax + halfWidth / sx, ay + halfWidth / sy],
            [ax - halfWidth / sx, ay + halfWidth / sy]
          ],
          primitive.colour
        );
      } else {
        const dx = ((((by - ay) * sy) / length) * halfWidth) / sx;
        const dy = (((-(bx - ax) * sx) / length) * halfWidth) / sy;
        quad(
          [
            [ax + dx, ay + dy],
            [bx + dx, by + dy],
            [bx - dx, by - dy],
            [ax - dx, ay - dy]
          ],
          primitive.colour
        );
      }
    } else {
      const [x, y] = primitive.screen;
      quad(
        [
          [x - 0.5, y - 0.5],
          [x + 0.5, y - 0.5],
          [x + 0.5, y + 0.5],
          [x - 0.5, y + 0.5]
        ],
        primitive.colour
      );
    }
  }
  return new Float32Array(values);
};

export const descriptionPalette = (
  description: FrameDescription
): { readonly pixels: Uint8Array; readonly width: number } => {
  const width = Math.max(
    1,
    ...description.paletteBands.map(band => band.colours.length)
  );
  const pixels = new Uint8Array(width * description.projection.height * 4);
  let band = 0;
  for (let row = 0; row < description.projection.height; row += 1) {
    while (
      band + 1 < description.paletteBands.length &&
      row >= description.paletteBands[band + 1]!.fromRow
    ) {
      band += 1;
    }
    description.paletteBands[band]!.colours.forEach((colour, index) =>
      pixels.set([...colour, 255], (row * width + index) * 4)
    );
  }
  return { pixels, width };
};
