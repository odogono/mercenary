import type { Vector3 } from '../orientation/index.ts';
import type { PanelViewModel } from '../shell/panel.ts';
import type { ErisPresentationDocument } from './documents.ts';
import type { DamoclesSnapshot } from './session.ts';
import type { ErisCell } from './world.ts';

/// The Damocles Panel Rendition fed by Damocles's own Session State (ADR 0043).
///
/// Under ADR 0027 the same chrome dressed Targ data; here every readout that has a recovered
/// meaning shows it, and every readout that does not is a static placeholder named as one.
/// The credit readout has no economy behind it yet, and on foot the craft velocity is nought. The impact clock is a
/// different case: #208 bound its encoding, and what this Session lacks is an impact deadline
/// to count down rather than a reading it cannot decode (#368).

/// The NAV readout's cell, two digits an axis. Damocles's grid is not Targ's wrapping surface,
/// so Targ's `gridReference` is not used; a cell outside the workspace prints as `**`.
const digits = (value: number): string =>
  value < 0 || value > 99 ? '**' : String(value).padStart(2, '0');

/// A bearing clockwise from north in degrees, which is what the recovered compass tape counts.
const bearingDegrees = (bearing: number): number => {
  const wrapped = ((bearing * 180) / Math.PI) % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

export const erisGridReference = (cell: ErisCell): string =>
  `${digits(cell.x)}-${digits(cell.z)}`;

/// One Body Coordinate step: `$40000` engine units, which is four Surface Cells. A Body's
/// surface spans 1024 steps an axis, so a 16-cell workspace covers four of them.
const BODY_STEP_UNITS = 0x4_00_00;
const BODY_STEPS = 0x4_00;
/// The quarter-turn the engine adds to the z step before masking (`addi.w #$100`).
const BODY_Z_BIAS = 0x1_00;

/// A body world coordinate as its ten-bit step, the quantity the engine keeps at `$7A1E` and
/// `$7A22`: an arithmetic shift right by 18 masked to ten bits (#371).
const bodyStep = (value: number, bias = 0): number =>
  (((Math.floor(value / BODY_STEP_UNITS) + bias) % BODY_STEPS) + BODY_STEPS) %
  BODY_STEPS;

/// One printed field: the ten-bit step rescaled from 1024 to 1000, which is the original's
/// `mulu.w #$FA00` followed by `swap`, then split into three decimal digits.
const bodyDigits = (step: number): string =>
  String(Math.floor((step * 1000) / 1024)).padStart(3, '0');

/// The Body Coordinate Readout, from the player's position on the Body (#371).
export const bodyCoordinateReadout = (position: Vector3): string =>
  `${bodyDigits(bodyStep(position.x))}-${bodyDigits(bodyStep(position.z, BODY_Z_BIAS))}`;

export const damoclesPanelViewModel = (
  snapshot: DamoclesSnapshot,
  doc: ErisPresentationDocument,
  running = false
): PanelViewModel => ({
  altitude: '00000',
  altitudeLamp: false,
  attackLamp: false,
  // The Body Coordinate Readout: the original prints `016-283` here at the Eris start pose,
  // which is what this reproduces (#371).
  bodyCoordinates: bodyCoordinateReadout(snapshot.pose.position),
  cash: '000,000,000.00',
  clock: '',
  compassDegrees: bearingDegrees(snapshot.pose.heading),
  damoclesDisplay: snapshot.displayCells,
  elevationDegrees: 0,
  groundLamp: true,
  inventory: snapshot.inventoryLabel,
  inventoryFill: snapshot.carried.length,
  locationLabel: erisGridReference(snapshot.cell),
  locationName: snapshot.bodyName,
  message: '',
  messageColour: undefined,
  runLamp: running,
  speed: '+0000',
  speedLabel: '+ 000 000 000'
});
