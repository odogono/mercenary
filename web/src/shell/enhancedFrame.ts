import type { Atmosphere } from '../enhanced/atmosphere.ts';
import type { EnhancedFramePlan, EnhancedStrokes } from '../enhanced/frame.ts';
import type { Size } from '../projection/index.ts';
import type { FrameRenderer } from '../rendering/renderer.ts';
import { ScenePalette } from '../scene/index.ts';
import type { SessionSnapshot } from '../session/index.ts';
import type { TargOrrery } from '../sky/index.ts';
import type { World } from '../world/index.ts';
import {
  drawnWhole,
  planTargEnhancedFrame,
  targEnhancedScene
} from './enhancedScene.ts';
import {
  addLiftBar,
  objectOverlays,
  planFrame,
  skyFrameOf,
  worldClear,
  worldlessFrame,
  type DrawBatch,
  type FramePlan,
  type FramePresentation,
  type Renderer
} from './frame.ts';

/// One frame of Targ as the shell draws it.
///
/// Authentic Targ, the frames with no world in them (the Escape, the Lift Journey's solid
/// stages and a dark Room) are one Targ plan. Enhanced Targ draws its world through the shared
/// planner (ADR 0087), between Targ's own passes: its sky or a lit Room's backdrop before the
/// plan, and the lift bar and the fixed-screen overlays after it.
export type TargFrame =
  | { readonly kind: 'targ'; readonly plan: FramePlan }
  | {
      readonly after: FramePlan;
      readonly before: FramePlan;
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
  const sky = skyFrameOf(snapshot, size, orrery, presentation);
  const scene = targEnhancedScene(world, snapshot, {
    atmosphere: shared.atmosphere,
    // Haze fades toward the sky at the horizon: its twilight gradient's foot, or its fill.
    horizon: sky?.gradient?.horizon ?? sky?.clear ?? ScenePalette.sky,
    structureReach: presentation.structureReach
  });
  const plan = planTargEnhancedFrame(
    scene,
    snapshot,
    size,
    shared.outputHeight,
    shared.strokes
  );
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
  const after: DrawBatch[] = [];
  addLiftBar(after, snapshot, size);
  return {
    after: {
      batches: after,
      clear: null,
      lines: 0,
      overlays: objectOverlays(world, snapshot, size),
      points: 0,
      size
    },
    before: {
      batches: [],
      clear: worldClear(snapshot, sky, presentation.preset),
      lines: 0,
      overlays: [],
      points: 0,
      size,
      ...(sky === undefined ? {} : { sky })
    },
    kind: 'shared',
    lines,
    plan,
    points
  };
};

/// Draw one Targ frame: a Targ plan through Targ's renderer, or Targ's passes around the shared
/// planner's plan, all into the one canvas.
export const drawTargFrame = (
  frame: TargFrame,
  renderer: Renderer,
  shared: () => FrameRenderer
): { readonly lines: number; readonly points: number } => {
  if (frame.kind === 'targ') {
    return renderer.render(frame.plan);
  }
  const planner = shared();
  // Sizing the canvas clears it, so it is sized before Targ's pass rather than between them.
  planner.resize();
  renderer.render(frame.before);
  planner.render(frame.plan, undefined, { over: true });
  renderer.resume();
  renderer.render(frame.after);
  return { lines: frame.lines, points: frame.points };
};
