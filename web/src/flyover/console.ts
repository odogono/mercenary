import { formatTargTime, parseTargTime } from '../sky/time.ts';
import {
  bodyEntryPose,
  nearestFlyoverBody,
  type FlyoverCameraState
} from './camera.ts';
import { flyoverRangeReading } from './reading.ts';
import { bodyCoordinatesOf, bodyDirectionOf } from './surfaceFrame.ts';
import type { FlyoverBody, FlyoverSystem } from './system.ts';

/// The Flyover's Shell Console (#188): the internal workbench's own few commands. It places the
/// Camera, reads and sets the Targ clock and reports the Pose; it has no gameplay, Save, object or
/// preference commands, and it never changes the address.

export type FlyoverConsoleCommand =
  | { readonly kind: 'help' }
  | { readonly id: string; readonly kind: 'gotoBody' }
  | {
      /// Signed height above TARG in Body radii.
      readonly altitude: number;
      /// The Camera's own heading and pitch, in degrees, as `pose` prints them.
      readonly heading: number;
      readonly kind: 'gotoSurface';
      readonly latitude: number;
      readonly longitude: number;
      readonly pitch: number;
    }
  | { readonly kind: 'pose' }
  | { readonly kind: 'reset' }
  | { readonly kind: 'resetTime' }
  | { readonly kind: 'setTime'; readonly secondsOfDay: number }
  | { readonly kind: 'time' };

export const FLYOVER_CONSOLE_BANNER = [
  'flyover console',
  'a development tool: type help for commands'
] as const;

const HELP = [
  'help · pose · reset',
  'goto body <id>',
  'goto surface <longitude> <latitude> <altitude> [heading] [pitch]',
  '  degrees, altitude in Body radii; Targ only',
  'time · time <h:mm[:ss]> · time reset; Targ only'
];

const number = (value: string, name: string): number => {
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number, and is '${value}'`);
  }
  return parsed;
};

export const parseFlyoverConsoleCommand = (
  line: string
): FlyoverConsoleCommand => {
  const words = line.trim().split(/\s+/);
  const [verb, ...rest] = [words[0]!.toLowerCase(), ...words.slice(1)];
  switch (verb) {
    case 'help':
    case 'pose':
    case 'reset':
      if (rest.length > 0) {
        throw new Error(`${verb} takes no value`);
      }
      return { kind: verb };
    case 'time':
      if (rest.length === 0) {
        return { kind: 'time' };
      }
      if (rest.length !== 1) {
        throw new Error('time takes no value, one H:MM[:SS] value or reset');
      }
      return rest[0]!.toLowerCase() === 'reset'
        ? { kind: 'resetTime' }
        : { kind: 'setTime', secondsOfDay: parseTargTime(rest[0]!) };
    case 'goto': {
      const [target, ...values] = rest;
      if (target?.toLowerCase() === 'body') {
        if (values.length !== 1) {
          throw new Error('goto body takes one Body ID');
        }
        return { id: values[0]!, kind: 'gotoBody' };
      }
      if (target?.toLowerCase() === 'surface') {
        if (values.length < 3 || values.length > 5) {
          throw new Error(
            'goto surface takes a longitude, latitude and altitude, then an optional heading and pitch'
          );
        }
        const longitude = number(values[0]!, 'longitude');
        const latitude = number(values[1]!, 'latitude');
        const altitude = number(values[2]!, 'altitude');
        if (Math.abs(latitude) > 90) {
          throw new Error(
            `latitude must be from -90 to 90, and is ${latitude}`
          );
        }
        if (altitude <= -1) {
          throw new Error(
            `altitude must be above -1 Body radius, and is ${altitude}`
          );
        }
        return {
          altitude,
          heading: number(values[3] ?? '0', 'heading'),
          kind: 'gotoSurface',
          latitude,
          longitude,
          pitch: number(values[4] ?? '0', 'pitch')
        };
      }
      throw new Error('goto takes body <id> or surface <values>');
    }
    default:
      throw new Error(`unknown command '${words[0]}': type help`);
  }
};

export interface FlyoverConsoleHost {
  /// The Bodies where the Flyover clock now puts them.
  readonly bodies: () => readonly FlyoverBody[];
  readonly camera: () => FlyoverCameraState;
  /// Restore the System overview, reset the Targ clock and stop the Camera.
  readonly reset: () => void;
  readonly setCamera: (camera: FlyoverCameraState) => void;
  readonly system: FlyoverSystem;
}

const TURN = 2 * Math.PI;
const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const degrees = (value: number): number => (value * 180) / Math.PI;
const wrapped = (value: number): number => ((value % TURN) + TURN) % TURN;
/// Six decimal places of a degree is a few System units on TARG: enough to retype any view.
const angle = (value: number): string => degrees(value).toFixed(6);

const describePose = (host: FlyoverConsoleHost): readonly string[] => {
  const { system } = host;
  const { pose, speedNotch } = host.camera();
  const nearest = nearestFlyoverBody(pose.position, host.bodies());
  const { handoff } = flyoverRangeReading(system, nearest);
  const altitude = nearest.normalizedSignedSurfaceDistance;
  const lines = [
    `body ${nearest.body.id} · range ${handoff.range} · altitude ${altitude.toPrecision(6)}`,
    `position x ${pose.position.x} y ${pose.position.y} z ${pose.position.z}`,
    `heading ${angle(pose.heading)} · pitch ${angle(pose.pitch)} · speed notch ${speedNotch}`
  ];
  if (system.systemId !== 'targ' || nearest.body.id !== 'targ') {
    return lines;
  }
  const { latitude, longitude } = bodyCoordinatesOf(
    nearest.outwardDirection,
    system.surfaceFrame.frameLatitude
  );
  return [
    ...lines,
    `goto surface ${angle(longitude)} ${angle(latitude)} ${altitude.toPrecision(9)} ${angle(pose.heading)} ${angle(pose.pitch)}`
  ];
};

export const executeFlyoverConsoleCommand = (
  command: FlyoverConsoleCommand,
  host: FlyoverConsoleHost
): readonly string[] => {
  const { system } = host;
  switch (command.kind) {
    case 'help':
      return HELP;
    case 'pose':
      return describePose(host);
    case 'reset':
      host.reset();
      return ['reset to the System overview'];
    case 'gotoBody': {
      // The same stopped Pose as `?body=`, at the Body's place on the Flyover clock now.
      const body = host.bodies().find(candidate => candidate.id === command.id);
      if (body === undefined) {
        return [`unknown Body ${command.id}`];
      }
      host.setCamera({ pose: bodyEntryPose(body), speedNotch: 0 });
      return [`moved to ${body.id}`];
    }
    case 'gotoSurface': {
      if (system.systemId !== 'targ') {
        return ['goto surface is only in Targ'];
      }
      const targ = host.bodies().find(body => body.id === 'targ')!;
      const direction = bodyDirectionOf(
        radians(command.longitude),
        radians(command.latitude),
        system.surfaceFrame.frameLatitude
      );
      const distance = targ.displayRadiusUnits * (1 + command.altitude);
      host.setCamera({
        pose: {
          heading: wrapped(radians(command.heading)),
          pitch: wrapped(radians(command.pitch)),
          position: {
            x: targ.position.x + direction.x * distance,
            y: targ.position.y + direction.y * distance,
            z: targ.position.z + direction.z * distance
          },
          roll: 0
        },
        speedNotch: 0
      });
      return describePose(host);
    }
    case 'time':
    case 'setTime':
    case 'resetTime': {
      if (system.systemId !== 'targ') {
        return ['time is only in Targ'];
      }
      if (command.kind === 'setTime') {
        system.clock.setTime(command.secondsOfDay);
      } else if (command.kind === 'resetTime') {
        system.clock.reset();
      }
      return [`time ${formatTargTime(system.clock.secondsOfDay())}`];
    }
  }
};
