import { describe, expect, test } from 'bun:test';

import {
  createFlyoverBackdrop,
  createSphereMesh,
  planOrbitalFrame
} from '../src/flyover/renderer.ts';
import type { FlyoverBody } from '../src/flyover/system.ts';

const body = (id: string, x: number, radius: number): FlyoverBody => ({
  colour: '#ffffff',
  displayRadiusUnits: radius,
  id,
  position: { x, y: 0, z: 0 },
  provenance: {
    colour: 'authored',
    identity: 'authored',
    position: 'authored',
    radius: 'authored',
    ranges: 'authored'
  },
  ranges: ['orbital']
});

describe('Flyover Orbital geometry', () => {
  test('creates the requested outward-wound UV sphere', () => {
    const mesh = createSphereMesh(64, 32);
    expect(mesh.length).toBe(64 * 32 * 6 * 6);

    let outwardTriangles = 0;
    for (let offset = 0; offset < mesh.length; offset += 18) {
      const a = mesh.slice(offset, offset + 3);
      const b = mesh.slice(offset + 6, offset + 9);
      const c = mesh.slice(offset + 12, offset + 15);
      const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const normal = [
        ab[1]! * ac[2]! - ab[2]! * ac[1]!,
        ab[2]! * ac[0]! - ab[0]! * ac[2]!,
        ab[0]! * ac[1]! - ab[1]! * ac[0]!
      ];
      const dot = normal[0]! * a[0]! + normal[1]! * a[1]! + normal[2]! * a[2]!;
      if (Math.abs(dot) > 1e-8) {
        expect(dot).toBeGreaterThan(0);
        outwardTriangles += 1;
      }
    }
    expect(outwardTriangles).toBeGreaterThan(0);
  });

  test('generates a stable uniform unit sphere distinct for each seed', () => {
    const settings = { starCount: 2048, starSeed: 1_179_408_719 };
    const first = createFlyoverBackdrop(settings);
    expect(first).toEqual(createFlyoverBackdrop(settings));
    expect(first).not.toEqual(
      createFlyoverBackdrop({ ...settings, starSeed: settings.starSeed + 1 })
    );
    expect(first).toHaveLength(2048 * 3);
    for (let index = 0; index < first.length; index += 3) {
      expect(
        Math.hypot(first[index]!, first[index + 1]!, first[index + 2]!)
      ).toBeCloseTo(1, 6);
    }
    const meanY =
      first.filter((_, index) => index % 3 === 1).reduce((a, b) => a + b, 0) /
      settings.starCount;
    expect(Math.abs(meanY)).toBeLessThan(0.05);
  });

  test('plans finite adaptive depth and the exact authored light source', () => {
    const bodies = [body('targ', 0, 2), body('sun', 10, 1)];
    const targ = planOrbitalFrame(
      bodies,
      {
        heading: 0,
        pitch: 0,
        position: { x: 0, y: 0, z: 6 },
        roll: 0
      },
      { kind: 'body', sourceBodyId: 'sun' }
    );
    expect(targ.nearPlane).toBe(0.001);
    expect(targ.farPlane).toBeCloseTo((Math.hypot(10, 6) + 1) * 1.1, 12);
    expect(targ.bodies.find(entry => entry.body.id === 'sun')?.emissive).toBe(
      true
    );
    expect(
      targ.bodies.find(entry => entry.body.id === 'targ')?.lightPosition
    ).toEqual({ x: 10, y: 0, z: -6 });

    const gamma = planOrbitalFrame(
      bodies,
      {
        heading: 0,
        pitch: 0,
        position: { x: 0, y: 0, z: 0 },
        roll: 0
      },
      { kind: 'camera-headlight' }
    );
    expect(gamma.nearPlane).toBe(0.001);
    expect(gamma.bodies.every(entry => !entry.emissive)).toBe(true);
    expect(gamma.bodies.every(entry => entry.lightPosition.x === 0)).toBe(true);

    const distantBody = [body('distant', 100_000, 10)];
    const distant = planOrbitalFrame(
      distantBody,
      {
        heading: 0,
        pitch: 0,
        position: { x: 0, y: 0, z: 0 },
        roll: 0
      },
      { kind: 'camera-headlight' }
    );
    const approached = planOrbitalFrame(
      distantBody,
      {
        heading: 0,
        pitch: 0,
        position: { x: 50_000, y: 0, z: 0 },
        roll: 0
      },
      { kind: 'camera-headlight' }
    );
    expect(distant.farPlane).toBeCloseTo(110_011, 8);
    expect(distant.nearPlane).toBeCloseTo(1.100_11, 8);
    expect(approached.farPlane).toBeCloseTo(55_011, 8);
    expect(approached.nearPlane).toBeCloseTo(0.550_11, 8);
    expect(approached.farPlane).toBeLessThan(distant.farPlane);
    expect(approached.nearPlane).toBeLessThan(distant.nearPlane);
  });
});
