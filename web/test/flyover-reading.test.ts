import { describe, expect, test } from 'bun:test';

import { nearestFlyoverBody } from '../src/flyover/camera.ts';
import { readFlyoverPresentation } from '../src/flyover/documents.ts';
import { flyoverRangeReading } from '../src/flyover/reading.ts';
import { composeTargSystem } from '../src/flyover/system.ts';
import { defaultSettings } from '../src/settings/index.ts';
import { TARG_SYSTEM } from './fixtures/targSystem.ts';

const system = composeTargSystem(
  TARG_SYSTEM,
  readFlyoverPresentation(await Bun.file('flyover/targ.json').json(), 'targ', [
    'targ',
    'sun',
    'inner-moon',
    'outer-moon'
  ]),
  defaultSettings().presentation.sky
);
const RADIUS = TARG_SYSTEM.bodies[0]!.radius;
const bodies = system.bodiesAt(0);

const readingAt = (position: { x: number; y: number; z: number }) =>
  flyoverRangeReading(system, nearestFlyoverBody(position, bodies));

describe('the Flyover Range reading', () => {
  test('reads Orbital with no surface values from far away', () => {
    const reading = readingAt({ x: 0, y: 3 * RADIUS, z: 0 });
    expect(reading.handoff.range).toBe('orbital');
    expect(reading.surface).toBeUndefined();
  });

  test('reads the city beneath a Camera over it, through the dual band', () => {
    const reading = readingAt({ x: 0, y: 1.07 * RADIUS, z: 0 });
    expect(reading.handoff.range).toBe('coastal-surface');
    expect(reading.surface!.longitude).toBeCloseTo(0, 12);
    expect(reading.surface!.latitude).toBeCloseTo((34 * Math.PI) / 180, 12);
    expect(reading.surface!.normalizedAltitude).toBeCloseTo(0.07, 12);
    expect(reading.surface!.x).toBeCloseTo(524_288, 3);
    expect(reading.surface!.z).toBeCloseTo(524_288, 3);
  });

  test('reads Coastal over the open ocean and Surface below the ground', () => {
    expect(readingAt({ x: 0.5 * RADIUS, y: RADIUS, z: 0 }).handoff.range).toBe(
      'coastal'
    );
    const below = readingAt({ x: 0, y: -0.5 * RADIUS, z: 0 });
    expect(below.handoff.range).toBe('surface');
    expect(below.surface!.normalizedAltitude).toBeCloseTo(-0.5, 12);
  });

  test('keeps the last outward direction at the exact centre', () => {
    const above = nearestFlyoverBody({ x: 0, y: 2, z: 0 }, bodies);
    const centre = nearestFlyoverBody(
      { x: 0, y: 0, z: 0 },
      bodies,
      above.outwardDirections
    );
    const reading = flyoverRangeReading(system, centre);
    expect(reading.handoff.range).toBe('surface');
    expect(reading.surface!.normalizedAltitude).toBe(-1);
    expect(reading.surface!.latitude).toBeCloseTo((34 * Math.PI) / 180, 12);
  });
});
