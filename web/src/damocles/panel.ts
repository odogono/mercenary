import type { Vector3 } from '../orientation/index.ts';
import type {
  CentreBoxPanel,
  CentreBoxView,
  PanelViewModel
} from '../shell/panel.ts';
import { impactTime, type ImpactTime } from './comet.ts';
import type { ErisPresentationDocument } from './documents.ts';
import {
  CENTRE_BOX_ROWS,
  TRANSITION_VBLS,
  type CentreBoxSnapshot,
  type DocumentPanel
} from './headCommands.ts';
import type { DamoclesSnapshot } from './session.ts';
import type { ErisCell } from './world.ts';

/// The Damocles Panel Rendition fed by Damocles's own Session State (ADR 0043).
///
/// Under ADR 0027 the same chrome dressed Targ data; here every readout that has a recovered
/// meaning shows it, and every readout that does not is a static placeholder named as one.
/// The credit readout has no economy behind it yet. The speed field and the altitude window
/// read the craft Mover's words aboard (#556). The second lamp is the encounter gate `$070104`,
/// which TOLOSA's landing script arms (#576).

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

const wrapStep = (step: number): number =>
  ((step % BODY_STEPS) + BODY_STEPS) % BODY_STEPS;

/// `bodySteps` before the shift drops the fraction: where between two steps the player stands.
/// Only the Enhanced sky reads it; the engine never sees a fractional step.
export const continuousBodySteps = (
  position: Vector3
): { readonly x: number; readonly z: number } => ({
  x: wrapStep(position.x / BODY_STEP_UNITS),
  z: wrapStep(position.z / BODY_STEP_UNITS + BODY_Z_BIAS)
});

/// The Body Coordinate Readout, from the player's position on the Body (#371).
export const bodyCoordinateReadout = (position: Vector3): string => {
  const steps = bodySteps(position);
  return `${bodyDigits(steps.x)}-${bodyDigits(steps.z)}`;
};

/// `$04E1B4`: the balance's twelve digits less the first, as `ddd,ddd,ddd.dd`. A New Game
/// reads `000,009,000.00`.
export const cashReadout = (balance: number): string => {
  const digits = String(balance).padStart(12, '0').slice(1);
  return `${digits.slice(0, 3)},${digits.slice(3, 6)},${digits.slice(6, 9)}.${digits.slice(9)}`;
};

/// The impact clock, as `HH-MM-SS` counting down, then up past zero (#368, #624).
///
/// `$793C` holds minus the remaining seconds and counts up toward zero at 50 VBLs a displayed
/// second (#551, correcting #208's 20), so a Session second is `vblHertz / impactVblsPerSecond`
/// displayed seconds: exactly one at PAL 50 Hz, on foot and aboard on a Body. The ST continues
/// counting after zero and rolls whole days into `$7940`.
export const impactClock = (
  elapsed: number,
  time: ErisPresentationDocument['time']
): string => clockReadout(impactTime(elapsed, time));

/// The clock's readout from `$793C` itself, which MORE TIME slows (#625).
export const clockReadout = (impact: ImpactTime): string => {
  const remaining = Math.abs(impact.seconds) % 86_400;
  return [
    Math.floor(remaining / 3600),
    Math.floor(remaining / 60) % 60,
    remaining % 60
  ]
    .map(field => String(field).padStart(2, '0'))
    .join('-');
};

/// `$04DFF4`: the speed field from `$04DFEC`, a sign then nine digits read as a 4.28 fraction.
/// The first digit is the long's top nibble; each later one is the top nibble after the long
/// is masked to 28 bits and multiplied by ten. The sign is the speed float's mantissa word
/// `$797C`, so a craft gliding back after a refused move reads `-` (#551).
export const speedField = (panelSpeed: number, speed: number): string => {
  let value = panelSpeed >>> 0;
  let digits = '';
  for (let index = 0; index < 9; index += 1) {
    digits += String(Math.floor(value / 0x10_00_00_00));
    value = (value & 0x0f_ff_ff_ff) * 10;
  }
  const sign = (speed & 0x80_00) === 0 ? '+' : '-';
  return `${sign} ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
};

/// `$04DF42`: the altitude window on a Body. Eye Y shifted right four and rounded on the bit
/// shifted out, printed as 16.16: two whole digits, then the fraction times 100 twice. A whole
/// part of 100 or more, or Floor 10, prints six stars (#551).
export const altitudeWindow = (eyeY: number, floor: number): string => {
  const y = Math.floor(eyeY);
  return printedAltitude(
    floor === 10 ? 0x7f_ff_ff_ff : (y >> 4) + ((y >> 3) & 1)
  );
};

/// `$04DF5C`, the printer both altitude forms share: the long as 16.16, two whole digits and
/// the fraction times 100 twice, or six stars from a whole part of 100. In space the value is
/// `$04DEEE`'s, the range ÷ 16,384 (#558).
export const printedAltitude = (long: number): string => {
  const value = long >>> 0;
  const whole = Math.floor(value / 0x1_00_00);
  if (whole >= 100) {
    return '******';
  }
  let fraction = value & 0xff_ff;
  let digits = String(whole).padStart(2, '0');
  for (let pair = 0; pair < 2; pair += 1) {
    fraction *= 100;
    digits += String(Math.floor(fraction / 0x1_00_00)).padStart(2, '0');
    fraction &= 0xff_ff;
  }
  return digits;
};

/// An ST `0RGB` word as a CSS colour, three bits a channel as the catalogue extractor expands
/// them.
export const stColour = (word: number): string =>
  `#${[8, 4, 0]
    .map(shift => (((word >> shift) & 7) * 34).toString(16).padStart(2, '0'))
    .join('')}`;

const boxPanel = (panel: DocumentPanel | null): CentreBoxPanel | null =>
  panel === null
    ? null
    : {
        field: stColour(panel.colour3),
        ground: stColour(panel.colour15),
        item: panel.item,
        kind: panel.kind,
        parameter: panel.parameter,
        title: panel.title
      };

/// `$05293E`, one row a VBL: the panel scrolling out rises for the first 32 steps, and the one
/// scrolling in rises from below the window for the last 32.
export const centreBoxView = (box: CentreBoxSnapshot): CentreBoxView =>
  box.steps === 0
    ? { panel: boxPanel(box.from), top: 0 }
    : box.steps >= CENTRE_BOX_ROWS
      ? { panel: boxPanel(box.from), top: box.steps - TRANSITION_VBLS }
      : { panel: boxPanel(box.to), top: box.steps };

/// `$7AB6` below which `$0509F6` lights the first lamp aboard (docs/research/damocles-panel-lamps.md).
const LOW_ALTITUDE_LAMP_UNITS = 0x28_fa;

export const damoclesPanelViewModel = (
  snapshot: DamoclesSnapshot,
  doc: ErisPresentationDocument,
  running = false
): PanelViewModel => ({
  // The altitude window is six digits wide here, which is the width the original prints and
  // one wider than the Targ instrument the Benson Panel shares its view model with (#368). It
  // reads eye Y on foot as aboard, so it shows `000000` at the ground and stars on Floor 10.
  altitude:
    snapshot.craft?.space === undefined || snapshot.craft.space === null
      ? altitudeWindow(snapshot.pose.position.y, snapshot.structure?.floor ?? 0)
      : printedAltitude(snapshot.craft.space.altitude),
  altitudeLamp: false,
  // `$050A5C`: lit red while the encounter gate `$070104` is non-zero.
  attackLamp: snapshot.encounter !== 0,
  // The Body Coordinate Readout: the original prints `016-283` here at the Eris start pose,
  // which is what this reproduces (#371).
  bodyCoordinates: bodyCoordinateReadout(snapshot.pose.position),
  cash: cashReadout(snapshot.balance),
  centreBox: centreBoxView(snapshot.centreBox),
  clock: clockReadout(snapshot.impact),
  compassDegrees: bearingDegrees(snapshot.pose.heading),
  damoclesDisplay: snapshot.displayCells,
  elevationDegrees: 0,
  panelMask: snapshot.panelMask,
  // `$0509F6`: lit only aboard (`$7A8E` clear) with the eye below `$28FA`, so a craft on the
  // ground lights it and the player on foot never does. In space `$7A8E` is 2.
  groundLamp:
    snapshot.occupancy.kind === 'aboard' &&
    (snapshot.craft?.space ?? null) === null &&
    snapshot.pose.position.y < LOW_ALTITUDE_LAMP_UNITS,
  inventory: snapshot.inventoryLabel,
  inventoryFill: snapshot.carried.length,
  locationAxes: cellReadoutAxes(snapshot.islandCell),
  locationLabel: cellReadout(snapshot.islandCell),
  locationName: snapshot.bodyName,
  message: '',
  messageColour: undefined,
  runLamp: running,
  speed: '+0000',
  // Cleared by boarding and by the stop preset leaving runs, so on foot it reads nought.
  speedLabel:
    snapshot.craft === null
      ? '+ 000 000 000'
      : speedField(snapshot.craft.panelSpeed, snapshot.craft.speed)
});
