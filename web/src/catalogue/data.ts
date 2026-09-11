export type Point = readonly [number, number, number];
export type Kind = 'object' | 'structure' | 'interior' | 'ground';
export type Recovery = 'decoded' | 'partial' | 'unresolved';
export interface Primitive {
  readonly colour: string;
  readonly doubleSided?: boolean;
  readonly sourceColour: number;
  readonly sourceIndex?: number;
  readonly vertices: readonly number[];
}
export interface Mesh {
  readonly displayCode?: string;
  readonly faces: readonly Primitive[];
  readonly labelAnchor?: Point;
  readonly lines: readonly Primitive[];
  readonly vertices: readonly Point[];
}
export interface Model {
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
  readonly reason: string;
  readonly relatedModels: readonly string[];
  readonly slots: readonly number[];
  readonly sourceAddress: number;
  readonly status: Recovery;
  readonly variants: readonly {
    readonly doorState?: 'open' | 'closed';
    readonly id: string;
    readonly inspectionAngle?: readonly [number, number];
    readonly mesh: Mesh;
    readonly name: string;
    readonly view?: 'exterior' | 'combined';
  }[];
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
export interface Catalogue {
  readonly bodies: readonly { readonly id: string; readonly name: string }[];
  readonly coverage: {
    readonly complete: boolean;
    readonly notes: readonly string[];
  };
  readonly instances: readonly Instance[];
  readonly models: readonly Model[];
  readonly places: readonly Place[];
  readonly schemaVersion: 5;
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

const mesh = (value: unknown): Mesh => {
  const record = object(value);
  const vertices = list(record['vertices']).map(point);
  if (vertices.length === 0 || vertices.length > 65_536) {
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
    vertices
  };
};

export const parseCatalogue = (value: unknown): Catalogue => {
  const r = object(value);
  if (r['schemaVersion'] !== 5) {
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
              doorState: choice(v['doorState'], ['open', 'closed']),
              view: choice(v['view'], ['exterior', 'combined'])
            };
      return {
        ...door,
        id: string(v['id']),
        ...(v['inspectionAngle'] === undefined
          ? {}
          : { inspectionAngle: angle(v['inspectionAngle']) }),
        mesh: mesh(v['mesh']),
        name: string(v['name'])
      };
    });
    unique(variants);
    const status = choice(m['status'], ['decoded', 'partial', 'unresolved']);
    const reason = string(m['reason']);
    if (status === 'decoded' && variants.length === 0) {
      fail('decoded model has no geometry');
    }
    if (status !== 'decoded' && !reason.trim()) {
      fail('unresolved model needs an explanation');
    }
    return {
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
      reason,
      relatedModels: strings(m['relatedModels']),
      slots: list(m['slots']).map(integer),
      sourceAddress: integer(m['sourceAddress']),
      status,
      variants
    };
  });
  const modelIds = unique(models);
  for (const model of models) {
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
    const kind = choice(t['kind'], ['object', 'structure', 'interior', 'ground']);
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
  return {
    bodies,
    coverage: {
      complete: coverage['complete'] as boolean,
      notes: strings(coverage['notes'])
    },
    instances,
    models,
    places,
    schemaVersion: 5,
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
        `${model.name} ${model.id} ${model.slots.join(' ')}`
          .toLowerCase()
          .includes(word)
      )
  );
};
