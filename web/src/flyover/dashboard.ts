import type { SystemId } from '../shell/documentPath.ts';
import type { PanelViewModel } from '../shell/panel.ts';
import { speedForNotch, type FlyoverCameraState } from './camera.ts';
import type { FlyoverRange } from './documents.ts';
import type { FlyoverBody, FlyoverSystem } from './system.ts';

const scientific = (value: number, signed = false): string => {
  const magnitude = Math.abs(value).toExponential(3).replace('e', 'E');
  if (!signed) {
    return magnitude;
  }
  return `${value < 0 ? '-' : '+'}${magnitude}`;
};

const degrees = (radians: number): number => (radians * 180) / Math.PI;

const wrappedDegrees = (radians: number): number => {
  const value = degrees(radians) % 360;
  return value < 0 ? value + 360 : value;
};

export const flyoverPanelViewModel = (values: {
  readonly camera: FlyoverCameraState;
  readonly nearestBody: FlyoverBody;
  readonly range: FlyoverRange;
  readonly speedBounds: FlyoverSystem['cameraSpeed'];
  readonly systemId: SystemId;
}): PanelViewModel => {
  const position = values.camera.pose.position;
  const centre = values.nearestBody.position;
  return {
    altitude: `Y${scientific(position.y - centre.y, true)}`,
    altitudeLamp: false,
    attackLamp: false,
    cash: '',
    clock: '',
    compassDegrees: wrappedDegrees(values.camera.pose.heading),
    elevationDegrees: degrees(values.camera.pose.pitch),
    groundLamp: false,
    heading: `Z${scientific(position.z - centre.z, true)}`,
    inventory: '',
    inventoryFill: 0,
    locationLabel: `X${scientific(position.x - centre.x, true)}`,
    locationName: `${values.systemId.toUpperCase()} · ${values.nearestBody.id.toUpperCase()}`,
    message: `${values.range.toUpperCase()} FLYOVER`,
    messageColour: undefined,
    runLamp: false,
    speed: scientific(
      speedForNotch(values.speedBounds, values.camera.speedNotch)
    ),
    speedLabel: `N${String(values.camera.speedNotch).padStart(
      2,
      '0'
    )} ${scientific(
      speedForNotch(values.speedBounds, values.camera.speedNotch)
    )} U/S`
  };
};
