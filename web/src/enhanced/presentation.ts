import type { LightingColours } from './lighting.ts';
import type { EnhancedPresentation } from './scene.ts';

/// The Enhanced viewer's camera and light, the same for every Title (ADR 0077). Damocles reads
/// them from its presentation document, `damocles/eris.json`; a Title without one takes these,
/// which a test holds equal to that document.
export const ENHANCED_PRESENTATION: EnhancedPresentation & {
  readonly lighting: LightingColours;
  readonly rendering: { readonly cullBackFaces: boolean };
} = {
  camera: {
    farPlane: 3_000_000,
    nearPlane: 4,
    verticalFieldOfViewDegrees: 45
  },
  ground: { fillDropUnits: 1 },
  lighting: {
    ambientGround: '#ffffff',
    ambientSky: '#ffffff',
    sunColour: '#807862'
  },
  orientation: { modelZ: 'keep' },
  rendering: { cullBackFaces: true }
};
