/// Compatibility seam: Damocles uses the common renderer without changing its planner or passes.
export {
  FrameRenderer as ErisRenderer,
  SHADOW_WINDOWS as ERIS_SHADOW_WINDOWS,
  shadowCasterVertices
} from '../rendering/renderer.ts';
export type {
  FrameRendererOptions as ErisRendererOptions,
  LightingRender as ErisLightingRender,
  ShadowEdge
} from '../rendering/renderer.ts';
