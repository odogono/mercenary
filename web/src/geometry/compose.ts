/// Turn a geometry asset and its sidecar back into the payload record the existing readers and
/// renderers take. An untouched asset composes to its source record exactly; an edited one
/// composes only once every reference that resolved at baseline still resolves.

import { sha256 } from '../hash/index.ts';
import {
  canonicalJson,
  type Colour,
  type Face,
  type GeometryAsset,
  type Line,
  type Part,
  type Reference,
  type Sidecar
} from './contract.ts';
import { partsMatching, referenceSites, resolves } from './references.ts';

type Json = Record<string, unknown>;

export interface Diagnostic {
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly site: string;
}

export class RejectedAsset extends Error {
  constructor(readonly diagnostics: readonly Diagnostic[]) {
    super(
      diagnostics
        .filter(d => d.severity === 'error')
        .map(d => `${d.site}: ${d.message}`)
        .join('\n')
    );
  }
}

const ROAD_WORKSPACE_FIRST_SLOT = 60;

const referenceValue = (asset: GeometryAsset, reference: Reference): number => {
  const { target } = reference;
  const part = partsMatching(asset.parts, target.part)[0];
  const index = part?.faces.findIndex(face => face.id === target.id) ?? -1;
  // A reference that never resolved keeps the index the source recorded.
  return index >= 0 ? index : target.id;
};

/// Structural checks every candidate's reader runs before composing: identities are unique,
/// primitives name elements that exist, and the sidecar names the same asset.
export const checkAsset = (
  asset: GeometryAsset,
  sidecar: Sidecar
): Diagnostic[] => {
  const out: Diagnostic[] = [];
  const error = (site: string, message: string) =>
    out.push({ message, severity: 'error', site });
  if (sidecar.version !== 2) {
    error(
      'version',
      'needs sidecar version 2; recover the baseline again with the current tools'
    );
    return out;
  }
  if (asset.asset !== sidecar.asset) {
    error(
      'asset',
      `geometry is ${asset.asset} but sidecar is ${sidecar.asset}`
    );
  }
  const seenParts = new Set<string>();
  for (const part of asset.parts) {
    const site = (s: string) => `${part.id}${s}`;
    if (seenParts.has(part.id)) {
      error(part.id, 'duplicate part identity');
    }
    seenParts.add(part.id);
    const points = new Map<number, 'external' | 'vertex'>();
    for (const vertex of part.vertices) {
      if (points.has(vertex.id)) {
        error(site(`/v${vertex.id}`), 'duplicate vertex identity');
      }
      points.set(vertex.id, 'vertex');
      if (!vertex.co.every(Number.isInteger)) {
        error(
          site(`/v${vertex.id}`),
          `non-integer coordinate ${vertex.co.join(', ')}; game units are integers`
        );
      }
    }
    for (const external of part.externals) {
      if (points.has(external.id)) {
        error(
          site(`/x${external.id}`),
          'external endpoint reuses a vertex identity'
        );
      }
      points.set(external.id, 'external');
    }
    const faceIds = new Set<number>();
    for (const face of part.faces) {
      if (faceIds.has(face.id)) {
        error(site(`/f${face.id}`), 'duplicate face identity');
      }
      faceIds.add(face.id);
      if (face.loop.length < 3) {
        error(site(`/f${face.id}`), 'a face needs at least three vertices');
      }
      if (new Set(face.loop).size !== face.loop.length) {
        error(site(`/f${face.id}`), 'face repeats a vertex');
      }
      for (const id of face.loop) {
        if (points.get(id) !== 'vertex') {
          error(
            site(`/f${face.id}`),
            `names v${id}, which is not a vertex of this part`
          );
        }
      }
      colourCheck(asset, part, face.colour, site(`/f${face.id}`), error);
    }
    const lineIds = new Set<number>();
    for (const line of part.lines) {
      if (lineIds.has(line.id)) {
        error(site(`/l${line.id}`), 'duplicate line identity');
      }
      lineIds.add(line.id);
      if (line.ends[0] === line.ends[1]) {
        error(site(`/l${line.id}`), 'line ends on its own start');
      }
      for (const id of line.ends) {
        if (!points.has(id)) {
          error(
            site(`/l${line.id}`),
            `names ${id}, which is neither a vertex nor an external endpoint`
          );
        }
      }
      colourCheck(asset, part, line.colour, site(`/l${line.id}`), error);
    }
  }
  out.push(...checkReferences(asset, sidecar));
  return out;
};

export const checkReferences = (
  asset: GeometryAsset,
  sidecar: Sidecar
): Diagnostic[] => {
  const out: Diagnostic[] = [];
  const resolved = new Map<string, boolean>();
  for (const binding of referenceSites(sidecar.record)) {
    const reference =
      binding.target === undefined &&
      Number.isInteger(binding.reference) &&
      binding.reference! >= 0
        ? sidecar.references[binding.reference!]
        : undefined;
    const target = binding.target ?? reference?.target;
    if (target === undefined) {
      out.push({
        message:
          'attachmentFace needs a valid $ref table index; restore or remap its index in the sidecar.',
        severity: 'error',
        site: binding.site
      });
      continue;
    }
    const key = JSON.stringify(target);
    const exists = resolved.get(key) ?? resolves(asset.parts, target);
    resolved.set(key, exists);
    const baselineUnresolved =
      target.kind === 'record'
        ? sidecar.unresolvedRecords?.[target.part]?.includes(target.record) ===
          true
        : reference?.baselineResolved === false;
    if (!exists && !baselineUnresolved) {
      const what =
        target.kind === 'record'
          ? `source record ${target.record} in ${target.part}`
          : `face ${target.id} in ${target.part}`;
      const remedy =
        target.kind === 'record'
          ? 'change the inline index or record number at this site in the sidecar'
          : `remap ref ${binding.reference} in the sidecar to an existing target`;
      out.push({
        message: `references ${what}, which no longer exists. Restore a primitive carrying it, or ${remedy}.`,
        severity: 'error',
        site: binding.site
      });
    }
  }
  return out;
};

/// A Targ palette part may leave a primitive uncoloured, to draw in Line Colour; a Damocles one
/// colours every primitive, through the colour word its payload record stores.
const colourCheck = (
  asset: GeometryAsset,
  part: Part,
  colour: Colour | undefined,
  site: string,
  error: (site: string, message: string) => void
) => {
  if (part.colourModel === 'none') {
    if (colour !== undefined) {
      error(site, 'this part carries no colours');
    }
    return;
  }
  if (
    colour === undefined &&
    part.colourModel === 'palette' &&
    asset.title === 'targ'
  ) {
    return;
  }
  if (colour?.kind !== part.colourModel) {
    error(site, `needs a ${part.colourModel} colour`);
    return;
  }
  if (colour.kind !== 'palette') {
    return;
  }
  if (!/^#[\da-f]{6}$/.test(colour.colour)) {
    error(site, `colour ${colour.colour} is not #rrggbb`);
  }
  if (asset.title === 'damocles' && colour.source === undefined) {
    error(site, 'needs a colour word; Damocles records store one');
  }
};

const indexer = (part: Part) => {
  const index = new Map(part.vertices.map((vertex, i) => [vertex.id, i]));
  return (id: number) => {
    const at = index.get(id);
    if (at === undefined) {
      throw new Error(`${part.id}: v${id} is not a vertex`);
    }
    return at;
  };
};

const damoclesPrimitive = (
  primitive: Face | Line,
  indices: number[],
  doubleSided: boolean
): Json => {
  const colour = primitive.colour as Colour & { kind: 'palette' };
  return {
    colour: colour.colour,
    ...(colour.day === undefined ? {} : { dayColour: colour.day }),
    ...(doubleSided ? { doubleSided: true } : {}),
    ...(primitive.sceneSlots === undefined
      ? {}
      : { sceneSlots: primitive.sceneSlots }),
    sourceColour: colour.source,
    ...(primitive.record === undefined
      ? {}
      : { sourceIndex: primitive.record }),
    vertices: indices
  };
};

const damoclesMesh = (part: Part, rest: Json): Json => {
  const at = indexer(part);
  return {
    ...rest,
    faces: part.faces.map(face => {
      const loop = face.loop.map(at);
      return damoclesPrimitive(
        face,
        face.closingRepeat ? [...loop, loop[0]!] : loop,
        face.doubleSided === true
      );
    }),
    lines: part.lines.map(line =>
      damoclesPrimitive(line, line.ends.map(at), false)
    ),
    vertices: part.vertices.map(vertex => [...vertex.co])
  };
};

/// Targ indices: a local vertex by position, an external endpoint by its slot number.
const targIndex = (part: Part) => {
  const at = new Map(part.vertices.map((vertex, i) => [vertex.id, i]));
  const external = new Map(part.externals.map(x => [x.id, x.slot]));
  return (id: number) => at.get(id) ?? external.get(id)!;
};

const fill = (
  asset: GeometryAsset,
  sidecar: Sidecar,
  value: unknown,
  diagnostics: Diagnostic[]
): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => fill(asset, sidecar, item, diagnostics));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const json = value as Json;
  const part = (key: string) => {
    const id = json[key] as string;
    const found = asset.parts.find(p => p.id === id);
    if (found === undefined) {
      throw new RejectedAsset([
        {
          message: `sidecar names part ${id}, which the geometry lacks`,
          severity: 'error',
          site: id
        }
      ]);
    }
    return found;
  };
  if ('$ref' in json) {
    return referenceValue(asset, sidecar.references[json['$ref'] as number]!);
  }
  if ('$mesh' in json) {
    const { $mesh: _, ...rest } = json;
    return damoclesMesh(part('$mesh'), rest);
  }
  if ('$vertices' in json) {
    return part('$vertices').vertices.map(vertex => [...vertex.co]);
  }
  if ('$edges' in json) {
    const p = part('$edges');
    const at = targIndex(p);
    return p.lines.map(line => line.ends.map(at));
  }
  if ('$surfaceVertices' in json) {
    const p = part('$surfaceVertices');
    if (p.vertices.length > ROAD_WORKSPACE_FIRST_SLOT) {
      diagnostics.push({
        message: `${p.vertices.length} local vertices; indices 60–63 address the Road Workspace, so a surface cell holds at most 60`,
        severity: 'error',
        site: p.id
      });
    }
    return p.vertices.map(vertex =>
      vertex.runtime === undefined
        ? { kind: 'world-point', position: [...vertex.co] }
        : { kind: 'rotated-input', rotationInput: [...vertex.runtime.input] }
    );
  }
  if ('$surfaceEdges' in json) {
    const p = part('$surfaceEdges');
    const at = targIndex(p);
    return p.lines.map(line => [
      ...line.ends.map(at),
      (line.colour as Colour & { kind: 'ink' }).ink
    ]);
  }
  return Object.fromEntries(
    Object.entries(json).map(([key, item]) => [
      key,
      fill(asset, sidecar, item, diagnostics)
    ])
  );
};

/// A warning when the asset was exported against a different sidecar than the one beside it.
export const checkSidecarHash = async (
  asset: GeometryAsset,
  sidecar: Sidecar
): Promise<Diagnostic[]> => {
  const expected = await sha256(canonicalJson(sidecar));
  return asset.sidecarSha256 === expected
    ? []
    : [
        {
          message: `geometry was linked to sidecar ${asset.sidecarSha256.slice(0, 12)}…, this sidecar is ${expected.slice(0, 12)}… (re-export after editing the sidecar)`,
          severity: 'warning',
          site: 'sidecarSha256'
        }
      ];
};

/// The payload record, or a rejection listing every actionable error.
export const compose = (
  asset: GeometryAsset,
  sidecar: Sidecar
): { diagnostics: readonly Diagnostic[]; record: unknown } => {
  const diagnostics = checkAsset(asset, sidecar);
  if (diagnostics.some(d => d.severity === 'error')) {
    throw new RejectedAsset(diagnostics);
  }
  return composeValidated(asset, sidecar, diagnostics);
};

/// Composition alone for the measurement tool, after build-time validation of unchanged inputs.
export const composeValidated = (
  asset: GeometryAsset,
  sidecar: Sidecar,
  diagnostics: Diagnostic[] = []
): { diagnostics: readonly Diagnostic[]; record: unknown } => {
  const record = fill(asset, sidecar, sidecar.record, diagnostics);
  if (diagnostics.some(d => d.severity === 'error')) {
    throw new RejectedAsset(diagnostics);
  }
  return { diagnostics, record };
};
