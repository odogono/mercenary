import { SURFACE_CELLS } from '../damocles/world.ts';
import type { GammaBody } from '../flyover/documents.ts';
import type { MapPoint, MapView } from './mapView.ts';
import { islandAtCell, islandLocalCell, type BodySurface } from './surface.ts';

/// What the camera's centre point is, said in each coordinate system that can name it. Nothing
/// here touches the DOM.
///
/// The three are genuinely different addresses rather than three views of one, and the glossary
/// keeps them apart: a position in the System, a Body Coordinate in Surface Cells from a Body's
/// own origin, and an Island-Local Cell counted from a Damocles Island's origin, which "names a
/// location only together with the island it is local to" (`CONTEXT.md`).
///
/// A row is marked authored when it was reached through the authored surface scale, which is the
/// case for everything below the System while the reader is still on the System Range. Nothing
/// recovered relates the two coordinate systems (#437), so a Body Coordinate read off a disc is
/// a consequence of that authored choice and says so.

export interface ReadoutRow {
  readonly authored: boolean;
  readonly label: string;
  readonly value: string;
}

const units = (value: number): string =>
  Math.round(value).toLocaleString('en-GB');

/// Wrapped onto the surface, because a Body Coordinate outside 0..4095 is the same place as one
/// inside it and only the inside reading is meaningful to a reader.
const onSurface = (value: number): number =>
  ((Math.round(value) % SURFACE_CELLS) + SURFACE_CELLS) % SURFACE_CELLS;

export const centreReadout = (
  view: MapView,
  place:
    | { readonly kind: 'system' }
    | {
        readonly authored: boolean;
        readonly body: GammaBody;
        readonly cell: MapPoint;
        readonly kind: 'body';
        readonly surface: BodySurface | undefined;
      }
): readonly ReadoutRow[] => {
  const rows: ReadoutRow[] = [];
  if (place.kind === 'system' || place.authored) {
    // The System Range's own camera, in the raw engine units `system.json` publishes. Not the
    // Reference Build's System Coordinate Readout, which counts $10000-unit cells and describes
    // the player rather than a point on a map.
    rows.push({
      authored: false,
      label: 'System',
      value: `${units(view.cx)} / ${units(view.cz)}`
    });
  }
  if (place.kind === 'system') {
    return rows;
  }
  rows.push({
    authored: place.authored,
    label: 'Body Coordinate',
    value: `${place.body.name} · ${onSurface(place.cell.x)} / ${onSurface(place.cell.z)} cells`
  });
  const island =
    place.surface &&
    islandAtCell(place.surface, {
      x: onSurface(place.cell.x),
      z: onSurface(place.cell.z)
    });
  if (island) {
    const local = islandLocalCell(island, {
      x: onSurface(place.cell.x),
      z: onSurface(place.cell.z)
    });
    // An island carries no name of its own, so the row is headed by the Settlement the record
    // publishes where there is one, and by the record otherwise.
    rows.push({
      authored: place.authored,
      label: 'Island-Local Cell',
      value: `${island.areaName ?? island.id} · ${Math.round(local.x)} / ${Math.round(local.z)}`
    });
  }
  return rows;
};
