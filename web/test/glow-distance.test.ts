import { expect, test } from 'bun:test';

import { Camera } from '../src/projection/index.ts';
import { defaultSettings, loadSettings } from '../src/settings/index.ts';
import { Ink } from '../src/world/index.ts';

const camera = new Camera({
  heading: 0,
  pitch: 0,
  position: { x: 0, y: 0, z: 0 }
});
const size = { height: 800, width: 1280 };

test('glow distance tuning has close-range defaults and rejects reversed or invalid ranges', () => {
  expect(defaultSettings().presentation.glowDistance).toEqual({
    fadeEnd: 16_384,
    fadeStart: 4096
  });
  expect(
    loadSettings(
      '{"presentation":{"glowDistance":{"fadeStart":100,"fadeEnd":200}}}'
    ).presentation.glowDistance
  ).toEqual({ fadeEnd: 200, fadeStart: 100 });
  for (const glowDistance of [
    { fadeStart: -1 },
    { fadeEnd: 0 },
    { fadeEnd: 100, fadeStart: 100 },
    { fadeEnd: 100, fadeStart: 200 },
    { fadeStart: true }
  ]) {
    expect(() =>
      loadSettings(JSON.stringify({ presentation: { glowDistance } }))
    ).toThrow('presentation.glowDistance');
  }
});

test('optional view endpoints preserve projected coordinates and remain on the clipped world segment', () => {
  for (const segment of [
    {
      a: { x: -1000, y: 40, z: -100 },
      b: { x: 100, y: 0, z: -500 },
      ink: Ink.white
    },
    { a: { x: 0, y: 0, z: 100 }, b: { x: 60, y: 20, z: -500 }, ink: Ink.white }
  ]) {
    const ordinary = camera.projectSegment(segment, size)!;
    const enhanced = camera.projectSegment(segment, size, 'clipped', true)!;
    expect(enhanced.viewEndpoints).toBeDefined();
    const { viewEndpoints, ...coordinates } = enhanced;
    expect(coordinates).toEqual(ordinary);
    for (const [index, point] of viewEndpoints!.entries()) {
      expect(point.z).toBeGreaterThanOrEqual(camera.nearPlane);
      const projected = camera.projectPoint({ ...point, z: -point.z }, size)!;
      expect(projected.x).toBeCloseTo(
        index === 0 ? enhanced.x1 : enhanced.x2,
        3
      );
      expect(projected.y).toBeCloseTo(
        index === 0 ? enhanced.y1 : enhanced.y2,
        3
      );
      const t = (-point.z - segment.a.z) / (segment.b.z - segment.a.z);
      expect(point.x).toBeCloseTo(
        segment.a.x + t * (segment.b.x - segment.a.x),
        8
      );
      expect(point.y).toBeCloseTo(
        segment.a.y + t * (segment.b.y - segment.a.y),
        8
      );
    }
  }
});

test('view-axis segments retain the nearest visible point regardless of edge direction', () => {
  const a = { x: 0, y: 0, z: -20_000 };
  const b = { x: 0, y: 0, z: -1000 };
  const forward = camera.projectSegment(
    { a, b, ink: Ink.white },
    size,
    'clipped',
    true
  )!;
  const reverse = camera.projectSegment(
    { a: b, b: a, ink: Ink.white },
    size,
    'clipped',
    true
  )!;
  expect(forward.viewEndpoints).toEqual([
    { ...b, z: -b.z },
    { ...b, z: -b.z }
  ]);
  expect(reverse.viewEndpoints).toEqual([
    { ...b, z: -b.z },
    { ...b, z: -b.z }
  ]);
});

test('camera-view distance includes altitude and is invariant under rotation and mirroring', () => {
  const position = { x: 20, y: 4000, z: 12_000 };
  const segment = {
    a: { x: 0, y: 0, z: 0 },
    b: { x: 100, y: 100, z: -100 },
    ink: Ink.white
  };
  for (const mirrored of [false, true]) {
    const turned = new Camera({
      heading: 0.1,
      mirrored,
      pitch: -0.2,
      position,
      roll: 0.3
    });
    const line = turned.projectSegment(segment, size, 'clipped', true)!;
    const [a, b] = line.viewEndpoints!;
    expect(Math.hypot(a.x, a.y, a.z)).toBeCloseTo(
      Math.hypot(
        segment.a.x - position.x,
        segment.a.y - position.y,
        segment.a.z - position.z
      ),
      7
    );
    expect(Math.hypot(b.x, b.y, b.z)).toBeCloseTo(
      Math.hypot(
        segment.b.x - position.x,
        segment.b.y - position.y,
        segment.b.z - position.z
      ),
      7
    );
  }
});
