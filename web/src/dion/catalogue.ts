import { sha256 } from '../hash/index.ts';
import { DocumentStore, atDocument } from '../payload/documentStore.ts';
import { DION_PROGRAM_SHA256 } from './documents.ts';
import {
  address,
  fail,
  int,
  ints,
  list,
  nullable,
  provenance,
  record,
  text
} from './read.ts';

export const cataloguePath = '/payload/dion/catalogue/catalogue.json';
const geometryRoot = '/payload/dion/catalogue/geometry';
type Row = Record<string, unknown>;
interface Source {
  readonly ledgerSha256: string;
  readonly openingRamSha256: string;
  readonly programSha256: string;
  readonly run: string;
  readonly title: 'dion';
}
interface GeometryIndex {
  readonly bodies: readonly string[];
  readonly dataVariants: readonly string[];
  readonly entries?: readonly number[];
  readonly family: string;
  readonly id: string;
  readonly record: string;
  readonly sha256: string;
  readonly state: 'recovered' | 'empty' | 'verified';
  readonly variants: readonly string[];
}
interface Island {
  readonly geometry: string;
  readonly group: number;
  readonly id: string;
  readonly landColour: number;
  readonly origin: readonly number[];
}
interface Body {
  readonly geometry: readonly string[];
  readonly id: string;
  readonly islands: readonly Island[];
  readonly name: string;
  readonly offset: number;
}
interface Placement {
  readonly body: string;
  readonly bodyCell: readonly number[];
  readonly cell: number;
  readonly group: number;
  readonly id: string;
  readonly key: number;
  readonly origin: readonly number[];
  readonly slot: number;
  readonly state: string;
  readonly structure: string;
}
interface Floor {
  readonly floor: number;
  readonly geometry: string;
  readonly geometrySlot: number;
  readonly label: string;
}
interface FloorBinding {
  readonly baseY: number;
  readonly floor: number;
  readonly geometry: string;
  readonly palette: number;
  readonly variant: string;
}
interface Structure {
  readonly censusFloors?: readonly (readonly number[])[];
  readonly detail: string;
  readonly detailIndex: number;
  readonly floorBindings: readonly FloorBinding[];
  readonly floors: readonly Floor[];
  readonly id: string;
  readonly palette: number;
  readonly pitch: number | null;
  readonly scale: readonly [number, number];
  readonly slot: number;
}
interface CatalogueObject {
  readonly body: string | null;
  readonly bodyCell: readonly number[] | null;
  readonly floor: number | null;
  readonly forms?: readonly { readonly geometry: string | null }[];
  readonly geometry: string | null;
  readonly host: {
    readonly cell?: number;
    readonly field?: string;
    readonly placement?: string;
  } | null;
  readonly id: string;
  readonly indoor?: {
    readonly association: number;
    readonly cell: number;
    readonly group: number;
    readonly localPosition: readonly number[];
    readonly yaw: number;
  };
  readonly lettering?: {
    readonly text: readonly number[];
    readonly token: string;
  };
  readonly name: string | null;
  readonly position: readonly number[] | null;
  readonly residence: string;
  readonly slot: number;
}
/// The original reference fields and recovery metadata are retained alongside these accessors.
/// The reader validates rather than normalizes, so no geometry or provenance is discarded.
export interface DionCatalogue {
  readonly areas: readonly {
    readonly area: string | null;
    readonly authoredBindings: number;
    readonly disposition: string;
    readonly group: number;
    readonly id: string;
    readonly initialBindings: number;
    readonly islands: readonly string[];
  }[];
  readonly bodies: readonly Body[];
  readonly constructions: {
    readonly binding: string;
    readonly states: readonly {
      readonly id: string;
      readonly slot: number | null;
    }[];
  };
  readonly field: {
    readonly origin: readonly number[];
    readonly period: number;
    readonly physicalCount: null;
    readonly seed: string;
  };
  readonly gaps: readonly { readonly id: string; readonly reason?: string }[];
  readonly geometryIndex: readonly GeometryIndex[];
  readonly objects: readonly CatalogueObject[];
  readonly placements: readonly Placement[];
  readonly places: readonly {
    readonly cell: number;
    readonly group: number;
    readonly id: string;
    readonly name: string;
    readonly placement: string | null;
  }[];
  readonly source: Source;
  readonly structures: readonly Structure[];
  readonly surfaceCells: Readonly<Record<string, readonly Row[]>>;
}
export interface CatalogueGeometry {
  readonly family: string;
  readonly id: string;
  readonly name?: string;
  readonly provenance: readonly unknown[];
  readonly record: string;
  readonly variants: Readonly<Record<string, Row>>;
}

const signed16 = (value: number): number =>
  ((value & 65_535) ^ 32_768) - 32_768;
const sha = (value: unknown, path: string): string => {
  const result = text(value, path);
  return /^[\da-f]{64}$/.test(result)
    ? result
    : fail(`${path} is not a SHA-256`);
};
const strings = (value: unknown, path: string): string[] =>
  list(value, path).map((v, i) => text(v, `${path}[${i}]`));
const oneOf = (
  value: unknown,
  path: string,
  choices: readonly string[]
): string => {
  const result = text(value, path);
  return choices.includes(result)
    ? result
    : fail(`${path} has unsupported value ${result}`);
};
const same = (a: unknown, b: unknown, path: string): void => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail(`${path} disagrees with its binding`);
  }
};
const header = (value: unknown, path: string, kind: string): Row => {
  const row = record(value, path);
  same(row['schemaVersion'], 1, `${path}.schemaVersion`);
  same(row['kind'], kind, `${path}.kind`);
  const source = record(row['source'], `${path}.source`);
  same(source['title'], 'dion', `${path}.source.title`);
  same(
    sha(source['programSha256'], `${path}.source.programSha256`),
    DION_PROGRAM_SHA256,
    `${path}.source.programSha256`
  );
  sha(source['openingRamSha256'], `${path}.source.openingRamSha256`);
  sha(source['ledgerSha256'], `${path}.source.ledgerSha256`);
  text(source['run'], `${path}.source.run`);
  return row;
};
const rows = (value: unknown, path: string): Row[] =>
  list(value, path).map((v, i) => record(v, `${path}[${i}]`));
const unique = (
  items: readonly Row[],
  path: string,
  key = 'id'
): Map<string | number, Row> => {
  const result = new Map<string | number, Row>();
  for (const [i, row] of items.entries()) {
    const id =
      key === 'id'
        ? text(row[key], `${path}[${i}].${key}`)
        : int(row[key], `${path}[${i}].${key}`, 0);
    if (result.has(id)) {
      fail(`${path}[${i}].${key}: duplicate identity ${id}`);
    }
    result.set(id, row);
  }
  return result;
};
const ref = (
  value: unknown,
  targets: ReadonlyMap<string | number, unknown>,
  path: string
): Row => {
  const key = typeof value === 'number' ? value : text(value, path);
  if (!targets.has(key)) {
    fail(`${path}: missing reference ${key}`);
  }
  return targets.get(key) as Row;
};
const references = (
  value: unknown,
  targets: ReadonlyMap<string | number, unknown>,
  path: string
): string[] => {
  const ids = strings(value, path);
  if (new Set(ids).size !== ids.length) {
    fail(`${path}: duplicate reference`);
  }
  for (const id of ids) {
    ref(id, targets, path);
  }
  return ids;
};
const family = (geometry: Row, expected: string, path: string): void =>
  same(geometry['family'], expected, path);
const geometryId = (value: unknown, path: string): string => {
  const id = text(value, path);
  return /^(model|structure|detail|ground|island)-[\da-f]{6}$/.test(id)
    ? id
    : fail(`${path}: invalid geometry identity`);
};
const sourceRanges = (value: unknown, path: string): void => {
  list(value, path).forEach((v, i) => provenance(v, `${path}[${i}]`));
};

/// Strict title-local admission, including reconciliation of the census and every cross-link.
export const readCatalogueDocument = (value: unknown): DionCatalogue => {
  const path = cataloguePath;
  const raw = header(value, path, 'dion-catalogue');
  const section = (key: string): Row[] => rows(raw[key], `${path}.${key}`);
  const bodies = section('bodies');
  const areas = section('areas');
  const placements = section('placements');
  const structures = section('structures');
  const objects = section('objects');
  const places = section('places');
  const geometry = section('geometryIndex');
  const geometryById = unique(geometry, `${path}.geometryIndex`);
  const bodiesById = unique(bodies, `${path}.bodies`);
  const areasById = unique(areas, `${path}.areas`);
  const placementsById = unique(placements, `${path}.placements`);
  unique(structures, `${path}.structures`);
  const slots = unique(structures, `${path}.structures`, 'slot');
  unique(objects, `${path}.objects`);
  unique(objects, `${path}.objects`, 'slot');
  unique(places, `${path}.places`);
  const coverage = record(raw['coverage'], `${path}.coverage`);
  for (const [name, count] of Object.entries({
    authoredBindings: 795,
    bodies: 31,
    groups: 57,
    initialBindings: 794,
    objectSlots: 246,
    places: 172,
    selectedStructureSlots: 198
  })) {
    same(coverage[name], count, `${path}.coverage.${name}`);
  }
  for (const [name, items, count] of [
    ['bodies', bodies, 31],
    ['areas', areas, 57],
    ['placements', placements, 795],
    ['structures', structures, 198],
    ['objects', objects, 246],
    ['places', places, 172],
    ['geometryIndex', geometry, 529]
  ] as const) {
    same(items.length, count, `${path}.${name}.length`);
  }
  for (const g of geometry) {
    const at = `${path}.geometryIndex.${g['id']}`;
    const id = geometryId(g['id'], `${at}.id`);
    const f = oneOf(g['family'], `${at}.family`, [
      'model',
      'structure',
      'detail',
      'ground',
      'island'
    ]);
    same(
      id,
      `${f}-${address(g['record'], `${at}.record`).toString(16).padStart(6, '0')}`,
      `${at}.record`
    );
    sha(g['sha256'], `${at}.sha256`);
    oneOf(g['state'], `${at}.state`, ['recovered', 'empty', 'verified']);
    strings(g['variants'], `${at}.variants`);
    strings(g['dataVariants'], `${at}.dataVariants`);
    references(g['bodies'], bodiesById, `${at}.bodies`);
  }
  const allIslands = bodies.flatMap(b =>
    rows(b['islands'], `${path}.bodies.${b['id']}.islands`)
  );
  const islandsById = unique(allIslands, `${path}.islands`);
  same(
    allIslands.length,
    coverage['islandPlacements'],
    `${path}.coverage.islandPlacements`
  );
  const groupIslands = new Map<number, { body: Row; island: Row }[]>();
  const neededByBody = new Map<string, Set<string>>();
  for (const b of bodies) {
    const at = `${path}.bodies.${b['id']}`;
    text(b['name'], `${at}.name`);
    const offset = int(b['offset'], `${at}.offset`, 0, 120);
    same(b['id'], `body-${String(offset / 4).padStart(2, '0')}`, `${at}.id`);
    const needed = new Set<string>();
    neededByBody.set(text(b['id'], `${at}.id`), needed);
    for (const island of rows(b['islands'], `${at}.islands`)) {
      const group = int(island['group'], `${at}.islands.group`, 0, 56);
      ints(island['origin'], `${at}.islands.origin`, 2, -32_768, 32_767);
      family(
        ref(island['geometry'], geometryById, `${at}.islands.geometry`),
        'island',
        `${at}.islands.geometry`
      );
      needed.add(text(island['geometry'], `${at}.islands.geometry`));
      groupIslands.set(group, [
        ...(groupIslands.get(group) ?? []),
        { body: b, island }
      ]);
    }
    references(b['geometry'], geometryById, `${at}.geometry`);
  }
  const addNeeded = (
    body: unknown,
    id: unknown,
    at: string,
    expected?: string
  ): Row => {
    const g = ref(id, geometryById, at);
    if (expected !== undefined) {
      family(g, expected, at);
    }
    neededByBody.get(text(body, `${at}.body`))!.add(text(id, at));
    return g;
  };
  for (const [index, a] of areas.entries()) {
    const at = `${path}.areas[${index}]`;
    same(a['group'], index, `${at}.group`);
    same(a['id'], `area-${String(index).padStart(2, '0')}`, `${at}.id`);
    oneOf(a['disposition'], `${at}.disposition`, [
      'settlement',
      'bare-islands',
      'outline-only',
      'label-only',
      'unused',
      'void-storage',
      'repeating-field'
    ]);
    nullable(a['area'], v => text(v, `${at}.area`));
    references(a['islands'], islandsById, `${at}.islands`);
    same(
      [...(a['islands'] as string[])].sort(),
      (groupIslands.get(index) ?? []).map(i => i.island['id']).sort(),
      `${at}.islands`
    );
    const own = placements.filter(p => p['group'] === index);
    same(a['authoredBindings'], own.length, `${at}.authoredBindings`);
    same(
      a['initialBindings'],
      own.filter(p => p['state'] !== 'initially-absent').length,
      `${at}.initialBindings`
    );
  }
  const spacing = int(
    record(raw['placementRule'], `${path}.placementRule`)['spacing'],
    `${path}.placementRule.spacing`,
    1
  );
  const cells = new Set<string>();
  for (const p of placements) {
    const at = `${path}.placements.${p['id']}`;
    const group = int(p['group'], `${at}.group`, 0, 56);
    const cell = int(p['cell'], `${at}.cell`, 0, 255);
    if (cells.has(`${group}:${cell}`)) {
      fail(`${at}: duplicate group/cell`);
    }
    cells.add(`${group}:${cell}`);
    const site = groupIslands.get(group) ?? fail(`${at}: missing Body island`);
    if (site.length !== 1) {
      fail(`${at}: ambiguous or missing Body island`);
    }
    same(p['body'], site[0]!.body['id'], `${at}.body`);
    const origin = ints(site[0]!.island['origin'], `${at}.island.origin`, 2);
    same(
      p['bodyCell'],
      [
        (((origin[0]! + (cell & 15)) % 4096) + 4096) % 4096,
        (((origin[1]! + (cell >> 4)) % 4096) + 4096) % 4096
      ],
      `${at}.bodyCell`
    );
    const dx = int(p['dx'], `${at}.dx`, -128, 127);
    const dz = int(p['dz'], `${at}.dz`, -128, 127);
    same(
      p['origin'],
      [(32_768 + dx * spacing) & 65_535, (32_768 + dz * spacing) & 65_535],
      `${at}.origin`
    );
    int(p['key'], `${at}.key`, 0, 255);
    address(p['source'], `${at}.source`);
    same(
      p['id'],
      `placement-${String(group).padStart(2, '0')}-${cell.toString(16).padStart(2, '0')}`,
      `${at}.id`
    );
    const s = ref(p['slot'], slots, `${at}.structure`);
    same(p['structure'], s['id'], `${at}.structure`);
    oneOf(p['state'], `${at}.state`, [
      'present',
      'initially-absent',
      'storage',
      'field-seed'
    ]);
    addNeeded(p['body'], s['detail'], `${at}.detail`, 'detail');
    for (const f of rows(s['floors'], `${at}.floors`)) {
      addNeeded(p['body'], f['geometry'], `${at}.floor.geometry`, 'structure');
    }
  }
  same(
    placements.filter(p => p['state'] !== 'initially-absent').length,
    coverage['initialBindings'],
    `${path}.coverage.initialBindings`
  );
  same(
    [...new Set(placements.map(p => p['slot']))].sort(),
    [...slots.keys()].sort(),
    `${path}.structures.selectedSlots`
  );
  const rawFloorSlots = new Set<number>();
  const authoredFloorSlots = new Set<number>();
  let floorCount = 0;
  for (const s of structures) {
    const at = `${path}.structures.${s['id']}`;
    same(s['id'], `slot-${String(s['slot']).padStart(3, '0')}`, `${at}.id`);
    ints(s['scale'], `${at}.scale`, 2, -128, 127);
    int(s['palette'], `${at}.palette`, 0, 255);
    nullable(s['pitch'], v => int(v, `${at}.pitch`, 0));
    address(s['record'], `${at}.record`);
    if (typeof s['alias'] !== 'boolean') {
      fail(`${at}.alias is not boolean`);
    }
    family(
      ref(s['detail'], geometryById, `${at}.detail`),
      'detail',
      `${at}.detail`
    );
    const floors = rows(s['floors'], `${at}.floors`);
    const bindings = rows(s['floorBindings'], `${at}.floorBindings`);
    unique(floors, `${at}.floors`, 'floor');
    unique(bindings, `${at}.floorBindings`, 'floor');
    same(bindings.length, floors.length, `${at}.floorBindings.length`);
    same(floors[0]?.['floor'], 0, `${at}.floor[0]`);
    floorCount += floors.length;
    for (const f of floors) {
      const level = int(f['floor'], `${at}.floor`, 0, 10);
      const binding =
        bindings.find(b => b['floor'] === level) ??
        fail(`${at}: missing Floor binding`);
      const g = ref(f['geometry'], geometryById, `${at}.floor.geometry`);
      family(g, 'structure', `${at}.floor.geometry`);
      authoredFloorSlots.add(
        int(f['geometrySlot'], `${at}.floor.geometrySlot`, 1, 255)
      );
      same(
        f['label'],
        level === 0 ? 'G' : level === 10 ? 'B' : String(level),
        `${at}.floor.label`
      );
      same(binding['geometry'], f['geometry'], `${at}.floorBinding.geometry`);
      if (
        !strings(g['variants'], `${at}.variants`).includes(
          text(binding['variant'], `${at}.floorBinding.variant`)
        )
      ) {
        fail(`${at}.floorBinding.variant: missing variant`);
      }
      same(
        binding['baseY'],
        level * ((s['pitch'] as number | null) ?? 0),
        `${at}.floorBinding.baseY`
      );
      int(binding['palette'], `${at}.floorBinding.palette`, 0, 255);
      sourceRanges(binding['provenance'], `${at}.floorBinding.provenance`);
    }
    if (s['censusFloors'] === undefined) {
      for (const f of floors) {
        rawFloorSlots.add(f['geometrySlot'] as number);
      }
    } else {
      for (const f of list(s['censusFloors'], `${at}.censusFloors`)) {
        const entry = list(f, `${at}.censusFloors.entry`);
        rawFloorSlots.add(
          int(entry[1], `${at}.censusFloors.geometrySlot`, 1, 255)
        );
      }
      provenance(s['nonFloorBytes'], `${at}.nonFloorBytes`);
    }
  }
  same(
    authoredFloorSlots.size,
    coverage['authoredFloorGeometrySlots'],
    `${path}.coverage.authoredFloorGeometrySlots`
  );
  same(floorCount, coverage['floorBindings'], `${path}.coverage.floorBindings`);
  same(
    rawFloorSlots.size,
    coverage['floorGeometrySlots'],
    `${path}.coverage.floorGeometrySlots`
  );
  const residenceCounts: Record<string, number> = {
    carried: 0,
    'out-of-world': 0,
    structure: 0,
    surface: 0
  };
  for (const [index, o] of objects.entries()) {
    const at = `${path}.objects.${o['id']}`;
    same(o['slot'], index + 1, `${at}.slot`);
    same(o['id'], `object-${String(index + 1).padStart(3, '0')}`, `${at}.id`);
    nullable(o['name'], v => text(v, `${at}.name`));
    const residence = oneOf(
      o['residence'],
      `${at}.residence`,
      Object.keys(residenceCounts)
    );
    residenceCounts[residence]!++;
    const placed = residence === 'structure' || residence === 'surface';
    if (placed) {
      ref(o['body'], bodiesById, `${at}.body`);
      const position = ints(o['position'], `${at}.position`, 3);
      same(
        o['bodyCell'],
        [
          ((position[0]! >> 16) + 4096) % 4096,
          ((position[2]! >> 16) + 4096) % 4096
        ],
        `${at}.bodyCell`
      );
    } else {
      for (const k of ['body', 'bodyCell', 'position', 'floor', 'host']) {
        same(o[k], null, `${at}.${k}`);
      }
    }
    if (o['geometry'] === null) {
      same(o['disposition'], 'null-model', `${at}.disposition`);
    } else {
      const g = ref(o['geometry'], geometryById, `${at}.geometry`);
      family(g, 'model', `${at}.geometry`);
      if (placed) {
        addNeeded(o['body'], o['geometry'], `${at}.geometry`);
      }
    }
    for (const f of o['forms'] === undefined
      ? []
      : rows(o['forms'], `${at}.forms`)) {
      int(f['entry'], `${at}.forms.entry`, 0);
      oneOf(f['role'], `${at}.forms.role`, [
        'model',
        'driver-head',
        'driver-head-profile'
      ]);
      strings(f['writers'], `${at}.forms.writers`);
      if (f['geometry'] !== null) {
        family(
          ref(f['geometry'], geometryById, `${at}.forms.geometry`),
          'model',
          `${at}.forms.geometry`
        );
        if (placed) {
          addNeeded(o['body'], f['geometry'], `${at}.forms.geometry`);
        }
      }
    }
    if (residence !== 'structure') {
      continue;
    }
    const level = int(o['floor'], `${at}.floor`, 0, 10);
    const indoor = record(o['indoor'], `${at}.indoor`);
    const host = record(o['host'], `${at}.host`);
    let slot: Row;
    if (host['field'] === 'midas') {
      int(host['cell'], `${at}.host.cell`, 0, 255);
      slot = ref(68, slots, `${at}.host.structure`);
      same(o['body'], 'body-02', `${at}.host.body`);
      const bodyCell = ints(o['bodyCell'], `${at}.bodyCell`, 2);
      same(
        host['cell'],
        ((bodyCell[0]! - 1729) & 15) + 16 * ((bodyCell[1]! - 938) & 15),
        `${at}.host.cell`
      );
      same(indoor['group'], 56, `${at}.indoor.group`);
      same(indoor['cell'], host['cell'], `${at}.indoor.cell`);
    } else {
      const p = ref(host['placement'], placementsById, `${at}.host.placement`);
      same(p['body'], o['body'], `${at}.host.body`);
      same(p['bodyCell'], o['bodyCell'], `${at}.host.bodyCell`);
      same(p['origin'], indoor['origin'], `${at}.indoor.origin`);
      slot = ref(p['slot'], slots, `${at}.host.structure`);
      same(indoor['group'], p['group'], `${at}.indoor.group`);
      same(indoor['cell'], p['cell'], `${at}.indoor.cell`);
    }
    same(indoor['structureSlot'], slot['slot'], `${at}.indoor.structureSlot`);
    const binding =
      rows(slot['floorBindings'], `${at}.host.floorBindings`).find(
        f => f['floor'] === level
      ) ?? fail(`${at}.floor: host has no Floor ${level}`);
    for (const k of ['geometry', 'variant', 'baseY']) {
      same(indoor[k], binding[k], `${at}.indoor.${k}`);
    }
    const position = ints(o['position'], `${at}.position`, 3);
    const origin = ints(indoor['origin'], `${at}.indoor.origin`, 2);
    same(
      indoor['localPosition'],
      [
        signed16(position[0]! - origin[0]!),
        position[1]! - (binding['baseY'] as number),
        signed16(position[2]! - origin[1]!)
      ],
      `${at}.indoor.localPosition`
    );
    int(indoor['association'], `${at}.indoor.association`, 1);
    for (const k of ['hooks', 'dormantHooks']) {
      list(indoor[k], `${at}.indoor.${k}`).forEach(v =>
        ints(v, `${at}.indoor.${k}`, 2, 0)
      );
    }
    sourceRanges(indoor['provenance'], `${at}.indoor.provenance`);
    same(indoor['reachability'], 'unverified', `${at}.indoor.reachability`);
  }
  const expectedResidence = record(
    coverage['residence'],
    `${path}.coverage.residence`
  );
  for (const [r, count] of Object.entries(residenceCounts)) {
    same(count, expectedResidence[r], `${path}.coverage.residence.${r}`);
  }
  same(
    residenceCounts['structure'],
    coverage['indoorResidents'],
    `${path}.coverage.indoorResidents`
  );
  const carried = ints(raw['carriedStack'], `${path}.carriedStack`);
  same(
    [...carried].sort(),
    objects
      .filter(o => o['residence'] === 'carried')
      .map(o => o['slot'])
      .sort(),
    `${path}.carriedStack`
  );
  for (const p of places) {
    const at = `${path}.places.${p['id']}`;
    const area = ref(p['area'], areasById, `${at}.area`);
    same(p['group'], area['group'], `${at}.group`);
    same(
      p['id'],
      `place-${String(p['group']).padStart(2, '0')}-${int(p['cell'], `${at}.cell`, 0, 255).toString(16).padStart(2, '0')}`,
      `${at}.id`
    );
    text(p['name'], `${at}.name`);
    int(p['cell'], `${at}.cell`, 0, 255);
    if (p['placement'] !== null) {
      const placement = ref(p['placement'], placementsById, `${at}.placement`);
      same(p['cell'], placement['cell'], `${at}.cell`);
      same(p['group'], placement['group'], `${at}.group`);
    }
  }
  const field = record(raw['field'], `${path}.field`);
  same(field['period'], 16, `${path}.field.period`);
  same(field['physicalCount'], null, `${path}.field.physicalCount`);
  same(field['origin'], [1729, 938], `${path}.field.origin`);
  same(
    ref(field['seed'], placementsById, `${path}.field.seed`)['state'],
    'field-seed',
    `${path}.field.seed.state`
  );
  const construction = record(raw['constructions'], `${path}.constructions`);
  const logos = ref(
    construction['binding'],
    placementsById,
    `${path}.constructions.binding`
  );
  same(
    logos['state'],
    'initially-absent',
    `${path}.constructions.binding.state`
  );
  const states = rows(construction['states'], `${path}.constructions.states`);
  same(
    states.map(s => [s['id'], s['slot']]),
    [
      ['initial', null],
      ['constructed', logos['slot']]
    ],
    `${path}.constructions.states`
  );
  const surfaceCells = record(raw['surfaceCells'], `${path}.surfaceCells`);
  const templateModels = new Map<number, string>();
  for (const g of geometry) {
    if (g['family'] === 'model' && g['entries'] !== undefined) {
      for (const entry of ints(g['entries'], `${path}.geometryIndex.entries`)) {
        templateModels.set(entry, text(g['id'], `${path}.geometryIndex.id`));
      }
    }
  }
  let surfaceCount = 0;
  for (const [group, value] of Object.entries(surfaceCells)) {
    const at = `${path}.surfaceCells.${group}`;
    ref(`area-${group.padStart(2, '0')}`, areasById, `${at}.area`);
    const cells = rows(value, at);
    same(cells.length, 256, `${at}.length`);
    surfaceCount += cells.length;
    for (const [index, c] of cells.entries()) {
      same(c['cell'], index, `${at}.cell`);
      int(c['transform'], `${at}.transform`, 0, 7);
      for (const k of ['ground', 'selected']) {
        family(ref(c[k], geometryById, `${at}.${k}`), 'ground', `${at}.${k}`);
      }
      const models = ints(c['templates'], `${at}.templates`).map(
        e =>
          templateModels.get(e) ??
          fail(`${at}.templates: missing model entry ${e}`)
      );
      for (const site of groupIslands.get(Number(group)) ?? []) {
        for (const id of [c['ground'], c['selected'], ...models]) {
          addNeeded(site.body['id'], id, `${at}.geometry`);
        }
      }
    }
  }
  same(surfaceCount, coverage['surfaceCells'], `${path}.coverage.surfaceCells`);
  for (const b of bodies) {
    same(
      [...neededByBody.get(b['id'] as string)!].sort(),
      [...(b['geometry'] as string[])].sort(),
      `${path}.bodies.${b['id']}.geometry`
    );
  }
  for (const g of geometry) {
    same(
      strings(g['bodies'], `${path}.geometryIndex.bodies`),
      bodies
        .filter(b =>
          neededByBody.get(b['id'] as string)!.has(g['id'] as string)
        )
        .map(b => b['id']),
      `${path}.geometryIndex.${g['id']}.bodies`
    );
  }
  rows(raw['gaps'], `${path}.gaps`);
  rows(raw['resolvedGaps'], `${path}.resolvedGaps`);
  record(raw['completion'], `${path}.completion`);
  record(raw['lettering'], `${path}.lettering`);
  rows(raw['rebindings'], `${path}.rebindings`);
  rows(raw['services'], `${path}.services`);
  return raw as unknown as DionCatalogue;
};

/// Canonical JSON matches the recovery ledger's Python digest (including escaped Unicode).
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${canonical(k)}:${canonical(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value).replaceAll(
    /[\u007f-\uffff]/g,
    c => String.raw`\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
};

export const readGeometryFile = async (
  value: unknown,
  catalogue: DionCatalogue,
  id: string
): Promise<CatalogueGeometry> => {
  const path = `${geometryRoot}/${id}.json`;
  const expected =
    catalogue.geometryIndex.find(g => g.id === id) ??
    fail(`${path}: missing geometry index entry`);
  const raw = header(value, path, 'dion-catalogue-geometry');
  const source = record(raw['source'], `${path}.source`);
  for (const [key, value] of Object.entries(catalogue.source)) {
    same(source[key], value, `${path}.source.${key}`);
  }
  const g = record(raw['geometry'], `${path}.geometry`);
  for (const k of ['id', 'family', 'record', 'sha256'] as const) {
    same(g[k], expected[k], `${path}.geometry.${k}`);
  }
  const variants = record(g['variants'], `${path}.geometry.variants`);
  same(
    Object.keys(variants).sort(),
    [...expected.dataVariants].sort(),
    `${path}.geometry.variants`
  );
  for (const [key, value] of Object.entries(variants)) {
    const at = `${path}.geometry.variants.${key}`;
    const v = record(value, at);
    if (v['provenance'] !== undefined) {
      provenance(v['provenance'], `${at}.provenance`);
    } else {
      sourceRanges(g['provenance'], `${path}.geometry.provenance`);
    }
    const coordinates = g['family'] === 'structure' ? 'plan' : 'vertices';
    list(v[coordinates], `${at}.${coordinates}`).forEach((v, i) =>
      ints(
        v,
        `${at}.${coordinates}[${i}]`,
        g['family'] === 'model' || g['family'] === 'detail' ? 3 : 2
      )
    );
  }
  const content = Object.fromEntries(
    Object.entries(g).filter(([k]) => k !== 'sha256')
  );
  const digest = await sha256(canonical(content));
  same(digest, expected.sha256, `${path}.geometry.sha256`);
  return g as unknown as CatalogueGeometry;
};

/// The same caching, retry and prefetch machinery as Damocles, with Dion's admission policy.
export class GeometryStore extends DocumentStore<CatalogueGeometry> {
  constructor(
    readonly catalogue: DionCatalogue,
    read: (path: string) => Promise<unknown>
  ) {
    super(async id => {
      if (!catalogue.geometryIndex.some(g => g.id === id)) {
        fail(`${geometryRoot}: ${id} is not in the geometry index`);
      }
      const path = `${geometryRoot}/${geometryId(id, 'geometry id')}.json`;
      return atDocument(path, async () =>
        readGeometryFile(await read(path), catalogue, id)
      );
    });
  }
}

/// Read the shared document before requesting any geometry. Both Catalogues accept the
/// same injected JSON transport, so the browser and whole-export checks use one loader.
export const loadDionCatalogue = async (
  read: (path: string) => Promise<unknown>
): Promise<GeometryStore> => {
  const catalogue = await atDocument(cataloguePath, async () =>
    readCatalogueDocument(await read(cataloguePath))
  );
  return new GeometryStore(catalogue, read);
};
