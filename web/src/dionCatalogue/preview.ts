import type { CoastSurface } from '../coast/islands.ts';
import { type GeometryStore } from '../dion/catalogue.ts';
import {
  openingFrameState,
  planDionFrame,
  type DionCoastIsland,
  type DionFrameState,
  type DionFrameWorld,
  type Vec3
} from '../dion/frame.ts';
import { ints, list, record, type Provenance } from '../dion/read.ts';
import {
  readDetail,
  readGround,
  readStructure,
  type DionCell,
  type DionDetail,
  type DionModel,
  type DionResident,
  type DionStructure
} from '../dion/world.ts';
import { catalogueCoast } from './coast.ts';
import { fieldOccurrence, type Selection } from './inspection.ts';
import { addressOf, chosenVariant, modelForm } from './model.ts';
import { type RenderSupport } from './support.ts';

export { readRenderSupport, supportPath } from './support.ts';

const emptyProvenance: Provenance = { range: [0, 1], sha256: '0'.repeat(64) };
// $561FC: Catalogue transform variants name the selector index, not its bit mask.
const groundTransforms = [0, 6, 3, 5, 1, 4, 2, 7] as const;
// Inspection-only empty containers carry no recovered geometry. Camera, queue and
// palette context are explicit authored inspection choices, never campaign state.
const emptyStructure = (): DionStructure => ({
  associations: [],
  attachments: [],
  heights: [0, 0],
  plan: [],
  provenance: emptyProvenance,
  regions: [
    {
      bounds: { x: [-32_768, 32_767], z: [-32_768, 32_767] },
      flags: 0x80_00,
      queue: []
    }
  ],
  sceneColours: [0x80_08, 0x80_08],
  walls: [],
  wallTexts: []
});
const emptyDetail = (): DionDetail => ({
  extent: null,
  groups: [],
  index: 0,
  primitives: [],
  provenance: emptyProvenance,
  tagged: [],
  vertices: []
});
export type PreviewPose = Partial<Omit<DionFrameState, 'cell'>> &
  Pick<DionFrameState, 'eye' | 'heading'> & {
    /// Original destination probes can retain the opening lift-label buffer.
    readonly floorLabel?: number;
    /// Captured $703C; original destination selection can differ from world eye Y.
    readonly structureEyeY?: number;
  };
export interface Preview {
  readonly message: string;
  plan(
    heading?: number,
    distance?: number,
    region?: number
  ): ReturnType<typeof planDionFrame>;
  /// Cell-local camera and captured presentation state, for original-scene checks.
  /// Geometry and Floor context still come exclusively from the Catalogue.
  planAt(state: PreviewPose): ReturnType<typeof planDionFrame>;
  readonly regions: number;
  readonly residents: GeometryStore['catalogue']['objects'];
  readonly variant: string;
  readonly variants: readonly string[];
}

export const preparePreview = async (
  store: GeometryStore,
  support: RenderSupport,
  selection: Selection,
  /// Isolated original-object probes use an evidenced stage's palette/Body.
  context?: {
    readonly body: string;
    readonly group: number;
    readonly palette: number;
  }
): Promise<Preview> => {
  const c = store.catalogue;
  const object = c.objects.find(o => o.id === selection.id);
  const place = c.places.find(p => p.id === selection.id);
  const placement = c.placements.find(
    p => p.id === (place?.placement ?? selection.id)
  );
  const bodyEntry = c.bodies.find(b => b.id === selection.id);
  const direct = c.geometryIndex.find(
    g => g.id === (bodyEntry?.islands[0]?.geometry ?? selection.id)
  );
  if (!object && !placement && !direct) {
    throw new Error(
      `${selection.id}: choose an object, placement or geometry definition`
    );
  }
  const structureSlot = placement
    ? c.structures.find(s => s.id === placement.structure)
    : undefined;
  const binding = structureSlot?.floorBindings.find(
    f => f.floor === selection.floor
  );
  if (placement && !binding) {
    throw new Error(`${placement.id}: Floor ${selection.floor} is not bound`);
  }
  if (binding && selection.variant && selection.variant !== binding.variant) {
    throw new Error(`${placement!.id}: variant differs from its Floor binding`);
  }
  const geometryId = object?.geometry ?? binding?.geometry ?? direct?.id;
  const isInitial =
    placement?.id === c.constructions.binding && selection.state === 'initial';
  let noGeometry = object?.geometry === null || isInitial;
  const geometry =
    geometryId && !noGeometry ? await store.get(geometryId) : undefined;
  if (geometry && Object.keys(geometry.variants).length === 0) {
    noGeometry = true;
  }
  const variant =
    geometry && !noGeometry
      ? chosenVariant(geometry, selection.variant || binding?.variant || '')
      : '';
  const body =
    context?.body ??
    bodyEntry?.id ??
    object?.body ??
    placement?.body ??
    direct?.bodies[0];
  if (
    context &&
    (!support.bodies.has(context.body) ||
      !support.palettes.has(context.palette))
  ) {
    throw new Error('Preview context: unknown Body or palette');
  }
  const host = object?.host?.placement
    ? c.placements.find(p => p.id === object.host!.placement)
    : undefined;
  const group =
    context?.group ??
    placement?.group ??
    host?.group ??
    (object?.host?.field
      ? 56
      : c.bodies.find(b => b.id === body)?.islands[0]?.group) ??
    18;
  const environment =
    support.groups.get(group) ??
    support.bodies.get(body ?? '') ??
    support.groups.get(18)!;
  let structure = emptyStructure();
  let detail = emptyDetail();
  const colours = [...support.colours];
  const models = new Map<number, DionModel>();
  const residents: DionResident[] = [];
  const grounds = new Map<number, ReturnType<typeof readGround>>();
  let groundAddress = 0;
  let groundTransform = 0;
  let groundOrientation = 0;
  let roadPoints = new Map<number, number>();
  let coast: CoastSurface<DionCoastIsland> | undefined;
  let origin: readonly [number, number] = [32_768, 32_768];
  let scale: readonly [number, number] = [1, 1];
  let baseY = 0;
  const objectHost = host
    ? c.structures.find(s => s.id === host.structure)
    : undefined;
  let palette =
    context?.palette ??
    objectHost?.floorBindings.find(f => f.floor === (object?.floor ?? 0))
      ?.palette ??
    1;
  let focus: Vec3 = [32_768, 32, 32_768];
  let radius = 150;
  let message = noGeometry
    ? isInitial
      ? 'LOGOS initial state: this cell is absent. Constructed inspection runs no campaign scripts.'
      : 'Evidenced absence of drawable geometry: NULL model or empty model record.'
    : 'Authored inspection camera · Authentic · no pixel parity claim for free inspection.';
  const repeat =
    placement?.id === c.field.seed
      ? fieldOccurrence(c, selection.fieldX, selection.fieldZ)
      : undefined;
  const visibleResidents =
    placement && !isInitial
      ? c.objects.filter(o =>
          o.residence === 'surface'
            ? selection.floor === 0 &&
              o.body === body &&
              o.bodyCell?.join(',') ===
                (repeat?.bodyCell ?? placement.bodyCell).join(',')
            : o.floor === selection.floor &&
              (repeat
                ? o.host?.field === 'midas' &&
                  o.bodyCell?.join(',') === repeat.bodyCell.join(',')
                : o.host?.placement === placement.id)
        )
      : [];
  if (geometry?.family === 'model' && !noGeometry) {
    models.set(1, modelForm(geometry, variant, 1, colours, object?.lettering));
    const vertices = models.get(1)!.vertices;
    const span = (axis: number) => [
      Math.min(0, ...vertices.map(v => v[axis]!)),
      Math.max(0, ...vertices.map(v => v[axis]!))
    ];
    const bounds = [span(0), span(1), span(2)];
    focus = [
      32_768 + (bounds[0]![0]! + bounds[0]![1]!) / 2,
      (bounds[1]![0]! + bounds[1]![1]!) / 2,
      32_768 + (bounds[2]![0]! + bounds[2]![1]!) / 2
    ];
    radius = Math.min(
      60_000,
      Math.max(12, ...bounds.map(([a, b]) => b! - a!)) * 3
    );
    residents.push({
      association: 0,
      body: 0,
      cell: 0,
      group,
      model: 1,
      position: [32_768, 0, 32_768],
      slot: object?.slot ?? 1,
      state: 0,
      yaw: 0,
      zone: 0
    });
  } else if (geometry?.family === 'structure') {
    structure = readStructure(
      geometry.variants[variant],
      `${geometry.id}.${variant}`
    );
    const related =
      structureSlot ??
      c.structures.find(s => s.floors.some(f => f.geometry === geometry.id));
    if (related) {
      const d = await store.get(related.detail);
      detail = readDetail(d.variants['base'], `${d.id}.base`);
      scale = related.scale;
      if (!placement) {
        scale = variant.slice('scale='.length).split(',').map(Number) as [
          number,
          number
        ];
      }
      palette =
        binding?.palette ??
        related.floorBindings.find(f => f.geometry === geometry.id)?.palette ??
        related.palette;
    }
    origin = (placement?.origin as readonly [number, number]) ?? [
      32_768, 32_768
    ];
    baseY = binding?.baseY ?? 0;
    const xs = structure.plan.map(v => v[0]);
    const zs = structure.plan.map(v => v[1]);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const cz = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
    radius =
      Math.max(
        200,
        Math.max(0, ...xs) - Math.min(0, ...xs),
        Math.max(0, ...zs) - Math.min(0, ...zs)
      ) * 2;
    focus = [origin[0] + cx, baseY + 63, origin[1] + cz];
    for (const o of visibleResidents) {
      if (!o.geometry) {
        continue;
      }
      const g = await store.get(o.geometry);
      models.set(
        o.slot,
        modelForm(g, chosenVariant(g, ''), o.slot, colours, o.lettering)
      );
      const indoor = o.indoor;
      const position: Vec3 = indoor
        ? [
            origin[0] + indoor.localPosition[0]!,
            baseY + indoor.localPosition[1]!,
            origin[1] + indoor.localPosition[2]!
          ]
        : [
            o.position![0]! - o.bodyCell![0]! * 65_536,
            o.position![1]!,
            o.position![2]! - o.bodyCell![1]! * 65_536
          ];
      residents.push({
        association: indoor?.association ?? 0,
        body: 0,
        cell: 0,
        group,
        model: o.slot,
        position,
        slot: o.slot,
        state: 0,
        yaw: indoor?.yaw ?? support.surfaceYaw.get(o.slot)!,
        zone: 0
      });
    }
    if (placement?.state === 'storage') {
      message =
        'VOID storage record · geometry inspection only · not a navigable Location.';
    }
  } else if (geometry?.family === 'detail') {
    detail = readDetail(
      geometry.variants[variant],
      `${geometry.id}.${variant}`
    );
    // A definition inspection shows all records, including first-group-only
    // geometry. Placed structures retain their recovered selection groups.
    const records = [
      ...new Set(
        detail.groups.flatMap(g => [
          ...g.default,
          ...g.boxes.flatMap(b => b.records)
        ])
      )
    ].sort((a, b) => a - b);
    detail = {
      ...detail,
      groups: [
        { boxes: [], default: [] },
        { boxes: [], default: records }
      ]
    };
    const xs = detail.vertices.map(v => v[0]);
    const zs = detail.vertices.map(v => v[2]);
    focus = [
      32_768 + (Math.min(0, ...xs) + Math.max(0, ...xs)) / 2,
      100,
      32_768 + (Math.min(0, ...zs) + Math.max(0, ...zs)) / 2
    ];
    radius =
      Math.max(
        200,
        Math.max(0, ...xs) - Math.min(0, ...xs),
        Math.max(0, ...zs) - Math.min(0, ...zs)
      ) * 3;
    message +=
      ' All recovered detail records; placements retain their selection groups.';
  } else if (geometry?.family === 'ground') {
    const ground = readGround(
      geometry.variants[variant],
      `${geometry.id}.${variant}`
    );
    groundAddress = addressOf(geometry);
    groundTransform = Number(variant.slice('transform='.length));
    grounds.set(groundAddress, ground);
    radius = 50_000;
    focus = [32_768, 8000, 32_768];
    const context = Object.entries(c.surfaceCells)
      .flatMap(([group, rows]) =>
        rows.map(row => ({ group: Number(group), row }))
      )
      .find(
        ({ row }) =>
          row['ground'] === geometry.id &&
          Number(row['transform']) === groundTransform
      );
    if (context) {
      groundOrientation = Number(context.row['orientation']);
      roadPoints = new Map(
        Object.entries(record(context.row['roadPoints'], 'roadPoints')).map(
          ([key, value]) => [Number(key), Number(value)]
        )
      );
    }
    message +=
      ' Road joins use the first recovered matching workspace binding.';
  } else if (geometry?.family === 'island') {
    const points = list(
      geometry.variants[variant]!['vertices'],
      `${geometry.id}.vertices`
    ).map(v => ints(v, 'island vertex', 2));
    radius = Math.max(4, ...points.flatMap(p => p.map(Math.abs))) * 65_536;
    focus = [32_768, 65_536, 32_768];
    message =
      'Recovered island records · shared coast and horizon routines · authored inspection camera.';
  }
  if (placement && selection.floor === 0) {
    const row = c.surfaceCells[String(group)]?.find(
      r => r['cell'] === (repeat?.cell ?? placement.cell)
    );
    if (row) {
      const g = await store.get(String(row['ground']));
      groundAddress = addressOf(g);
      groundTransform = Number(row['transform']);
      groundOrientation = Number(row['orientation']);
      const ground = readGround(g.variants[Object.keys(g.variants)[0]!], g.id);
      grounds.set(groundAddress, ground);
      roadPoints = new Map(
        Object.entries(record(row['roadPoints'], 'roadPoints')).map(
          ([k, v]) => [Number(k), Number(v)]
        )
      );
    }
  }
  for (const ground of grounds.values()) {
    for (const item of ground.primitives) {
      if (item.kind === 'template') {
        const index = c.geometryIndex.find(
          g => g.family === 'model' && g.entries?.includes(item.model)
        );
        if (!index) {
          throw new Error(`ground template: missing model entry ${item.model}`);
        }
        const model = await store.get(index.id);
        models.set(
          item.model,
          modelForm(model, chosenVariant(model, ''), item.model, colours)
        );
      }
    }
  }
  if (
    body &&
    (geometry?.family === 'island' || (placement && selection.floor === 0))
  ) {
    const b = c.bodies.find(b => b.id === body)!;
    const selectedIsland =
      b.islands.find(i => i.geometry === geometry?.id) ??
      b.islands.find(i => i.group === group) ??
      b.islands[0]!;
    const centre =
      repeat?.bodyCell ?? placement?.bodyCell ?? selectedIsland.origin;
    coast = await catalogueCoast(store, b.id, centre);
  }
  const groundContext =
    geometry?.family === 'ground'
      ? Object.values(c.surfaceCells)
          .flat()
          .find(
            row =>
              row['ground'] === geometry.id &&
              Number(row['transform']) === groundTransform
          )
      : undefined;
  const cellNumber = placement
    ? (repeat?.cell ?? placement.cell)
    : Number(groundContext?.['cell'] ?? 0);
  const cell: DionCell = {
    alias: null,
    cell: cellNumber,
    detail: 0,
    ground: {
      address: groundAddress,
      index: groundOrientation,
      transform: groundTransforms[groundTransform]!
    },
    key: placement?.key ?? host?.key ?? 0,
    keyBase:
      placement && placement.key > 0 && placement.key <= 30
        ? placement.key / 2 + 29
        : 0,
    origin,
    palette,
    provenance: emptyProvenance,
    roadPoints,
    scale,
    slot: 0,
    structure: 0,
    tokenSet:
      placement && placement.key >= 160 ? (placement.key - 160) / 2 : null,
    x: cellNumber & 15,
    z: cellNumber >> 4
  };
  const tokens = new Map<number, readonly number[]>();
  for (const [code, item] of support.tokens) {
    tokens.set(code, item.bindings?.[cell.tokenSet ?? -1] ?? item.default);
  }
  if (binding) {
    const label = structureSlot!.floors
      .find(f => f.floor === selection.floor)!
      .label.charCodeAt(0);
    tokens.set(0x80, [label]);
    tokens.set(0x81, [label]);
  }
  if (object?.lettering) {
    tokens.set(
      Number.parseInt(object.lettering.token.slice(1), 16),
      object.lettering.text
    );
  }
  const world: DionFrameWorld = {
    ...(coast ? { coast } : {}),
    blinkPhase: new Map(),
    cells: noGeometry && !placement ? [] : [cell],
    cellSpacing: 30,
    details: new Map([[0, detail]]),
    drawList: {
      fixed: [
        0,
        ...residents.filter(r => r.association === 0).map(r => r.slot)
      ],
      templateTop: 255
    },
    drawPriority: support.priority,
    eyeHeight: 0,
    floorOffset: baseY,
    framePalette: {
      ...environment,
      ...(coast && body ? { land: support.bodies.get(body)!.land } : {}),
      fixed: support.fixed,
      horizonRow: 68,
      template: support.template
    },
    glyphs: support.glyphs,
    grounds,
    lettering: { bindings89: [], bindings9D: [], signScript: [], tokens },
    metisGroup: group,
    modelColours: colours,
    models,
    opening: {
      cell: cellNumber,
      eye: focus,
      frameCounter: 0,
      groupOrigin: [-(cellNumber & 15), -(cellNumber >> 4)],
      heading: 0,
      pitch: 0,
      region: 1,
      roll: 0
    },
    palettes: support.palettes,
    residents: residents.map(resident => ({ ...resident, cell: cellNumber })),
    rotationTable: support.rotation,
    sky: {
      clipRow: 68,
      colours: [],
      latitude: 0,
      phase: 0,
      rate: 944,
      stars: [],
      stepX: 0,
      sunAngle: 0
    },
    structures: new Map([[0, new Map([[scale.join(','), structure]])]]),
    structureY: baseY
  };
  if (selection.region > structure.regions.length) {
    throw new Error(
      `${selection.id}: region ${selection.region} is not in this structure`
    );
  }
  const state = openingFrameState(world);
  const planAt: Preview['planAt'] = pose => {
    const capturedTokens =
      pose.floorLabel === undefined
        ? tokens
        : new Map(tokens)
            .set(0x80, [pose.floorLabel])
            .set(0x81, [pose.floorLabel]);
    const capturedWorld = {
      ...world,
      ...(pose.structureEyeY === undefined
        ? {}
        : { floorOffset: pose.eye[1] - pose.structureEyeY }),
      lettering: { ...world.lettering, tokens: capturedTokens }
    };
    const result = planDionFrame(capturedWorld, { ...state, ...pose });
    return noGeometry && !placement
      ? { ...result, stats: { ...result.stats, gaps: [] } }
      : result;
  };
  return {
    message,
    plan(heading = 128, distance = 1, region = selection.region) {
      const angle = (heading * Math.PI * 2) / 1024;
      const eye: Vec3 = [
        focus[0] + Math.sin(angle) * radius * distance,
        focus[1],
        focus[2] + Math.cos(angle) * radius * distance
      ];
      const local = [eye[0] - origin[0], eye[2] - origin[1]];
      const inferred =
        structure.regions.findIndex(
          r =>
            local[0]! > r.bounds.x[0] &&
            local[0]! <= r.bounds.x[1] &&
            local[1]! > r.bounds.z[0] &&
            local[1]! <= r.bounds.z[1]
        ) + 1;
      const frameState: DionFrameState = {
        ...state,
        eye,
        heading,
        region: region || inferred || 1
      };
      return planAt(frameState);
    },
    planAt,
    regions: structure.regions.length,
    residents: visibleResidents,
    variant,
    variants: geometry ? Object.keys(geometry.variants) : []
  };
};
