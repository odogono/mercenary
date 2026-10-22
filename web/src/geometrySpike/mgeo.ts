/// Reads MGEO v1, the `.blend` candidate's generated game binary (#671). The layout is documented
/// beside its writer, research/blender-geometry-spike/mercenary_geometry/mgeo.py. Anything
/// truncated, trailing or out of range is refused, never patched up.

import {
  CONTRACT_FORMAT,
  CONTRACT_VERSION,
  type Colour,
  type ColourModel,
  type External,
  type Face,
  type GeometryAsset,
  type Line,
  type Part,
  type PartRole,
  type Title,
  type Vertex
} from '../geometry/contract.ts';

const ROLES: readonly PartRole[] = [
  'attachment',
  'detail',
  'display',
  'glyph',
  'plan',
  'walk',
  'wireframe'
];
const COLOUR_MODELS: readonly ColourModel[] = ['ink', 'none', 'palette'];
const TITLES: readonly Title[] = ['targ', 'damocles'];
const DOUBLE = 1,
  RECORD = 2,
  SCENE = 4,
  CLOSING = 8,
  COLOUR = 16;

export class MalformedGeometry extends Error {}

class Reader {
  private at = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private need(size: number) {
    if (this.at + size > this.bytes.byteLength) {
      throw new MalformedGeometry(`MGEO truncated at byte ${this.at}`);
    }
  }
  u8() {
    this.need(1);
    return this.view.getUint8(this.at++);
  }
  u16() {
    this.need(2);
    const v = this.view.getUint16(this.at, true);
    this.at += 2;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.view.getUint32(this.at, true);
    this.at += 4;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.view.getInt32(this.at, true);
    this.at += 4;
    return v;
  }
  bytesOf(n: number) {
    this.need(n);
    const v = this.bytes.subarray(this.at, this.at + n);
    this.at += n;
    return v;
  }
  get done() {
    return this.at === this.bytes.byteLength;
  }
  get remaining() {
    return this.bytes.byteLength - this.at;
  }
}

const at = <T>(list: readonly T[], index: number, what: string): T => {
  const value = list[index];
  if (value === undefined) {
    throw new MalformedGeometry(`MGEO ${what} index ${index} out of range`);
  }
  return value;
};

const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;

export const decodeMgeo = (bytes: Uint8Array): GeometryAsset => {
  const r = new Reader(bytes);
  if (new TextDecoder().decode(r.bytesOf(4)) !== 'MGEO') {
    throw new MalformedGeometry('not an MGEO file');
  }
  const version = r.u16();
  r.u16();
  if (version !== 1) {
    throw new MalformedGeometry(`MGEO version ${version}, expected 1`);
  }
  const sidecarSha256 = [...r.bytesOf(32)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const strings = Array.from({ length: r.u32() }, () =>
    new TextDecoder('utf-8', { fatal: true }).decode(r.bytesOf(r.u32()))
  );
  const asset = at(strings, r.u32(), 'string');
  const title = at(TITLES, r.u8(), 'title');
  const colours: Colour[] = Array.from({ length: r.u32() }, () => {
    const kind = r.u8();
    if (kind === 0) {
      return { ink: r.u32(), kind: 'ink' };
    }
    if (kind !== 1) {
      throw new MalformedGeometry(`MGEO colour kind ${kind}`);
    }
    const source = r.u32(),
      rgb = r.u32(),
      hasDay = r.u8(),
      day = r.u32();
    return {
      colour: hex(rgb),
      kind: 'palette',
      source,
      ...(hasDay ? { day: hex(day) } : {})
    };
  });
  const scenes = Array.from({ length: r.u32() }, () =>
    Array.from({ length: r.u16() }, () => r.u32())
  );
  const parts: Part[] = Array.from({ length: r.u32() }, () => {
    const id = at(strings, r.u32(), 'string');
    const role = at(ROLES, r.u8(), 'role');
    const colourModel = at(COLOUR_MODELS, r.u8(), 'colour model');
    const vertices: Vertex[] = Array.from({ length: r.u32() }, () => {
      const vid = r.u32();
      const co = [r.i32(), r.i32(), r.i32()] as const;
      const kind = r.u8();
      return kind === 1
        ? {
            co,
            id: vid,
            runtime: {
              input: [r.i32(), r.i32(), r.i32()] as const,
              kind: 'rotated-input' as const
            }
          }
        : { co, id: vid };
    });
    const externals: External[] = Array.from({ length: r.u32() }, () => {
      const xid = r.u32();
      r.u8();
      const slot = r.u32();
      const hasDisplay = r.u8();
      const display = [r.i32(), r.i32(), r.i32()] as const;
      return {
        display: hasDisplay ? display : null,
        id: xid,
        slot,
        workspace: 'road' as const
      };
    });
    const points = [...vertices.map(v => v.id), ...externals.map(x => x.id)];
    const primitive = () => {
      const pid = r.u32(),
        flags = r.u8(),
        record = r.u32(),
        colour = r.u32(),
        scene = r.u32();
      return {
        flags,
        item: {
          id: pid,
          ...(flags & COLOUR ? { colour: at(colours, colour, 'colour') } : {}),
          ...(flags & RECORD ? { record } : {}),
          ...(flags & SCENE ? { sceneSlots: at(scenes, scene, 'scene') } : {})
        }
      };
    };
    const faces: Face[] = Array.from({ length: r.u32() }, () => {
      const { flags, item } = primitive();
      const loop = Array.from(
        { length: r.u32() },
        () => at(vertices, r.u32(), 'vertex').id
      );
      return {
        ...item,
        loop,
        ...(flags & DOUBLE ? { doubleSided: true as const } : {}),
        ...(flags & CLOSING ? { closingRepeat: true as const } : {})
      };
    });
    const lines: Line[] = Array.from({ length: r.u32() }, () => {
      const { item } = primitive();
      return {
        ...item,
        ends: [at(points, r.u32(), 'point'), at(points, r.u32(), 'point')]
      };
    });
    return { colourModel, externals, faces, id, lines, role, vertices };
  });
  if (!r.done) {
    throw new MalformedGeometry(`MGEO has ${r.remaining} trailing bytes`);
  }
  return {
    asset,
    format: CONTRACT_FORMAT,
    parts,
    sidecarSha256,
    title,
    version: CONTRACT_VERSION
  };
};
