import type { FrameProjection } from '../rendering/description.ts';

/// Mercenary III's recovered view geometry; supplied by its planner to either rendering mode.
export const DION_PROJECTION: FrameProjection = {
  centre: [160, 68],
  focal: 256,
  height: 136,
  near: 1e-3,
  width: 320
};
