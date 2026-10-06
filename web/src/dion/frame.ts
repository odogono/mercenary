import {
  horizonFillVertices,
  horizonIslandVertices
} from '../coast/horizon.ts';
import {
  classifyPosition,
  islandFillTriangles,
  type CoastIsland,
  type CoastSurface
} from '../coast/islands.ts';
import { roadEdges } from '../coast/roads.ts';
import { renderAuthentic, rgbaFromIndexed } from '../rendering/authentic.ts';
import type {
  FrameDescription,
  OrderedPrimitive
} from '../rendering/description.ts';
import {
  IndexedFrame,
  screenLine,
  screenPolygon
} from '../rendering/raster.ts';
import { DION_PROJECTION } from './projection.ts';
import {
  generalCamera,
  levelCamera,
  project,
  toCamera,
  type CameraPoint,
  type LevelCamera
} from './raster.ts';
import { dionStars } from './sky.ts';
import type { TourcraftContent } from './tourcraftContent.ts';
import {
  tourcraftSkyPrimitives,
  tourcraftStars,
  type TourcraftSkyView
} from './tourcraftSky.ts';
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
/// original's recovered rules, emitted as a camera-first Frame Description.
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
/// What this does not draw is named in `gaps`: the
/// horizon line, the complete sky Body inventory, and any text token whose live string
/// the slice does not bind.

export type Vec3 = readonly [number, number, number];

export interface DionResidentPose {
  readonly position: Vec3;
  readonly yaw: number;
}

export interface DionDoorState {
  readonly latch?: 'shut' | 'moving' | 'open';
  /// 0 shut … 142 fully open; the leaves stop eight units inside their outer edges.
  readonly openUnits: number;
}

export interface DionFrameState {
  readonly articulationAngle?: number;
  readonly beaconGates?: ReadonlyMap<number, boolean>;
  readonly cameraAngles?: {
    readonly pitch: number;
    readonly roll: number;
    readonly yaw: number;
  };
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
  readonly pilotHead?: number;
  /// The player's pitch and roll (`$7154`, `$7152`), which view-fixed models turn by.
  readonly pitch: number;
  /// The region of the occupied structure the player stands in, from 1.
  readonly region: number;
  readonly residents: ReadonlyMap<number, DionResidentPose>;
  readonly roll: number;
  /// The character the animated sign buffer `$B3F2` holds.
  readonly signCode: number;
  readonly skyView?: TourcraftSkyView;
  readonly tokens?: ReadonlyMap<number, readonly number[]>;
}

export interface DionFrameStats {
  readonly gaps: readonly string[];
  readonly lines: number;
  readonly models: readonly number[];
  readonly polygons: number;
}

export interface DionCandidate {
  readonly distance: number;
  readonly exponent: number;
  readonly slot: number;
}

export interface DionFrame {
  readonly candidate: DionCandidate | null;
  readonly description: FrameDescription;
  /// Compatibility access; rasterize only when an indexed consumer asks for it.
  readonly frame: IndexedFrame;
  readonly horizonRow: number;
  readonly land: number;
  /// Sixteen ST colour words for rows above the horizon, and the land word the
  /// raster split puts into colour 8 below it.
  readonly palette: readonly number[];
  readonly stats: DionFrameStats;
}

export interface DionCoastIsland extends CoastIsland {
  readonly id: string;
  readonly landColour: number;
}
export type DionFrameWorld = Omit<DionWorld, 'source' | 'opening' | 'roads'> & {
  readonly coast?: CoastSurface<DionCoastIsland>;
  readonly floorOffset?: number;
  readonly opening: Pick<
    DionWorld['opening'],
    | 'cell'
    | 'eye'
    | 'frameCounter'
    | 'groupOrigin'
    | 'heading'
    | 'pitch'
    | 'region'
    | 'roll'
  >;
  readonly roads?: DionWorld['roads'] | undefined;
  readonly tourcraft?: Pick<TourcraftContent, 'arithmetic' | 'system'> & {
    readonly beaconGates: ReadonlyMap<number, boolean>;
    readonly beacons: ReadonlyMap<
      number,
      {
        readonly dark: DionModel;
        readonly gate: number | undefined;
        readonly lit: DionModel;
      }
    >;
    readonly tail: {
      readonly colour: number;
      readonly faces: readonly (readonly number[])[];
      readonly vertices: readonly (readonly number[])[];
    };
  };
};

const FREE = 0x80_00;
const FIRST_ATTACHMENT_SLOT = 0x2_54;
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
  candidate: DionCandidate | null;
  readonly gaps: Set<string>;
  /// `$B300`: the two characters the last `$8008` header wrote, which token `$8B` reads.
  labelCode: number | null;
  lines: number;
  readonly models: number[];
  readonly palette: FramePalette;
  polygons: number;
  readonly scene: readonly number[];
  /// `$B2DE`: the slot digit written by the selected `$8002` header.
  slotDigit: number | null;
}

/// `$5513C..$55170` and the fill's colour read: a word with bit 15 clear is a literal
/// ST colour; `$80nn` names frame entry nn; `$80nn` with bit 7 set reads the live scene
/// palette half, whose entry is resolved again.
const resolveColour = (paint: Paint, word: number): number => {
  let value = word;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!(value & 0x80_00)) {
      return paint.palette.literal(value);
    }
    if (!(value & 0x80)) {
      return value & 0x0f;
    }
    const entry = paint.scene[(value & 0x7e) >> 1];
    if (entry === undefined) {
      paint.gaps.add(
        `scene palette entry ${(value & 0x7e) >> 1} is not exported`
      );
      return 0;
    }
    value = entry;
  }
  return 0;
};

/// Q15 integer rotation as the model reader does it: the high word of each product
/// sum, doubled, kept to sixteen bits.
const q15 = (sum: number): number => {
  const high = Math.floor(sum / 65_536);
  return ((((high * 2) & 0xff_ff) ^ 0x80_00) - 0x80_00) | 0;
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

/// One primitive a drawing routine emits, in world space with its colour word unresolved: what
/// the Enhanced scene builds its meshes from (#806).
export interface DionCaptured {
  readonly colour: number;
  /// Whether the routine asked for back faces culled; the ground record is drawn without.
  readonly cull: boolean;
  readonly kind: 'line' | 'polygon';
  readonly points: readonly Vec3[];
}

interface View {
  readonly camera: LevelCamera;
  /// Set, the drawing routines record their primitives here and project nothing.
  readonly capture?: DionCaptured[];
  /// Capturing a form for the shared chooser: the face list to draw, an alternative's index
  /// or the default list, in place of the one the eye's box selects (`$54952`).
  readonly faceList?: number | 'default';
  readonly paint: Paint;
  readonly primitives: OrderedPrimitive[];
  source: string;
  readonly state: DionFrameState;
  readonly world: DionFrameWorld;
}

const withSource = (view: View, source: string, draw: () => void): void => {
  const previous = view.source;
  view.source = source;
  try {
    draw();
  } finally {
    view.source = previous;
  }
};

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
  if (view.capture !== undefined) {
    view.capture.push({ colour, cull, kind: 'polygon', points });
    return;
  }
  const geometry = points.map(point => camera(view, point));
  const outline = screenPolygon(geometry, cull, DION_PROJECTION);
  if (outline === null) {
    return;
  }
  view.primitives.push({
    camera: geometry,
    colour: { index: resolveColour(view.paint, colour) },
    kind: 'polygon',
    order: view.primitives.length,
    screen: outline,
    source: view.source
  });
  view.paint.polygons += 1;
};

const stroke = (
  view: View,
  a: Vec3,
  b: Vec3,
  colour: number,
  displayPixelWidth?: number
): void => {
  if (view.capture !== undefined) {
    view.capture.push({ colour, cull: false, kind: 'line', points: [a, b] });
    return;
  }
  const geometry = [camera(view, a), camera(view, b)] as const;
  const segment = screenLine(geometry[0], geometry[1], DION_PROJECTION);
  if (segment === null) {
    return;
  }
  view.primitives.push({
    camera: geometry,
    colour: { index: resolveColour(view.paint, colour) },
    ...(displayPixelWidth === undefined ? {} : { displayPixelWidth }),
    kind: 'line',
    order: view.primitives.length,
    screen: segment,
    source: view.source
  });
  view.paint.lines += 1;
};

// ---- Cells and the bound structure ------------------------------------------------

interface Bound {
  readonly cell: DionCell;
  readonly detail: DionDetail;
  readonly floorOffset: number;
  readonly origin: Vec3;
  readonly plan: readonly (readonly [number, number])[];
  readonly structure: DionStructure;
  readonly walls: readonly {
    readonly colour: number;
    readonly refs: readonly number[];
  }[];
}

const cellBase = (world: DionFrameWorld, cell: DionCell): [number, number] => [
  (world.opening.groupOrigin[0] + cell.x) * 0x1_00_00,
  (world.opening.groupOrigin[1] + cell.z) * 0x1_00_00
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
          [x0, z0],
          [x0, z1],
          [mid - open, z1],
          [mid - open, z0],
          [mid + open, z0],
          [mid + open, z1],
          [x1, z1],
          [x1, z0]
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
        [x0, z0],
        [x1, z0],
        [x1, mid - open],
        [x0, mid - open],
        [x0, mid + open],
        [x1, mid + open],
        [x1, z1],
        [x0, z1]
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
      ? [
          [x0, z0],
          [x0, z1],
          [x1, z1],
          [x1, z0]
        ]
      : [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1]
        ];
  const edge = door.control & 0x01_00 ? [n, n + 1] : [n + 2, n + 3];
  return {
    vertices,
    walls: [
      { colour: c0, refs: [n + 3, n] },
      { colour: c1, refs: edge },
      { colour: c2, refs: [n + 1, n + 2] }
    ]
  };
};

const bind = (world: DionFrameWorld, state: DionFrameState): Bound | null => {
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
  const walls: { colour: number; refs: readonly number[] }[] =
    structure.walls.map(wall => ({ colour: wall.colour, refs: wall.refs }));
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
    floorOffset: world.floorOffset ?? 0,
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
): { black: boolean; code: number }[] => {
  const result: { black: boolean; code: number }[] = [];
  for (const code of text) {
    if (!(code & 0x80)) {
      result.push({ black: false, code });
      continue;
    }
    const token = code & 0x7f;
    const characters = tokenString(view, bound, token);
    if (characters === null) {
      view.paint.gaps.add(
        `text token $${code.toString(16).toUpperCase()} is not bound`
      );
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
  if (token === 0x07 && view.paint.slotDigit !== null) {
    return [view.paint.slotDigit];
  }
  const live = view.state.tokens?.get(token | 0x80);
  if (live !== undefined) {
    return [...live];
  }
  const { lettering } = view.world;
  if (token === 0x0b) {
    const code = view.paint.labelCode;
    return code === null
      ? lettering.tokens?.get(0x8b)
        ? [...lettering.tokens.get(0x8b)!]
        : null
      : [code >> 8, code & 0xff];
  }
  if (token === 0x09 || token === 0x1d) {
    // `$5600C..$560B0`: cells keyed from $A0 bind a set; others draw blanks.
    const set = bound?.cell.tokenSet ?? null;
    const target =
      set === null
        ? token === 0x09
          ? 0xb3_80
          : 0xb3_38
        : (token === 0x09 ? lettering.bindings89 : lettering.bindings9D)[set];
    if (target === 0xb3_80 || target === 0xb3_38) {
      return [SPACE];
    }
    if (target === 0xb3_f2) {
      return [view.state.signCode];
    }
    const resolved = lettering.tokens?.get(token | 0x80);
    return resolved ? [...resolved] : null;
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
  const resolved = lettering.tokens?.get(token | 0x80);
  return resolved ? [...resolved] : null;
};

const doorKeyLetter = (door: DionAttachment, cell: DionCell): number => {
  const low = door.key ?? 0;
  if (low === 0) {
    return SPACE;
  }
  // Signed byte compare at $5AF10: $F0..$FF and $10..$7F add the cell's key base.
  const signed = low >= 0x80 ? low - 0x1_00 : low;
  const key =
    signed >= -16
      ? cell.keyBase === 0
        ? 0
        : cell.keyBase + (low & 0x0f)
      : low;
  return key === 0 ? SPACE : (key + 0x23) & 0xff;
};

const glyphOf = (
  world: DionFrameWorld,
  font: number,
  code: number
): DionGlyph | undefined =>
  world.glyphs.get(
    `${font}:${code.toString(16).toUpperCase().padStart(2, '0')}`
  );

/// `$550F2..$552DE`: glyph points, scaled and placed in the record's plane, one
/// character at a time along the advance.
const drawText = (
  view: View,
  bound: Bound | null,
  placement: TextPlacement
): void => {
  const font = placement.flags & 0x0f;
  const [gx, gy] = placement.glyphScale;
  const characters = resolveTokens(view, bound, placement.text);
  const y = placement.origin[1];
  let [x, , z] = placement.origin;
  for (const { black, code } of characters) {
    const glyph = glyphOf(view.world, font, code);
    if (glyph === undefined) {
      view.paint.gaps.add(
        `font ${font} glyph $${code.toString(16)} is not exported`
      );
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
        const colour = black ? 0x80_00 : (primitive.colour ?? placement.colour);
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

const selectCandidate = (
  view: View,
  slot: number,
  pose: DionResidentPose
): void => {
  if (slot === 0 || slot === 74) {
    return;
  }
  const distance = Math.hypot(
    ...pose.position.map((v, axis) => v - view.camera.eye[axis]!)
  );
  if (
    view.paint.candidate === null ||
    distance <= view.paint.candidate.distance
  ) {
    view.paint.candidate = {
      distance,
      exponent: distance < 1 ? 0 : Math.floor(Math.log2(distance)),
      slot
    };
  }
};

const residentPose = (view: View, resident: DionResident): DionResidentPose =>
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
): void =>
  withSource(view, `resident:${slot}`, () => {
    selectCandidate(view, slot, pose);
    const beacon = view.world.tourcraft?.beacons.get(slot);
    if (beacon) {
      const enabled =
        beacon.gate === undefined ||
        (view.state.beaconGates ?? view.world.tourcraft!.beaconGates).get(
          beacon.gate
        ) === true;
      model =
        enabled &&
        ((view.state.frameCounter + (view.world.blinkPhase.get(slot) ?? 0)) &
          4) ===
          0
          ? beacon.lit
          : beacon.dark;
    }
    const header = model.header;
    const op = header?.op;
    if (op === 0x0 || op === 0x6) {
      return;
    }
    if (op === 0x8 && header?.code !== undefined) {
      view.paint.labelCode = header.code;
    }
    if (view.world.tourcraft && op === 0x2) {
      view.paint.slotDigit = 48 + (slot & 15);
    }
    const { mode, passenger } = modelMode(view.state, slot, model);
    const yaw =
      header !== undefined && (op === 0x1 || op === 0xd)
        ? (pose.yaw + (header.yawOffset ?? 0)) & 0xff
        : 0;
    const form: DionModelForm = passenger ? model.passenger! : model;
    const rel: Vec3 = passenger
      ? [0, -63, 0]
      : [
          pose.position[0] - view.camera.eye[0],
          pose.position[1] - view.camera.eye[1],
          pose.position[2] - view.camera.eye[2]
        ];
    // `$5532E`: a model further than its range on any axis is not drawn.
    const range = op === 0xc ? (header?.range ?? 1) : 1;
    // The Enhanced scene draws objects from anywhere, as the Damocles port does.
    if (
      view.capture === undefined &&
      !passenger &&
      rel.some(value => Math.abs(value) > range * 0x1_00_00)
    ) {
      // `$545AE`: the promoted locator's far branch keeps one lit colour-3
      // point, while its dark phase draws nothing.
      if (beacon && model === beacon.lit) {
        const at = toCamera(view.camera, ...rel);
        if (at.d >= DION_PROJECTION.near) {
          view.primitives.push({
            colour: {
              index: view.paint.palette.literal(view.world.modelColours[3]!)
            },
            kind: 'point',
            order: view.primitives.length,
            screen: project(at),
            source: view.source
          });
          view.paint.models.push(slot);
        }
      }
      return;
    }
    view.paint.models.push(slot);
    const turn: ModelTurn = {
      axis: header?.yawOffset ?? 0,
      mode,
      pivot: header?.pivot,
      yaw
    };
    drawForm(view, bound, form, rel, turn, colourPatches(view, slot, model));
    if (passenger) {
      // The driver's head follows from `$6ECE`, the next entry in profile.
      const head = view.world.models.get(
        (view.state.pilotHead ?? 263) + (view.state.driverProfile ? 1 : 0)
      );
      if (head !== undefined) {
        drawForm(view, bound, head, rel, turn, new Map());
      }
    }
  });

/// `$543AA` and `$54444`: how a resident's model is turned, and whether it is the passenger
/// form, ×16 at (0, −63, 0) from the eye; slots 12..15 view-fixed, the others turned with the
/// service resident.
const modelMode = (
  state: DionFrameState,
  slot: number,
  model: DionModel
): { readonly mode: number; readonly passenger: boolean } => {
  const header = model.header;
  const op = header?.op;
  if (header === undefined || (op !== 0x1 && op !== 0xd)) {
    return { mode: 0, passenger: false };
  }
  let mode = header.mode ?? 0;
  if (op === 0x1 && slot === 10) {
    mode = 1;
  }
  if (op === 0xd && state.passenger === slot && model.passenger) {
    return {
      mode: (slot >= 12 && slot < 16 ? 1 : mode) | 0x20,
      passenger: true
    };
  }
  return { mode, passenger: false };
};

interface ModelTurn {
  readonly axis?: number;
  /// `$543AA`: 0 none; bit 7 articulated; bit 6 yaw; otherwise view-fixed; bit 5 ×16.
  readonly mode: number;
  readonly pivot?: Vec3 | undefined;
  /// `$543A0`: the resident's yaw byte plus the header's offset, 256 steps a turn.
  readonly yaw: number;
}

/// `$543DE..$5442A` and `$543B4`: header patches to colour bytes, by address. The
/// `$8003` beacon writes its value into one face, then index 3 (lit) or 1 (dark) into
/// its lamps by the frame counter plus the slot's phase word.
const colourPatches = (
  view: View,
  slot: number,
  model: DionModel
): ReadonlyMap<number, number> => {
  const header = model.header;
  const patches = new Map<number, number>();
  if (header?.op === 0xa && header.target !== undefined) {
    patches.set(header.target, header.value ?? 0);
  }
  if (header?.op !== 0x3) {
    return patches;
  }
  const value = header.value ?? 0;
  if (header.firstTarget !== undefined) {
    patches.set(header.firstTarget, value);
  }
  if (value === 4 || value === 5) {
    // These beacons blink only while an object's state bit is set (`$64BE`, `$64C2`).
    view.paint.gaps.add(
      `beacon value ${value} reads an object state the slice does not track`
    );
  }
  const phase = view.world.blinkPhase.get(slot) ?? 0;
  const lamp = ((view.state.frameCounter + phase) & 4) === 0 ? 3 : 1;
  for (const target of header.targets ?? []) {
    patches.set(target, lamp);
  }
  return patches;
};

/// A 1024-step angle word as the 256-step table index `$54758` forms from it.
const stepOf = (angle: number): number => (angle >> 2) & 0xff;

/// `$5470A..$5491C`: a vertex in the model's turn, exact Q15 integer arithmetic.
const turnVertex = (
  view: View,
  turn: ModelTurn,
  local: readonly [number, number, number]
): [number, number, number] => {
  const table = view.world.rotationTable;
  let [x, y, z] = local;
  const { mode } = turn;
  if (mode === 0) {
    return [x, y, z];
  }
  if (mode & 0x80) {
    // Articulated: a tagged vertex (negative Y) holds ~Y and turns by an angle the
    // slice's models never set, so it is drawn at its rest pose.
    if (y < 0) {
      y = ~y;
      const angle = view.state.articulationAngle;
      if (angle === undefined) {
        view.paint.gaps.add(
          'an articulated model turns by an angle the slice does not track'
        );
      } else {
        const [px, py, pz] = turn.pivot ?? [0, 0, 0];
        x -= px;
        y -= py;
        z -= pz;
        const step = stepOf(angle);
        if ((turn.axis ?? 0) < 0) {
          [z, y] = rotate(table, step, z, y);
        } else if ((turn.axis ?? 0) > 0) {
          [x, y] = rotate(table, step, x, y);
        } else {
          [x, z] = rotate(table, step, x, z);
        }
        x += px;
        y += py;
        z += pz;
      }
    }
    return [x, y, z];
  }
  if (mode & 0x20) {
    x <<= 4;
    y <<= 4;
    z <<= 4;
  }
  if (mode & 0x40) {
    [x, z] = rotate(table, turn.yaw, x, z);
    return [x, y, z];
  }
  // View-fixed: roll `$7152`, then pitch `$7154` + `$200`, then heading `$7156` + `$200`.
  const roll = stepOf(view.state.roll);
  const pitch = stepOf(view.state.pitch + 0x2_00);
  const heading = stepOf(view.state.heading + 0x2_00);
  if (roll !== 0) {
    [x, y] = rotate(table, roll, x, y);
  }
  if (pitch !== 0) {
    [z, y] = rotate(table, pitch, z, y);
  }
  if (heading !== 0) {
    [x, z] = rotate(table, heading, x, z);
  }
  return [x, y, z];
};

/// `$55058..$550B0`: a model's inline text turns with a yawed model in quarter turns.
const turnText = (
  turn: ModelTurn,
  face: Extract<DionModelFace, { kind: 'text' }>
): {
  advance: number;
  flags: number;
  glyphX: number;
  offset: readonly [number, number, number];
} => {
  const y = face.offset[1];
  let [x, , z] = face.offset;
  let flags = face.flags;
  let advance = face.advance;
  let glyphX = face.glyphScale[0];
  if ((turn.mode & 0xc0) === 0x40 && turn.yaw !== 0) {
    if (turn.yaw & 0x80) {
      [x, z, advance, glyphX] = [-x, -z, -advance, -glyphX];
    }
    if (turn.yaw & 0x40) {
      [x, z] = [z, -x];
      flags ^= 0x80;
      [advance, glyphX] = [-advance, -glyphX];
    }
  }
  return { advance, flags, glyphX, offset: [x, y, z] };
};

const drawForm = (
  view: View,
  bound: Bound | null,
  form: DionModelForm,
  rel: Vec3,
  turn: ModelTurn,
  patches: ReadonlyMap<number, number>
): void => {
  const eye = view.camera.eye;
  const place = (local: readonly [number, number, number]): Vec3 => {
    const [x, y, z] = turnVertex(view, turn, local);
    return [eye[0] + rel[0] + x, eye[1] + rel[1] + y, eye[2] + rel[2] + z];
  };
  const points = form.vertices.map(place);
  // `$54952`: the first alternative whose box holds the model's origin seen from the
  // eye, else the default list.
  let faces: readonly DionModelFace[] =
    typeof view.faceList === 'number'
      ? (form.alternatives[view.faceList]?.faces ?? form.faces)
      : form.faces;
  for (const alternative of view.faceList === undefined
    ? form.alternatives
    : []) {
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
      const turned = turnText(turn, face);
      drawText(view, bound, {
        advance: turned.advance,
        colour: face.colour,
        flags: turned.flags,
        glyphScale: [turned.glyphX, face.glyphScale[1]],
        origin: [
          eye[0] + rel[0] + turned.offset[0],
          eye[1] + rel[1] + turned.offset[1],
          eye[2] + rel[2] + turned.offset[2]
        ],
        text: face.text
      });
      continue;
    }
    const colour = colours[patches.get(face.at) ?? face.colour] ?? 0;
    const vertices = face.refs.map(ref => points[(ref >> 2) - 1]!);
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
export const zoneOf = (
  bound: Pick<Bound, 'cell' | 'detail'>,
  x: number,
  z: number
): number => {
  const extent = bound.detail.extent;
  if (extent === null || extent.y < 0) {
    return 0;
  }
  const [sx, sz] = bound.cell.scale;
  let [x0, x1] = [
    extent.x[0] * sx + bound.cell.origin[0],
    extent.x[1] * sx + bound.cell.origin[0]
  ];
  let [z0, z1] = [
    extent.z[0] * sz + bound.cell.origin[1],
    extent.z[1] * sz + bound.cell.origin[1]
  ];
  if (sx < 0) {
    [x0, x1] = [x1, x0];
  }
  if (sz < 0) {
    [z0, z1] = [z1, z0];
  }
  const lx = x & 0xff_ff;
  const lz = z & 0xff_ff;
  let zone = 0;
  if (lx >= (x0 & 0xff_ff)) {
    zone += lx <= (x1 & 0xff_ff) ? 1 : 2;
  }
  if (lz >= (z0 & 0xff_ff)) {
    zone += lz <= (z1 & 0xff_ff) ? 3 : 6;
  }
  return zone;
};

interface Placed {
  readonly cellNumber: number;
  readonly model: DionModel | undefined;
  readonly pose: DionResidentPose;
  readonly slot: number;
}

/// `$54178`: the residents a frame can draw. The cell's template slots come first, in
/// slot order from `255 − (count − 1)` to 255, then the fixed list at `$7422`, whose
/// slot 0 is the structure.
const drawable = (view: View, bound: Bound | null): Placed[] => {
  const placed: Placed[] = [];
  if (bound !== null) {
    const ground = view.world.grounds.get(bound.cell.ground.address);
    const templates =
      ground?.primitives.flatMap(item =>
        item.kind === 'template' ? [item] : []
      ) ?? [];
    const [bx, bz] = cellBase(view.world, bound.cell);
    const top = view.world.drawList.templateTop;
    // Template i binds slot 255 − i, so slot order runs the templates backwards.
    for (let index = templates.length - 1; index >= 0; index -= 1) {
      const template = templates[index]!;
      const [x, z] = transformGround(
        bound.cell.ground.transform,
        template.x,
        template.z
      );
      placed.push({
        cellNumber: bound.cell.cell,
        model: view.world.models.get(template.model),
        pose: { position: [bx + (x & 0xff_ff), 0, bz + (z & 0xff_ff)], yaw: 0 },
        slot: top - index
      });
    }
  }
  for (const slot of view.world.drawList.fixed) {
    if (slot === 0) {
      if (bound !== null) {
        placed.push({
          cellNumber: bound.cell.cell,
          model: undefined,
          pose: { position: bound.origin, yaw: 0 },
          slot: 0
        });
      }
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

const cellNumberOf = (world: DionFrameWorld, position: Vec3): number => {
  const x = Math.floor(position[0] / 0x1_00_00) - world.opening.groupOrigin[0];
  const z = Math.floor(position[2] / 0x1_00_00) - world.opening.groupOrigin[1];
  return x >= 0 && x < 16 && z >= 0 && z < 16 ? z * 16 + x : -1;
};

/// `$56220..$5623C`: bit 2 swaps the axes, bit 0 negates X, bit 1 negates Z.
const transformGround = (
  transform: number,
  x: number,
  z: number
): [number, number] => {
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
const drawKey = (
  view: View,
  bound: Bound | null,
  item: Placed,
  playerZone: number
): number => {
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
  const exponent =
    distance <= 0 ? 0 : Math.floor(Math.log2(Math.max(1, distance)));
  return (
    priority * 0x1_00_00_00 +
    (exponent + far) * 0x1_00_00 +
    Math.min(0xff_ff, (distance / 2 ** exponent) * 0xff_ff)
  );
};

// ---- Plan, detail and the structure dispatch -------------------------------------------------

const planPoint = (bound: Bound, ref: number, y: number): Vec3 => {
  const [x, z] = bound.plan[ref - 1]!;
  return [bound.origin[0] + x, bound.floorOffset + y, bound.origin[2] + z];
};

/// `$5C0CC`: one plan wall by the form its colour carries (bits 12..14).
const drawWall = (view: View, bound: Bound, slot: number): void =>
  withSource(view, `structure:${bound.cell.structure}:wall:${slot}`, () => {
    const wall = bound.walls[(slot >> 2) - 1];
    if (wall === undefined) {
      view.paint.gaps.add(`plan wall slot $${slot.toString(16)} is unknown`);
      return;
    }
    const form = (wall.colour >> 12) & 7;
    const colour = wall.colour & 0x8f_ff;
    const [height, lower] = bound.structure.heights;
    const third = 48;
    const [a, b] = wall.refs as [number, number];
    if (form <= 2 || form === 7) {
      const top =
        form === 0 ? height : form === 1 ? lower : form === 2 ? third : height;
      const bottom = form === 7 ? lower : 0;
      fill(
        view,
        [
          planPoint(bound, a, bottom),
          planPoint(bound, b, bottom),
          planPoint(bound, b, top),
          planPoint(bound, a, top)
        ],
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
  });

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
  const local = [
    view.camera.eye[0] - bound.origin[0],
    view.camera.eye[2] - bound.origin[2]
  ];
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
  | { readonly index: number; readonly kind: 'text' };

const regionQueue = (
  view: View,
  bound: Bound,
  region: number
): QueueEntry[] => {
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
    const entry = structure.associations.find(
      item => item.id === resident.association
    );
    if (entry === undefined) {
      continue;
    }
    for (const [r, wall] of [
      [resident.association, 0] as const,
      ...entry.hooks
    ]) {
      if (r === region) {
        occupants.push({ slot, wall });
      }
    }
  }
  const lowest = FIRST_ATTACHMENT_SLOT - 4 * (structure.attachments.length - 1);
  const queue: QueueEntry[] = [];
  const bytes = [...(structure.regions[region - 1]?.queue ?? []), 0];
  for (const byte of bytes) {
    const hooked = occupants
      .filter(item => item.wall === byte)
      .map(item => item.slot);
    if (hooked.length > 0) {
      const last = queue.at(-1);
      if (last?.kind === 'hook') {
        queue[queue.length - 1] = {
          kind: 'hook',
          slots: [...last.slots, ...hooked]
        };
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
    if (resident === undefined) {
      continue;
    }
    items.push({
      cellNumber: resident.cell,
      model:
        resident.model === null
          ? undefined
          : view.world.models.get(resident.model),
      pose: residentPose(view, resident),
      slot
    });
  }
  const keyed = items.map(item => ({
    item,
    key: drawKey(view, bound, item, playerZone)
  }));
  keyed.sort((a, b) => b.key - a.key);
  for (const { item } of keyed) {
    selectCandidate(view, item.slot, item.pose);
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
  let offset =
    text.offset & 1 ? half * Math.abs(text.plane & 0x80 ? sz : sx) : half;
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
    origin: [
      bound.origin[0] + x,
      bound.floorOffset + text.anchor[1],
      bound.origin[2] + z
    ],
    text: text.text
  });
};

/// `$54C76..$54D14`: a selection box's bounds scaled with the structure, the `$8000` and
/// `$7FFF` sentinels standing for no bound, and a negative scale swapping the pair.
const detailSpan = (
  pair: readonly [number, number],
  factor: number
): [number, number] => {
  const lo = pair[0] === -0x80_00 ? -Infinity : pair[0] * factor;
  const hi = pair[1] === 0x7f_ff ? Infinity : pair[1] * factor;
  return factor < 0
    ? [hi === Infinity ? -Infinity : hi, lo === -Infinity ? Infinity : lo]
    : [lo, hi];
};

/// `$54D24` with `$54A3E`: the second group's first box holding the viewer, else
/// its default list, drawn record by record.
const drawDetail = (view: View, bound: Bound): void =>
  withSource(
    view,
    `cell:${bound.cell.cell}:detail:${bound.cell.detail}`,
    () => {
      const detail = bound.detail;
      if (detail.vertices.length === 0) {
        return;
      }
      const regionFlags =
        bound.structure.regions[view.state.region - 1]?.flags ?? 0;
      if (!(regionFlags & 0x80_00)) {
        return;
      }
      const group = detail.groups[1];
      if (group === undefined) {
        return;
      }
      const [sx, sz] = bound.cell.scale;
      const eye = view.camera.eye;
      const viewer = [
        eye[0] - bound.origin[0],
        // $54D62 uses absolute world height, independent of the lift's wall camera.
        eye[1],
        eye[2] - bound.origin[2]
      ];
      let records = group.default;
      for (const box of group.boxes) {
        const [x0, x1] = detailSpan(box.x, sx);
        const [y0, y1] = detailSpan(box.y, 1);
        const [z0, z1] = detailSpan(box.z, sz);
        if (
          viewer[0]! > x0 &&
          viewer[0]! <= x1 &&
          viewer[1]! > y0 &&
          viewer[1]! <= y1 &&
          viewer[2]! > z0 &&
          viewer[2]! <= z1
        ) {
          records = box.records;
          break;
        }
      }
      for (const record of records) {
        drawDetailRecord(view, bound, record);
      }
    }
  );

const detailPoints = new WeakMap<Bound, Vec3[]>();

/// One building-detail record: a polygon, a line or a `$6000` text, scaled with the structure.
/// A mirroring scale turns every polygon's winding over.
const drawDetailRecord = (view: View, bound: Bound, record: number): void => {
  const detail = bound.detail;
  const [sx, sz] = bound.cell.scale;
  const mirrored = sx * sz < 0;
  let points = detailPoints.get(bound);
  if (points === undefined) {
    points = detail.vertices.map(([x, y, z]): Vec3 => [
      bound.origin[0] + x * sx,
      y < 0 ? ~y : y,
      bound.origin[2] + z * sz
    ]);
    detailPoints.set(bound, points);
  }
  const primitive = detail.primitives[record - 1];
  if (primitive === undefined) {
    view.paint.gaps.add(`detail ${detail.index} record ${record} is missing`);
    return;
  }
  if (primitive.kind === 'text') {
    drawDetailText(view, bound, primitive);
    return;
  }
  const refs =
    mirrored && primitive.kind === 'polygon'
      ? [...primitive.refs].reverse()
      : primitive.refs;
  const vertices = refs.map(ref => points[(ref >> 2) - 1]!);
  if (primitive.kind === 'line') {
    stroke(view, vertices[0]!, vertices[1]!, primitive.colour & ~0x40_00);
  } else {
    fill(view, vertices, primitive.colour, true);
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
  if (!(flags & 0x40_00)) {
    drawDetail(view, bound);
    rest();
    drawPlan(view, bound, playerZone);
    return;
  }
  if (flags & 0x10_00) {
    drawDetail(view, bound);
    drawPlan(view, bound, playerZone);
  } else {
    drawPlan(view, bound, playerZone);
    drawDetail(view, bound);
  }
  rest();
};

// ---- The ground pass --------------------------------------------------------------------

const signedByte = (v: number): number => (v >= 128 ? v - 256 : v);

/// `$576A2..$57726`: the cell's ground record, drawn with culling off.
const drawGround = (view: View, bound: Bound): void =>
  withSource(
    view,
    `cell:${bound.cell.cell}:ground:${bound.cell.ground.address}`,
    () => {
      const ground = view.world.grounds.get(bound.cell.ground.address);
      if (ground === undefined) {
        return;
      }
      const [bx, bz] = cellBase(view.world, bound.cell);
      const transform = bound.cell.ground.transform;
      const mirrored = (bound.cell.ground.index & 4) !== 0;
      const points = ground.vertices.map(([x, z]): Vec3 => {
        const [a, b] = transformGround(transform, x, z);
        return [bx + (a & 0xff_ff), 0, bz + (b & 0xff_ff)];
      });
      // `$55DA4`: slots `$F0..$FC` stand at the centres of the cells the road runs to.
      const vertex = (ref: number): Vec3 | undefined => {
        const road = bound.cell.roadPoints.get(ref);
        if (ref >= 0xf0 && road !== undefined) {
          const [gx, gz] = view.world.opening.groupOrigin;
          return [
            (gx + (road & 15)) * 0x1_00_00 + 0x80_00,
            0,
            (gz + (road >> 4)) * 0x1_00_00 + 0x80_00
          ];
        }
        return points[(ref >> 2) - 1];
      };
      for (const primitive of ground.primitives) {
        if (primitive.kind === 'template') {
          continue;
        }
        if (primitive.kind === 'text') {
          const bytes = primitive.header;
          const word = (offset: number): number =>
            (bytes[offset]! << 8) | bytes[offset + 1]!;
          const signed = (v: number): number => (v & 0x80_00 ? v - 65_536 : v);
          drawText(view, bound, {
            advance: signed(word(8)),
            colour: word(12),
            flags: word(6),
            glyphScale: [signedByte(bytes[10]!), signedByte(bytes[11]!)],
            origin: [bx + word(0), signed(word(2)), bz + word(4)],
            text: primitive.text
          });
          continue;
        }
        const refs =
          mirrored && primitive.kind === 'polygon'
            ? [...primitive.refs].reverse()
            : primitive.refs;
        const resolved = refs.map(vertex);
        if (resolved.some(v => v === undefined)) {
          view.paint.gaps.add(
            'ground reference requires a recovered road join binding'
          );
          continue;
        }
        const vertices = resolved as Vec3[];
        if (primitive.kind === 'line') {
          stroke(view, vertices[0]!, vertices[1]!, primitive.colour & ~0x40_00);
        } else {
          fill(view, vertices, primitive.colour, false);
        }
      }
    }
  );

// Same recovered coast/horizon routines as Damocles; only records and palette admission are Dion's.
const drawRoads = (view: View, bound: Bound | null): void => {
  const roads = view.world.roads;
  const flags = bound?.structure.regions[view.state.region - 1]?.flags;
  if (
    roads === undefined ||
    (flags !== undefined && !(flags & 0x80_00) && view.state.passenger === null)
  ) {
    return;
  }
  const [gx, gz] = view.world.opening.groupOrigin;
  const [x, y, z] = view.state.eye;
  const edges = roadEdges(
    roads.corners,
    Math.floor(x / 65_536) - gx,
    Math.floor(z / 65_536) - gz,
    y
  );
  const point = (corner: number): Vec3 => [
    (gx + (corner & 15) + 0.5) * 65_536,
    roads.height,
    (gz + (corner >> 4) + 0.5) * 65_536
  ];
  withSource(view, 'roads', () => {
    for (const edge of edges) {
      stroke(view, point(edge >> 8), point(edge & 0xff), 0x80_0e, 1);
    }
  });
};

const drawCoast = (view: View): number => {
  const surface = view.world.coast!;
  const [x, y, z] = view.state.eye;
  const eye = { x, y, z };
  const here = classifyPosition(surface, eye);
  const underfoot =
    here.kind === 'core' && y < 65_536 ? here.island : undefined;
  const base = underfoot?.landColour ?? view.world.framePalette.land;
  const depth = 1_000_000_000;
  const emit = (values: readonly number[], word: number, source: string) => {
    const index = view.paint.palette.literal(word);
    for (let i = 0; i < values.length; i += 30) {
      const geometry: CameraPoint[] = [0, 10, 20].map(offset => ({
        d: values[i + offset + 2]!,
        u: -values[i + offset]!,
        v: -values[i + offset + 1]!
      }));
      const screen = screenPolygon(geometry, false, DION_PROJECTION);
      if (screen) {
        view.primitives.push({
          camera: geometry,
          colour: { index },
          kind: 'polygon',
          order: view.primitives.length,
          screen,
          source
        });
      }
    }
  };
  const up = toCamera(view.camera, 0, 1, 0);
  emit(
    horizonFillVertices({ x: -up.u, y: -up.v, z: up.d }, depth, [0, 0, 0]),
    base,
    'horizon'
  );
  if (underfoot === undefined) {
    for (const island of surface.islands) {
      const triangles = islandFillTriangles(island, surface, 0, eye);
      emit(
        horizonIslandVertices(
          triangles,
          p => {
            const c = camera(view, [p.x, p.y, p.z]);
            return { x: -c.u, y: -c.v, z: c.d };
          },
          DION_PROJECTION.near,
          depth,
          [0, 0, 0]
        ),
        island.landColour,
        island.id
      );
    }
  }
  return base;
};

// ---- The frame ----------------------------------------------------------------------------

export const planDionFrame = (
  world: DionFrameWorld,
  state: DionFrameState
): DionFrame => {
  const space = state.skyView?.body === null;
  const bound = space ? null : bind(world, state);
  const template = [...world.framePalette.template];
  const sky = space
    ? world.tourcraft!.system.spacePalette.background
    : state.day
      ? world.framePalette.skyDay
      : world.framePalette.skyNight;
  template[8] = sky;
  template[14] = world.roads?.colour ?? world.framePalette.road;
  for (const [index, colour] of space
    ? world.tourcraft!.system.spacePalette.fixed
    : world.framePalette.fixed) {
    template[index] = colour;
  }
  const palette = new FramePalette(template);
  const sceneHalf =
    bound === null ? null : world.palettes.get(bound.cell.palette);
  const paint: Paint = {
    candidate: null,
    gaps: new Set(
      world.tourcraft ? [] : ['complete sky Body inventory waived by D1']
    ),
    labelCode: null,
    lines: 0,
    models: [],
    palette,
    polygons: 0,
    scene:
      sceneHalf === null || sceneHalf === undefined
        ? []
        : state.day
          ? sceneHalf.day
          : sceneHalf.night,
    slotDigit: null
  };
  const primitives: OrderedPrimitive[] = [];
  const view: View = {
    camera: state.cameraAngles
      ? generalCamera(
          state.eye,
          state.cameraAngles.roll,
          state.cameraAngles.pitch,
          state.cameraAngles.yaw
        )
      : levelCamera(state.eye, state.heading),
    paint,
    primitives,
    source: `cell:${state.cell}`,
    state,
    world
  };
  const stars =
    world.tourcraft && state.skyView
      ? tourcraftStars(world.sky, world.tourcraft.arithmetic, state.skyView)
      : state.day
        ? []
        : dionStars(world.sky, state.heading, state.pitch);
  {
    for (const [x, y, colour] of stars) {
      primitives.push({
        colour: { index: palette.literal(colour) },
        kind: 'point',
        order: primitives.length,
        screen: [x, y],
        source: 'stars'
      });
    }
  }
  if (world.tourcraft && state.skyView) {
    primitives.push(
      ...tourcraftSkyPrimitives(
        world.tourcraft.system,
        state.skyView,
        colour => ({ index: palette.literal(colour) }),
        world.tourcraft.tail
      ).map(p => ({ ...p, order: primitives.length + p.order }))
    );
  }
  let land = world.framePalette.land;
  if (!space && world.coast !== undefined) {
    land = drawCoast(view);
  }
  if (!space) {
    drawRoads(view, bound);
  }
  if (bound !== null) {
    drawGround(view, bound);
  } else if (!space) {
    paint.gaps.add(`cell ${state.cell} is outside the exported slice`);
  }
  const playerZone =
    bound === null ? 0 : zoneOf(bound, state.eye[0], state.eye[2]);
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
  const entries = palette.entries.map(entry => (entry & FREE ? 0 : entry));
  const upper = entries.map(stRgb);
  const lower = upper.slice();
  lower[8] = stRgb(land);
  const description: FrameDescription = {
    background: { index: 8 },
    paletteBands: space
      ? [{ colours: upper, fromRow: 0 }]
      : [
          { colours: upper, fromRow: 0 },
          { colours: lower, fromRow: world.framePalette.horizonRow }
        ],
    primitives,
    projection: DION_PROJECTION
  };
  let indexed: IndexedFrame | undefined;
  return {
    candidate: paint.candidate,
    description,
    get frame() {
      return (indexed ??= renderAuthentic(description));
    },
    horizonRow: world.framePalette.horizonRow,
    land,
    palette: entries,
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
  const gun = (shift: number): number =>
    Math.round((((word >> shift) & 7) * 255) / 7);
  return [gun(8), gun(4), gun(0)];
};

/// The indexed frame as RGBA, with the horizon split writing the land colour into
/// entry 8 from its row down.
export const frameRgba = (
  planned: DionFrame,
  target: Uint8ClampedArray
): void => {
  rgbaFromIndexed(planned.description, planned.frame, target);
};

export const openingFrameState = (world: DionFrameWorld): DionFrameState => ({
  cell: world.opening.cell,
  day: true,
  doors: new Map(),
  driverProfile: false,
  eye: world.opening.eye,
  frameCounter: world.opening.frameCounter,
  heading: world.opening.heading,
  passenger: null,
  pitch: world.opening.pitch,
  region: world.opening.region,
  residents: new Map(),
  roll: world.opening.roll,
  signCode: SPACE
});

export type { DionCell };

// ---- The parts the Enhanced scene places ---------------------------------------------------

/// A Dion frame's parts as the shared Enhanced planner takes them (#806), each captured from
/// this planner's own routines in world space. The planner decides nothing here about what is
/// drawn: the plan's every wall, each door with every face, every wall text, every detail
/// record and the cell's ground record, so that the shared planner's rules can choose.
export interface DionParts {
  readonly residents: readonly {
    /// The resident's forms for the shared chooser (#815): absent on a view-fixed model.
    readonly forms?: DionResidentForms;
    readonly position: Vec3;
    readonly primitives: readonly DionCaptured[];
    /// `$5532E` (#817): the range in cells past which the model is not drawn, and the colour
    /// word of the one point a promoted beacon is drawn as there while lit (`$545AE`).
    readonly reach?: { readonly cells: number; readonly point?: number };
    readonly slot: number;
    /// Drawn about the eye rather than in the world: the passenger's cab and the driver's
    /// head, or a model the view's own turn turns (`$5470A`'s view-fixed path).
    readonly viewFixed: boolean;
  }[];
  /// The scene palette half each colour word with bit 7 reads, by day and by night.
  readonly scene: {
    readonly day: readonly number[];
    readonly night: readonly number[];
  };
  readonly structure: {
    readonly cell: DionCell;
    readonly detail: DionDetail;
    readonly details: ReadonlyMap<number, readonly DionCaptured[]>;
    readonly doors: readonly {
      readonly door: DionAttachment;
      readonly primitives: readonly DionCaptured[];
    }[];
    readonly ground: readonly DionCaptured[];
    /// The structure's origin, the cell base plus its cell-local origin, at height 0.
    readonly origin: Vec3;
    readonly structure: DionStructure;
    readonly walls: ReadonlyMap<number, readonly DionCaptured[]>;
    readonly wallTexts: readonly {
      readonly face: number;
      readonly plane: number;
      readonly primitives: readonly DionCaptured[];
    }[];
  } | null;
}

/// What the shared chooser picks a Dion resident's form from (#815): its face lists' boxes
/// (object less eye, as `$54952` tests), whether it flashes and on what phase and gate, and
/// whether it is articulated. `formOf` captures one form in Dion's own routines, so a face
/// list, a lamp and an articulation angle in 1024ths are all drawn as Dion draws them.
export interface DionResidentForms {
  readonly alternatives: readonly { readonly max: Vec3; readonly min: Vec3 }[];
  readonly articulated: boolean;
  /// The form Dion's own rules draw this frame, which the shared chooser must match.
  readonly drawn: () => DionCaptured[];
  readonly flash?: { readonly gate: number | null; readonly phase: number };
  /// One form; an undefined angle draws an articulated model at rest, untouched.
  readonly formOf: (
    faceList: number | 'default',
    dark: boolean,
    articulationAngle: number | undefined
  ) => DionCaptured[];
}

export const captureDionParts = (
  world: DionFrameWorld,
  state: DionFrameState
): DionParts => {
  const space = state.skyView?.body === null;
  const bound = space ? null : bind(world, state);
  const sceneHalf =
    bound === null ? undefined : world.palettes.get(bound.cell.palette);
  const paint: Paint = {
    candidate: null,
    gaps: new Set(),
    labelCode: null,
    lines: 0,
    models: [],
    palette: new FramePalette(world.framePalette.template),
    polygons: 0,
    scene: [],
    slotDigit: null
  };
  const camera = state.cameraAngles
    ? generalCamera(
        state.eye,
        state.cameraAngles.roll,
        state.cameraAngles.pitch,
        state.cameraAngles.yaw
      )
    : levelCamera(state.eye, state.heading);
  const capturing = (
    draw: (view: View) => void,
    form: {
      readonly faceList?: number | 'default';
      readonly state?: DionFrameState;
    } = {}
  ): DionCaptured[] => {
    const capture: DionCaptured[] = [];
    draw({
      camera,
      capture,
      ...(form.faceList === undefined ? {} : { faceList: form.faceList }),
      paint,
      primitives: [],
      source: `cell:${state.cell}`,
      state: form.state ?? state,
      world
    });
    return capture;
  };
  let structure: DionParts['structure'] = null;
  if (bound !== null) {
    const walls = new Map<number, DionCaptured[]>();
    for (let wall = 1; wall <= bound.structure.walls.length; wall += 1) {
      walls.set(
        wall,
        capturing(view => drawWall(view, bound, wall * 4))
      );
    }
    const doors = bound.structure.attachments.map(door => {
      const first = door.firstWall * 4;
      const open = (state.doors.get(door.slot)?.openUnits ?? 0) > 0;
      const faces = door.twoLeaves
        ? [first, first + 8, first + 12, first + 20]
        : [first, first + 8];
      const edges = !open
        ? []
        : door.twoLeaves
          ? [first + 4, first + 16]
          : [first + 4];
      return {
        door,
        primitives: capturing(view => {
          for (const slot of [...edges, ...faces]) {
            drawWall(view, bound, slot);
          }
        })
      };
    });
    const wallTexts = bound.structure.wallTexts.map((text, index) => ({
      face: text.face,
      plane: text.plane,
      primitives: capturing(view => drawWallText(view, bound, index))
    }));
    const details = new Map<number, DionCaptured[]>();
    for (
      let record = 1;
      record <= bound.detail.primitives.length;
      record += 1
    ) {
      details.set(
        record,
        capturing(view => drawDetailRecord(view, bound, record))
      );
    }
    structure = {
      cell: bound.cell,
      detail: bound.detail,
      details,
      doors,
      ground: capturing(view => drawGround(view, bound)),
      origin: [bound.origin[0], 0, bound.origin[2]],
      structure: bound.structure,
      walls,
      wallTexts
    };
  }
  const residents: DionParts['residents'][number][] = [];
  const view: View = {
    camera,
    paint,
    primitives: [],
    source: `cell:${state.cell}`,
    state,
    world
  };
  // The residents a region queue hooks in (`$5B3A6`) are drawn with the rest: depth, not the
  // queue, decides which of them shows.
  const hooked: Placed[] =
    bound === null
      ? []
      : world.residents
          .filter(
            resident =>
              resident.cell === bound.cell.cell &&
              resident.group === world.metisGroup &&
              resident.association !== 0
          )
          .map(resident => ({
            cellNumber: resident.cell,
            model:
              resident.model === null
                ? undefined
                : world.models.get(resident.model),
            pose: residentPose(view, resident),
            slot: resident.slot
          }));
  const seen = new Set<number>();
  for (const item of [...drawable(view, bound), ...hooked]) {
    if (item.slot === 0 || item.model === undefined || seen.has(item.slot)) {
      continue;
    }
    seen.add(item.slot);
    const model = item.model;
    const { mode, passenger } = modelMode(state, item.slot, model);
    const viewFixed = passenger || (mode !== 0 && (mode & 0xc0) === 0);
    const pose = item.pose;
    const slot = item.slot;
    const beacon = world.tourcraft?.beacons.get(slot);
    // `$8003`: a promoted beacon swaps its lit and dark models, any other lamp patch its lamp
    // colours, on the frame counter plus the slot's phase word.
    const flashes =
      beacon !== undefined ||
      (model.header?.op === 0x3 && (model.header.targets?.length ?? 0) > 0);
    const phase = world.blinkPhase.get(slot) ?? 0;
    const alternatives = viewFixed ? [] : model.alternatives;
    const { articulationAngle: _angle, ...withoutAngle } = state;
    // One form of the resident: a face list, lit or dark, at an articulation angle in Dion's
    // own 1024ths. The gates stand open, so `$8003`'s own test is what the frame decides.
    const formOf = (
      faceList: number | 'default',
      dark: boolean,
      articulationAngle: number | undefined
    ): DionCaptured[] =>
      capturing(view => drawModel(view, bound, slot, model, pose), {
        faceList,
        state: {
          ...withoutAngle,
          ...(articulationAngle === undefined ? {} : { articulationAngle }),
          beaconGates: new Map(
            beacon?.gate === undefined ? [] : [[beacon.gate, true]]
          ),
          frameCounter: (dark ? 4 - phase : -phase) & 0xff_ff
        }
      });
    residents.push(
      viewFixed
        ? {
            position: passenger ? state.eye : pose.position,
            primitives: capturing(view =>
              drawModel(view, bound, slot, model, pose)
            ),
            slot,
            viewFixed
          }
        : {
            forms: {
              alternatives: alternatives.map(alternative => ({
                max: [
                  alternative.min[0] + alternative.size[0],
                  alternative.min[1] + alternative.size[1],
                  alternative.min[2] + alternative.size[2]
                ],
                min: alternative.min
              })),
              articulated: (mode & 0x80) !== 0,
              drawn: () =>
                capturing(view => drawModel(view, bound, slot, model, pose)),
              ...(flashes
                ? { flash: { gate: beacon?.gate ?? null, phase } }
                : {}),
              formOf
            },
            position: pose.position,
            primitives: formOf('default', false, state.articulationAngle),
            reach: {
              cells: model.header?.op === 0xc ? (model.header.range ?? 1) : 1,
              ...(beacon === undefined ? {} : { point: world.modelColours[3]! })
            },
            slot,
            viewFixed
          }
    );
  }
  return {
    residents,
    scene: {
      day: sceneHalf?.day ?? [],
      night: sceneHalf?.night ?? []
    },
    structure
  };
};
