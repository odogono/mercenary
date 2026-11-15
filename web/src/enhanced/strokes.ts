import type { EnhancedStroke } from './frame.ts';

/// The named stroke levels a player or the Flyover chooses from (#951), apart from where any
/// choice is kept.

/// How thick the wireframe's lines are drawn, as named levels rather than raw pixels.
export type WireframeWeight = 'fine' | 'bold' | 'heavy';

/// How much soft halo each wireframe line carries.
export type WireframeGlow = 'off' | 'soft' | 'bright';

/// The pixels each named weight and glow level stands for, one vocabulary shared with the
/// settings page and the console.
export const WIREFRAME_WEIGHT_PIXELS: Readonly<
  Record<WireframeWeight, number>
> = { bold: 2, fine: 1, heavy: 3 };
export const WIREFRAME_GLOW_AMOUNT: Readonly<Record<WireframeGlow, number>> = {
  bright: 0.7,
  off: 0,
  soft: 0.35
};

/// One Enhanced stroke from named levels. An unset level keeps the default: one pixel, no glow.
export const enhancedStrokeOf = (
  weight: WireframeWeight | undefined,
  glow: WireframeGlow | undefined
): EnhancedStroke => ({
  glow: glow === undefined ? 0 : WIREFRAME_GLOW_AMOUNT[glow],
  weight: weight === undefined ? 1 : WIREFRAME_WEIGHT_PIXELS[weight]
});
