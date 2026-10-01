import type { DionCatalogue } from '../dion/catalogue.ts';

const mod = (n: number, period: number) => ((n % period) + period) % period;

export interface Selection {
  readonly fieldX: number;
  readonly fieldZ: number;
  readonly floor: number;
  readonly id: string;
  readonly region: number;
  readonly state: 'initial' | 'constructed';
  readonly variant: string;
}
export interface Entry {
  readonly bodies: readonly string[];
  readonly floors: readonly number[];
  readonly groups: readonly number[];
  readonly id: string;
  readonly kind:
    'object' | 'placement' | 'geometry' | 'area' | 'body' | 'place';
  readonly name: string;
  readonly note: string;
  readonly places: readonly string[];
  readonly search: string;
}
export interface Filters {
  readonly body?: string;
  readonly floor?: string;
  readonly group?: string;
  readonly kind?: string;
  readonly place?: string;
  readonly q?: string;
}
const hex = (v: number): string =>
  v.toString(16).padStart(2, '0').toUpperCase();
const reference = (group: number, cell: number): string =>
  `${group}:${hex(cell)}`;
const numberParam = (
  p: URLSearchParams,
  key: string,
  min: number,
  max: number
): number => {
  const raw = p.get(key);
  const value = raw === null || !/^-?\d+$/.test(raw) ? Number.NaN : Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : 0;
};
export const readSelection = (p: URLSearchParams): Selection => ({
  fieldX: numberParam(p, 'fieldX', -4095, 4095),
  fieldZ: numberParam(p, 'fieldZ', -4095, 4095),
  floor: numberParam(p, 'floor', 0, 10),
  id: p.get('id') ?? '',
  region: numberParam(p, 'region', 0, 64),
  state: p.get('state') === 'constructed' ? 'constructed' : 'initial',
  variant: p.get('variant') ?? ''
});
export const fieldOccurrence = (c: DionCatalogue, x: number, z: number) => ({
  bodyCell: [
    mod(c.field.origin[0]! + x, 4096),
    mod(c.field.origin[1]! + z, 4096)
  ],
  cell: mod(x, c.field.period) + 16 * mod(z, c.field.period),
  id: `field-56-${x}-${z}`
});
export const hostSelection = (
  c: DionCatalogue,
  id: string
): Selection | null => {
  const object = c.objects.find(o => o.id === id);
  if (!object?.host) {
    return null;
  }
  const field = object.host.field === 'midas';
  return {
    fieldX: field ? object.bodyCell![0]! - c.field.origin[0]! : 0,
    fieldZ: field ? object.bodyCell![1]! - c.field.origin[1]! : 0,
    floor: object.floor ?? 0,
    id: field ? c.field.seed : object.host.placement!,
    region: 0,
    state: 'initial',
    variant: ''
  };
};
export const catalogueEntries = (c: DionCatalogue): Entry[] => {
  const entries: Entry[] = [];
  const add = (e: Omit<Entry, 'search'>, references = '') =>
    entries.push({
      ...e,
      search: `${e.id} ${e.name} ${e.note} ${references}`.toLowerCase()
    });
  const names = (body: string | null) =>
    c.bodies.find(b => b.id === body)?.name ?? '';
  const placeIds = (id: string) =>
    c.places.filter(p => p.placement === id).map(p => p.id);
  for (const p of c.placements) {
    const places = c.places.filter(place => place.placement === p.id);
    const s = c.structures.find(s => s.id === p.structure)!;
    add(
      {
        bodies: [p.body],
        floors: s.floors.map(f => f.floor),
        groups: [p.group],
        id: p.id,
        kind: 'placement',
        name:
          places.map(p => p.name).join(' / ') ||
          `Structure slot ${p.slot} · ${reference(p.group, p.cell)}`,
        note: p.state,
        places: placeIds(p.id)
      },
      `${reference(p.group, p.cell)} group ${p.group} cell $${hex(p.cell)} slot ${p.slot} ${names(p.body)}`
    );
  }
  for (const o of c.objects) {
    const host = o.host?.placement
      ? c.placements.find(p => p.id === o.host!.placement)
      : undefined;
    const workspace =
      o.residence === 'surface'
        ? c.placements.find(
            p =>
              p.body === o.body &&
              p.bodyCell.join(',') === o.bodyCell?.join(',')
          )
        : undefined;
    const locationHost = host ?? workspace;
    add(
      {
        bodies: o.body ? [o.body] : [],
        floors: o.floor === null ? [] : [o.floor],
        groups: locationHost ? [locationHost.group] : o.host?.field ? [56] : [],
        id: o.id,
        kind: 'object',
        name: o.name ?? `Object slot ${o.slot}`,
        note: o.residence,
        places: locationHost ? placeIds(locationHost.id) : []
      },
      `slot ${o.slot} $${hex(o.slot)} ${o.geometry ?? 'null-model'} ${names(o.body)} ${o.indoor ? reference(o.indoor.group, o.indoor.cell) : ''}`
    );
  }
  for (const g of c.geometryIndex) {
    const related = c.structures.filter(
      s => s.detail === g.id || s.floors.some(f => f.geometry === g.id)
    );
    const objects = c.objects.filter(
      o => o.geometry === g.id || o.forms?.some(f => f.geometry === g.id)
    );
    const placements = c.placements.filter(p =>
      related.some(s => s.id === p.structure)
    );
    const groups = [
      ...new Set([
        ...placements.map(p => p.group),
        ...entries
          .filter(e => objects.some(o => o.id === e.id))
          .flatMap(e => e.groups),
        ...Object.entries(c.surfaceCells)
          .filter(([, rows]) => rows.some(r => r['ground'] === g.id))
          .map(([group]) => Number(group)),
        ...c.bodies.flatMap(b =>
          b.islands.filter(i => i.geometry === g.id).map(i => i.group)
        )
      ])
    ];
    add(
      {
        bodies: g.bodies,
        floors: related.flatMap(s =>
          s.floors.filter(f => f.geometry === g.id).map(f => f.floor)
        ),
        groups,
        id: g.id,
        kind: 'geometry',
        name: `${g.family} · ${[...new Set(objects.flatMap(o => (o.name ? [o.name] : [])))].join(' / ') || g.record}`,
        note: 'Shared geometry definition',
        places: []
      },
      `${g.record} ${g.entries?.map(e => `entry ${e}`).join(' ') ?? ''} ${objects.map(o => `slot ${o.slot}`).join(' ')}`
    );
  }
  for (const a of c.areas) {
    add(
      {
        bodies: c.bodies
          .filter(b => b.islands.some(i => i.group === a.group))
          .map(b => b.id),
        floors: [],
        groups: [a.group],
        id: a.id,
        kind: 'area',
        name: a.area ?? `Group ${a.group}`,
        note: `${a.disposition} · ${a.authoredBindings} authored bindings`,
        places: []
      },
      `group ${a.group}`
    );
  }
  for (const b of c.bodies) {
    add(
      {
        bodies: [b.id],
        floors: [],
        groups: b.islands.map(i => i.group),
        id: b.id,
        kind: 'body',
        name: b.name,
        note: `${b.islands.length} islands`,
        places: []
      },
      `offset ${b.offset}`
    );
  }
  for (const p of c.places) {
    add(
      {
        bodies: c.bodies
          .filter(b => b.islands.some(i => i.group === p.group))
          .map(b => b.id),
        floors: [],
        groups: [p.group],
        id: p.id,
        kind: 'place',
        name: p.name,
        note: p.placement
          ? 'Named place'
          : 'Label only · no structure placement',
        places: [p.id]
      },
      reference(p.group, p.cell)
    );
  }
  return entries;
};
export const filterEntries = (entries: readonly Entry[], f: Filters): Entry[] =>
  entries.filter(
    e =>
      (!f.q ||
        f.q
          .toLowerCase()
          .trim()
          .split(/\s+/)
          .every(word => e.search.includes(word))) &&
      (!f.kind || e.kind === f.kind) &&
      (!f.body || e.bodies.includes(f.body)) &&
      (!f.group || e.groups.includes(Number(f.group))) &&
      (!f.place || e.places.includes(f.place)) &&
      (!f.floor || e.floors.includes(Number(f.floor)))
  );
