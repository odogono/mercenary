/// Geometry Asset face triangles for Targ's shared Authentic/Enhanced fill pass. Homogeneous
/// coordinates retain perspective depth and let WebGL clip triangles crossing the eye.
import type { Vector3 } from '../orientation/index.ts';
import type { Camera, Size } from '../projection/index.ts';
import { dot } from '../sky/vector.ts';
import type { Polygon } from '../world/index.ts';

/// Floats per face vertex: clip-space XYZW, then the face's RGB in 0–1.
export const FACE_STRIDE = 7;

/// Every visible face in one draw.
export interface FaceBatch {
  readonly mode: 'faces';
  readonly vertices: Float32Array;
}

export const faceBatch = (
  faces: readonly Polygon[],
  camera: Camera,
  size: Size
): FaceBatch | undefined => {
  const clipSpace = camera.clipSpace(size);
  const capacity = faces.reduce((sum, face) => sum + face.triangles.length, 0);
  const vertices = new Float32Array(capacity * FACE_STRIDE);
  let offset = 0;
  for (const face of faces) {
    const points = face.vertices;
    const clip = points.map(clipSpace);
    const { blue, green, red } = face.colour;
    for (let i = 0; i < face.triangles.length; i += 3) {
      const corners = [
        face.triangles[i]!,
        face.triangles[i + 1]!,
        face.triangles[i + 2]!
      ];
      const [a, b, c] = corners.map(index => points[index]!) as [
        Vector3,
        Vector3,
        Vector3
      ];
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
      if (!face.doubleSided && dot(normal, toCamera) <= 0) {
        continue;
      }
      for (const index of corners) {
        vertices.set(clip[index]!, offset);
        vertices.set([red / 255, green / 255, blue / 255], offset + 4);
        offset += FACE_STRIDE;
      }
    }
  }
  return offset === 0
    ? undefined
    : { mode: 'faces', vertices: vertices.subarray(0, offset) };
};
