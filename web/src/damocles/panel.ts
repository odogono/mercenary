import type { Vector3 } from '../orientation/index.ts';
import type { PanelViewModel } from '../shell/panel.ts';
import { impactTime } from './comet.ts';
import type { ErisPresentationDocument } from './documents.ts';
import type { DamoclesSnapshot } from './session.ts';
import type { ErisCell } from './world.ts';

/// The Damocles Panel Rendition fed by Damocles's own Session State (ADR 0043).
///
/// Under ADR 0027 the same chrome dressed Targ data; here every readout that has a recovered
/// meaning shows it, and every readout that does not is a static placeholder named as one.
/// The credit readout has no economy behind it yet, and on foot the craft velocity is nought.

/// One axis of the Cell Readout: the magnitude of an Island-Local Cell in two digits, or `**`
/// once that magnitude passes 99. The sign is not printed here — a negative axis is printed in
/// red instead, which is why the view model carries the signs beside the label (#397).
const digits = (value: number): string => {
  const magnitude = Math.abs(value);
  return magnitude > 99 ? '**' : String(magnitude).padStart(2, '0');
};

/// A bearing clockwise from north in degrees, which is what the recovered compass tape counts.
const bearingDegrees = (bearing: number): number => {
  const wrapped = ((bearing * 180) / Math.PI) % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

/// The Cell Readout, which prints the Island-Local Cell two digits an axis.
///
/// Damocles's surface is not Targ's bounded grid, so Targ's `gridReference` is not used: this
/// cell is signed and unbounded, and coincides with the bound workspace's own 0-15 cell only
/// while the player stands inside that 16-cell window.
export const cellReadout = (cell: ErisCell): string =>
  `${digits(cell.x)}-${digits(cell.z)}`;

/// The Cell Readout's two axes as the panel draws them, so a negative axis can be red.
export const cellReadoutAxes = (
  cell: ErisCell
): NonNullable<PanelViewModel['locationAxes']> => [
  { negative: cell.x < 0, text: digits(cell.x) },
  { negative: cell.z < 0, text: digits(cell.z) }
];

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

/// The two steps the engine keeps at `$7A1E` and `$7A22`, the z step biased a quarter turn. The
/// readout prints them, and the terminator reads them as longitude and latitude (#497).
export const bodySteps = (
  position: Vector3
): { readonly x: number; readonly z: number } => ({
  x: bodyStep(position.x),
  z: bodyStep(position.z, BODY_Z_BIAS)
});

/// The Body Coordinate Readout, from the player's position on the Body (#371).
export const bodyCoordinateReadout = (position: Vector3): string => {
  const steps = bodySteps(position);
  return `${bodyDigits(steps.x)}-${bodyDigits(steps.z)}`;
};

/// The impact clock, as `HH-MM-SS` counting down toward the comet's arrival (#368).
///
/// `$793C` holds minus the remaining seconds and counts up toward zero at 20 VBLs a displayed
/// second (#208), so a Session second is `vblHertz / impactVblsPerSecond` displayed seconds:
/// two and a half of them at PAL 50 Hz. A Session that models no impact still has to answer
/// for the moment the deadline runs out, and what it answers is `00-00-00`: the clock stops
/// there and play goes on, because there is no impact here to arrive.
export const impactClock = (
  elapsed: number,
  time: ErisPresentationDocument['time']
): string => {
  const remaining = -impactTime(elapsed, time).seconds;
  return [
    Math.floor(remaining / 3600),
    Math.floor(remaining / 60) % 60,
    remaining % 60
  ]
    .map(field => String(field).padStart(2, '0'))
    .join('-');
};

export const damoclesPanelViewModel = (
  snapshot: DamoclesSnapshot,
  doc: ErisPresentationDocument,
  running = false
): PanelViewModel => ({
  // The altitude window is six digits wide here, which is the width the original prints and
  // one wider than the Targ instrument the Benson Panel shares its view model with (#368).
  // The value behind it is still a placeholder: on foot there is no altitude to report.
  altitude: '000000',
  altitudeLamp: false,
  attackLamp: false,
  // The Body Coordinate Readout: the original prints `016-283` here at the Eris start pose,
  // which is what this reproduces (#371).
  bodyCoordinates: bodyCoordinateReadout(snapshot.pose.position),
  cash: '000,000,000.00',
  clock: impactClock(snapshot.elapsed, doc.time),
  compassDegrees: bearingDegrees(snapshot.pose.heading),
  damoclesDisplay: snapshot.displayCells,
  elevationDegrees: 0,
  groundLamp: true,
  inventory: snapshot.inventoryLabel,
  inventoryFill: snapshot.carried.length,
  locationAxes: cellReadoutAxes(snapshot.islandCell),
  locationLabel: cellReadout(snapshot.islandCell),
  locationName: snapshot.bodyName,
  message: '',
  messageColour: undefined,
  runLamp: running,
  speed: '+0000',
  speedLabel: '+ 000 000 000'
});
