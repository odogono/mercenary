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
  | { readonly kind: 'absolute'; readonly radiusUnits: number }
  | {
      readonly kind: 'angular-diameter';
      readonly orbitalDistanceUnits: number;
    }
  | { readonly fraction: number; readonly kind: 'nearest-neighbour' };

export interface FlyoverBodyPresentation {
  readonly id: string;
  readonly radius: RadiusRule;
  readonly ranges: readonly FlyoverRange[];
}

/// Targ has no recovered authority behind it, so its Bodies still carry an authored colour.
export interface TargBodyPresentation extends FlyoverBodyPresentation {
  readonly colour: string;
}

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
  readonly id: string;
  readonly name: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly positionKind?: 'capture-time-sample';
  readonly radiusExtent: number;
  readonly sourceColour: number;
  readonly sourceIndex: number;
}

export interface GammaSystemDocument {
  readonly bodies: readonly GammaBody[];
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
  readonly source: {
    readonly authority: string;
    readonly colourTableSha256: string;
    readonly evidence: string;
    readonly programSha256: string;
    readonly ramSha256: string;
    readonly run: string;
  };
  readonly title: 'Damocles';
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

export const readGammaSystem = (value: unknown): GammaSystemDocument => {
  const root = object(value, '$', [
    'schemaVersion',
    'title',
    'source',
    'coverage',
    'coordinateSystem',
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
  ) => {
    const hash = text(source[field], `source.${field}`);
    return /^[\da-f]{64}$/.test(hash)
      ? hash
      : fail(`source.${field}`, 'should be a lowercase SHA-256 digest');
  };
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
      return {
        baseColour,
        id,
        name: text(body['name'], `${path}.name`),
        position: point(body['position'], `${path}.position`),
        ...(positionKind === undefined ? {} : { positionKind }),
        radiusExtent: positive(body['radiusExtent'], `${path}.radiusExtent`),
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
  return {
    bodies,
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
    source: {
      authority: text(source['authority'], 'source.authority'),
      colourTableSha256: readHash('colourTableSha256'),
      evidence: text(source['evidence'], 'source.evidence'),
      programSha256: readHash('programSha256'),
      ramSha256: readHash('ramSha256'),
      run: text(source['run'], 'source.run')
    },
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
  if (kind === 'absolute') {
    const rule = object(value, path, ['kind', 'radiusUnits']);
    if (systemId !== 'targ' || bodyId !== 'targ') {
      fail(path, 'uses an invalid radius rule for this Body');
    }
    return {
      kind,
      radiusUnits: positive(rule['radiusUnits'], `${path}.radiusUnits`)
    };
  }
  if (kind === 'angular-diameter') {
    const rule = object(value, path, ['kind', 'orbitalDistanceUnits']);
    if (systemId !== 'targ' || bodyId === 'targ') {
      fail(path, 'uses an invalid radius rule for this Body');
    }
    return {
      kind,
      orbitalDistanceUnits: positive(
        rule['orbitalDistanceUnits'],
        `${path}.orbitalDistanceUnits`
      )
    };
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
  // Gamma Body colour is recovered and lives in the Data Payload, so only Targ's authored
  // Bodies carry one here.
  const bodies = array(root['bodies'], 'bodies').map(
    (raw, index): FlyoverBodyPresentation & { readonly colour?: string } => {
      const path = `bodies[${index}]`;
      const body = object(raw, path, [
        'id',
        ...(targ ? ['colour'] : []),
        'ranges',
        'radius'
      ]);
      const id = identifier(body['id'], `${path}.id`);
      return {
        ...(targ ? { colour: colour(body['colour'], `${path}.colour`) } : {}),
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
