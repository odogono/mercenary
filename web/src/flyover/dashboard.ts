import { panelAttitude } from '../shell/attitude.ts';
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
    // The three navigation readouts carry the camera's offset from the nearest body, one axis
    // each, in the order the panel prints them: body coordinates, location, altitude.
    altitude: `Z${scientific(position.z - centre.z, true)}`,
    altitudeLamp: false,
    attackLamp: false,
    bodyCoordinates: `X${scientific(position.x - centre.x, true)}`,
    cash: '',
    clock: '',
    ...panelAttitude(values.camera.pose, 'bearing'),
    groundLamp: false,
    inventory: '',
    inventoryFill: 0,
    locationAxes: undefined,
    locationLabel: `Y${scientific(position.y - centre.y, true)}`,
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
