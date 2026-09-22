import type { Catalogue, Instance, Mesh, Model } from '../catalogue/data.ts';
import type { MapPoint, MapView } from '../catalogue/mapView.ts';
import { DAMOCLES_CELL_UNITS } from '../damocles/residence.ts';
import { placementHeading } from '../damocles/world.ts';
import { catalogueBodyId, wrapImages } from './surface.ts';

/// A placed Damocles Instance's footprint as the Atlas draws it: the oriented rectangle its
/// Model's recovered geometry covers on the ground, in Body Coordinates. Nothing here touches
/// the DOM.
///
/// Derived, and labelled as such wherever it is drawn (ADR 0014). The Catalogue recovers a
/// Model's whole mesh and an Instance's own position and angle; the rectangle is this module's
/// arithmetic over them and is no more the building's plan than a bounding box is a shape. A
/// true top-down exterior rendering is a later refinement (#405).

/// Which recovered mesh a footprint was measured from.
///
/// `exterior` is the Model's own exterior view, which is the thing seen from outside and so the
/// honest source. Two of the 1,241 Models carry one — Capital Spaceport and the Glenn Spaceport
/// that shares its record — so `plan` is the ordinary case: the Structure Workspace's plan
/// walls, which the on-foot renderer draws and the pushback clamps against, and which stop at
/// the same outline the exterior does on the one record that has both.
export type FootprintSource = 'exterior' | 'plan';

export interface Footprint {
  /// The Instance's own recovered position in Body Coordinates: the point the rectangle is
  /// measured around, and where the panel says the Instance stands.
  readonly at: MapPoint;
  /// The four corners in Body Coordinates, anticlockwise from the model-local minimum, already
  /// turned by the drawn angle. Unwrapped, for the reason a coastline is: `wrapImages` offsets
  /// the whole rectangle bodily into each image the camera can see.
  readonly corners: readonly [MapPoint, MapPoint, MapPoint, MapPoint];
  /// The angle byte the draw path turns this Instance by: its own byte plus the Model's `$8001`
  /// bias, 256 steps to the turn. Zero is drawn as modelled.
  readonly drawnAngle: number;
  /// The Instance's record id: what a pick selects and what the Catalogue link reaches.
  readonly id: string;
  readonly instanceName: string;
  readonly modelId: string;
  readonly modelName: string;
  readonly source: FootprintSource;
}

/// One structure Instance the Atlas cannot draw, because its Model recovered no plan and no
/// exterior. It still stands on the surface, so the band counts it rather than passing over it.
export interface FootprintGap {
  readonly id: string;
  readonly instanceName: string;
  readonly modelId: string;
  readonly modelName: string;
}

export interface BodyFootprints {
  readonly drawn: readonly Footprint[];
  /// Structure Instances placed on this Body whose Model offers neither mesh.
  readonly gaps: readonly FootprintGap[];
}

/// The mesh a footprint is measured from, and which of the two it is.
///
/// Exterior first, then the plan. Nothing else: a Model with neither has no recovered outline,
/// and a bounding box around some *other* record of it — a building detail, an interior layout —
/// would be a claim about a shape nobody has read from outside.
export const footprintMesh = (
  model: Model
): { readonly mesh: Mesh; readonly source: FootprintSource } | null => {
  const exterior = model.variants.find(variant => variant.view === 'exterior');
  if (exterior && exterior.mesh.vertices.length) {
    return { mesh: exterior.mesh, source: 'exterior' };
  }
  const plan = model.structureSelection?.plan;
  return plan && plan.vertices.length ? { mesh: plan, source: 'plan' } : null;
};

/// The Instance's drawn angle as a byte: its own recovered angle plus the Model's `$8001` bias,
/// masked to the 256 steps the draw path counts in ($053548, #361).
///
/// A Model that never asked for the single-Y path is drawn as modelled however its Instance's
/// byte reads, so this is zero for it rather than the byte (`placementHeading`).
export const drawnAngleByte = (model: Model, instance: Instance): number =>
  model.instanceOrientation?.rotation === 'yaw'
    ? ((instance.location?.heading ?? 0) +
        model.instanceOrientation.angleBiasByte) &
      0xff
    : 0;

/// One placed Instance's footprint, or null where its Model recovered no outline to measure.
///
/// The rectangle is the mesh's x and z extents, turned about the Instance's own position by the
/// angle the draw path turns it with and converted from engine units into Surface Cells. The
/// turn is the draw path's own, `$0533F4`'s composition of the record and the Instance
/// (`web/src/damocles/frame.ts`): x forward by the cosine and z by the sine, with **no z
/// mirror** — the mirror in the renderer belongs to the camera's handedness and not to where a
/// building stands, and applying it here would reflect every footprint about its own north-south
/// axis (memory: no z mirror in the draw path).
///
/// Nothing is scaled. A scaled alias record scales its *building detail* ($05A7F6 and
/// `damocles/selection.ts`), never its plan, so the plan's own extents are already the extents
/// the renderer draws the walls at.
export const footprintOf = (
  model: Model,
  instance: Instance
): Footprint | null => {
  const location = instance.location;
  const measured = footprintMesh(model);
  if (!location || !measured) {
    return null;
  }
  const xs = measured.mesh.vertices.map(vertex => vertex[0]);
  const zs = measured.mesh.vertices.map(vertex => vertex[2]);
  const box = {
    maxX: Math.max(...xs),
    maxZ: Math.max(...zs),
    minX: Math.min(...xs),
    minZ: Math.min(...zs)
  };
  const heading = placementHeading(model, location.heading);
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const at = { x: location.position[0], z: location.position[2] };
  const corner = (x: number, z: number): MapPoint => ({
    x: at.x + (x * cos + z * sin) / DAMOCLES_CELL_UNITS,
    z: at.z + (z * cos - x * sin) / DAMOCLES_CELL_UNITS
  });
  return {
    at,
    corners: [
      corner(box.minX, box.minZ),
      corner(box.maxX, box.minZ),
      corner(box.maxX, box.maxZ),
      corner(box.minX, box.maxZ)
    ],
    drawnAngle: drawnAngleByte(model, instance),
    id: instance.id,
    instanceName: instance.name,
    modelId: model.id,
    modelName: model.name,
    source: measured.source
  };
};

/// Every footprint on one Body, by its recovered source index, and the structure Instances that
/// have none.
///
/// Surface Structures alone. An object Instance is a thing standing on the ground rather than a
/// building on it — its Object Residence is mutable, a Drop rewrites it (`CONTEXT.md`) — and a
/// ground record is the cell's own surface, which the roads band already declined to paint in
/// (#414). Drawing either as a footprint would put three different claims under one rectangle.
export const readBodyFootprints = (
  catalogue: Catalogue,
  sourceIndex: number
): BodyFootprints => {
  const bodyId = catalogueBodyId(sourceIndex);
  const models = new Map(catalogue.models.map(model => [model.id, model]));
  const drawn: Footprint[] = [];
  const gaps: FootprintGap[] = [];
  for (const instance of catalogue.instances) {
    const model = models.get(instance.model);
    if (
      !instance.location ||
      instance.location.body !== bodyId ||
      model?.kind !== 'structure'
    ) {
      continue;
    }
    const footprint = footprintOf(model, instance);
    if (footprint) {
      drawn.push(footprint);
    } else {
      gaps.push({
        id: instance.id,
        instanceName: instance.name,
        modelId: model.id,
        modelName: model.name
      });
    }
  }
  return { drawn, gaps };
};

/// Whether a Body Coordinate falls inside a footprint's own rectangle, by ray casting. Four
/// corners, so nothing cleverer earns its keep, and the same arithmetic serves a turned
/// rectangle as an axis-aligned one.
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

/// The footprint under a Body Coordinate, tested against every wrap image the camera can see so
/// a rectangle picked on one side of the seam is the same record on the other.
///
/// The smallest hit wins. Structures sit one to a Surface Cell so their footprints do not
/// overlap today, but a rectangle is a bound rather than an outline and two neighbours' bounds
/// could yet meet; taking the smaller means the pick lands on the nearer claim rather than on
/// whichever the Catalogue happened to list first.
export const footprintAt = (
  footprints: readonly Footprint[],
  view: MapView,
  aspect: number,
  point: MapPoint
): Footprint | null => {
  let best: { readonly area: number; readonly footprint: Footprint } | null =
    null;
  for (const footprint of footprints) {
    const hit = wrapImages(footprint.corners, view, aspect).some(image =>
      inside(image, point)
    );
    if (!hit) {
      continue;
    }
    const [a, b, , d] = footprint.corners;
    const area =
      Math.hypot(b.x - a.x, b.z - a.z) * Math.hypot(d.x - a.x, d.z - a.z);
    if (!best || area < best.area) {
      best = { area, footprint };
    }
  }
  return best?.footprint ?? null;
};
