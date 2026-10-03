/// Compatibility seam: Damocles uses the common renderer without changing its planner or passes.
export {
  FrameRenderer as ErisRenderer,
  shadowCasterVertices
} from '../rendering/renderer.ts';
export type {
  FrameRendererOptions as ErisRendererOptions,
  LightingRender as ErisLightingRender
} from '../rendering/renderer.ts';
