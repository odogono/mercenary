import type { PanelViewModel } from '../shell/panel.ts';
import type { ErisPresentationDocument } from './documents.ts';
import type { DamoclesSnapshot } from './session.ts';
import type { ErisCell } from './world.ts';

/// The Damocles Panel Rendition fed by Damocles's own Session State (ADR 0043).
///
/// Under ADR 0027 the same chrome dressed Targ data; here every readout that has a recovered
/// meaning shows it, and every readout that does not is a static placeholder named as one.
/// The impact clock and the second navigation coordinate are undecoded (#208), the credit
/// readout has no economy behind it yet, and on foot the craft velocity is nought.

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

export const damoclesPanelViewModel = (
  snapshot: DamoclesSnapshot,
  doc: ErisPresentationDocument,
  walking = false
): PanelViewModel => ({
  altitude: '00000',
  altitudeLamp: false,
  attackLamp: false,
  cash: '000,000,000.00',
  clock: '',
  compassDegrees: bearingDegrees(snapshot.pose.heading),
  elevationDegrees: 0,
  groundLamp: true,
  heading: `${String(Math.round(bearingDegrees(snapshot.pose.heading)) % 360).padStart(3, '0')}°`,
  inventory: snapshot.carried.at(-1) ?? 'EMPTY',
  inventoryFill: snapshot.carried.length,
  locationLabel: erisGridReference(snapshot.cell),
  locationName: doc.body.name,
  message: '',
  messageColour: undefined,
  runLamp: walking,
  speed: '+0000',
  speedLabel: '+ 000 000 000'
});
