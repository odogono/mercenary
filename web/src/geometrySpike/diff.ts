/// Reviewable semantic diffs for #671: what an edit did to geometry and visual attributes, element
/// by element and by identity, rather than as a byte or text diff of either candidate's file.

import {
  canonicalJson,
  type Colour,
  type Face,
  type GeometryAsset,
  type Line,
  type Part,
  type Sidecar
} from './contract.ts';

const colourText = (colour: Colour | undefined) =>
  colour === undefined
    ? 'none'
    : colour.kind === 'ink'
      ? `ink ${colour.ink}`
      : `${colour.colour} ($${colour.source.toString(16).toUpperCase()}${colour.day === undefined ? '' : `, day ${colour.day}`})`;

/// Key order is not meaning: readers of the two candidates build objects in different orders.
const same = (a: unknown, b: unknown) =>
  canonicalJson(a ?? null) === canonicalJson(b ?? null);

const rotations = (loop: readonly number[]) =>
  loop.map((_, k) => [...loop.slice(k), ...loop.slice(0, k)].join(','));

/// How one loop became another: the same cycle from another start, the cycle reversed, or a
/// different boundary.
export const loopChange = (
  before: readonly number[],
  after: readonly number[]
): 'boundary' | 'rewound' | 'same' | 'start' => {
  if (same(before, after)) {
    return 'same';
  }
  if (before.length !== after.length) {
    return 'boundary';
  }
  if (rotations(before).includes(after.join(','))) {
    return 'start';
  }
  if (rotations([...before].reverse()).includes(after.join(','))) {
    return 'rewound';
  }
  return 'boundary';
};

const byId = <T extends { id: number }>(items: readonly T[]) =>
  new Map(items.map(item => [item.id, item]));

const primitiveAttributes = (
  before: Face | Line,
  after: Face | Line
): string[] => {
  const out: string[] = [];
  if (!same(before.colour, after.colour)) {
    out.push(
      `colour ${colourText(before.colour)} → ${colourText(after.colour)}`
    );
  }
  if (before.record !== after.record) {
    out.push(`record ${before.record ?? 'none'} → ${after.record ?? 'none'}`);
  }
  if (!same(before.sceneSlots, after.sceneSlots)) {
    out.push(
      `scene slots ${JSON.stringify(before.sceneSlots ?? [])} → ${JSON.stringify(after.sceneSlots ?? [])}`
    );
  }
  const b = before as Face,
    a = after as Face;
  if ((b.doubleSided ?? false) !== (a.doubleSided ?? false)) {
    out.push(
      `sidedness ${b.doubleSided ? 'double' : 'single'} → ${a.doubleSided ? 'double' : 'single'}`
    );
  }
  if ((b.closingRepeat ?? false) !== (a.closingRepeat ?? false)) {
    out.push('closing repeat changed');
  }
  return out;
};

const orderChanged = (
  before: readonly { id: number }[],
  after: readonly { id: number }[]
) => {
  const common = new Set(after.map(x => x.id));
  const a = before.filter(x => common.has(x.id)).map(x => x.id);
  const kept = new Set(a);
  const b = after.filter(x => kept.has(x.id)).map(x => x.id);
  return !same(a, b);
};

export interface PartChange {
  readonly lines: string[];
  readonly movedVertices: Map<number, readonly [number, number, number]>;
  readonly part: string;
}

export const partChanges = (
  before: Part | undefined,
  after: Part | undefined
): PartChange => {
  const lines: string[] = [];
  const movedVertices = new Map<number, readonly [number, number, number]>();
  const id = (after ?? before)!.id;
  if (before === undefined) {
    lines.push(
      `part added (${after!.vertices.length} vertices, ${after!.faces.length} faces, ${after!.lines.length} lines)`
    );
    return { lines, movedVertices, part: id };
  }
  if (after === undefined) {
    lines.push('part removed');
    return { lines, movedVertices, part: id };
  }
  const bv = byId(before.vertices),
    av = byId(after.vertices);
  for (const v of after.vertices) {
    const old = bv.get(v.id);
    if (old === undefined) {
      lines.push(`vertex v${v.id} added at (${v.co.join(', ')})`);
    } else if (old.runtime !== undefined || v.runtime !== undefined) {
      if (!same(old.runtime, v.runtime)) {
        lines.push(
          `vertex v${v.id} runtime input (${old.runtime?.input.join(', ') ?? '—'}) → (${v.runtime?.input.join(', ') ?? '—'})`
        );
      }
    } else if (!same(old.co, v.co)) {
      lines.push(
        `vertex v${v.id} moved (${old.co.join(', ')}) → (${v.co.join(', ')})`
      );
      movedVertices.set(v.id, old.co);
    }
  }
  for (const v of before.vertices) {
    if (!av.has(v.id)) {
      lines.push(`vertex v${v.id} removed (was at ${v.co.join(', ')})`);
    }
  }
  if (orderChanged(before.vertices, after.vertices)) {
    lines.push('vertex order changed');
  }
  const bx = byId(before.externals),
    ax = byId(after.externals);
  for (const x of after.externals) {
    if (!bx.has(x.id)) {
      lines.push(`external endpoint x${x.id} (road slot ${x.slot}) added`);
    } else if (!same(bx.get(x.id), x)) {
      lines.push(`external endpoint x${x.id} changed`);
    }
  }
  for (const x of before.externals) {
    if (!ax.has(x.id)) {
      lines.push(`external endpoint x${x.id} (road slot ${x.slot}) removed`);
    }
  }
  const bf = byId(before.faces),
    af = byId(after.faces);
  const removedFaces = before.faces.filter(f => !af.has(f.id));
  for (const f of after.faces) {
    const old = bf.get(f.id);
    if (old === undefined) {
      // A face deleted and rebuilt is a new identity; say which one it stands in for.
      const replaced = removedFaces.find(
        r => loopChange(r.loop, f.loop) !== 'boundary'
      );
      const note =
        replaced === undefined
          ? ''
          : ` — same boundary as removed f${replaced.id}${loopChange(replaced.loop, f.loop) === 'rewound' ? ', winding reversed' : loopChange(replaced.loop, f.loop) === 'start' ? ', loop starts elsewhere' : ''}`;
      lines.push(
        `face f${f.id} added: [${f.loop.map(i => `v${i}`).join(' ')}] ${colourText(f.colour)}${f.record === undefined ? '' : `, record ${f.record}`}, last in face order${note}`
      );
      continue;
    }
    const change = loopChange(old.loop, f.loop);
    const details = primitiveAttributes(old, f);
    if (change === 'rewound') {
      details.unshift('winding reversed');
    } else if (change === 'start') {
      details.unshift('loop starts at another vertex (same boundary)');
    } else if (change === 'boundary') {
      details.unshift(
        `boundary [${old.loop.map(i => `v${i}`).join(' ')}] → [${f.loop.map(i => `v${i}`).join(' ')}]`
      );
    }
    if (details.length > 0) {
      lines.push(`face f${f.id}: ${details.join('; ')}`);
    }
  }
  for (const f of before.faces) {
    if (!af.has(f.id)) {
      lines.push(
        `face f${f.id} removed: [${f.loop.map(i => `v${i}`).join(' ')}] ${colourText(f.colour)}${f.record === undefined ? '' : `, record ${f.record}`}`
      );
    }
  }
  if (orderChanged(before.faces, after.faces)) {
    lines.push('face order (draw order) changed');
  }
  const bl = byId(before.lines),
    al = byId(after.lines);
  for (const l of after.lines) {
    const old = bl.get(l.id);
    if (old === undefined) {
      lines.push(
        `line l${l.id} added: ${l.ends.map(i => `v${i}`).join('–')} ${colourText(l.colour)}`
      );
      continue;
    }
    const details = primitiveAttributes(old, l);
    if (!same(old.ends, l.ends)) {
      details.unshift(
        same([...old.ends].reverse(), l.ends)
          ? 'direction reversed'
          : `ends ${old.ends.map(i => `v${i}`).join('–')} → ${l.ends.map(i => `v${i}`).join('–')}`
      );
    }
    if (details.length > 0) {
      lines.push(`line l${l.id}: ${details.join('; ')}`);
    }
  }
  for (const l of before.lines) {
    if (!al.has(l.id)) {
      lines.push(
        `line l${l.id} removed: ${l.ends.map(i => `v${i}`).join('–')} ${colourText(l.colour)}`
      );
    }
  }
  if (before.role !== after.role || before.colourModel !== after.colourModel) {
    lines.push(
      `role or colour model changed: ${before.role}/${before.colourModel} → ${after.role}/${after.colourModel}`
    );
  }
  return { lines, movedVertices, part: id };
};

/// Review signals an edit cannot raise by itself: walking geometry and game bounds that did not
/// follow a display edit, sibling variants that shared moved positions, references that broke and
/// coordinate-placed metadata whose frame moved.
const advisories = (
  before: GeometryAsset,
  after: GeometryAsset,
  changes: readonly PartChange[],
  sidecar: Sidecar | undefined
): string[] => {
  const out: string[] = [];
  const changed = new Set(
    changes.filter(c => c.lines.length > 0).map(c => c.part)
  );
  const role = (id: string) =>
    (after.parts.find(p => p.id === id) ?? before.parts.find(p => p.id === id))
      ?.role;
  const visible = [...changed].filter(id => role(id) !== 'walk');
  const walks = after.parts.filter(p => p.role === 'walk');
  if (visible.length > 0 && walks.length > 0) {
    const untouched = walks.filter(p => !changed.has(p.id)).map(p => p.id);
    if (untouched.length > 0) {
      out.push(
        `Drawn geometry changed (${visible.join(', ')}) but walking geometry ${untouched.join(', ')} did not. It is separate on purpose; edit it explicitly if the walkable shape should follow.`
      );
    }
  }
  if (visible.length > 0 && sidecar !== undefined) {
    const record = JSON.stringify(sidecar.record);
    const bounds = [
      '"boxes"',
      '"supportTop"',
      '"extent"',
      '"bounds"',
      '"proximityBox"'
    ].filter(k => record.includes(k));
    if (bounds.length > 0) {
      out.push(
        `Game bounds in the sidecar (${bounds.map(k => k.replaceAll('"', '')).join(', ')}) are unchanged by this geometry edit.`
      );
    }
  }
  for (const change of changes) {
    if (change.movedVertices.size === 0) {
      continue;
    }
    const moved = new Set(
      [...change.movedVertices.values()].map(co => co.join(','))
    );
    for (const part of after.parts) {
      if (part.id === change.part || changed.has(part.id)) {
        continue;
      }
      const shared = part.vertices.filter(v => moved.has(v.co.join(',')));
      if (shared.length > 0) {
        out.push(
          `${change.part} moved ${change.movedVertices.size} vertices; ${shared.length} vertices of ${part.id} shared those positions at baseline and did not move. Variants are separately evidenced forms, so nothing propagates.`
        );
      }
    }
  }
  if (sidecar !== undefined) {
    for (const watch of sidecar.advisories ?? []) {
      const change = changes.find(c => c.part === watch.part);
      const hit = watch.vertices.filter(
        v =>
          change?.movedVertices.has(v) ||
          !after.parts
            .find(p => p.id === watch.part)
            ?.vertices.some(x => x.id === v)
      );
      if (hit.length > 0) {
        out.push(
          `${watch.message}: ${hit.map(v => `v${v}`).join(', ')} moved or were removed, and the metadata still names the old opening.`
        );
      }
    }
    if (sidecar.title === 'targ' && 'bounds' in (sidecar.record as object)) {
      const { max, min } = (
        sidecar.record as { bounds: { max: number[]; min: number[] } }
      ).bounds;
      const outside = after.parts
        .flatMap(p => p.vertices)
        .filter(v => v.co.some((c, k) => c < min[k]! || c > max[k]!));
      if (outside.length > 0) {
        out.push(
          `${outside.map(v => `v${v.id}`).join(', ')} now lie outside the Room bounds the sidecar keeps (${min.join(', ')} – ${max.join(', ')}).`
        );
      }
    }
  }
  return out;
};

export const semanticDiff = (
  before: GeometryAsset,
  after: GeometryAsset,
  sidecar?: Sidecar
): string => {
  const ids = [...new Set([...before.parts, ...after.parts].map(p => p.id))];
  const changes = ids.map(id =>
    partChanges(
      before.parts.find(p => p.id === id),
      after.parts.find(p => p.id === id)
    )
  );
  const out = [`# Semantic diff: ${after.asset}`, ''];
  const changed = changes.filter(c => c.lines.length > 0);
  if (changed.length === 0) {
    out.push('No geometry or visual-attribute changes.', '');
  }
  for (const change of changed) {
    out.push(`## ${change.part}`, '', ...change.lines.map(l => `- ${l}`), '');
  }
  const notes = advisories(before, after, changes, sidecar);
  if (notes.length > 0) {
    out.push('## Review notes', '', ...notes.map(n => `- ${n}`), '');
  }
  return `${out.join('\n')}`;
};

type Element = readonly [key: string, value: string];

const compact = (value: unknown) =>
  JSON.stringify(JSON.parse(canonicalJson(value)));

const elements = (asset: GeometryAsset): Map<string, string> =>
  new Map(
    asset.parts.flatMap((part): Element[] => [
      ...part.vertices.map((v): Element => [
        `${part.id}/v${v.id}`,
        compact(v.runtime ?? v.co)
      ]),
      ...part.externals.map((x): Element => [
        `${part.id}/x${x.id}`,
        compact(x)
      ]),
      ...part.faces.map(({ id, ...rest }): Element => [
        `${part.id}/f${id}`,
        compact(rest)
      ]),
      ...part.lines.map(({ id, ...rest }): Element => [
        `${part.id}/l${id}`,
        compact(rest)
      ])
    ])
  );

export interface LedgerEntry {
  readonly element: string;
  readonly evidence?: string;
  readonly note: string;
  readonly provenance: 'correction' | 'creative';
}

const describe = (value: string | undefined) =>
  value === undefined ? 'absent' : value;

const section = (title: string, explain: string, items: string[]) =>
  items.length === 0
    ? []
    : [
        `## ${title} (${items.length})`,
        '',
        explain,
        '',
        ...items.map(i => `- ${i}`),
        ''
      ];

/// The fresh-baseline comparison: what re-extraction changed, what the asset's authors changed
/// and why, and where the two collide. Nothing here writes; adopting a recovery change is a
/// separate, deliberate edit.
export const compare = (input: {
  adopted: GeometryAsset;
  edited: GeometryAsset;
  fresh: GeometryAsset;
  ledger: { changes: readonly LedgerEntry[] };
  slug: string;
}): string => {
  const a = elements(input.adopted),
    f = elements(input.fresh),
    e = elements(input.edited);
  const ledger = new Map(
    input.ledger.changes.map(entry => [entry.element, entry])
  );
  const recovery: string[] = [],
    corrections: string[] = [],
    creative: string[] = [],
    unclassified: string[] = [],
    converged: string[] = [],
    conflicts: string[] = [];
  for (const key of [
    ...new Set([...a.keys(), ...f.keys(), ...e.keys()])
  ].sort()) {
    const av = a.get(key),
      fv = f.get(key),
      ev = e.get(key);
    if (av === fv && av === ev) {
      continue;
    }
    if (av === ev) {
      recovery.push(`\`${key}\`: ${describe(av)} → ${describe(fv)}`);
    } else if (av === fv) {
      const entry = ledger.get(key);
      const line = `\`${key}\`: ${describe(av)} → ${describe(ev)}${entry === undefined ? '' : ` — ${entry.note}${entry.evidence === undefined ? '' : ` (${entry.evidence})`}`}`;
      (entry === undefined
        ? unclassified
        : entry.provenance === 'correction'
          ? corrections
          : creative
      ).push(line);
    } else if (fv === ev) {
      converged.push(
        `\`${key}\`: re-extraction now recovers what the asset authored (${describe(ev)}); the ledger entry can retire`
      );
    } else {
      conflicts.push(
        `\`${key}\`: adopted ${describe(av)}, fresh ${describe(fv)}, edited ${describe(ev)}`
      );
    }
  }
  for (const entry of input.ledger.changes) {
    if (entry.provenance === 'correction' && (entry.evidence ?? '') === '') {
      unclassified.push(
        `\`${entry.element}\`: ledger calls this a recovery correction but cites no evidence`
      );
    }
  }
  return [
    `# Fresh-baseline comparison: ${input.slug}`,
    '',
    `Recovery changes ${recovery.length} · recovery corrections ${corrections.length} · creative changes ${creative.length} · converged ${converged.length} · conflicts ${conflicts.length} · unclassified ${unclassified.length}`,
    '',
    ...section(
      'Recovery changes from re-extraction',
      'The fresh baseline differs from the one the asset was adopted from, and the asset never touched these elements. Adopting them is a deliberate edit; nothing was written.',
      recovery
    ),
    ...section(
      'Recovery corrections authored in the asset',
      'Evidence-backed corrections recorded in the ledger.',
      corrections
    ),
    ...section(
      'Creative changes authored in the asset',
      'Deliberate departures from the recovered geometry.',
      creative
    ),
    ...section('Converged', '', converged),
    ...section(
      'Conflicts',
      'Both re-extraction and the asset changed these elements, differently. Resolve by hand.',
      conflicts
    ),
    ...section(
      'Unclassified changes',
      'Authored changes with no ledger entry, or corrections without evidence. A review should refuse these.',
      unclassified
    )
  ].join('\n');
};
