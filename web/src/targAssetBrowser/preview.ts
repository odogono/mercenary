/// One Geometry Asset as the Targ renderer draws it, seen from an orbit around its bounds.
///
/// The asset's drawn parts are read directly, so an unplaced or Authored model previews the
/// same as a placed one. Runtime-rotated vertices show at elapsed time zero. Lines to a Road
/// Workspace point are left out: those points are the occupied cell's, in world space.

import type { GeometryAsset } from '../geometry/contract.ts';
import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';
import {
  Ink,
  facePolygon,
  lineColour,
  type Polygon,
  type Segment
} from '../world/index.ts';

/// Parts the game draws as the model up close; walking, plan and far forms stay out.
const DRAWN = new Set(['detail', 'display', 'glyph', 'wireframe']);

export interface PreviewGeometry {
  readonly centre: Vector3;
  readonly faces: readonly Polygon[];
  readonly radius: number;
  readonly segments: readonly Segment[];
}

const at = ([x, y, z]: readonly number[]): Vector3 => ({ x: x!, y: y!, z: z! });

export const previewGeometry = (asset: GeometryAsset): PreviewGeometry => {
  const faces: Polygon[] = [];
  const segments: Segment[] = [];
  // The view frames the structure itself. A Surface Cell's black ink is mostly its road edges,
  // which run the width of the cell, so it only frames a model with nothing else.
  const points: Vector3[] = [];
  const ground: Vector3[] = [];
  for (const part of asset.parts.filter(p => DRAWN.has(p.role))) {
    const byId = new Map<number, Vector3>();
    for (const vertex of part.vertices) {
      byId.set(vertex.id, at(vertex.co));
    }
    for (const line of part.lines) {
      const a = byId.get(line.ends[0]);
      const b = byId.get(line.ends[1]);
      if (a === undefined || b === undefined) {
        continue;
      }
      const ink =
        line.colour?.kind === 'ink' && line.colour.ink === Ink.black
          ? Ink.black
          : Ink.white;
      const colour = lineColour(line.colour);
      segments.push(
        colour === undefined ? { a, b, ink } : { a, b, colour, ink }
      );
      (ink === Ink.black ? ground : points).push(a, b);
    }
    for (const face of part.faces) {
      const loop = face.loop.map(id => byId.get(id)!);
      faces.push(facePolygon(face, loop));
      points.push(...loop);
    }
  }
  if (points.length === 0) {
    points.push(...ground);
  }
  if (points.length === 0) {
    return { centre: { x: 0, y: 0, z: 0 }, faces, radius: 1, segments };
  }
  const axis = (key: keyof Vector3) => {
    const values = points.map(p => p[key]);
    return [Math.min(...values), Math.max(...values)] as const;
  };
  const [x, y, z] = (['x', 'y', 'z'] as const).map(axis) as [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number]
  ];
  const centre = {
    x: (x[0] + x[1]) / 2,
    y: (y[0] + y[1]) / 2,
    z: (z[0] + z[1]) / 2
  };
  const radius = Math.max(
    1,
    ...points.map(p =>
      Math.hypot(p.x - centre.x, p.y - centre.y, p.z - centre.z)
    )
  );
  return { centre, faces, radius, segments };
};

export interface Orbit {
  readonly distance: number;
  readonly heading: number;
  readonly pitch: number;
}

/// A three-quarter view from above, far enough back to fit the model.
export const DEFAULT_ORBIT: Orbit = {
  distance: 3,
  heading: Math.PI / 4,
  pitch: -Math.PI / 8
};

/// The camera that looks at the model's centre from `orbit`, its distance in model radii.
export const orbitCamera = (
  geometry: PreviewGeometry,
  orbit: Orbit
): Camera => {
  const { distance, heading, pitch } = orbit;
  // The direction a Camera of this heading and pitch looks along.
  const look = {
    x: -Math.sin(heading) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(heading) * Math.cos(pitch)
  };
  const away = distance * geometry.radius;
  return new Camera({
    heading,
    nearPlane: Math.max(1, geometry.radius / 100),
    pitch,
    position: {
      x: geometry.centre.x - look.x * away,
      y: geometry.centre.y - look.y * away,
      z: geometry.centre.z - look.z * away
    }
  });
};
