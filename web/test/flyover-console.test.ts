import { describe, expect, test } from 'bun:test';

import {
  bodyEntryPose,
  nearestFlyoverBody,
  type FlyoverCameraState
} from '../src/flyover/camera.ts';
import {
  executeFlyoverConsoleCommand,
  parseFlyoverConsoleCommand,
  type FlyoverConsoleHost
} from '../src/flyover/console.ts';
import {
  readFlyoverPresentation,
  readGammaSystem
} from '../src/flyover/documents.ts';
import { bodyCoordinatesOf } from '../src/flyover/surfaceFrame.ts';
import {
  TargFlyoverClock,
  composeGammaSystem,
  composeTargSystem,
  type FlyoverSystem
} from '../src/flyover/system.ts';
import { defaultSettings } from '../src/settings/index.ts';
import { TARG_SYSTEM } from './fixtures/targSystem.ts';

const sky = defaultSettings().presentation.sky;
const targ = composeTargSystem(
  TARG_SYSTEM,
  readFlyoverPresentation(await Bun.file('flyover/targ.json').json(), 'targ', [
    'targ',
    'sun',
    'inner-moon',
    'outer-moon'
  ]),
  sky,
  new TargFlyoverClock(sky.dayLengthMinutes, () => 0)
);
const gammaAuthority = readGammaSystem(
  await Bun.file('../payload/damocles/system.json').json()
);
const gamma = composeGammaSystem(
  gammaAuthority,
  readFlyoverPresentation(
    await Bun.file('flyover/gamma.json').json(),
    'gamma',
    gammaAuthority.bodies
      .filter(body => body.positionKind === undefined)
      .map(body => body.id)
  )
);

const START: FlyoverCameraState = {
  pose: { heading: 1, pitch: 0.5, position: { x: 1, y: 2, z: 3 }, roll: 0 },
  speedNotch: 4
};

const hostFor = (system: FlyoverSystem) => {
  let camera = START;
  let resets = 0;
  const host: FlyoverConsoleHost = {
    bodies: () =>
      system.bodiesAt(
        system.systemId === 'targ' ? system.clock.elapsedSeconds() : 0
      ),
    camera: () => camera,
    reset: () => {
      resets += 1;
      camera = { ...START, speedNotch: 0 };
    },
    setCamera: next => {
      camera = next;
    },
    system
  };
  return {
    camera: () => camera,
    resets: () => resets,
    run: (line: string) =>
      executeFlyoverConsoleCommand(parseFlyoverConsoleCommand(line), host)
  };
};

describe('the Flyover console’s commands', () => {
  test('admit only the workbench’s own verbs', () => {
    for (const line of ['where', 'save 1', 'get 3', 'set typeface st']) {
      expect(() => parseFlyoverConsoleCommand(line)).toThrow('unknown command');
    }
    expect(parseFlyoverConsoleCommand('  GOTO  Body targ ')).toEqual({
      id: 'targ',
      kind: 'gotoBody'
    });
    expect(parseFlyoverConsoleCommand('time reset')).toEqual({
      kind: 'resetTime'
    });
    expect(parseFlyoverConsoleCommand('time 6:30')).toEqual({
      kind: 'setTime',
      secondsOfDay: 6.5 * 3600
    });
    expect(() => parseFlyoverConsoleCommand('pose now')).toThrow(
      'takes no value'
    );
    expect(() => parseFlyoverConsoleCommand('goto surface 0 91 0.1')).toThrow(
      'latitude'
    );
    expect(() => parseFlyoverConsoleCommand('goto surface 0 34 -1')).toThrow(
      'altitude'
    );
    expect(() => parseFlyoverConsoleCommand('goto surface 0 x 0.1')).toThrow(
      'latitude must be a number'
    );
  });

  test('goto body stops at the Body’s entry Pose, and an unknown ID keeps the Pose', () => {
    const console = hostFor(targ);
    expect(console.run('goto body sun')).toEqual(['moved to sun']);
    const sun = targ.bodiesAt(targ.clock.elapsedSeconds())[1]!;
    expect(console.camera()).toEqual({
      pose: bodyEntryPose(sun),
      speedNotch: 0
    });
    const before = console.camera();
    expect(console.run('goto body SUN')).toEqual(['unknown Body SUN']);
    expect(console.camera()).toBe(before);
  });

  test('goto surface places a stopped Camera that pose prints back exactly', () => {
    const console = hostFor(targ);
    const lines = console.run('goto surface 12.5 -20 0.07 30 -15');
    const { pose, speedNotch } = console.camera();
    expect(speedNotch).toBe(0);
    expect(pose.heading).toBeCloseTo((30 * Math.PI) / 180, 12);
    expect(pose.pitch).toBeCloseTo(2 * Math.PI - (15 * Math.PI) / 180, 12);
    const nearest = nearestFlyoverBody(pose.position, targ.bodiesAt(0));
    expect(nearest.body.id).toBe('targ');
    expect(nearest.normalizedSignedSurfaceDistance).toBeCloseTo(0.07, 12);
    const { latitude, longitude } = bodyCoordinatesOf(
      nearest.outwardDirection,
      targ.surfaceFrame.frameLatitude
    );
    expect((longitude * 180) / Math.PI).toBeCloseTo(12.5, 9);
    expect((latitude * 180) / Math.PI).toBeCloseTo(-20, 9);
    expect(lines[0]).toBe(
      'body targ · range coastal-surface · altitude 0.0700000'
    );
    const replay = lines.at(-1)!;
    expect(replay).toBe(
      'goto surface 12.500000 -20.000000 0.0700000000 30.000000 345.000000'
    );
    console.run('reset');
    console.run(replay);
    const again = console.camera().pose;
    expect(again.heading).toBeCloseTo(pose.heading, 9);
    expect(again.pitch).toBeCloseTo(pose.pitch, 9);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(Math.abs(again.position[axis] - pose.position[axis])).toBeLessThan(
        1
      );
    }
  });

  test('pose is read-only, and reset restores the overview', () => {
    const console = hostFor(targ);
    console.run('goto body targ');
    const before = console.camera();
    const lines = console.run('pose');
    expect(console.camera()).toBe(before);
    expect(lines[0]).toBe('body targ · range orbital · altitude 2.00000');
    expect(console.run('reset')).toEqual(['reset to the System overview']);
    expect(console.resets()).toBe(1);
  });

  test('time reads, sets and resets the Targ clock', () => {
    const console = hostFor(targ);
    expect(console.run('time')).toEqual(['time 09:00:00']);
    expect(console.run('time 21:15:30')).toEqual(['time 21:15:30']);
    expect(console.run('time')).toEqual(['time 21:15:30']);
    expect(console.run('time reset')).toEqual(['time 09:00:00']);
  });

  test('Gamma has no clock and no surface', () => {
    const console = hostFor(gamma);
    expect(console.run('time')).toEqual(['time is only in Targ']);
    expect(console.run('time 6:00')).toEqual(['time is only in Targ']);
    expect(console.run('goto surface 0 0 0.1')).toEqual([
      'goto surface is only in Targ'
    ]);
    expect(console.camera()).toBe(START);
    expect(console.run('goto body dialis')).toEqual(['moved to dialis']);
    expect(console.run('pose')).toHaveLength(3);
  });
});
