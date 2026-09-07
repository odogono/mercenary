import type { SessionSnapshot } from '../session/index.ts';
import { locationText } from '../world/index.ts';
import { surfaceCellCoordinate } from '../world/surfaceCoordinates.ts';

/// What the Benson Panel needs beyond a Session Snapshot.
///
/// All of it is fixed content rather than session state: the grid the surface is divided into,
/// the names objects carry, and how long a Targ day lasts. Keeping it here rather than widening
/// the Snapshot leaves the Snapshot describing only what changes as the session runs.
export interface PanelContext {
  readonly cellSize: number;
  readonly clock: string;
  readonly objectNames: ReadonlyMap<number, string>;
}

/// Everything both Panel Renditions draw, derived once from the Snapshot.
///
/// The two renditions differ in dressing, not in facts: the Damocles panel shows Targ data in
/// Damocles clothes (ADR 0027), so one view model serves both.
export interface PanelViewModel {
  readonly altitude: string;
  readonly altitudeLamp: boolean;
  readonly attackLamp: boolean;
  readonly cash: string;
  readonly clock: string;
  readonly compassDegrees: number;
  readonly elevationDegrees: number;
  readonly groundLamp: boolean;
  readonly heading: string;
  readonly inventory: string;
  readonly inventoryFill: number;
  readonly locationLabel: string;
  readonly locationName: string;
  readonly message: string;
  readonly messageColour: number | undefined;
  readonly runLamp: boolean;
  readonly speed: string;
  readonly speedLabel: string;
}

const digits = (value: number, width: number): string =>
  String(Math.abs(Math.trunc(value))).padStart(width, '0');

const degrees = (radians: number): number => (radians * 180) / Math.PI;

/// Heading as the compass reads it: degrees clockwise, wrapped into one turn.
export const compassDegrees = (heading: number): number => {
  const wrapped = degrees(heading) % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

/// The panel's own grid reference, two digits per axis.
export const gridReference = (
  x: number,
  z: number,
  cellSize: number
): string => {
  const axis = (value: number): string => {
    const cell = surfaceCellCoordinate(value, cellSize);
    return cell > 99 ? '**' : digits(cell, 2);
  };
  return `${axis(x)}-${axis(z)}`;
};

/// Which objects the player is carrying, in acquisition order, named for the inventory window.
export const carriedNames = (
  snapshot: SessionSnapshot,
  objectNames: ReadonlyMap<number, string>
): readonly string[] =>
  snapshot.carriedStack.map(
    slot => objectNames.get(slot) ?? `OBJECT ${digits(slot, 2)}`
  );

export const panelViewModel = (
  snapshot: SessionSnapshot,
  context: PanelContext
): PanelViewModel => {
  const player = snapshot.player;
  const carried = carriedNames(snapshot, context.objectNames);
  const aboard = snapshot.occupancy.kind === 'aboard';
  const speed = Math.trunc(player.speed);
  return {
    // The ST instrument reads the middle/high altitude bytes. The low byte carries the
    // different on-foot and grounded-craft viewpoint offsets (128 and 63), neither of which is
    // height above the surface: both therefore read zero on the panel.
    altitude: digits(
      (snapshot.liftJourney?.instrumentAltitude ?? player.position.y) / 0x1_00,
      5
    ),
    altitudeLamp: aboard,
    // Targ has no attack warning to report, so the Damocles lamp stays dressing (ADR 0027).
    attackLamp: false,
    cash: digits(snapshot.credits, 9),
    clock: context.clock,
    compassDegrees: compassDegrees(player.heading),
    elevationDegrees: degrees(player.pitch),
    // The Reference Build's ground proximity warning has no equivalent here, so this reports the
    // one thing that is equivalent: a craft close enough to the ground to be landing on it.
    groundLamp: aboard && snapshot.mode === 'flying' && player.position.y < 40,
    heading: `${digits(compassDegrees(player.heading), 3)}°`,
    inventory: carried.at(-1) ?? 'EMPTY',
    inventoryFill: carried.length,
    locationLabel:
      snapshot.location.kind === 'room'
        ? `RM ${digits(snapshot.location.id, 2)}`
        : gridReference(player.position.x, player.position.z, context.cellSize),
    locationName:
      snapshot.location.kind === 'room'
        ? locationText(snapshot.location)
        : 'TARG',
    message: snapshot.bensonMessage?.displayText ?? '',
    messageColour: snapshot.bensonColour,
    runLamp: !aboard && player.speed !== 0,
    speed: `${speed < 0 ? '-' : '+'}${digits(speed, 4)}`,
    speedLabel: `${speed < 0 ? '-' : '+'} 000 000 ${digits(speed, 3)}`
  };
};

/// Name every object by slot, for the inventory window.
///
/// Built once from fixed content rather than read from the Snapshot: an object's name never
/// changes, only where it has got to.
export const objectNamesOf = (
  objects: readonly { readonly id: string; readonly slot: number }[]
): ReadonlyMap<number, string> =>
  new Map(
    objects.map(object => [object.slot, object.id.toUpperCase().slice(0, 16)])
  );
