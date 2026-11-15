import type { Atmosphere } from '../enhanced/atmosphere.ts';
import type { EnhancedFramePlan, EnhancedStrokes } from '../enhanced/frame.ts';
import { ENHANCED_PRESENTATION } from '../enhanced/presentation.ts';
import type { SceneIsland } from '../enhanced/scene.ts';
import { atan, cos, sin, tan } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { Size } from '../projection/index.ts';
import {
  planTargEnhancedFrame,
  targEnhancedScene,
  targFieldOfView,
  type TargSceneView
} from '../shell/enhancedScene.ts';
import { skyStateAt, type TargOrrery } from '../sky/index.ts';
import { targSkyView } from '../sky/view.ts';
import type { World } from '../world/index.ts';
import type { FlyoverPose, NearestFlyoverBody } from './camera.ts';
import { globeMapped } from './globe.ts';
import { bodyCoordinatesOf, tangentFrameOf } from './surfaceFrame.ts';
import type { TargFlyoverSystem } from './system.ts';

/// The Flyover's surface frame of Targ (ADR 0094): the Camera seen as Targ's own view of the
/// city, without a Gameplay Session, and the authored Islands laid onto Targ's surface.

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/// The angle of (x, y) from the x axis, from governed `atan` so ADR 0022's math seam stays
/// complete.
const angleOf = (x: number, y: number): number => {
  if (x === 0) {
    return y === 0 ? 0 : y > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  const base = atan(y / x);
  if (x > 0) {
    return base;
  }
  return y >= 0 ? base + Math.PI : base - Math.PI;
};

const arcsine = (value: number): number => {
  const clamped = Math.max(-1, Math.min(1, value));
  return angleOf(Math.sqrt(1 - clamped * clamped), clamped);
};

const dot = (a: Vector3, b: Vector3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

/// A surface position from a longitude and latitude, through City Island's patch and not
/// wrapped, so the view never jumps where Targ's 24-bit axes would wrap.
const surfaceAt = (
  system: TargFlyoverSystem,
  longitude: number,
  latitude: number
): { readonly x: number; readonly z: number } => {
  const patch = system.surfaceFrame.island.surfacePatch!;
  const [east, north] = globeMapped(longitude, latitude, system);
  return {
    x: patch.sourceCentre.x + east * patch.unitsPerRadian,
    z: patch.sourceCentre.z + north * patch.unitsPerRadian
  };
};

/// The Flyover Camera as Targ's view of its surface: the point below it through City Island's
/// patch, its height above TARG's surface, and its attitude turned into the tangent frame there
/// (east, up, north are Targ's x, y, z), as Targ's heading, pitch and roll.
export const targSurfaceView = (
  system: TargFlyoverSystem,
  pose: FlyoverPose,
  nearest: NearestFlyoverBody
): TargSceneView => {
  const { frameLatitude } = system.surfaceFrame;
  const { latitude, longitude } = bodyCoordinatesOf(
    nearest.outwardDirection,
    frameLatitude
  );
  const frame = tangentFrameOf(longitude, latitude, frameLatitude);
  const local = (value: Vector3): Vector3 => ({
    x: dot(value, frame.east),
    y: dot(value, frame.up),
    z: dot(value, frame.north)
  });
  const sinHeading = sin(pose.heading);
  const cosHeading = cos(pose.heading);
  const sinPitch = sin(pose.pitch);
  const cosPitch = cos(pose.pitch);
  const forward = local({
    x: -sinHeading * cosPitch,
    y: sinPitch,
    z: -cosHeading * cosPitch
  });
  const right = local({ x: cosHeading, y: 0, z: -sinHeading });
  // Targ faces (-sin H cos P, sin P, -cos H cos P). Looking straight up or down, the heading
  // is the right vector's instead, and the roll nought.
  const pitch = arcsine(forward.y);
  const level = Math.hypot(forward.x, forward.z) > 1e-12;
  const heading = level
    ? angleOf(-forward.z, -forward.x)
    : angleOf(right.x, -right.z);
  const levelRight = { x: cos(heading), y: 0, z: -sin(heading) };
  const levelUp = {
    x: sin(heading) * sin(pitch),
    y: cos(pitch),
    z: cos(heading) * sin(pitch)
  };
  // A right bank drops the right wing: right = level right × cos ρ − level up × sin ρ.
  const roll = angleOf(dot(right, levelRight), -dot(right, levelUp));
  const surface = surfaceAt(system, longitude, latitude);
  return {
    elapsed: 0,
    indoor: undefined,
    pose: {
      heading,
      pitch,
      position: {
        x: surface.x,
        y:
          nearest.normalizedSignedSurfaceDistance *
          nearest.body.displayRadiusUnits,
        z: surface.z
      },
      roll
    },
    residence: undefined,
    roomId: undefined,
    worldFlipped: false
  };
};

/// The coastline edge words for a polygon of `count` vertices: its closed cycle against the
/// stored vertex order, each half four times a vertex index plus four.
const edgeWords = (count: number): readonly number[] =>
  Array.from({ length: count }, (_, index) => {
    const from = (index + 1) % count;
    return (((from + 1) * 4) << 6) | ((index + 1) * 4);
  });

/// Every Targ Island as a planner island on Targ's surface, in document order, filled in the
/// ground colour and stroked in the coastline colour from the same vertices as the Globe. City
/// Island keeps Targ's own origin, so the city's roads can ride on it; any other Island is
/// measured from its centre's cell.
export const flyoverSurfaceIslands = (
  system: TargFlyoverSystem,
  cellUnits: number
): readonly SceneIsland[] =>
  system.islands.map(island => {
    const city = island.id === system.surfaceFrame.island.id;
    const centre = surfaceAt(
      system,
      radians(island.centreDegrees.longitude),
      radians(island.centreDegrees.latitude)
    );
    const origin = city
      ? { x: 0, z: 0 }
      : {
          x: Math.floor(centre.x / cellUnits),
          z: Math.floor(centre.z / cellUnits)
        };
    const vertices = island.polygonDegrees.map(([longitude, latitude]) => {
      const point = surfaceAt(system, radians(longitude), radians(latitude));
      return [
        point.x / cellUnits - origin.x,
        point.z / cellUnits - origin.z
      ] as const;
    });
    const xs = vertices.map(([x]) => x);
    const zs = vertices.map(([, z]) => z);
    const extent = {
      x: [Math.floor(Math.min(...xs)), Math.ceil(Math.max(...xs))] as const,
      z: [Math.floor(Math.min(...zs)), Math.ceil(Math.max(...zs))] as const
    };
    // The core is where the ground underfoot is already land: the city's sixteen cells, and
    // none elsewhere.
    const core = city
      ? { x: [0, 16] as const, z: [0, 16] as const }
      : { x: [0, 0] as const, z: [0, 0] as const };
    return {
      boxes: [extent, core],
      coastColour: system.surfaceColours.coastline,
      coastline: { edges: edgeWords(vertices.length), vertices },
      landColour: system.surfaceColours.ground,
      origin
    } satisfies SceneIsland;
  });

export interface FlyoverSurfaceFrameInput {
  /// TARG's Atmosphere from the Targ System, which sets the surface's Haze (ADR 0088).
  readonly atmosphere: Atmosphere | null;
  /// The Flyover clock's presentation elapsed seconds, which the sky turns with.
  readonly elapsed: number;
  readonly orrery: TargOrrery;
  readonly outputHeight: number;
  readonly size: Size;
  /// The System Menu's stroke choices; absent keeps one-pixel strokes with no glow.
  readonly strokes?: EnhancedStrokes;
  readonly system: TargFlyoverSystem;
  readonly view: TargSceneView;
  readonly world: World;
}

/// The surface frame of Targ under the Flyover Camera: the city as it stands in the Data
/// Payload, nothing moving, on City Island's ground in the ocean, with every other Island
/// beyond it, under the Targ Star Sphere and Orrery at the Flyover clock. Objects placed
/// outside the city's sixteen cells are left out until their land is decided.
export const planFlyoverSurfaceFrame = (
  input: FlyoverSurfaceFrameInput
): EnhancedFramePlan => {
  const { size, system, view, world } = input;
  // One output pixel, as a tangent of Targ's view.
  const pixel =
    (2 * tan((targFieldOfView(size) * Math.PI) / 360)) / input.outputHeight;
  const sky = targSkyView(
    skyStateAt(input.orrery, input.elapsed),
    {
      heading: view.pose.heading,
      mirrored: false,
      pitch: view.pose.pitch,
      roll: view.pose.roll
    },
    ENHANCED_PRESENTATION.camera.farPlane / 2,
    pixel
  );
  const scene = targEnhancedScene(world, view, {
    atmosphere: input.atmosphere,
    horizon: sky.horizon,
    structureReach: 'all'
  });
  const cityEdge = world.cellsPerAxis * world.cellSize;
  const inCity = (position: Vector3): boolean =>
    position.x >= 0 &&
    position.z >= 0 &&
    position.x < cityEdge &&
    position.z < cityEdge;
  // The plane runs on where TARG curves away: the city is drawn only while it could stand above
  // the horizon of a Camera this high on the Globe, so Second City Island sees none of it.
  const radius = system
    .bodiesAt(0)
    .find(body => body.id === 'targ')!.displayRadiusUnits;
  const height = Math.max(0, view.pose.position.y);
  const horizon = Math.sqrt(2 * radius * height + height * height);
  const cityVisible =
    Math.hypot(
      view.pose.position.x - cityEdge / 2,
      view.pose.position.z - cityEdge / 2
    ) <
    horizon + (cityEdge / 2) * Math.SQRT2;
  const cityRoads = cityVisible ? scene.surface.islands[0]?.roads : undefined;
  const islands = flyoverSurfaceIslands(system, world.cellSize).map(
    (island, index) =>
      system.islands[index]!.id === system.surfaceFrame.island.id
        ? { ...island, roads: cityRoads }
        : island
  );
  const plan = planTargEnhancedFrame(
    {
      placements: cityVisible
        ? scene.placements.filter(
            placement =>
              placement.kind !== 'object' || inCity(placement.position)
          )
        : [],
      pose: scene.pose,
      surface: {
        ...scene.surface,
        baseColour: system.surfaceColours.ocean,
        islands
      }
    },
    view,
    size,
    input.outputHeight,
    input.strokes
  );
  return {
    ...plan,
    clear: [sky.clear.red / 255, sky.clear.green / 255, sky.clear.blue / 255],
    skyVertices: sky.vertices
  };
};
