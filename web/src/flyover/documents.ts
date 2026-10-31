import type { SystemId } from '../shell/documentPath.ts';

export type FlyoverRange = 'orbital' | 'coastal' | 'surface';
export interface FlyoverCameraPresentation {
  readonly framingCoverage: number;
  readonly overviewAxis: 'positive-z';
  readonly verticalFieldOfViewDegrees: number;
}

export interface FlyoverBackdropPresentation {
  readonly colour: string;
  readonly pointSizeCssPixels: number;
  readonly starColour: string;
  readonly starCount: number;
  readonly starSeed: number;
}

export interface FlyoverBodyMeshPresentation {
  readonly latitudeSegments: number;
  readonly longitudeSegments: number;
}

export type FlyoverLighting =
  | { readonly kind: 'body'; readonly sourceBodyId: string }
  | { readonly kind: 'camera-headlight' };
export type RadiusRule =
  | { readonly fraction: number; readonly kind: 'nearest-neighbour' }
  | { readonly kind: 'recovered-extent' }
  | { readonly kind: 'targ-system' };

export interface FlyoverBodyPresentation {
  readonly id: string;
  readonly radius: RadiusRule;
  readonly ranges: readonly FlyoverRange[];
}

/// Targ's Bodies take their colour and radius from the authored Targ System (ADR 0086).
export type TargBodyPresentation = FlyoverBodyPresentation;

export interface SurfacePatch {
  readonly eastAxis: 'x';
  readonly northAxis: 'z';
  readonly sourceCentre: { readonly x: number; readonly z: number };
  readonly unitsPerRadian: number;
}

export interface IslandPresentation {
  readonly bodyId: string;
  readonly centreDegrees: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly id: string;
  readonly polygonDegrees: readonly (readonly [number, number])[];
  readonly surfacePatch?: SurfacePatch;
}

interface PresentationBase {
  readonly backdrop: FlyoverBackdropPresentation;
  readonly bodies: readonly FlyoverBodyPresentation[];
  readonly bodyMesh: FlyoverBodyMeshPresentation;
  readonly camera: FlyoverCameraPresentation;
  readonly cameraSpeed: {
    readonly maximumUnitsPerSecond: number;
    readonly minimumUnitsPerSecond: number;
  };
  readonly schemaVersion: 1;
  readonly systemId: SystemId;
}

export interface TargPresentationDocument extends PresentationBase {
  readonly bodies: readonly TargBodyPresentation[];
  readonly islands: readonly IslandPresentation[];
  readonly lighting: {
    readonly kind: 'body';
    readonly sourceBodyId: 'sun';
  };
  readonly surfaceColours: {
    readonly coastline: string;
    readonly ground: string;
    readonly ocean: string;
  };
  readonly systemId: 'targ';
}

export interface GammaPresentationDocument extends PresentationBase {
  readonly lighting: Extract<
    FlyoverLighting,
    { readonly kind: 'camera-headlight' }
  >;
  readonly systemId: 'gamma';
}

export type FlyoverPresentationDocument =
  GammaPresentationDocument | TargPresentationDocument;

export interface GammaBody {
  /// The `$0060C0` slot's low word masked to twelve bits, expanded as catalogue.json expands it.
  readonly baseColour: string;
  /// The Bodies the sky passes draw while standing on this one, as Body ids in the engine's
  /// order, read from `$00809C + 4 * sourceIndex`. The engine draws them in this order with no
  /// depth sort, so a later entry covers an earlier one.
  readonly drawList: readonly string[];
  readonly id: string;
  readonly name: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly positionKind?: 'capture-time-sample';
  /// The Body's radius in position units: `size / 256`, recovered by #528. The sky pass
  /// draws a Body with pixel radius `size / depth`, and positions at `256 · u / depth`.
  readonly radius: number;
  /// The raw longword from `$006040 + 4 * sourceIndex`, which is a packed binary float rather
  /// than the integer it looks like. `size` is its decode (#424); read as an integer it
  /// flattens the System's 500-fold size range to 1.69-fold.
  readonly radiusExtent: number;
  /// `radiusExtent` decoded: the low word is a mantissa normalised into `$1000..$1FFF`, with
  /// an implicit 1 at bit 12, and the high word is a binary exponent.
  readonly size: number;
  readonly sourceColour: number;
  readonly sourceIndex: number;
}

/// The static facts the sky pass reads beyond the Body records
/// (`docs/research/damocles-sky-bodies.md`).
export interface GammaSky {
  readonly drawListArea: GammaSourceWindow;
  readonly drawListPointers: GammaSourceWindow;
  readonly evidence: string;
  /// How far above its own Body's centre the sky's eye stands (`$799E`).
  readonly eyeHeight: number;
  /// What each disc row's half-width is divided by (`$045A0C`), which corrects for the ST's
  /// non-square low-resolution pixels.
  readonly halfWidthDivisor: number;
  /// The screen row the sky passes clip Bodies at: on foot, and in flight or space.
  readonly horizonRows: {
    readonly onFoot: number;
    readonly otherwise: number;
  };
  /// The projection's focal scale (`$7964`), and the number of size units per radius.
  readonly projectionScale: number;
}

/// What places and draws the comet DAMOCLES beyond its Body record (#538).
export interface GammaComet {
  readonly evidence: string;
  /// The palette slots of the disc `$04FCE6` draws over the head, first span then second. With
  /// its split at the rim only the first is painted.
  readonly headDisc: {
    readonly address: string;
    readonly slots: readonly [number, number];
  };
  /// The head points as offsets from the comet's centre, projected into the slots after the
  /// tail tip (`$04FD12`).
  readonly headPoints: {
    readonly address: string;
    readonly offsets: readonly {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }[];
  };
  readonly motionEvidence: string;
  /// The polygons `$04F8FE` draws, in order. A face names its points by index: 0 is the tail
  /// tip and 1 on are the head points.
  readonly polygons: {
    readonly address: string;
    readonly faces: readonly {
      readonly colour: string;
      readonly points: readonly number[];
      readonly sourceColour: number;
    }[];
  };
  /// The tail tip is the centre plus the centre shifted right by this many bits, at Y 0: a
  /// quarter further from DIALIS again (`$04FC18`).
  readonly tailShift: number;
  /// The path `$051E88` interpolates from the impact clock (#440): seconds to impact, which
  /// count up to zero, and the X and Z the comet's centre holds then. Its Y is 0.
  readonly waypoints: GammaSourceWindow & {
    readonly records: readonly {
      readonly seconds: number;
      readonly x: number;
      readonly z: number;
    }[];
  };
}

/// The star list the three starfields plot from (#578): `$0503FE` in flight, `$0505B8` on an
/// island's core on foot and `$05067C` in space, one pixel a star
/// (docs/research/damocles-starfield.md).
export interface GammaStarfield {
  readonly colours: GammaSourceWindow & {
    /// The colour each star's index draws in: the word at `$050778 + 4·index + 2`.
    readonly entries: readonly {
      readonly colour: string;
      readonly sourceColour: number;
    }[];
  };
  /// Columns in one turn of yaw. A star's x wraps here.
  readonly columnsPerTurn: number;
  readonly evidence: string;
  readonly list: GammaSourceWindow;
  /// The rows' pitch offsets: `(pitch − offset) · 4 · pitchScale >> 16` rows scroll off the top.
  readonly pitchOffsets: { readonly flight: number; readonly space: number };
  readonly pitchScale: number;
  /// A yaw step scrolls the columns by `(yaw · 2 · scrollScale) >> 16`.
  readonly scrollScale: number;
  /// Sorted by x: the column in the turn, the row in the band, and the colour index.
  readonly stars: readonly (readonly [number, number, number])[];
}

export interface GammaSourceWindow {
  readonly address: string;
  readonly end: string;
  readonly sha256: string;
}

export interface GammaSystemDocument {
  readonly bodies: readonly GammaBody[];
  readonly comet: GammaComet;
  readonly coordinateSystem: {
    readonly axes: readonly ['x', 'y', 'z'];
    readonly kind: 'resident-cartesian-centre';
    readonly units: 'native-engine-units';
  };
  readonly coverage: {
    readonly complete: boolean;
    readonly notes: readonly string[];
  };
  readonly schemaVersion: 1;
  readonly sky: GammaSky;
  readonly source: {
    readonly authority: string;
    readonly colourTableSha256: string;
    readonly evidence: string;
    readonly programSha256: string;
    readonly ramSha256: string;
    readonly run: string;
  };
  readonly starfield: GammaStarfield;
  readonly title: 'Damocles';
}

export interface TargSystemBody {
  readonly baseColour: string;
  readonly id: TargSystemBodyId;
  readonly name: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  /// The Body this one is grouped under, which asserts no revolution (ADR 0086).
  readonly primaryId?: TargSystemBodyId;
  readonly radius: number;
}

export type TargSystemBodyId = 'inner-moon' | 'outer-moon' | 'sun' | 'targ';

/// The Targ System: authored, static, and under the Gamma System's rules (ADR 0086). Kept
/// outside the Data Payload because nothing in it is recovered (ADR 0042).
export interface TargSystemDocument {
  readonly bodies: readonly TargSystemBody[];
  readonly coordinateSystem: {
    readonly axes: readonly ['x', 'y', 'z'];
    readonly kind: 'targ-equatorial-centre';
    readonly north: 'z';
    readonly units: 'flyover-units';
  };
  readonly rotatingBodyId: 'targ';
  readonly schemaVersion: 1;
  readonly source: {
    readonly authority: 'authored';
    readonly decision: string;
  };
  readonly systemId: 'targ';
}

const fail = (path: string, reason: string): never => {
  throw new Error(`Invalid Flyover document: ${path} ${reason}`);
};

const object = (
  value: unknown,
  path: string,
  fields: readonly string[]
): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'should be an object');
  }
  const result = value as Record<string, unknown>;
  for (const field of Object.keys(result)) {
    if (!fields.includes(field)) {
      fail(path, `has unexpected field ${field}`);
    }
  }
  for (const field of fields) {
    if (!(field in result)) {
      fail(path, `is missing field ${field}`);
    }
  }
  return result;
};

const array = (value: unknown, path: string): unknown[] =>
  Array.isArray(value) ? value : fail(path, 'should be an array');
const text = (value: unknown, path: string): string =>
  typeof value === 'string' ? value : fail(path, 'should be a string');
const finite = (value: unknown, path: string): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(path, 'should be a finite number');
const positive = (value: unknown, path: string): number => {
  const number = finite(value, path);
  return number > 0 ? number : fail(path, 'should be positive');
};
const boundedPositive = (
  value: unknown,
  path: string,
  maximum: number
): number => {
  const number = positive(value, path);
  return number <= maximum
    ? number
    : fail(path, `should not exceed ${maximum}`);
};
const integer = (value: unknown, path: string): number => {
  const number = finite(value, path);
  return Number.isSafeInteger(number) && number >= 0
    ? number
    : fail(path, 'should be a nonnegative integer');
};
const signedInteger = (value: unknown, path: string): number => {
  const number = finite(value, path);
  return Number.isSafeInteger(number)
    ? number
    : fail(path, 'should be an integer');
};
const positiveInteger = (value: unknown, path: string): number => {
  const number = integer(value, path);
  return number > 0 ? number : fail(path, 'should be a positive integer');
};
const boundedPositiveInteger = (
  value: unknown,
  path: string,
  maximum: number
): number => {
  const number = positiveInteger(value, path);
  return number <= maximum
    ? number
    : fail(path, `should not exceed ${maximum}`);
};
const boolean = (value: unknown, path: string): boolean =>
  typeof value === 'boolean' ? value : fail(path, 'should be a boolean');
const literal = <T extends string | number>(
  value: unknown,
  expected: T,
  path: string
): T => (value === expected ? expected : fail(path, `should be ${expected}`));
const strings = (value: unknown, path: string): string[] =>
  array(value, path).map((entry, index) => text(entry, `${path}[${index}]`));
const identifier = (value: unknown, path: string): string => {
  const id = text(value, path);
  return /^[a-z]+(?:-[a-z]+)*$/.test(id)
    ? id
    : fail(path, 'should be a non-empty lowercase kebab-case ID');
};
const colour = (value: unknown, path: string): string => {
  const result = text(value, path);
  return /^#[\da-f]{6}$/.test(result)
    ? result
    : fail(path, 'should be a lowercase six-digit colour');
};

/// Expand an ST `0RGB` nibble triple the way `research/damocles-st/damocleslab/catalogue.py`
/// does, so `system.json` and `catalogue.json` cannot disagree about a recovered colour.
const expandStRgb = (word: number): string =>
  `#${[8, 4, 0]
    .map(shift => (((word >> shift) & 7) * 34).toString(16).padStart(2, '0'))
    .join('')}`;

const point = (value: unknown, path: string) => {
  const source = object(value, path, ['x', 'y', 'z']);
  return {
    x: finite(source['x'], `${path}.x`),
    y: finite(source['y'], `${path}.y`),
    z: finite(source['z'], `${path}.z`)
  };
};

const unique = (values: readonly string[], path: string): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      fail(path, `has duplicate ID ${value}`);
    }
    seen.add(value);
  }
};

/// Decode the engine's packed binary float, refusing a mantissa outside `$1000..$1FFF`.
const unpackSize = (raw: number, path: string): number => {
  const mantissa = raw & 0xff_ff;
  return mantissa >= 0x10_00 && mantissa < 0x20_00
    ? (mantissa / 0x10_00) * 2 ** (raw >>> 16)
    : fail(path, 'should hold a normalised packed-float mantissa');
};

const sha256 = (value: unknown, path: string): string => {
  const hash = text(value, path);
  return /^[\da-f]{64}$/.test(hash)
    ? hash
    : fail(path, 'should be a lowercase SHA-256 digest');
};

const sourceWindow = (value: unknown, path: string): GammaSourceWindow => {
  const window = object(value, path, ['address', 'end', 'sha256']);
  return {
    address: text(window['address'], `${path}.address`),
    end: text(window['end'], `${path}.end`),
    sha256: sha256(window['sha256'], `${path}.sha256`)
  };
};

const readGammaSky = (value: unknown): GammaSky => {
  const sky = object(value, 'sky', [
    'drawListArea',
    'drawListPointers',
    'evidence',
    'eyeHeight',
    'halfWidthDivisor',
    'horizonRows',
    'projectionScale'
  ]);
  const rows = object(sky['horizonRows'], 'sky.horizonRows', [
    'onFoot',
    'otherwise'
  ]);
  return {
    drawListArea: sourceWindow(sky['drawListArea'], 'sky.drawListArea'),
    drawListPointers: sourceWindow(
      sky['drawListPointers'],
      'sky.drawListPointers'
    ),
    evidence: text(sky['evidence'], 'sky.evidence'),
    eyeHeight: positive(sky['eyeHeight'], 'sky.eyeHeight'),
    halfWidthDivisor: positive(sky['halfWidthDivisor'], 'sky.halfWidthDivisor'),
    horizonRows: {
      onFoot: positiveInteger(rows['onFoot'], 'sky.horizonRows.onFoot'),
      otherwise: positiveInteger(rows['otherwise'], 'sky.horizonRows.otherwise')
    },
    projectionScale: positive(sky['projectionScale'], 'sky.projectionScale')
  };
};

const readGammaComet = (value: unknown): GammaComet => {
  const comet = object(value, 'comet', [
    'evidence',
    'headDisc',
    'headPoints',
    'motionEvidence',
    'polygons',
    'tailShift',
    'waypoints'
  ]);
  const headDisc = object(comet['headDisc'], 'comet.headDisc', [
    'address',
    'slots'
  ]);
  const slots = array(headDisc['slots'], 'comet.headDisc.slots').map(
    (slot, index) => integer(slot, `comet.headDisc.slots[${index}]`)
  );
  if (slots.length !== 2) {
    fail('comet.headDisc.slots', 'should hold two palette slots');
  }
  const headPoints = object(comet['headPoints'], 'comet.headPoints', [
    'address',
    'offsets'
  ]);
  const offsets = array(headPoints['offsets'], 'comet.headPoints.offsets').map(
    (offset, index) => point(offset, `comet.headPoints.offsets[${index}]`)
  );
  const polygons = object(comet['polygons'], 'comet.polygons', [
    'address',
    'faces'
  ]);
  const faces = array(polygons['faces'], 'comet.polygons.faces').map(
    (raw, index) => {
      const path = `comet.polygons.faces[${index}]`;
      const face = object(raw, path, ['colour', 'points', 'sourceColour']);
      const sourceColour = integer(
        face['sourceColour'],
        `${path}.sourceColour`
      );
      const faceColour = colour(face['colour'], `${path}.colour`);
      if (sourceColour > 0xf_ff || faceColour !== expandStRgb(sourceColour)) {
        fail(`${path}.colour`, 'should be the expansion of sourceColour');
      }
      const points = array(face['points'], `${path}.points`).map(
        (entry, pointIndex) => {
          const at = integer(entry, `${path}.points[${pointIndex}]`);
          return at <= offsets.length
            ? at
            : fail(`${path}.points[${pointIndex}]`, 'names no projected point');
        }
      );
      if (points.length < 3) {
        fail(`${path}.points`, 'should name at least three points');
      }
      return { colour: faceColour, points, sourceColour };
    }
  );
  const waypoints = object(comet['waypoints'], 'comet.waypoints', [
    'address',
    'end',
    'records',
    'sha256'
  ]);
  const records = array(waypoints['records'], 'comet.waypoints.records').map(
    (raw, index) => {
      const path = `comet.waypoints.records[${index}]`;
      const record = object(raw, path, ['seconds', 'x', 'z']);
      return {
        seconds: signedInteger(record['seconds'], `${path}.seconds`),
        x: signedInteger(record['x'], `${path}.x`),
        z: signedInteger(record['z'], `${path}.z`)
      };
    }
  );
  if (records.length < 2) {
    fail('comet.waypoints.records', 'should hold at least one segment');
  }
  for (let index = 1; index < records.length; index += 1) {
    if (records[index]!.seconds < records[index - 1]!.seconds) {
      fail('comet.waypoints.records', 'should run forward in time');
    }
  }
  return {
    evidence: text(comet['evidence'], 'comet.evidence'),
    headDisc: {
      address: text(headDisc['address'], 'comet.headDisc.address'),
      slots: [slots[0]!, slots[1]!]
    },
    headPoints: {
      address: text(headPoints['address'], 'comet.headPoints.address'),
      offsets
    },
    motionEvidence: text(comet['motionEvidence'], 'comet.motionEvidence'),
    polygons: {
      address: text(polygons['address'], 'comet.polygons.address'),
      faces
    },
    tailShift: integer(comet['tailShift'], 'comet.tailShift'),
    waypoints: {
      ...sourceWindow(
        {
          address: waypoints['address'],
          end: waypoints['end'],
          sha256: waypoints['sha256']
        },
        'comet.waypoints'
      ),
      records
    }
  };
};

const readGammaStarfield = (value: unknown): GammaStarfield => {
  const field = object(value, 'starfield', [
    'colours',
    'columnsPerTurn',
    'evidence',
    'list',
    'pitchOffsets',
    'pitchScale',
    'scrollScale',
    'stars'
  ]);
  const colours = object(field['colours'], 'starfield.colours', [
    'address',
    'end',
    'entries',
    'sha256'
  ]);
  const entries = array(colours['entries'], 'starfield.colours.entries').map(
    (raw, index) => {
      const path = `starfield.colours.entries[${index}]`;
      const entry = object(raw, path, ['colour', 'sourceColour']);
      const sourceColour = integer(
        entry['sourceColour'],
        `${path}.sourceColour`
      );
      const entryColour = colour(entry['colour'], `${path}.colour`);
      if (sourceColour > 0xf_ff || entryColour !== expandStRgb(sourceColour)) {
        fail(`${path}.colour`, 'should be the expansion of sourceColour');
      }
      return { colour: entryColour, sourceColour };
    }
  );
  if (entries.length !== 16) {
    fail('starfield.colours.entries', 'should hold sixteen colours');
  }
  const columnsPerTurn = positiveInteger(
    field['columnsPerTurn'],
    'starfield.columnsPerTurn'
  );
  const offsets = object(field['pitchOffsets'], 'starfield.pitchOffsets', [
    'flight',
    'space'
  ]);
  const stars = array(field['stars'], 'starfield.stars').map(
    (raw, index): readonly [number, number, number] => {
      const path = `starfield.stars[${index}]`;
      const [x, row, colourIndex, ...rest] = array(raw, path).map((entry, at) =>
        integer(entry, `${path}[${at}]`)
      );
      if (x === undefined || row === undefined || colourIndex === undefined) {
        return fail(path, 'should be x, row and colour');
      }
      if (
        rest.length > 0 ||
        x >= columnsPerTurn ||
        row > 0x3_ff ||
        colourIndex > 15
      ) {
        fail(path, 'should be x in the turn, a ten-bit row and a colour index');
      }
      return [x, row, colourIndex];
    }
  );
  for (let index = 1; index < stars.length; index += 1) {
    if (stars[index]![0] < stars[index - 1]![0]) {
      fail('starfield.stars', 'should be sorted by x');
    }
  }
  return {
    colours: {
      ...sourceWindow(
        {
          address: colours['address'],
          end: colours['end'],
          sha256: colours['sha256']
        },
        'starfield.colours'
      ),
      entries
    },
    columnsPerTurn,
    evidence: text(field['evidence'], 'starfield.evidence'),
    list: sourceWindow(field['list'], 'starfield.list'),
    pitchOffsets: {
      flight: positiveInteger(
        offsets['flight'],
        'starfield.pitchOffsets.flight'
      ),
      space: positiveInteger(offsets['space'], 'starfield.pitchOffsets.space')
    },
    pitchScale: positiveInteger(field['pitchScale'], 'starfield.pitchScale'),
    scrollScale: positiveInteger(field['scrollScale'], 'starfield.scrollScale'),
    stars
  };
};

const TARG_SYSTEM_BODY_IDS: readonly TargSystemBodyId[] = [
  'targ',
  'sun',
  'inner-moon',
  'outer-moon'
];

const targSystemBodyId = (value: unknown, path: string): TargSystemBodyId => {
  const id = identifier(value, path);
  return (TARG_SYSTEM_BODY_IDS as readonly string[]).includes(id)
    ? (id as TargSystemBodyId)
    : fail(path, `should be one of ${TARG_SYSTEM_BODY_IDS.join(', ')}`);
};

export const readTargSystem = (value: unknown): TargSystemDocument => {
  const root = object(value, '$', [
    'schemaVersion',
    'systemId',
    'source',
    'coordinateSystem',
    'rotatingBodyId',
    'bodies'
  ]);
  const source = object(root['source'], 'source', ['authority', 'decision']);
  const frame = object(root['coordinateSystem'], 'coordinateSystem', [
    'kind',
    'units',
    'axes',
    'north'
  ]);
  const axes = strings(frame['axes'], 'coordinateSystem.axes');
  if (axes.join() !== 'x,y,z') {
    fail('coordinateSystem.axes', 'should be x, y, z');
  }
  const bodies = array(root['bodies'], 'bodies').map(
    (entry, index): TargSystemBody => {
      const path = `bodies[${index}]`;
      const body = entry as Record<string, unknown> | null;
      const fields = [
        'id',
        'name',
        'baseColour',
        'position',
        'radius',
        ...(body !== null && typeof body === 'object' && 'primaryId' in body
          ? ['primaryId']
          : [])
      ];
      const raw = object(entry, path, fields);
      return {
        baseColour: colour(raw['baseColour'], `${path}.baseColour`),
        id: targSystemBodyId(raw['id'], `${path}.id`),
        name: text(raw['name'], `${path}.name`),
        position: point(raw['position'], `${path}.position`),
        ...(raw['primaryId'] === undefined
          ? {}
          : {
              primaryId: targSystemBodyId(raw['primaryId'], `${path}.primaryId`)
            }),
        radius: positive(raw['radius'], `${path}.radius`)
      };
    }
  );
  unique(
    bodies.map(body => body.id),
    'bodies'
  );
  for (const id of TARG_SYSTEM_BODY_IDS) {
    if (!bodies.some(body => body.id === id)) {
      fail('bodies', `is missing ${id}`);
    }
  }
  const targ = bodies.find(body => body.id === 'targ');
  if (
    targ !== undefined &&
    (targ.position.x !== 0 || targ.position.y !== 0 || targ.position.z !== 0)
  ) {
    fail('bodies', 'should centre the coordinate system on targ');
  }
  for (const body of bodies) {
    if (body.primaryId === body.id) {
      fail(`bodies.${body.id}.primaryId`, 'should name another Body');
    }
    if (body.id !== 'targ') {
      const { x, y, z } = body.position;
      if (Math.hypot(x, y, z) <= body.radius + (targ?.radius ?? 0)) {
        fail(`bodies.${body.id}.position`, 'should lie clear of targ');
      }
    }
  }
  return {
    bodies,
    coordinateSystem: {
      axes: ['x', 'y', 'z'],
      kind: literal(
        frame['kind'],
        'targ-equatorial-centre',
        'coordinateSystem.kind'
      ),
      north: literal(frame['north'], 'z', 'coordinateSystem.north'),
      units: literal(frame['units'], 'flyover-units', 'coordinateSystem.units')
    },
    rotatingBodyId: literal(root['rotatingBodyId'], 'targ', 'rotatingBodyId'),
    schemaVersion: literal(root['schemaVersion'], 1, 'schemaVersion'),
    source: {
      authority: literal(source['authority'], 'authored', 'source.authority'),
      decision: text(source['decision'], 'source.decision')
    },
    systemId: literal(root['systemId'], 'targ', 'systemId')
  };
};

export const readGammaSystem = (value: unknown): GammaSystemDocument => {
  const root = object(value, '$', [
    'schemaVersion',
    'title',
    'source',
    'coverage',
    'coordinateSystem',
    'sky',
    'comet',
    'starfield',
    'bodies'
  ]);
  const source = object(root['source'], 'source', [
    'authority',
    'colourTableSha256',
    'evidence',
    'programSha256',
    'ramSha256',
    'run'
  ]);
  const readHash = (
    field: 'colourTableSha256' | 'programSha256' | 'ramSha256'
  ) => sha256(source[field], `source.${field}`);
  const coverage = object(root['coverage'], 'coverage', ['complete', 'notes']);
  const coordinate = object(root['coordinateSystem'], 'coordinateSystem', [
    'kind',
    'units',
    'axes'
  ]);
  const axes = strings(coordinate['axes'], 'coordinateSystem.axes');
  if (axes.join(',') !== 'x,y,z') {
    fail('coordinateSystem.axes', 'should be x, y, z');
  }
  const sky = readGammaSky(root['sky']);
  const comet = readGammaComet(root['comet']);
  const starfield = readGammaStarfield(root['starfield']);
  const bodies = array(root['bodies'], 'bodies').map(
    (raw, index): GammaBody => {
      const path = `bodies[${index}]`;
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return fail(path, 'should be an object');
      }
      const hasPositionKind = 'positionKind' in raw;
      const body = object(raw, path, [
        'id',
        'sourceIndex',
        'name',
        'baseColour',
        'sourceColour',
        'position',
        'radiusExtent',
        'size',
        'radius',
        'drawList',
        ...(hasPositionKind ? ['positionKind'] : [])
      ]);
      const id = identifier(body['id'], `${path}.id`);
      const positionKind = hasPositionKind
        ? literal(
            body['positionKind'],
            'capture-time-sample',
            `${path}.positionKind`
          )
        : undefined;
      if ((id === 'damocles') !== (positionKind !== undefined)) {
        fail(path, 'must mark only damocles as a capture-time sample');
      }
      const sourceColour = integer(
        body['sourceColour'],
        `${path}.sourceColour`
      );
      if (sourceColour > 0xf_ff || (sourceColour & 0x8_88) !== 0) {
        fail(`${path}.sourceColour`, 'should be a twelve-bit ST 0RGB value');
      }
      const baseColour = colour(body['baseColour'], `${path}.baseColour`);
      if (baseColour !== expandStRgb(sourceColour)) {
        fail(`${path}.baseColour`, 'should be the expansion of sourceColour');
      }
      const radiusExtent = positiveInteger(
        body['radiusExtent'],
        `${path}.radiusExtent`
      );
      const size = positive(body['size'], `${path}.size`);
      if (size !== unpackSize(radiusExtent, `${path}.radiusExtent`)) {
        fail(`${path}.size`, 'should be the decode of radiusExtent');
      }
      const radius = positive(body['radius'], `${path}.radius`);
      if (radius !== size / sky.projectionScale) {
        fail(`${path}.radius`, 'should be size / sky.projectionScale');
      }
      return {
        baseColour,
        drawList: array(body['drawList'], `${path}.drawList`).map(
          (entry, entryIndex) =>
            identifier(entry, `${path}.drawList[${entryIndex}]`)
        ),
        id,
        name: text(body['name'], `${path}.name`),
        position: point(body['position'], `${path}.position`),
        ...(positionKind === undefined ? {} : { positionKind }),
        radius,
        radiusExtent,
        size,
        sourceColour,
        sourceIndex: integer(body['sourceIndex'], `${path}.sourceIndex`)
      };
    }
  );
  if (bodies.length !== 30) {
    fail('bodies', 'should contain 30 physical records');
  }
  unique(
    bodies.map(body => body.id),
    'bodies'
  );
  const indices = bodies.map(body => body.sourceIndex);
  if (new Set(indices).size !== indices.length) {
    fail('bodies', 'has duplicate source indices');
  }
  if (bodies.filter(body => body.positionKind !== undefined).length !== 1) {
    fail('bodies', 'should contain exactly one capture-time sample');
  }
  const ids = new Set(bodies.map(body => body.id));
  for (const [index, body] of bodies.entries()) {
    for (const entry of body.drawList) {
      if (!ids.has(entry)) {
        fail(`bodies[${index}].drawList`, `names unknown Body ${entry}`);
      }
    }
  }
  return {
    bodies,
    comet,
    coordinateSystem: {
      axes: ['x', 'y', 'z'],
      kind: literal(
        coordinate['kind'],
        'resident-cartesian-centre',
        'coordinateSystem.kind'
      ),
      units: literal(
        coordinate['units'],
        'native-engine-units',
        'coordinateSystem.units'
      )
    },
    coverage: {
      complete: boolean(coverage['complete'], 'coverage.complete'),
      notes: strings(coverage['notes'], 'coverage.notes')
    },
    schemaVersion: literal(root['schemaVersion'], 1, 'schemaVersion'),
    sky,
    source: {
      authority: text(source['authority'], 'source.authority'),
      colourTableSha256: readHash('colourTableSha256'),
      evidence: text(source['evidence'], 'source.evidence'),
      programSha256: readHash('programSha256'),
      ramSha256: readHash('ramSha256'),
      run: text(source['run'], 'source.run')
    },
    starfield,
    title: literal(root['title'], 'Damocles', 'title')
  };
};

const rangeList = (value: unknown, path: string): readonly FlyoverRange[] => {
  const values = strings(value, path);
  if (
    values.join(',') !== 'orbital' &&
    values.join(',') !== 'orbital,coastal,surface'
  ) {
    fail(path, 'should be orbital or orbital, coastal, surface');
  }
  return values as FlyoverRange[];
};

const radiusRule = (
  value: unknown,
  path: string,
  systemId: SystemId,
  bodyId: string
): RadiusRule => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'should be an object');
  }
  const kind = text((value as Record<string, unknown>)['kind'], `${path}.kind`);
  if (kind === 'targ-system') {
    // No parameters: the radius is the Body's own in the Targ System.
    object(value, path, ['kind']);
    if (systemId !== 'targ') {
      fail(path, 'uses an invalid radius rule for this Body');
    }
    return { kind };
  }
  if (kind === 'recovered-extent') {
    // No parameters: the radius is the Body's own recovered radius in system.json, so there
    // is nothing here for a presentation to choose.
    object(value, path, ['kind']);
    if (systemId !== 'gamma') {
      fail(path, 'uses an invalid radius rule for this Body');
    }
    return { kind };
  }
  if (kind === 'nearest-neighbour') {
    const rule = object(value, path, ['kind', 'fraction']);
    const fraction = positive(rule['fraction'], `${path}.fraction`);
    if (systemId !== 'gamma' || fraction >= 0.5) {
      fail(path, 'uses an invalid nearest-neighbour fraction');
    }
    return { fraction, kind };
  }
  return fail(`${path}.kind`, 'is unsupported');
};

type Coordinate = readonly [number, number];
const orientation = (a: Coordinate, b: Coordinate, c: Coordinate): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a: Coordinate, b: Coordinate, point: Coordinate): boolean =>
  point[0] >= Math.min(a[0], b[0]) &&
  point[0] <= Math.max(a[0], b[0]) &&
  point[1] >= Math.min(a[1], b[1]) &&
  point[1] <= Math.max(a[1], b[1]);
const intersects = (
  a: Coordinate,
  b: Coordinate,
  c: Coordinate,
  d: Coordinate
): boolean => {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  if (abc * abd < 0 && cda * cdb < 0) {
    return true;
  }
  return (
    (abc === 0 && onSegment(a, b, c)) ||
    (abd === 0 && onSegment(a, b, d)) ||
    (cda === 0 && onSegment(c, d, a)) ||
    (cdb === 0 && onSegment(c, d, b))
  );
};

const polygon = (
  value: unknown,
  path: string,
  centreLongitude: number
): readonly Coordinate[] => {
  const points = array(value, path).map((raw, index): Coordinate => {
    const pair = array(raw, `${path}[${index}]`);
    if (pair.length !== 2) {
      fail(`${path}[${index}]`, 'should contain longitude and latitude');
    }
    let longitude = finite(pair[0], `${path}[${index}][0]`);
    const latitude = finite(pair[1], `${path}[${index}][1]`);
    if (longitude < -180 || longitude > 180) {
      fail(`${path}[${index}][0]`, 'should be within -180 and 180');
    }
    if (latitude < -90 || latitude > 90) {
      fail(`${path}[${index}][1]`, 'should be within -90 and 90');
    }
    while (longitude - centreLongitude > 180) {
      longitude -= 360;
    }
    while (longitude - centreLongitude < -180) {
      longitude += 360;
    }
    return [longitude, latitude];
  });
  if (points.length < 3 || new Set(points.map(String)).size < 3) {
    fail(path, 'should contain at least three distinct vertices');
  }
  if (String(points[0]) === String(points.at(-1))) {
    fail(path, 'should be an unclosed ring');
  }
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(twiceArea) <= Number.EPSILON) {
    fail(path, 'should have nonzero area');
  }
  for (let first = 0; first < points.length; first += 1) {
    const nextFirst = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const nextSecond = (second + 1) % points.length;
      if (
        first === second ||
        nextFirst === second ||
        first === nextSecond ||
        (first === 0 && nextSecond === 0)
      ) {
        continue;
      }
      if (
        intersects(
          points[first]!,
          points[nextFirst]!,
          points[second]!,
          points[nextSecond]!
        )
      ) {
        fail(path, 'should not self-intersect');
      }
    }
  }
  return points;
};

export function readFlyoverPresentation(
  value: unknown,
  expectedSystemId: 'targ',
  authoritativeBodyIds: readonly string[]
): TargPresentationDocument;
export function readFlyoverPresentation(
  value: unknown,
  expectedSystemId: 'gamma',
  authoritativeBodyIds: readonly string[]
): GammaPresentationDocument;
export function readFlyoverPresentation(
  value: unknown,
  expectedSystemId: SystemId,
  authoritativeBodyIds: readonly string[]
): FlyoverPresentationDocument;
export function readFlyoverPresentation(
  value: unknown,
  expectedSystemId: SystemId,
  authoritativeBodyIds: readonly string[]
): FlyoverPresentationDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('$', 'should be an object');
  }
  const candidate = value as Record<string, unknown>;
  const systemId = literal(candidate['systemId'], expectedSystemId, 'systemId');
  const targ = systemId === 'targ';
  const root = object(value, '$', [
    'schemaVersion',
    'systemId',
    'cameraSpeed',
    'camera',
    'bodyMesh',
    'backdrop',
    'lighting',
    'bodies',
    ...(targ ? ['surfaceColours', 'islands'] : [])
  ]);
  literal(root['schemaVersion'], 1, 'schemaVersion');
  const camera = object(root['cameraSpeed'], 'cameraSpeed', [
    'minimumUnitsPerSecond',
    'maximumUnitsPerSecond'
  ]);
  const minimum = positive(
    camera['minimumUnitsPerSecond'],
    'cameraSpeed.minimumUnitsPerSecond'
  );
  const maximum = positive(
    camera['maximumUnitsPerSecond'],
    'cameraSpeed.maximumUnitsPerSecond'
  );
  if (maximum <= minimum) {
    fail('cameraSpeed', 'maximum should exceed minimum');
  }
  const rawCamera = object(root['camera'], 'camera', [
    'overviewAxis',
    'verticalFieldOfViewDegrees',
    'framingCoverage'
  ]);
  const verticalFieldOfViewDegrees = positive(
    rawCamera['verticalFieldOfViewDegrees'],
    'camera.verticalFieldOfViewDegrees'
  );
  if (verticalFieldOfViewDegrees >= 180) {
    fail('camera.verticalFieldOfViewDegrees', 'should be less than 180');
  }
  const framingCoverage = positive(
    rawCamera['framingCoverage'],
    'camera.framingCoverage'
  );
  if (framingCoverage > 1) {
    fail('camera.framingCoverage', 'should not exceed 1');
  }
  const bodyMesh = object(root['bodyMesh'], 'bodyMesh', [
    'longitudeSegments',
    'latitudeSegments'
  ]);
  const longitudeSegments = boundedPositiveInteger(
    bodyMesh['longitudeSegments'],
    'bodyMesh.longitudeSegments',
    256
  );
  const latitudeSegments = boundedPositiveInteger(
    bodyMesh['latitudeSegments'],
    'bodyMesh.latitudeSegments',
    256
  );
  if (longitudeSegments < 3 || latitudeSegments < 2) {
    fail(
      'bodyMesh',
      'should contain at least 3 longitude and 2 latitude segments'
    );
  }
  const rawBackdrop = object(root['backdrop'], 'backdrop', [
    'colour',
    'starColour',
    'starCount',
    'starSeed',
    'pointSizeCssPixels'
  ]);
  // Body colour belongs to each System's authority, the recovered Gamma System or the
  // authored Targ System, so no presentation carries one.
  const bodies = array(root['bodies'], 'bodies').map(
    (raw, index): FlyoverBodyPresentation => {
      const path = `bodies[${index}]`;
      const body = object(raw, path, ['id', 'ranges', 'radius']);
      const id = identifier(body['id'], `${path}.id`);
      return {
        id,
        radius: radiusRule(body['radius'], `${path}.radius`, systemId, id),
        ranges: rangeList(body['ranges'], `${path}.ranges`)
      };
    }
  );
  unique(
    bodies.map(body => body.id),
    'bodies'
  );
  const bodyIds = new Set(bodies.map(body => body.id));
  for (const id of authoritativeBodyIds) {
    if (!bodyIds.has(id)) {
      fail('bodies', `is missing Body ${id}`);
    }
  }
  const authority = new Set(authoritativeBodyIds);
  for (const id of bodyIds) {
    if (!authority.has(id)) {
      fail('bodies', `has unknown Body ${id}`);
    }
  }
  const rawLighting = root['lighting'];
  if (
    typeof rawLighting !== 'object' ||
    rawLighting === null ||
    Array.isArray(rawLighting)
  ) {
    fail('lighting', 'should be an object');
  }
  const lightingKind = text(
    (rawLighting as Record<string, unknown>)['kind'],
    'lighting.kind'
  );
  let lighting: FlyoverLighting;
  if (targ) {
    const source = object(rawLighting, 'lighting', ['kind', 'sourceBodyId']);
    literal(source['kind'], 'body', 'lighting.kind');
    const sourceBodyId = literal(
      source['sourceBodyId'],
      'sun',
      'lighting.sourceBodyId'
    );
    if (!bodyIds.has(sourceBodyId)) {
      fail('lighting.sourceBodyId', 'should reference a Body');
    }
    lighting = { kind: 'body', sourceBodyId };
  } else {
    if (lightingKind !== 'camera-headlight') {
      fail('lighting.kind', 'should be camera-headlight');
    }
    object(rawLighting, 'lighting', ['kind']);
    lighting = { kind: 'camera-headlight' };
  }
  const base = {
    backdrop: {
      colour: colour(rawBackdrop['colour'], 'backdrop.colour'),
      pointSizeCssPixels: boundedPositive(
        rawBackdrop['pointSizeCssPixels'],
        'backdrop.pointSizeCssPixels',
        16
      ),
      starColour: colour(rawBackdrop['starColour'], 'backdrop.starColour'),
      starCount: boundedPositiveInteger(
        rawBackdrop['starCount'],
        'backdrop.starCount',
        10_000
      ),
      starSeed: (() => {
        const seed = integer(rawBackdrop['starSeed'], 'backdrop.starSeed');
        return seed <= 0xff_ff_ff_ff
          ? seed
          : fail(
              'backdrop.starSeed',
              'should fit in an unsigned 32-bit integer'
            );
      })()
    },
    bodies,
    bodyMesh: { latitudeSegments, longitudeSegments },
    camera: {
      framingCoverage,
      overviewAxis: literal(
        rawCamera['overviewAxis'],
        'positive-z',
        'camera.overviewAxis'
      ),
      verticalFieldOfViewDegrees
    },
    cameraSpeed: {
      maximumUnitsPerSecond: maximum,
      minimumUnitsPerSecond: minimum
    },
    schemaVersion: 1 as const
  };
  if (!targ) {
    return {
      ...base,
      lighting: lighting as GammaPresentationDocument['lighting'],
      systemId: 'gamma'
    };
  }
  const surface = object(root['surfaceColours'], 'surfaceColours', [
    'ocean',
    'coastline',
    'ground'
  ]);
  const islands = array(root['islands'], 'islands').map(
    (raw, index): IslandPresentation => {
      const path = `islands[${index}]`;
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return fail(path, 'should be an object');
      }
      const hasPatch = 'surfacePatch' in raw;
      const island = object(raw, path, [
        'id',
        'bodyId',
        'centreDegrees',
        'polygonDegrees',
        ...(hasPatch ? ['surfacePatch'] : [])
      ]);
      const centre = object(island['centreDegrees'], `${path}.centreDegrees`, [
        'longitude',
        'latitude'
      ]);
      const longitude = finite(
        centre['longitude'],
        `${path}.centreDegrees.longitude`
      );
      const latitude = finite(
        centre['latitude'],
        `${path}.centreDegrees.latitude`
      );
      if (longitude < -180 || longitude > 180) {
        fail(
          `${path}.centreDegrees.longitude`,
          'should be within -180 and 180'
        );
      }
      if (latitude < -90 || latitude > 90) {
        fail(`${path}.centreDegrees.latitude`, 'should be within -90 and 90');
      }
      const bodyId = identifier(island['bodyId'], `${path}.bodyId`);
      const body = bodies.find(entry => entry.id === bodyId);
      if (body === undefined || !body.ranges.includes('surface')) {
        fail(`${path}.bodyId`, 'should reference a Surface-capable Body');
      }
      let surfacePatch: SurfacePatch | undefined;
      if (hasPatch) {
        const patch = object(island['surfacePatch'], `${path}.surfacePatch`, [
          'sourceCentre',
          'unitsPerRadian',
          'eastAxis',
          'northAxis'
        ]);
        const sourceCentre = object(
          patch['sourceCentre'],
          `${path}.surfacePatch.sourceCentre`,
          ['x', 'z']
        );
        surfacePatch = {
          eastAxis: literal(
            patch['eastAxis'],
            'x',
            `${path}.surfacePatch.eastAxis`
          ),
          northAxis: literal(
            patch['northAxis'],
            'z',
            `${path}.surfacePatch.northAxis`
          ),
          sourceCentre: {
            x: finite(sourceCentre['x'], `${path}.surfacePatch.sourceCentre.x`),
            z: finite(sourceCentre['z'], `${path}.surfacePatch.sourceCentre.z`)
          },
          unitsPerRadian: positive(
            patch['unitsPerRadian'],
            `${path}.surfacePatch.unitsPerRadian`
          )
        };
      }
      return {
        bodyId,
        centreDegrees: { latitude, longitude },
        id: identifier(island['id'], `${path}.id`),
        polygonDegrees: polygon(
          island['polygonDegrees'],
          `${path}.polygonDegrees`,
          longitude
        ),
        ...(surfacePatch === undefined ? {} : { surfacePatch })
      };
    }
  );
  unique(
    islands.map(island => island.id),
    'islands'
  );
  return {
    ...base,
    bodies: bodies as readonly TargBodyPresentation[],
    islands,
    lighting: lighting as TargPresentationDocument['lighting'],
    surfaceColours: {
      coastline: colour(surface['coastline'], 'surfaceColours.coastline'),
      ground: colour(surface['ground'], 'surfaceColours.ground'),
      ocean: colour(surface['ocean'], 'surfaceColours.ocean')
    },
    systemId: 'targ'
  };
}
