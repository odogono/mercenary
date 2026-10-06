import type { CraftArithmetic } from '../craft/pass.ts';
import type { PayloadDocument } from '../shell/title.ts';
import type { CatalogueGeometry } from './catalogue.ts';
import { readDionContent, type DionContent } from './content.ts';
import { DION_DOCUMENTS, DION_PROGRAM_SHA256 } from './documents.ts';
import { readDionHead, type DionHead } from './head.ts';
import { modelForm, playableModel } from './modelForms.ts';
import {
  address,
  fail,
  int,
  ints,
  list,
  provenance,
  record,
  text
} from './read.ts';
import {
  tourcraftFrameWorld,
  tourcraftOpeningFrameState
} from './tourcraftFrame.ts';
import { TOURCRAFT_OWNER_WIDTHS } from './tourcraftOwnerWidths.ts';
import {
  readDetail,
  readDionOpening,
  readGlyph,
  readGround,
  readStructure,
  type DionModel
} from './world.ts';

type Row = Record<string, unknown>;
export const TOURCRAFT_ROOT = '/payload/dion/tourcraft';
export const TOURCRAFT_MANIFEST = `${TOURCRAFT_ROOT}/manifest.json`;
const PROMOTION = `${TOURCRAFT_ROOT}/promotion.json`;
const PRESENTATION = [
  'craft',
  'gameplay',
  'head',
  'programmes',
  'support',
  'system',
  'taxi'
] as const;
const CAPTURES: Readonly<Record<string, string>> = {
  'catalogue-immutable':
    'cd697c802472a319fcd8fd5dd7193ad870cf4ff0a7f37cd6fda51893dd899fe4',
  'catalogue-workspace-group-23':
    '7cade2a2c63b95925a4ed03f283b2d3b1fd9d1248b7c24f5cbd0ed1708f4d6e2',
  'catalogue-workspace-group-3':
    'eb324b2b354f70076b5dfe98d14ef09f700e99d323826aeeabb2e400e2dcbde0',
  'gameplay-opening':
    '71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170'
};
const TOS = '154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5';

export interface PromotedGeometry {
  readonly family: string;
  readonly id: string;
  readonly name?: string;
  readonly provenance?: readonly unknown[];
  readonly record: string;
  readonly variants: Readonly<Record<string, Row>>;
}
export interface PromotedPlacement {
  readonly body: string;
  readonly cell: number;
  readonly detail: string;
  readonly geometry: string;
  readonly group: number;
  readonly id: string;
  readonly key: number;
  readonly origin: readonly [number, number];
  readonly palette: number;
  readonly slot: number;
  readonly variant: string;
}
export interface PromotedCell {
  readonly cell: number;
  readonly ground: string;
  readonly group: number;
  readonly orientation: number;
  readonly roadPoints: Readonly<Record<string, number>>;
  readonly selected: string;
  readonly templates: readonly number[];
  readonly transform: number;
}
export interface TourcraftPromotion {
  readonly bodyPlacements: readonly {
    readonly id: string;
    readonly islands: readonly {
      readonly geometry: string;
      readonly group: number;
      readonly id: string;
      readonly landColour: number;
      readonly origin: readonly [number, number];
    }[];
    readonly offset: number;
  }[];
  readonly placements: readonly PromotedPlacement[];
  readonly raw: Row;
  readonly surfaceCells: readonly PromotedCell[];
}
export interface TourcraftBody {
  readonly centre: readonly [number, number, number];
  readonly colour: number;
  readonly encodedSize: number;
  readonly flags: readonly number[];
  readonly id: string;
  readonly name: string;
  readonly offset: number;
  readonly rate: number;
  readonly size: number;
  readonly skyDay: number;
  readonly skyNight: number;
}
export interface TourcraftSystem {
  readonly bodies: readonly TourcraftBody[];
  readonly drawLists: ReadonlyMap<number, readonly number[]>;
  readonly sine: readonly number[];
  readonly spacePalette: {
    readonly background: number;
    readonly fixed: ReadonlyMap<number, number>;
  };
  readonly spaceScan: readonly number[];
}
export interface TourcraftGameplay {
  readonly initial: Row & { readonly source: 'gameplay-opening' };
  readonly modelBindings: ReadonlyMap<number, string>;
  readonly models: ReadonlyMap<number, DionModel>;
  readonly raw: Row;
}
/// An admitted expanded payload, deliberately distinct from the I2 session's content.
/// I4 constructs its own mutable session from `gameplay.initial`, never `legacy`'s opening.
export interface TourcraftContent {
  readonly arithmetic: CraftArithmetic;
  readonly contentSha256: string;
  readonly craft: Row;
  readonly gameplay: TourcraftGameplay;
  readonly geometry: ReadonlyMap<string, PromotedGeometry>;
  readonly head: DionHead;
  readonly legacy: DionContent;
  readonly programmes: Row;
  readonly promotion: TourcraftPromotion;
  readonly support: Row;
  readonly system: TourcraftSystem;
}

const same = (actual: unknown, expected: unknown, at: string): void => {
  if (
    actual === undefined ||
    expected === undefined ||
    canonical(actual) !== canonical(expected)
  ) {
    fail(`${at}: disagrees with its admitted binding`);
  }
};
const sha = (v: unknown, at: string): string => {
  const s = text(v, at);
  return /^[\da-f]{64}$/.test(s) ? s : fail(`${at}: not a SHA-256`);
};
const rows = (v: unknown, at: string): Row[] =>
  list(v, at).map((v, i) => record(v, `${at}[${i}]`));
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
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
const digest = async (data: Uint8Array): Promise<string> => {
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return [...new Uint8Array(result)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const recordDigest = (v: unknown): Promise<string> =>
  digest(utf8(canonical(v)));

/// Cross-language golden encoding: domain, then u32be path length/path,
/// u64be exact UTF-8 document length/bytes for each path in the manifest's order.
/// The unhashed-digest manifest itself is the last document. No NUL ambiguity.
export const tourcraftContentIdentity = async (
  documents: readonly { readonly path: string; readonly text: string }[]
): Promise<string> => {
  const chunks = [utf8('dion-play-content-v1\u0000')];
  for (const d of documents) {
    const path = utf8(d.path);
    const bytes = utf8(d.text);
    const pathLength = new Uint8Array(4);
    new DataView(pathLength.buffer).setUint32(0, path.length);
    const length = new Uint8Array(8);
    new DataView(length.buffer).setBigUint64(0, BigInt(bytes.length));
    chunks.push(pathLength, path, length, bytes);
  }
  const data = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return digest(data);
};

const parse = (d: PayloadDocument, at: string): Row => {
  try {
    // Admit the actual served bytes. A transport's separately parsed value cannot
    // smuggle a different record past the hash check.
    return record(JSON.parse(d.text), at);
  } catch (error) {
    return fail(
      `${at}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};
const header = (v: Row, at: string, kind: string, source?: string): void => {
  same(v['kind'], kind, `${at}.kind`);
  same(v['schemaVersion'], 1, `${at}.schemaVersion`);
  if (source !== undefined) {
    same(v['source'], source, `${at}.source`);
  }
};
const sources = (v: unknown, at: string): Row => {
  const all = record(v, at);
  same(
    Object.keys(all).sort(),
    Object.keys(CAPTURES).sort(),
    `${at}.identities`
  );
  for (const [id, expected] of Object.entries(CAPTURES)) {
    const r = record(all[id], `${at}.${id}`);
    same(r['title'], 'dion', `${at}.${id}.title`);
    same(r['programSha256'], DION_PROGRAM_SHA256, `${at}.${id}.programSha256`);
    same(
      r[id === 'catalogue-immutable' ? 'openingRamSha256' : 'ramSha256'],
      expected,
      `${at}.${id}.ramSha256`
    );
    if (id === 'gameplay-opening') {
      same(r['tosSha256'], TOS, `${at}.${id}.tosSha256`);
      same(
        r['emulatorSha256'],
        '05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a',
        `${at}.${id}.emulatorSha256`
      );
      same(r['capturePc'], '$5A41A', `${at}.${id}.capturePc`);
    }
  }
  return all;
};
const unique = (
  values: readonly Row[],
  key: string,
  at: string
): Map<string, Row> => {
  const map = new Map<string, Row>();
  for (const r of values) {
    const id = String(r[key]);
    if (map.has(id)) {
      fail(`${at}.${key}: duplicate ${id}`);
    }
    map.set(id, r);
  }
  return map;
};
const selectedForm = (
  geometry: ReadonlyMap<string, PromotedGeometry>,
  id: unknown,
  form: unknown,
  at: string
): Row => {
  const g =
    geometry.get(text(id, `${at}.geometry`)) ??
    fail(`${at}.geometry: missing dependency ${id}`);
  return (
    g.variants[text(form, `${at}.variant`)] ??
    fail(`${at}.variant: missing dependency ${form}`)
  );
};

const readPromotion = (
  raw: Row,
  geometry: ReadonlyMap<string, PromotedGeometry>,
  support: Row
): TourcraftPromotion => {
  const placements = rows(raw['placements'], `${PROMOTION}.placements`);
  unique(placements, 'id', `${PROMOTION}.placements`);
  same(placements.length, 39, `${PROMOTION}.placements.length`);
  const structures = unique(
    rows(raw['structures'], `${PROMOTION}.structures`),
    'slot',
    `${PROMOTION}.structures`
  );
  same(structures.size, 18, `${PROMOTION}.structures.length`);
  for (const p of placements) {
    const at = `${PROMOTION}.placements.${p['id']}`;
    const slot = int(p['slot'], `${at}.slot`, 0, 255);
    const s =
      structures.get(String(slot)) ??
      fail(`${at}.slot: missing structure ${slot}`);
    same(p['floor'], 0, `${at}.floor`);
    int(p['cell'], `${at}.cell`, 0, 255);
    ints(p['origin'], `${at}.origin`, 2, 0, 65_535);
    same(p['geometry'], s['geometry'], `${at}.geometry`);
    same(p['variant'], s['variant'], `${at}.variant`);
    const structureGeometry =
      geometry.get(String(p['geometry'])) ??
      fail(`${at}.geometry: missing structure`);
    same(structureGeometry.family, 'structure', `${at}.geometry.family`);
    same(
      structureGeometry.record,
      s['resolvedRecord'],
      `${at}.geometry.record`
    );
    if (s['alias'] === false) {
      same(structureGeometry.record, s['record'], `${at}.structure.record`);
    }
    sha(s['sourceRecordSha256'], `${at}.structure.sourceRecordSha256`);
    same(p['detail'], s['detail'], `${at}.detail`);
    same(p['palette'], s['palette'], `${at}.palette`);
    same(
      p['variant'],
      `scale=${ints(s['scale'], `${at}.scale`, 2).join(',')}`,
      `${at}.variant`
    );
    const form = selectedForm(geometry, p['geometry'], p['variant'], at);
    readStructure(form, `${at}.structure`);
    readDetail(selectedForm(geometry, p['detail'], 'base', at), `${at}.detail`);
    const palette = record(support['palettes'], 'support.palettes')[
      String(p['palette'])
    ];
    if (palette === undefined) {
      fail(`${at}.palette: missing dependency`);
    }
  }
  const cells = rows(raw['surfaceCells'], `${PROMOTION}.surfaceCells`);
  same(cells.length, 512, `${PROMOTION}.surfaceCells.length`);
  const keys = new Set<string>();
  for (const c of cells) {
    const group = int(c['group'], 'surfaceCells.group', 0, 56);
    if (group !== 3 && group !== 23) {
      fail(`${PROMOTION}.surfaceCells.group: foreign workspace`);
    }
    const cell = int(c['cell'], 'surfaceCells.cell', 0, 255);
    const at = `${PROMOTION}.surfaceCells.${group}.${cell}`;
    if (keys.has(`${group}:${cell}`)) {
      fail(`${at}: duplicate cell`);
    }
    keys.add(`${group}:${cell}`);
    const transform = int(c['transform'], `${at}.transform`, 0, 7);
    int(c['orientation'], `${at}.orientation`, 0, 255);
    // Ground transform is applied by the existing planner; every selected and
    // actually drawn record must nevertheless be admitted before a session exists.
    for (const field of ['selected', 'ground']) {
      const id = text(c[field], `${at}.${field}`);
      const g =
        geometry.get(id) ?? fail(`${at}.${field}: missing dependency ${id}`);
      if (g.family !== 'ground' || !g.variants[`transform=${transform}`]) {
        fail(`${at}.${field}.transform: incompatible binding`);
      }
    }
    const road = record(c['roadPoints'], `${at}.roadPoints`);
    same(
      Object.keys(road).sort(),
      ['240', '244', '248', '252'],
      `${at}.roadPoints`
    );
    for (const [id, value] of Object.entries(road)) {
      int(value, `${at}.roadPoints.${id}`, 0, 255);
    }
    ints(c['templates'], `${at}.templates`, undefined, 0, 511);
  }
  const bodies = rows(raw['bodyPlacements'], `${PROMOTION}.bodyPlacements`);
  same(
    bodies.map(b => b['offset']),
    [60, 100],
    `${PROMOTION}.bodyPlacements.offset`
  );
  for (const [index, b] of bodies.entries()) {
    const islands = rows(b['islands'], `body.${b['id']}.islands`);
    same(islands.length, 1, `body.${b['id']}.islands.length`);
    same(
      islands[0]!['group'],
      index === 0 ? 3 : 23,
      `body.${b['id']}.islands.group`
    );
    for (const i of islands) {
      selectedForm(geometry, i['geometry'], 'base', `island.${i['id']}`);
      ints(i['origin'], `island.${i['id']}.origin`, 2, 0, 4095);
    }
  }
  const services = rows(raw['services'], `${PROMOTION}.services`);
  same(
    services.map(s => [s['group'], s['entry'], s['head'], s['route']]),
    [[3, 13, 279, '$66D2A']],
    `${PROMOTION}.services`
  );
  const scope = record(raw['scope'], `${PROMOTION}.scope`);
  same(scope['workspaceGroups'], [3, 23], `${PROMOTION}.scope.workspaceGroups`);
  return {
    bodyPlacements: bodies as unknown as TourcraftPromotion['bodyPlacements'],
    placements: placements as unknown as readonly PromotedPlacement[],
    raw,
    surfaceCells: cells as unknown as readonly PromotedCell[]
  };
};

const readSystem = (raw: Row): TourcraftSystem => {
  const bodies = rows(raw['bodies'], 'system.bodies');
  same(bodies.length, 31, 'system.bodies.length');
  for (const [i, b] of bodies.entries()) {
    same(b['offset'], i * 4, `system.bodies[${i}].offset`);
    text(b['id'], `system.bodies[${i}].id`);
    text(b['name'], `system.bodies[${i}].name`);
    ints(b['centre'], `system.bodies[${i}].centre`, 3);
    ints(b['flags'], `system.bodies[${i}].flags`, 4, 0, 255);
    for (const field of ['encodedSize', 'colour', 'rate']) {
      int(b[field], `system.bodies[${i}].${field}`, 0, 0xff_ff_ff_ff);
    }
    for (const field of ['skyDay', 'skyNight']) {
      int(b[field], `system.bodies[${i}].${field}`, 0, 0x7_77);
    }
    if (
      typeof b['size'] !== 'number' ||
      !Number.isFinite(b['size']) ||
      b['size'] < 0
    ) {
      fail(`system.bodies[${i}].size: invalid packed size`);
    }
  }
  unique(bodies, 'id', 'system.bodies');
  const sine = list(raw['sine'], 'system.sine');
  same(sine.length, 1024, 'system.sine.length');
  for (const [i, value] of sine.entries()) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Math.abs(value) > 1
    ) {
      fail(`system.sine[${i}]: invalid sine`);
    }
  }
  const drawLists = new Map<number, readonly number[]>();
  const rawLists = record(raw['drawLists'], 'system.drawLists');
  for (const [name, offset] of [
    ['metis', 60],
    ['tolosa', 100]
  ] as const) {
    const row = record(rawLists[name], `system.drawLists.${name}`);
    drawLists.set(
      offset,
      ints(
        row['bodyIndices'],
        `system.drawLists.${name}.bodyIndices`,
        undefined,
        0,
        29
      )
    );
  }
  const scan = record(raw['spaceScan'], 'system.spaceScan');
  const spaceScan = ints(
    scan['bodyIndices'],
    'system.spaceScan.bodyIndices',
    30,
    0,
    29
  );
  same(
    spaceScan,
    Array.from({ length: 30 }, (_, i) => 29 - i),
    'system.spaceScan.bodyIndices'
  );
  const palette = record(raw['spacePalette'], 'system.spacePalette');
  provenance(palette['provenance'], 'system.spacePalette.provenance');
  const background = int(
    palette['background'],
    'system.spacePalette.background',
    0,
    65_535
  );
  const fixed = new Map(
    Object.entries(record(palette['fixed'], 'system.spacePalette.fixed')).map(
      ([k, v]) => [
        int(Number(k), 'system.spacePalette.index', 0, 15),
        int(v, `system.spacePalette.fixed.${k}`, 0, 0x7_77)
      ]
    )
  );
  return {
    bodies: bodies as unknown as readonly TourcraftBody[],
    drawLists,
    sine: sine as number[],
    spacePalette: { background, fixed },
    spaceScan
  };
};

/// No lazy fetch can bypass identity or admission: this resolves and validates the
/// entire reviewed closure before returning any content to a Gameplay Session.
export const loadTourcraftContent = async (
  fetch: (path: string) => Promise<PayloadDocument>
): Promise<TourcraftContent> => {
  const manifestDocument = await fetch(TOURCRAFT_MANIFEST);
  const manifest = parse(manifestDocument, TOURCRAFT_MANIFEST);
  header(manifest, TOURCRAFT_MANIFEST, 'dion-play-manifest');
  same(manifest['title'], 'dion', `${TOURCRAFT_MANIFEST}.title`);
  same(manifest['destination'], 'metis', `${TOURCRAFT_MANIFEST}.destination`);
  same(
    manifest['programSha256'],
    DION_PROGRAM_SHA256,
    `${TOURCRAFT_MANIFEST}.programSha256`
  );
  same(
    manifest['mutableSource'],
    'gameplay-opening',
    `${TOURCRAFT_MANIFEST}.mutableSource`
  );
  const sourcePins = sources(
    manifest['sources'],
    `${TOURCRAFT_MANIFEST}.sources`
  );
  const entries = rows(
    manifest['playableDocuments'],
    `${TOURCRAFT_MANIFEST}.playableDocuments`
  );
  unique(entries, 'path', `${TOURCRAFT_MANIFEST}.playableDocuments`);
  const loaded = new Map<string, PayloadDocument>();
  await Promise.all(
    entries.map(async (entry, i) => {
      const path = text(
        entry['path'],
        `${TOURCRAFT_MANIFEST}.playableDocuments[${i}].path`
      );
      if (
        !/^\/payload\/dion\/tourcraft\/(?:[a-z]+|(?:geometry|presentation)\/[\da-z-]+)\.json$/.test(
          path
        ) ||
        path === TOURCRAFT_MANIFEST
      ) {
        fail(
          `${TOURCRAFT_MANIFEST}.playableDocuments[${i}].path: outside the bounded playable paths`
        );
      }
      const document = await fetch(path);
      same(
        await digest(utf8(document.text)),
        sha(entry['sha256'], `${path}.sha256`),
        `${path}.sha256`
      );
      loaded.set(path, document);
    })
  );
  const get = (path: string): Row =>
    parse(
      loaded.get(path) ?? fail(`${path}: missing playableDocuments dependency`),
      path
    );
  const promotionRaw = get(PROMOTION);
  header(promotionRaw, PROMOTION, 'dion-play-promotion');
  same(promotionRaw['sources'], sourcePins, `${PROMOTION}.sources`);
  const selected = rows(promotionRaw['geometry'], `${PROMOTION}.geometry`);
  same(selected.length, 88, `${PROMOTION}.geometry.length`);
  unique(selected, 'id', `${PROMOTION}.geometry`);
  const geometry = new Map<string, PromotedGeometry>();
  for (const s of [
    ...selected,
    ...rows(
      promotionRaw['presentationGeometry'],
      `${PROMOTION}.presentationGeometry`
    )
  ]) {
    const id = text(s['id'], 'geometry.id');
    const path = `${TOURCRAFT_ROOT}/geometry/${id}.json`;
    const expectedSource = selected.includes(s)
      ? 'catalogue-immutable'
      : 'gameplay-opening';
    same(s['source'], expectedSource, `${path}.selection.source`);
    const document = get(path);
    header(document, path, 'dion-play-geometry', expectedSource);
    const g = record(document['geometry'], `${path}.geometry`);
    for (const k of ['id', 'family', 'record']) {
      same(g[k], s[k], `${path}.geometry.${k}`);
    }
    address(g['record'], `${path}.geometry.record`);
    if (
      ![
        'model',
        'structure',
        'detail',
        'ground',
        'island',
        'sky-tail'
      ].includes(String(g['family']))
    ) {
      fail(`${path}.geometry.family: unsupported family`);
    }
    const pins = s['sourceRanges'] ?? [s['sourceRange']];
    for (const [i, p] of list(
      pins,
      `${path}.selection.sourceRanges`
    ).entries()) {
      provenance(p, `${path}.selection.sourceRanges.${i}`);
    }
    if (g['provenance'] !== undefined) {
      for (const [i, p] of list(
        g['provenance'],
        `${path}.geometry.provenance`
      ).entries()) {
        provenance(p, `${path}.geometry.provenance.${i}`);
      }
    }
    const variants = record(g['variants'], `${path}.geometry.variants`);
    const forms = list(s['variants'] ?? s['forms'], `${path}.selectedForms`);
    same(
      Object.keys(variants).sort(),
      [...forms].sort(),
      `${path}.geometry.variants`
    );
    if (s['selectedVariantsSha256'] !== undefined) {
      same(
        await recordDigest(variants),
        sha(s['selectedVariantsSha256'], `${path}.selectedVariantsSha256`),
        `${path}.selectedVariantsSha256`
      );
      same(
        g['sha256'],
        s['catalogueRecordSha256'],
        `${path}.catalogueRecordSha256`
      );
    }
    for (const [form, value] of Object.entries(variants)) {
      const at = `${path}.geometry.variants.${form}`;
      const v = record(value, at);
      if (g['family'] === 'structure') {
        readStructure(v, at);
      } else if (g['family'] === 'detail') {
        readDetail(v, at);
        // These lists also feed the numeric craft pass; the render decoder
        // intentionally does not consume them, so validate at this boundary.
        for (const name of ['supports', 'walls']) {
          for (const value of list(v[name], `${at}.${name}`)) {
            const box = record(value, `${at}.${name}.box`);
            for (const axis of ['x', 'y', 'z']) {
              const range = ints(
                box[axis],
                `${at}.${name}.${axis}`,
                2,
                -32_768,
                32_767
              );
              if (range[0]! > range[1]!) {
                fail(`${at}.${name}.${axis}: reversed box`);
              }
            }
            if (name === 'supports') {
              int(box['tag'], `${at}.support.tag`, 0, 65_535);
            }
          }
        }
      } else if (g['family'] === 'ground') {
        readGround(v, at);
      } else {
        if (g['family'] === 'sky-tail') {
          ints(
            Array.isArray(v['faces']) ? v['faces'].flat() : undefined,
            `${at}.faces`,
            12,
            0,
            4
          );
          int(v['colour'], `${at}.colour`, 0, 0x7_77);
        }
        if (g['family'] === 'model') {
          modelForm(
            g as unknown as CatalogueGeometry,
            form,
            0,
            [],
            undefined,
            true
          );
        }
        list(v['vertices'], `${at}.vertices`).forEach((p, i) =>
          ints(p, `${at}.vertices[${i}]`, g['family'] === 'island' ? 2 : 3)
        );
      }
    }
    geometry.set(id, g as unknown as PromotedGeometry);
  }
  same(geometry.size, 89, `${PROMOTION}.geometry.closure`);
  const expectedPaths = [
    ...DION_DOCUMENTS.map(kind => `${TOURCRAFT_ROOT}/${kind}.json`),
    PROMOTION,
    ...[...geometry.keys()]
      .sort()
      .map(id => `${TOURCRAFT_ROOT}/geometry/${id}.json`),
    ...PRESENTATION.map(kind => `${TOURCRAFT_ROOT}/presentation/${kind}.json`)
  ];
  same(
    entries.map(e => e['path']),
    expectedPaths,
    `${TOURCRAFT_MANIFEST}.playableDocuments order/closure`
  );
  const legacy = await readDionContent(
    new Map(
      DION_DOCUMENTS.map(kind => {
        const path = `${TOURCRAFT_ROOT}/${kind}.json`;
        return [kind, { text: loaded.get(path)!.text, value: get(path) }];
      })
    ),
    {
      text: loaded.get(`${TOURCRAFT_ROOT}/presentation/taxi.json`)!.text,
      value: get(`${TOURCRAFT_ROOT}/presentation/taxi.json`)
    }
  );
  same(
    legacy.source.capture.opening,
    'c1476f479b6e4585b335c65890cb93312318d6e9b7d56cbe926ecf2e2bef8766',
    'legacy.source.capture.opening'
  );
  const support = get(`${TOURCRAFT_ROOT}/presentation/support.json`);
  const headRaw = get(`${TOURCRAFT_ROOT}/presentation/head.json`);
  header(headRaw, 'head', 'dion-play-head', 'gameplay-opening');
  header(support, 'support', 'dion-play-support', 'catalogue-immutable');
  const selection = record(
    promotionRaw['renderSupportSelection'],
    'renderSupportSelection'
  );
  for (const [section, selectors, key] of [
    ['glyphs', 'glyphs', 'id'],
    ['palettes', 'palettes', 'index'],
    ['groups', 'groupSupportRecords', 'group'],
    ['bodies', 'bodySupportRecords', 'body']
  ] as const) {
    const values = record(support[section], `support.${section}`);
    const wanted = rows(
      selection[selectors],
      `renderSupportSelection.${selectors}`
    );
    same(
      Object.keys(values).sort(),
      wanted.map(r => String(r[key])).sort(),
      `support.${section}.selection`
    );
    for (const r of wanted) {
      same(
        await recordDigest(values[String(r[key])]),
        r['sourceRecordSha256'],
        `support.${section}.${r[key]}.sourceRecordSha256`
      );
      if (section === 'glyphs') {
        readGlyph(values[String(r[key])], `support.glyphs.${r[key]}`);
      }
    }
  }
  for (const s of rows(selection['sharedTableRecords'], 'sharedTableRecords')) {
    same(
      await recordDigest(support[String(s['name'])]),
      s['sourceRecordSha256'],
      `support.${s['name']}.sourceRecordSha256`
    );
  }
  const promotion = readPromotion(promotionRaw, geometry, support);
  const gameplayRaw = get(`${TOURCRAFT_ROOT}/presentation/gameplay.json`);
  header(gameplayRaw, 'gameplay', 'dion-play-gameplay', 'gameplay-opening');
  const initial = record(gameplayRaw['initial'], 'gameplay.initial');
  same(initial['source'], 'gameplay-opening', 'gameplay.initial.source');
  validateInitial(initial);
  ints(
    initial['bodyPhases'],
    'gameplay.initial.bodyPhases',
    32,
    0,
    0xff_ff_ff_ff
  );
  const flags = ints(
    initial['flags'],
    'gameplay.initial.flags',
    2,
    0,
    0xff_ff_ff_ff
  );
  if ((flags[0]! & ((1 << 10) | (1 << 22))) !== 0) {
    fail('gameplay.initial.flags: excluded campaign alternatives');
  }
  const modelBindings = new Map<number, string>();
  for (const [entry, id] of Object.entries(
    record(gameplayRaw['modelBindings'], 'gameplay.modelBindings')
  )) {
    const key = int(Number(entry), 'gameplay.modelBindings.entry', 0, 511);
    const g =
      geometry.get(text(id, `gameplay.modelBindings.${entry}`)) ??
      fail(`gameplay.modelBindings.${entry}: missing geometry`);
    same(g.family, 'model', `gameplay.modelBindings.${entry}.family`);
    modelBindings.set(key, g.id);
  }
  const models = new Map<number, DionModel>();
  const expectedEntries = new Set([13, 279, 280, 316, 320]);
  const colours = ints(
    record(support['modelColours'], 'support.modelColours')['words'],
    'support.modelColours.words',
    60,
    0,
    65_535
  );
  for (const [entry, id] of modelBindings) {
    const g = geometry.get(id)!;
    const prefix = g.variants['form=default']
      ? ''
      : g.variants['state=lamp-lit;form=default']
        ? 'state=lamp-lit;'
        : 'state=intact;';
    models.set(
      entry,
      playableModel(g as CatalogueGeometry, entry, colours, prefix)
    );
    provenance(
      record(
        gameplayRaw['modelBindingSources'],
        'gameplay.modelBindingSources'
      )[String(entry)],
      `gameplay.modelBindingSources.${entry}`
    );
  }
  for (const [e, id] of [
    [13, 'model-03005c'],
    [279, 'model-0381de'],
    [280, 'model-038282'],
    [320, 'model-03108a'],
    [316, 'model-032822']
  ] as const) {
    same(modelBindings.get(e), id, `gameplay.modelBindings.${e}`);
  }
  for (const r of rows(
    promotionRaw['legacyModels'],
    'promotion.legacyModels'
  )) {
    const entry = int(r['entry'], 'legacyModels.entry', 0, 511);
    expectedEntries.add(entry);
    same(
      modelBindings.get(entry),
      r['geometry'],
      `gameplay.modelBindings.${entry}`
    );
  }
  const initialResidents = rows(
    initial['residents'],
    'gameplay.initial.residents'
  );
  const requiredResidents = rows(
    promotionRaw['residents'],
    'promotion.residents'
  );
  // Every resident record is exported whole (#756); the reviewed ones keep their pins.
  same(
    initialResidents.map(r => r['slot']),
    Array.from({ length: 246 }, (_, i) => i + 1),
    'gameplay.initial.residents.selection'
  );
  for (const r of rows(
    promotionRaw['residentModels'],
    'promotion.residentModels'
  )) {
    const slot = int(r['slot'], 'residentModels.slot', 1, 246);
    expectedEntries.add(slot);
    same(
      modelBindings.get(slot),
      r['geometry'],
      `gameplay.modelBindings.${slot}`
    );
    same(
      initialResidents.find(a => a['slot'] === slot)!['hasModel'],
      true,
      `gameplay.initial.residents.${slot}.hasModel`
    );
  }
  for (const r of requiredResidents) {
    const slot = int(r['slot'], 'residents.slot', 0, 511);
    if (r['geometry'] !== null) {
      expectedEntries.add(slot);
    }
    const actual = initialResidents.find(a => a['slot'] === slot)!;
    same(
      modelBindings.get(slot) ?? null,
      r['geometry'],
      `gameplay.modelBindings.${slot}`
    );
    same(
      actual['modelRecord'],
      r['initialModelRecord'],
      `gameplay.initial.residents.${slot}.modelRecord`
    );
    same(
      actual['hasModel'],
      r['geometry'] !== null,
      `gameplay.initial.residents.${slot}.hasModel`
    );
    same(
      await recordDigest(actual),
      r['initialRecordSha256'],
      `gameplay.initial.residents.${slot}.initialRecordSha256`
    );
  }
  for (const c of promotion.surfaceCells) {
    for (const entry of c.templates) {
      expectedEntries.add(entry);
      const selected = [...geometry.values()].filter(
        g =>
          g.family === 'model' &&
          ints(
            (g as unknown as Row)['entries'] ?? [],
            `${g.id}.entries`
          ).includes(entry)
      );
      same(
        selected.length,
        1,
        `surfaceCells.${c.group}.${c.cell}.templates.${entry}`
      );
      same(
        modelBindings.get(entry),
        selected[0]!.id,
        `gameplay.modelBindings.${entry}`
      );
    }
  }
  same(
    [...modelBindings.keys()].sort((a, b) => a - b),
    [...expectedEntries].sort((a, b) => a - b),
    'gameplay.modelBindings.selection'
  );
  same(
    Object.keys(
      record(gameplayRaw['modelBindingSources'], 'gameplay.modelBindingSources')
    ).sort(),
    [...modelBindings.keys()].map(String).sort(),
    'gameplay.modelBindingSources.selection'
  );
  const programmes = get(`${TOURCRAFT_ROOT}/presentation/programmes.json`);
  header(programmes, 'programmes', 'dion-play-programmes', 'gameplay-opening');
  validateProgrammes(
    programmes,
    promotionRaw,
    legacy,
    get(`${TOURCRAFT_ROOT}/scripts.json`)
  );
  const systemRaw = get(`${TOURCRAFT_ROOT}/presentation/system.json`);
  header(systemRaw, 'system', 'dion-play-system', 'gameplay-opening');
  const system = readSystem(systemRaw);
  same(
    systemRaw['drawLists'],
    promotionRaw['skyDrawLists'],
    'system.drawLists'
  );
  same(systemRaw['spaceScan'], promotionRaw['spaceScan'], 'system.spaceScan');
  const craft = get(`${TOURCRAFT_ROOT}/presentation/craft.json`);
  header(craft, 'craft', 'dion-play-craft', 'gameplay-opening');
  const tables = record(craft['tables'], 'craft.tables');
  const table = (name: string, count: number, max: number) => {
    const r = record(tables[name], `craft.tables.${name}`);
    provenance(r['provenance'], `craft.tables.${name}.provenance`);
    return ints(r['values'], `craft.tables.${name}.values`, count, 0, max);
  };
  const arithmetic: CraftArithmetic = {
    arctan: new Uint8Array(table('arctan', 257, 255)),
    exp: new Uint16Array(table('exp', 4096, 65_535)),
    octants: table('octants', 8, 65_535),
    sine: new Uint32Array(table('sine', 1024, 0xff_ff_ff_ff))
  };
  table('negativeLog', 2049, 65_535);
  table('positiveLog', 2048, 65_535);
  table('positiveLogEndpoint', 1, 65_535);
  const parameters = rows(craft['parameters'], 'craft.parameters');
  same(
    parameters.map(p => [p['slot'], p['routine']]),
    [
      [0, 'space'],
      [1, 'surface-common']
    ],
    'craft.parameters.routine'
  );
  for (const p of parameters) {
    provenance(p['provenance'], `craft.parameters.${p['slot']}.provenance`);
    for (const k of ['damping', 'acceleration', 'lag', 'gain', 'retained10']) {
      int(p[k], `craft.parameters.${p['slot']}.${k}`, 0, 0xff_ff_ff_ff);
    }
    for (const k of ['pitch', 'rollPitchExponent', 'retained18', 'ceiling']) {
      int(p[k], `craft.parameters.${p['slot']}.${k}`, 0, 65_535);
    }
  }
  const content: TourcraftContent = {
    arithmetic,
    contentSha256: await tourcraftContentIdentity([
      ...expectedPaths.map(path => ({ path, text: loaded.get(path)!.text })),
      { path: TOURCRAFT_MANIFEST, text: manifestDocument.text }
    ]),
    craft,
    gameplay: {
      initial: initial as TourcraftGameplay['initial'],
      modelBindings,
      models,
      raw: gameplayRaw
    },
    geometry,
    head: readDionHead(headRaw),
    legacy,
    programmes,
    promotion,
    support,
    system
  };
  tourcraftFrameWorld(content, 3);
  tourcraftFrameWorld(content, 23);
  tourcraftOpeningFrameState(content);
  return content;
};

const validateProgrammes = (
  raw: Row,
  promotion: Row,
  legacy: DionContent,
  scripts: Row
): void => {
  const arrival = record(raw['arrivalResidence'], 'arrivalResidence');
  same(arrival['heading'], 0xfd_7a, 'arrivalResidence.heading');
  same(
    arrival['source'],
    {
      range: ['$66E4E', '$66E58'],
      sha256: '975395b8df892b6f7dc85e8d1720f5e3f6c3af76465d5d8bd7e38a6419f05b74'
    },
    'arrivalResidence.source'
  );
  const ambient = record(raw['ambientTaxi'], 'ambientTaxi');
  same(ambient['group'], 23, 'ambientTaxi.group');
  same(ambient['rate'], -1024, 'ambientTaxi.rate');
  same(ambient['metadata'], 0x00_28_02_12, 'ambientTaxi.metadata');
  same(ambient['price'], 0, 'ambientTaxi.price');
  same(
    ambient['source'],
    {
      range: ['$42AC8', '$42AF2'],
      sha256: 'ebb757cb91680769ca2af1d0c42ff9a4cea8a33f442334487ecba8dcda9f5f82'
    },
    'ambientTaxi.source'
  );
  const route = rows(ambient['route'], 'ambientTaxi.route');
  same(route.length, 14, 'ambientTaxi.route.length');
  for (const point of route) {
    int(point['x'], 'ambientTaxi.x', 0, 15);
    int(point['z'], 'ambientTaxi.z', 0, 15);
    int(point['control'], 'ambientTaxi.control', 0, 7);
  }
  const opcodes = new Map(
    rows(scripts['opcodes'], 'scripts.opcodes').map(r => [r['op'], r['name']])
  );
  const boundaries = new Set(
    legacy.scripts.routines.flatMap(r => r.instructions.map(i => i.address))
  );
  const routines = rows(raw['scripts'], 'programmes.scripts');
  same(
    routines.map(r => r['id']),
    rows(promotion['nonGeometryClosure'], 'nonGeometryClosure')
      .filter(r =>
        [
          'outward-script-29',
          'election-77',
          'first-election-continuation',
          'mining-13',
          'mining-continuation',
          'final-election-continuation'
        ].includes(String(r['id']))
      )
      .map(r => r['id'])
      .concat('pickup-responses'),
    'programmes.scripts.closure'
  );
  for (const r of routines) {
    same(r['aligned'], true, `programmes.${r['id']}.aligned`);
    same(r['unknownOpcodes'], [], `programmes.${r['id']}.unknownOpcodes`);
    if (
      rows(r['instructions'], `programmes.${r['id']}.instructions`).length === 0
    ) {
      fail(`programmes.${r['id']}: empty routine`);
    }
  }
  const instructions = [
    ...routines,
    record(raw['sharedReturn'], 'programmes.sharedReturn')
  ].flatMap(r => rows(r['instructions'], 'programmes.instructions'));
  for (const ins of instructions) {
    boundaries.add(address(ins['address'], 'programmes.instruction.address'));
    same(
      ins['name'],
      opcodes.get(ins['op']),
      `programmes.${ins['address']}.name/op`
    );
    provenance(ins['source'], 'programmes.instruction.source');
  }
  const excluded = record(
    promotion['reachableScriptEntries'],
    'reachableScriptEntries'
  );
  same(
    excluded['defaultFlag10MustRemainUnreachable'],
    true,
    'reachableScriptEntries.defaultFlag10MustRemainUnreachable'
  );
  same(
    excluded['excludedBranchTargets'],
    ['$75BA6'],
    'reachableScriptEntries.excludedBranchTargets'
  );
  for (const ins of instructions) {
    const targets = [
      ins['target'],
      ...list(ins['operands'] ?? [], 'operands').flatMap(o =>
        typeof o === 'object' && o !== null
          ? [record(o, 'operand')['address']]
          : []
      )
    ].filter(v => v !== undefined);
    for (const t of targets) {
      // store2's destination is mutable state, not an executable dependency.
      if (ins['name'] === 'store2') {
        continue;
      }
      const target = address(t, 'programmes.target');
      if (!boundaries.has(target)) {
        const flag = list(ins['operands'] ?? [], 'operands')[0];
        if (
          ins['name'] !== 'if_flag' ||
          flag !== '$0A' ||
          !['$75BA6'].includes(String(t))
        ) {
          fail(`programmes.${ins['address']}.target: missing dependency ${t}`);
        }
      }
    }
  }
  same(
    Object.keys(record(raw['entries'], 'programmes.entries')).sort(),
    ['115', '119', '19', '24', '28', '41'],
    'programmes.entries.closure'
  );
  for (const [entry, target] of Object.entries(
    record(raw['entries'], 'programmes.entries')
  )) {
    if (!boundaries.has(address(target, `programmes.entries.${entry}`))) {
      fail(`programmes.entries.${entry}: missing instruction`);
    }
  }
  const poll = record(raw['poll'], 'programmes.poll');
  ints(poll['bytes'], 'programmes.poll.bytes', 2, 0, 255);
  provenance(poll['source'], 'programmes.poll.source');
  const playback = record(raw['playback'], 'programmes.playback');
  const h = record(playback['header'], 'programmes.playback.header');
  for (const k of ['x', 'z', 'eyeY']) {
    int(h[k], `programmes.playback.header.${k}`);
  }
  int(h['yaw'], 'programmes.playback.header.yaw', 0, 1023);
  ints(h['systemEye'], 'programmes.playback.header.systemEye', 3);
  provenance(playback['source'], 'programmes.playback.source');
  const faces = record(raw['faceSequences'], 'programmes.faceSequences');
  same(
    Object.keys(faces).sort(),
    ['$A1', '$A5'],
    'programmes.faceSequences.closure'
  );
  const tokens = rows(
    record(promotion['renderSupportSelection'], 'renderSupportSelection')[
      'tokens'
    ],
    'renderSupportSelection.tokens'
  );
  for (const [key, value] of Object.entries(faces)) {
    const face = record(value, `programmes.faceSequences.${key}`);
    int(
      face['selector'],
      `programmes.faceSequences.${key}.selector`,
      0,
      65_535
    );
    const selected = tokens.find(t => t['token'] === key)!;
    const animation = record(selected['animation'], `token.${key}.animation`);
    const sequences = record(animation['sequences'], `token.${key}.sequences`);
    for (const name of ['base', 'alternate']) {
      const sequence = record(sequences[name], `token.${key}.${name}`);
      const values = ints(
        face[name],
        `programmes.faceSequences.${key}.${name}`,
        int(sequence['glyphPositions'], 'glyphPositions') + 1,
        0,
        255
      );
      same(
        values.at(-1),
        0,
        `programmes.faceSequences.${key}.${name}.terminator`
      );
      const permitted = ints(sequence['glyphCodes'], 'glyphCodes');
      if (values.slice(0, -1).some(code => !permitted.includes(code))) {
        fail(`programmes.faceSequences.${key}.${name}: unsupported glyph`);
      }
    }
  }
  const heads = record(raw['headSequences'], 'programmes.headSequences');
  for (const ins of instructions.filter(i => i['name'] === 'store2')) {
    const operands = list(ins['operands'], 'store2.operands');
    if (record(operands[0], 'store2.destination')['address'] === '$6FF4A') {
      const target = address(ins['value'], 'store2.value') + 0x6_fd_44;
      const key = '$' + target.toString(16).toUpperCase().padStart(5, '0');
      const sequence = ints(
        heads[key],
        `programmes.headSequences.${key}`,
        undefined,
        0,
        255
      );
      same(sequence.at(-1), 0, `programmes.headSequences.${key}.terminator`);
    }
  }
  const tone = record(raw['collisionTone'], 'programmes.collisionTone');
  same(tone['entry'], '$4C8A0', 'programmes.collisionTone.entry');
  same(tone['channel'], 'B', 'programmes.collisionTone.channel');
  same(
    tone['registers'],
    [
      [9, 31],
      [11, 33],
      [12, 48],
      [13, 9]
    ],
    'programmes.collisionTone.registers'
  );
  ints(tone['periods'], 'programmes.collisionTone.periods', 9, 0, 65_535);
  const encounter = record(raw['encounter'], 'programmes.encounter');
  const pairs = rows(encounter['pairs'], 'programmes.encounter.pairs');
  same(
    pairs.map(p => p['address']),
    ['$06E50', '$06E74'],
    'programmes.encounter.pairs.address'
  );
  for (const p of pairs) {
    int(p['count'], 'programmes.encounter.pairs.count', 0, 255);
    int(p['request'], 'programmes.encounter.pairs.request', 0, 255);
  }
  const paths = rows(
    encounter['trajectories'],
    'programmes.encounter.trajectories'
  );
  same(
    paths.map(p => p['address']),
    ['$522BC', '$522E2', '$52308'],
    'programmes.encounter.trajectories.address'
  );
  for (const p of paths) {
    const records = rows(
      p['records'],
      `programmes.encounter.${p['address']}.records`
    );
    same(
      records.length,
      4,
      `programmes.encounter.${p['address']}.records.length`
    );
    for (const r of records) {
      for (const axis of ['x', 'y', 'z']) {
        int(r[axis], `trajectory.${axis}`, -32_768, 32_767);
      }
      int(r['shift'], 'trajectory.shift', 0, 127);
      int(r['count'], 'trajectory.count', 0, 255);
    }
  }
  const actions = rows(playback['actions'], 'programmes.playback.actions');
  same(actions.length, 134, 'programmes.playback.actions.length');
  let previous = 0;
  for (const [i, action] of actions.entries()) {
    previous = int(
      action['frame'],
      `programmes.playback.actions[${i}].frame`,
      previous,
      927
    );
    int(action['value'], `programmes.playback.actions[${i}].value`, 0, 127);
    if (action['kind'] !== 'key' && action['kind'] !== 'stick') {
      fail(`programmes.playback.actions[${i}].kind: invalid control`);
    }
  }
  same(actions.at(-1)?.['frame'], 927, 'programmes.playback.lastConsumedFrame');
};

const validateInitial = (initial: Row): void => {
  readDionOpening(initial['opening']);
  int(initial['playerZone'], 'gameplay.initial.playerZone', 0, 8);
  same(
    initial['ownerWidths'],
    TOURCRAFT_OWNER_WIDTHS,
    'gameplay.initial.ownerWidths'
  );
  const owners = record(initial['owners'], 'gameplay.initial.owners');
  for (const [group, fields] of Object.entries(TOURCRAFT_OWNER_WIDTHS)) {
    const values = record(owners[group], `owners.${group}`);
    for (const [name, width] of Object.entries(fields)) {
      int(
        values[name],
        `owners.${group}.${name}`,
        0,
        width === 1 ? 255 : width === 2 ? 65_535 : 0xff_ff_ff_ff
      );
    }
  }
  ints(initial['soundRegisters'], 'soundRegisters', 14, 0, 255);
  const gates = record(initial['beaconGates'], 'gameplay.initial.beaconGates');
  same(
    Object.keys(gates).sort(),
    ['4', '5'],
    'gameplay.initial.beaconGates.selection'
  );
  for (const [k, v] of Object.entries(gates)) {
    if (typeof v !== 'boolean') {
      fail(`gameplay.initial.beaconGates.${k}: not a boolean`);
    }
  }
  ints(
    initial['carriedStack'],
    'gameplay.initial.carriedStack',
    undefined,
    0,
    255
  );
  const vm = record(initial['vm'], 'gameplay.initial.vm');
  address(vm['pc'], 'gameplay.initial.vm.pc');
  for (const k of [
    'queue',
    'wait',
    'timer',
    'timedTarget',
    'busy',
    'continuation',
    'hold'
  ]) {
    int(vm[k], `gameplay.initial.vm.${k}`, 0, 65_535);
  }
  for (const [k, v] of Object.entries(
    record(initial['availability'], 'gameplay.initial.availability')
  )) {
    int(v, `gameplay.initial.availability.${k}`, 0, 255);
  }
  const view = record(initial['view'], 'gameplay.initial.view');
  for (const k of [
    'roll',
    'pitch',
    'yaw',
    'longitude',
    'latitude',
    'headSelector',
    'headCount',
    'headProfile'
  ]) {
    int(view[k], `gameplay.initial.view.${k}`, 0, 65_535);
  }
  address(view['headCursor'], 'gameplay.initial.view.headCursor');
  const faces = record(initial['faceTokens'], 'gameplay.initial.faceTokens');
  same(
    Object.keys(faces).sort(),
    ['$A1', '$A5'],
    'gameplay.initial.faceTokens'
  );
  for (const [k, v] of Object.entries(faces)) {
    const face = record(v, `gameplay.initial.faceTokens.${k}`);
    for (const field of ['output', 'baseCursor', 'alternateCursor']) {
      int(face[field], `gameplay.initial.faceTokens.${k}.${field}`, 0, 65_535);
    }
  }
  const residents = rows(initial['residents'], 'gameplay.initial.residents');
  same(residents.length, 246, 'gameplay.initial.residents.length');
  const carry = record(initial['carry'], 'gameplay.initial.carry');
  for (const k of ['capacity', 'store', 'scroll']) {
    int(carry[k], `gameplay.initial.carry.${k}`, 0, 65_535);
  }
  for (const [k, v] of Object.entries(
    record(initial['labels'], 'gameplay.initial.labels')
  )) {
    int(Number(k), `gameplay.initial.labels.${k}`, 1, 246);
    if (!/^[ -~]{16}$/.test(text(v, `gameplay.initial.labels.${k}`))) {
      fail(`gameplay.initial.labels.${k}: not sixteen printable characters`);
    }
  }
  unique(residents, 'slot', 'gameplay.initial.residents');
  for (const r of residents) {
    if (typeof r['hasModel'] !== 'boolean') {
      fail(`gameplay.initial.residents.${r['slot']}.hasModel: not a boolean`);
    }
    rows(
      r['provenance'],
      `gameplay.initial.residents.${r['slot']}.provenance`
    ).forEach((p, i) =>
      provenance(p, `gameplay.initial.residents.${r['slot']}.provenance.${i}`)
    );
    address(
      r['modelRecord'],
      `gameplay.initial.residents.${r['slot']}.modelRecord`
    );
  }
};
