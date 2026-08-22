import { describe, expect, test } from 'bun:test';

import { defaultSettings } from '../src/settings/index.ts';
import {
  DEFAULT_PREFERENCES,
  effectivePresentation
} from '../src/shell/preferences.ts';

describe('effective Browser Shell presentation', () => {
  test('Authentic presentation keeps the Reference Build wireframe', () => {
    const presentation = effectivePresentation(
      {
        ...defaultSettings().presentation,
        wireframe: { glow: 0.6, thickness: 2.5 }
      },
      {
        ...DEFAULT_PREFERENCES,
        presentationPreset: 'authentic',
        wireframeGlow: 'bright',
        wireframeWeight: 'heavy'
      }
    );

    expect(presentation.wireframe).toEqual({ glow: 0, thickness: 1 });
  });

  test('Enhanced presentation restores the stored wireframe choices', () => {
    const presentation = effectivePresentation(defaultSettings().presentation, {
      ...DEFAULT_PREFERENCES,
      presentationPreset: 'enhanced',
      wireframeGlow: 'bright',
      wireframeWeight: 'heavy'
    });

    expect(presentation.wireframe).toEqual({ glow: 0.7, thickness: 3 });
  });
});
