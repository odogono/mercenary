import { SURFACE_CELLS } from '../damocles/world.ts';
import type { MapBounds, MapView } from './mapView.ts';
import type { SurfaceLabel, SurfaceLabelKind } from './surface.ts';

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

/// The four Ranges within a Body, widest first. Bands rather than a hierarchy, because Damocles
/// Islands and Settlements do not nest (`CONTEXT.md`, **Range**); the order here is the order of
/// the camera and says nothing about what contains what.
export const BODY_RANGES = ['body', 'coastal', 'settlement', 'street'] as const;

export type BodyRange = (typeof BODY_RANGES)[number];

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

/// The band each kind of name appears from, and inward from there.
///
/// A Settlement is a whole named area and is the one thing on a Body worth naming at the widest
/// view, so it is written from the Body Range. A Damocles Place is one location inside one: all
/// eleven of Eris's fall within CAPITAL CITY's own sixteen cells, so at the Body Range they
/// would be eleven names on one pixel. They wait for the Settlement Range, which is the band
/// sized for a Structure Workspace (#412).
export const LABEL_BAND: Readonly<Record<SurfaceLabelKind, BodyRange>> = {
  place: 'settlement',
  settlement: 'body'
};

/// The band a Settlement's road network appears from, and inward from there.
///
/// The Settlement Range rather than the Street Range, because the game itself draws a whole
/// Settlement's roads from the air (the overhead captures in
/// `docs/research/damocles-eris-islands.md`) and a network is a 16-cell group, which is exactly
/// what this band is sized for. At the Street Range the same lines stay, under the footprints
/// (#413).
export const ROAD_BAND: BodyRange = 'settlement';

/// Whether a band draws road networks, and so whether it must state the gap where none was
/// recovered. Outward of it a network would be a smudge a few pixels wide, and the gap would be
/// a notice about something the reader could not have seen anyway.
export const showsRoads = (band: BodyRange): boolean =>
  BODY_RANGES.indexOf(band) >= BODY_RANGES.indexOf(ROAD_BAND);

/// The names a band shows. Inward of the band a kind appears at, it keeps showing: a Settlement
/// name does not go away because the reader zoomed into it.
export const labelsInBand = (
  labels: readonly SurfaceLabel[],
  band: BodyRange
): readonly SurfaceLabel[] =>
  labels.filter(
    label =>
      BODY_RANGES.indexOf(band) >= BODY_RANGES.indexOf(LABEL_BAND[label.kind])
  );

/// The band a placed Instance's footprint appears at.
///
/// The Street Range and no wider. A recovered footprint is a few hundredths of a Surface Cell —
/// Capital Spaceport, the largest on Eris, is 0.013 by 0.031 — so at the Settlement Range the
/// whole of a Settlement's structures would be a scattering of single pixels over the road
/// network, which says less than the network alone. This is the band sized for them, and it is
/// what the Range is named for (`CONTEXT.md`, **Atlas**).
export const FOOTPRINT_BAND: BodyRange = 'street';

/// Whether a band draws footprints, and so whether it must state what stands there undrawn.
export const showsFootprints = (band: BodyRange): boolean =>
  BODY_RANGES.indexOf(band) >= BODY_RANGES.indexOf(FOOTPRINT_BAND);

/// The span a hand-off into the Street Range opens at: one Surface Cell across the map's width.
///
/// The cell rather than the footprint it holds. Structures stand one to a Surface Cell, so the
/// cell is the frame that shows a footprint together with what it stands among, and a span read
/// from the rectangle itself would open each structure at a different scale — the largest on
/// Eris is 0.031 of a cell and the smallest a tenth of that, so the reader would have no fixed
/// sense of how big anything is. It is inside the Street band at any frame a browser can have
/// (`rangeOf` needs only 100 pixels of width for it), and inside the camera's own zoom ceiling
/// up to a 2:1 frame, past which the first gesture eases it back out.
export const STREET_SPAN = 1;
