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
/// A document's panel in the Damocles centre box: its title, `− ITEM +`, `INDEX` and `PRESS * TO
/// VIEW`, over its own two colours.
export interface CentreBoxPanel {
  /// Colour 3, the item name's field.
  readonly field: string;
  /// Colour 15, the window's ground.
  readonly ground: string;
  /// The current item's name, or a switch's lamp, which is drawn only once the panel has arrived
  /// (`$0529D6`).
  readonly item: string | null;
  /// A document's panel pages items; a switch's shows its lamp between `−` and `+`; the AUTHORS
  /// COMPUTER's shows its option and value (#628).
  readonly kind: 'computer' | 'document' | 'switch';
  /// The computer's option, `PARAMETER No`, once drawn; null elsewhere.
  readonly parameter: number | null;
  readonly title: string;
}

/// What the centre box's 64-by-32 window shows. The transition moves the window's contents up a
/// row a VBL: the old panel rises out over black rows, and then the new one rises in.
export interface CentreBoxView {
  /// The panel in the window, or null for the DAMOCLES logo.
  readonly panel: CentreBoxPanel | null;
  /// The row the panel's top stands on: 0 at rest, below 0 while it rises out, above 0 while it
  /// rises in.
  readonly top: number;
}

/// An ST `0RGB` XOR mask on the Benson Panel's palette: `$7A52`, which the Damocles AUTHORS
/// COMPUTER's option 1 writes into all sixteen of the panel's colours but black (#628). The
/// message bar keeps its own.

export interface PanelViewModel {
  /// The altitude window, already formatted, because its width belongs to the rendition and
  /// not to this view model: Targ prints the documented five-digit instrument, Damocles the
  /// six digits the original prints (#368).
  readonly altitude: string;
  readonly altitudeLamp: boolean;
  readonly attackLamp: boolean;
  /// The wide navigation readout: the body coordinates the original prints as `999-999`.
  readonly bodyCoordinates: string;
  readonly cash: string;
  /// The Damocles centre box, where a document opens (#598). A rendition without one leaves it
  /// out.
  readonly centreBox?: CentreBoxView;
  readonly clock: string;
  readonly compassDegrees: number;
  readonly damoclesDisplay?: {
    readonly cells: string;
    /// Each cell's bitplane: 0 is the ordinary ink and 1 a Read's.
    readonly planes: readonly (0 | 1)[];
    readonly scrollPixels: number;
  };
  readonly elevationDegrees: number;
  readonly groundLamp: boolean;
  readonly inventory: string;
  readonly inventoryFill: number;
  /// The location readout's axes, where the rendition prints a signed one: one entry an axis in
  /// printed order, each saying whether it is negative and so drawn red. `undefined` says the
  /// readout carries no sign, which is Targ's bounded grid reference and the Flyover's offset;
  /// only the Damocles Cell Readout is signed (#397).
  readonly locationAxes:
    | readonly { readonly negative: boolean; readonly text: string }[]
    | undefined;
  readonly locationLabel: string;
  readonly locationName: string;
  readonly message: string;
  readonly messageColour: number | undefined;
  /// The panel palette's XOR mask; 0, or absent in a rendition without one, leaves it as drawn.
  readonly panelMask?: number;
  readonly runLamp: boolean;
  readonly speed: string;
  readonly speedLabel: string;
}

const digits = (value: number, width: number): string =>
  String(Math.abs(Math.trunc(value))).padStart(width, '0');

const degrees = (radians: number): number => (radians * 180) / Math.PI;

/// Credits as the Damocles readout prints them: nine digits in thousands, to the cent.
///
/// Targ credits are whole numbers, so the cents are always nought; they are there because the
/// readout being dressed always shows them.
const cashReadout = (credits: number): string =>
  `${digits(credits, 9).replaceAll(/(\d{3})(?=\d)/g, '$1,')}.00`;

/// Keep the Browser Shell's displayed bearings while the simulation uses raw
/// Reference Build yaw. The original opening yaw is a half turn; it remains
/// displayed as zero, as do schema-11 Saves after their half-turn migration.
/// This full-turn numbering is presentation, not the C64's coloured half-turn tape.
export const compassDegrees = (heading: number): number => {
  const wrapped = (degrees(heading) + 180) % 360;
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

/// `running` arrives beside the Snapshot rather than inside it or inside `PanelContext`: the
/// run toggle is Control Profile state, which is neither session state nor fixed content.
export const panelViewModel = (
  snapshot: SessionSnapshot,
  context: PanelContext,
  running = false
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
    // Targ's panel has no body-coordinate readout to report, so the Damocles rendition's
    // stands at nought as dressing (ADR 0027); the cell it does have is the location readout.
    // Damocles' own readout is computed from the Body the player stands on (#371).
    bodyCoordinates: '000-000',
    cash: cashReadout(snapshot.credits),
    clock: context.clock,
    compassDegrees: compassDegrees(player.heading),
    elevationDegrees: degrees(player.pitch),
    // The Reference Build's ground proximity warning has no equivalent here, so this reports the
    // one thing that is equivalent: a craft close enough to the ground to be landing on it.
    groundLamp: aboard && snapshot.mode === 'flying' && player.position.y < 40,
    inventory: carried.at(-1) ?? 'EMPTY',
    inventoryFill: carried.length,
    locationAxes: undefined,
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
    runLamp: !aboard && running,
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
