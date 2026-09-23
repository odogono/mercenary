export type Point = readonly [number, number, number];
export const KINDS = ['object', 'structure', 'interior', 'ground'] as const;
export type Kind = (typeof KINDS)[number];
export type Recovery = 'decoded' | 'partial' | 'unresolved';
/// The vocabulary of a multi-variant model; the Eris presentation document names one pair.
export const DOOR_STATES = ['closed', 'open'] as const;
export type DoorState = (typeof DOOR_STATES)[number];
export const STRUCTURE_VIEWS = ['combined', 'exterior'] as const;
export type StructureView = (typeof STRUCTURE_VIEWS)[number];
/// How a value in the Catalogue or a Damocles presentation document came to be (ADR 0043).
///
/// `recovered` is Working-Authority Evidence with Research Provenance; `derived` follows
/// mechanically from recovered values; `authored` is this project's placeholder for a value the
/// original has not yet yielded, and has a research issue behind it.
export const PROVENANCES = ['authored', 'derived', 'recovered'] as const;
export type Provenance = (typeof PROVENANCES)[number];
export interface Primitive {
  readonly colour: string;
  readonly doubleSided?: boolean;
  /** Scene point slots this ground primitive joins, placed or not. */
  readonly sceneSlots?: readonly number[];
  readonly sourceColour: number;
  readonly sourceIndex?: number;
  readonly vertices: readonly number[];
}
export interface Mesh {
  readonly displayCode?: string;
  readonly faces: readonly Primitive[];
  readonly labelAnchor?: Point;
  readonly lines: readonly Primitive[];
  /** Source primitive records this detail holds, drawn or not. */
  readonly recordCount?: number;
  /** Records that name a shared vertex slot this list never fills. */
  readonly unreferencedRecords?: readonly number[];
  readonly vertices: readonly Point[];
}
export const RECORD_CLASSES = [
  'geometry',
  'alias',
  'empty',
  'null',
  'procedural'
] as const;
export type RecordClass = (typeof RECORD_CLASSES)[number];
/**
 * How the Working Authority turns one model's instances, from its `$8001` command.
 *
 * `yaw` turns about +Y by the instance's angle byte plus `angleBiasByte`, 256 steps per
 * turn; `none` draws the record as modelled; `articulated` and `camera` are the source's
 * other two paths and carry no instance angle (docs/research/damocles-vip-limo.md).
 */
export interface InstanceOrientation {
  readonly angleBiasByte: number;
  readonly modeByte: number;
  readonly rotation: 'yaw' | 'none' | 'articulated' | 'camera';
}
export interface LevelBinding {
  /**
   * One entry per level the record authors a floor for, ascending. A level the table
   * leaves zero has no floor and the lift refuses it ($055B28).
   */
  readonly floors: readonly {
    readonly level: number;
    readonly structureId: string;
    readonly structureSlot: number;
  }[];
  /**
   * How many of the twelve level bytes lie inside the record's own extent. Two authored
   * records are shorter than the format; entries past this are not claimed.
   */
  readonly levelsAuthored: number;
  readonly tableAddress: number;
}
export interface Evidence {
  readonly claim: string;
  readonly confidence: 'verified' | 'observed' | 'partial' | 'unresolved';
  readonly source: string;
}
export const ROAD_PIECES = [
  'none',
  'end',
  'corner',
  'straight',
  'tee',
  'crossroads'
] as const;
export type RoadPiece = (typeof ROAD_PIECES)[number];
/**
 * One structure group's road network: the run-length extent grid at `$01E000` that
 * `$04EC30` classifies into the per-cell ground selection.
 *
 * The runs are one-cell-wide road lines, not a landmass — the coastline is the island
 * record's polygon and nothing else. Every island record that binds a group carries a
 * network, whether or not a capture ever loaded it: the grid is built from the group's
 * own authored stream, so `attestation` is what separates the two, not presence. A
 * network with no run is a recovered "this Settlement has no roads"
 * (docs/research/damocles-eris-ground.md).
 */
export interface RoadNetwork {
  /**
   * `capture` where a memstate stood in this workspace and the replay reproduced its
   * live `$0083DC`; `image` where the run grid was expanded from the group's authored
   * stream by `$04EB60`, an expansion that reproduces `$01E000` byte for byte on every
   * capture that binds a group. A Settlement nobody has stood in still publishes its
   * roads; what it does not have is a live table to check against.
   */
  readonly attestation: 'capture' | 'image';
  readonly body: string;
  /** Every cell whose class is nonzero, in cell order. Cells are workspace-local. */
  readonly cells: readonly {
    readonly cell: number;
    /** The ground record the cell actually draws, which an override may have replaced. */
    readonly model: string | null;
    /**
     * `$04ECEE`-`$04ED0E` lets a placement in the group's own stream replace the
     * classifier's record with its own where the two share a record class, so the drawn
     * record is not always the road piece the class selected. A live `$01E400` carries
     * the replacement, and so does the lab's replay of the loader on an image-derived
     * network (#460). `null` means neither was available: the question is unanswered
     * there, not answered no.
     */
    readonly overridden: boolean | null;
    readonly piece: number;
    readonly pieceName: RoadPiece;
    /** The road piece the class selected, whether or not a placement replaced it. */
    readonly recordAddress: number;
    /** Quarter turns, the low nybble of the `$0083DC` orientation byte. */
    readonly rotation: number;
    readonly sourceClass: number;
    readonly x: number;
    readonly z: number;
  }[];
  readonly classTableAddress: number;
  readonly evidence: readonly Evidence[];
  readonly id: string;
  readonly island: string | null;
  /** Where the group's 16x16 sits on the Body surface, in Surface Cells. */
  readonly origin: readonly [number, number];
  /** The group's six road-piece selectors, in the order `$04EC22` copies them. */
  readonly pieces: readonly {
    readonly index: number;
    readonly name: RoadPiece;
    readonly recordAddress: number;
  }[];
  readonly reason: string;
  /**
   * The network's lines: each authored run, deduplicated. `$05493E` hands the same four
   * bytes to the ground-extent slots and `$054AD2` draws each surviving pair as one
   * two-point edge, which is the network the aerial view shows.
   */
  readonly runs: readonly {
    readonly axis: 'x' | 'z';
    readonly end: readonly [number, number];
    readonly start: readonly [number, number];
  }[];
  readonly sourceAddress: number;
  /** The Structure Workspace group this network belongs to. */
  readonly structureGroup: number;
}
export interface Model {
  readonly conditions: readonly string[];
  readonly detailSelection?: readonly DetailGroup[];
  readonly evidence: readonly Evidence[];
  readonly id: string;
  /**
   * The record's `$8001` orientation command: how the draw path turns every instance of
   * this model, and the per-model angle bias it adds to the instance's own byte.
   */
  readonly instanceOrientation?: InstanceOrientation;
  readonly kind: Kind;
  /**
   * The alias record's floor table at the record plus six, which `$054DBC` publishes in
   * `$7C1E` and the lift indexes by the destination level before assembling that
   * structure (`$055B24`-`$055BD8`). Absent for non-alias records, which offer level 0
   * alone. This is what binds a level to the structure a resident resolves against.
   */
  readonly levelBinding?: LevelBinding;
  readonly linkedInstances: readonly string[];
  readonly name: string;
  readonly nameStatus: 'verified' | 'candidate' | 'unknown';
  readonly omissions: readonly string[];
  readonly reason: string;
  readonly recordClass: RecordClass;
  readonly relatedModels: readonly string[];
  /** Background colours the frame loop installs for a cell, not wall colours. */
  readonly sceneColours?: readonly {
    readonly colour?: string;
    readonly sourceColour: number;
  }[];
  readonly slots: readonly number[];
  readonly sourceAddress: number;
  readonly status: Recovery;
  /** Recovered alias-record floor pitch; absent for non-alias records. */
  readonly storeyHeight?: number;
  readonly structureSelection?: StructureSelection;
  /** Native Drop scanner maximum; null means its model-form gate refuses. */
  readonly supportTop?: number | null;
  readonly variants: readonly {
    readonly doorState?: DoorState;
    readonly id: string;
    readonly inspectionAngle?: readonly [number, number];
    readonly mesh: Mesh;
    readonly name: string;
    readonly view?: StructureView;
    readonly walkMesh?: Mesh;
  }[];
  /** Slots a world binds at load time; this record's claim on them is one capture's. */
  readonly worldConditionedSlots?: readonly number[];
}
export type Bounds = readonly (readonly [number, number])[];
export interface DetailGroup {
  readonly boxes: readonly {
    readonly bounds: Bounds;
    readonly records: readonly number[];
  }[];
  readonly default: readonly number[];
}
export const REGION_GATES = ['none', 'attachmentLatch', 'passage'] as const;
export type RegionGate = (typeof REGION_GATES)[number];
export interface AttachmentConstructor {
  readonly leafCount: 1 | 2;
  readonly motionAxis: 'x' | 'z';
  readonly movingSide?: 'high' | 'low';
}
export interface EntranceAttachment {
  readonly constructor: AttachmentConstructor;
  readonly controlWord: number;
  /** Low nybble of an $F0 control: the key index the cell's base offsets. */
  readonly keyIndex?: number;
  readonly mesh: Mesh;
  readonly proximityBox: {
    readonly x: readonly [number, number];
    readonly z: readonly [number, number];
  };
  readonly slot: number;
}
export interface StructureSelection {
  readonly attachments: readonly EntranceAttachment[];
  readonly detailModel: string;
  readonly detailVariant: string;
  readonly liveSelector?: boolean;
  readonly plan: Mesh;
  readonly regions: readonly {
    readonly bounds: Bounds;
    readonly flags: number;
    readonly gate: RegionGate;
    readonly insetAxis?: 'x' | 'z';
    readonly queue: readonly (
      | { readonly index: number; readonly kind: 'face' }
      | { readonly kind: 'attachment'; readonly slot: number }
      | {
          readonly index: number;
          readonly kind: 'attachmentFace';
          readonly slot: number;
        }
    )[];
  }[];
  readonly scale: readonly [number, number];
}
export const ADMISSIONS = ['unkeyed', 'seatable', 'paired'] as const;
export type Admission = (typeof ADMISSIONS)[number];
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
  readonly associationGroups:
    | readonly {
        readonly group: number;
        readonly pairs: readonly {
          readonly insertionKey: number;
          readonly regionSelector: number;
        }[];
      }[]
    | null;
  /**
   * What the board gate ($054302-$05434F) answers for this resident slot, or null on every
   * instance that is not one. `boardable` is the gate's two table facts: the slot is under
   * the bound and the model carries the single-Y-turn orientation command. The chooser's
   * `admission`, the `pairedSlot` whose carried bit the key test reads, and the `refusal`
   * it presents are published for every slot under the bound, even one the model guard
   * refuses, because the key test runs first. `pairedInstance` is null where the paired
   * slot holds no instance: the pair is missing, not invented (#407, #408).
   */
  readonly boarding: {
    readonly admission: Admission | null;
    readonly admissionProvenance: Provenance;
    readonly boardable: boolean;
    readonly boardableProvenance: Provenance;
    readonly pairedInstance: string | null;
    readonly pairedProvenance: Provenance;
    readonly pairedSlot: number | null;
    readonly reason: string;
    readonly refusal: string | null;
    readonly refusalProvenance: Provenance;
  } | null;
  readonly handling: {
    readonly byte: number;
    readonly carried: boolean;
    readonly refusal: 'message' | 'silent' | null;
    readonly requiredSupportRank: number;
    readonly suppliedSupportRank: number;
    readonly takeable: boolean;
  } | null;
  readonly id: string;
  /**
   * The `$7AFB` door-key base this cell's `$ABDC` entry byte installs ($054CBE), or null
   * where the entry installs none. An `$F0` entrance in this cell's structure is keyed to
   * object slot `keyBase + keyIndex` ($059FA0), which is also its printed letter less `$23`.
   */
  readonly keyBase: number | null;
  readonly location: {
    readonly body: string;
    readonly coordinateSystem: string;
    readonly heading: number | null;
    /**
     * The Damocles Island whose origin the Structure Workspace this was placed in was
     * built at ($056464). Null where the position came from the resident arrays instead,
     * which name no record. The position is a Body Coordinate either way, never an
     * Island-Local Cell.
     */
    readonly island: string | null;
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
  /**
   * Association A byte 3: mutable placement state, not identity. A Drop rewrites it
   * ($0546FC direct, support inheritance otherwise), so this is the authored value a
   * Gameplay Session departs from. Null where the slot has no resident state.
   */
  readonly placementClass: number | null;
  readonly reason: string;
  readonly sourceAddress: number;
}
export interface Place {
  readonly body: string | null;
  readonly id: string;
  readonly instances: readonly string[];
  readonly name: string;
}
export const ISLAND_BOXES = ['extent', 'core', 'exclusion'] as const;
export type IslandBoxKind = (typeof ISLAND_BOXES)[number];
/**
 * One ten-byte island record of a body's list at `$7A16`: where a landmass sits on the
 * body surface, what shape it is, which workspace it binds and what colour it is painted.
 *
 * An island is not the workspace it selects and it is not a settlement: 21 of the 62
 * records carry no coastline at all, and 33 bind no named area
 * (docs/research/damocles-island-census.md).
 */
export interface Island {
  /** The bound group's area name, not a name the record owns. Null where unnamed. */
  readonly areaName: string | null;
  readonly body: string;
  /**
   * The backwards box list `$0560F2` tests, in the order it reads them: box 0 is the
   * island's extent, box 1 the authored core, and the rest are exclusions. Bounds are
   * island-local and half-open. These are authored, not derivable: on three of Eris's
   * five islands the core box is smaller than the 16-cell workspace.
   */
  readonly boxes: readonly {
    readonly kind: IslandBoxKind;
    readonly sourceAddress: number;
    readonly x: readonly [number, number];
    readonly z: readonly [number, number];
  }[];
  /**
   * The coastline polygon: signed island-local vertex pairs, and the edge words
   * `$0561CE` scans. Both are needed — the edge words carry the swap (bit 15) and
   * axis (bit 14) bits, which vertex order alone does not give. Empty on the 21
   * records that share the coastline-less stub.
   */
  readonly coastline: {
    readonly edges: readonly number[];
    readonly sourceAddress: number;
    readonly vertices: readonly (readonly [number, number])[];
  };
  /**
   * The extent box in body cells, wrapped onto the surface torus. An upper bound below
   * its lower bound is a wrapped span, not an empty one; `coversSurface` marks the stub
   * whose extent is the whole coordinate plane.
   */
  readonly extent: {
    readonly coversSurface: boolean;
    readonly wrapsX: boolean;
    readonly wrapsZ: boolean;
    readonly x: readonly [number, number];
    readonly z: readonly [number, number];
  };
  readonly id: string;
  /** The `+8` word, which `$04EB46` publishes to `$7A1A` as the island's fill. */
  readonly landColour: string;
  /** The record's `+0`/`+2`, in whole Surface Cells, masked onto the surface. */
  readonly origin: readonly [number, number];
  readonly reason: string;
  readonly sourceAddress: number;
  readonly sourceLandColour: number;
  /** The authored `+0`/`+2` words; Lucan's ring stores negative coordinates. */
  readonly sourceOrigin: readonly [number, number];
  /** The `+6` structure group, the 16x16 workspace bound at this origin. */
  readonly structureGroup: number;
  /** The group record that workspace is built from; null because group `$00` binds nothing. */
  readonly workspace: number | null;
}
export interface BankExtent {
  readonly bankEnd: number;
  readonly entryCount: number;
  readonly firstRecord: number;
  readonly followedAt: number;
  readonly followedBy: string;
  readonly lastRecord: number;
  readonly preambleBytes: number;
  readonly tableEnd: number;
  readonly tableStart: number;
  readonly zeroFillBytes: number;
}
export interface CoverageTable {
  readonly address: number;
  readonly aliases: number;
  readonly decoded: number;
  readonly empty: number;
  readonly extentEvidence: string;
  readonly kind: Kind;
  readonly nullRecords: number;
  readonly partial: number;
  readonly slots: number;
  readonly unique: number;
  readonly unresolved: number;
}
/// What the shared Catalogue document says about a Model without carrying it: enough to list,
/// filter and account for every Model before any Model file is read (ADR 0048).
export interface ModelSummary {
  readonly id: string;
  readonly kind: Kind;
  readonly name: string;
  readonly recordClass: RecordClass;
  readonly slots: readonly number[];
  readonly status: Model['status'];
  /** A structure's storey pitch, where recovered: admits a structure residence. */
  readonly storeyHeight?: number;
  /** A support's top, where recovered: decides a Drop onto it. */
  readonly supportTop?: number | null;
}
export interface Catalogue {
  readonly bodies: readonly {
    /**
     * The body's own surface: the colour `$7C88` draws it in wherever no island is
     * painted over it, and the extent `$058F64` masks positions onto. Null for the VOID
     * slot, which is the space-as-place sentinel rather than a surface.
     */
    readonly bodySurface: {
      readonly baseColour: string;
      readonly extentCells: readonly [number, number];
      readonly sourceColour: number;
      readonly wrapsX: boolean;
      readonly wrapsZ: boolean;
    } | null;
    readonly id: string;
    /** Every Model the Body can draw: its Instances', its roads' and their interiors'. */
    readonly models: readonly string[];
    readonly name: string;
  }[];
  readonly coverage: {
    readonly census: {
      readonly decoded: number;
      readonly partial: number;
      readonly unique: number;
      readonly unresolved: number;
    };
    readonly classifications: Readonly<Record<string, number>>;
    readonly complete: boolean;
    readonly diskLoad: readonly {
      readonly finding: string;
      readonly path: string;
    }[];
    readonly notes: readonly string[];
    readonly tables: readonly CoverageTable[];
    readonly unexplored: readonly string[];
  };
  readonly instances: readonly Instance[];
  readonly islands: readonly Island[];
  readonly modelIndex: readonly ModelSummary[];
  readonly places: readonly Place[];
  readonly roadNetworks: readonly RoadNetwork[];
  readonly schemaVersion: 17;
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
    /** Measured bank bounds; absent for the ground workspace index. */
    readonly extent?: BankExtent;
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
const nonnegativeSignedWord = (value: unknown): number => {
  const n = integer(value);
  return n <= 0x7f_ff ? n : fail('expected a nonnegative signed word');
};
const boolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : fail('expected a flag');
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

/** An unsigned word, as the coastline edge and colour words are stored. */
const unsignedWord = (value: unknown): number => {
  const n = integer(value);
  return n <= 0xff_ff ? n : fail('expected a word');
};
/** A signed word bound, as the box and vertex words are stored. */
const signedWord = (value: unknown): number => {
  const n = number(value);
  return Number.isSafeInteger(n) && n >= -0x80_00 && n <= 0x7f_ff
    ? n
    : fail('expected a signed word');
};
const evidenceList = (value: unknown): readonly Evidence[] =>
  list(value).map(item => {
    const entry = object(item);
    return {
      claim: string(entry['claim']),
      confidence: choice(entry['confidence'], [
        'verified',
        'observed',
        'partial',
        'unresolved'
      ] as const),
      source: string(entry['source'])
    };
  });
const cellPair = (value: unknown): readonly [number, number] => {
  const pair = list(value).map(signedWord);
  if (pair.length !== 2) {
    return fail('expected an x/z pair');
  }
  return [pair[0]!, pair[1]!];
};

const bankExtent = (value: unknown): BankExtent => {
  const record = object(value);
  const extent = {
    bankEnd: integer(record['bankEnd']),
    entryCount: integer(record['entryCount']),
    firstRecord: integer(record['firstRecord']),
    followedAt: integer(record['followedAt']),
    followedBy: string(record['followedBy']),
    lastRecord: integer(record['lastRecord']),
    preambleBytes: integer(record['preambleBytes']),
    tableEnd: integer(record['tableEnd']),
    tableStart: integer(record['tableStart']),
    zeroFillBytes: integer(record['zeroFillBytes'])
  };
  // The bound only means something while the table stops short of its first
  // record and the bank stops short of the item that follows it.
  if (extent.tableEnd !== extent.tableStart + extent.entryCount * 4) {
    fail('table extent disagrees with its entry count');
  }
  if (extent.tableEnd > extent.firstRecord) {
    fail('table extent overruns its first record');
  }
  if (
    extent.lastRecord >= extent.bankEnd ||
    extent.bankEnd >= extent.followedAt
  ) {
    fail('bank extent overruns what follows it');
  }
  return extent;
};

const instanceOrientation = (value: unknown): InstanceOrientation => {
  const record = object(value);
  const modeByte = byte(record['modeByte']);
  const rotation = choice(record['rotation'], [
    'yaw',
    'none',
    'articulated',
    'camera'
  ]);
  // The source reads one byte three ways; a payload that names a different path than the
  // byte selects would silently draw the wrong pose (docs/research/damocles-vip-limo.md).
  const selected =
    modeByte === 0
      ? 'none'
      : (modeByte & 0x80) !== 0
        ? 'articulated'
        : (modeByte & 0x40) !== 0
          ? 'yaw'
          : 'camera';
  if (selected !== rotation) {
    fail(`orientation mode $${modeByte.toString(16)} is not ${rotation}`);
  }
  return {
    angleBiasByte: byte(record['angleBiasByte']),
    modeByte,
    rotation
  };
};

const levelBinding = (value: unknown): LevelBinding => {
  const record = object(value);
  const levelsAuthored = integer(record['levelsAuthored']);
  if (levelsAuthored > 12) {
    return fail('a floor table holds at most twelve levels');
  }
  const floors = list(record['floors']).map(entry => {
    const floor = object(entry);
    const level = integer(floor['level']);
    if (level >= levelsAuthored) {
      return fail(`floor level ${level} lies past the record's own extent`);
    }
    return {
      level,
      structureId: string(floor['structureId']),
      structureSlot: byte(floor['structureSlot'])
    };
  });
  return {
    floors,
    levelsAuthored,
    tableAddress: integer(record['tableAddress'])
  };
};

const mesh = (value: unknown, allowEmpty = false): Mesh => {
  const record = object(value);
  const vertices = list(record['vertices']).map(point);
  if ((!allowEmpty && vertices.length === 0) || vertices.length > 65_536) {
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
        ...(p['sceneSlots'] === undefined
          ? {}
          : { sceneSlots: list(p['sceneSlots']).map(integer) }),
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
    ...(record['recordCount'] === undefined
      ? {}
      : { recordCount: integer(record['recordCount']) }),
    ...(record['unreferencedRecords'] === undefined
      ? {}
      : {
          unreferencedRecords: list(record['unreferencedRecords']).map(integer)
        }),
    vertices
  };
};

const fields = (value: unknown, allowed: readonly string[]) => {
  const r = object(value);
  if (Object.keys(r).some(key => !allowed.includes(key))) {
    fail('unknown selector field');
  }
  return r;
};
const bounds = (value: unknown, axes: number): Bounds => {
  const result = list(value).map(pair => {
    const p = list(pair).map(number);
    if (
      p.length !== 2 ||
      p.some(n => !Number.isSafeInteger(n)) ||
      p[0]! >= p[1]!
    ) {
      fail('invalid selector bounds');
    }
    return [p[0]!, p[1]!] as const;
  });
  if (result.length !== axes) {
    fail('invalid selector axes');
  }
  return result;
};
const detailSelection = (value: unknown): readonly DetailGroup[] => {
  const groups = list(value).map(value => {
    const g = fields(value, ['boxes', 'default']);
    return {
      boxes: list(g['boxes']).map(value => {
        const b = fields(value, ['bounds', 'records']);
        return {
          bounds: bounds(b['bounds'], 3),
          records: list(b['records']).map(integer)
        };
      }),
      default: list(g['default']).map(integer)
    };
  });
  if (groups.length !== 2) {
    fail('expected two detail groups');
  }
  return groups;
};
const structureSelection = (value: unknown): StructureSelection => {
  const s = fields(value, [
    'plan',
    'attachments',
    'scale',
    'detailModel',
    'detailVariant',
    'regions',
    'liveSelector'
  ]);
  const plan = mesh(s['plan'], true);
  const scale = list(s['scale']).map(number);
  if (
    scale.length !== 2 ||
    scale.some(n => !Number.isInteger(n) || n === 0 || n < -128 || n > 127)
  ) {
    fail('invalid selector scale');
  }
  const sources = new Set(plan.faces.map(face => face.sourceIndex));
  if (sources.has(undefined) || sources.size !== plan.faces.length) {
    fail('invalid plan source indices');
  }
  const attachments = list(s['attachments']).map(value => {
    const a = fields(value, [
      'constructor',
      'controlWord',
      'keyIndex',
      'mesh',
      'proximityBox',
      'slot'
    ]);
    const c = fields(a['constructor'], [
      'leafCount',
      'motionAxis',
      'movingSide'
    ]);
    const leafCount = integer(c['leafCount']);
    const motionAxis = choice(c['motionAxis'], ['x', 'z'] as const);
    if (leafCount !== 1 && leafCount !== 2) {
      fail('invalid attachment leaf count');
    }
    const movingSide =
      c['movingSide'] === undefined
        ? undefined
        : choice(c['movingSide'], ['high', 'low'] as const);
    if (
      (leafCount === 1 && movingSide === undefined) ||
      (leafCount === 2 && movingSide !== undefined)
    ) {
      fail('invalid attachment moving side');
    }
    const controlWord = integer(a['controlWord']);
    const slot = integer(a['slot']);
    const authored = controlWord & 0xff_00;
    const latch = controlWord & 0xff;
    const controls = [0x40_00, 0x41_00, 0x42_00, 0x80_00, 0x81_00, 0x82_00];
    if (
      !controls.includes(authored) ||
      (latch !== 0 && latch !== 0xf0) ||
      slot === 0 ||
      slot > 0x03_fc ||
      slot % 4
    ) {
      fail('invalid attachment control or slot');
    }
    if (
      leafCount !== ((controlWord & 0x02_00) === 0 ? 1 : 2) ||
      motionAxis !== ((controlWord & 0x80_00) === 0 ? 'x' : 'z') ||
      (leafCount === 1 &&
        movingSide !== ((controlWord & 0x01_00) === 0 ? 'high' : 'low'))
    ) {
      fail('attachment constructor does not match control word');
    }
    const keyIndex =
      a['keyIndex'] === undefined ? undefined : integer(a['keyIndex']);
    // A key index exists exactly when the control carries the $F0 low byte.
    if (
      (keyIndex === undefined) !== (latch === 0) ||
      (keyIndex !== undefined && keyIndex !== (controlWord & 0x0f))
    ) {
      fail('invalid attachment key index');
    }
    const box = fields(a['proximityBox'], ['x', 'z']);
    return {
      constructor: {
        leafCount: leafCount as 1 | 2,
        motionAxis,
        ...(movingSide === undefined ? {} : { movingSide })
      },
      controlWord,
      ...(keyIndex === undefined ? {} : { keyIndex }),
      mesh: mesh(a['mesh']),
      proximityBox: {
        x: bounds([box['x']], 1)[0]!,
        z: bounds([box['z']], 1)[0]!
      },
      slot
    };
  });
  const bySlot = new Map(
    attachments.map(attachment => [attachment.slot, attachment])
  );
  if (bySlot.size !== attachments.length) {
    fail('duplicate attachment slot');
  }
  const regions = list(s['regions']).map(value => {
    const r = fields(value, ['flags', 'bounds', 'queue', 'gate', 'insetAxis']);
    const flags = integer(r['flags']);
    if (flags === 0 || flags > 65_535) {
      fail('invalid region flags');
    }
    const gate = choice(r['gate'], REGION_GATES);
    const slot = flags & 0x03_fc;
    const attachment = bySlot.get(slot);
    const insetAxis =
      r['insetAxis'] === undefined
        ? undefined
        : choice(r['insetAxis'], ['x', 'z'] as const);
    if (
      (gate === 'none' && slot !== 0) ||
      (gate === 'passage' && slot !== 0x02_00) ||
      (gate === 'attachmentLatch' &&
        (attachment === undefined ||
          insetAxis !== attachment.constructor.motionAxis)) ||
      (gate !== 'attachmentLatch' && insetAxis !== undefined)
    ) {
      fail('region gate does not match flags and attachment');
    }
    return {
      bounds: bounds(r['bounds'], 2),
      flags,
      gate,
      ...(insetAxis === undefined ? {} : { insetAxis }),
      queue: list(r['queue']).map(value => {
        const entry = object(value);
        if (entry['kind'] === 'attachment') {
          const item = fields(entry, ['kind', 'slot']);
          const itemSlot = integer(item['slot']);
          if (!bySlot.has(itemSlot)) {
            fail('missing region attachment');
          }
          return { kind: 'attachment', slot: itemSlot } as const;
        }
        if (entry['kind'] === 'attachmentFace') {
          const item = fields(entry, ['kind', 'slot', 'index']);
          const itemSlot = integer(item['slot']);
          const owner =
            bySlot.get(itemSlot) ?? fail('missing region attachment');
          const face = integer(item['index']);
          if (face < 0 || face >= owner.mesh.faces.length) {
            fail('invalid attachment face reference');
          }
          return {
            index: face,
            kind: 'attachmentFace',
            slot: itemSlot
          } as const;
        }
        fields(entry, ['kind', 'index']);
        if (entry['kind'] !== 'face') {
          fail('unknown region queue tag');
        }
        const index = integer(entry['index']);
        if (!sources.has(index)) {
          fail('invalid plan face reference');
        }
        return { index, kind: 'face' } as const;
      })
    };
  });
  if (regions.length === 0) {
    fail('empty region selector');
  }
  if (
    s['liveSelector'] !== undefined &&
    typeof s['liveSelector'] !== 'boolean'
  ) {
    fail('invalid live selector flag');
  }
  return {
    attachments,
    detailModel: string(s['detailModel']),
    detailVariant: string(s['detailVariant']),
    ...(s['liveSelector'] === true ? { liveSelector: true } : {}),
    plan,
    regions,
    scale: [scale[0]!, scale[1]!]
  };
};

const modelRecord = (item: unknown): Model => {
  const m = object(item);
  const variants = list(m['variants']).map(value => {
    const v = object(value);
    const door =
      v['doorState'] === undefined
        ? {}
        : {
            doorState: choice(v['doorState'], DOOR_STATES),
            view: choice(v['view'], STRUCTURE_VIEWS)
          };
    return {
      ...door,
      id: string(v['id']),
      ...(v['inspectionAngle'] === undefined
        ? {}
        : { inspectionAngle: angle(v['inspectionAngle']) }),
      mesh: mesh(v['mesh']),
      ...(v['walkMesh'] === undefined ? {} : { walkMesh: mesh(v['walkMesh']) }),
      name: string(v['name'])
    };
  });
  unique(variants);
  const status = choice(m['status'], ['decoded', 'partial', 'unresolved']);
  const reason = string(m['reason']);
  const recordClass =
    m['recordClass'] === undefined
      ? 'geometry'
      : choice(m['recordClass'], RECORD_CLASSES);
  // A decoded model may show nothing only when its class says the record
  // holds nothing by construction: an authored empty, the NULL record, or a
  // record the game draws with a native routine.
  if (
    status === 'decoded' &&
    variants.length === 0 &&
    recordClass !== 'empty' &&
    recordClass !== 'null' &&
    recordClass !== 'procedural'
  ) {
    fail('decoded model has no geometry');
  }
  if (status !== 'decoded' && !reason.trim()) {
    fail('unresolved model needs an explanation');
  }
  return {
    conditions: m['conditions'] === undefined ? [] : strings(m['conditions']),
    ...(m['sceneColours'] === undefined
      ? {}
      : {
          sceneColours: list(m['sceneColours']).map(value => {
            const entry = object(value);
            return {
              ...(entry['colour'] === undefined
                ? {}
                : { colour: string(entry['colour']) }),
              sourceColour: integer(entry['sourceColour'])
            };
          })
        }),
    evidence: evidenceList(m['evidence']),
    id: string(m['id']),
    kind: choice(m['kind'], ['object', 'structure', 'interior', 'ground']),
    linkedInstances: strings(m['linkedInstances']),
    name: string(m['name']),
    nameStatus: choice(m['nameStatus'], ['verified', 'candidate', 'unknown']),
    omissions: m['omissions'] === undefined ? [] : strings(m['omissions']),
    reason,
    recordClass,
    relatedModels: strings(m['relatedModels']),
    slots: list(m['slots']).map(integer),
    sourceAddress: integer(m['sourceAddress']),
    ...(m['worldConditionedSlots'] === undefined
      ? {}
      : {
          worldConditionedSlots: list(m['worldConditionedSlots']).map(integer)
        }),
    status,
    ...(m['instanceOrientation'] === undefined
      ? {}
      : {
          instanceOrientation: instanceOrientation(m['instanceOrientation'])
        }),
    ...(m['levelBinding'] === undefined
      ? {}
      : { levelBinding: levelBinding(m['levelBinding']) }),
    ...(m['storeyHeight'] === undefined
      ? {}
      : { storeyHeight: nonnegativeSignedWord(m['storeyHeight']) }),
    ...(m['supportTop'] === undefined
      ? {}
      : {
          supportTop:
            m['supportTop'] === null
              ? null
              : nonnegativeSignedWord(m['supportTop'])
        }),
    variants,
    ...(m['structureSelection'] === undefined
      ? {}
      : { structureSelection: structureSelection(m['structureSelection']) }),
    ...(m['detailSelection'] === undefined
      ? {}
      : { detailSelection: detailSelection(m['detailSelection']) })
  };
};

/// The shared Catalogue document: everything but the Models, which it names through its
/// model index (ADR 0048). Every check that needs only a Model's kind, status or slots runs
/// here against the index; a Model's own record is checked when its file arrives.
export const parseCatalogueDocument = (value: unknown): Catalogue => {
  const r = object(value);
  if (r['schemaVersion'] !== 17) {
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
  const modelIndex = list(r['modelIndex']).map((item): ModelSummary => {
    const m = object(item);
    return {
      id: string(m['id']),
      kind: choice(m['kind'], KINDS),
      name: string(m['name']),
      recordClass: choice(m['recordClass'], RECORD_CLASSES),
      slots: list(m['slots']).map(integer),
      status: choice(m['status'], ['decoded', 'partial', 'unresolved']),
      ...(m['storeyHeight'] === undefined
        ? {}
        : { storeyHeight: nonnegativeSignedWord(m['storeyHeight']) }),
      ...(m['supportTop'] === undefined
        ? {}
        : {
            supportTop:
              m['supportTop'] === null
                ? null
                : nonnegativeSignedWord(m['supportTop'])
          })
    };
  });
  const modelIds = unique(modelIndex);
  const summaries = new Map(modelIndex.map(entry => [entry.id, entry]));
  const bodies = list(r['bodies']).map(item => {
    const b = object(item);
    let bodySurface: Catalogue['bodies'][number]['bodySurface'] = null;
    if (b['bodySurface'] !== null && b['bodySurface'] !== undefined) {
      const surface = object(b['bodySurface']);
      const extentCells = cellPair(surface['extentCells']);
      if (extentCells.some(cells => cells <= 0)) {
        fail('body surface extent is empty');
      }
      bodySurface = {
        baseColour: string(surface['baseColour']),
        extentCells,
        sourceColour: unsignedWord(surface['sourceColour']),
        wrapsX: boolean(surface['wrapsX']),
        wrapsZ: boolean(surface['wrapsZ'])
      };
    }
    const models = strings(b['models']);
    for (const id of models) {
      reference(modelIds, id, 'body model');
    }
    return {
      bodySurface,
      id: string(b['id']),
      models,
      name: string(b['name'])
    };
  });
  const bodyIds = unique(bodies);
  const islands = list(r['islands'] ?? []).map((item): Island => {
    const i = object(item);
    const body = string(i['body']);
    reference(bodyIds, body, 'body');
    const coast = object(i['coastline']);
    const vertices = list(coast['vertices']).map(cellPair);
    const edges = list(coast['edges']).map(unsignedWord);
    // The edge list is the closed cycle of the polygon: one edge a vertex. A payload
    // that carried fewer would leave the classifier's scan with a gap it reads as land.
    if (edges.length !== vertices.length) {
      fail('island edge list is not the closed cycle of its vertices');
    }
    const boxes = list(i['boxes']).map(value => {
      const box = object(value);
      return {
        kind: choice(box['kind'], ISLAND_BOXES),
        sourceAddress: integer(box['sourceAddress']),
        x: cellPair(box['x']),
        z: cellPair(box['z'])
      };
    });
    // $05612A reads box 0 and box 1 unconditionally before any sentinel test, so an
    // island always has an extent and a core; the rest are exclusions.
    if (
      boxes[0]?.kind !== 'extent' ||
      boxes[1]?.kind !== 'core' ||
      boxes.slice(2).some(box => box.kind !== 'exclusion')
    ) {
      fail('island boxes are not extent, core and exclusions in order');
    }
    const extent = object(i['extent']);
    return {
      areaName: i['areaName'] === null ? null : string(i['areaName']),
      body,
      boxes,
      coastline: {
        edges,
        sourceAddress: integer(coast['sourceAddress']),
        vertices
      },
      extent: {
        coversSurface: boolean(extent['coversSurface']),
        wrapsX: boolean(extent['wrapsX']),
        wrapsZ: boolean(extent['wrapsZ']),
        x: cellPair(extent['x']),
        z: cellPair(extent['z'])
      },
      id: string(i['id']),
      landColour: string(i['landColour']),
      origin: cellPair(i['origin']),
      reason: string(i['reason']),
      sourceAddress: integer(i['sourceAddress']),
      sourceLandColour: unsignedWord(i['sourceLandColour']),
      sourceOrigin: cellPair(i['sourceOrigin']),
      structureGroup: byte(i['structureGroup']),
      workspace:
        i['workspace'] === null || i['workspace'] === undefined
          ? null
          : integer(i['workspace'])
    };
  });
  const islandIds = unique(islands);
  for (const island of islands) {
    // Group $00 is the shared empty record, so a record that names it binds no
    // workspace; anything else must name the record its group selects.
    if ((island.structureGroup === 0) !== (island.workspace === null)) {
      fail('island workspace disagrees with its structure group');
    }
  }
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
    let associationGroups: Instance['associationGroups'] = null;
    if (
      i['associationGroups'] !== null &&
      i['associationGroups'] !== undefined
    ) {
      const selectors = new Set<number>();
      associationGroups = list(i['associationGroups']).map(value => {
        const group = object(value);
        const selector = byte(group['group']);
        if (selector === 0 || selectors.has(selector)) {
          fail('invalid or duplicate association group selector');
        }
        selectors.add(selector);
        const regions = new Set<number>();
        const pairs = list(group['pairs']).map(value => {
          const pair = object(value);
          const regionSelector = byte(pair['regionSelector']);
          if (regionSelector === 0 || regions.has(regionSelector)) {
            fail('invalid or duplicate association group region selector');
          }
          regions.add(regionSelector);
          return {
            insertionKey: byte(pair['insertionKey']),
            regionSelector
          };
        });
        return { group: selector, pairs };
      });
    }
    let location: Instance['location'] = null;
    if (i['location'] !== null) {
      const l = object(i['location']);
      const body = string(l['body']);
      reference(bodyIds, body, 'body');
      const place = l['place'] === null ? null : string(l['place']);
      if (place !== null) {
        reference(placeIds, place, 'place');
      }
      const island =
        l['island'] === null || l['island'] === undefined
          ? null
          : string(l['island']);
      if (island !== null) {
        reference(islandIds, island, 'island');
        if (islands.find(item => item.id === island)!.body !== body) {
          fail('instance names an island on another body');
        }
      }
      location = {
        body,
        coordinateSystem: string(l['coordinateSystem']),
        heading: l['heading'] === null ? null : number(l['heading']),
        island,
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
    let handling: Instance['handling'] = null;
    if (i['handling'] !== null && i['handling'] !== undefined) {
      const h = object(i['handling']);
      handling = {
        byte: byte(h['byte']),
        carried: boolean(h['carried']),
        refusal:
          h['refusal'] === null
            ? null
            : choice(h['refusal'], ['message', 'silent'] as const),
        requiredSupportRank: byte(h['requiredSupportRank']),
        suppliedSupportRank: byte(h['suppliedSupportRank']),
        takeable: boolean(h['takeable'])
      };
    }
    // Required since schema 17: a document without the key predates boarding (#408).
    if (i['boarding'] === undefined) {
      fail('instance has no boarding block');
    }
    let boarding: Instance['boarding'] = null;
    if (i['boarding'] !== null) {
      const b = object(i['boarding']);
      const admission =
        b['admission'] === null ? null : choice(b['admission'], ADMISSIONS);
      const pairedSlot =
        b['pairedSlot'] === null ? null : byte(b['pairedSlot']);
      if ((admission === 'paired') !== (pairedSlot !== null)) {
        fail('a paired admission and a paired slot come together');
      }
      const refusal = b['refusal'] === null ? null : string(b['refusal']);
      if (refusal !== null && !/^system-string-\d+$/.test(refusal)) {
        fail(`refusal ${refusal} is not a system string`);
      }
      boarding = {
        admission,
        admissionProvenance: choice(b['admissionProvenance'], PROVENANCES),
        boardable: boolean(b['boardable']),
        boardableProvenance: choice(b['boardableProvenance'], PROVENANCES),
        pairedInstance:
          b['pairedInstance'] === null ? null : string(b['pairedInstance']),
        pairedProvenance: choice(b['pairedProvenance'], PROVENANCES),
        pairedSlot,
        reason: string(b['reason']),
        refusal,
        refusalProvenance: choice(b['refusalProvenance'], PROVENANCES)
      };
    }
    return {
      association,
      associationGroups,
      boarding,
      handling,
      id: string(i['id']),
      keyBase:
        i['keyBase'] === null || i['keyBase'] === undefined
          ? null
          : byte(i['keyBase']),
      location,
      model,
      name: string(i['name']),
      placement,
      placementClass:
        i['placementClass'] === null || i['placementClass'] === undefined
          ? null
          : byte(i['placementClass']),
      reason: string(i['reason']),
      sourceAddress: integer(i['sourceAddress'])
    };
  });
  const instanceIds = unique(instances);
  for (const instance of instances) {
    if (instance.boarding?.pairedInstance) {
      reference(
        instanceIds,
        instance.boarding.pairedInstance,
        'paired instance'
      );
    }
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
  const roadNetworks = list(r['roadNetworks'] ?? []).map(
    (item): RoadNetwork => {
      const n = object(item);
      reference(bodyIds, string(n['body']), 'body');
      const island = n['island'] === null ? null : string(n['island']);
      if (island !== null) {
        reference(islandIds, island, 'island');
      }
      const cells = list(n['cells']).map(value => {
        const c = object(value);
        const cell = byte(c['cell']);
        const model = c['model'] === null ? null : string(c['model']);
        if (model !== null) {
          reference(modelIds, model, 'road cell ground');
        }
        const x = byte(c['x']);
        const z = byte(c['z']);
        // The cell number is the grid index the classifier walked, so a payload whose
        // x/z disagreed with it would place the piece on a cell the game never classified.
        if (x !== (cell & 15) || z !== cell >> 4) {
          fail('road cell position disagrees with its cell number');
        }
        const piece = byte(c['piece']);
        if (piece === 0) {
          fail('a road cell carries the no-road piece');
        }
        return {
          cell,
          model,
          overridden:
            c['overridden'] === null ? null : boolean(c['overridden']),
          piece,
          pieceName: choice(c['pieceName'], ROAD_PIECES),
          recordAddress: integer(c['recordAddress']),
          rotation: byte(c['rotation']),
          sourceClass: byte(c['sourceClass']),
          x,
          z
        };
      });
      const pieces = list(n['pieces']).map(value => {
        const piece = object(value);
        return {
          index: byte(piece['index']),
          name: choice(piece['name'], ROAD_PIECES),
          recordAddress: integer(piece['recordAddress'])
        };
      });
      // $04EC22 copies exactly six selectors, and (class >> 3) & $E can name any of them.
      if (pieces.length !== ROAD_PIECES.length) {
        fail('a road network does not carry all six road-piece selectors');
      }
      return {
        attestation: choice(n['attestation'], ['capture', 'image'] as const),
        body: string(n['body']),
        cells,
        classTableAddress: integer(n['classTableAddress']),
        evidence: evidenceList(n['evidence']),
        id: string(n['id']),
        island,
        origin: cellPair(n['origin']),
        pieces,
        reason: string(n['reason']),
        runs: list(n['runs']).map(value => {
          const run = object(value);
          return {
            axis: choice(run['axis'], ['x', 'z'] as const),
            end: cellPair(run['end']),
            start: cellPair(run['start'])
          };
        }),
        sourceAddress: integer(n['sourceAddress']),
        structureGroup: byte(n['structureGroup'])
      };
    }
  );
  unique(roadNetworks);
  const tables = list(r['tables']).map(item => {
    const t = object(item);
    const entries = strings(t['entries']);
    const entryCount = integer(t['entryCount']);
    if (entries.length !== entryCount) {
      fail('table entry count mismatch');
    }
    const kind = choice(t['kind'], KINDS);
    for (const id of entries) {
      reference(modelIds, id, 'table model');
      if (summaries.get(id)!.kind !== kind) {
        fail('table kind mismatch');
      }
    }
    return {
      address: integer(t['address']),
      entries,
      entryCount,
      extentEvidence: string(t['extentEvidence']),
      kind,
      ...(t['extent'] === undefined ? {} : { extent: bankExtent(t['extent']) })
    };
  });
  if (new Set(tables.map(table => table.kind)).size !== tables.length) {
    fail('duplicate table kind');
  }
  for (const model of modelIndex) {
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
  for (const model of modelIndex) {
    if (!covered.has(model.id)) {
      fail('model missing from census');
    }
  }
  const coverage = object(r['coverage']);
  if (typeof coverage['complete'] !== 'boolean') {
    fail('invalid coverage status');
  }
  const counted = {
    decoded: modelIndex.filter(model => model.status === 'decoded').length,
    partial: modelIndex.filter(model => model.status === 'partial').length,
    unique: modelIndex.length,
    unresolved: modelIndex.filter(model => model.status === 'unresolved').length
  };
  const census =
    coverage['census'] === undefined
      ? counted
      : {
          decoded: integer(object(coverage['census'])['decoded']),
          partial: integer(object(coverage['census'])['partial']),
          unique: integer(object(coverage['census'])['unique']),
          unresolved: integer(object(coverage['census'])['unresolved'])
        };
  if (
    census.unique !== counted.unique ||
    census.decoded !== counted.decoded ||
    census.partial !== counted.partial ||
    census.unresolved !== counted.unresolved
  ) {
    fail('coverage census does not match models');
  }
  const classifications: Record<string, number> =
    coverage['classifications'] === undefined
      ? {}
      : Object.fromEntries(
          Object.entries(object(coverage['classifications'])).map(
            ([key, value]) => [key, integer(value)]
          )
        );
  const coverageTables: CoverageTable[] =
    coverage['tables'] === undefined
      ? []
      : list(coverage['tables']).map(item => {
          const row = object(item);
          return {
            address: integer(row['address']),
            aliases: integer(row['aliases']),
            decoded: integer(row['decoded']),
            empty: integer(row['empty']),
            extentEvidence: string(row['extentEvidence']),
            kind: choice(row['kind'], KINDS),
            nullRecords: integer(row['nullRecords']),
            partial: integer(row['partial']),
            slots: integer(row['slots']),
            unique: integer(row['unique']),
            unresolved: integer(row['unresolved'])
          };
        });
  const diskLoad =
    coverage['diskLoad'] === undefined
      ? []
      : list(coverage['diskLoad']).map(item => {
          const row = object(item);
          return { finding: string(row['finding']), path: string(row['path']) };
        });
  return {
    bodies,
    coverage: {
      census,
      classifications,
      complete: coverage['complete'] as boolean,
      diskLoad,
      notes: strings(coverage['notes']),
      tables: coverageTables,
      unexplored:
        coverage['unexplored'] === undefined
          ? []
          : strings(coverage['unexplored'])
    },
    instances,
    islands,
    modelIndex,
    places,
    roadNetworks,
    schemaVersion: 17,
    source,
    tables
  };
};

/// The Catalogue with every Model read, as tests and whole-Catalogue checks hold it. The
/// browser never assembles one: it reads Models by id through a `ModelStore`.
export interface AssembledCatalogue extends Catalogue {
  readonly models: readonly Model[];
}

const documentIds = new WeakMap<
  Catalogue,
  {
    readonly instances: ReadonlySet<string>;
    readonly models: ReadonlyMap<string, ModelSummary>;
  }
>();
const idsOf = (document: Catalogue) => {
  let ids = documentIds.get(document);
  if (ids === undefined) {
    ids = {
      instances: new Set(document.instances.map(instance => instance.id)),
      models: new Map(document.modelIndex.map(entry => [entry.id, entry]))
    };
    documentIds.set(document, ids);
  }
  return ids;
};

/// One Model record checked against the shared document: its own shape, that the index lists
/// it with the same summary, and that every Model and Instance it names exists. The one check
/// that needs a second Model's record, a structure's detail binding, waits for assembly.
export const parseModel = (value: unknown, document: Catalogue): Model => {
  const model = modelRecord(value);
  const ids = idsOf(document);
  const summary = ids.models.get(model.id);
  if (summary === undefined) {
    return fail(`model ${model.id} is not in the model index`);
  }
  for (const field of [
    'kind',
    'name',
    'recordClass',
    'status',
    'storeyHeight',
    'supportTop'
  ] as const) {
    if (summary[field] !== model[field]) {
      fail(`model ${model.id} ${field} disagrees with the model index`);
    }
  }
  if (
    summary.slots.length !== model.slots.length ||
    summary.slots.some((slot, index) => slot !== model.slots[index])
  ) {
    fail(`model ${model.id} slots disagree with the model index`);
  }
  if (model.detailSelection !== undefined) {
    if (model.kind !== 'interior') {
      fail('detail selector requires a detail model');
    }
    for (const group of model.detailSelection) {
      for (const records of [
        group.default,
        ...group.boxes.map(box => box.records)
      ]) {
        if (
          model.variants.length === 0 ||
          model.variants.some(v =>
            records.some(i => i < 0 || i >= (v.mesh.recordCount ?? 0))
          )
        ) {
          fail('invalid detail record reference');
        }
      }
    }
  }
  const selection = model.structureSelection;
  if (selection !== undefined) {
    if (model.kind !== 'structure') {
      fail('structure selector requires a structure model');
    }
    if (ids.models.get(selection.detailModel)?.kind !== 'interior') {
      fail('invalid selector detail binding');
    }
  }
  for (const id of model.relatedModels) {
    if (!ids.models.has(id)) {
      fail(`missing related model ${id}`);
    }
  }
  for (const id of model.linkedInstances) {
    reference(ids.instances, id, 'linked instance');
  }
  return model;
};

/// One stored Model file: the record, and the run it was extracted from, which must be the
/// Catalogue's own so a file left behind by another run is refused rather than drawn.
export const parseModelFile = (value: unknown, document: Catalogue): Model => {
  const r = object(value);
  if (r['schemaVersion'] !== 17) {
    fail('unsupported model file schema version');
  }
  const src = object(r['source']);
  if (
    string(src['programSha256']) !== document.source.programSha256 ||
    string(src['run']) !== document.source.run
  ) {
    fail('model file comes from another run than the Catalogue');
  }
  return parseModel(r['model'], document);
};

/// A structure's selector must name a variant of an interior that carries a detail selector.
export const checkDetailBinding = (
  structure: Model,
  detail: Model | undefined
): void => {
  const selection = structure.structureSelection;
  if (
    selection !== undefined &&
    (detail?.detailSelection === undefined ||
      !detail.variants.some(v => v.id === selection.detailVariant))
  ) {
    fail('invalid selector detail binding');
  }
};

/// The whole Catalogue from its document and exactly the Models its index names, in index
/// order, with the structure-to-interior bindings that need two Model records checked.
export const assembleCatalogue = (
  document: Catalogue,
  models: readonly Model[]
): AssembledCatalogue => {
  unique(models);
  const byId = new Map(models.map(model => [model.id, model]));
  if (
    models.length !== document.modelIndex.length ||
    document.modelIndex.some(entry => !byId.has(entry.id))
  ) {
    fail('models do not match the model index');
  }
  for (const model of models) {
    const selection = model.structureSelection;
    if (selection !== undefined) {
      checkDetailBinding(model, byId.get(selection.detailModel));
    }
  }
  return {
    ...document,
    models: document.modelIndex.map(entry => byId.get(entry.id)!)
  };
};

/// A Catalogue held as one value with its Models inline, as tests build one.
export const parseCatalogue = (value: unknown): AssembledCatalogue => {
  const { models, ...rest } = object(value);
  const document = parseCatalogueDocument(rest);
  return assembleCatalogue(
    document,
    list(models).map(model => parseModel(model, document))
  );
};

export const CATALOGUE_PATH = '/payload/damocles/catalogue.json';
export const modelPath = (id: string): string =>
  `/payload/damocles/models/${id}.json`;

/// One payload path fetched and parsed as JSON, refusing any answer but success.
export const payloadJson = async (path: string): Promise<unknown> => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
};

/// Id lookup for a Catalogue, memoised per Catalogue object.
///
/// The Damocles draw and selection passes resolve ids per resident per frame, and a linear scan
/// over a thousand instances made one frame quadratic: a 90-second walk took 46 seconds to
/// simulate, past the end-to-end fixture's navigation timeout.
///
/// The memo is a `WeakMap` keyed by the Catalogue rather than a field on it, because tests and
/// callers derive a Catalogue by spreading one and replacing `instances` or `modelIndex`. A stored
/// index would go stale against the replacement and answer from the original; a spread makes a
/// new object, so this builds it a fresh index instead.
const instanceIndex = new WeakMap<Catalogue, ReadonlyMap<string, Instance>>();
const summaryIndex = new WeakMap<
  Catalogue,
  ReadonlyMap<string, ModelSummary>
>();

export const instanceById = (
  catalogue: Catalogue,
  id: string | undefined
): Instance | undefined => {
  if (id === undefined) {
    return undefined;
  }
  let index = instanceIndex.get(catalogue);
  if (index === undefined) {
    index = new Map(catalogue.instances.map(item => [item.id, item]));
    instanceIndex.set(catalogue, index);
  }
  return index.get(id);
};

/// What the index says about a Model, whether or not its file has been read. Every game rule
/// reads this; only drawing needs the Model record itself.
export const modelSummaryById = (
  catalogue: Catalogue,
  id: string | undefined
): ModelSummary | undefined => {
  if (id === undefined) {
    return undefined;
  }
  let index = summaryIndex.get(catalogue);
  if (index === undefined) {
    index = new Map(catalogue.modelIndex.map(item => [item.id, item]));
    summaryIndex.set(catalogue, index);
  }
  return index.get(id);
};

export const selectModels = (
  data: Catalogue,
  query: string,
  kind: string,
  status: string
): readonly ModelSummary[] => {
  const words = query.toLowerCase().trim().split(/\s+/);
  return data.modelIndex.filter(
    model =>
      (!kind || model.kind === kind) &&
      (!status || model.status === status) &&
      words.every(word =>
        `${model.name} ${model.id} ${model.slots.join(' ')} ${model.recordClass}`
          .toLowerCase()
          .includes(word)
      )
  );
};
