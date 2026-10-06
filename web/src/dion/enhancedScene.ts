import type {
  Bounds,
  DetailGroup,
  EntranceAttachment,
  Mesh,
  Primitive,
  RegionQueueEntry,
  StructureSelection,
  WallText
} from '../catalogue/data.ts';
import { islandOriginNear } from '../coast/islands.ts';
import type { FormClock, PlacementForms } from '../enhanced/forms.ts';
import {
  planEnhancedFrame,
  type EnhancedFramePlan
} from '../enhanced/frame.ts';
import { ENHANCED_PRESENTATION } from '../enhanced/presentation.ts';
import type {
  BoundStructure,
  EnhancedSurface,
  Pose,
  SceneIsland,
  ScenePlacement
} from '../enhanced/scene.ts';
import type { SkyPass, StarPixel } from '../enhanced/sky.ts';
import type { CarriedSlot } from '../structure/selection.ts';
import {
  captureDionParts,
  stRgb,
  type DionCaptured,
  type DionFrameState,
  type DionFrameWorld,
  type DionParts,
  type DionResidentForms,
  type Vec3
} from './frame.ts';
import { generalCamera, levelCamera, toCamera } from './raster.ts';
import { dionStars } from './sky.ts';
import { tourcraftSkyPass, tourcraftStarPixels } from './tourcraftSky.ts';

/// Mercenary III as the shared Enhanced planner draws it (ADR 0077, #806).
///
/// The planner's rules for what is drawn are the Damocles port's, so this module turns a Dion
/// frame into the scene they read rather than choosing anything itself. Dion's own routines
/// build the geometry (`captureDionParts`), with every wall, door face, wall text, detail record
/// and resident at this frame's state; this module resolves its colour words and lays it out as
/// the placements, structure selection, islands, roads and sky pass the planner takes:
///
/// - The occupied cell's structure is a placement with a selection: its plan walls as faces by
///   wall number, its doors as attachments, its wall texts on the queue entry they follow, its
///   building detail by record with its two list groups, and its regions' queues and flags.
///   The planner selects from these by region and viewer, as it does Damocles's.
/// - Each resident is a placement in its own form for this frame, which Dion's routines choose
///   by the same rules the shared chooser applies to Damocles (beacon phase, viewer box,
///   articulation, live text). Residents a region queue hooks in are drawn with the rest.
/// - Colour words resolve through the cell's scene palette, night half and day half, and the
///   frame palette's template, as `resolveColour` does without allocating entries.

export interface DionEnhancedScene {
  readonly aboard: boolean;
  readonly carriedSlot: CarriedSlot;
  /// The counters the shared chooser picks residents' forms by (#815): Dion's frame counter
  /// and its articulation angle in 256 steps.
  readonly clock: FormClock;
  readonly daylight: boolean;
  /// Gaps this frame's scene names rather than guesses (ADR 0014).
  readonly gaps: readonly string[];
  readonly inSpace: boolean;
  readonly pose: Pose;
  readonly residents: readonly ScenePlacement[];
  readonly sky: SkyPass | null;
  readonly structure: BoundStructure | null;
  /// The sky item that gives Sunlight: the System's first Body, the one always drawn lit.
  readonly sun: string | null;
  readonly surface: EnhancedSurface;
  /// The cab about the eye and the driver's head, drawn over the world (#807).
  readonly viewFixed: readonly ScenePlacement[];
}

const FREE = 0x80_00;
const hex = (word: number): string =>
  `#${stRgb(word)
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')}`;

/// One colour word through a scene palette half and the frame template, or null where it
/// names an entry the frame allocates as it draws (`$80nn` on a free entry) or a scene entry
/// the payload does not carry.
const resolveWord = (
  word: number,
  scene: readonly number[],
  template: readonly number[]
): number | null => {
  let value = word;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!(value & 0x80_00)) {
      return value & 0x7_77;
    }
    if (!(value & 0x80)) {
      const entry = template[value & 0x0f];
      return entry === undefined || entry & FREE ? null : entry & 0x7_77;
    }
    const entry = scene[(value & 0x7e) >> 1];
    if (entry === undefined) {
      return null;
    }
    value = entry;
  }
  return null;
};

interface Palettes {
  readonly day: {
    readonly scene: readonly number[];
    readonly template: readonly number[];
  };
  readonly gaps: Set<string>;
  readonly night: {
    readonly scene: readonly number[];
    readonly template: readonly number[];
  };
}

/// A colour word's two halves as a primitive carries them: the night half's, and the day
/// half's where it differs.
const halves = (
  palettes: Palettes,
  word: number
): Pick<Primitive, 'colour' | 'dayColour' | 'sourceColour'> => {
  const night = resolveWord(
    word,
    palettes.night.scene,
    palettes.night.template
  );
  const day = resolveWord(word, palettes.day.scene, palettes.day.template);
  if (night === null || day === null) {
    palettes.gaps.add(
      `colour word $${word.toString(16).toUpperCase()} names an entry the frame allocates`
    );
  }
  const nightHex = hex(night ?? 0);
  const dayHex = hex(day ?? 0);
  return {
    colour: nightHex,
    ...(dayHex === nightHex ? {} : { dayColour: dayHex }),
    sourceColour: word
  };
};

/// A 32-bit FNV-1a over a list of numbers: the key a mesh is reused by from frame to frame,
/// so the planner's triangulation cache keeps hitting while a part does not change.
const digest = (values: Iterable<number>): string => {
  let hash = 0x81_1c_9d_c5;
  for (const value of values) {
    const scaled = Math.round(value * 16);
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (scaled >>> shift) & 0xff;
      hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
    }
  }
  return hash.toString(16);
};

const numbers = function* (
  primitives: readonly DionCaptured[],
  origin: Vec3,
  extra: readonly number[]
): Generator<number> {
  yield* extra;
  for (const primitive of primitives) {
    yield primitive.colour;
    yield primitive.cull ? 1 : 0;
    yield primitive.kind === 'line' ? 1 : 0;
    yield primitive.points.length;
    for (const point of primitive.points) {
      yield point[0] - origin[0];
      yield point[1] - origin[1];
      yield point[2] - origin[2];
    }
  }
};

const MESH_LIMIT = 4096;
const meshes = new Map<string, Mesh>();

/// Captured primitives as a mesh about `origin`, every one tagged with `sourceIndex` where
/// given. A polygon the routine drew with culling off faces both ways; a two-point polygon is
/// a line.
const meshOf = (
  palettes: Palettes,
  parts: readonly (readonly [readonly DionCaptured[], number | undefined])[],
  origin: Vec3,
  salt: string
): Mesh => {
  const key = `${salt}|${digest(
    (function* () {
      for (const [primitives, index] of parts) {
        yield index ?? -1;
        yield* numbers(primitives, origin, []);
      }
    })()
  )}|${palettes.night.scene.join()}|${palettes.day.scene.join()}`;
  const cached = meshes.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const vertices: [number, number, number][] = [];
  const faces: Primitive[] = [];
  const lines: Primitive[] = [];
  for (const [primitives, sourceIndex] of parts) {
    for (const primitive of primitives) {
      const first = vertices.length;
      for (const [x, y, z] of primitive.points) {
        vertices.push([x - origin[0], y - origin[1], z - origin[2]]);
      }
      const refs = primitive.points.map((_, index) => first + index);
      const colour = halves(palettes, primitive.colour);
      const tagged = sourceIndex === undefined ? {} : { sourceIndex };
      if (primitive.kind === 'line' || refs.length < 3) {
        if (refs.length >= 2) {
          lines.push({ ...colour, ...tagged, vertices: refs.slice(0, 2) });
        }
        continue;
      }
      faces.push({
        ...colour,
        ...(primitive.cull ? {} : { doubleSided: true }),
        ...tagged,
        vertices: refs
      });
    }
  }
  const mesh: Mesh = { faces, lines, vertices };
  if (meshes.size > MESH_LIMIT) {
    meshes.clear();
  }
  meshes.set(key, mesh);
  return mesh;
};

/// A detail list box's bounds at the structure's scale, as `$54C76` scales them: `$8000` and
/// `$7FFF` stand for no bound, and a negative scale swaps the pair. The planner's box test
/// reads the sentinels the same way, so the bounds are handed over already scaled.
const scaledBounds = (
  pair: readonly [number, number],
  factor: number
): readonly [number, number] => {
  const lo = pair[0] === -0x80_00 ? -0x80_00 : pair[0] * factor;
  const hi = pair[1] === 0x7f_ff ? 0x7f_ff : pair[1] * factor;
  if (factor >= 0) {
    return [lo, hi];
  }
  return [hi === 0x7f_ff ? -0x80_00 : hi, lo === -0x80_00 ? 0x7f_ff : lo];
};

/// A region queue's bytes as the planner's entries: a byte from `$96` names an attachment, as
/// does any naming a door's slot; any other names a plan wall (`$5B3A6`).
const queueEntries = (
  parts: NonNullable<DionParts['structure']>,
  bytes: readonly number[]
): RegionQueueEntry[] => {
  const doors = new Set(parts.structure.attachments.map(door => door.slot));
  return bytes.flatMap((byte): RegionQueueEntry[] => {
    if (byte === 0) {
      return [];
    }
    const slot = (byte >= 0x96 ? byte - 0x6a : byte) * 4;
    return doors.has(slot)
      ? [{ kind: 'attachment', slot }]
      : [{ index: slot >> 2, kind: 'face' }];
  });
};

const structurePlacement = (
  parts: NonNullable<DionParts['structure']>,
  palettes: Palettes
): ScenePlacement => {
  const { cell, detail, structure } = parts;
  const origin = parts.origin;
  const salt = `cell:${cell.cell}`;
  const plan = meshOf(
    palettes,
    [...parts.walls].map(([wall, primitives]) => [primitives, wall] as const),
    origin,
    `${salt}:plan`
  );
  const attachments: EntranceAttachment[] = parts.doors.map(
    ({ door, primitives }) => ({
      constructor: {
        leafCount: door.twoLeaves ? 2 : 1,
        motionAxis: door.motionAxis
      },
      controlWord: door.control,
      ...(door.key === null ? {} : { keyIndex: door.key & 0x0f }),
      // The leaves are captured where the mover has left them, so the planner moves nothing.
      mesh: meshOf(palettes, [[primitives, undefined]], origin, `${salt}:door`),
      proximityBox: door.box,
      slot: door.slot
    })
  );
  const doorSlots = new Set(structure.attachments.map(door => door.slot));
  const wallTexts: WallText[] = parts.wallTexts.map(text => ({
    face: doorSlots.has(text.face * 4)
      ? { kind: 'attachment', slot: text.face * 4 }
      : { index: text.face, kind: 'face' },
    font: text.plane & 0x0f,
    mesh: meshOf(
      palettes,
      [[text.primitives, undefined]],
      origin,
      `${salt}:text`
    ),
    plane: text.plane & 0x80 ? 128 : 0,
    text: ''
  }));
  const detailMesh = meshOf(
    palettes,
    [...parts.details].map(
      ([record, primitives]) => [primitives, record] as const
    ),
    origin,
    `${salt}:detail`
  );
  const [sx, sz] = cell.scale;
  // The planner reads group 0 aboard and group 1 on foot; a detail with fewer draws nothing
  // from the group it lacks.
  const listed = [...detail.groups];
  while (listed.length < 2) {
    listed.push({ boxes: [], default: [] });
  }
  const groups: DetailGroup[] = listed.map(group => ({
    boxes: group.boxes.map(box => ({
      bounds: [
        scaledBounds(box.x, sx),
        scaledBounds(box.y, 1),
        scaledBounds(box.z, sz)
      ] as Bounds,
      records: box.records
    })),
    default: group.default
  }));
  const selection: StructureSelection = {
    attachments,
    detailModel: `dion-detail-${detail.index}`,
    detailVariant: 'record',
    plan,
    regions: structure.regions.map(region => ({
      bounds: [region.bounds.x, region.bounds.z],
      flags: region.flags,
      gate: 'none' as const,
      queue: queueEntries(parts, region.queue)
    })),
    scale: [1, 1],
    wallTexts
  };
  const [ceiling, floor] = structure.sceneColours.map(word =>
    halves(palettes, word)
  );
  const day =
    ceiling!.dayColour === undefined && floor!.dayColour === undefined
      ? undefined
      : {
          ceiling: ceiling!.dayColour ?? ceiling!.colour,
          floor: floor!.dayColour ?? floor!.colour
        };
  // Away from the cell's central half the planner binds no region (`$7AF6`), and draws the
  // placement's own mesh: every part, as the `whole` draw takes them.
  const whole = meshOf(
    palettes,
    [
      ...[...parts.walls.values()].map(
        primitives => [primitives, undefined] as const
      ),
      ...parts.doors.map(door => [door.primitives, undefined] as const),
      ...parts.wallTexts.map(text => [text.primitives, undefined] as const),
      ...[...parts.details.values()].map(
        primitives => [primitives, undefined] as const
      )
    ],
    origin,
    `${salt}:whole`
  );
  return {
    faceCount: whole.faces.length,
    heading: 0,
    id: `dion-structure-${cell.cell}`,
    keyBase: cell.keyBase,
    kind: 'structure',
    mesh: whole,
    modelId: `dion-structure-${cell.structure}`,
    name: `Structure ${cell.structure}`,
    position: { x: origin[0], y: 0, z: origin[2] },
    selection: {
      background: {
        ceiling: ceiling!.colour,
        ...(day === undefined ? {} : { day }),
        floor: floor!.colour
      },
      boxes: { supports: [], walls: [] },
      detail: detailMesh,
      extent: null,
      groups,
      structure: selection
    },
    status: 'decoded'
  };
};

/// Dion's camera as the shared planner's Pose: the bearing clockwise from north, the pitch up
/// from level and the bank to the right that turn the planner's camera onto the same view.
export const dionPose = (state: DionFrameState): Pose => {
  const camera = state.cameraAngles
    ? generalCamera(
        state.eye,
        state.cameraAngles.roll,
        state.cameraAngles.pitch,
        state.cameraAngles.yaw
      )
    : levelCamera(state.eye, state.heading);
  // The camera's axes in the world: d forward, u left, v down.
  const axis = (pick: 'd' | 'u' | 'v'): Vec3 => {
    const along = (x: number, y: number, z: number) =>
      toCamera(camera, x, y, z)[pick];
    return [along(1, 0, 0), along(0, 1, 0), along(0, 0, 1)];
  };
  const forward = axis('d');
  const down = axis('v');
  const heading = Math.atan2(forward[0], forward[2]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, forward[1])));
  const right0: Vec3 = [Math.cos(heading), 0, -Math.sin(heading)];
  const up0: Vec3 = [
    -Math.sin(heading) * Math.sin(pitch),
    Math.cos(pitch),
    -Math.cos(heading) * Math.sin(pitch)
  ];
  const up: Vec3 = [-down[0], -down[1], -down[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const roll = Math.atan2(dot(up, right0), dot(up, up0));
  return {
    body: `dion-${state.skyView?.body ?? 'space'}`,
    heading,
    pitch,
    position: { x: state.eye[0], y: state.eye[1], z: state.eye[2] },
    roll
  };
};

/// A form's id as the shared chooser names it: the default list or an alternative, lit or dark.
const formId = (faceList: number | 'default', dark: boolean): string =>
  faceList === 'default'
    ? dark
      ? 'flash-dark'
      : 'record'
    : `view-${faceList}${dark ? '-flash-dark' : ''}`;

const withViewGroups = new WeakMap<Mesh, Mesh>();

/// A Dion resident's forms for the shared chooser (#815): every face list, lit and dark where
/// it flashes, captured by Dion's routines; the chooser picks one by the frame's counters and
/// the eye's box, and turns an articulated one through Dion's own turn.
const residentForms = (
  forms: DionResidentForms,
  position: Vec3,
  slot: number,
  palettes: Palettes,
  articulationAngle: number | undefined
): { readonly forms: PlacementForms; readonly own: Mesh } => {
  const mesh = (
    faceList: number | 'default',
    dark: boolean,
    angle: number | undefined
  ): Mesh =>
    meshOf(
      palettes,
      [[forms.formOf(faceList, dark, angle), undefined]],
      position,
      `slot:${slot}`
    );
  const lists: (number | 'default')[] = [
    'default',
    ...forms.alternatives.map((_, index) => index)
  ];
  const variants = lists.flatMap(faceList =>
    (forms.flash === undefined ? [false] : [false, true]).map(dark => ({
      id: formId(faceList, dark),
      mesh: mesh(faceList, dark, undefined)
    }))
  );
  const base = variants[0]!.mesh;
  let own = withViewGroups.get(base);
  if (own === undefined) {
    own =
      forms.alternatives.length === 0
        ? base
        : {
            ...base,
            viewGroups: forms.alternatives.map(({ max, min }) => ({
              bounds: [
                [min[0], max[0]],
                [min[1], max[1]],
                [min[2], max[2]]
              ] as const
            }))
          };
    withViewGroups.set(base, own);
  }
  variants[0] = { id: 'record', mesh: own };
  const byId = new Map(
    lists.flatMap(faceList =>
      [false, true].map(dark => [formId(faceList, dark), { dark, faceList }])
    )
  );
  return {
    forms: {
      // Dion turns an articulated model by its own table, in 1024ths; where the slice carries
      // no angle it draws the model at rest, untouched.
      ...(forms.articulated && articulationAngle !== undefined
        ? {
            articulate: (id: string, angle: number) => {
              const form = byId.get(id) ?? { dark: false, faceList: 'default' };
              return mesh(form.faceList, form.dark, angle << 2);
            }
          }
        : {}),
      ...(forms.flash === undefined
        ? {}
        : {
            flash: { gateSlot: forms.flash.gate, phase: forms.flash.phase }
          }),
      own: 'record',
      variants
    },
    own
  };
};

const residentPlacement = (
  resident: DionParts['residents'][number],
  palettes: Palettes,
  articulationAngle: number | undefined
): ScenePlacement => {
  const position = resident.position;
  const chosen =
    resident.forms === undefined
      ? undefined
      : residentForms(
          resident.forms,
          position,
          resident.slot,
          palettes,
          articulationAngle
        );
  const mesh =
    chosen?.own ??
    meshOf(
      palettes,
      [[resident.primitives, undefined]],
      position,
      `slot:${resident.slot}`
    );
  return {
    faceCount: mesh.faces.length,
    ...(chosen === undefined ? {} : { forms: chosen.forms }),
    heading: 0,
    id: `object-slot-${resident.slot}`,
    keyBase: null,
    kind: 'object',
    mesh,
    modelId: `dion-resident-${resident.slot}`,
    name: `Slot ${resident.slot}`,
    position: { x: position[0], y: position[1], z: position[2] },
    ...(resident.reach === undefined
      ? {}
      : {
          reach: {
            cells: resident.reach.cells,
            ...(resident.reach.point === undefined
              ? {}
              : {
                  point: {
                    colour: halves(palettes, resident.reach.point).colour
                  }
                })
          }
        }),
    status: 'decoded'
  };
};

/// The frame palette's sixteen entries for one half: the template with the sky, the road and
/// the fixed entries in, as `planDionFrame` starts each frame.
const frameTemplate = (
  world: DionFrameWorld,
  space: boolean,
  day: boolean
): number[] => {
  const template = [...world.framePalette.template];
  template[8] = space
    ? world.tourcraft!.system.spacePalette.background
    : day
      ? world.framePalette.skyDay
      : world.framePalette.skyNight;
  template[14] = world.roads?.colour ?? world.framePalette.road;
  for (const [index, colour] of space
    ? world.tourcraft!.system.spacePalette.fixed
    : world.framePalette.fixed) {
    template[index] = colour;
  }
  return template;
};

const sceneIslands = (
  world: DionFrameWorld,
  state: DionFrameState,
  gaps: Set<string>
): readonly SceneIsland[] => {
  const coast = world.coast;
  if (coast === undefined) {
    return [];
  }
  const [gx, gz] = world.opening.groupOrigin;
  const eye = { x: state.eye[0], y: state.eye[1], z: state.eye[2] };
  const roads = world.roads;
  let placed = false;
  const islands = coast.islands.map(island => {
    const origin = islandOriginNear(eye, coast.grid, island);
    const home =
      roads !== undefined &&
      origin.x === gx * 0x1_00_00 &&
      origin.z === gz * 0x1_00_00;
    placed ||= home;
    return {
      ...island,
      landColour: hex(island.landColour),
      ...(home
        ? {
            roads: {
              corners: roads!.corners,
              roadColour: hex(roads!.colour)
            }
          }
        : {})
    };
  });
  if (roads !== undefined && !placed) {
    gaps.add('no island record lies at the road network’s group origin');
  }
  return islands;
};

export const dionEnhancedScene = (
  world: DionFrameWorld,
  state: DionFrameState
): DionEnhancedScene => {
  const space = state.skyView?.body === null;
  const parts = captureDionParts(world, state);
  const gaps = new Set<string>();
  const palettes: Palettes = {
    day: {
      scene: parts.scene.day,
      template: frameTemplate(world, space, true)
    },
    gaps,
    night: {
      scene: parts.scene.night,
      template: frameTemplate(world, space, false)
    }
  };
  const placements: ScenePlacement[] = [];
  let structure: BoundStructure | null = null;
  if (parts.structure !== null) {
    const placement = structurePlacement(parts.structure, palettes);
    placements.push(placement);
    const ground = parts.structure.ground;
    if (ground.length > 0) {
      const [gx, gz] = world.opening.groupOrigin;
      const base: Vec3 = [
        (gx + parts.structure.cell.x) * 0x1_00_00,
        0,
        (gz + parts.structure.cell.z) * 0x1_00_00
      ];
      const mesh = meshOf(
        palettes,
        [[ground, undefined]],
        base,
        `ground:${parts.structure.cell.cell}`
      );
      placements.push({
        faceCount: mesh.faces.length,
        heading: 0,
        id: `dion-ground-${parts.structure.cell.cell}`,
        keyBase: null,
        kind: 'ground',
        mesh,
        modelId: `dion-ground-${parts.structure.cell.ground.address}`,
        name: `Ground ${parts.structure.cell.cell}`,
        position: { x: base[0], y: 0, z: base[2] },
        status: 'decoded'
      });
    }
    structure = {
      // The doors are captured at their state, so the planner moves none of them.
      attachments: [],
      instanceId: placement.id,
      regionIndex: state.region >= 1 ? state.region - 1 : null
    };
  }
  const residents = parts.residents
    .filter(resident => !resident.viewFixed)
    .map(resident =>
      residentPlacement(resident, palettes, state.articulationAngle)
    );
  const viewFixed = parts.residents
    .filter(resident => resident.viewFixed)
    .map(resident => residentPlacement(resident, palettes, undefined));
  const nightSky = hex(world.framePalette.skyNight);
  const daySky = hex(world.framePalette.skyDay);
  const surface: EnhancedSurface = {
    baseColour: hex(world.framePalette.land),
    floorLabelGlyphs: {},
    grid: {
      cellsPerAxis: 16,
      cellUnits: 0x1_00_00,
      origin: {
        x: world.opening.groupOrigin[0],
        z: world.opening.groupOrigin[1]
      }
    },
    islands: sceneIslands(world, state, gaps),
    placements,
    sky: {
      day: { colour: daySky, sourceColour: world.framePalette.skyDay },
      night: { colour: nightSky, sourceColour: world.framePalette.skyNight }
    }
  };
  const stars: readonly StarPixel[] =
    world.tourcraft && state.skyView
      ? tourcraftStarPixels(
          world.sky,
          world.tourcraft.arithmetic,
          state.skyView
        )
      : state.day
        ? []
        : dionStars(world.sky, state.heading, state.pitch).map(
            ([column, row, colour]) => ({ colour: hex(colour), column, row })
          );
  const sky: SkyPass | null =
    world.tourcraft && state.skyView
      ? tourcraftSkyPass(
          world.tourcraft.system,
          state.skyView,
          world.tourcraft.tail,
          stars
        )
      : {
          bodies: [],
          halfWidthDivisor: 0.843_75,
          horizonCut: true,
          projectionScale: 256,
          stars
        };
  const gates = state.beaconGates ?? world.tourcraft?.beaconGates;
  return {
    aboard: state.passenger !== null,
    carriedSlot: slot => gates?.get(slot) === true,
    clock: {
      angle: ((state.articulationAngle ?? 0) >> 2) & 0xff,
      frame: state.frameCounter & 0xff_ff,
      television: 0,
      textStep: 0
    },
    daylight: state.day,
    gaps: [...gaps],
    inSpace: space,
    pose: dionPose(state),
    residents,
    sky,
    structure,
    sun: world.tourcraft?.system.bodies[0]?.id ?? null,
    surface,
    viewFixed
  };
};

/// The shared planner's frame of a Dion scene, through the Enhanced viewer's camera.
export const planDionEnhancedFrame = (
  scene: DionEnhancedScene,
  outputHeight: number
): EnhancedFramePlan =>
  planEnhancedFrame(
    scene.surface,
    scene.pose,
    ENHANCED_PRESENTATION,
    scene.structure,
    scene.residents,
    [],
    scene.carriedSlot,
    scene.daylight,
    scene.sky,
    scene.inSpace,
    scene.aboard,
    'whole',
    outputHeight,
    scene.clock,
    scene.viewFixed
  );
