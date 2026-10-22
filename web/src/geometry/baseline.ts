/// Recover a Geometry Asset and Asset Sidecar from one payload record (ADR 0081). It reads the payload as the extractor left it
/// and writes nowhere; the caller chooses where the baseline lands, and never over an asset.

import { sha256 } from '../hash/index.ts';
import {
  CONTRACT_FORMAT,
  CONTRACT_VERSION,
  canonicalJson,
  type Colour,
  type External,
  type Face,
  type Family,
  type GeometryAsset,
  type Line,
  type Part,
  type PartRole,
  type Point3,
  type Reference,
  type Sidecar,
  type Title,
  type Vertex
} from './contract.ts';
import { referenceSites, resolves } from './references.ts';

/// Thrown where a record carries geometry this contract cannot yet represent losslessly. The
/// corpus sweep counts these rather than silently dropping fields.
export class UnsupportedGeometry extends Error {
  override name = 'UnsupportedGeometry';
}

type Json = Record<string, unknown>;

/// Mesh fields that hold no vertex or primitive indices and so travel in the sidecar unchanged.
const MESH_PASSTHROUGH = new Set([
  'displayCode',
  'geometryStart',
  'labelAnchor',
  'recordCount',
  'sourceEnd',
  'sourceStart',
  'unreferencedRecords'
]);
const PRIMITIVE_FIELDS = new Set([
  'colour',
  'dayColour',
  'doubleSided',
  'sceneSlots',
  'sourceColour',
  'sourceIndex',
  'vertices'
]);

class Builder {
  readonly parts: Part[] = [];
  readonly references: Reference[] = [];

  reference(target: Reference['target'], resolved: boolean) {
    const id = this.references.length;
    this.references.push({
      ...(resolved ? {} : { baselineResolved: false as const }),
      target
    });
    return { $ref: id };
  }

  part(id: string): Part | undefined {
    return this.parts.find(part => part.id === id);
  }
}

const point = (value: unknown, where: string): Point3 => {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(n => Number.isInteger(n))
  ) {
    throw new UnsupportedGeometry(`${where}: not an integer point`);
  }
  return [value[0], value[1], value[2]];
};

const paletteColour = (primitive: Json): Colour => ({
  colour: primitive['colour'] as string,
  kind: 'palette',
  source: primitive['sourceColour'] as number,
  ...(primitive['dayColour'] === undefined
    ? {}
    : { day: primitive['dayColour'] as string })
});

/// One Damocles Mesh as a part, and its sidecar placeholder carrying every non-geometry field.
const damoclesPart = (
  builder: Builder,
  id: string,
  role: PartRole,
  mesh: Json
): Json => {
  const placeholder: Json = { $mesh: id };
  for (const [key, value] of Object.entries(mesh)) {
    if (key === 'faces' || key === 'lines' || key === 'vertices') {
      continue;
    }
    if (!MESH_PASSTHROUGH.has(key)) {
      throw new UnsupportedGeometry(
        `${id}: mesh field '${key}' is not modelled by the Geometry Asset contract`
      );
    }
    placeholder[key] = value;
  }
  const vertices: Vertex[] = (mesh['vertices'] as unknown[]).map((v, i) => ({
    co: point(v, `${id}.vertices[${i}]`),
    id: i
  }));
  const primitive = (raw: Json, where: string) => {
    for (const key of Object.keys(raw)) {
      if (!PRIMITIVE_FIELDS.has(key)) {
        throw new UnsupportedGeometry(`${where}: primitive field '${key}'`);
      }
    }
    const indices = raw['vertices'] as number[];
    if (indices.some(i => i < 0 || i >= vertices.length)) {
      throw new UnsupportedGeometry(`${where}: vertex index out of range`);
    }
    return {
      colour: paletteColour(raw),
      indices,
      ...(raw['sourceIndex'] === undefined
        ? {}
        : { record: raw['sourceIndex'] as number }),
      ...(raw['sceneSlots'] === undefined
        ? {}
        : { sceneSlots: raw['sceneSlots'] as number[] })
    };
  };
  const faces: Face[] = (mesh['faces'] as Json[]).map((raw, i) => {
    const { indices, ...rest } = primitive(raw, `${id}.faces[${i}]`);
    const closing = indices.length > 3 && indices[0] === indices.at(-1);
    const loop = closing ? indices.slice(0, -1) : indices;
    if (new Set(loop).size !== loop.length) {
      throw new UnsupportedGeometry(
        `${id}.faces[${i}]: repeats a vertex other than a closing repeat`
      );
    }
    return {
      ...rest,
      id: i,
      loop,
      ...(closing ? { closingRepeat: true as const } : {}),
      ...(raw['doubleSided'] === true ? { doubleSided: true as const } : {})
    };
  });
  const lines: Line[] = (mesh['lines'] as Json[]).map((raw, i) => {
    const { indices, ...rest } = primitive(raw, `${id}.lines[${i}]`);
    if (indices.length !== 2) {
      throw new UnsupportedGeometry(`${id}.lines[${i}]: not a two-point line`);
    }
    if (raw['doubleSided'] !== undefined) {
      throw new UnsupportedGeometry(`${id}.lines[${i}]: sided line`);
    }
    return { ...rest, ends: [indices[0]!, indices[1]!], id: i };
  });
  builder.parts.push({
    colourModel: 'palette',
    externals: [],
    faces,
    id,
    lines,
    role,
    vertices
  });
  return placeholder;
};

/// Only positional indices are rewritten; source records survive geometry editing.
const queueEntry = (builder: Builder, entry: Json): Json => {
  if (entry['kind'] === 'attachmentFace') {
    const part = `attachment:${entry['slot'] as number}`;
    const index = entry['index'] as number;
    return {
      ...entry,
      index: builder.reference(
        { id: index, kind: 'face', part },
        builder.part(part)?.faces.some(face => face.id === index) === true
      )
    };
  }
  return entry;
};

const damoclesRecord = (builder: Builder, model: Json): Json => {
  const record: Json = { ...model };
  record['variants'] = (model['variants'] as Json[]).map(variant => {
    const out: Json = { ...variant };
    out['mesh'] = damoclesPart(
      builder,
      `variant:${variant['id'] as string}`,
      'display',
      variant['mesh'] as Json
    );
    if (variant['walkMesh'] !== undefined) {
      out['walkMesh'] = damoclesPart(
        builder,
        `walk:${variant['id'] as string}`,
        'walk',
        variant['walkMesh'] as Json
      );
    }
    return out;
  });
  const selection = model['structureSelection'] as Json | undefined;
  if (selection !== undefined) {
    const out: Json = { ...selection };
    out['plan'] = damoclesPart(
      builder,
      'plan',
      'plan',
      selection['plan'] as Json
    );
    out['attachments'] = (selection['attachments'] as Json[]).map(item => ({
      ...item,
      mesh: damoclesPart(
        builder,
        `attachment:${item['slot'] as number}`,
        'attachment',
        item['mesh'] as Json
      )
    }));
    if (selection['wallTexts'] !== undefined) {
      out['wallTexts'] = (selection['wallTexts'] as Json[]).map((text, i) => {
        const fallback = text['fallback'] as Json | undefined;
        return {
          ...text,
          face: queueEntry(builder, text['face'] as Json),
          mesh: damoclesPart(
            builder,
            `wallText:${i}`,
            'glyph',
            text['mesh'] as Json
          ),
          ...(fallback === undefined
            ? {}
            : {
                fallback: {
                  ...fallback,
                  mesh: damoclesPart(
                    builder,
                    `wallTextFallback:${i}`,
                    'glyph',
                    fallback['mesh'] as Json
                  )
                }
              })
        };
      });
    }
    if (selection['floorLabels'] !== undefined) {
      out['floorLabels'] = (selection['floorLabels'] as Json[]).map(label => ({
        ...label,
        face: queueEntry(builder, label['face'] as Json)
      }));
    }
    out['regions'] = (selection['regions'] as Json[]).map(region => ({
      ...region,
      queue: (region['queue'] as Json[]).map(entry =>
        queueEntry(builder, entry)
      )
    }));
    record['structureSelection'] = out;
  }
  const cellNumber = model['cellNumber'] as Json | undefined;
  if (cellNumber !== undefined) {
    record['cellNumber'] = {
      ...cellNumber,
      places: (cellNumber['places'] as Json[]).map((place, p) => ({
        ...place,
        glyphs: Object.fromEntries(
          Object.entries(place['glyphs'] as Record<string, Json>).map(
            ([digit, mesh]) => [
              digit,
              damoclesPart(builder, `cellNumber:${p}:${digit}`, 'glyph', mesh)
            ]
          )
        )
      }))
    };
  }
  return record;
};

/// A Targ wireframe: integer vertices and two-index edges, no colour.
const targWireframe = (
  builder: Builder,
  vertices: unknown[],
  edges: unknown[]
) => {
  const part: Part = {
    colourModel: 'none',
    externals: [],
    faces: [],
    id: 'wireframe',
    lines: edges.map((edge, i) => {
      if (!Array.isArray(edge) || edge.length !== 2) {
        throw new UnsupportedGeometry(`edges[${i}]: not a two-index edge`);
      }
      return { ends: [edge[0] as number, edge[1] as number], id: i };
    }),
    role: 'wireframe',
    vertices: vertices.map((v, i) => ({
      co: point(v, `vertices[${i}]`),
      id: i
    }))
  };
  builder.parts.push(part);
};

/// Display positions for a surface cell's runtime-dependent points, which only the World can
/// resolve: rotated inputs at elapsed time zero and the cell's Road Workspace slots.
export interface SurfaceDisplay {
  readonly roadWorkspace: readonly (Point3 | undefined)[];
  readonly rotated: (input: Point3) => Point3;
}

const ROAD_WORKSPACE_FIRST_SLOT = 60;
const ROAD_WORKSPACE_SLOTS = 4;

const targSurfaceCell = (
  builder: Builder,
  cell: Json,
  display: SurfaceDisplay
) => {
  const raw = cell['vertices'] as Json[];
  const vertices: Vertex[] = raw.map((vertex, i) => {
    if (vertex['kind'] === 'world-point') {
      return { co: point(vertex['position'], `vertices[${i}]`), id: i };
    }
    if (vertex['kind'] === 'rotated-input') {
      const input = point(vertex['rotationInput'], `vertices[${i}]`);
      return {
        co: display.rotated(input),
        id: i,
        runtime: { input, kind: 'rotated-input' }
      };
    }
    throw new UnsupportedGeometry(
      `vertices[${i}]: kind ${String(vertex['kind'])}`
    );
  });
  const externals = new Map<number, External>();
  const lines: Line[] = (cell['edges'] as number[][]).map((edge, i) => {
    if (edge.length !== 3) {
      throw new UnsupportedGeometry(`edges[${i}]: not an inked edge`);
    }
    for (const end of [edge[0]!, edge[1]!]) {
      if (end < vertices.length) {
        continue;
      }
      const slot = end - ROAD_WORKSPACE_FIRST_SLOT;
      if (slot < 0 || slot >= ROAD_WORKSPACE_SLOTS) {
        throw new UnsupportedGeometry(
          `edges[${i}]: index ${end} resolves nowhere`
        );
      }
      externals.set(end, {
        display: display.roadWorkspace[slot] ?? null,
        id: end,
        slot: end,
        workspace: 'road'
      });
    }
    return {
      colour: { ink: edge[2]!, kind: 'ink' },
      ends: [edge[0]!, edge[1]!],
      id: i
    };
  });
  builder.parts.push({
    colourModel: 'ink',
    externals: [...externals.values()].sort((a, b) => a.id - b.id),
    faces: [],
    id: 'wireframe',
    lines,
    role: 'wireframe',
    vertices
  });
};

/// A Room's doorway openings are placed by their own coordinates, not by vertex identity. Record
/// which frame vertices lie at each doorway so a review can see when an edit moves one away from
/// the metadata that still names the old opening. Derived, not recovered.
const doorwayWatches = (room: Json) => {
  const vertices = room['vertices'] as number[][];
  return (room['doorways'] as Json[]).map(doorway => {
    const position = doorway['position'] as { x: number; z: number };
    const plane = doorway['plane'] as string;
    const frame = vertices
      .map((v, i) => ({ i, v }))
      .filter(({ v }) =>
        plane === 'zy'
          ? v[0] === position.x && Math.abs(v[2]! - position.z) <= 512
          : v[2] === position.z && Math.abs(v[0]! - position.x) <= 512
      )
      .map(({ i }) => i)
      .filter(i => {
        const v = vertices[i]!;
        // The Room's own corners are not a doorway's frame.
        return !([0, 4096].includes(v[0]!) && [0, 4096].includes(v[2]!));
      });
    return {
      kind: 'vertexWatch',
      message: `doorway ${doorway['index'] as number} (${plane} at x ${position.x}, z ${position.z}) is placed by coordinates; these frame vertices stood there at baseline`,
      part: 'wireframe',
      provenance: 'derived',
      vertices: frame
    };
  });
};

export interface Recovered {
  readonly asset: GeometryAsset;
  readonly sidecar: Sidecar;
}

export interface Source {
  readonly document: string;
  readonly path: string;
  readonly sha256: string;
}

const finish = async (
  builder: Builder,
  asset: string,
  title: Title,
  family: Family,
  record: unknown,
  source: Source,
  extra: Json = {}
): Promise<Recovered> => {
  const unresolved: Record<string, number[]> = {};
  for (const { target } of referenceSites(record)) {
    if (target?.kind === 'record' && !resolves(builder.parts, target)) {
      const records = (unresolved[target.part] ??= []);
      if (!records.includes(target.record)) {
        records.push(target.record);
      }
    }
  }
  const sidecar: Sidecar = {
    asset,
    family,
    format: 'mercenary-geometry-sidecar',
    record,
    references: builder.references,
    source,
    title,
    version: 2,
    ...(Object.keys(unresolved).length === 0
      ? {}
      : { unresolvedRecords: unresolved }),
    ...extra
  };
  return {
    asset: {
      asset,
      format: CONTRACT_FORMAT,
      parts: builder.parts,
      sidecarSha256: await sha256(canonicalJson(sidecar)),
      title,
      version: CONTRACT_VERSION
    },
    sidecar
  };
};

export const recoverDamoclesModel = (
  file: Json,
  source: Source
): Promise<Recovered> => {
  const builder = new Builder();
  const model = file['model'] as Json;
  const record = { ...file, model: damoclesRecord(builder, model) };
  return finish(
    builder,
    `damocles:${model['id'] as string}`,
    'damocles',
    'damocles-model',
    record,
    source
  );
};

export const recoverTargObjectModel = (
  model: Json,
  source: Source
): Promise<Recovered> => {
  const builder = new Builder();
  targWireframe(
    builder,
    model['vertices'] as unknown[],
    model['edges'] as unknown[]
  );
  return finish(
    builder,
    `targ:${model['id'] as string}`,
    'targ',
    'targ-object-model',
    {
      ...model,
      edges: { $edges: 'wireframe' },
      vertices: { $vertices: 'wireframe' }
    },
    source
  );
};

export const recoverTargRoom = (
  room: Json,
  source: Source
): Promise<Recovered> => {
  const builder = new Builder();
  targWireframe(
    builder,
    room['vertices'] as unknown[],
    room['edges'] as unknown[]
  );
  return finish(
    builder,
    `targ:room:${room['room'] as number}`,
    'targ',
    'targ-room',
    {
      ...room,
      edges: { $edges: 'wireframe' },
      vertices: { $vertices: 'wireframe' }
    },
    source,
    { advisories: doorwayWatches(room) }
  );
};

export const recoverTargSurfaceCell = (
  cell: Json,
  source: Source,
  display: SurfaceDisplay
): Promise<Recovered> => {
  const builder = new Builder();
  targSurfaceCell(builder, cell, display);
  return finish(
    builder,
    `targ:surface-cell:${cell['cell'] as number}`,
    'targ',
    'targ-surface-cell',
    {
      ...cell,
      edges: { $surfaceEdges: 'wireframe' },
      vertices: { $surfaceVertices: 'wireframe' }
    },
    source
  );
};
