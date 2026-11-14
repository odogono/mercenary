import { panelAttitude } from '../shell/attitude.ts';
import type { SystemId } from '../shell/documentPath.ts';
import { gridReference, type PanelViewModel } from '../shell/panel.ts';
import { speedForNotch, type FlyoverCameraState } from './camera.ts';
import type { RangeReading } from './rangeHandoff.ts';
import type { FlyoverRangeReading } from './reading.ts';
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

/// Targ's Surface Cell, which the panel's grid reference counts in.
const TARG_CELL_SIZE = 0x1_00_00;

/// The game's panel prints height and speed in 256ths of a surface unit (ADR 0072).
const TARG_PANEL_SCALE = 0x1_00;

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

const digits = (value: number, width: number): string =>
  String(Math.max(0, Math.trunc(value))).padStart(width, '0');

interface FlyoverReadoutValues {
  readonly camera: FlyoverCameraState;
  readonly nearestBody: FlyoverBody;
  readonly reading: FlyoverRangeReading;
  readonly speedBounds: FlyoverSystem['cameraSpeed'];
}

const sessionlessPanel = {
  altitudeLamp: false,
  attackLamp: false,
  cash: '',
  clock: '',
  groundLamp: false,
  inventory: '',
  inventoryFill: 0,
  locationAxes: undefined,
  messageColour: undefined,
  runLamp: false
} as const;

/// The Gamma Flyover on the Damocles panel: the Camera's offset from the nearest Body, one
/// axis in each navigation readout, in the order the panel prints them.
export const flyoverPanelViewModel = (
  values: FlyoverReadoutValues & { readonly systemId: SystemId }
): PanelViewModel => {
  const position = values.camera.pose.position;
  const centre = values.nearestBody.position;
  const speed = speedForNotch(values.speedBounds, values.camera.speedNotch);
  return {
    ...sessionlessPanel,
    altitude: `Z${scientific(position.z - centre.z, true)}`,
    bodyCoordinates: `X${scientific(position.x - centre.x, true)}`,
    ...panelAttitude(values.camera.pose, 'bearing'),
    locationLabel: `Y${scientific(position.y - centre.y, true)}`,
    locationName: `${values.systemId.toUpperCase()} · ${values.nearestBody.id.toUpperCase()}`,
    message: `${RANGE_LABEL[values.reading.handoff.range]} FLYOVER`,
    speed: scientific(speed),
    speedLabel: `N${String(values.camera.speedNotch).padStart(
      2,
      '0'
    )} ${scientific(speed)} U/S`
  };
};

/// The Targ Flyover on the game's own Targ panel, reading what the game would: the grid
/// reference under the Camera, its height above the nearest Body and its speed, both in the
/// panel's scale, and the Range in the Benson window. A value too wide for its field reads as
/// asterisks there, as the Arrival's do in space.
export const targFlyoverPanelViewModel = (
  values: FlyoverReadoutValues
): PanelViewModel => {
  const surface = values.reading.surface;
  const centre = values.nearestBody.position;
  const position = values.camera.pose.position;
  const height =
    Math.hypot(
      position.x - centre.x,
      position.y - centre.y,
      position.z - centre.z
    ) - values.nearestBody.displayRadiusUnits;
  const speed =
    speedForNotch(values.speedBounds, values.camera.speedNotch) /
    TARG_PANEL_SCALE;
  return {
    ...sessionlessPanel,
    altitude: digits(height / TARG_PANEL_SCALE, 5),
    bodyCoordinates: '000-000',
    ...panelAttitude(values.camera.pose, 'bearing'),
    locationLabel:
      surface === undefined
        ? '**-**'
        : gridReference(surface.x, surface.z, TARG_CELL_SIZE),
    locationName: values.nearestBody.id.toUpperCase(),
    message: RANGE_LABEL[values.reading.handoff.range],
    speed: `+${digits(speed, 4)}`,
    speedLabel: `+ 000 000 ${digits(speed, 3)}`
  };
};

/// The Flyover's inspection values that no panel has room for: Body-relative Cartesian
/// coordinates in Orbital, and outside it longitude and latitude, the Island patch's surface
/// X/Z and signed altitude in Body radii (ADR 0094).
export const flyoverInspectionLine = (
  values: Omit<FlyoverReadoutValues, 'speedBounds'>
): string => {
  const name = values.nearestBody.id.toUpperCase();
  const surface = values.reading.surface;
  if (surface === undefined) {
    const position = values.camera.pose.position;
    const centre = values.nearestBody.position;
    return `${name}  X${scientific(position.x - centre.x, true)} Y${scientific(
      position.y - centre.y,
      true
    )} Z${scientific(position.z - centre.z, true)}`;
  }
  return [
    name,
    `${angle(surface.longitude, 'E', 'W', 6)} ${angle(surface.latitude, 'N', 'S', 5)}`,
    `X${surfaceAxis(surface.x)} Z${surfaceAxis(surface.z)}`,
    `H${scientific(surface.normalizedAltitude, true)} R`
  ].join('  ');
};
