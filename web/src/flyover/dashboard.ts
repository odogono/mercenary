import { panelAttitude } from '../shell/attitude.ts';
import type { SystemId } from '../shell/documentPath.ts';
import type { PanelViewModel } from '../shell/panel.ts';
import { speedForNotch, type FlyoverCameraState } from './camera.ts';
import type { RangeReading } from './rangeHandoff.ts';
import type { FlyoverRangeReading, FlyoverSurfaceReading } from './reading.ts';
import type { FlyoverBody, FlyoverSystem } from './system.ts';

const scientific = (value: number, signed = false): string => {
  const magnitude = Math.abs(value).toExponential(3).replace('e', 'E');
  if (!signed) {
    return magnitude;
  }
  return `${value < 0 ? '-' : '+'}${magnitude}`;
};

const RANGE_LABEL: Readonly<Record<RangeReading, string>> = {
  coastal: 'COASTAL',
  'coastal-surface': 'COASTAL / SURFACE',
  orbital: 'ORBITAL',
  surface: 'SURFACE'
};

const DEGREES = 180 / Math.PI;

const angle = (
  radians: number,
  positive: string,
  negative: string,
  width: number
): string =>
  `${radians < 0 ? negative : positive}${Math.abs(radians * DEGREES)
    .toFixed(2)
    .padStart(width, '0')}`;

const surfaceAxis = (value: number): string =>
  String(Math.floor(value)).padStart(8, '0');

/// Coastal and Surface print where the Camera is over the Body: longitude and latitude, the
/// Island patch's surface X/Z, and signed altitude in Body radii (ADR 0094).
const surfaceReadouts = (surface: FlyoverSurfaceReading) => ({
  altitude: `H${scientific(surface.normalizedAltitude, true)} R`,
  bodyCoordinates: `${angle(surface.longitude, 'E', 'W', 6)} ${angle(
    surface.latitude,
    'N',
    'S',
    5
  )}`,
  locationLabel: `X${surfaceAxis(surface.x)} Z${surfaceAxis(surface.z)}`
});

export const flyoverPanelViewModel = (values: {
  readonly camera: FlyoverCameraState;
  readonly nearestBody: FlyoverBody;
  readonly reading: FlyoverRangeReading;
  readonly speedBounds: FlyoverSystem['cameraSpeed'];
  readonly systemId: SystemId;
}): PanelViewModel => {
  const position = values.camera.pose.position;
  const surface = values.reading.surface;
  const centre = values.nearestBody.position;
  return {
    // In Orbital Range the three navigation readouts carry the camera's offset from the nearest
    // body, one axis each, in the order the panel prints them: body coordinates, location,
    // altitude. Outside it the surface readouts replace them.
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
    message: `${RANGE_LABEL[values.reading.handoff.range]} FLYOVER`,
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
    )} U/S`,
    ...(surface === undefined ? {} : surfaceReadouts(surface))
  };
};
