import { describe, expect, test } from 'bun:test';

import {
  ViewInterpolator,
  blendPose,
  blendSky,
  followView,
  type BlendableView
} from '../src/enhanced/interpolation.ts';
import type { Pose, ScenePlacement } from '../src/enhanced/scene.ts';
import type { SkyPass } from '../src/enhanced/sky.ts';

/// The Enhanced view between simulation passes (ADR 0078, #825).

const CELL = 0x1_00_00;

const pose = (x: number, heading: number, extra: Partial<Pose> = {}): Pose => ({
  body: 'eris',
  heading,
  pitch: 0,
  position: { x, y: 0, z: CELL / 2 },
  ...extra
});

const placement = (
  id: string,
  x: number,
  extra: Partial<ScenePlacement> = {}
): ScenePlacement => ({
  faceCount: 0,
  heading: 0,
  id,
  keyBase: null,
  kind: 'object',
  mesh: undefined,
  modelId: id,
  name: id,
  position: { x, y: 0, z: 0 },
  status: 'decoded',
  ...extra
});

interface TestView extends BlendableView {
  readonly label: string;
}

const view = (
  label: string,
  eye: Pose,
  residents: readonly ScenePlacement[] = [],
  extra: Partial<TestView> = {}
): TestView => ({
  label,
  pose: eye,
  residents,
  sky: null,
  surface: {
    grid: { cellsPerAxis: 16, cellUnits: CELL, origin: { x: 0, z: 0 } }
  },
  viewFixed: [],
  ...extra
});

const always = (): boolean => true;

describe('blending a Pose', () => {
  test('moves the eye along the line and turns it the short way round', () => {
    const from = pose(100, Math.PI - 0.1, { pitch: -0.2, roll: 0.4 });
    const to = pose(300, -Math.PI + 0.1, { pitch: 0.2, roll: -0.4 });
    const half = blendPose(from, to, 0.5);
    expect(half.position.x).toBe(200);
    // Across the ±π seam, not back through zero.
    expect(Math.abs(Math.cos(half.heading) + 1)).toBeLessThan(1e-12);
    expect(half.pitch).toBeCloseTo(0, 12);
    expect(half.roll).toBeCloseTo(0, 12);
  });

  test('does not blend toward another Body', () => {
    const to = { ...pose(300, 1), body: 'dion' };
    expect(blendPose(pose(100, 0), to, 0.5)).toBe(to);
  });
});

describe('the view interpolator', () => {
  test('draws one pass behind, blended by the fraction of the next pass run', () => {
    const views = new ViewInterpolator<TestView>(always);
    const first = views.view(view('a', pose(1000, 0)), {
      fraction: 0,
      pass: 7
    });
    expect(first.label).toBe('a');
    expect(views.blending).toBe(false);
    const quarter = views.view(view('b', pose(2000, 0)), {
      fraction: 0.25,
      pass: 8
    });
    expect(views.blending).toBe(true);
    expect(quarter.pose.position.x).toBe(1250);
    // The same pass again replaces its view and moves on with the clock.
    const later = views.view(view('b', pose(2000, 0)), {
      fraction: 0.75,
      pass: 8
    });
    expect(later.pose.position.x).toBe(1750);
    // Past the pass's end, the view holds at the current pass.
    expect(
      views.view(view('b', pose(2000, 0)), { fraction: 1.2, pass: 8 }).pose
        .position.x
    ).toBe(2000);
  });

  test('snaps on a cut, a skipped pass, or no phase', () => {
    const cuts = new ViewInterpolator<TestView>(
      (from, to) => from.label === to.label
    );
    cuts.view(view('foot', pose(1000, 0)), { fraction: 0, pass: 1 });
    const cut = cuts.view(view('cab', pose(5000, 0)), {
      fraction: 0.5,
      pass: 2
    });
    expect(cut.pose.position.x).toBe(5000);
    expect(cuts.blending).toBe(false);

    const views = new ViewInterpolator<TestView>(always);
    views.view(view('a', pose(1000, 0)), { fraction: 0, pass: 1 });
    expect(
      views.view(view('a', pose(5000, 0)), { fraction: 0.5, pass: 3 }).pose
        .position.x
    ).toBe(5000);
    views.view(view('a', pose(6000, 0)), { fraction: 0.5, pass: 4 });
    expect(views.blending).toBe(true);
    expect(views.view(view('a', pose(7000, 0)), null).pose.position.x).toBe(
      7000
    );
    expect(views.blending).toBe(false);
  });

  test('a reset forgets both passes', () => {
    const views = new ViewInterpolator<TestView>(always);
    views.view(view('a', pose(1000, 0)), { fraction: 0, pass: 1 });
    views.reset();
    expect(
      views.view(view('a', pose(5000, 0)), { fraction: 0.5, pass: 2 }).pose
        .position.x
    ).toBe(5000);
  });

  test('moves residents present in both passes, by id', () => {
    const views = new ViewInterpolator<TestView>(always);
    views.view(view('a', pose(1000, 0), [placement('taxi', 0)]), {
      fraction: 0,
      pass: 1
    });
    const drawn = views.view(
      view('a', pose(1000, 0), [placement('taxi', 400), placement('new', 50)]),
      { fraction: 0.25, pass: 2 }
    );
    expect(drawn.residents.map(item => [item.id, item.position.x])).toEqual([
      ['taxi', 100],
      ['new', 50]
    ]);
  });

  test('draws the structure of the pass whose cell the drawn eye stands in', () => {
    const views = new ViewInterpolator<TestView>(always);
    views.view(view('west', pose(CELL - 100, 0)), { fraction: 0, pass: 1 });
    const early = views.view(view('east', pose(CELL + 300, 0)), {
      fraction: 0.2,
      pass: 2
    });
    expect(early.pose.position.x).toBe(CELL - 20);
    expect(early.label).toBe('west');
    const late = views.view(view('east', pose(CELL + 300, 0)), {
      fraction: 0.5,
      pass: 2
    });
    expect(late.label).toBe('east');
  });
});

describe('models fixed to the view', () => {
  test('stay where the view holds them as the drawn eye lags', () => {
    const captured = pose(1000, Math.PI / 2);
    const drawn = pose(900, 0);
    // A model 50 units ahead of the captured eye, which faces east.
    const cab = placement('cab', 1050, {
      position: { x: 1050, y: 10, z: CELL / 2 }
    });
    const [carried] = followView([cab], captured, drawn);
    // Ahead of the drawn eye, which faces north.
    expect(carried!.position.x).toBeCloseTo(900, 9);
    expect(carried!.position.y).toBe(10);
    expect(carried!.position.z).toBeCloseTo(CELL / 2 + 50, 9);
    expect(carried!.heading).toBeCloseTo(-Math.PI / 2, 12);
  });
});

const sky = (x: number, stars: SkyPass['stars']): SkyPass => ({
  bodies: [
    {
      colour: '#ffffff',
      first: 'lit',
      id: 'sun',
      kind: 'disc',
      offset: { x, y: 1000, z: 0 },
      shadow: '#000000',
      size: 10,
      split: 1
    }
  ],
  halfWidthDivisor: 1,
  horizonCut: false,
  projectionScale: 256,
  stars
});

describe('blending the sky', () => {
  test('moves Bodies between passes and keeps stars fixed in the sky', () => {
    const from = pose(0, 0);
    const to = pose(0, 0.1);
    const drawn = blendPose(from, to, 0.5);
    // The current pass has turned 0.1 rad right: 25.6 pixels at 256 a unit tangent.
    const blended = blendSky(
      sky(0, [
        { colour: '#fff', column: 20, row: 20 },
        { colour: '#aaa', column: 315, row: 40 }
      ]),
      sky(100, [{ colour: '#aaa', column: 315 - 25.6, row: 40 }]),
      0.5,
      { drawn, from, to }
    )!;
    const [body] = blended.bodies;
    expect(body!.kind === 'disc' && body!.offset.x).toBe(50);
    // The first star has left the current pass's view, but the drawn eye, half way round,
    // still sees it from the previous pass's.
    expect(blended.stars.map(star => star.colour)).toEqual(['#fff', '#aaa']);
    expect(blended.stars[0]!.column).toBeCloseTo(20 - 12.8, 9);
    expect(blended.stars[1]!.column).toBeCloseTo(315 - 12.8, 9);
    expect(blended.stars[1]!.row).toBe(40);
  });
});
