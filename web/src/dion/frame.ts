import {
  IndexedFrame,
  levelCamera,
  screenLine,
  screenPolygon,
  toCamera,
  type CameraPoint,
  type LevelCamera
} from './raster.ts';
import type {
  DionAttachment,
  DionCell,
  DionDetail,
  DionGlyph,
  DionModel,
  DionModelFace,
  DionModelForm,
  DionResident,
  DionStructure,
  DionWorld
} from './world.ts';

/// One frame of the Mercenary III 3D view, planned from the world document by the
/// original's recovered rules and painted into an indexed frame.
///
/// The order is the game's (#644): the frame palette starts from its template, the
/// whole view is cleared to colour 8 (sky above the horizon row, land below, by the
/// raster split), the occupied cell's ground record is drawn with culling off, and
/// then the drawn list is painted far to near by its sorted key. The occupied
/// structure takes its place in that list at its own key, drawing its plan and
/// building detail in the order its current region's flags give, with the residents
/// its association list hooks into the region queue. Every model draws one
/// viewer-selected face list in authored order.
///
/// What this does not draw is named in `gaps`: the road-line pass `$55D7E`, the
/// horizon line, stars and sky Bodies (#646), and any text token whose live string
/// the slice does not bind.

export type Vec3 = readonly [number, number, number];

export interface DionResidentPose {
  readonly position: Vec3;
  readonly yaw: number;
}

export interface DionDoorState {
  /// 0 shut … 142 fully open; the leaves stop eight units inside their outer edges.
  readonly openUnits: number;
}

export interface DionFrameState {
  readonly cell: number;
  readonly day: boolean;
  readonly doors: ReadonlyMap<number, DionDoorState>;
  /// The driver's head shows its profile (`$6EA4`, or the message state).
  readonly driverProfile: boolean;
  readonly eye: Vec3;
  readonly frameCounter: number;
  /// The view yaw, 1024ths of a turn (`$7136`).
  readonly heading: number;
  /// The resident slot the player rides as a passenger (`$6EB2` / 4), if any.
  readonly passenger: number | null;
  /// The region of the occupied structure the player stands in, from 1.
  readonly region: number;
  readonly residents: ReadonlyMap<number, DionResidentPose>;
  /// The character the animated sign buffer `$B3F2` holds.
  readonly signCode: number;
}

export interface DionFrameStats {
  readonly gaps: readonly string[];
  readonly lines: number;
  readonly models: readonly number[];
  readonly polygons: number;
}

export interface DionFrame {
  readonly frame: IndexedFrame;
  /// Sixteen ST colour words for rows above the horizon, and the land word the
  /// raster split puts into colour 8 below it.
  readonly palette: readonly number[];
  readonly horizonRow: number;
  readonly land: number;
  readonly stats: DionFrameStats;
}

const FREE = 0x8000;
const FIRST_ATTACHMENT_SLOT = 0x254;
const SPACE = 0x20;

/// The frame palette shadow (`[$72B4]`) as the fill allocates it: a literal colour
/// takes the first free entry met from 15 down, or reuses a match met first, and a
/// full palette falls back to entry 0.
class FramePalette {
  readonly entries: number[];

  constructor(template: readonly number[]) {
    this.entries = template.slice(0, 16);
  }

  literal(colour: number): number {
    for (let index = 15; index >= 0; index -= 1) {
      const entry = this.entries[index]!;
      if (entry & FREE) {
        this.entries[index] = colour;
        return index;
      }
      if (entry === colour) {
        return index;
      }
    }
    return 0;
  }
}

interface Paint {
  readonly gaps: Set<string>;
  /// `$B300`: the two characters the last `$8008` header wrote, which token `$8B` reads.
  labelCode: number | null;
  lines: number;
  readonly models: number[];
  readonly palette: FramePalette;
  polygons: number;
  readonly scene: readonly number[];
}

/// `$5513C..$55170` and the fill's colour read: a word with bit 15 clear is a literal
/// ST colour; `$80nn` names frame entry nn; `$80nn` with bit 7 set reads the live scene
/// palette half, whose entry is resolved again.
const resolveColour = (paint: Paint, word: number): number => {
  let value = word;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!(value & 0x8000)) {
      return paint.palette.literal(value);
    }
    if (!(value & 0x80)) {
      return value & 0x0f;
    }
    const entry = paint.scene[(value & 0x7e) >> 1];
    if (entry === undefined) {
      paint.gaps.add(`scene palette entry ${(value & 0x7e) >> 1} is not exported`);
      return 0;
    }
    value = entry;
  }
  return 0;
};

/// Q15 integer rotation as the model reader does it: the high word of each product
/// sum, doubled, kept to sixteen bits.
const q15 = (sum: number): number => {
  const high = Math.floor(sum / 65536);
  return ((((high * 2) & 0xffff) ^ 0x8000) - 0x8000) | 0;
};

const rotate = (
  table: readonly number[],
  angle: number,
  a: number,
  b: number
): [number, number] => {
  const sin = table[angle & 0xff]!;
  const cos = table[(angle & 0xff) + 64]!;
  return [q15(a * cos + b * sin), q15(b * cos - a * sin)];
};

interface View {
  readonly camera: LevelCamera;
  readonly frame: IndexedFrame;
  readonly paint: Paint;
  readonly state: DionFrameState;
  readonly world: DionWorld;
}

const camera = (view: View, point: Vec3): CameraPoint =>
  toCamera(
    view.camera,
    point[0] - view.camera.eye[0],
    point[1] - view.camera.eye[1],
    point[2] - view.camera.eye[2]
  );

const fill = (
  view: View,
  points: readonly Vec3[],
  colour: number,
  cull: boolean
): void => {
  const outline = screenPolygon(
    points.map(point => camera(view, point)),
    cull
  );
  if (outline === null) {
    return;
  }
  view.frame.fillPolygon(outline, resolveColour(view.paint, colour));
  view.paint.polygons += 1;
};

const stroke = (view: View, a: Vec3, b: Vec3, colour: number): void => {
  const segment = screenLine(camera(view, a), camera(view, b));
  if (segment === null) {
    return;
  }
  view.frame.drawLine(segment[0], segment[1], resolveColour(view.paint, colour));
  view.paint.lines += 1;
};

// ---- Cells and the bound structure ------------------------------------------------

interface Bound {
  readonly cell: DionCell;
  readonly detail: DionDetail;
  readonly origin: Vec3;
  readonly plan: readonly (readonly [number, number])[];
  readonly structure: DionStructure;
  readonly walls: readonly { readonly colour: number; readonly refs: readonly number[] }[];
}

const cellBase = (world: DionWorld, cell: DionCell): [number, number] => [
  (world.opening.groupOrigin[0] + cell.x) * 0x10000,
  (world.opening.groupOrigin[1] + cell.z) * 0x10000
];

/// `$5AF8E..$5B212`: the plan vertices and walls a door adds, with its inner leaf
/// edges where the mover has left them.
const doorGeometry = (
  door: DionAttachment,
  openUnits: number
): {
  readonly vertices: (readonly [number, number])[];
  readonly walls: { colour: number; refs: number[] }[];
} => {
  const [x0, z0, x1, z1] = door.leaves;
  const n = door.firstVertex;
  const [c0, c1, c2] = door.colours as [number, number, number];
  if (door.twoLeaves) {
    const open = Math.max(0, Math.min(142, openUnits));
    if (door.motionAxis === 'x') {
      const mid = (x0 + x1) >> 1;
      return {
        vertices: [
          [x0, z0], [x0, z1], [mid - open, z1], [mid - open, z0],
          [mid + open, z0], [mid + open, z1], [x1, z1], [x1, z0]
        ],
        walls: [
          { colour: c0, refs: [n + 3, n] },
          { colour: c1, refs: [n + 2, n + 3] },
          { colour: c2, refs: [n + 1, n + 2] },
          { colour: c0, refs: [n + 7, n + 4] },
          { colour: c1, refs: [n + 4, n + 5] },
          { colour: c2, refs: [n + 5, n + 6] }
        ]
      };
    }
    const mid = (z0 + z1) >> 1;
    return {
      vertices: [
        [x0, z0], [x1, z0], [x1, mid - open], [x0, mid - open],
        [x0, mid + open], [x1, mid + open], [x1, z1], [x0, z1]
      ],
      walls: [
        { colour: c0, refs: [n + 3, n] },
        { colour: c1, refs: [n + 2, n + 3] },
        { colour: c2, refs: [n + 1, n + 2] },
        { colour: c0, refs: [n + 7, n + 4] },
        { colour: c1, refs: [n + 4, n + 5] },
        { colour: c2, refs: [n + 5, n + 6] }
      ]
    };
  }
  const vertices: (readonly [number, number])[] =
    door.motionAxis === 'x'
      ? [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]
      : [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const edge =
    door.control & 0x0100 ? [n, n + 1] : [n + 2, n + 3];
  return {
    vertices,
    walls: [
      { colour: c0, refs: [n + 3, n] },
      { colour: c1, refs: edge },
      { colour: c2, refs: [n + 1, n + 2] }
    ]
  };
};

const bind = (
  world: DionWorld,
  state: DionFrameState
): Bound | null => {
  const cell = world.cells.find(item => item.cell === state.cell);
  if (cell === undefined) {
    return null;
  }
  const structure = world.structures
    .get(cell.structure)
    ?.get(cell.scale.join(','));
  const detail = world.details.get(cell.detail);
  if (structure === undefined || detail === undefined) {
    return null;
  }
  const [bx, bz] = cellBase(world, cell);
  const plan: (readonly [number, number])[] = [...structure.plan];
  const walls: { colour: number; refs: readonly number[] }[] = structure.walls.map(
    wall => ({ colour: wall.colour, refs: wall.refs })
  );
  for (const door of structure.attachments) {
    const geometry = doorGeometry(
      door,
      state.doors.get(door.slot)?.openUnits ?? 0
    );
    plan.push(...geometry.vertices);
    walls.push(...geometry.walls);
  }
  return {
    cell,
    detail,
    origin: [bx + cell.origin[0], world.structureY, bz + cell.origin[1]],
    plan,
    structure,
    walls
  };
};

// ---- Lettering ----------------------------------------------------------------------

interface TextPlacement {
  readonly advance: number;
  readonly colour: number;
  /// Bits 6 and 7 of the flags: where the glyph's x and y go.
  readonly flags: number;
  readonly glyphScale: readonly [number, number];
  readonly origin: Vec3;
  readonly text: readonly number[];
}

/// `$551AA` and the token lookup: a character with bit 7 set either is a token, whose
/// live string the slice binds here, or (inside a string) draws in black.
const resolveTokens = (
  view: View,
  bound: Bound | null,
  text: readonly number[]
): { code: number; black: boolean }[] => {
  const result: { code: number; black: boolean }[] = [];
  for (const code of text) {
    if (!(code & 0x80)) {
      result.push({ black: false, code });
      continue;
    }
    const token = code & 0x7f;
    const characters = tokenString(view, bound, token);
    if (characters === null) {
      view.paint.gaps.add(`text token $${code.toString(16).toUpperCase()} is not bound`);
      continue;
    }
    for (const character of characters) {
      result.push({ black: (character & 0x80) !== 0, code: character & 0x7f });
    }
  }
  return result;
};

const tokenString = (
  view: View,
  bound: Bound | null,
  token: number
): number[] | null => {
  const { lettering } = view.world;
  if (token === 0x0b) {
    const code = view.paint.labelCode;
    return code === null ? null : [code >> 8, code & 0xff];
  }
  if (token === 0x09 || token === 0x1d) {
    // `$5600C..$560B0`: cells keyed from $A0 bind a set; others draw blanks.
    const set = bound?.cell.tokenSet ?? null;
    const target =
      set === null
        ? token === 0x09 ? 0xb380 : 0xb338
        : (token === 0x09 ? lettering.bindings89 : lettering.bindings9D)[set];
    if (target === 0xb380 || target === 0xb338) {
      return [SPACE];
    }
    if (target === 0xb3f2) {
      return [view.state.signCode];
    }
    return null;
  }
  if (token >= 0x0d && token <= 0x16) {
    // `$5AF60`: the binder writes each door's key letter (key + $23) or a space at
    // $B301 + 2n.
    const door = bound?.structure.attachments[(token - 0x0d) >> 0];
    if (door === undefined) {
      return [SPACE];
    }
    return [doorKeyLetter(door, bound!.cell)];
  }
  return null;
};

const doorKeyLetter = (door: DionAttachment, cell: DionCell): number => {
  const low = door.key ?? 0;
  if (low === 0) {
    return SPACE;
  }
  // Signed byte compare at $5AF10: $F0..$FF and $10..$7F add the cell's key base.
  const signed = low >= 0x80 ? low - 0x100 : low;
  const key = signed >= -16 ? (cell.keyBase === 0 ? 0 : cell.keyBase + (low & 0x0f)) : low;
  return key === 0 ? SPACE : (key + 0x23) & 0xff;
};

const glyphOf = (world: DionWorld, font: number, code: number): DionGlyph | undefined =>
  world.glyphs.get(`${font}:${code.toString(16).toUpperCase().padStart(2, '0')}`);

/// `$550F2..$552DE`: glyph points, scaled and placed in the record's plane, one
/// character at a time along the advance.
const drawText = (view: View, bound: Bound | null, placement: TextPlacement): void => {
  const font = placement.flags & 0x0f;
  const [gx, gy] = placement.glyphScale;
  const characters = resolveTokens(view, bound, placement.text);
  let [x, y, z] = placement.origin;
  for (const { code, black } of characters) {
    const glyph = glyphOf(view.world, font, code);
    if (glyph === undefined) {
      view.paint.gaps.add(`font ${font} glyph $${code.toString(16)} is not exported`);
    } else {
      // `$55208`: font 7 adds its points to twice the origin and halves the sum, so its
      // glyphs stand at half scale.
      const half = font === 7 ? 0.5 : 1;
      const point = (index: number): Vec3 => {
        const [px, py] = glyph.points[index]!;
        const a = px * gx * half;
        const b = py * gy * half;
        if (placement.flags & 0x80) {
          return [x, y + b, z + a];
        }
        if (placement.flags & 0x40) {
          return [x + a, y, z + b];
        }
        return [x + a, y + b, z];
      };
      for (const primitive of glyph.primitives) {
        const colour = black ? 0x8000 : (primitive.colour ?? placement.colour);
        const points = primitive.refs.map(ref => point((ref >> 2) - 1));
        if (primitive.kind === 'line') {
          stroke(view, points[0]!, points[1]!, colour);
        } else {
          fill(view, points, colour, true);
        }
      }
    }
    if (placement.flags & 0x80) {
      z += placement.advance;
    } else {
      x += placement.advance;
    }
  }
};

// ---- Models ---------------------------------------------------------------------------

interface Drawn {
  readonly key: number;
  readonly slot: number;
}

const residentPose = (
  view: View,
  resident: DionResident
): DionResidentPose =>
  view.state.residents.get(resident.slot) ?? {
    position: resident.position,
    yaw: resident.yaw
  };

/// `$545AE..$549BA`: one model, by its single header operation.
const drawModel = (
  view: View,
  bound: Bound | null,
  slot: number,
  model: DionModel,
  pose: DionResidentPose
): void => {
  const header = model.header;
  const op = header?.op;
  if (op === 0x0 || op === 0x6) {
    return;
  }
  if (header?.op === 0x8 && header.code !== undefined) {
    view.paint.labelCode = header.code;
  }
  let mode = 0;
  let yaw = 0;
  let form: DionModelForm = model;
  let origin: Vec3 = pose.position;
  let relative = false;
  if (header !== undefined && (op === 0x1 || op === 0xd)) {
    mode = header.mode ?? 0;
    yaw = (pose.yaw + (header.yawOffset ?? 0)) & 0xff;
    if (op === 0x1 && slot === 10) {
      mode = 1;
    }
    if (op === 0xd && view.state.passenger === slot && model.passenger) {
      // `$54444`: the passenger form at (0, −63, 0) from the eye, ×16.
      if (slot >= 12 && slot < 16) {
        mode = 1;
      }
      mode |= 0x20;
      form = model.passenger;
      relative = true;
      origin = [0, -63, 0];
    }
  }
  const range = header?.op === 0xc ? (header.range ?? 1) : 1;
  const eye = view.camera.eye;
  const rel: Vec3 = relative
    ? origin
    : [origin[0] - eye[0], origin[1] - eye[1], origin[2] - eye[2]];
  if (!relative && rel.some(value => Math.abs(value) > range * 0x10000)) {
    return;
  }
  view.paint.models.push(slot);
  const patched = blinkColours(view, slot, model);
  drawForm(view, bound, form, rel, mode, yaw, patched);
  if (relative) {
    // The driver's head follows from `$6ECE`, +1 entry in profile.
    const head = view.world.models.get(view.state.driverProfile ? 264 : 263);
    if (head !== undefined) {
      drawForm(view, bound, head, rel, mode, yaw, null);
    }
  }
};

/// `$543DE..$5442A`: the `$8003` beacon writes colour index 3 or 1 into its targets by
/// the frame counter plus the slot's phase word.
const blinkColours = (
  view: View,
  slot: number,
  model: DionModel
): ReadonlyMap<number, number> | null => {
  const header = model.header;
  if (header?.op !== 0x3) {
    return null;
  }
  const phase = view.world.blinkPhase.get(slot) ?? 0;
  const value = header.value ?? 0;
  const lit = ((view.state.frameCounter + phase) & 4) === 0;
  const colour = value === 4 || value === 5 ? 3 : lit ? 3 : 1;
  return new Map([[-1, value], [-2, colour]]);
};

const drawForm = (
  view: View,
  bound: Bound | null,
  form: DionModelForm,
  rel: Vec3,
  mode: number,
  yaw: number,
  blink: ReadonlyMap<number, number> | null
): void => {
  const table = view.world.rotationTable;
  const eye = view.camera.eye;
  const world = (local: readonly [number, number, number]): Vec3 => {
    let [x, y, z] = local;
    if (mode & 0x40 || (mode !== 0 && !(mode & 0x80))) {
      if (mode & 0x20) {
        x <<= 4;
        y <<= 4;
        z <<= 4;
      }
      if (mode & 0x40) {
        [x, z] = rotate(table, yaw, x, z);
      }
    }
    return [eye[0] + rel[0] + x, eye[1] + rel[1] + y, eye[2] + rel[2] + z];
  };
  const points = form.vertices.map(world);
  // `$54952`: the first alternative whose box holds the model's origin seen from the
  // eye, else the default list.
  let faces: readonly DionModelFace[] = form.faces;
  for (const alternative of form.alternatives) {
    const inside = [0, 1, 2].every(axis => {
      const offset = (rel[axis]! - alternative.min[axis]!) >>> 0;
      return offset < alternative.size[axis]! >>> 0;
    });
    if (inside) {
      faces = alternative.faces;
      break;
    }
  }
  const colours = view.world.modelColours;
  for (const face of faces) {
    if (face.kind === 'drawn') {
      return;
    }
    if (face.kind === 'text') {
      if (face.text === undefined) {
        view.paint.gaps.add('model text through a pointer is not bound');
        continue;
      }
      drawText(view, bound, {
        advance: face.advance,
        colour: face.colour,
        flags: face.flags,
        glyphScale: face.glyphScale,
        origin: [eye[0] + rel[0] + face.offset[0], eye[1] + rel[1] + face.offset[1], eye[2] + rel[2] + face.offset[2]],
        text: face.text
      });
      continue;
    }
    let index = face.colour;
    if (blink !== null && face.kind === 'polygon' && (index === blink.get(-1))) {
      index = blink.get(-2)!;
    }
    const colour = colours[index] ?? 0;
    const vertices = face.refs.map(ref =>
      ref === 0 ? world([0, 0, 0]) : points[(ref >> 2) - 1]!
    );
    if (face.kind === 'line') {
      stroke(view, vertices[0]!, vertices[1]!, colour);
    } else {
      fill(view, vertices, colour, true);
    }
  }
};

// ---- Zones and the drawn list -----------------------------------------------------------

/// `$59F08`: a cell-local position against the bound detail's extent rectangle, in
/// three columns by three rows.
const zoneOf = (bound: Bound, x: number, z: number): number => {
  const extent = bound.detail.extent;
  if (extent === null || extent.y < 0) {
    return 0;
  }
  const [sx, sz] = bound.cell.scale;
  let [x0, x1] = [extent.x[0] * sx + bound.cell.origin[0], extent.x[1] * sx + bound.cell.origin[0]];
  let [z0, z1] = [extent.z[0] * sz + bound.cell.origin[1], extent.z[1] * sz + bound.cell.origin[1]];
  if (sx < 0) {
    [x0, x1] = [x1, x0];
  }
  if (sz < 0) {
    [z0, z1] = [z1, z0];
  }
  const lx = x & 0xffff;
  const lz = z & 0xffff;
  let zone = 0;
  if (lx >= (x0 & 0xffff)) {
    zone += lx <= (x1 & 0xffff) ? 1 : 2;
  }
  if (lz >= (z0 & 0xffff)) {
    zone += lz <= (z1 & 0xffff) ? 3 : 6;
  }
  return zone;
};

interface Placed {
  readonly cellNumber: number;
  readonly model: DionModel | undefined;
  readonly pose: DionResidentPose;
  readonly slot: number;
}

/// The residents a frame can draw: each template slot the cell's ground record
/// binds, then the fixed list at `$7422` (slot 0 is the structure).
const drawable = (view: View, bound: Bound | null): Placed[] => {
  const placed: Placed[] = [];
  if (bound !== null) {
    const ground = view.world.grounds.get(bound.cell.ground.address);
    const templates = ground?.primitives.filter(item => item.kind === 'template') ?? [];
    const [bx, bz] = cellBase(view.world, bound.cell);
    const transform = bound.cell.ground.transform;
    const slots = templates.map((_, index) => view.world.drawList.templateTop - index);
    slots.reverse();
    templates.forEach((template, index) => {
      if (template.kind !== 'template') {
        return;
      }
      const [x, z] = transformGround(transform, template.x, template.z);
      placed.push({
        cellNumber: bound.cell.cell,
        model: view.world.models.get(template.model),
        pose: { position: [bx + (x & 0xffff), 0, bz + (z & 0xffff)], yaw: 0 },
        slot: view.world.drawList.templateTop - index
      });
    });
    placed.sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));
  }
  for (const slot of view.world.drawList.fixed) {
    if (slot === 0) {
      placed.push({
        cellNumber: bound?.cell.cell ?? -1,
        model: undefined,
        pose: { position: bound?.origin ?? [0, 0, 0], yaw: 0 },
        slot: 0
      });
      continue;
    }
    const resident = view.world.residents.find(item => item.slot === slot);
    if (resident === undefined || resident.model === null) {
      continue;
    }
    const pose = residentPose(view, resident);
    placed.push({
      cellNumber: cellNumberOf(view.world, pose.position),
      model: view.world.models.get(resident.model),
      pose,
      slot
    });
  }
  return placed;
};

const cellNumberOf = (world: DionWorld, position: Vec3): number => {
  const x = Math.floor(position[0] / 0x10000) - world.opening.groupOrigin[0];
  const z = Math.floor(position[2] / 0x10000) - world.opening.groupOrigin[1];
  return x >= 0 && x < 16 && z >= 0 && z < 16 ? z * 16 + x : -1;
};

/// `$56220..$5623C`: bit 2 swaps the axes, bit 0 negates X, bit 1 negates Z.
const transformGround = (transform: number, x: number, z: number): [number, number] => {
  let [a, b] = transform & 4 ? [z, x] : [x, z];
  if (transform & 1) {
    a = -a;
  }
  if (transform & 2) {
    b = -b;
  }
  return [a, b];
};

/// `$541CA..$542AE`: the distance key with the priority byte above it.
const drawKey = (view: View, bound: Bound | null, item: Placed, playerZone: number): number => {
  const eye = view.camera.eye;
  const [x, y, z] = item.pose.position;
  const distance = Math.hypot(x - eye[0], y - eye[1], z - eye[2]);
  let priorityIndex = 0x51;
  let far = 0;
  if (bound !== null && item.cellNumber === bound.cell.cell) {
    const zone = item.slot === 0 ? 4 : zoneOf(bound, x, z);
    if (zone === 4 && item.slot !== 0) {
      const above = view.world.eyeHeight !== 0 || y !== 0 ? eye[1] > y : false;
      if (!above) {
        far = 0x80;
      }
    }
    priorityIndex = zone + playerZone * 9;
  }
  const priority = view.world.drawPriority[priorityIndex] ?? 0x7f;
  // A log-float distance: the exponent with the priority byte added to its top byte.
  const exponent = distance <= 0 ? 0 : Math.ceil(Math.log2(distance + 1));
  return priority * 0x1000000 + (exponent + far) * 0x10000 + Math.min(0xffff, distance / 2 ** exponent * 0xffff);
};

// ---- Plan, detail and the structure dispatch -------------------------------------------------

const planPoint = (bound: Bound, ref: number, y: number): Vec3 => {
  const [x, z] = bound.plan[ref - 1]!;
  return [bound.origin[0] + x, y, bound.origin[2] + z];
};

/// `$5C0CC`: one plan wall by the form its colour carries (bits 12..14).
const drawWall = (view: View, bound: Bound, slot: number): void => {
  const wall = bound.walls[(slot >> 2) - 1];
  if (wall === undefined) {
    view.paint.gaps.add(`plan wall slot $${slot.toString(16)} is unknown`);
    return;
  }
  const form = (wall.colour >> 12) & 7;
  const colour = wall.colour & 0x8fff;
  const [height, lower] = bound.structure.heights;
  const third = 48;
  const [a, b] = wall.refs as [number, number];
  if (form <= 2 || form === 7) {
    const top = form === 0 ? height : form === 1 ? lower : form === 2 ? third : height;
    const bottom = form === 7 ? lower : 0;
    fill(
      view,
      [planPoint(bound, a, bottom), planPoint(bound, b, bottom), planPoint(bound, b, top), planPoint(bound, a, top)],
      colour,
      false
    );
    return;
  }
  const y = form === 3 ? third : form === 4 ? 0 : form === 5 ? lower : height;
  fill(
    view,
    wall.refs.map(ref => planPoint(bound, ref, y)),
    colour,
    true
  );
};

/// `$5B7F6..$5B910`: a door's leaves, inner edges first while it is not shut, then the
/// faces toward the viewer.
const drawDoor = (view: View, bound: Bound, slot: number): void => {
  const door = bound.structure.attachments.find(item => item.slot === slot);
  if (door === undefined) {
    view.paint.gaps.add(`attachment slot $${slot.toString(16)} is unknown`);
    return;
  }
  const first = door.firstWall * 4;
  const open = (view.state.doors.get(door.slot)?.openUnits ?? 0) > 0;
  const local = [view.camera.eye[0] - bound.origin[0], view.camera.eye[2] - bound.origin[2]];
  const [x0, z0, x1, z1] = door.leaves;
  if (door.twoLeaves) {
    if (open) {
      drawWall(view, bound, first + 4);
      drawWall(view, bound, first + 16);
    }
    const along = door.motionAxis === 'x' ? local[1]! : local[0]!;
    const [near, farEdge] = door.motionAxis === 'x' ? [z0, z1] : [x0, x1];
    if (along < near) {
      drawWall(view, bound, first);
      drawWall(view, bound, first + 12);
    } else if (along >= farEdge) {
      drawWall(view, bound, first + 8);
      drawWall(view, bound, first + 20);
    }
    return;
  }
  if (open) {
    drawWall(view, bound, first + 4);
  }
  const along = door.motionAxis === 'x' ? local[1]! : local[0]!;
  const [near, farEdge] = door.motionAxis === 'x' ? [z0, z1] : [x0, x1];
  if (along < near) {
    drawWall(view, bound, first);
  } else if (along >= farEdge) {
    drawWall(view, bound, first + 8);
  }
};

/// `$5B3A6..$5B48E`: the region queue with the occupants hooked in before the wall
/// byte each pair names (a wall byte of 0 hooks after the whole queue).
type QueueEntry =
  | { readonly kind: 'wall'; readonly slot: number }
  | { readonly kind: 'door'; readonly slot: number }
  | { readonly kind: 'hook'; readonly slots: readonly number[] }
  | { readonly kind: 'text'; readonly index: number };

const regionQueue = (view: View, bound: Bound, region: number): QueueEntry[] => {
  const structure = bound.structure;
  const occupants: { slot: number; wall: number }[] = [];
  for (let slot = 255; slot >= 1; slot -= 1) {
    const resident = view.world.residents.find(item => item.slot === slot);
    if (
      resident === undefined ||
      resident.cell !== bound.cell.cell ||
      resident.group !== view.world.metisGroup ||
      resident.association === 0
    ) {
      continue;
    }
    const entry = structure.associations.find(item => item.id === resident.association);
    if (entry === undefined) {
      continue;
    }
    for (const [r, wall] of [[resident.association, 0] as const, ...entry.hooks]) {
      if (r === region) {
        occupants.push({ slot, wall });
      }
    }
  }
  const lowest = FIRST_ATTACHMENT_SLOT - 4 * (structure.attachments.length - 1);
  const queue: QueueEntry[] = [];
  const bytes = [...(structure.regions[region - 1]?.queue ?? []), 0];
  for (const byte of bytes) {
    const hooked = occupants.filter(item => item.wall === byte).map(item => item.slot);
    if (hooked.length > 0) {
      const last = queue[queue.length - 1];
      if (last?.kind === 'hook') {
        queue[queue.length - 1] = { kind: 'hook', slots: [...last.slots, ...hooked] };
      } else {
        queue.push({ kind: 'hook', slots: hooked });
      }
    }
    if (byte === 0) {
      break;
    }
    const slot = (byte >= 0x96 ? byte - 0x6a : byte) * 4;
    if (structure.attachments.length > 0 && slot >= lowest) {
      queue.push({ kind: 'door', slot });
    } else {
      queue.push({ kind: 'wall', slot });
    }
    const text = structure.wallTexts.findIndex(item => item.face * 4 === slot);
    if (text >= 0) {
      queue.push({ index: text, kind: 'text' });
    }
  }
  return queue;
};

const drawPlan = (view: View, bound: Bound, playerZone: number): void => {
  for (const entry of regionQueue(view, bound, view.state.region)) {
    if (entry.kind === 'wall') {
      drawWall(view, bound, entry.slot);
    } else if (entry.kind === 'door') {
      drawDoor(view, bound, entry.slot);
    } else if (entry.kind === 'hook') {
      drawHooked(view, bound, entry.slots, playerZone);
    } else {
      drawWallText(view, bound, entry.index);
    }
  }
};

/// `$54142`: hooked occupants sorted by the same key, then drawn far to near.
const drawHooked = (
  view: View,
  bound: Bound,
  slots: readonly number[],
  playerZone: number
): void => {
  const items: Placed[] = [];
  for (const slot of slots) {
    const resident = view.world.residents.find(item => item.slot === slot);
    if (resident === undefined || resident.model === null) {
      continue;
    }
    items.push({
      cellNumber: resident.cell,
      model: view.world.models.get(resident.model),
      pose: residentPose(view, resident),
      slot
    });
  }
  const keyed = items.map(item => ({ item, key: drawKey(view, bound, item, playerZone) }));
  keyed.sort((a, b) => b.key - a.key);
  for (const { item } of keyed) {
    if (item.model !== undefined) {
      drawModel(view, bound, item.slot, item.model, item.pose);
    }
  }
};

/// `$5AE76` and `$550B2`: a wall text, placed by the binder's mirroring rule.
const drawWallText = (view: View, bound: Bound, index: number): void => {
  const text = bound.structure.wallTexts[index]!;
  const [sx, sz] = bound.cell.scale;
  let [gx] = text.glyphScale;
  const gy = text.glyphScale[1];
  let advance = text.command * gx;
  const half = text.offset >> 1;
  let offset = text.offset & 1 ? half * Math.abs(text.plane & 0x80 ? sz : sx) : half;
  let x = text.anchor[0] * sx;
  let z = text.anchor[2] * sz;
  const negative = text.plane & 0x80 ? sx < 0 : sz < 0;
  if (negative) {
    gx = -gx;
    advance = -advance;
    offset = -offset;
  }
  if (text.plane & 0x80) {
    z -= offset;
  } else {
    x -= offset;
  }
  drawText(view, bound, {
    advance,
    colour: text.colour,
    flags: text.plane,
    glyphScale: [gx, gy],
    origin: [bound.origin[0] + x, text.anchor[1], bound.origin[2] + z],
    text: text.text
  });
};

/// `$54D24` with `$54A3E`: the second group's first box holding the viewer, else
/// its default list, drawn record by record.
const drawDetail = (view: View, bound: Bound): void => {
  const detail = bound.detail;
  if (detail.vertices.length === 0) {
    return;
  }
  const regionFlags = bound.structure.regions[view.state.region - 1]?.flags ?? 0;
  if (!(regionFlags & 0x8000)) {
    return;
  }
  const group = detail.groups[1];
  if (group === undefined) {
    return;
  }
  const [sx, sz] = bound.cell.scale;
  const eye = view.camera.eye;
  const viewer = [eye[0] - bound.origin[0], eye[1], eye[2] - bound.origin[2]];
  const span = (pair: readonly [number, number], factor: number): [number, number] => {
    const lo = pair[0] === -0x8000 ? -Infinity : pair[0] * factor;
    const hi = pair[1] === 0x7fff ? Infinity : pair[1] * factor;
    return factor < 0 ? [hi === Infinity ? -Infinity : hi, lo === -Infinity ? Infinity : lo] : [lo, hi];
  };
  let records = group.default;
  for (const box of group.boxes) {
    const [x0, x1] = span(box.x, sx);
    const [y0, y1] = span(box.y, 1);
    const [z0, z1] = span(box.z, sz);
    if (
      viewer[0]! > x0 && viewer[0]! <= x1 &&
      viewer[1]! > y0 && viewer[1]! <= y1 &&
      viewer[2]! > z0 && viewer[2]! <= z1
    ) {
      records = box.records;
      break;
    }
  }
  const mirrored = sx * sz < 0;
  const points = detail.vertices.map(
    ([x, y, z]): Vec3 => [bound.origin[0] + x * sx, y < 0 ? ~y : y, bound.origin[2] + z * sz]
  );
  for (const record of records) {
    const primitive = detail.primitives[record - 1];
    if (primitive === undefined) {
      view.paint.gaps.add(`detail ${detail.index} record ${record} is missing`);
      continue;
    }
    if (primitive.kind === 'text') {
      drawDetailText(view, bound, primitive);
      continue;
    }
    const refs = mirrored && primitive.kind === 'polygon' ? [...primitive.refs].reverse() : primitive.refs;
    const vertices = refs.map(ref => points[(ref >> 2) - 1]!);
    if (primitive.kind === 'line') {
      stroke(view, vertices[0]!, vertices[1]!, primitive.colour & ~0x4000);
    } else {
      fill(view, vertices, primitive.colour, true);
    }
  }
};

/// `$54FA0..$5502A`: a `$6000` record's anchor scaled with the structure and its
/// lettering mirrored with the scale on the axis it advances along.
const drawDetailText = (
  view: View,
  bound: Bound,
  record: Extract<DionDetail['primitives'][number], { kind: 'text' }>
): void => {
  const [sx, sz] = bound.cell.scale;
  let offset = record.offset;
  let [gx] = record.glyphScale;
  const gy = record.glyphScale[1];
  let advance = record.advance;
  let x = record.anchor[0] * sx;
  let z = record.anchor[2] * sz;
  if (!(record.flags & 0xc0)) {
    if (sz < 0) {
      offset = -offset;
      gx = -gx;
      advance = -advance;
    }
    x += offset;
  } else {
    if (!(record.flags & 0x40) && sx < 0) {
      offset = -offset;
      gx = -gx;
      advance = -advance;
    }
    z += offset;
  }
  drawText(view, bound, {
    advance,
    colour: record.colour,
    flags: record.flags,
    glyphScale: [gx, gy],
    origin: [bound.origin[0] + x, record.anchor[1], bound.origin[2] + z],
    text: record.text
  });
};

/// `$54356..$5439E`: the structure's place in the list, by its region's flags.
const drawStructure = (
  view: View,
  bound: Bound,
  playerZone: number,
  rest: () => void
): void => {
  const flags = bound.structure.regions[view.state.region - 1]?.flags ?? 0;
  if (!(flags & 0x4000)) {
    drawDetail(view, bound);
    rest();
    drawPlan(view, bound, playerZone);
    return;
  }
  if (flags & 0x1000) {
    drawDetail(view, bound);
    drawPlan(view, bound, playerZone);
  } else {
    drawPlan(view, bound, playerZone);
    drawDetail(view, bound);
  }
  rest();
};

// ---- The ground pass --------------------------------------------------------------------

/// `$576A2..$57726`: the cell's ground record, drawn with culling off.
const drawGround = (view: View, bound: Bound): void => {
  const ground = view.world.grounds.get(bound.cell.ground.address);
  if (ground === undefined) {
    return;
  }
  const [bx, bz] = cellBase(view.world, bound.cell);
  const transform = bound.cell.ground.transform;
  const mirrored = (bound.cell.ground.index & 4) !== 0;
  const points = ground.vertices.map(([x, z]): Vec3 => {
    const [a, b] = transformGround(transform, x, z);
    return [bx + (a & 0xffff), 0, bz + (b & 0xffff)];
  });
  // `$55DA4`: slots `$F0..$FC` stand at the centres of the cells the road runs to.
  const vertex = (ref: number): Vec3 => {
    const road = bound.cell.roadPoints.get(ref);
    if (ref >= 0xf0 && road !== undefined) {
      const [gx, gz] = view.world.opening.groupOrigin;
      return [(gx + (road & 15)) * 0x10000 + 0x8000, 0, (gz + (road >> 4)) * 0x10000 + 0x8000];
    }
    return points[(ref >> 2) - 1]!;
  };
  for (const primitive of ground.primitives) {
    if (primitive.kind === 'template') {
      continue;
    }
    if (primitive.kind === 'text') {
      view.paint.gaps.add('ground text records are not drawn');
      continue;
    }
    const refs = mirrored && primitive.kind === 'polygon' ? [...primitive.refs].reverse() : primitive.refs;
    const vertices = refs.map(vertex);
    if (primitive.kind === 'line') {
      stroke(view, vertices[0]!, vertices[1]!, primitive.colour & ~0x4000);
    } else {
      fill(view, vertices, primitive.colour, false);
    }
  }
};

// ---- The frame ----------------------------------------------------------------------------

export const planDionFrame = (
  world: DionWorld,
  state: DionFrameState
): DionFrame => {
  const bound = bind(world, state);
  const template = [...world.framePalette.template];
  const sky = state.day ? world.framePalette.skyDay : world.framePalette.skyNight;
  template[8] = sky;
  template[14] = world.framePalette.road;
  for (const [index, colour] of world.framePalette.fixed) {
    template[index] = colour;
  }
  const palette = new FramePalette(template);
  const sceneHalf = bound === null ? null : world.palettes.get(bound.cell.palette);
  const paint: Paint = {
    gaps: new Set(['horizon line, stars and sky Bodies (#646)']),
    labelCode: null,
    lines: 0,
    models: [],
    palette,
    polygons: 0,
    scene: sceneHalf === null || sceneHalf === undefined ? [] : state.day ? sceneHalf.day : sceneHalf.night
  };
  const frame = new IndexedFrame();
  frame.clear(8);
  const view: View = {
    camera: levelCamera(state.eye, state.heading),
    frame,
    paint,
    state,
    world
  };
  if (bound !== null) {
    drawGround(view, bound);
  } else {
    paint.gaps.add(`cell ${state.cell} is outside the exported slice`);
  }
  const playerZone = bound === null ? 0 : zoneOf(bound, state.eye[0], state.eye[2]);
  const keyed = drawable(view, bound).map(item => ({
    item,
    key: drawKey(view, bound, item, playerZone)
  }));
  // A stable descending sort, as the bubble sort's strict compare gives.
  const ordered = keyed
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.key - a.key || a.index - b.index);
  const paintFrom = (start: number): void => {
    for (let index = start; index < ordered.length; index += 1) {
      const { item } = ordered[index]!;
      if (item.slot === 0) {
        if (bound !== null) {
          drawStructure(view, bound, playerZone, () => paintFrom(index + 1));
          return;
        }
        continue;
      }
      if (item.model !== undefined) {
        drawModel(view, bound, item.slot, item.model, item.pose);
      }
    }
  };
  paintFrom(0);
  return {
    frame,
    horizonRow: world.framePalette.horizonRow,
    land: world.framePalette.land,
    palette: palette.entries.map(entry => (entry & FREE ? 0 : entry)),
    stats: {
      gaps: [...paint.gaps],
      lines: paint.lines,
      models: paint.models,
      polygons: paint.polygons
    }
  };
};

/// ST `$0RGB` (three bits a gun) to 8-bit RGB.
export const stRgb = (word: number): readonly [number, number, number] => {
  const gun = (shift: number): number => Math.round((((word >> shift) & 7) * 255) / 7);
  return [gun(8), gun(4), gun(0)];
};

/// The indexed frame as RGBA, with the horizon split writing the land colour into
/// entry 8 from its row down.
export const frameRgba = (planned: DionFrame, target: Uint8ClampedArray): void => {
  const upper = planned.palette.map(stRgb);
  const lower = upper.slice();
  lower[8] = stRgb(planned.land);
  const width = 320;
  for (let row = 0; row < 136; row += 1) {
    const colours = row < planned.horizonRow ? upper : lower;
    for (let column = 0; column < width; column += 1) {
      const [r, g, b] = colours[planned.frame.pixels[row * width + column]!]!;
      const at = (row * width + column) * 4;
      target[at] = r;
      target[at + 1] = g;
      target[at + 2] = b;
      target[at + 3] = 255;
    }
  }
};

export const openingFrameState = (world: DionWorld): DionFrameState => ({
  cell: world.opening.cell,
  day: true,
  doors: new Map(),
  driverProfile: false,
  eye: world.opening.eye,
  frameCounter: world.opening.frameCounter,
  heading: world.opening.heading,
  passenger: null,
  region: world.opening.region,
  residents: new Map(),
  signCode: SPACE
});

export type { DionCell };
