import type { MapBounds, MapView } from '../catalogue/mapView.ts';
import { SURFACE_CELLS } from '../damocles/world.ts';

/// The Atlas Ranges inside one Body: the camera that covers a wrapping surface, and the bands
/// that camera occupies. Nothing here touches the DOM.
///
/// A Body's surface is a torus, `SURFACE_CELLS` Surface Cells on each axis and wrapping on both
/// (`CONTEXT.md`, **Body Coordinate**). So the camera is never clamped to a bounded square: an
/// island may cross the coordinate seam, and a hard edge there would cut it in half.

/// The whole surface across the map's width.
export const SURFACE_SPAN = SURFACE_CELLS;

/// The camera that shows a Body's whole surface. Unlike the System Range there is nothing to fit
/// to: the surface is exactly `SURFACE_CELLS` on a side whatever is on it, so the widest view is
/// the surface itself rather than a bounding box with padding.
///
/// A span is measured across the width, and the height it shows is `span * aspect`. A frame
/// wider than it is tall therefore needs a *larger* span to cover the surface vertically, and
/// shows more than one wrap image side by side while it does. On a torus that is not a defect:
/// the surface really does continue there.
export const fitBody = (frame: {
  readonly height: number;
  readonly width: number;
}): MapView => ({
  cx: SURFACE_CELLS / 2,
  cz: SURFACE_CELLS / 2,
  span:
    SURFACE_SPAN *
    Math.max(1, frame.width / Math.max(frame.height, Number.MIN_VALUE))
});

/// What bounds a Body camera: the whole surface, with the centre taken modulo the surface rather
/// than clamped into it.
export const bodyBounds = (frame: {
  readonly height: number;
  readonly width: number;
}): MapBounds => ({
  centre: 'wrap',
  fit: fitBody(frame),
  period: SURFACE_CELLS
});

/// The four Ranges within a Body. Bands rather than a hierarchy, because Damocles Islands and
/// Settlements do not nest (`CONTEXT.md`, **Range**).
export type BodyRange = 'body' | 'coastal' | 'settlement' | 'street';

/// Which band a camera occupies, from how many Surface Cells one css pixel covers rather than
/// from the span, so the band does not move when the window does.
///
/// The thresholds come from the size of the thing each band is for. A Structure Workspace is 16
/// cells square, so a Settlement is legible once a cell is about ten pixels. A structure
/// footprint is a fraction of a cell, so a Street needs a cell to be about a hundred. And a
/// coastline is drawn in whole cells, so it needs no better than a cell to the pixel.
export const rangeOf = (view: MapView, widthPixels: number): BodyRange => {
  const cellsPerPixel = view.span / Math.max(widthPixels, 1);
  if (cellsPerPixel < 0.01) {
    return 'street';
  }
  if (cellsPerPixel < 0.1) {
    return 'settlement';
  }
  return cellsPerPixel < 1 ? 'coastal' : 'body';
};

export const RANGE_LABEL: Readonly<Record<BodyRange, string>> = {
  body: 'Body Range',
  coastal: 'Coastal Range',
  settlement: 'Settlement Range',
  street: 'Street Range'
};
