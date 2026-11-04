import { describe, expect, test } from 'bun:test';

import { AUTHORED_HAZE, atmosphereOf } from '../src/enhanced/atmosphere.ts';
import { planEnhancedFrame } from '../src/enhanced/frame.ts';
import { ENHANCED_PRESENTATION } from '../src/enhanced/presentation.ts';
import type { EnhancedSurface } from '../src/enhanced/scene.ts';

/// Haze (ADR 0088): the shared planner fades the distant world toward the Body's horizon
/// colour, by day or by night, as thick as the Body's Atmosphere, and never in space or on a
/// Body with no Atmosphere. Enclosed Regions are pinned with Damocles's own structures in
/// `damocles-floor.test.ts`.

const DAY = '#4080c0';
const NIGHT = '#000022';

const surface = (
  atmosphere: EnhancedSurface['atmosphere']
): EnhancedSurface => ({
  atmosphere,
  baseColour: '#003300',
  floorLabelGlyphs: {},
  grid: { cellsPerAxis: 16, cellUnits: 0x1_00_00, origin: { x: 0, z: 0 } },
  islands: [],
  placements: [],
  sky: {
    day: { colour: DAY, sourceColour: 0 },
    night: { colour: NIGHT, sourceColour: 0 }
  }
});

const channels = (colour: string): readonly number[] =>
  [1, 3, 5].map(at => Number.parseInt(colour.slice(at, at + 2), 16) / 255);

const plan = (
  scene: EnhancedSurface,
  options: { readonly daylight?: boolean; readonly inSpace?: boolean } = {}
) =>
  planEnhancedFrame(
    scene,
    {
      body: 'test',
      heading: 0,
      pitch: 0,
      position: { x: 0x80_00, y: 63, z: 0x80_00 }
    },
    ENHANCED_PRESENTATION,
    null,
    [],
    [],
    () => false,
    options.daylight ?? false,
    null,
    options.inSpace ?? false
  );

describe('Haze', () => {
  test('fades toward the night sky by night and the day sky by day', () => {
    const thick = surface({ hazeHalfDistance: 200_000 });
    expect(plan(thick).haze).toEqual({
      colour: channels(NIGHT) as [number, number, number],
      halfDistance: 200_000
    });
    expect(plan(thick, { daylight: true }).haze).toEqual({
      colour: channels(DAY) as [number, number, number],
      halfDistance: 200_000
    });
  });

  test('is absent on a Body with no Atmosphere', () => {
    expect(plan(surface(null), { daylight: true }).haze).toBeNull();
    expect(plan(surface(undefined), { daylight: true }).haze).toBeNull();
  });

  test('is absent while the Atmosphere has no authored thickness', () => {
    expect(
      plan(surface({ hazeHalfDistance: null }), { daylight: true }).haze
    ).toBeNull();
  });

  test('is absent in space', () => {
    expect(
      plan(surface({ hazeHalfDistance: 200_000 }), { inSpace: true }).haze
    ).toBeNull();
  });

  test('ships with no thickness authored for Damocles or Mercenary III', () => {
    expect(AUTHORED_HAZE.authority).toBe('authored');
    expect(AUTHORED_HAZE.damocles).toEqual({});
    expect(AUTHORED_HAZE.mercenaryIII).toEqual({});
    expect(atmosphereOf(false, AUTHORED_HAZE.damocles, 'body-11')).toBeNull();
    expect(atmosphereOf(true, AUTHORED_HAZE.damocles, 'body-11')).toEqual({
      hazeHalfDistance: null
    });
    expect(atmosphereOf(true, { 'body-11': 5000 }, 'body-11')).toEqual({
      hazeHalfDistance: 5000
    });
  });
});
