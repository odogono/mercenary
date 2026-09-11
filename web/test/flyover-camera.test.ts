import { describe, expect, test } from 'bun:test';

import {
  advanceFlyoverCamera,
  bodyEntryPose,
  cappedFrameSeconds,
  flyoverSpeedKey,
  nearestFlyoverBody,
  overviewPose,
  parseBodyQuery,
  resetFlyoverCamera,
  speedForNotch,
  stepSpeedNotch,
  type FlyoverCameraState
} from '../src/flyover/camera.ts';
import type { FlyoverBody } from '../src/flyover/system.ts';

const body = (
  id: string,
  x: number,
  radius = 1,
  y = 0,
  z = 0
): FlyoverBody => ({
  colour: '#ffffff',
  displayRadiusUnits: radius,
  id,
  position: { x, y, z },
  provenance: {
    colour: 'authored',
    identity: 'authored',
    position: 'authored',
    radius: 'authored',
    ranges: 'authored'
  },
  ranges: ['orbital']
});

const stopped = (): FlyoverCameraState => ({
  pose: {
    heading: 0,
    pitch: 0,
    position: { x: 0, y: 0, z: 10 },
    roll: 0
  },
  speedNotch: 0
});

describe('Flyover Camera speed and movement', () => {
  test('maps notches geometrically across the fixed System bounds', () => {
    const bounds = {
      maximumUnitsPerSecond: 64,
      minimumUnitsPerSecond: 1
    };
    expect(speedForNotch(bounds, 0)).toBe(0);
    expect(speedForNotch(bounds, 1)).toBe(1);
    expect(speedForNotch(bounds, 10)).toBe(64);
    expect(speedForNotch(bounds, 5)).toBeCloseTo(1 * 64 ** (4 / 9), 12);
    expect(stepSpeedNotch(0, 1)).toBe(1);
    expect(stepSpeedNotch(0, -1)).toBe(0);
    expect(stepSpeedNotch(10, 1)).toBe(10);
  });

  test('wraps held yaw and pitch at 90 degrees per second and advances forward', () => {
    const next = advanceFlyoverCamera(
      { ...stopped(), speedNotch: 1 },
      { pitch: 1, yaw: -1 },
      1,
      { maximumUnitsPerSecond: 1, minimumUnitsPerSecond: 1 }
    );
    expect(next.pose.heading).toBeCloseTo((3 * Math.PI) / 2, 12);
    expect(next.pose.pitch).toBeCloseTo(Math.PI / 2, 12);
    expect(next.pose.position.x).toBeCloseTo(0, 12);
    expect(next.pose.position.y).toBeCloseTo(1, 12);
    expect(next.pose.position.z).toBeCloseTo(10, 12);
    expect(next.pose.roll).toBe(0);

    const wrapped = advanceFlyoverCamera(
      { ...next, speedNotch: 0 },
      { pitch: 1, yaw: 0 },
      2,
      { maximumUnitsPerSecond: 1, minimumUnitsPerSecond: 1 }
    );
    expect(wrapped.pose.pitch).toBeCloseTo((3 * Math.PI) / 2, 12);
  });

  test('caps browser frame gaps independently of the presentation clock', () => {
    expect(cappedFrameSeconds(0.016)).toBe(0.016);
    expect(cappedFrameSeconds(4)).toBe(0.1);
  });

  test('maps only non-repeated, unmodified speed keys', () => {
    expect(flyoverSpeedKey('1', 0)).toBe(1);
    expect(flyoverSpeedKey('9', 0)).toBe(9);
    expect(flyoverSpeedKey('0', 0)).toBe(10);
    expect(flyoverSpeedKey('+', 0)).toBe(1);
    expect(flyoverSpeedKey('-', 4)).toBe(3);
    expect(flyoverSpeedKey(' ', 8)).toBe(0);
    expect(flyoverSpeedKey('x', 4)).toBeUndefined();
  });
});

describe('Flyover entry and Body-relative derivation', () => {
  const bodies = [body('first', -4, 2), body('second', 6, 1)];
  const camera = {
    framingCoverage: 0.9,
    overviewAxis: 'positive-z' as const,
    verticalFieldOfViewDegrees: 60
  };

  test('frames the complete radius-inclusive System from positive Z', () => {
    const pose = overviewPose(bodies, camera, { height: 800, width: 1280 });
    expect(pose.heading).toBe(0);
    expect(pose.pitch).toBe(0);
    expect(pose.roll).toBe(0);
    expect(pose.position.x).toBe(0.5);
    expect(pose.position.y).toBe(0);
    expect(pose.position.z).toBeGreaterThan(6.5);
  });

  test('enters three display radii along positive Z', () => {
    expect(bodyEntryPose(body('target', 3, 4, 5, 6))).toEqual({
      heading: 0,
      pitch: 0,
      position: { x: 3, y: 5, z: 18 },
      roll: 0
    });
  });

  test('reset returns to the stopped overview Pose', () => {
    expect(
      resetFlyoverCamera(bodies, camera, { height: 800, width: 1280 })
    ).toEqual({
      pose: overviewPose(bodies, camera, { height: 800, width: 1280 }),
      speedNotch: 0
    });
  });

  test('accepts exactly one case-sensitive Body query', () => {
    expect(parseBodyQuery('?body=first&mode=inspect', bodies)).toEqual({
      body: bodies[0]!
    });
    expect(parseBodyQuery('?body=FIRST', bodies)).toEqual({
      notice: 'Unknown Body FIRST.'
    });
    expect(parseBodyQuery('?body=first&body=second', bodies)).toEqual({
      notice: 'The body query must name exactly one Body.'
    });
    expect(parseBodyQuery('?body=', bodies)).toEqual({
      notice: 'The body query must name one non-empty Body ID.'
    });
    expect(parseBodyQuery('?mode=inspect', bodies)).toEqual({});
  });

  test('selects by normalized signed surface distance and breaks ties by order', () => {
    const selected = nearestFlyoverBody({ x: 0, y: 0, z: 0 }, [
      body('large', 12, 4),
      body('small', 3, 1)
    ]);
    expect(selected.body.id).toBe('large');
    expect(selected.normalizedSignedSurfaceDistance).toBe(2);

    const tie = nearestFlyoverBody({ x: 0, y: 0, z: 0 }, [
      body('first', 2),
      body('second', -2)
    ]);
    expect(tie.body.id).toBe('first');
  });

  test('retains each Body outward direction through an exact centre', () => {
    const approached = nearestFlyoverBody({ x: 0, y: 0, z: 2 }, [
      body('target', 0)
    ]);
    const centred = nearestFlyoverBody(
      { x: 0, y: 0, z: 0 },
      [body('target', 0)],
      approached.outwardDirections
    );
    expect(centred.outwardDirection).toEqual({ x: 0, y: 0, z: 1 });

    const fresh = nearestFlyoverBody({ x: 0, y: 0, z: 0 }, [body('target', 0)]);
    expect(fresh.outwardDirection).toEqual({ x: 0, y: 0, z: 1 });
  });
});
