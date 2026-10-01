import type {
  Bounds,
  EntranceAttachment,
  FloorLabel,
  FloorLabelGlyph,
  Mesh,
  Primitive,
  RegionQueueEntry,
  WallText
} from '../catalogue/data.ts';
import { sameQueueEntry } from '../catalogue/regions.ts';
import {
  clampRegionStep,
  regionAt,
  type ClampRegion
} from '../onFoot/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { ErisPlacement, Pose } from './world.ts';

const EYE_CLEARANCE = 11;
const LEAF_ENDPOINT_INSET = 8;
export type AttachmentUnits = (slot: number) => number;
const closedAttachment: AttachmentUnits = () => 0;
/// `$5A41 + slot`, an attachment's latch: `$00` closed, `$01` moving, `$FF` fully open
/// (docs/research/damocles-generic-entrance-attachments.md).
export type AttachmentLatch = 'closed' | 'moving' | 'open';
export type AttachmentLatches = (slot: number) => AttachmentLatch;
const closedLatch: AttachmentLatches = () => 'closed';

const subsets = new WeakMap<object, Mesh>();
const subset = (key: object, mesh: Mesh, faces: readonly Primitive[]): Mesh => {
  const cached = subsets.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const result = { ...mesh, faces, lines: [] };
  subsets.set(key, result);
  return result;
};
const scaledDetails = new WeakMap<object, Mesh>();

/// A draw component of a bound structure. Wall text carries the plane its glyphs lie in, since
/// it shares that plane with the face it rides on and is drawn over it. A detail selection is
/// in the order its records are drawn, which settles its coplanar faces: a detail glyph lies
/// in the plane of the detail wall it is painted on, and is drawn after it (#545).
export type StructureMesh = Mesh & {
  readonly wallTextPlane?: 0 | 128;
};
const wallTextMeshes = new WeakMap<Mesh, StructureMesh>();
const wallTextMesh = (mesh: Mesh, plane: 0 | 128): StructureMesh => {
  let cached = wallTextMeshes.get(mesh);
  if (cached === undefined) {
    cached = { ...mesh, wallTextPlane: plane };
    wallTextMeshes.set(mesh, cached);
  }
  return cached;
};
/// Whether a resident slot is in the player's carried state.
export type CarriedSlot = (slot: number) => boolean;
const nothingCarried: CarriedSlot = () => false;
/// The glyph the Floor Label at `$CD04` shows now in a font, or undefined where the Catalogue
/// carries none for that font.
export type FloorLabelGlyphs = (font: number) => FloorLabelGlyph | undefined;
const noFloorLabel: FloorLabelGlyphs = () => undefined;

/** A world position expressed in a placement's model-local frame. */
export const structureLocalPosition = (
  placement: ErisPlacement,
  position: Vector3,
  negateZ: boolean
): Vector3 => {
  const dx = position.x - placement.position.x;
  const dz = position.z - placement.position.z;
  const cos = Math.cos(placement.heading);
  const sin = Math.sin(placement.heading);
  return {
    x: dx * cos - dz * sin,
    y: position.y - placement.position.y,
    z: (dx * sin + dz * cos) * (negateZ ? -1 : 1)
  };
};

export const insideLocalBox = (
  point: Vector3,
  box: {
    readonly x: readonly [number, number];
    readonly z: readonly [number, number];
  }
): boolean =>
  box.x[0] <= point.x &&
  point.x < box.x[1] &&
  box.z[0] <= point.z &&
  point.z < box.z[1];

export const attachmentOpenLimit = (attachment: EntranceAttachment): number => {
  const axis = attachment.constructor.motionAxis === 'x' ? 0 : 2;
  const values = attachment.mesh.vertices.map(vertex => vertex[axis]);
  const span = Math.max(...values) - Math.min(...values);
  return (
    (attachment.constructor.leafCount === 2 ? span / 2 : span) -
    LEAF_ENDPOINT_INSET
  );
};

export interface AttachmentState {
  readonly latch: AttachmentLatch;
  readonly openUnits: number;
}

/// Whether a path of `$05AA3C` changes the latch on the substep its edge reaches the endpoint,
/// rather than the one after. Each path steps its edge and compares it with the endpoint. Where
/// the edge's coordinate falls towards the endpoint the test is `cmp`/`bmi`, which stops at
/// equality. Where it rises the test is `cmp`/`bpl`, which carries on at equality and stops a
/// substep later. A one-leaf door's low edge rises to open and falls to close, and its high edge
/// the reverse. Two leaves test the rising inner edge both ways (docs/research/damocles-door-speed.md).
const latchesOnArrival = (
  attachment: EntranceAttachment,
  opening: boolean
): boolean =>
  attachment.constructor.leafCount === 1 &&
  attachment.constructor.movingSide === (opening ? 'high' : 'low');

/// One pass of `$05AA3C` over one attachment, which the frame loop makes once a substep. A pass
/// opening a door not latched open, or closing one not latched closed, sets the latch moving and
/// steps the edge a unit (`move.l #1,d4`). Once a step would reach or pass the endpoint, the edge
/// is clamped there and the latch set to `$FF` or cleared to `$00`. Undefined where no path runs,
/// so the pass does not raise `$5A9D8`.
export const stepAttachment = (
  attachment: EntranceAttachment,
  state: AttachmentState,
  opening: boolean
): AttachmentState | undefined => {
  if (state.latch === (opening ? 'open' : 'closed')) {
    return undefined;
  }
  const travel = attachmentOpenLimit(attachment);
  const next = state.openUnits + (opening ? 1 : -1);
  const beyond = opening ? next - travel : -next;
  if (beyond > 0 || (beyond === 0 && latchesOnArrival(attachment, opening))) {
    return opening
      ? { latch: 'open', openUnits: travel }
      : { latch: 'closed', openUnits: 0 };
  }
  return { latch: 'moving', openUnits: next };
};

/// `$05A366`–`$05A386`: a region an attachment gates is selectable only while that attachment's
/// latch is negative, `$FF`.
const regionIsAvailable = (
  region: NonNullable<
    ErisPlacement['selection']
  >['structure']['regions'][number],
  latches: AttachmentLatches
): boolean =>
  region.gate !== 'attachmentLatch' ||
  latches(region.flags & 0x03_fc) === 'open';

/** Bind-time ±11 copy on the resolved axis. `$0200` remains unresolved and uninset. */
const workspaceBounds = (
  region: NonNullable<
    ErisPlacement['selection']
  >['structure']['regions'][number]
): Bounds => {
  if (region.insetAxis === undefined) {
    return region.bounds;
  }
  const axis = region.insetAxis === 'x' ? 0 : 1;
  return region.bounds.map((pair, index) =>
    index === axis
      ? ([pair[0] + EYE_CLEARANCE, pair[1] - EYE_CLEARANCE] as const)
      : pair
  );
};

/// A region whose flags have bit 15 clear is enclosed: the frame loop takes the branch at
/// `$0595FA` and draws the bound structure's plan queue alone, with no ground record, island
/// fill or object stream (#491).
export const regionIsEnclosed = (region: { readonly flags: number }): boolean =>
  (region.flags & 0x80_00) === 0;

/// The structure's regions as the shared scan and clamp see them: the bind's inset box and
/// whether the region's gate lets it be selected under these latches.
const clampRegions = (
  placement: ErisPlacement,
  latches: AttachmentLatches
): readonly ClampRegion[] =>
  placement.selection?.structure.regions.map(region => ({
    available: regionIsAvailable(region, latches),
    bounds: workspaceBounds(region),
    flags: region.flags
  })) ?? [];

export const structureRegionAt = (
  placement: ErisPlacement,
  pose: Pose,
  negateZ: boolean,
  latches: AttachmentLatches = closedLatch
): number | null => {
  if (placement.selection === undefined) {
    return null;
  }
  const point = structureLocalPosition(placement, pose.position, negateZ);
  return regionAt(clampRegions(placement, latches), [point.x, point.z]);
};

const worldPosition = (
  placement: ErisPlacement,
  local: Vector3,
  negateZ: boolean
): Vector3 => {
  const cos = Math.cos(placement.heading);
  const sin = Math.sin(placement.heading);
  const z = local.z * (negateZ ? -1 : 1);
  return {
    x: placement.position.x + local.x * cos + z * sin,
    y: placement.position.y + local.y,
    z: placement.position.z - local.x * sin + z * cos
  };
};

export interface ClampedStructureStep {
  readonly pose: Pose;
  /// The step reached the clamp `$05A5F0`, which raises `$5A646`: the eye was held back rather
  /// than standing past an edge or entering another region.
  readonly refused: boolean;
  readonly regionIndex: number | null;
  /// The step passed the current region's own box, so `$05A6E8` walked the regions and then the
  /// location table, whether or not a region was selected (docs/research/damocles-location-triggers.md).
  readonly reselected: boolean;
}

/// The Working Authority's eye pushback `$05A64A` after one Mover step. Inside the current
/// region's inset box the step stands. Past an inset edge but inside the region's own box, it
/// stands where a region's opposite edge is this edge and its inset span holds the other
/// coordinate, whatever that region's gate (`$05A504`), and is otherwise clamped to the inset.
/// Past the region's own box the regions are walked (`$05A32C`): a region selected becomes
/// current, and with none the step is clamped to the own box with no inset (`$05A4CA`). A
/// pending ride refuses every region (`$05A35C`), and a gated one is refused until its latch
/// is open (docs/research/damocles-lift-ride-movement.md).
export const clampStructureStep = (
  placement: ErisPlacement,
  from: Pose,
  to: Pose,
  negateZ: boolean,
  latches: AttachmentLatches,
  selectedRegionIndex: number | null,
  ridePending = false
): ClampedStructureStep => {
  if (placement.selection === undefined) {
    return { pose: to, refused: false, regionIndex: null, reselected: false };
  }
  const local = structureLocalPosition(placement, to.position, negateZ);
  const step = clampRegionStep(
    clampRegions(placement, latches),
    selectedRegionIndex ?? structureRegionAt(placement, from, negateZ, latches),
    [local.x, local.z],
    ridePending
  );
  if (step.point[0] === local.x && step.point[1] === local.z) {
    return {
      pose: to,
      refused: step.refused,
      regionIndex: step.regionIndex,
      reselected: step.reselected
    };
  }
  return {
    pose: {
      body: to.body,
      heading: to.heading,
      pitch: to.pitch,
      position: worldPosition(
        placement,
        { x: step.point[0], y: local.y, z: step.point[1] },
        negateZ
      )
    },
    refused: step.refused,
    regionIndex: step.regionIndex,
    reselected: step.reselected
  };
};

const movingAttachment = (
  attachment: EntranceAttachment,
  openUnits: number
): Mesh => {
  const { mesh } = attachment;
  if (openUnits <= 0) {
    return mesh;
  }
  const axis = attachment.constructor.motionAxis === 'x' ? 0 : 2;
  const values = mesh.vertices.map(vertex => vertex[axis]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const midpoint = (minimum + maximum) / 2;
  const split = mesh.vertices.length / 2;
  return {
    ...mesh,
    vertices: mesh.vertices.map((vertex, index) => {
      const coordinate = vertex[axis];
      let delta = 0;
      if (attachment.constructor.leafCount === 2 && coordinate === midpoint) {
        delta = index < split ? -openUnits : openUnits;
      } else if (
        attachment.constructor.leafCount === 1 &&
        attachment.constructor.movingSide === 'low' &&
        coordinate === minimum
      ) {
        delta = openUnits;
      } else if (
        attachment.constructor.leafCount === 1 &&
        attachment.constructor.movingSide === 'high' &&
        coordinate === maximum
      ) {
        delta = -openUnits;
      }
      if (delta === 0) {
        return vertex;
      }
      const moved = [...vertex] as [number, number, number];
      moved[axis] += delta;
      return moved;
    })
  };
};

/// `$539DE`: the building detail's faces from one of its two list groups, the first bounded
/// record whose box holds the eye's model-local position, else the group's default. Group 0 is
/// bound at `$C13C`, group 1 at `$C2FE` (docs/research/damocles-structure-draw-selection.md).
const detailMesh = (
  selection: NonNullable<ErisPlacement['selection']>,
  groupIndex: 0 | 1,
  local: readonly number[]
): StructureMesh => {
  const { groups, structure } = selection;
  const scales = [structure.scale[0], 1, structure.scale[1]];
  const group = groups[groupIndex]!;
  const records =
    group.boxes.find(box =>
      box.bounds.every(([min, max], axis) => {
        const scale = scales[axis]!;
        const a =
          min === -32_768 && axis !== 1
            ? -2_147_483_647 * Math.sign(scale)
            : min * scale;
        const b =
          max === 32_767 ? 2_147_483_647 * Math.sign(scale) : max * scale;
        return Math.min(a, b) < local[axis]! && local[axis]! <= Math.max(a, b);
      })
    )?.records ?? group.default;
  let scaled = scaledDetails.get(selection);
  if (scaled === undefined) {
    // A scale negative on one axis mirrors the detail, which turns every face's winding over.
    // The ST has no facing test, but the port culls back faces, so the mirrored faces are
    // rewound to keep their fronts where the unscaled model has them.
    const mirrored = structure.scale[0] * structure.scale[1] < 0;
    scaled = {
      ...selection.detail,
      faces: mirrored
        ? selection.detail.faces.map(face => ({
            ...face,
            vertices: [...face.vertices].reverse()
          }))
        : selection.detail.faces,
      vertices: selection.detail.vertices.map(([x, y, z]) => [
        x * structure.scale[0],
        y,
        z * structure.scale[1]
      ])
    };
    scaledDetails.set(selection, scaled);
  }
  // Cache per scaled model as list identities may be shared by differently scaled aliases.
  let lists = detailLists.get(scaled);
  if (lists === undefined) {
    lists = new WeakMap();
    detailLists.set(scaled, lists);
  }
  let selected = lists.get(records);
  if (selected === undefined) {
    // A selection byte names a source record, which may contribute several
    // filled glyph faces, a stroke line, or nothing at all.
    const byRecord = (primitives: readonly Primitive[]) => {
      const index = new Map<number, Primitive[]>();
      for (const primitive of primitives) {
        const key = primitive.sourceIndex;
        if (key === undefined) {
          continue;
        }
        const bucket = index.get(key);
        if (bucket === undefined) {
          index.set(key, [primitive]);
        } else {
          bucket.push(primitive);
        }
      }
      return index;
    };
    const facesByRecord = byRecord(scaled.faces);
    const linesByRecord = byRecord(scaled.lines);
    selected = {
      ...scaled,
      faces: records.flatMap(i => facesByRecord.get(i) ?? []),
      lines: records.flatMap(i => linesByRecord.get(i) ?? [])
    };
    lists.set(records, selected);
  }
  return selected;
};

/// Ordered draw components for a structure. Empty selections are intentional.
///
/// Aboard, `$0533D4` skips the region's plan queue `$5A744`, and `$53CC2` draws the building
/// detail from the `$C13C` group while the high word of Y `$7A30` is 0 and nothing above it. The
/// region and its wall texts play no part, so a craft over a roof sees the roof.
export const structureMeshes = (
  placement: ErisPlacement,
  pose: Pose,
  negateZ: boolean,
  openUnits: AttachmentUnits = closedAttachment,
  selectedRegionIndex?: number | null,
  carriedSlot: CarriedSlot = nothingCarried,
  floorLabelGlyphs: FloorLabelGlyphs = noFloorLabel,
  aboard = false
): readonly StructureMesh[] => {
  const fallback = () => (placement.mesh === undefined ? [] : [placement.mesh]);
  const selection = placement.selection;
  if (selection === undefined) {
    return fallback();
  }
  const { structure } = selection;
  const point = structureLocalPosition(placement, pose.position, negateZ);
  const local = [point.x, point.y, point.z];
  if (aboard) {
    return Math.floor(pose.position.y / 0x1_00_00) === 0
      ? [detailMesh(selection, 0, local)]
      : [];
  }
  // Without a session's region there are no latches either, so a door at rest at its endpoint
  // stands for one latched open.
  const regionIndex =
    selectedRegionIndex === undefined
      ? structureRegionAt(placement, pose, negateZ, slot =>
          openUnits(slot) >=
          attachmentOpenLimit(
            structure.attachments.find(item => item.slot === slot)!
          )
            ? 'open'
            : 'closed'
        )
      : selectedRegionIndex;
  const region =
    regionIndex === null ? undefined : structure.regions[regionIndex];
  if (region === undefined) {
    return fallback();
  }
  // `$05A41A` appends each wall text straight after the queue entry it rides on, so it draws
  // exactly when and where that entry does. A Floor Label is wall text too, in list order with
  // the literal records; no record carries both kinds on one face.
  const wallTexts = (entry: RegionQueueEntry): StructureMesh[] => [
    ...(structure.floorLabels ?? []).flatMap(label => {
      if (!sameQueueEntry(label.face, entry)) {
        return [];
      }
      const glyph = floorLabelGlyphs(floorLabelFont(label, carriedSlot));
      return glyph === undefined ? [] : [floorLabelMesh(label, glyph)];
    }),
    ...(structure.wallTexts ?? [])
      .filter(text => sameQueueEntry(text.face, entry))
      .map(text => wallTextMesh(wallTextGlyphs(text, carriedSlot), text.plane))
  ];
  const plan = region.queue.flatMap((entry): StructureMesh[] => {
    if (entry.kind === 'attachment') {
      const attachment = structure.attachments.find(
        item => item.slot === entry.slot
      )!;
      return [
        movingAttachment(attachment, openUnits(entry.slot)),
        ...wallTexts(entry)
      ];
    }
    const face = structure.plan.faces.find(f => f.sourceIndex === entry.index)!;
    return [subset(face, structure.plan, [face]), ...wallTexts(entry)];
  });
  const detail =
    (region.flags & 0x80_00) === 0 ? [] : [detailMesh(selection, 1, local)];
  return (region.flags & 0x40_00) !== 0 && (region.flags & 0x10_00) === 0
    ? [...plan, ...detail]
    : [...detail, ...plan];
};
const detailLists = new WeakMap<Mesh, WeakMap<object, StructureMesh>>();

/// A wall text's glyphs: font 4's fallback font while `$054016` finds a named slot carried.
export const wallTextGlyphs = (
  text: WallText,
  carriedSlot: CarriedSlot
): Mesh =>
  text.fallback !== undefined && text.fallback.whileCarried.some(carriedSlot)
    ? text.fallback.mesh
    : text.mesh;

/// The font a Floor Label draws in: font 4's fallback while `$054016` finds a named slot carried.
export const floorLabelFont = (
  label: FloorLabel,
  carriedSlot: CarriedSlot
): number =>
  label.fallback !== undefined && label.fallback.whileCarried.some(carriedSlot)
    ? label.fallback.font
    : label.font;

const floorLabelMeshes = new WeakMap<
  FloorLabel,
  WeakMap<FloorLabelGlyph, StructureMesh>
>();
/// One Floor Label glyph placed as `$059EB6` places the record: point (x, y) at
/// `anchor + (x * sx, y * sy, 0)` on the XY plane, or `anchor + (0, y * sy, x * sx)` on ZY.
/// The label is one character, so the advance never applies. Cached per record and glyph, so
/// the frame's triangulation cache keeps hitting while the label holds.
export const floorLabelMesh = (
  label: FloorLabel,
  glyph: FloorLabelGlyph
): StructureMesh => {
  let byGlyph = floorLabelMeshes.get(label);
  if (byGlyph === undefined) {
    byGlyph = new WeakMap();
    floorLabelMeshes.set(label, byGlyph);
  }
  const cached = byGlyph.get(glyph);
  if (cached !== undefined) {
    return cached;
  }
  const [ax, ay, az] = label.anchor;
  const [sx, sy] = label.scale;
  const primitive = (vertices: readonly number[]): Primitive => ({
    colour: label.colour,
    ...(label.dayColour === undefined ? {} : { dayColour: label.dayColour }),
    sourceColour: label.sourceColour,
    vertices
  });
  const mesh: StructureMesh = {
    faces: (glyph.faces ?? []).map(primitive),
    lines: (glyph.lines ?? []).map(primitive),
    vertices: glyph.points.map(([x, y]) =>
      label.plane === 0
        ? [ax + x * sx, ay + y * sy, az]
        : [ax, ay + y * sy, az + x * sx]
    ),
    wallTextPlane: label.plane
  };
  byGlyph.set(glyph, mesh);
  return mesh;
};
