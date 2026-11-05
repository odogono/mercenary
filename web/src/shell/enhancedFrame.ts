import type { Atmosphere } from '../enhanced/atmosphere.ts';
import type { EnhancedFramePlan, EnhancedStrokes } from '../enhanced/frame.ts';
import { ENHANCED_PRESENTATION } from '../enhanced/presentation.ts';
import { tan } from '../math/index.ts';
import type { Size } from '../projection/index.ts';
import type { FrameRenderer } from '../rendering/renderer.ts';
import { FLOATS_PER_VERTEX } from '../rendering/triangles.ts';
import { ScenePalette, type RGB8 } from '../scene/index.ts';
import type { SessionSnapshot } from '../session/index.ts';
import { skyStateAt, type TargOrrery } from '../sky/index.ts';
import { targSkyView, type TargSkyView } from '../sky/view.ts';
import type { World } from '../world/index.ts';
import {
  drawnWhole,
  planTargEnhancedFrame,
  targEnhancedScene,
  targFieldOfView
} from './enhancedScene.ts';
import {
  liftBar,
  objectOverlays,
  planFrame,
  worldClear,
  worldlessFrame,
  type FramePlan,
  type FramePresentation,
  type Renderer
} from './frame.ts';

/// One frame of Targ as the shell draws it.
///
/// Authentic Targ, the frames with no world in them (the Escape, the Lift Journey's solid
/// stages and a dark Room) are one Targ plan. Enhanced Targ draws its world through the shared
/// planner (ADR 0087), sky and all (#956), and the Lift Journey's bar over it as the plan's
/// view-fixed layer (#957), with only the fixed-screen overlays drawn over it by Targ's
/// renderer.
export type TargFrame =
  | { readonly kind: 'targ'; readonly plan: FramePlan }
  | {
      readonly after: FramePlan;
      readonly kind: 'shared';
      readonly lines: number;
      readonly plan: EnhancedFramePlan;
      readonly points: number;
    };

export interface SharedFrameOptions {
  /// TARG's Atmosphere, from the Targ System (ADR 0088).
  readonly atmosphere: Atmosphere | null;
  readonly outputHeight: number;
  readonly strokes: EnhancedStrokes;
}

export const planTargFrame = (
  world: World,
  snapshot: SessionSnapshot,
  size: Size,
  orrery: TargOrrery | undefined,
  presentation: FramePresentation,
  shared: SharedFrameOptions
): TargFrame => {
  if (
    presentation.preset !== 'enhanced' ||
    worldlessFrame(world, snapshot, size) !== undefined
  ) {
    return {
      kind: 'targ',
      plan: planFrame(world, snapshot, size, orrery, presentation)
    };
  }
  const sky = enhancedSky(snapshot, size, orrery, presentation, shared);
  const scene = targEnhancedScene(world, snapshot, {
    atmosphere: shared.atmosphere,
    // Haze fades toward the sky at the horizon: its twilight gradient's foot, or its fill.
    horizon: sky?.horizon ?? ScenePalette.sky,
    structureReach: presentation.structureReach
  });
  const planned = planTargEnhancedFrame(
    scene,
    snapshot,
    size,
    shared.outputHeight,
    shared.strokes
  );
  // Targ's sky, or a lit Room's backdrop, is the fill, and its Bodies and stars the plan's sky.
  const clear: RGB8 = worldClear(snapshot, sky, presentation.preset);
  const bar = liftBar(snapshot, size);
  const plan: EnhancedFramePlan = {
    ...planned,
    clear: [clear.red / 255, clear.green / 255, clear.blue / 255],
    skyVertices: sky?.vertices ?? new Float32Array(),
    ...(bar === undefined ? {} : { viewFixedVertices: viewFixedBar(bar, size) })
  };
  const meshes = new Map(
    scene.placements.map(placement => [placement.id, placement.mesh])
  );
  let lines = plan.roadEdges.length;
  let points = 0;
  for (const id of plan.drawnPlacements) {
    if (drawnWhole(world, snapshot, id)) {
      lines += meshes.get(id)?.lines.length ?? 0;
    } else {
      points += 1;
    }
  }
  return {
    after: {
      batches: [],
      clear: null,
      lines: 0,
      overlays: objectOverlays(world, snapshot, size),
      points: 0,
      size
    },
    kind: 'shared',
    lines,
    plan,
    points
  };
};

/// The Lift Journey's bar, laid out in Targ's pixels, as view-fixed triangles: the planner draws
/// them last, over the world, without Haze or the world's depth. They lie at twice the near
/// plane; Targ's mirroring leaves them alone, as a bar the frame's width is its own mirror.
const viewFixedBar = (
  bar: { readonly colour: RGB8; readonly vertices: Float32Array },
  size: Size
): Float32Array => {
  const depth = ENHANCED_PRESENTATION.camera.nearPlane * 2;
  const tangent = tan((targFieldOfView(size) * Math.PI) / 360);
  const aspect = size.width / size.height;
  const corners = bar.vertices.length / 2;
  const out = new Float32Array(corners * FLOATS_PER_VERTEX);
  for (let corner = 0; corner < corners; corner += 1) {
    const x = (bar.vertices[corner * 2]! / size.width) * 2 - 1;
    const y = 1 - (bar.vertices[corner * 2 + 1]! / size.height) * 2;
    out.set(
      [
        x * aspect * tangent * depth,
        y * tangent * depth,
        depth,
        bar.colour.red / 255,
        bar.colour.green / 255,
        bar.colour.blue / 255,
        0,
        0,
        1,
        -depth
      ],
      corner * FLOATS_PER_VERTEX
    );
  }
  return out;
};

/// Targ's sky on the surface where an orrery is given (ADR 0025), as the plan's sky (#956).
const enhancedSky = (
  snapshot: SessionSnapshot,
  size: Size,
  orrery: TargOrrery | undefined,
  presentation: FramePresentation,
  shared: SharedFrameOptions
): TargSkyView | undefined => {
  if (orrery === undefined || snapshot.location.kind !== 'surface') {
    return undefined;
  }
  // One output pixel, as a tangent of Targ's view.
  const pixel =
    (2 * tan((targFieldOfView(size) * Math.PI) / 360)) / shared.outputHeight;
  return targSkyView(
    skyStateAt(orrery, presentation.orreryElapsed ?? snapshot.elapsed),
    {
      heading: snapshot.player.heading,
      mirrored: snapshot.worldFlipped,
      pitch: snapshot.player.pitch,
      roll: snapshot.player.roll
    },
    ENHANCED_PRESENTATION.camera.farPlane / 2,
    pixel
  );
};

/// Draw one Targ frame: a Targ plan through Targ's renderer, or the shared planner's plan with
/// Targ's overlays after it, all into the one canvas.
export const drawTargFrame = (
  frame: TargFrame,
  renderer: Renderer,
  shared: () => FrameRenderer
): { readonly lines: number; readonly points: number } => {
  if (frame.kind === 'targ') {
    return renderer.render(frame.plan);
  }
  shared().render(frame.plan);
  renderer.resume();
  renderer.render(frame.after);
  return { lines: frame.lines, points: frame.points };
};
