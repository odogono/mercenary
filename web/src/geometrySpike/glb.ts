/// Reads the GLB candidate (#671): the `MERCENARY_geometry` extension is the source of truth, and
/// a GLB without it is refused. Triangles and line primitives are display for standard viewers
/// and are not read back. The writer is research/blender-geometry-spike/mercenary_geometry/glb.py.

import type {
  Colour,
  External,
  Face,
  GeometryAsset,
  Line,
  Part
} from './contract.ts';
import { MalformedGeometry } from './mgeo.ts';

export const EXTENSION = 'MERCENARY_geometry';
const FLOAT = 5126,
  UINT = 5125;
const DOUBLE = 1,
  RECORD = 2,
  SCENE = 4,
  CLOSING = 8,
  COLOUR = 16;

interface Accessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: 'SCALAR' | 'VEC3';
}
interface Block {
  colours: number | null;
  count: number;
  flags: number | null;
  ids: number | null;
  records: number | null;
  scenes: number | null;
}
interface MeshExtension {
  colourModel: Part['colourModel'];
  externals: External[];
  faces: Block & { loopLengths: number | null; loopVertices: number | null };
  lines: Block & { ends: number | null };
  part: string;
  position: number | null;
  role: Part['role'];
  runtime: {
    index: number;
    input: [number, number, number];
    kind: 'rotated-input';
  }[];
  vertexCount: number;
  vertexIds: number | null;
}
interface RootExtension {
  asset: string;
  colours: Colour[];
  format: GeometryAsset['format'];
  sceneSets: number[][];
  sidecarSha256: string;
  title: GeometryAsset['title'];
  version: GeometryAsset['version'];
}
interface Gltf {
  accessors: Accessor[];
  bufferViews: { byteLength: number; byteOffset?: number }[];
  extensions?: Record<string, unknown>;
  meshes: { extensions?: Record<string, unknown>; name?: string }[];
}

export const parseGlb = (
  bytes: Uint8Array
): { binary: Uint8Array; json: Gltf } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46_54_6c_67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  ) {
    throw new MalformedGeometry('not a glTF 2.0 GLB');
  }
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e_4f_53_4a) {
    throw new MalformedGeometry('GLB first chunk is not JSON');
  }
  const json = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + length))
  ) as Gltf;
  let binary: Uint8Array = new Uint8Array(0);
  const at = 20 + length;
  if (
    at + 8 <= bytes.byteLength &&
    view.getUint32(at + 4, true) === 0x00_4e_49_42
  ) {
    binary = bytes.subarray(at + 8, at + 8 + view.getUint32(at, true));
  }
  return { binary, json };
};

export const decodeGlb = (bytes: Uint8Array): GeometryAsset => {
  const { binary, json } = parseGlb(bytes);
  const root = json.extensions?.[EXTENSION] as RootExtension | undefined;
  if (root === undefined) {
    throw new MalformedGeometry(
      `GLB has no ${EXTENSION} extension: polygon boundaries, identities and game colours were lost (typically by a standard glTF export). Re-import the canonical GLB with the Mercenary add-on.`
    );
  }
  const data = new DataView(
    binary.buffer,
    binary.byteOffset,
    binary.byteLength
  );
  const read = (index: number | null, component = UINT): number[] => {
    if (index === null) {
      return [];
    }
    const accessor = json.accessors[index];
    const bufferView = accessor && json.bufferViews[accessor.bufferView];
    if (
      accessor === undefined ||
      bufferView === undefined ||
      accessor.componentType !== component
    ) {
      throw new MalformedGeometry(
        `GLB accessor ${index} is missing or of the wrong type`
      );
    }
    const width = accessor.type === 'VEC3' ? 3 : 1;
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    if (start + accessor.count * width * 4 > binary.byteLength) {
      throw new MalformedGeometry(`GLB accessor ${index} runs past the buffer`);
    }
    return Array.from({ length: accessor.count * width }, (_, k) =>
      component === FLOAT
        ? data.getFloat32(start + 4 * k, true)
        : data.getUint32(start + 4 * k, true)
    );
  };
  const parts: Part[] = json.meshes.map(mesh => {
    const ext = mesh.extensions?.[EXTENSION] as MeshExtension | undefined;
    if (ext === undefined) {
      throw new MalformedGeometry(
        `GLB mesh ${mesh.name ?? '?'} has no ${EXTENSION} extension`
      );
    }
    const coords = read(ext.position, FLOAT);
    if (coords.some(c => !Number.isInteger(c))) {
      throw new MalformedGeometry(
        `${ext.part}: POSITION holds a non-integer coordinate`
      );
    }
    const ids = read(ext.vertexIds);
    const runtime = new Map(ext.runtime.map(item => [item.index, item]));
    const vertices = Array.from({ length: ext.vertexCount }, (_, k) => {
      const item = runtime.get(k);
      const co = [
        coords[3 * k]!,
        coords[3 * k + 1]!,
        coords[3 * k + 2]!
      ] as const;
      return item === undefined
        ? { co, id: ids[k]! }
        : { co, id: ids[k]!, runtime: { input: item.input, kind: item.kind } };
    });
    const points = [
      ...vertices.map(v => v.id),
      ...ext.externals.map(x => x.id)
    ];
    const block = (b: Block) => {
      const [pids, flags, records, colours, scenes] = [
        b.ids,
        b.flags,
        b.records,
        b.colours,
        b.scenes
      ].map(i => read(i)) as [number[], number[], number[], number[], number[]];
      return Array.from({ length: b.count }, (_, k) => ({
        flags: flags[k]!,
        item: {
          id: pids[k]!,
          ...(flags[k]! & COLOUR ? { colour: root.colours[colours[k]!]! } : {}),
          ...(flags[k]! & RECORD ? { record: records[k]! } : {}),
          ...(flags[k]! & SCENE
            ? { sceneSlots: root.sceneSets[scenes[k]!]! }
            : {})
        }
      }));
    };
    const lengths = read(ext.faces.loopLengths);
    const loopVertices = read(ext.faces.loopVertices);
    let offset = 0;
    const faces: Face[] = block(ext.faces).map(({ flags, item }, k) => {
      const loop = loopVertices
        .slice(offset, offset + lengths[k]!)
        .map(i => vertices[i]!.id);
      offset += lengths[k]!;
      return {
        ...item,
        loop,
        ...(flags & DOUBLE ? { doubleSided: true as const } : {}),
        ...(flags & CLOSING ? { closingRepeat: true as const } : {})
      };
    });
    const ends = read(ext.lines.ends);
    const lines: Line[] = block(ext.lines).map(({ item }, k) => ({
      ...item,
      ends: [points[ends[2 * k]!]!, points[ends[2 * k + 1]!]!]
    }));
    return {
      colourModel: ext.colourModel,
      externals: ext.externals,
      faces,
      id: ext.part,
      lines,
      role: ext.role,
      vertices
    };
  });
  return {
    asset: root.asset,
    format: root.format,
    parts,
    sidecarSha256: root.sidecarSha256,
    title: root.title,
    version: root.version
  };
};
