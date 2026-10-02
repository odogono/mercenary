import type { DionSource } from './documents.ts';
import {
  address,
  bool,
  byte,
  fail,
  int,
  ints,
  keyed,
  list,
  nullable,
  optional,
  pair,
  provenance,
  record,
  sword,
  text,
  triple,
  word,
  type Provenance
} from './read.ts';
import { readDionSky, type DionSky } from './sky.ts';

/// The Mercenary III world document, `payload/dion/world.json`.
///
/// It holds the fifteen cells the two opening METIS taxi journeys occupy and every
/// record their frames draw: structures by scale, building details, ground records,
/// scene palettes, models and the residents a frame can paint. Records keep the
/// shape their original readers give them; the planner applies the rules. Values are
/// recovered from the pinned research baseline (`research/mercenary-iii-st/`), each
/// with its source range and SHA-256.

export interface DionCell {
  readonly alias: number | null;
  readonly cell: number;
  readonly detail: number;
  readonly ground: {
    readonly address: number;
    readonly index: number;
    readonly transform: number;
  };
  readonly key: number;
  /// `$7192`: the cell's door-key base, `key / 2 + $1D` for keys 1..`$1E`, else 0.
  readonly keyBase: number;
  /// Cell-local words, `$8000` at the cell centre.
  readonly origin: readonly [number, number];
  readonly palette: number;
  readonly provenance: Provenance;
  /// Ground vertex slots `$F0..$FC`: the packed (z, x) cell whose centre each projects.
  readonly roadPoints: ReadonlyMap<number, number>;
  readonly scale: readonly [number, number];
  readonly slot: number;
  readonly structure: number;
  /// The lettering binding set `(key − $A0) / 2` for keys from `$A0`, else none.
  readonly tokenSet: number | null;
  readonly x: number;
  readonly z: number;
}

export interface DionWall {
  readonly colour: number;
  readonly form: number;
  readonly refs: readonly number[];
}

export interface DionAttachment {
  readonly box: {
    readonly x: readonly [number, number];
    readonly z: readonly [number, number];
  };
  readonly colours: readonly number[];
  readonly control: number;
  readonly controlColour: number | undefined;
  readonly firstVertex: number;
  readonly firstWall: number;
  /// The control word's low byte: a key, a cell-relative key (`$10..$7F`,
  /// `$F0..$FF`) or 0 for keyless.
  readonly key: number | null;
  readonly leaves: readonly [number, number, number, number];
  readonly motionAxis: 'x' | 'z';
  readonly slot: number;
  readonly twoLeaves: boolean;
}

export interface DionWallText {
  readonly anchor: readonly [number, number, number];
  readonly colour: number;
  /// The command's low byte: the advance in glyph units.
  readonly command: number;
  readonly face: number;
  readonly glyphScale: readonly [number, number];
  readonly offset: number;
  /// The flags byte: font in the low nibble, plane in bits 6 and 7.
  readonly plane: number;
  readonly text: readonly number[];
}

export interface DionRegion {
  readonly bounds: {
    readonly x: readonly [number, number];
    readonly z: readonly [number, number];
  };
  readonly flags: number;
  readonly queue: readonly number[];
}

export interface DionStructure {
  readonly associations: readonly {
    readonly hooks: readonly (readonly [number, number])[];
    readonly id: number;
  }[];
  readonly attachments: readonly DionAttachment[];
  readonly heights: readonly [number, number];
  /// Plan vertices, already scaled, structure-local.
  readonly plan: readonly (readonly [number, number])[];
  readonly provenance: Provenance;
  readonly regions: readonly DionRegion[];
  readonly sceneColours: readonly [number, number];
  readonly walls: readonly DionWall[];
  readonly wallTexts: readonly DionWallText[];
}

export type DionPrimitive =
  | {
      readonly colour: number;
      readonly kind: 'polygon';
      readonly refs: readonly number[];
    }
  | {
      readonly colour: number;
      readonly kind: 'line';
      readonly refs: readonly number[];
    };

export interface DionTextRecord {
  readonly advance: number;
  readonly anchor: readonly [number, number, number];
  readonly colour: number;
  readonly flags: number;
  readonly glyphScale: readonly [number, number];
  readonly kind: 'text';
  readonly offset: number;
  readonly text: readonly number[];
}

export interface DionDetailBox {
  readonly records: readonly number[];
  readonly tag: number;
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}

export interface DionDetail {
  readonly extent: {
    readonly x: readonly [number, number];
    readonly y: number;
    readonly z: readonly [number, number];
  } | null;
  readonly groups: readonly {
    readonly boxes: readonly DionDetailBox[];
    readonly default: readonly number[];
  }[];
  readonly index: number;
  readonly primitives: readonly (DionPrimitive | DionTextRecord)[];
  readonly provenance: Provenance;
  readonly tagged: readonly number[];
  readonly vertices: readonly (readonly [number, number, number])[];
}

export type DionGroundPrimitive =
  | DionPrimitive
  | {
      readonly kind: 'template';
      readonly model: number;
      readonly x: number;
      readonly z: number;
    }
  | {
      readonly colour: number;
      readonly header: readonly number[];
      readonly kind: 'text';
      readonly text: readonly number[];
    };

export interface DionGround {
  readonly primitives: readonly DionGroundPrimitive[];
  readonly provenance: Provenance;
  readonly vertices: readonly (readonly [number, number])[];
}

export interface DionScenePalette {
  readonly day: readonly number[];
  readonly night: readonly number[];
  readonly provenance: Provenance;
}

export type DionModelFace =
  | {
      /// The colour byte's address, which the `$8003` and `$800A` headers patch.
      readonly at: number;
      readonly colour: number;
      readonly kind: 'line' | 'polygon';
      readonly refs: readonly number[];
    }
  | { readonly kind: 'drawn' }
  | {
      readonly advance: number;
      readonly colour: number;
      readonly flags: number;
      readonly glyphScale: readonly [number, number];
      readonly kind: 'text';
      readonly offset: readonly [number, number, number];
      readonly pointer: number | undefined;
      readonly text: readonly number[] | undefined;
    };

export interface DionModelHeader {
  readonly code: number | undefined;
  /// `$8003`: the colour byte that takes `value`; `targets` take the blink colour.
  readonly firstTarget: number | undefined;
  readonly mode: number | undefined;
  readonly op: number;
  readonly pivot: readonly [number, number, number] | undefined;
  readonly range: number | undefined;
  /// `$800A`: the one colour byte that takes `value`.
  readonly target: number | undefined;
  readonly targets: readonly number[] | undefined;
  readonly value: number | undefined;
  readonly yawOffset: number | undefined;
}

export interface DionModelForm {
  readonly alternatives: readonly {
    readonly faces: readonly DionModelFace[];
    readonly min: readonly [number, number, number];
    readonly size: readonly [number, number, number];
  }[];
  readonly faces: readonly DionModelFace[];
  readonly provenance: Provenance;
  readonly vertices: readonly (readonly [number, number, number])[];
}

export interface DionModel extends DionModelForm {
  readonly entry: number;
  readonly header: DionModelHeader | undefined;
  readonly name: string | undefined;
  readonly passenger: DionModelForm | undefined;
}

export interface DionResident {
  readonly association: number;
  readonly body: number;
  readonly cell: number;
  readonly group: number;
  readonly model: number | null;
  readonly position: readonly [number, number, number];
  readonly slot: number;
  readonly state: number;
  readonly yaw: number;
  readonly zone: number;
}

export interface DionGlyph {
  readonly code: number;
  readonly font: number;
  readonly form: number;
  readonly points: readonly (readonly [number, number])[];
  readonly primitives: readonly {
    readonly colour: number | undefined;
    readonly kind: 'line' | 'polygon';
    readonly refs: readonly number[];
  }[];
}

export interface DionFramePalette {
  readonly fixed: ReadonlyMap<number, number>;
  readonly horizonRow: number;
  readonly land: number;
  readonly road: number;
  readonly skyDay: number;
  readonly skyNight: number;
  /// `$7CA2`: the sixteen entries each frame starts from, `$8000` free, and the land
  /// entry the horizon split writes into colour 8.
  readonly template: readonly number[];
}

export interface DionOpening {
  /// Twelve packed BCD digits, `$72DE..$72E3`.
  readonly cash: string;
  readonly cell: number;
  readonly clock: {
    readonly accumulator: number;
    readonly day: number;
    readonly refill: number;
    readonly seconds: number;
    readonly step: number;
  };
  readonly eye: readonly [number, number, number];
  readonly frameCounter: number;
  readonly gauges: {
    readonly inventory: number;
    readonly p: number;
    readonly t: number;
  };
  /// The cell-grid origin of the METIS workspace on its Body, in whole cells.
  readonly groupOrigin: readonly [number, number];
  readonly heading: number;
  /// `$713C`: the roster entry the panel names.
  readonly location: number;
  readonly pitch: number;
  readonly position: readonly [number, number];
  readonly region: number;
  readonly roll: number;
  /// `$71CE`/`$71D2`: the foot Mover's step, in units, and turn, in heading units, a substep.
  readonly walk: { readonly step: number; readonly turn: number };
}

export interface DionRoads {
  readonly colour: number;
  readonly corners: readonly number[];
  readonly height: number;
  /// The MIII baseline table, retained as evidence. Play uses the shared
  /// Damocles curve by explicit user decision (#724).
  readonly radiusTable: readonly number[];
}

export const readRoads = (value: unknown, path: string): DionRoads => {
  const raw = record(value, path);
  return {
    colour: word(raw['colour'], `${path}.colour`),
    corners: ints(raw['corners'], `${path}.corners`, 256, 0, 0xff_ff_ff_ff),
    height: int(raw['height'], `${path}.height`, 0, 0),
    radiusTable: ints(raw['radiusTable'], `${path}.radiusTable`, 256, 0, 63)
  };
};

export interface DionWorld {
  /// Per-resident phase words the `$8003` beacon blink adds to the frame counter.
  readonly blinkPhase: ReadonlyMap<number, number>;
  readonly cells: readonly DionCell[];
  readonly cellSpacing: number;
  readonly details: ReadonlyMap<number, DionDetail>;
  readonly drawList: {
    readonly fixed: readonly number[];
    readonly templateTop: number;
  };
  /// `$542BC`: nine rows of nine priorities, then `$7F` for anything outside the cell.
  readonly drawPriority: readonly number[];
  readonly eyeHeight: number;
  readonly framePalette: DionFramePalette;
  readonly glyphs: ReadonlyMap<string, DionGlyph>;
  readonly grounds: ReadonlyMap<number, DionGround>;
  readonly lettering: {
    readonly bindings89: readonly number[];
    readonly bindings9D: readonly number[];
    readonly signScript: readonly number[];
    readonly tokens?: ReadonlyMap<number, readonly number[]>;
  };
  readonly metisGroup: number;
  readonly modelColours: readonly number[];
  readonly models: ReadonlyMap<number, DionModel>;
  readonly opening: DionOpening;
  readonly palettes: ReadonlyMap<number, DionScenePalette>;
  readonly residents: readonly DionResident[];
  readonly roads: DionRoads;
  /// `$7E4A`: the Q15 sine table model rotation reads, 256 steps a turn and 320
  /// entries long, so the cosine at +64 never wraps.
  readonly rotationTable: readonly number[];
  readonly sky: DionSky;
  readonly source: DionSource;
  /// Structure records by geometry slot, then by `"sx,sz"` scale.
  readonly structures: ReadonlyMap<number, ReadonlyMap<string, DionStructure>>;
  readonly structureY: number;
}

const bounds = (value: unknown, path: string) => {
  const raw = record(value, path);
  return { x: pair(raw['x'], `${path}.x`), z: pair(raw['z'], `${path}.z`) };
};

const readCell = (value: unknown, path: string): DionCell => {
  const raw = record(value, path);
  const ground = record(raw['ground'], `${path}.ground`);
  return {
    alias: nullable(raw['alias'], v => int(v, `${path}.alias`, 0, 511)),
    cell: byte(raw['cell'], `${path}.cell`),
    detail: byte(raw['detail'], `${path}.detail`),
    ground: {
      address: address(ground['address'], `${path}.ground.address`),
      index: int(ground['index'], `${path}.ground.index`, 0, 7),
      transform: int(ground['transform'], `${path}.ground.transform`, 0, 7)
    },
    key: byte(raw['key'], `${path}.key`),
    keyBase: byte(raw['keyBase'], `${path}.keyBase`),
    origin: [
      word(list(raw['origin'], `${path}.origin`)[0], `${path}.origin[0]`),
      word(list(raw['origin'], `${path}.origin`)[1], `${path}.origin[1]`)
    ],
    palette: byte(raw['palette'], `${path}.palette`),
    provenance: provenance(raw['provenance'], `${path}.provenance`),
    roadPoints: keyed(
      record(raw['roadPoints'], `${path}.roadPoints`)['slots'],
      `${path}.roadPoints.slots`,
      (v, at) => byte(v, at)
    ),
    scale: pair(raw['scale'], `${path}.scale`),
    slot: int(raw['slot'], `${path}.slot`, 0, 511),
    structure: int(raw['structure'], `${path}.structure`, 0, 511),
    tokenSet: nullable(raw['tokenSet'], v => int(v, `${path}.tokenSet`, 0, 10)),
    x: int(raw['x'], `${path}.x`, 0, 15),
    z: int(raw['z'], `${path}.z`, 0, 15)
  };
};

export const readStructure = (value: unknown, path: string): DionStructure => {
  const raw = record(value, path);
  return {
    associations: list(raw['associations'], `${path}.associations`).map(
      (item, index) => {
        const a = record(item, `${path}.associations[${index}]`);
        return {
          hooks: list(a['hooks'], `${path}.associations[${index}].hooks`).map(
            (hook, h) =>
              pair(hook, `${path}.associations[${index}].hooks[${h}]`)
          ),
          id: byte(a['id'], `${path}.associations[${index}].id`)
        };
      }
    ),
    attachments: list(raw['attachments'], `${path}.attachments`).map(
      (item, index) => {
        const at = `${path}.attachments[${index}]`;
        const a = record(item, at);
        const leaves = ints(a['leaves'], `${at}.leaves`, 4);
        const axis = text(a['motionAxis'], `${at}.motionAxis`);
        return {
          box: bounds(a['box'], `${at}.box`),
          colours: ints(a['colours'], `${at}.colours`, 3, 0, 0xff_ff),
          control: word(a['control'], `${at}.control`),
          controlColour: optional(a['controlColour'], v =>
            word(v, `${at}.controlColour`)
          ),
          firstVertex: int(a['firstVertex'], `${at}.firstVertex`, 1, 255),
          firstWall: int(a['firstWall'], `${at}.firstWall`, 1, 255),
          key: nullable(a['key'], v => byte(v, `${at}.key`)),
          leaves: [leaves[0]!, leaves[1]!, leaves[2]!, leaves[3]!],
          motionAxis:
            axis === 'x' || axis === 'z'
              ? axis
              : fail(`${at}.motionAxis is not x or z`),
          slot: word(a['slot'], `${at}.slot`),
          twoLeaves: bool(a['twoLeaves'], `${at}.twoLeaves`)
        };
      }
    ),
    heights: pair(raw['heights'], `${path}.heights`),
    plan: list(raw['plan'], `${path}.plan`).map((item, index) =>
      pair(item, `${path}.plan[${index}]`)
    ),
    provenance: provenance(raw['provenance'], `${path}.provenance`),
    regions: list(raw['regions'], `${path}.regions`).map((item, index) => {
      const at = `${path}.regions[${index}]`;
      const r = record(item, at);
      return {
        bounds: bounds(r['bounds'], `${at}.bounds`),
        flags: word(r['flags'], `${at}.flags`),
        queue: ints(r['queue'], `${at}.queue`, undefined, 1, 255)
      };
    }),
    sceneColours: pair(raw['sceneColours'], `${path}.sceneColours`),
    walls: list(raw['walls'], `${path}.walls`).map((item, index) => {
      const at = `${path}.walls[${index}]`;
      const w = record(item, at);
      return {
        colour: word(w['colour'], `${at}.colour`),
        form: int(w['form'], `${at}.form`, 0, 7),
        refs: ints(w['refs'], `${at}.refs`, undefined, 1, 255)
      };
    }),
    wallTexts: list(raw['wallTexts'], `${path}.wallTexts`).map(
      (item, index) => {
        const at = `${path}.wallTexts[${index}]`;
        const t = record(item, at);
        return {
          anchor: triple(t['anchor'], `${at}.anchor`),
          colour: word(t['colour'], `${at}.colour`),
          command: word(t['command'], `${at}.command`),
          face: byte(t['face'], `${at}.face`),
          glyphScale: pair(t['glyphScale'], `${at}.glyphScale`),
          offset: sword(t['offset'], `${at}.offset`),
          plane: byte(t['plane'], `${at}.plane`),
          text: ints(t['text'], `${at}.text`, undefined, 1, 255)
        };
      }
    )
  };
};

const readPrimitive = (
  value: unknown,
  path: string
): DionPrimitive | DionTextRecord => {
  const raw = record(value, path);
  const kind = text(raw['kind'], `${path}.kind`);
  if (kind === 'polygon' || kind === 'line') {
    return {
      colour: word(raw['colour'], `${path}.colour`),
      kind,
      refs: ints(raw['refs'], `${path}.refs`, undefined, 1, 255)
    };
  }
  if (kind === 'text') {
    return {
      advance: sword(raw['advance'], `${path}.advance`),
      anchor: triple(raw['anchor'], `${path}.anchor`),
      colour: word(raw['colour'], `${path}.colour`),
      flags: word(raw['flags'], `${path}.flags`),
      glyphScale: pair(raw['glyphScale'], `${path}.glyphScale`),
      kind,
      offset: sword(raw['offset'], `${path}.offset`),
      text: ints(raw['text'], `${path}.text`, undefined, 1, 255)
    };
  }
  return fail(`${path}.kind ${kind} is not a detail primitive`);
};

export const readDetail = (value: unknown, path: string): DionDetail => {
  const raw = record(value, path);
  const extent = raw['extent'];
  return {
    extent: nullable(extent, v => {
      const e = record(v, `${path}.extent`);
      return {
        x: pair(e['x'], `${path}.extent.x`),
        y: sword(e['y'], `${path}.extent.y`),
        z: pair(e['z'], `${path}.extent.z`)
      };
    }),
    groups: list(raw['groups'], `${path}.groups`).map((item, index) => {
      const at = `${path}.groups[${index}]`;
      const g = record(item, at);
      return {
        boxes: list(g['boxes'], `${at}.boxes`).map((box, b) => {
          const bt = `${at}.boxes[${b}]`;
          const r = record(box, bt);
          return {
            records: ints(r['records'], `${bt}.records`, undefined, 1, 255),
            tag: word(r['tag'], `${bt}.tag`),
            x: pair(r['x'], `${bt}.x`),
            y: pair(r['y'], `${bt}.y`),
            z: pair(r['z'], `${bt}.z`)
          };
        }),
        default: ints(g['default'], `${at}.default`, undefined, 1, 255)
      };
    }),
    index: byte(raw['index'], `${path}.index`),
    primitives: list(raw['primitives'], `${path}.primitives`).map(
      (item, index) => readPrimitive(item, `${path}.primitives[${index}]`)
    ),
    provenance: provenance(raw['provenance'], `${path}.provenance`),
    tagged: ints(raw['tagged'], `${path}.tagged`),
    vertices: list(raw['vertices'], `${path}.vertices`).map((item, index) =>
      triple(item, `${path}.vertices[${index}]`)
    )
  };
};

export const readGround = (value: unknown, path: string): DionGround => {
  const raw = record(value, path);
  return {
    primitives: list(raw['primitives'], `${path}.primitives`).map(
      (item, index): DionGroundPrimitive => {
        const at = `${path}.primitives[${index}]`;
        const p = record(item, at);
        const kind = text(p['kind'], `${at}.kind`);
        if (kind === 'template') {
          return {
            kind,
            model: int(p['model'], `${at}.model`, 0, 511),
            x: sword(p['x'], `${at}.x`),
            z: sword(p['z'], `${at}.z`)
          };
        }
        if (kind === 'text') {
          return {
            colour: word(p['colour'], `${at}.colour`),
            header: ints(p['header'], `${at}.header`, 14, 0, 255),
            kind,
            text: ints(p['text'], `${at}.text`, undefined, 1, 255)
          };
        }
        const primitive = readPrimitive(item, at);
        return primitive.kind === 'text'
          ? fail(`${at} is a detail text record`)
          : primitive;
      }
    ),
    provenance: provenance(raw['provenance'], `${path}.provenance`),
    vertices: list(raw['vertices'], `${path}.vertices`).map((item, index) =>
      pair(item, `${path}.vertices[${index}]`)
    )
  };
};

const readFaces = (value: unknown, path: string): DionModelFace[] =>
  list(value, path).map((item, index): DionModelFace => {
    const at = `${path}[${index}]`;
    const f = record(item, at);
    const kind = text(f['kind'], `${at}.kind`);
    if (kind === 'drawn') {
      return { kind };
    }
    if (kind === 'polygon' || kind === 'line') {
      return {
        at: address(f['at'], `${at}.at`),
        colour: int(f['colour'], `${at}.colour`, 0, 127),
        kind,
        refs: ints(f['refs'], `${at}.refs`, undefined, 1, 255)
      };
    }
    if (kind === 'text') {
      return {
        advance: sword(f['advance'], `${at}.advance`),
        colour: word(f['colour'], `${at}.colour`),
        flags: word(f['flags'], `${at}.flags`),
        glyphScale: pair(f['glyphScale'], `${at}.glyphScale`),
        kind,
        offset: triple(f['offset'], `${at}.offset`),
        pointer: optional(f['pointer'], v => int(v, `${at}.pointer`, 0)),
        text: optional(f['text'], v => ints(v, `${at}.text`, undefined, 1, 255))
      };
    }
    return fail(`${at}.kind ${kind} is not a model face`);
  });

const readForm = (value: unknown, path: string): DionModelForm => {
  const raw = record(value, path);
  return {
    alternatives: list(raw['alternatives'], `${path}.alternatives`).map(
      (item, index) => {
        const at = `${path}.alternatives[${index}]`;
        const a = record(item, at);
        return {
          faces: readFaces(a['faces'], `${at}.faces`),
          min: triple(a['min'], `${at}.min`),
          size: triple(a['size'], `${at}.size`)
        };
      }
    ),
    faces: readFaces(raw['faces'], `${path}.faces`),
    provenance: provenance(raw['provenance'], `${path}.provenance`),
    vertices: list(raw['vertices'], `${path}.vertices`).map((item, index) =>
      triple(item, `${path}.vertices[${index}]`)
    )
  };
};

export const readModel = (
  value: unknown,
  path: string,
  key: number
): DionModel => {
  const raw = record(value, path);
  const entry = int(raw['entry'], `${path}.entry`, 0, 511);
  if (entry !== key) {
    fail(`${path}.entry ${entry} does not match its key`);
  }
  const header = optional(raw['header'], v => {
    const h = record(v, `${path}.header`);
    return {
      code: optional(h['code'], c => word(c, `${path}.header.code`)),
      firstTarget: optional(h['firstTarget'], t =>
        address(t, `${path}.header.firstTarget`)
      ),
      mode: optional(h['mode'], m => byte(m, `${path}.header.mode`)),
      op: int(h['op'], `${path}.header.op`, 0, 15),
      pivot: optional(h['pivot'], p => triple(p, `${path}.header.pivot`)),
      range: optional(h['range'], r => word(r, `${path}.header.range`)),
      target: optional(h['target'], t => address(t, `${path}.header.target`)),
      targets: optional(h['targets'], t =>
        list(t, `${path}.header.targets`).map((item, index) =>
          address(item, `${path}.header.targets[${index}]`)
        )
      ),
      value: optional(h['value'], x => word(x, `${path}.header.value`)),
      yawOffset: optional(h['yawOffset'], y =>
        byte(y, `${path}.header.yawOffset`)
      )
    };
  });
  return {
    ...readForm(raw, path),
    entry,
    header,
    name: optional(raw['name'], v => text(v, `${path}.name`)),
    passenger: optional(raw['passenger'], v => readForm(v, `${path}.passenger`))
  };
};

const readResident = (value: unknown, path: string): DionResident => {
  const raw = record(value, path);
  return {
    association: byte(raw['association'], `${path}.association`),
    body: byte(raw['body'], `${path}.body`),
    cell: byte(raw['cell'], `${path}.cell`),
    group: byte(raw['group'], `${path}.group`),
    model: nullable(raw['model'], v => int(v, `${path}.model`, 0, 511)),
    position: triple(raw['position'], `${path}.position`),
    slot: byte(raw['slot'], `${path}.slot`),
    state: byte(raw['state'], `${path}.state`),
    yaw: byte(raw['yaw'], `${path}.yaw`),
    zone: byte(raw['zone'], `${path}.zone`)
  };
};

export const readGlyph = (value: unknown, path: string): DionGlyph => {
  const raw = record(value, path);
  return {
    code: byte(raw['code'], `${path}.code`),
    font: int(raw['font'], `${path}.font`, 0, 15),
    form: int(raw['form'], `${path}.form`, 0x80, 0x82),
    points: list(raw['points'], `${path}.points`).map((item, index) =>
      pair(item, `${path}.points[${index}]`)
    ),
    primitives: list(raw['primitives'], `${path}.primitives`).map(
      (item, index) => {
        const at = `${path}.primitives[${index}]`;
        const p = record(item, at);
        const kind = text(p['kind'], `${at}.kind`);
        return {
          colour: optional(p['colour'], c => word(c, `${at}.colour`)),
          kind:
            kind === 'line' || kind === 'polygon'
              ? kind
              : fail(`${at}.kind is not a glyph primitive`),
          refs: ints(p['refs'], `${at}.refs`, undefined, 4, 252)
        };
      }
    )
  };
};

export const readDionWorldBody = (
  raw: Record<string, unknown>,
  source: DionSource
): DionWorld => {
  const groundsRaw = record(raw['grounds'], 'grounds');
  const grounds = new Map<number, DionGround>();
  for (const [key, item] of Object.entries(groundsRaw)) {
    grounds.set(
      address(key, `grounds key ${key}`),
      readGround(item, `grounds.${key}`)
    );
  }
  const glyphsRaw = record(raw['glyphs'], 'glyphs');
  const glyphs = new Map<string, DionGlyph>();
  for (const [key, item] of Object.entries(glyphsRaw)) {
    if (!/^\d{1,2}:[\dA-F]{2}$/.test(key)) {
      fail(`glyphs key ${key} is not font:code`);
    }
    glyphs.set(key, readGlyph(item, `glyphs.${key}`));
  }
  const drawList = record(raw['drawList'], 'drawList');
  const lettering = record(raw['lettering'], 'lettering');
  const structures = keyed(raw['structures'], 'structures', (item, path) => {
    const s = record(item, path);
    const scaled = record(s['scaled'], `${path}.scaled`);
    const result = new Map<string, DionStructure>();
    for (const [scale, decoded] of Object.entries(scaled)) {
      if (!/^-?\d+,-?\d+$/.test(scale)) {
        fail(`${path}.scaled key ${scale} is not sx,sz`);
      }
      result.set(scale, readStructure(decoded, `${path}.scaled.${scale}`));
    }
    return result;
  });
  const world: DionWorld = {
    cells: list(raw['cells'], 'cells').map((item, index) =>
      readCell(item, `cells[${index}]`)
    ),
    cellSpacing: int(raw['cellSpacing'], 'cellSpacing', 1, 0x7f_ff),
    details: keyed(raw['details'], 'details', readDetail),
    drawList: {
      fixed: ints(drawList['fixed'], 'drawList.fixed', undefined, 0, 255),
      templateTop: byte(drawList['templateTop'], 'drawList.templateTop')
    },
    drawPriority: ints(
      record(raw['drawPriority'], 'drawPriority')['bytes'],
      'drawPriority.bytes',
      82,
      0,
      255
    ),
    glyphs,
    grounds,
    lettering: {
      bindings89: list(lettering['bindings89'], 'lettering.bindings89').map(
        (item, index) => address(item, `lettering.bindings89[${index}]`)
      ),
      bindings9D: list(lettering['bindings9D'], 'lettering.bindings9D').map(
        (item, index) => address(item, `lettering.bindings9D[${index}]`)
      ),
      signScript: ints(
        lettering['signScript'],
        'lettering.signScript',
        19,
        0,
        255
      )
    },
    metisGroup: byte(raw['metisGroup'], 'metisGroup'),
    modelColours: ints(
      record(raw['modelColours'], 'modelColours')['words'],
      'modelColours.words',
      60,
      0,
      0xff_ff
    ),
    models: keyed(raw['models'], 'models', readModel),
    palettes: keyed(raw['palettes'], 'palettes', (item, path) => {
      const p = record(item, path);
      return {
        day: ints(p['day'], `${path}.day`, 22, 0, 0xff_ff),
        night: ints(p['night'], `${path}.night`, 22, 0, 0xff_ff),
        provenance: provenance(p['provenance'], `${path}.provenance`)
      };
    }),
    residents: list(raw['residents'], 'residents').map((item, index) =>
      readResident(item, `residents[${index}]`)
    ),
    sky: readDionSky(raw['sky']),
    source,
    structures,
    ...readViewFacts(raw)
  };
  checkWorld(world);
  return world;
};

const readViewFacts = (raw: Record<string, unknown>) => {
  const palette = record(raw['framePalette'], 'framePalette');
  const fixedRaw = record(palette['fixed'], 'framePalette.fixed');
  const fixed = new Map<number, number>();
  for (const [key, value] of Object.entries(fixedRaw)) {
    fixed.set(
      int(Number(key), `framePalette.fixed key ${key}`, 0, 15),
      word(value, `framePalette.fixed.${key}`)
    );
  }
  const opening = record(raw['opening'], 'opening');
  const projection = record(raw['projection'], 'projection');
  if (
    projection['focal'] !== 256 ||
    projection['width'] !== 320 ||
    projection['height'] !== 136
  ) {
    fail('projection is not the recovered level path (#644)');
  }
  return {
    blinkPhase: keyed(raw['blinkPhase'], 'blinkPhase', (v, path) =>
      word(v, path)
    ),
    eyeHeight: word(raw['eyeHeight'], 'eyeHeight'),
    framePalette: {
      fixed,
      horizonRow: int(palette['horizonRow'], 'framePalette.horizonRow', 0, 136),
      land: word(palette['land'], 'framePalette.land'),
      road: word(palette['road'], 'framePalette.road'),
      skyDay: word(palette['skyDay'], 'framePalette.skyDay'),
      skyNight: word(palette['skyNight'], 'framePalette.skyNight'),
      template: ints(
        palette['template'],
        'framePalette.template',
        17,
        0,
        0xff_ff
      )
    },
    opening: {
      cash: (() => {
        const raw = text(opening['cash'], 'opening.cash');
        return /^\d{12}$/.test(raw)
          ? raw
          : fail('opening.cash is not twelve BCD digits');
      })(),
      cell: byte(opening['cell'], 'opening.cell'),
      clock: (() => {
        const clock = record(opening['clock'], 'opening.clock');
        return {
          accumulator: sword(clock['accumulator'], 'opening.clock.accumulator'),
          day: word(clock['day'], 'opening.clock.day'),
          refill: int(clock['refill'], 'opening.clock.refill', 1, 0x7f_ff),
          seconds: int(clock['seconds'], 'opening.clock.seconds', 0, 86_399),
          step: int(clock['step'], 'opening.clock.step', 1, 0x7f_ff)
        };
      })(),
      eye: triple(opening['eye'], 'opening.eye'),
      frameCounter: word(opening['frameCounter'], 'opening.frameCounter'),
      gauges: (() => {
        const gauges = record(opening['gauges'], 'opening.gauges');
        return {
          inventory: word(gauges['inventory'], 'opening.gauges.inventory'),
          p: word(gauges['p'], 'opening.gauges.p'),
          t: word(gauges['t'], 'opening.gauges.t')
        };
      })(),
      groupOrigin: pair(opening['groupOrigin'], 'opening.groupOrigin'),
      heading: word(opening['heading'], 'opening.heading'),
      location: word(opening['location'], 'opening.location'),
      pitch: word(opening['pitch'], 'opening.pitch'),
      position: (() => {
        const [a, b] = ints(
          opening['position'],
          'opening.position',
          2,
          0,
          0xff_ff
        );
        return [a!, b!] as const;
      })(),
      region: int(opening['region'], 'opening.region', 1, 64),
      roll: word(opening['roll'], 'opening.roll'),
      walk: (() => {
        const walk = record(opening['walk'], 'opening.walk');
        const step = walk['step'];
        if (typeof step !== 'number' || !(step > 0 && step < 1000)) {
          fail('opening.walk.step is not a positive step');
        }
        return {
          step: step as number,
          turn: int(walk['turn'], 'opening.walk.turn', 1, 0x40)
        };
      })()
    },
    roads: readRoads(raw['roads'], 'roads'),
    rotationTable: ints(
      record(raw['rotationTable'], 'rotationTable')['words'],
      'rotationTable.words',
      320,
      -0x80_00,
      0x7f_ff
    ),
    structureY: int(raw['structureY'], 'structureY')
  };
};

/// Cross-references a reader alone cannot see: every cell names records the document
/// holds, and every structure reference resolves.
const checkWorld = (world: DionWorld): void => {
  if (world.cells.length === 0) {
    fail('cells is empty');
  }
  for (const cell of world.cells) {
    const at = `cell (${cell.x},${cell.z})`;
    if (cell.cell !== cell.z * 16 + cell.x) {
      fail(`${at} has cell number ${cell.cell}`);
    }
    if (!world.structures.get(cell.structure)?.has(cell.scale.join(','))) {
      fail(`${at} names structure ${cell.structure} at an unexported scale`);
    }
    if (!world.details.has(cell.detail)) {
      fail(`${at} names unexported detail ${cell.detail}`);
    }
    if (!world.grounds.has(cell.ground.address)) {
      fail(`${at} names an unexported ground record`);
    }
    if (!world.palettes.has(cell.palette)) {
      fail(`${at} names unexported scene palette ${cell.palette}`);
    }
  }
  for (const [slot, scales] of world.structures) {
    for (const [scale, structure] of scales) {
      const at = `structure ${slot} at ${scale}`;
      const vertices =
        structure.plan.length +
        structure.attachments.reduce(
          (sum, item) => sum + (item.twoLeaves ? 8 : 4),
          0
        );
      for (const [index, wall] of structure.walls.entries()) {
        if (wall.refs.some(ref => ref > vertices)) {
          fail(`${at} wall ${index + 1} names a missing plan vertex`);
        }
      }
    }
  }
  for (const resident of world.residents) {
    if (resident.model !== null && !world.models.has(resident.model)) {
      fail(
        `resident ${resident.slot} names unexported model ${resident.model}`
      );
    }
  }
};
