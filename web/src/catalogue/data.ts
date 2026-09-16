export type Point = readonly [number, number, number];
export const KINDS = ['object', 'structure', 'interior', 'ground'] as const;
export type Kind = (typeof KINDS)[number];
export type Recovery = 'decoded' | 'partial' | 'unresolved';
/// The vocabulary of a multi-variant model; the Eris presentation document names one pair.
export const DOOR_STATES = ['closed', 'open'] as const;
export type DoorState = (typeof DOOR_STATES)[number];
export const STRUCTURE_VIEWS = ['combined', 'exterior'] as const;
export type StructureView = (typeof STRUCTURE_VIEWS)[number];
export interface Primitive {
  readonly colour: string;
  readonly doubleSided?: boolean;
  /** Scene point slots this ground primitive joins, placed or not. */
  readonly sceneSlots?: readonly number[];
  readonly sourceColour: number;
  readonly sourceIndex?: number;
  readonly vertices: readonly number[];
}
export interface Mesh {
  readonly displayCode?: string;
  readonly faces: readonly Primitive[];
  readonly labelAnchor?: Point;
  readonly lines: readonly Primitive[];
  /** Source primitive records this detail holds, drawn or not. */
  readonly recordCount?: number;
  /** Records that name a shared vertex slot this list never fills. */
  readonly unreferencedRecords?: readonly number[];
  readonly vertices: readonly Point[];
}
export const RECORD_CLASSES = [
  'geometry',
  'alias',
  'empty',
  'null',
  'procedural'
] as const;
export type RecordClass = (typeof RECORD_CLASSES)[number];
export interface Model {
  readonly conditions: readonly string[];
  readonly detailSelection?: readonly DetailGroup[];
  readonly evidence: readonly {
    readonly claim: string;
    readonly confidence: 'verified' | 'observed' | 'partial' | 'unresolved';
    readonly source: string;
  }[];
  readonly id: string;
  readonly kind: Kind;
  readonly linkedInstances: readonly string[];
  readonly name: string;
  readonly nameStatus: 'verified' | 'candidate' | 'unknown';
  readonly omissions: readonly string[];
  readonly reason: string;
  readonly recordClass: RecordClass;
  readonly relatedModels: readonly string[];
  /** Background colours the frame loop installs for a cell, not wall colours. */
  readonly sceneColours?: readonly {
    readonly colour?: string;
    readonly sourceColour: number;
  }[];
  readonly slots: readonly number[];
  readonly sourceAddress: number;
  readonly status: Recovery;
  readonly structureSelection?: StructureSelection;
  readonly variants: readonly {
    readonly doorState?: DoorState;
    readonly id: string;
    readonly inspectionAngle?: readonly [number, number];
    readonly mesh: Mesh;
    readonly name: string;
    readonly view?: StructureView;
    readonly walkMesh?: Mesh;
  }[];
}
export type Bounds = readonly (readonly [number, number])[];
export interface DetailGroup {
  readonly boxes: readonly {
    readonly bounds: Bounds;
    readonly records: readonly number[];
  }[];
  readonly default: readonly number[];
}
export const REGION_GATES = ['none', 'attachmentLatch', 'passage'] as const;
export type RegionGate = (typeof REGION_GATES)[number];
export interface AttachmentConstructor {
  readonly leafCount: 1 | 2;
  readonly motionAxis: 'x' | 'z';
  readonly movingSide?: 'high' | 'low';
}
export interface EntranceAttachment {
  readonly constructor: AttachmentConstructor;
  readonly controlWord: number;
  /** Low nybble of an $F0 control: the key index the cell's base offsets. */
  readonly keyIndex?: number;
  readonly mesh: Mesh;
  readonly proximityBox: {
    readonly x: readonly [number, number];
    readonly z: readonly [number, number];
  };
  readonly slot: number;
}
export interface StructureSelection {
  readonly attachments: readonly EntranceAttachment[];
  readonly detailModel: string;
  readonly detailVariant: string;
  readonly liveSelector?: boolean;
  readonly plan: Mesh;
  readonly regions: readonly {
    readonly bounds: Bounds;
    readonly flags: number;
    readonly gate: RegionGate;
    readonly insetAxis?: 'x' | 'z';
    readonly queue: readonly (
      | { readonly index: number; readonly kind: 'face' }
      | { readonly kind: 'attachment'; readonly slot: number }
      | {
          readonly index: number;
          readonly kind: 'attachmentFace';
          readonly slot: number;
        }
    )[];
  }[];
  readonly scale: readonly [number, number];
}
export interface Instance {
  readonly association: {
    readonly body: string;
    readonly cell: number;
    readonly insertionGroupSelector: number;
    readonly insertions: readonly {
      readonly insertionKey: number;
      readonly regionSelector: number;
    }[];
    readonly levelSelector: number;
    readonly structureGroupSelector: number;
  } | null;
  readonly id: string;
  readonly location: {
    readonly body: string;
    readonly coordinateSystem: string;
    readonly heading: number | null;
    readonly place: string | null;
    readonly position: Point;
  } | null;
  readonly model: string;
  readonly name: string;
  readonly placement: {
    readonly coordinateSystem: string;
    readonly heading: number | null;
    readonly parent: string;
    readonly position: Point;
  } | null;
  readonly reason: string;
  readonly sourceAddress: number;
}
export interface Place {
  readonly body: string | null;
  readonly id: string;
  readonly instances: readonly string[];
  readonly name: string;
}
export interface CoverageTable {
  readonly address: number;
  readonly aliases: number;
  readonly decoded: number;
  readonly empty: number;
  readonly extentEvidence: string;
  readonly kind: Kind;
  readonly nullRecords: number;
  readonly partial: number;
  readonly slots: number;
  readonly unique: number;
  readonly unresolved: number;
}
export interface Catalogue {
  readonly bodies: readonly { readonly id: string; readonly name: string }[];
  readonly coverage: {
    readonly census: {
      readonly decoded: number;
      readonly partial: number;
      readonly unique: number;
      readonly unresolved: number;
    };
    readonly classifications: Readonly<Record<string, number>>;
    readonly complete: boolean;
    readonly diskLoad: readonly {
      readonly finding: string;
      readonly path: string;
    }[];
    readonly notes: readonly string[];
    readonly tables: readonly CoverageTable[];
    readonly unexplored: readonly string[];
  };
  readonly instances: readonly Instance[];
  readonly models: readonly Model[];
  readonly places: readonly Place[];
  readonly schemaVersion: 9;
  readonly source: {
    readonly authority: string;
    readonly evidence: string;
    readonly programSha256: string;
    readonly ramSha256: string;
    readonly run: string;
  };
  readonly tables: readonly {
    readonly address: number;
    readonly entries: readonly string[];
    readonly entryCount: number;
    readonly extentEvidence: string;
    readonly kind: Kind;
  }[];
}

const fail = (message: string): never => {
  throw new Error(`Invalid Damocles catalogue: ${message}`);
};
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('expected a record');
  }
  return value as Record<string, unknown>;
};
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : fail('expected an array');
const string = (value: unknown): string =>
  typeof value === 'string' ? value : fail('expected text');
const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail('expected a finite number');
const integer = (value: unknown): number => {
  const n = number(value);
  return Number.isSafeInteger(n) && n >= 0
    ? n
    : fail('expected a nonnegative integer');
};
const byte = (value: unknown): number => {
  const n = integer(value);
  return n <= 0xff ? n : fail('expected a byte');
};
const strings = (value: unknown) => list(value).map(string);
const point = (value: unknown): Point => {
  const p = list(value).map(number);
  if (p.length !== 3) {
    return fail('expected three coordinates');
  }
  return [p[0]!, p[1]!, p[2]!];
};
const angle = (value: unknown): readonly [number, number] => {
  const values = list(value).map(number);
  if (values.length !== 2) {
    return fail('expected yaw and pitch');
  }
  return [values[0]!, values[1]!];
};
const choice = <T extends string>(value: unknown, choices: readonly T[]): T =>
  choices.includes(value as T)
    ? (value as T)
    : fail(`expected ${choices.join('/')}`);
const unique = <T extends { readonly id: string }>(
  values: readonly T[]
): Set<string> => {
  const ids = new Set<string>();
  for (const value of values) {
    if (!value.id || ids.has(value.id)) {
      fail(`duplicate or empty identity ${value.id}`);
    }
    ids.add(value.id);
  }
  return ids;
};
const reference = (ids: ReadonlySet<string>, id: string, kind: string) => {
  if (!ids.has(id)) {
    fail(`missing ${kind} ${id}`);
  }
};

const mesh = (value: unknown, allowEmpty = false): Mesh => {
  const record = object(value);
  const vertices = list(record['vertices']).map(point);
  if ((!allowEmpty && vertices.length === 0) || vertices.length > 65_536) {
    fail('invalid vertex count');
  }
  const primitives = (value: unknown, minimum: number) =>
    list(value).map(item => {
      const p = object(item);
      const refs = list(p['vertices']).map(integer);
      if (
        refs.length < minimum ||
        refs.some(index => index >= vertices.length)
      ) {
        fail('invalid vertex reference');
      }
      const colour = string(p['colour']);
      if (!/^#[\da-f]{6}$/i.test(colour)) {
        fail('invalid colour');
      }
      if (
        p['doubleSided'] !== undefined &&
        typeof p['doubleSided'] !== 'boolean'
      ) {
        fail('invalid wall sidedness');
      }
      return {
        ...(p['doubleSided'] === true ? { doubleSided: true } : {}),
        colour,
        sourceColour: integer(p['sourceColour']),
        ...(p['sceneSlots'] === undefined
          ? {}
          : { sceneSlots: list(p['sceneSlots']).map(integer) }),
        ...(p['sourceIndex'] === undefined
          ? {}
          : { sourceIndex: integer(p['sourceIndex']) }),
        vertices: refs
      };
    });
  const displayCode =
    record['displayCode'] === undefined
      ? undefined
      : string(record['displayCode']);
  const labelAnchor =
    record['labelAnchor'] === undefined
      ? undefined
      : point(record['labelAnchor']);
  if ((displayCode === undefined) !== (labelAnchor === undefined)) {
    fail('key display code and anchor must appear together');
  }
  if (displayCode !== undefined && !/^[\u0020-\u007e]{2}$/.test(displayCode)) {
    fail('invalid key display code');
  }
  return {
    ...(displayCode === undefined ? {} : { displayCode }),
    faces: primitives(record['faces'], 3),
    ...(labelAnchor === undefined ? {} : { labelAnchor }),
    lines: primitives(record['lines'], 2),
    ...(record['recordCount'] === undefined
      ? {}
      : { recordCount: integer(record['recordCount']) }),
    ...(record['unreferencedRecords'] === undefined
      ? {}
      : {
          unreferencedRecords: list(record['unreferencedRecords']).map(integer)
        }),
    vertices
  };
};

const fields = (value: unknown, allowed: readonly string[]) => {
  const r = object(value);
  if (Object.keys(r).some(key => !allowed.includes(key))) {
    fail('unknown selector field');
  }
  return r;
};
const bounds = (value: unknown, axes: number): Bounds => {
  const result = list(value).map(pair => {
    const p = list(pair).map(number);
    if (
      p.length !== 2 ||
      p.some(n => !Number.isSafeInteger(n)) ||
      p[0]! >= p[1]!
    ) {
      fail('invalid selector bounds');
    }
    return [p[0]!, p[1]!] as const;
  });
  if (result.length !== axes) {
    fail('invalid selector axes');
  }
  return result;
};
const detailSelection = (value: unknown): readonly DetailGroup[] => {
  const groups = list(value).map(value => {
    const g = fields(value, ['boxes', 'default']);
    return {
      boxes: list(g['boxes']).map(value => {
        const b = fields(value, ['bounds', 'records']);
        return {
          bounds: bounds(b['bounds'], 3),
          records: list(b['records']).map(integer)
        };
      }),
      default: list(g['default']).map(integer)
    };
  });
  if (groups.length !== 2) {
    fail('expected two detail groups');
  }
  return groups;
};
const structureSelection = (value: unknown): StructureSelection => {
  const s = fields(value, [
    'plan',
    'attachments',
    'scale',
    'detailModel',
    'detailVariant',
    'regions',
    'liveSelector'
  ]);
  const plan = mesh(s['plan'], true);
  const scale = list(s['scale']).map(number);
  if (
    scale.length !== 2 ||
    scale.some(n => !Number.isInteger(n) || n === 0 || n < -128 || n > 127)
  ) {
    fail('invalid selector scale');
  }
  const sources = new Set(plan.faces.map(face => face.sourceIndex));
  if (sources.has(undefined) || sources.size !== plan.faces.length) {
    fail('invalid plan source indices');
  }
  const attachments = list(s['attachments']).map(value => {
    const a = fields(value, [
      'constructor',
      'controlWord',
      'keyIndex',
      'mesh',
      'proximityBox',
      'slot'
    ]);
    const c = fields(a['constructor'], [
      'leafCount',
      'motionAxis',
      'movingSide'
    ]);
    const leafCount = integer(c['leafCount']);
    const motionAxis = choice(c['motionAxis'], ['x', 'z'] as const);
    if (leafCount !== 1 && leafCount !== 2) {
      fail('invalid attachment leaf count');
    }
    const movingSide =
      c['movingSide'] === undefined
        ? undefined
        : choice(c['movingSide'], ['high', 'low'] as const);
    if (
      (leafCount === 1 && movingSide === undefined) ||
      (leafCount === 2 && movingSide !== undefined)
    ) {
      fail('invalid attachment moving side');
    }
    const controlWord = integer(a['controlWord']);
    const slot = integer(a['slot']);
    const authored = controlWord & 0xff_00;
    const latch = controlWord & 0xff;
    const controls = [0x40_00, 0x41_00, 0x42_00, 0x80_00, 0x81_00, 0x82_00];
    if (
      !controls.includes(authored) ||
      (latch !== 0 && latch !== 0xf0) ||
      slot === 0 ||
      slot > 0x03_fc ||
      slot % 4
    ) {
      fail('invalid attachment control or slot');
    }
    if (
      leafCount !== ((controlWord & 0x02_00) === 0 ? 1 : 2) ||
      motionAxis !== ((controlWord & 0x80_00) === 0 ? 'x' : 'z') ||
      (leafCount === 1 &&
        movingSide !== ((controlWord & 0x01_00) === 0 ? 'high' : 'low'))
    ) {
      fail('attachment constructor does not match control word');
    }
    const keyIndex =
      a['keyIndex'] === undefined ? undefined : integer(a['keyIndex']);
    // A key index exists exactly when the control carries the $F0 low byte.
    if (
      (keyIndex === undefined) !== (latch === 0) ||
      (keyIndex !== undefined && keyIndex !== (controlWord & 0x0f))
    ) {
      fail('invalid attachment key index');
    }
    const box = fields(a['proximityBox'], ['x', 'z']);
    return {
      constructor: {
        leafCount: leafCount as 1 | 2,
        motionAxis,
        ...(movingSide === undefined ? {} : { movingSide })
      },
      controlWord,
      ...(keyIndex === undefined ? {} : { keyIndex }),
      mesh: mesh(a['mesh']),
      proximityBox: {
        x: bounds([box['x']], 1)[0]!,
        z: bounds([box['z']], 1)[0]!
      },
      slot
    };
  });
  const bySlot = new Map(
    attachments.map(attachment => [attachment.slot, attachment])
  );
  if (bySlot.size !== attachments.length) {
    fail('duplicate attachment slot');
  }
  const regions = list(s['regions']).map(value => {
    const r = fields(value, ['flags', 'bounds', 'queue', 'gate', 'insetAxis']);
    const flags = integer(r['flags']);
    if (flags === 0 || flags > 65_535) {
      fail('invalid region flags');
    }
    const gate = choice(r['gate'], REGION_GATES);
    const slot = flags & 0x03_fc;
    const attachment = bySlot.get(slot);
    const insetAxis =
      r['insetAxis'] === undefined
        ? undefined
        : choice(r['insetAxis'], ['x', 'z'] as const);
    if (
      (gate === 'none' && slot !== 0) ||
      (gate === 'passage' && slot !== 0x02_00) ||
      (gate === 'attachmentLatch' &&
        (attachment === undefined ||
          insetAxis !== attachment.constructor.motionAxis)) ||
      (gate !== 'attachmentLatch' && insetAxis !== undefined)
    ) {
      fail('region gate does not match flags and attachment');
    }
    return {
      bounds: bounds(r['bounds'], 2),
      flags,
      gate,
      ...(insetAxis === undefined ? {} : { insetAxis }),
      queue: list(r['queue']).map(value => {
        const entry = object(value);
        if (entry['kind'] === 'attachment') {
          const item = fields(entry, ['kind', 'slot']);
          const itemSlot = integer(item['slot']);
          if (!bySlot.has(itemSlot)) {
            fail('missing region attachment');
          }
          return { kind: 'attachment', slot: itemSlot } as const;
        }
        if (entry['kind'] === 'attachmentFace') {
          const item = fields(entry, ['kind', 'slot', 'index']);
          const itemSlot = integer(item['slot']);
          const owner =
            bySlot.get(itemSlot) ?? fail('missing region attachment');
          const face = integer(item['index']);
          if (face < 0 || face >= owner.mesh.faces.length) {
            fail('invalid attachment face reference');
          }
          return {
            index: face,
            kind: 'attachmentFace',
            slot: itemSlot
          } as const;
        }
        fields(entry, ['kind', 'index']);
        if (entry['kind'] !== 'face') {
          fail('unknown region queue tag');
        }
        const index = integer(entry['index']);
        if (!sources.has(index)) {
          fail('invalid plan face reference');
        }
        return { index, kind: 'face' } as const;
      })
    };
  });
  if (regions.length === 0) {
    fail('empty region selector');
  }
  if (
    s['liveSelector'] !== undefined &&
    typeof s['liveSelector'] !== 'boolean'
  ) {
    fail('invalid live selector flag');
  }
  return {
    attachments,
    detailModel: string(s['detailModel']),
    detailVariant: string(s['detailVariant']),
    ...(s['liveSelector'] === true ? { liveSelector: true } : {}),
    plan,
    regions,
    scale: [scale[0]!, scale[1]!]
  };
};

export const parseCatalogue = (value: unknown): Catalogue => {
  const r = object(value);
  if (r['schemaVersion'] !== 9) {
    fail('unsupported schema version');
  }
  const src = object(r['source']);
  const source = {
    authority: string(src['authority']),
    evidence: string(src['evidence']),
    programSha256: string(src['programSha256']),
    ramSha256: string(src['ramSha256']),
    run: string(src['run'])
  };
  if (
    ![source.ramSha256, source.programSha256].every(hash =>
      /^[\da-f]{64}$/.test(hash)
    )
  ) {
    fail('invalid source hash');
  }
  const models = list(r['models']).map((item): Model => {
    const m = object(item);
    const variants = list(m['variants']).map(value => {
      const v = object(value);
      const door =
        v['doorState'] === undefined
          ? {}
          : {
              doorState: choice(v['doorState'], DOOR_STATES),
              view: choice(v['view'], STRUCTURE_VIEWS)
            };
      return {
        ...door,
        id: string(v['id']),
        ...(v['inspectionAngle'] === undefined
          ? {}
          : { inspectionAngle: angle(v['inspectionAngle']) }),
        mesh: mesh(v['mesh']),
        ...(v['walkMesh'] === undefined
          ? {}
          : { walkMesh: mesh(v['walkMesh']) }),
        name: string(v['name'])
      };
    });
    unique(variants);
    const status = choice(m['status'], ['decoded', 'partial', 'unresolved']);
    const reason = string(m['reason']);
    const recordClass =
      m['recordClass'] === undefined
        ? 'geometry'
        : choice(m['recordClass'], RECORD_CLASSES);
    // A decoded model may show nothing only when its class says the record
    // holds nothing by construction: an authored empty, the NULL record, or a
    // record the game draws with a native routine.
    if (
      status === 'decoded' &&
      variants.length === 0 &&
      recordClass !== 'empty' &&
      recordClass !== 'null' &&
      recordClass !== 'procedural'
    ) {
      fail('decoded model has no geometry');
    }
    if (status !== 'decoded' && !reason.trim()) {
      fail('unresolved model needs an explanation');
    }
    return {
      conditions: m['conditions'] === undefined ? [] : strings(m['conditions']),
      ...(m['sceneColours'] === undefined
        ? {}
        : {
            sceneColours: list(m['sceneColours']).map(value => {
              const entry = object(value);
              return {
                ...(entry['colour'] === undefined
                  ? {}
                  : { colour: string(entry['colour']) }),
                sourceColour: integer(entry['sourceColour'])
              };
            })
          }),
      evidence: list(m['evidence']).map(value => {
        const item = object(value);
        return {
          claim: string(item['claim']),
          confidence: choice(item['confidence'], [
            'verified',
            'observed',
            'partial',
            'unresolved'
          ]),
          source: string(item['source'])
        };
      }),
      id: string(m['id']),
      kind: choice(m['kind'], ['object', 'structure', 'interior', 'ground']),
      linkedInstances: strings(m['linkedInstances']),
      name: string(m['name']),
      nameStatus: choice(m['nameStatus'], ['verified', 'candidate', 'unknown']),
      omissions: m['omissions'] === undefined ? [] : strings(m['omissions']),
      reason,
      recordClass,
      relatedModels: strings(m['relatedModels']),
      slots: list(m['slots']).map(integer),
      sourceAddress: integer(m['sourceAddress']),
      status,
      variants,
      ...(m['structureSelection'] === undefined
        ? {}
        : { structureSelection: structureSelection(m['structureSelection']) }),
      ...(m['detailSelection'] === undefined
        ? {}
        : { detailSelection: detailSelection(m['detailSelection']) })
    };
  });
  const modelIds = unique(models);
  for (const model of models) {
    if (model.detailSelection !== undefined) {
      if (model.kind !== 'interior') {
        fail('detail selector requires a detail model');
      }
      for (const group of model.detailSelection) {
        for (const records of [
          group.default,
          ...group.boxes.map(box => box.records)
        ]) {
          if (
            model.variants.length === 0 ||
            model.variants.some(v =>
              records.some(i => i < 0 || i >= (v.mesh.recordCount ?? 0))
            )
          ) {
            fail('invalid detail record reference');
          }
        }
      }
    }
    const selection = model.structureSelection;
    if (selection !== undefined) {
      if (model.kind !== 'structure') {
        fail('structure selector requires a structure model');
      }
      const detail = models.find(m => m.id === selection.detailModel);
      if (
        detail?.detailSelection === undefined ||
        !detail.variants.some(v => v.id === selection.detailVariant)
      ) {
        fail('invalid selector detail binding');
      }
    }
    for (const id of model.relatedModels) {
      reference(modelIds, id, 'related model');
    }
  }
  const bodies = list(r['bodies']).map(item => {
    const b = object(item);
    return { id: string(b['id']), name: string(b['name']) };
  });
  const bodyIds = unique(bodies);
  const places = list(r['places']).map((item): Place => {
    const p = object(item);
    const body = p['body'] === null ? null : string(p['body']);
    if (body !== null) {
      reference(bodyIds, body, 'body');
    }
    return {
      body,
      id: string(p['id']),
      instances: strings(p['instances']),
      name: string(p['name'])
    };
  });
  const placeIds = unique(places);
  const instances = list(r['instances']).map((item): Instance => {
    const i = object(item);
    const model = string(i['model']);
    reference(modelIds, model, 'model');
    let location: Instance['location'] = null;
    if (i['location'] !== null) {
      const l = object(i['location']);
      const body = string(l['body']);
      reference(bodyIds, body, 'body');
      const place = l['place'] === null ? null : string(l['place']);
      if (place !== null) {
        reference(placeIds, place, 'place');
      }
      location = {
        body,
        coordinateSystem: string(l['coordinateSystem']),
        heading: l['heading'] === null ? null : number(l['heading']),
        place,
        position: point(l['position'])
      };
    }
    let placement: Instance['placement'] = null;
    if (i['placement'] !== null) {
      const p = object(i['placement']);
      placement = {
        coordinateSystem: string(p['coordinateSystem']),
        heading: p['heading'] === null ? null : number(p['heading']),
        parent: string(p['parent']),
        position: point(p['position'])
      };
    }
    let association: Instance['association'] = null;
    if (i['association'] !== null) {
      const a = object(i['association']);
      const body = string(a['body']);
      reference(bodyIds, body, 'association body');
      const insertions = list(a['insertions']).map(value => {
        const insertion = object(value);
        return {
          insertionKey: byte(insertion['insertionKey']),
          regionSelector: byte(insertion['regionSelector'])
        };
      });
      if (
        insertions.some(item => item.regionSelector === 0) ||
        new Set(insertions.map(item => item.regionSelector)).size !==
          insertions.length
      ) {
        fail('invalid or duplicate association region selector');
      }
      association = {
        body,
        cell: byte(a['cell']),
        insertionGroupSelector: byte(a['insertionGroupSelector']),
        insertions,
        levelSelector: byte(a['levelSelector']),
        structureGroupSelector: byte(a['structureGroupSelector'])
      };
    }
    return {
      association,
      id: string(i['id']),
      location,
      model,
      name: string(i['name']),
      placement,
      reason: string(i['reason']),
      sourceAddress: integer(i['sourceAddress'])
    };
  });
  const instanceIds = unique(instances);
  for (const model of models) {
    for (const id of model.linkedInstances) {
      reference(instanceIds, id, 'linked instance');
    }
  }
  for (const instance of instances) {
    if (instance.placement !== null) {
      reference(instanceIds, instance.placement.parent, 'parent instance');
      if (instance.placement.parent === instance.id) {
        fail('instance cannot contain itself');
      }
    }
  }
  for (const place of places) {
    for (const id of place.instances) {
      reference(instanceIds, id, 'instance');
      const instance = instances.find(item => item.id === id)!;
      if (
        instance.location?.place !== place.id ||
        (place.body !== null && instance.location.body !== place.body)
      ) {
        fail('inconsistent place membership');
      }
    }
  }
  for (const instance of instances) {
    if (
      instance.location?.place &&
      !places
        .find(place => place.id === instance.location!.place)!
        .instances.includes(instance.id)
    ) {
      fail('instance absent from its place');
    }
  }
  const tables = list(r['tables']).map(item => {
    const t = object(item);
    const entries = strings(t['entries']);
    const entryCount = integer(t['entryCount']);
    if (entries.length !== entryCount) {
      fail('table entry count mismatch');
    }
    const kind = choice(t['kind'], KINDS);
    for (const id of entries) {
      reference(modelIds, id, 'table model');
      if (models.find(model => model.id === id)!.kind !== kind) {
        fail('table kind mismatch');
      }
    }
    return {
      address: integer(t['address']),
      entries,
      entryCount,
      extentEvidence: string(t['extentEvidence']),
      kind
    };
  });
  if (new Set(tables.map(table => table.kind)).size !== tables.length) {
    fail('duplicate table kind');
  }
  for (const model of models) {
    const table = tables.find(table => table.kind === model.kind);
    const slots =
      table?.entries.flatMap((id, index) => (id === model.id ? [index] : [])) ??
      [];
    if (
      slots.length !== model.slots.length ||
      slots.some((slot, index) => slot !== model.slots[index])
    ) {
      fail('model slot accounting mismatch');
    }
  }
  const covered = new Set(tables.flatMap(table => table.entries));
  for (const model of models) {
    if (!covered.has(model.id)) {
      fail('model missing from census');
    }
  }
  const coverage = object(r['coverage']);
  if (typeof coverage['complete'] !== 'boolean') {
    fail('invalid coverage status');
  }
  const counted = {
    decoded: models.filter(model => model.status === 'decoded').length,
    partial: models.filter(model => model.status === 'partial').length,
    unique: models.length,
    unresolved: models.filter(model => model.status === 'unresolved').length
  };
  const census =
    coverage['census'] === undefined
      ? counted
      : {
          decoded: integer(object(coverage['census'])['decoded']),
          partial: integer(object(coverage['census'])['partial']),
          unique: integer(object(coverage['census'])['unique']),
          unresolved: integer(object(coverage['census'])['unresolved'])
        };
  if (
    census.unique !== counted.unique ||
    census.decoded !== counted.decoded ||
    census.partial !== counted.partial ||
    census.unresolved !== counted.unresolved
  ) {
    fail('coverage census does not match models');
  }
  const classifications: Record<string, number> =
    coverage['classifications'] === undefined
      ? {}
      : Object.fromEntries(
          Object.entries(object(coverage['classifications'])).map(
            ([key, value]) => [key, integer(value)]
          )
        );
  const coverageTables: CoverageTable[] =
    coverage['tables'] === undefined
      ? []
      : list(coverage['tables']).map(item => {
          const row = object(item);
          return {
            address: integer(row['address']),
            aliases: integer(row['aliases']),
            decoded: integer(row['decoded']),
            empty: integer(row['empty']),
            extentEvidence: string(row['extentEvidence']),
            kind: choice(row['kind'], KINDS),
            nullRecords: integer(row['nullRecords']),
            partial: integer(row['partial']),
            slots: integer(row['slots']),
            unique: integer(row['unique']),
            unresolved: integer(row['unresolved'])
          };
        });
  const diskLoad =
    coverage['diskLoad'] === undefined
      ? []
      : list(coverage['diskLoad']).map(item => {
          const row = object(item);
          return { finding: string(row['finding']), path: string(row['path']) };
        });
  return {
    bodies,
    coverage: {
      census,
      classifications,
      complete: coverage['complete'] as boolean,
      diskLoad,
      notes: strings(coverage['notes']),
      tables: coverageTables,
      unexplored:
        coverage['unexplored'] === undefined
          ? []
          : strings(coverage['unexplored'])
    },
    instances,
    models,
    places,
    schemaVersion: 9,
    source,
    tables
  };
};

export const selectModels = (
  data: Catalogue,
  query: string,
  kind: string,
  status: string
): readonly Model[] => {
  const words = query.toLowerCase().trim().split(/\s+/);
  return data.models.filter(
    model =>
      (!kind || model.kind === kind) &&
      (!status || model.status === status) &&
      words.every(word =>
        `${model.name} ${model.id} ${model.slots.join(' ')} ${model.recordClass}`
          .toLowerCase()
          .includes(word)
      )
  );
};
