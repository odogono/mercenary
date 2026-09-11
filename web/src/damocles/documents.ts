import type { Vector3 } from '../orientation/index.ts';

/// How a value in a Damocles presentation document came to be (ADR 0043).
///
/// `recovered` is Working-Authority Evidence with Research Provenance; `derived` follows
/// mechanically from recovered values; `authored` is this project's placeholder for a value the
/// original has not yet yielded, and has a research issue behind it.
export type Provenance = 'authored' | 'derived' | 'recovered';

export interface ErisPresentationDocument {
  readonly body: {
    readonly id: string;
    readonly name: string;
    readonly provenance: Provenance;
  };
  readonly camera: {
    readonly farPlane: number;
    readonly nearPlane: number;
    readonly provenance: Provenance;
    readonly verticalFieldOfViewDegrees: number;
  };
  readonly eye: {
    readonly heightUnits: number;
    readonly provenance: Provenance;
  };
  readonly grid: {
    readonly cellsPerAxis: number;
    readonly cellUnits: number;
    readonly note: string;
    readonly origin: { readonly x: number; readonly z: number };
    readonly provenance: Provenance;
  };
  readonly ground: {
    readonly colour: string;
    readonly colourProvenance: Provenance;
    readonly extentCells: number;
    readonly geometryProvenance: Provenance;
    readonly note: string;
    readonly paletteIndex: number;
  };
  readonly lighting: {
    readonly note: string;
    readonly provenance: Provenance;
    readonly shadows: boolean;
    readonly sunDirection: Vector3;
  };
  /// Eris's axes and camera yaw as recovered from the Working Authority (#204). North is +z
  /// and east is +x, so seen from above with +y up the world is left-handed; the frame mirrors
  /// z for the shared right-handed Camera. The yaw word counts a full turn in
  /// `yawUnitsPerTurn` units, reads `yawNorth` facing north and rises turning right.
  readonly orientation: {
    readonly east: '+x';
    readonly modelZ: 'keep' | 'negate';
    readonly modelZProvenance: Provenance;
    readonly north: '+z';
    readonly note: string;
    readonly provenance: Provenance;
    readonly yawNorth: number;
    readonly yawPositive: 'clockwise';
    readonly yawUnitsPerTurn: number;
  };
  readonly palette: {
    readonly note: string;
    readonly outdoor: readonly string[];
    readonly provenance: Provenance;
  };
  readonly rendering: {
    readonly cullBackFaces: boolean;
    readonly provenance: Provenance;
    readonly unresolvedModels: 'nothing';
  };
  readonly schemaVersion: 1;
  readonly sky: {
    readonly colour: string;
    readonly note: string;
    readonly paletteIndex: number;
    readonly provenance: Provenance;
  };
  readonly start: {
    readonly evidence: string;
    readonly position: Vector3;
    readonly positionProvenance: Provenance;
    /// The camera yaw word as captured, in the orientation's units.
    readonly yaw: number;
    readonly yawProvenance: Provenance;
  };
  readonly titleSlug: 'damocles';
  readonly walk: {
    readonly evidence: string;
    readonly speedProvenance: Provenance;
    readonly turnProvenance: Provenance;
    readonly turnRadiansPerSecond: number;
    readonly unitsPerSecond: number;
  };
}

const fail = (path: string, reason: string): never => {
  throw new Error(`Invalid Damocles presentation document: ${path} ${reason}`);
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
const integer = (value: unknown, path: string): number => {
  const number = finite(value, path);
  return Number.isSafeInteger(number) && number >= 0
    ? number
    : fail(path, 'should be a nonnegative integer');
};
const boolean = (value: unknown, path: string): boolean =>
  typeof value === 'boolean' ? value : fail(path, 'should be a boolean');
const literal = <T extends string | number>(
  value: unknown,
  expected: T,
  path: string
): T => (value === expected ? expected : fail(path, `should be ${expected}`));
const oneOf = <T extends string>(
  value: unknown,
  options: readonly T[],
  path: string
): T =>
  options.includes(value as T)
    ? (value as T)
    : fail(path, `should be one of ${options.join(', ')}`);
const provenance = (value: unknown, path: string): Provenance =>
  oneOf(value, ['authored', 'derived', 'recovered'], path);
const colour = (value: unknown, path: string): string => {
  const result = text(value, path);
  return /^#[\da-f]{6}$/.test(result)
    ? result
    : fail(path, 'should be a lowercase six-digit colour');
};
const point = (value: unknown, path: string): Vector3 => {
  const source = object(value, path, ['x', 'y', 'z']);
  return {
    x: finite(source['x'], `${path}.x`),
    y: finite(source['y'], `${path}.y`),
    z: finite(source['z'], `${path}.z`)
  };
};

/// One Atari ST palette word as the research notes write it, `RGB` in three-bit octal digits,
/// to the six-digit colour the rest of the shell speaks. Each channel is scaled over its full
/// range, so `777` is white and `030` is the recovered outdoor green.
export const stColour = (word: string): string => {
  if (!/^[0-7]{3}$/.test(word)) {
    throw new Error(`${word} is not a three-digit ST palette word`);
  }
  return `#${[...word]
    .map(digit =>
      Math.round((Number(digit) * 255) / 7)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
};

const stWord = (value: unknown, path: string): string => {
  const word = text(value, path);
  return /^[0-7]{3}$/.test(word)
    ? word
    : fail(path, 'should be a three-digit ST palette word');
};

/// Read the authored Eris presentation document, refusing anything it does not name.
///
/// Every block says how its values came to be, and a colour that claims a palette entry must
/// agree with that entry: an authored document is allowed to be a placeholder, but not to be
/// inconsistent with the recovered data it sits beside.
export const readErisPresentation = (
  value: unknown
): ErisPresentationDocument => {
  const root = object(value, '$', [
    'schemaVersion',
    'titleSlug',
    'body',
    'grid',
    'start',
    'eye',
    'walk',
    'orientation',
    'camera',
    'palette',
    'ground',
    'sky',
    'lighting',
    'rendering'
  ]);
  const body = object(root['body'], 'body', ['id', 'name', 'provenance']);
  const grid = object(root['grid'], 'grid', [
    'cellUnits',
    'cellsPerAxis',
    'origin',
    'provenance',
    'note'
  ]);
  const origin = object(grid['origin'], 'grid.origin', ['x', 'z']);
  const start = object(root['start'], 'start', [
    'position',
    'positionProvenance',
    'yaw',
    'yawProvenance',
    'evidence'
  ]);
  const eye = object(root['eye'], 'eye', ['heightUnits', 'provenance']);
  const walk = object(root['walk'], 'walk', [
    'unitsPerSecond',
    'speedProvenance',
    'turnRadiansPerSecond',
    'turnProvenance',
    'evidence'
  ]);
  const orientation = object(root['orientation'], 'orientation', [
    'north',
    'east',
    'yawUnitsPerTurn',
    'yawNorth',
    'yawPositive',
    'provenance',
    'modelZ',
    'modelZProvenance',
    'note'
  ]);
  const camera = object(root['camera'], 'camera', [
    'verticalFieldOfViewDegrees',
    'nearPlane',
    'farPlane',
    'provenance'
  ]);
  const palette = object(root['palette'], 'palette', [
    'outdoor',
    'provenance',
    'note'
  ]);
  const ground = object(root['ground'], 'ground', [
    'colour',
    'paletteIndex',
    'colourProvenance',
    'geometryProvenance',
    'extentCells',
    'note'
  ]);
  const sky = object(root['sky'], 'sky', [
    'colour',
    'paletteIndex',
    'provenance',
    'note'
  ]);
  const lighting = object(root['lighting'], 'lighting', [
    'sunDirection',
    'shadows',
    'provenance',
    'note'
  ]);
  const rendering = object(root['rendering'], 'rendering', [
    'cullBackFaces',
    'unresolvedModels',
    'provenance'
  ]);

  const outdoorRaw = palette['outdoor'];
  if (!Array.isArray(outdoorRaw) || outdoorRaw.length !== 16) {
    fail('palette.outdoor', 'should list sixteen ST palette words');
  }
  const outdoor = (outdoorRaw as unknown[]).map((word, index) =>
    stWord(word, `palette.outdoor[${index}]`)
  );
  const paletteColour = (index: unknown, path: string): string => {
    const position = integer(index, path);
    return position < 16
      ? stColour(outdoor[position]!)
      : fail(path, 'should index the sixteen-entry palette');
  };
  const groundColour = colour(ground['colour'], 'ground.colour');
  if (
    groundColour !==
    paletteColour(ground['paletteIndex'], 'ground.paletteIndex')
  ) {
    fail('ground.colour', 'should match its palette entry');
  }
  const skyColour = colour(sky['colour'], 'sky.colour');
  if (skyColour !== paletteColour(sky['paletteIndex'], 'sky.paletteIndex')) {
    fail('sky.colour', 'should match its palette entry');
  }
  const nearPlane = positive(camera['nearPlane'], 'camera.nearPlane');
  const farPlane = positive(camera['farPlane'], 'camera.farPlane');
  if (farPlane <= nearPlane) {
    fail('camera.farPlane', 'should exceed the near plane');
  }
  const fieldOfView = positive(
    camera['verticalFieldOfViewDegrees'],
    'camera.verticalFieldOfViewDegrees'
  );
  if (fieldOfView >= 180) {
    fail('camera.verticalFieldOfViewDegrees', 'should be under 180');
  }

  return {
    body: {
      id: text(body['id'], 'body.id'),
      name: text(body['name'], 'body.name'),
      provenance: provenance(body['provenance'], 'body.provenance')
    },
    camera: {
      farPlane,
      nearPlane,
      provenance: provenance(camera['provenance'], 'camera.provenance'),
      verticalFieldOfViewDegrees: fieldOfView
    },
    eye: {
      heightUnits: positive(eye['heightUnits'], 'eye.heightUnits'),
      provenance: provenance(eye['provenance'], 'eye.provenance')
    },
    grid: {
      cellsPerAxis: positive(grid['cellsPerAxis'], 'grid.cellsPerAxis'),
      cellUnits: positive(grid['cellUnits'], 'grid.cellUnits'),
      note: text(grid['note'], 'grid.note'),
      origin: {
        x: integer(origin['x'], 'grid.origin.x'),
        z: integer(origin['z'], 'grid.origin.z')
      },
      provenance: provenance(grid['provenance'], 'grid.provenance')
    },
    ground: {
      colour: groundColour,
      colourProvenance: provenance(
        ground['colourProvenance'],
        'ground.colourProvenance'
      ),
      extentCells: positive(ground['extentCells'], 'ground.extentCells'),
      geometryProvenance: provenance(
        ground['geometryProvenance'],
        'ground.geometryProvenance'
      ),
      note: text(ground['note'], 'ground.note'),
      paletteIndex: integer(ground['paletteIndex'], 'ground.paletteIndex')
    },
    lighting: {
      note: text(lighting['note'], 'lighting.note'),
      provenance: provenance(lighting['provenance'], 'lighting.provenance'),
      shadows: boolean(lighting['shadows'], 'lighting.shadows'),
      sunDirection: point(lighting['sunDirection'], 'lighting.sunDirection')
    },
    orientation: {
      east: literal(orientation['east'], '+x', 'orientation.east'),
      modelZ: oneOf(
        orientation['modelZ'],
        ['keep', 'negate'],
        'orientation.modelZ'
      ),
      modelZProvenance: provenance(
        orientation['modelZProvenance'],
        'orientation.modelZProvenance'
      ),
      north: literal(orientation['north'], '+z', 'orientation.north'),
      note: text(orientation['note'], 'orientation.note'),
      provenance: provenance(
        orientation['provenance'],
        'orientation.provenance'
      ),
      yawNorth: integer(orientation['yawNorth'], 'orientation.yawNorth'),
      yawPositive: literal(
        orientation['yawPositive'],
        'clockwise',
        'orientation.yawPositive'
      ),
      yawUnitsPerTurn: integer(
        orientation['yawUnitsPerTurn'],
        'orientation.yawUnitsPerTurn'
      )
    },
    palette: {
      note: text(palette['note'], 'palette.note'),
      outdoor,
      provenance: provenance(palette['provenance'], 'palette.provenance')
    },
    rendering: {
      cullBackFaces: boolean(
        rendering['cullBackFaces'],
        'rendering.cullBackFaces'
      ),
      provenance: provenance(rendering['provenance'], 'rendering.provenance'),
      unresolvedModels: literal(
        rendering['unresolvedModels'],
        'nothing',
        'rendering.unresolvedModels'
      )
    },
    schemaVersion: literal(root['schemaVersion'], 1, 'schemaVersion'),
    sky: {
      colour: skyColour,
      note: text(sky['note'], 'sky.note'),
      paletteIndex: integer(sky['paletteIndex'], 'sky.paletteIndex'),
      provenance: provenance(sky['provenance'], 'sky.provenance')
    },
    start: {
      evidence: text(start['evidence'], 'start.evidence'),
      position: point(start['position'], 'start.position'),
      positionProvenance: provenance(
        start['positionProvenance'],
        'start.positionProvenance'
      ),
      yaw: integer(start['yaw'], 'start.yaw'),
      yawProvenance: provenance(start['yawProvenance'], 'start.yawProvenance')
    },
    titleSlug: literal(root['titleSlug'], 'damocles', 'titleSlug'),
    walk: {
      evidence: text(walk['evidence'], 'walk.evidence'),
      speedProvenance: provenance(
        walk['speedProvenance'],
        'walk.speedProvenance'
      ),
      turnProvenance: provenance(walk['turnProvenance'], 'walk.turnProvenance'),
      turnRadiansPerSecond: positive(
        walk['turnRadiansPerSecond'],
        'walk.turnRadiansPerSecond'
      ),
      unitsPerSecond: positive(walk['unitsPerSecond'], 'walk.unitsPerSecond')
    }
  };
};
