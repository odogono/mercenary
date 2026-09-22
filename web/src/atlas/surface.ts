import type { Catalogue, Island } from '../catalogue/data.ts';
import { project, type MapPoint, type MapView } from '../catalogue/mapView.ts';
import { SURFACE_CELLS } from '../damocles/world.ts';

/// A Body's surface as the Atlas draws it: sea everywhere, with each recovered Damocles Island's
/// coastline filled in its own land colour. Nothing here touches the DOM.
///
/// An island carries no name of its own (`CONTEXT.md`). `areaName` belongs to the Structure
/// Workspace the record binds, so it travels with the island only as the published Settlement
/// label, and 33 of the 62 records have none at all.

/// The Catalogue keys a Body by slot where `system.json` keys it by slug. Both derive from the
/// same recovered source index, so this is the join and not a lookup table.
export const catalogueBodyId = (sourceIndex: number): string =>
  `body-${sourceIndex}`;

export interface SurfaceIsland {
  readonly areaName: string | null;
  readonly id: string;
  readonly landColour: string;
  /// The record's own origin in Body Coordinates, which an Island-Local Cell counts from.
  readonly origin: MapPoint;
  /// The closed ring in Body Coordinates: the record's origin plus its island-local vertices,
  /// both in whole Surface Cells.
  ///
  /// Deliberately **not** wrapped onto the surface. Five records cross the coordinate seam, and
  /// wrapping vertex by vertex would send one side of such a polygon to the far edge and tear it
  /// across the map. The ring stays whole with coordinates outside 0..SURFACE_CELLS, and
  /// `wrapImages` offsets it bodily instead.
  readonly outline: readonly MapPoint[];
}

export interface SurfaceGap {
  readonly areaName: string | null;
  readonly id: string;
  readonly reason: string;
}

/// One Settlement's recovered road network, as the map draws it: the authored runs of one
/// captured Structure Workspace group, each already a one-cell-wide line (#441).
///
/// The pieces are in the Catalogue too, with their rotations and the ground record each cell
/// draws, but nothing here reads them: the runs alone are the network the game itself draws
/// from the air, and drawing a piece's faces would be a second, larger claim.
export interface SurfaceRoad {
  readonly areaName: string | null;
  readonly id: string;
  readonly islandId: string | null;
  /// Each run as a pair of endpoints in Body Coordinates, taken through the middle of the cell
  /// at either end so a run of one cell is a mark rather than nothing.
  ///
  /// Unwrapped, for the reason a coastline is: a group is 16 cells square and one of them sits
  /// at Surface Cell x 3,896, so `wrapImages` offsets the whole network bodily instead.
  readonly lines: readonly (readonly [MapPoint, MapPoint])[];
  /// Where the group's 16x16 sits on the surface, in Surface Cells: what a run is counted from.
  readonly origin: MapPoint;
}

/// What the Atlas knows about one Body's roads.
///
/// `gap` is the absence of a record and not a recovered emptiness. 20 of the 30 Bodies carry a
/// drawable network and Solon carries a record with no run at all, which is a recovered "this
/// Settlement has no roads"; the rest are Structure Workspaces no capture has loaded, and the
/// map says so rather than leaving a reader to read blank ground as bare ground (ADR 0014).
export type RoadRecovery = 'gap' | 'none' | 'recovered';

/// The words the map and the panel both use for the gap, so they cannot drift apart.
export const ROAD_GAP_NOTICE = 'Road network not yet recovered for this Body';

export const roadRecovery = (roads: readonly SurfaceRoad[]): RoadRecovery => {
  if (!roads.length) {
    return 'gap';
  }
  return roads.some(road => road.lines.length) ? 'recovered' : 'none';
};

export type SurfaceLabelKind = 'place' | 'settlement';

/// One name the map writes on a Body's surface, at a point in Body Coordinates.
///
/// Two kinds, and they do not nest. A `settlement` is the area name a Damocles Island's bound
/// Structure Workspace publishes, so it is carried by an island record; a `place` is a Damocles
/// Place, whose position is its Instances'. A Settlement may have no island under it and an
/// island may carry no Settlement (`CONTEXT.md`), so neither kind is ever derived from the
/// other and a Place is never listed under the Settlement it happens to sit in.
export interface SurfaceLabel {
  /// Where the name is written, in Body Coordinates. Not wrapped onto the surface for the same
  /// reason a coastline is not: `wrapImages` offsets it into every image the camera can see.
  readonly at: MapPoint;
  /// The record the name belongs to: an island record for a Settlement, a Place record for a
  /// Damocles Place. What a click on the name selects.
  readonly id: string;
  readonly kind: SurfaceLabelKind;
  readonly name: string;
}

export interface BodySurface {
  /// Records carrying no coastline at all: 21 of the 62 share a stub whose extent is the whole
  /// coordinate plane. They are neither land to draw nor sea, so the map states the gap rather
  /// than covering a Body in invented ground (ADR 0014).
  readonly gaps: readonly SurfaceGap[];
  readonly islands: readonly SurfaceIsland[];
  /// Every name on this Body, Settlements first, each in the Catalogue's own order.
  readonly labels: readonly SurfaceLabel[];
  /// The recovered road networks on this Body, in the Catalogue's own order. Empty where no
  /// capture has loaded this Body's Structure Workspaces, which `roadRecovery` reads as a gap.
  readonly roads: readonly SurfaceRoad[];
}

/// One coordinate counted from another on a wrapping axis, taken on the nearest image so a cell
/// across the seam from its origin reads as a small signed offset rather than as four thousand.
export const nearestOffset = (from: number, origin: number): number => {
  const raw = from - origin;
  return raw - Math.round(raw / SURFACE_CELLS) * SURFACE_CELLS;
};

/// Where a Damocles Place is, in Body Coordinates: the mean of its recovered Instances' own
/// positions.
///
/// The Catalogue publishes no position for a Place. A place name alone establishes neither its
/// position nor its contents (`CONTEXT.md`), so this is the position of what is there and not a
/// position the Place owns; the panel says so.
///
/// Counted on the wrap image nearest the first instance, so a Place whose instances straddle the
/// coordinate seam averages to the cell between them rather than to the far side of the surface.
/// No recovered Place does that today — the widest spread within one is a twentieth of a cell —
/// but the surface is a torus and the arithmetic costs nothing.
const meanNear = (values: readonly number[], origin: number): number =>
  origin +
  values.reduce((sum, value) => sum + nearestOffset(value, origin), 0) /
    values.length;

const meanOfInstances = (positions: readonly MapPoint[]): MapPoint => {
  const first = positions[0]!;
  return {
    x: meanNear(
      positions.map(position => position.x),
      first.x
    ),
    z: meanNear(
      positions.map(position => position.z),
      first.z
    )
  };
};

/// The names on one Body: its Settlements and its Damocles Places.
///
/// A Settlement is written at the island record's own origin rather than over the middle of the
/// coastline, because that is where the Structure Workspace publishing the name is built
/// ($056464) and the island is not the Settlement. Every recovered Place on a named island lies
/// within that workspace's 16 cells of it, so the name lands on what it names.
const readLabels = (
  catalogue: Catalogue,
  bodyId: string,
  records: readonly Island[]
): readonly SurfaceLabel[] => [
  ...records
    .filter(island => island.areaName !== null)
    .map(island => ({
      at: { x: island.origin[0], z: island.origin[1] },
      id: island.id,
      kind: 'settlement' as const,
      name: island.areaName!
    })),
  ...catalogue.places
    .filter(place => place.body === bodyId)
    .flatMap(place => {
      const positions = place.instances
        .map(id => catalogue.instances.find(instance => instance.id === id))
        .filter(instance => instance?.location)
        .map(instance => ({
          x: instance!.location!.position[0],
          z: instance!.location!.position[2]
        }));
      // A Place whose every Instance has an unrecovered location has no position to be drawn
      // at, and inventing one would be a claim. It stays in the Catalogue and off the map.
      return positions.length
        ? [
            {
              at: meanOfInstances(positions),
              id: place.id,
              kind: 'place' as const,
              name: place.name
            }
          ]
        : [];
    })
];

/// The road networks of one Body, placed on the surface.
///
/// A run's endpoints are workspace-local cells, and `origin` is where that 16x16 sits, so the
/// composition is the same one a coastline gets: the record's origin plus its own local cells.
/// Every recovered network binds an island whose origin is that very cell, so the network lands
/// on the Settlement it belongs to rather than beside it.
const readRoads = (
  catalogue: Catalogue,
  bodyId: string,
  records: readonly Island[]
): readonly SurfaceRoad[] =>
  catalogue.roadNetworks
    .filter(network => network.body === bodyId)
    .map(network => {
      const [ox, oz] = network.origin;
      const at = (cell: readonly [number, number]): MapPoint => ({
        x: ox + cell[0] + 0.5,
        z: oz + cell[1] + 0.5
      });
      return {
        areaName:
          records.find(island => island.id === network.island)?.areaName ??
          null,
        id: network.id,
        islandId: network.island,
        lines: network.runs.map(
          run => [at(run.start), at(run.end)] as readonly [MapPoint, MapPoint]
        ),
        origin: { x: ox, z: oz }
      };
    });

/// The islands of one Body, by its recovered source index.
export const readBodySurface = (
  catalogue: Catalogue,
  sourceIndex: number
): BodySurface => {
  const bodyId = catalogueBodyId(sourceIndex);
  const records = catalogue.islands.filter(island => island.body === bodyId);
  return {
    gaps: records
      .filter(island => !island.coastline.vertices.length)
      .map(island => ({
        areaName: island.areaName,
        id: island.id,
        reason: island.reason
      })),
    islands: records
      .filter(island => island.coastline.vertices.length)
      .map(island => ({
        areaName: island.areaName,
        id: island.id,
        landColour: island.landColour,
        origin: { x: island.origin[0], z: island.origin[1] },
        outline: island.coastline.vertices.map(([x, z]) => ({
          x: island.origin[0] + x,
          z: island.origin[1] + z
        }))
      })),
    labels: readLabels(catalogue, bodyId, records),
    roads: readRoads(catalogue, bodyId, records)
  };
};

/// Which whole-surface offsets of a span put it inside a window. An image offset by k surfaces
/// overlaps when `min + k * S <= viewMax` and `max + k * S >= viewMin`, which bounds k exactly,
/// so no copy is computed and thrown away.
const imageRange = (
  viewMin: number,
  viewMax: number,
  min: number,
  max: number
) => ({
  first: Math.ceil((viewMin - max) / SURFACE_CELLS),
  last: Math.floor((viewMax - min) / SURFACE_CELLS)
});

const bounds = (outline: readonly MapPoint[]) => ({
  maxX: Math.max(...outline.map(point => point.x)),
  maxZ: Math.max(...outline.map(point => point.z)),
  minX: Math.min(...outline.map(point => point.x)),
  minZ: Math.min(...outline.map(point => point.z))
});

/// Every wrap image of one outline that the camera can see, offset bodily by whole surfaces.
///
/// The range is computed from the camera rather than fixed at plus or minus one, because a span
/// may exceed the surface: a frame wider than it is tall shows more than one image side by side
/// at its widest view, and on a torus that is not a defect.
export const wrapImages = (
  outline: readonly MapPoint[],
  view: MapView,
  aspect: number
): readonly (readonly MapPoint[])[] => {
  if (!outline.length) {
    return [];
  }
  const box = bounds(outline);
  const halfWidth = view.span / 2;
  const halfHeight = (view.span * aspect) / 2;
  const across = imageRange(
    view.cx - halfWidth,
    view.cx + halfWidth,
    box.minX,
    box.maxX
  );
  const down = imageRange(
    view.cz - halfHeight,
    view.cz + halfHeight,
    box.minZ,
    box.maxZ
  );
  const images: (readonly MapPoint[])[] = [];
  for (let i = across.first; i <= across.last; i += 1) {
    for (let j = down.first; j <= down.last; j += 1) {
      const dx = i * SURFACE_CELLS;
      const dz = j * SURFACE_CELLS;
      images.push(outline.map(point => ({ x: point.x + dx, z: point.z + dz })));
    }
  }
  return images;
};

/// Whether a Body Coordinate falls inside a closed ring, by ray casting. A coastline is a
/// simple closed polygon of at most 14 vertices, so nothing cleverer earns its keep.
const inside = (ring: readonly MapPoint[], point: MapPoint): boolean => {
  let within = false;
  for (const [index, a] of ring.entries()) {
    const b = ring[(index + 1) % ring.length]!;
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < a.x + ((point.z - a.z) / (b.z - a.z)) * (b.x - a.x)
    ) {
      within = !within;
    }
  }
  return within;
};

/// The island under a Body Coordinate, tested against every wrap image the camera can see so a
/// record picked on one side of the seam is the same record on the other.
///
/// Islands do not overlap one another, so the first hit is the only hit; the order is the
/// Catalogue's, which makes the answer the same on every pick.
export const islandAt = (
  surface: BodySurface,
  view: MapView,
  aspect: number,
  point: MapPoint
): SurfaceIsland | null =>
  surface.islands.find(island =>
    wrapImages(island.outline, view, aspect).some(image => inside(image, point))
  ) ?? null;

/// The mean of some Surface Cell coordinates on a wrapping axis: the angle they average to,
/// brought back into 0..SURFACE_CELLS.
const circularMean = (values: readonly number[]): number => {
  const turns = values.map(value => (value / SURFACE_CELLS) * 2 * Math.PI);
  const angle = Math.atan2(
    turns.reduce((sum, turn) => sum + Math.sin(turn), 0) / turns.length,
    turns.reduce((sum, turn) => sum + Math.cos(turn), 0) / turns.length
  );
  return (
    ((((angle / (2 * Math.PI)) * SURFACE_CELLS) % SURFACE_CELLS) +
      SURFACE_CELLS) %
    SURFACE_CELLS
  );
};

/// How far one coordinate must move, in whole surfaces, to sit nearest an anchor.
const wholeSurfaces = (from: number, to: number): number =>
  -Math.round((from - to) / SURFACE_CELLS) * SURFACE_CELLS;

/// The wrap-aware centre of a Body's islands, in Surface Cells: where the Atlas centres that
/// Body's surface when drawing it on the Body's own disc.
///
/// A circular mean rather than an arithmetic one, because the surface is a torus. LUCAN's twelve
/// records ring the coordinate origin, so their arithmetic mean is the far side of the surface
/// and cell 2048 puts the ring in all four corners as four broken arcs. Their circular mean is
/// cell (6, 6) — the ring's own centre — which draws it whole and in the middle.
///
/// (2048, 2048) when a Body has no coastline at all, which keeps the surface square where it was
/// for the 21 Bodies carrying only the coastline-less stub.
export const surfaceAnchor = (surface: BodySurface): MapPoint => {
  if (!surface.islands.length) {
    return { x: SURFACE_CELLS / 2, z: SURFACE_CELLS / 2 };
  }
  const centres = surface.islands.map(island => ({
    x:
      island.outline.reduce((sum, point) => sum + point.x, 0) /
      island.outline.length,
    z:
      island.outline.reduce((sum, point) => sum + point.z, 0) /
      island.outline.length
  }));
  return {
    x: circularMean(centres.map(centre => centre.x)),
    z: circularMean(centres.map(centre => centre.z))
  };
};

/// One outline shifted bodily to the wrap image nearest an anchor. The whole ring moves by the
/// same whole surfaces, so a record crossing the seam stays one polygon.
///
/// Every vertex of every recovered Body then lies within half a surface of its own anchor — the
/// worst is ERIS at 1,952 cells of the 2,048 available — so a Body's islands all fit in one
/// square and none needs a copy. `atlas-surface.test.ts` pins that, because it is a property of
/// the recovered data rather than something the code can guarantee.
export const nearestImage = (
  outline: readonly MapPoint[],
  anchor: MapPoint
): readonly MapPoint[] => {
  if (!outline.length) {
    return outline;
  }
  const centre = {
    x: outline.reduce((sum, point) => sum + point.x, 0) / outline.length,
    z: outline.reduce((sum, point) => sum + point.z, 0) / outline.length
  };
  const dx = wholeSurfaces(centre.x, anchor.x);
  const dz = wholeSurfaces(centre.z, anchor.z);
  return dx === 0 && dz === 0
    ? outline
    : outline.map(point => ({ x: point.x + dx, z: point.z + dz }));
};

/// The island a Body Coordinate falls in, tested against every wrap image so a cell on either
/// side of the seam finds the same record. Unlike `islandAt` this needs no camera, because a
/// coordinate is not a pointer.
export const islandAtCell = (
  surface: BodySurface,
  cell: MapPoint
): SurfaceIsland | null => {
  for (const island of surface.islands) {
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        if (
          inside(island.outline, {
            x: cell.x + i * SURFACE_CELLS,
            z: cell.z + j * SURFACE_CELLS
          })
        ) {
          return island;
        }
      }
    }
  }
  return null;
};

/// An Island-Local Cell: a Surface Cell counted from a Damocles Island's origin rather than from
/// the Body's (`CONTEXT.md`). Signed, and taken on the wrap image nearest the record, so a cell
/// across the seam from its island still reads as a small offset rather than as four thousand.
export const islandLocalCell = (
  island: SurfaceIsland,
  cell: MapPoint
): MapPoint => ({
  x: nearestOffset(cell.x, island.origin.x),
  z: nearestOffset(cell.z, island.origin.z)
});

/// Css pixels between a name and the point it names, and between two names.
const LABEL_GAP = 4;

export interface LabelBox {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const labelsOverlap = (a: LabelBox, b: LabelBox): boolean =>
  a.x < b.x + b.width + LABEL_GAP &&
  b.x < a.x + a.width + LABEL_GAP &&
  a.y < b.y + b.height + LABEL_GAP &&
  b.y < a.y + a.height + LABEL_GAP;

export interface PlacedLabel {
  readonly box: LabelBox;
  readonly id: string;
  readonly kind: SurfaceLabelKind;
  readonly name: string;
  /// Css pixels of the point the name is written against: the mark the map draws under it.
  readonly x: number;
  readonly y: number;
}

export interface SurfaceLabelLayout {
  readonly placed: readonly PlacedLabel[];
  /// Names whose point is on screen but whose box would have collided with one already placed.
  /// Zooming in makes room, and the status line says how many are waiting.
  readonly suppressed: number;
}

/// Lay every name out against the camera, in every wrap image of it the camera can see.
///
/// Settlements are placed before Damocles Places, so a Body's area names survive a crowd of
/// Place names rather than being crowded out by whichever happened to come first: at the
/// Settlement Range eleven of Eris's Places fall inside CAPITAL CITY's own sixteen cells.
///
/// Pure: text is measured from the caller's monospace metrics rather than from the document,
/// the same arrangement `layOutLabels` uses for the System Range.
export const layOutSurfaceLabels = (
  labels: readonly SurfaceLabel[],
  view: MapView,
  frame: { readonly height: number; readonly width: number },
  metrics: { readonly charWidth: number; readonly lineHeight: number }
): SurfaceLabelLayout => {
  const aspect = frame.height / Math.max(frame.width, 1);
  const order = [...labels].sort(
    (a, b) => Number(a.kind === 'place') - Number(b.kind === 'place')
  );
  const boxes: LabelBox[] = [];
  const placed: PlacedLabel[] = [];
  let suppressed = 0;
  for (const label of order) {
    const width = label.name.length * metrics.charWidth;
    let onFrame = false;
    let landed = false;
    for (const image of wrapImages([label.at], view, aspect)) {
      const { u, v } = project(view, image[0]!, aspect);
      const x = u * frame.width;
      const y = v * frame.height;
      if (x < 0 || y < 0 || x > frame.width || y > frame.height) {
        continue;
      }
      onFrame = true;
      // Below the point, then above it, in both cases centred on it and slid along the frame's
      // edge rather than off it. Fewer positions than the System Range's four, because a name
      // there must dodge a disc it would otherwise cover and a name here covers nothing but sea
      // and coastline; but the edges matter more, because a Body's own names cluster in one
      // corner of the surface and CAPITAL CITY sits 128 cells from the coordinate origin.
      const slid = Math.min(
        Math.max(x - width / 2, 0),
        Math.max(frame.width - width, 0)
      );
      const box = ([y + LABEL_GAP, y - LABEL_GAP - metrics.lineHeight] as const)
        .map(top => ({ height: metrics.lineHeight, width, x: slid, y: top }))
        .find(
          candidate =>
            candidate.y >= 0 &&
            candidate.x + candidate.width <= frame.width &&
            candidate.y + candidate.height <= frame.height &&
            !boxes.some(other => labelsOverlap(candidate, other))
        );
      if (!box) {
        continue;
      }
      boxes.push(box);
      placed.push({
        box,
        id: label.id,
        kind: label.kind,
        name: label.name,
        x,
        y
      });
      landed = true;
    }
    if (onFrame && !landed) {
      suppressed += 1;
    }
  }
  return { placed, suppressed };
};
