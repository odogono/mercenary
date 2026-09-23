import {
  DOOR_STATES,
  PROVENANCES,
  STRUCTURE_VIEWS,
  type DoorState,
  type Provenance,
  type StructureView
} from '../catalogue/data.ts';
import type { Vector3 } from '../orientation/index.ts';

export type { Provenance };

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
    /// How far below y = 0 the base plane and the island fills sit, in raw units, so the
    /// recovered ground faces at y = 0 draw over them without z-fighting (#221).
    readonly fillDropUnits: number;
    readonly geometryProvenance: Provenance;
    readonly note: string;
  };
  readonly lighting: {
    readonly ambientGround: string;
    readonly ambientSky: string;
    readonly note: string;
    readonly provenance: Provenance;
    readonly shadows: boolean;
    readonly sunColour: string;
    readonly sunDirection: Vector3;
  };
  /// Eris's axes and camera yaw as recovered from the Working Authority (#204). North is +z
  /// and east is +x, so seen from above with +y up the world is left-handed; the frame mirrors
  /// z for the shared right-handed Camera. The yaw word counts a full turn in
  /// `yawUnitsPerTurn` units, reads `yawNorth` facing north and rises turning right.
  /// Instance heading bytes use the same units at 1/4 resolution with zero at north.
  readonly orientation: {
    readonly east: '+x';
    readonly modelZ: 'keep' | 'negate';
    readonly modelZProvenance: Provenance;
    readonly north: '+z';
    readonly note: string;
    /// The pitch word `$7AC0` looking at the horizon. It counts `yawUnitsPerTurn` a turn as
    /// the yaw word does, and rises putting the nose down.
    readonly pitchLevel: number;
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
  readonly schemaVersion: 7;
  readonly sky: {
    readonly colour: string;
    readonly note: string;
    readonly paletteIndex: number;
    readonly provenance: Provenance;
  };
  readonly start: {
    readonly evidence: string;
    /// The camera pitch word as captured. Play never moves it — nothing on foot pitches the
    /// view — so it is the level word for the arrival, and the island validation views of #394
    /// are what change it.
    readonly pitch: number;
    readonly position: Vector3;
    readonly positionProvenance: Provenance;
    /// The camera yaw word as captured, in the orientation's units.
    readonly yaw: number;
    readonly yawProvenance: Provenance;
  };
  /// Authored variant used only when a recovered selector is unavailable or unmatched.
  readonly structureFallback: {
    readonly doorState: DoorState;
    readonly evidence: string;
    readonly provenance: Provenance;
    readonly view: StructureView;
  };
  readonly time: {
    readonly impactDeadlineProvenance: Provenance;
    /// The seconds a fresh game's impact clock starts from: the word the title screen
    /// installs at `$793C` before play begins, recovered as `-15560` (#368).
    readonly impactDeadlineSeconds: number;
    readonly impactProvenance: Provenance;
    /// VBLs the impact clock spends on one displayed second, recovered as 20 (#208).
    readonly impactVblsPerSecond: number;
    readonly messageFrames: number;
    readonly provenance: 'recovered';
    readonly vblHertz: number;
    readonly vblProvenance: 'derived';
    readonly waitFrames: number;
  };
  readonly titleSlug: 'damocles';
  readonly walk: {
    readonly evidence: string;
    readonly runMultiplier: number;
    readonly runProvenance: Provenance;
    readonly runTurnMultiplier: number;
    readonly runTurnProvenance: Provenance;
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
  oneOf(value, PROVENANCES, path);
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
    'rendering',
    'structureFallback',
    'time'
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
  const time = object(root['time'], 'time', [
    'impactDeadlineSeconds',
    'impactDeadlineProvenance',
    'impactProvenance',
    'impactVblsPerSecond',
    'messageFrames',
    'provenance',
    'vblHertz',
    'vblProvenance',
    'waitFrames'
  ]);
  const start = object(root['start'], 'start', [
    'position',
    'positionProvenance',
    'yaw',
    'yawProvenance',
    'pitch',
    'evidence'
  ]);
  const eye = object(root['eye'], 'eye', ['heightUnits', 'provenance']);
  const walk = object(root['walk'], 'walk', [
    'unitsPerSecond',
    'speedProvenance',
    'turnRadiansPerSecond',
    'turnProvenance',
    'runMultiplier',
    'runProvenance',
    'runTurnMultiplier',
    'runTurnProvenance',
    'evidence'
  ]);
  const orientation = object(root['orientation'], 'orientation', [
    'north',
    'east',
    'yawUnitsPerTurn',
    'yawNorth',
    'pitchLevel',
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
    'geometryProvenance',
    'fillDropUnits',
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
    'sunColour',
    'ambientSky',
    'ambientGround',
    'shadows',
    'provenance',
    'note'
  ]);
  const rendering = object(root['rendering'], 'rendering', [
    'cullBackFaces',
    'unresolvedModels',
    'provenance'
  ]);
  const structureFallback = object(
    root['structureFallback'],
    'structureFallback',
    ['view', 'doorState', 'provenance', 'evidence']
  );

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
  const sunDirection = point(lighting['sunDirection'], 'lighting.sunDirection');
  if (Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z) === 0) {
    fail('lighting.sunDirection', 'should be nonzero');
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
      fillDropUnits: positive(ground['fillDropUnits'], 'ground.fillDropUnits'),
      geometryProvenance: provenance(
        ground['geometryProvenance'],
        'ground.geometryProvenance'
      ),
      note: text(ground['note'], 'ground.note')
    },
    lighting: {
      ambientGround: colour(
        lighting['ambientGround'],
        'lighting.ambientGround'
      ),
      ambientSky: colour(lighting['ambientSky'], 'lighting.ambientSky'),
      note: text(lighting['note'], 'lighting.note'),
      provenance: provenance(lighting['provenance'], 'lighting.provenance'),
      shadows: boolean(lighting['shadows'], 'lighting.shadows'),
      sunColour: colour(lighting['sunColour'], 'lighting.sunColour'),
      sunDirection
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
      pitchLevel: integer(orientation['pitchLevel'], 'orientation.pitchLevel'),
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
    schemaVersion: literal(root['schemaVersion'], 7, 'schemaVersion'),
    sky: {
      colour: skyColour,
      note: text(sky['note'], 'sky.note'),
      paletteIndex: integer(sky['paletteIndex'], 'sky.paletteIndex'),
      provenance: provenance(sky['provenance'], 'sky.provenance')
    },
    start: {
      evidence: text(start['evidence'], 'start.evidence'),
      pitch: integer(start['pitch'], 'start.pitch'),
      position: point(start['position'], 'start.position'),
      positionProvenance: provenance(
        start['positionProvenance'],
        'start.positionProvenance'
      ),
      yaw: integer(start['yaw'], 'start.yaw'),
      yawProvenance: provenance(start['yawProvenance'], 'start.yawProvenance')
    },
    structureFallback: {
      doorState: oneOf(
        structureFallback['doorState'],
        DOOR_STATES,
        'structureFallback.doorState'
      ),
      evidence: text(
        structureFallback['evidence'],
        'structureFallback.evidence'
      ),
      provenance: provenance(
        structureFallback['provenance'],
        'structureFallback.provenance'
      ),
      view: oneOf(
        structureFallback['view'],
        STRUCTURE_VIEWS,
        'structureFallback.view'
      )
    },
    time: {
      impactDeadlineProvenance: provenance(
        time['impactDeadlineProvenance'],
        'time.impactDeadlineProvenance'
      ),
      impactDeadlineSeconds: literal(
        time['impactDeadlineSeconds'],
        15_560,
        'time.impactDeadlineSeconds'
      ),
      impactProvenance: provenance(
        time['impactProvenance'],
        'time.impactProvenance'
      ),
      impactVblsPerSecond: literal(
        time['impactVblsPerSecond'],
        20,
        'time.impactVblsPerSecond'
      ),
      messageFrames: literal(time['messageFrames'], 200, 'time.messageFrames'),
      provenance: literal(time['provenance'], 'recovered', 'time.provenance'),
      vblHertz: literal(time['vblHertz'], 50, 'time.vblHertz'),
      vblProvenance: literal(
        time['vblProvenance'],
        'derived',
        'time.vblProvenance'
      ),
      waitFrames: literal(time['waitFrames'], 200, 'time.waitFrames')
    },
    titleSlug: literal(root['titleSlug'], 'damocles', 'titleSlug'),
    walk: {
      evidence: text(walk['evidence'], 'walk.evidence'),
      runMultiplier: positive(walk['runMultiplier'], 'walk.runMultiplier'),
      runProvenance: provenance(walk['runProvenance'], 'walk.runProvenance'),
      runTurnMultiplier: positive(
        walk['runTurnMultiplier'],
        'walk.runTurnMultiplier'
      ),
      runTurnProvenance: provenance(
        walk['runTurnProvenance'],
        'walk.runTurnProvenance'
      ),
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
