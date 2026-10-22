/// Geometry Asset face triangles for Targ's shared Authentic/Enhanced fill pass. Homogeneous
/// coordinates retain perspective depth and let WebGL clip triangles crossing the eye.
import { triangulate } from '../catalogue/geometry.ts';
import {
  Camera,
  horizontalFocalLength,
  viewportCentre,
  type Size
} from '../projection/index.ts';
import { ScenePalette, type RGB8 } from '../scene/index.ts';
import { dot } from '../sky/vector.ts';
import type { Polygon } from '../world/index.ts';

export interface FaceBatch {
  readonly colour: RGB8;
  readonly mode: 'faces';
  readonly pointSize: 1;
  /// Clip-space XYZW, four floats per vertex, including the perspective divisor.
  readonly vertices: Float32Array;
}

const colour = (face: Polygon): RGB8 => {
  if (face.colour?.kind === 'palette') {
    const rgb = Number.parseInt(face.colour.colour.slice(1), 16);
    return { blue: rgb & 255, green: (rgb >> 8) & 255, red: rgb >> 16 };
  }
  return face.colour?.kind === 'ink' && face.colour.ink === 1
    ? ScenePalette.blackInk
    : ScenePalette.whiteInk;
};

export const faceBatches = (
  faces: readonly Polygon[],
  camera: Camera,
  size: Size
): FaceBatch[] => {
  const centre = viewportCentre(size);
  const focalX = horizontalFocalLength(size);
  const focalY = camera.verticalFocalLength(size);
  const near = camera.nearPlane;
  const far = camera.farPlane;
  const depthScale = Number.isFinite(far) ? (far + near) / (far - near) : 1;
  const depthOffset = Number.isFinite(far)
    ? (2 * far * near) / (far - near)
    : 2 * near;
  return faces.flatMap(face => {
    const points = face.vertices;
    const clip = points.map(point => {
      const v = camera.viewSpace(point);
      return [
        (2 * (centre.x * v.z + focalX * v.x)) / size.width - v.z,
        v.z - (2 * (centre.y * v.z - focalY * v.y)) / size.height,
        depthScale * v.z - depthOffset,
        v.z
      ];
    });
    const corners = triangulate(
      points.map(v => [v.x, v.y, v.z] as const),
      points.map((_, i) => i)
    );
    const output: number[] = [];
    for (let i = 0; i < corners.length; i += 3) {
      const [ia, ib, ic] = [corners[i]!, corners[i + 1]!, corners[i + 2]!];
      const [a, b, c] = [points[ia]!, points[ib]!, points[ic]!];
      const normal = {
        x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
        y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
        z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
      };
      const toCamera = {
        x: camera.position.x - a.x,
        y: camera.position.y - a.y,
        z: camera.position.z - a.z
      };
      if (face.doubleSided !== true && dot(normal, toCamera) <= 0) {
        continue;
      }
      output.push(...clip[ia]!, ...clip[ib]!, ...clip[ic]!);
    }
    return output.length === 0
      ? []
      : [
          {
            colour: colour(face),
            mode: 'faces',
            pointSize: 1,
            vertices: new Float32Array(output)
          }
        ];
  });
};
