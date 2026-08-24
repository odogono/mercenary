import type { BensonHostFields } from '../benson/host.ts';
import type { BensonStateFields } from '../benson/machine.ts';
import type { BensonKey } from '../benson/program.ts';
import type { GameState } from '../gameCore/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { Alternate } from '../payload/documents.ts';
import type {
  FlightSettings,
  MessageSettings,
  ScriptSettings
} from '../settings/index.ts';
import type { Location, Residence } from '../world/index.ts';

export const SAVE_SCHEMA_VERSION = 7 as const;
export const SAVE_JSON_CODE_UNIT_LIMIT = 1_000_000;

const SAVE_COLLECTION_LIMIT = 1024;
const SAVE_STRING_CODE_UNIT_LIMIT = 65_536;

export interface SavePayloadIdentity {
  readonly bensonSchemaVersion: number;
  readonly decoderVersion: number;
  readonly endgameSchemaVersion: number;
  readonly flightSchemaVersion: number;
  readonly interactionSchemaVersion: number;
  readonly schemaVersion: number;
  readonly sourceCoreDigest: string;
  readonly sourceDatasetId: string;
  readonly textSchemaVersion: number;
  readonly undergroundSchemaVersion: number | null;
}

export interface SaveEnvironment {
  readonly payload: SavePayloadIdentity;
  readonly settings: {
    readonly flight: Omit<FlightSettings, 'groundAltitude'> & {
      readonly groundAltitude: number | null;
    };
    readonly message: MessageSettings;
    readonly scripts: ScriptSettings;
  };
}

export interface MessageTickerSaveSnapshot {
  readonly charactersPerSecond: number;
  readonly held: number;
  readonly holdSeconds: number;
  readonly revealed: number;
  readonly text: string;
}

export interface BensonHostSaveSnapshot extends Omit<
  BensonHostFields,
  'destroyedBlocks' | 'inventory' | 'objectFlags' | 'objectRooms' | 'pendingKey'
> {
  readonly pendingKey: BensonKey | null;
}

export interface BensonStateSaveSnapshot extends Omit<
  BensonStateFields,
  'pc' | 'randomState' | 'resumeAfterTick'
> {
  readonly pc: number | null;
  readonly randomState: string;
  readonly resumeAfterTick: number | null;
}

export interface BensonSaveSnapshot {
  readonly frames: number;
  readonly host: BensonHostSaveSnapshot;
  readonly state: BensonStateSaveSnapshot;
  readonly ticker: MessageTickerSaveSnapshot | null;
}

export interface GameSaveSnapshot extends Omit<
  GameState,
  'craft' | 'mover' | 'room' | 'touchdown'
> {
  readonly craft: number | null;
  readonly mover: number | null;
  readonly room: number | null;
  readonly touchdown: GameState['touchdown'] | null;
}

/// The Site Ledger and the counters beside it. The counters are stored rather
/// than derived because restoration puts a Site back without taking back the
/// count it caused, so the table cannot imply them.
export interface CombatSaveSnapshot {
  /// Frames the attacker has left of its current approach.
  readonly approachFrames: number;
  /// How the attacker is travelling on that approach.
  readonly attackerVelocity: Vector3 | null;
  /// The part of a combat frame that had not elapsed yet.
  readonly frames: number;
  /// The Hostile Projectile on its way, if there is one.
  readonly hostileShot: {
    readonly framesLeft: number;
    readonly velocity: Vector3;
  } | null;
  /// The structure impact still playing, if one is.
  readonly impact: {
    readonly cell: number;
    readonly framesLeft: number;
  } | null;
  readonly mechanoidDestroyed: number;
  readonly palyarDestroyed: number;
  /// The Player Projectile in flight, if there is one. Where it is lives in its
  /// Object Residence, so only what residence cannot hold is here.
  readonly playerShot: {
    readonly framesLeft: number;
    readonly velocity: Vector3;
  } | null;
  readonly siteTable: readonly number[];
}

export interface SaveSnapshot {
  readonly benson: BensonSaveSnapshot | null;
  readonly carriedStack: readonly number[];
  /// Absent when the content carries no Sites to destroy.
  readonly combat: CombatSaveSnapshot | null;
  /// The part of a ship-delivery frame that had not elapsed yet.
  readonly deliveryFrames: number;
  readonly game: GameSaveSnapshot;
  readonly objectFlags: readonly (readonly [number, number])[];
  readonly randomState: string;
  readonly residence: readonly (readonly [number, Residence])[];
  readonly rewired: readonly (readonly [number, Alternate])[];
}

export interface SaveEnvelope {
  readonly environment: SaveEnvironment;
  readonly location: Location;
  readonly savedAt: string;
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION;
  readonly snapshot: SaveSnapshot;
}

export class SaveCodecError extends Error {
  constructor(message: string) {
    super(`Could not read Save: ${message}`);
    this.name = 'SaveCodecError';
  }
}

const fail = (message: string): never => {
  throw new SaveCodecError(message);
};

const record = (value: unknown, at: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${at} must be an object`);
  }
  return value as Record<string, unknown>;
};

const exact = (
  value: unknown,
  at: string,
  fields: readonly string[]
): Record<string, unknown> => {
  const out = record(value, at);
  for (const key of Object.keys(out)) {
    if (!fields.includes(key)) {
      fail(`${at} has unexpected field ${key}`);
    }
  }
  for (const key of fields) {
    if (!(key in out)) {
      fail(`${at} is missing field ${key}`);
    }
  }
  return out;
};

const finite = (value: unknown, at: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(`${at} must be a finite number`);
  }
  return value;
};

const integer = (value: unknown, at: string): number => {
  const out = finite(value, at);
  if (!Number.isSafeInteger(out)) {
    return fail(`${at} must be a safe integer`);
  }
  return out;
};

const integerInRange = (
  value: unknown,
  at: string,
  minimum: number,
  maximum: number
): number => {
  const out = integer(value, at);
  if (out < minimum || out > maximum) {
    return fail(`${at} must be between ${minimum} and ${maximum}`);
  }
  return out;
};

const byte = (value: unknown, at: string): number =>
  integerInRange(value, at, 0, 0xff);

const nonNegativeInteger = (value: unknown, at: string): number =>
  integerInRange(value, at, 0, Number.MAX_SAFE_INTEGER);

const nonNegative = (value: unknown, at: string): number => {
  const out = finite(value, at);
  if (out < 0) {
    return fail(`${at} must not be negative`);
  }
  return out;
};

const bool = (value: unknown, at: string): boolean => {
  if (typeof value !== 'boolean') {
    return fail(`${at} must be a boolean`);
  }
  return value;
};

const string = (value: unknown, at: string): string => {
  if (typeof value !== 'string') {
    return fail(`${at} must be a string`);
  }
  if (value.length > SAVE_STRING_CODE_UNIT_LIMIT) {
    return fail(`${at} exceeds the Save string limit`);
  }
  return value;
};

const nullableInteger = (value: unknown, at: string): number | null =>
  value === null ? null : integer(value, at);

const nullableByte = (value: unknown, at: string): number | null =>
  value === null ? null : byte(value, at);

const nullableNonNegativeInteger = (
  value: unknown,
  at: string
): number | null => (value === null ? null : nonNegativeInteger(value, at));

const array = <T>(
  value: unknown,
  at: string,
  item: (value: unknown, at: string) => T
): T[] => {
  if (!Array.isArray(value)) {
    return fail(`${at} must be an array`);
  }
  if (value.length > SAVE_COLLECTION_LIMIT) {
    return fail(`${at} exceeds the Save collection limit`);
  }
  return value.map((entry, index) => item(entry, `${at}[${index}]`));
};

const sortedUnique = <T extends readonly [number, unknown]>(
  entries: readonly T[],
  at: string,
  noun: string
): void => {
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1]![0] >= entries[index]![0]) {
      fail(`${at} ${noun} must be unique and sorted`);
    }
  }
};

const integerArray = (value: unknown, at: string): number[] =>
  array(value, at, integer);

const byteArray = (value: unknown, at: string): number[] =>
  array(value, at, byte);

const numberPair = (value: unknown, at: string): readonly [number, number] => {
  const pair = byteArray(value, at);
  if (pair.length !== 2) {
    return fail(`${at} must contain two integers`);
  }
  return [pair[0]!, pair[1]!];
};

const mapEntries = (
  value: unknown,
  at: string
): readonly (readonly [number, number])[] => {
  const entries = array(value, at, numberPair);
  sortedUnique(entries, at, 'keys');
  return entries;
};

const vector = (
  value: unknown,
  at: string
): { readonly x: number; readonly y: number; readonly z: number } => {
  const out = exact(value, at, ['x', 'y', 'z']);
  return {
    x: finite(out['x'], `${at}.x`),
    y: finite(out['y'], `${at}.y`),
    z: finite(out['z'], `${at}.z`)
  };
};

const location = (value: unknown, at: string): Location => {
  const source = record(value, at);
  if (source['kind'] === 'surface') {
    exact(value, at, ['kind']);
    return { kind: 'surface' };
  }
  if (source['kind'] === 'room') {
    const out = exact(value, at, ['id', 'kind']);
    return { id: byte(out['id'], `${at}.id`), kind: 'room' };
  }
  return fail(`${at}.kind must be surface or room`);
};

const residence = (value: unknown, at: string): Residence => {
  const source = record(value, at);
  switch (source['kind']) {
    case 'carried':
    case 'gone':
      exact(value, at, ['kind']);
      return { kind: source['kind'] };
    case 'room': {
      const fields =
        source['at'] === undefined ? ['id', 'kind'] : ['at', 'id', 'kind'];
      const out = exact(value, at, fields);
      return out['at'] === undefined
        ? { id: byte(out['id'], `${at}.id`), kind: 'room' }
        : {
            at: vector(out['at'], `${at}.at`),
            id: byte(out['id'], `${at}.id`),
            kind: 'room'
          };
    }
    case 'surface': {
      const fields = source['at'] === undefined ? ['kind'] : ['at', 'kind'];
      const out = exact(value, at, fields);
      return out['at'] === undefined
        ? { kind: 'surface' }
        : { at: vector(out['at'], `${at}.at`), kind: 'surface' };
    }
    default:
      return fail(`${at}.kind is not a Residence`);
  }
};

const residenceEntries = (
  value: unknown,
  at: string
): readonly (readonly [number, Residence])[] => {
  const entries = array(value, at, (entry, entryAt) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return fail(`${entryAt} must contain a slot and Residence`);
    }
    return [
      byte(entry[0], `${entryAt}[0]`),
      residence(entry[1], `${entryAt}[1]`)
    ] as const;
  });
  sortedUnique(entries, at, 'slots');
  return entries;
};

const point = (
  value: unknown,
  at: string
): { readonly x: number; readonly z: number } => {
  const out = exact(value, at, ['x', 'z']);
  return { x: finite(out['x'], `${at}.x`), z: finite(out['z'], `${at}.z`) };
};

const alternate = (value: unknown, at: string): Alternate => {
  const source = record(value, at);
  const fields = [
    ...(source['arrival'] === undefined ? [] : ['arrival']),
    'arrivalCommandIndex',
    'arrivalWithinDestination',
    'destination',
    'room'
  ];
  const out = exact(value, at, fields);
  const destinationSource = record(out['destination'], `${at}.destination`);
  const destination =
    destinationSource['colonyCraft'] === true
      ? (exact(out['destination'], `${at}.destination`, ['colonyCraft']),
        { colonyCraft: true as const })
      : {
          room: byte(
            exact(out['destination'], `${at}.destination`, ['room'])['room'],
            `${at}.destination.room`
          )
        };
  return {
    ...(out['arrival'] === undefined
      ? {}
      : { arrival: point(out['arrival'], `${at}.arrival`) }),
    arrivalCommandIndex: byte(
      out['arrivalCommandIndex'],
      `${at}.arrivalCommandIndex`
    ),
    arrivalWithinDestination: bool(
      out['arrivalWithinDestination'],
      `${at}.arrivalWithinDestination`
    ),
    destination,
    room: byte(out['room'], `${at}.room`)
  };
};

const rewiredEntries = (
  value: unknown,
  at: string
): readonly (readonly [number, Alternate])[] => {
  const entries = array(value, at, (entry, entryAt) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return fail(`${entryAt} must contain a room and Alternate`);
    }
    return [
      byte(entry[0], `${entryAt}[0]`),
      alternate(entry[1], `${entryAt}[1]`)
    ] as const;
  });
  sortedUnique(entries, at, 'rooms');
  return entries;
};

const randomState = (value: unknown, at: string): string => {
  const out = string(value, at);
  if (!/^[\da-f]{16}$/.test(out)) {
    return fail(`${at} must be 16 lowercase hexadecimal digits`);
  }
  return out;
};

export const encodeRandomState = (value: bigint): string =>
  BigInt.asUintN(64, value).toString(16).padStart(16, '0');

export const decodeRandomState = (value: string): bigint =>
  BigInt(`0x${value}`);

const game = (value: unknown, at: string): GameSaveSnapshot => {
  const out = exact(value, at, [
    'craft',
    'elapsed',
    'mode',
    'mover',
    'player',
    'poweramp',
    'room',
    'stepInterlock',
    'throttle',
    'touchdown',
    'transitionCooldown',
    'wallContact',
    'wallContactLatch',
    'worldFlipped'
  ]);
  const player = exact(out['player'], `${at}.player`, [
    'heading',
    'pitch',
    'position',
    'roll',
    'speed',
    'yawVelocity'
  ]);
  const mode = out['mode'];
  if (mode !== 'flying' && mode !== 'grounded') {
    fail(`${at}.mode must be flying or grounded`);
  }
  const touchdown = out['touchdown'];
  if (touchdown !== null && touchdown !== 'crashed' && touchdown !== 'landed') {
    fail(`${at}.touchdown is invalid`);
  }
  return {
    craft: nullableByte(out['craft'], `${at}.craft`),
    elapsed: nonNegative(out['elapsed'], `${at}.elapsed`),
    mode: mode as GameState['mode'],
    mover: nullableByte(out['mover'], `${at}.mover`),
    player: {
      heading: finite(player['heading'], `${at}.player.heading`),
      pitch: finite(player['pitch'], `${at}.player.pitch`),
      position: vector(player['position'], `${at}.player.position`),
      roll: finite(player['roll'], `${at}.player.roll`),
      speed: finite(player['speed'], `${at}.player.speed`),
      yawVelocity: finite(player['yawVelocity'], `${at}.player.yawVelocity`)
    },
    poweramp: bool(out['poweramp'], `${at}.poweramp`),
    room: nullableByte(out['room'], `${at}.room`),
    stepInterlock: nonNegative(out['stepInterlock'], `${at}.stepInterlock`),
    throttle: finite(out['throttle'], `${at}.throttle`),
    touchdown: touchdown as GameState['touchdown'] | null,
    transitionCooldown: nonNegative(
      out['transitionCooldown'],
      `${at}.transitionCooldown`
    ),
    wallContact: integer(out['wallContact'], `${at}.wallContact`),
    wallContactLatch: integer(
      out['wallContactLatch'],
      `${at}.wallContactLatch`
    ),
    worldFlipped: bool(out['worldFlipped'], `${at}.worldFlipped`)
  };
};

const ticker = (value: unknown, at: string): MessageTickerSaveSnapshot => {
  const out = exact(value, at, [
    'charactersPerSecond',
    'held',
    'holdSeconds',
    'revealed',
    'text'
  ]);
  const text = string(out['text'], `${at}.text`);
  const revealed = nonNegative(out['revealed'], `${at}.revealed`);
  if (revealed > [...text].length) {
    fail(`${at}.revealed exceeds the message length`);
  }
  return {
    charactersPerSecond: nonNegative(
      out['charactersPerSecond'],
      `${at}.charactersPerSecond`
    ),
    held: nonNegative(out['held'], `${at}.held`),
    holdSeconds: nonNegative(out['holdSeconds'], `${at}.holdSeconds`),
    revealed,
    text
  };
};

const bensonState = (value: unknown, at: string): BensonStateSaveSnapshot => {
  const out = exact(value, at, [
    'callStack',
    'pc',
    'randomState',
    'registers',
    'resumeAfterTick'
  ]);
  const registers = integerArray(out['registers'], `${at}.registers`);
  if (registers.length !== 16) {
    fail(`${at}.registers must contain 16 integers`);
  }
  return {
    callStack: array(out['callStack'], `${at}.callStack`, nonNegativeInteger),
    pc: nullableNonNegativeInteger(out['pc'], `${at}.pc`),
    randomState: randomState(out['randomState'], `${at}.randomState`),
    registers: registers.map((value, index) =>
      byte(value, `${at}.registers[${index}]`)
    ),
    resumeAfterTick: nullableNonNegativeInteger(
      out['resumeAfterTick'],
      `${at}.resumeAfterTick`
    )
  };
};

const bensonHost = (value: unknown, at: string): BensonHostSaveSnapshot => {
  const fields = [
    'attackingShip',
    'boardedCraft',
    'canLiftAnything',
    'canTakeAnything',
    'currentRoom',
    'decimals',
    'engineFlags',
    'gameComplete',
    'messageInterval',
    'messagePlaying',
    'pendingKey',
    'shipInbound',
    'signedRegister',
    'tickCounter'
  ];
  const out = exact(value, at, fields);
  const pendingKey = out['pendingKey'];
  if (pendingKey !== null && pendingKey !== 'keyY') {
    fail(`${at}.pendingKey is invalid`);
  }
  const decimals = integerArray(out['decimals'], `${at}.decimals`);
  if (decimals.length !== 16) {
    fail(`${at}.decimals must contain 16 integers`);
  }
  return {
    attackingShip: bool(out['attackingShip'], `${at}.attackingShip`),
    boardedCraft: byte(out['boardedCraft'], `${at}.boardedCraft`),
    canLiftAnything: bool(out['canLiftAnything'], `${at}.canLiftAnything`),
    canTakeAnything: bool(out['canTakeAnything'], `${at}.canTakeAnything`),
    currentRoom: byte(out['currentRoom'], `${at}.currentRoom`),
    decimals: decimals.map((value, index) =>
      integerInRange(value, `${at}.decimals[${index}]`, 0, 99_999_999)
    ),
    engineFlags: byte(out['engineFlags'], `${at}.engineFlags`),
    gameComplete: byte(out['gameComplete'], `${at}.gameComplete`),
    messageInterval: byte(out['messageInterval'], `${at}.messageInterval`),
    messagePlaying: bool(out['messagePlaying'], `${at}.messagePlaying`),
    pendingKey: pendingKey as BensonKey | null,
    shipInbound: byte(out['shipInbound'], `${at}.shipInbound`),
    signedRegister: integer(out['signedRegister'], `${at}.signedRegister`),
    tickCounter: nonNegativeInteger(out['tickCounter'], `${at}.tickCounter`)
  };
};

const benson = (value: unknown, at: string): BensonSaveSnapshot => {
  const out = exact(value, at, ['frames', 'host', 'state', 'ticker']);
  return {
    frames: nonNegative(out['frames'], `${at}.frames`),
    host: bensonHost(out['host'], `${at}.host`),
    state: bensonState(out['state'], `${at}.state`),
    ticker:
      out['ticker'] === null ? null : ticker(out['ticker'], `${at}.ticker`)
  };
};

/// One Site Ledger byte per surface cell.
const SITE_TABLE_LENGTH = 256;

const combat = (value: unknown, at: string): CombatSaveSnapshot => {
  const out = exact(value, at, [
    'approachFrames',
    'attackerVelocity',
    'frames',
    'hostileShot',
    'impact',
    'mechanoidDestroyed',
    'palyarDestroyed',
    'playerShot',
    'siteTable'
  ]);
  const frames = finite(out['frames'], `${at}.frames`);
  if (!(frames >= 0) || frames >= 1) {
    fail(`${at}.frames must be at least 0 and less than 1`);
  }
  const inboundValue = out['hostileShot'];
  const hostileShot =
    inboundValue === null
      ? null
      : (() => {
          const inbound = exact(inboundValue, `${at}.hostileShot`, [
            'framesLeft',
            'velocity'
          ]);
          return {
            framesLeft: nonNegativeInteger(
              inbound['framesLeft'],
              `${at}.hostileShot.framesLeft`
            ),
            velocity: vector(inbound['velocity'], `${at}.hostileShot.velocity`)
          };
        })();
  const attackerValue = out['attackerVelocity'];
  const attackerVelocity =
    attackerValue === null
      ? null
      : vector(attackerValue, `${at}.attackerVelocity`);
  const shotValue = out['playerShot'];
  const playerShot =
    shotValue === null
      ? null
      : (() => {
          const shot = exact(shotValue, `${at}.playerShot`, [
            'framesLeft',
            'velocity'
          ]);
          return {
            framesLeft: nonNegativeInteger(
              shot['framesLeft'],
              `${at}.playerShot.framesLeft`
            ),
            velocity: vector(shot['velocity'], `${at}.playerShot.velocity`)
          };
        })();
  const impactValue = out['impact'];
  const impact =
    impactValue === null
      ? null
      : (() => {
          const hit = exact(impactValue, `${at}.impact`, [
            'cell',
            'framesLeft'
          ]);
          return {
            cell: byte(hit['cell'], `${at}.impact.cell`),
            framesLeft: nonNegativeInteger(
              hit['framesLeft'],
              `${at}.impact.framesLeft`
            )
          };
        })();
  const siteTable = byteArray(out['siteTable'], `${at}.siteTable`);
  if (siteTable.length !== SITE_TABLE_LENGTH) {
    fail(`${at}.siteTable must contain ${SITE_TABLE_LENGTH} bytes`);
  }
  return {
    approachFrames: nonNegativeInteger(
      out['approachFrames'],
      `${at}.approachFrames`
    ),
    attackerVelocity,
    frames,
    hostileShot,
    impact,
    mechanoidDestroyed: byte(
      out['mechanoidDestroyed'],
      `${at}.mechanoidDestroyed`
    ),
    palyarDestroyed: byte(out['palyarDestroyed'], `${at}.palyarDestroyed`),
    playerShot,
    siteTable
  };
};

const snapshot = (value: unknown, at: string): SaveSnapshot => {
  const out = exact(value, at, [
    'benson',
    'carriedStack',
    'combat',
    'deliveryFrames',
    'game',
    'objectFlags',
    'randomState',
    'residence',
    'rewired'
  ]);
  const carriedStack = byteArray(out['carriedStack'], `${at}.carriedStack`);
  if (new Set(carriedStack).size !== carriedStack.length) {
    fail(`${at}.carriedStack members must be unique`);
  }
  const deliveryFrames = finite(out['deliveryFrames'], `${at}.deliveryFrames`);
  if (!(deliveryFrames >= 0) || deliveryFrames >= 1) {
    fail(`${at}.deliveryFrames must be at least 0 and less than 1`);
  }
  return {
    benson:
      out['benson'] === null ? null : benson(out['benson'], `${at}.benson`),
    carriedStack,
    combat:
      out['combat'] === null ? null : combat(out['combat'], `${at}.combat`),
    deliveryFrames,
    game: game(out['game'], `${at}.game`),
    objectFlags: mapEntries(out['objectFlags'], `${at}.objectFlags`),
    randomState: randomState(out['randomState'], `${at}.randomState`),
    residence: residenceEntries(out['residence'], `${at}.residence`),
    rewired: rewiredEntries(out['rewired'], `${at}.rewired`)
  };
};

const flightSettings = (
  value: unknown,
  at: string
): SaveEnvironment['settings']['flight'] => {
  const out = exact(value, at, [
    'groundAltitude',
    'pitchScale',
    'referenceFrameRate',
    'runMultiplier',
    'speedScale',
    'throttleFloorNotch',
    'turnScale'
  ]);
  return {
    groundAltitude:
      out['groundAltitude'] === null
        ? null
        : finite(out['groundAltitude'], `${at}.groundAltitude`),
    pitchScale: finite(out['pitchScale'], `${at}.pitchScale`),
    referenceFrameRate: finite(
      out['referenceFrameRate'],
      `${at}.referenceFrameRate`
    ),
    runMultiplier: finite(out['runMultiplier'], `${at}.runMultiplier`),
    speedScale: finite(out['speedScale'], `${at}.speedScale`),
    throttleFloorNotch: integer(
      out['throttleFloorNotch'],
      `${at}.throttleFloorNotch`
    ),
    turnScale: finite(out['turnScale'], `${at}.turnScale`)
  };
};

const environment = (value: unknown, at: string): SaveEnvironment => {
  const out = exact(value, at, ['payload', 'settings']);
  const payload = exact(out['payload'], `${at}.payload`, [
    'bensonSchemaVersion',
    'decoderVersion',
    'endgameSchemaVersion',
    'flightSchemaVersion',
    'interactionSchemaVersion',
    'schemaVersion',
    'sourceCoreDigest',
    'sourceDatasetId',
    'textSchemaVersion',
    'undergroundSchemaVersion'
  ]);
  const settings = exact(out['settings'], `${at}.settings`, [
    'flight',
    'message',
    'scripts'
  ]);
  const message = exact(settings['message'], `${at}.settings.message`, [
    'charactersPerSecond',
    'holdSeconds'
  ]);
  const scripts = exact(settings['scripts'], `${at}.settings.scripts`, [
    'instructionBudget',
    'timeScale'
  ]);
  return {
    payload: {
      bensonSchemaVersion: integer(
        payload['bensonSchemaVersion'],
        `${at}.payload.bensonSchemaVersion`
      ),
      decoderVersion: integer(
        payload['decoderVersion'],
        `${at}.payload.decoderVersion`
      ),
      endgameSchemaVersion: integer(
        payload['endgameSchemaVersion'],
        `${at}.payload.endgameSchemaVersion`
      ),
      flightSchemaVersion: integer(
        payload['flightSchemaVersion'],
        `${at}.payload.flightSchemaVersion`
      ),
      interactionSchemaVersion: integer(
        payload['interactionSchemaVersion'],
        `${at}.payload.interactionSchemaVersion`
      ),
      schemaVersion: integer(
        payload['schemaVersion'],
        `${at}.payload.schemaVersion`
      ),
      sourceCoreDigest: string(
        payload['sourceCoreDigest'],
        `${at}.payload.sourceCoreDigest`
      ),
      sourceDatasetId: string(
        payload['sourceDatasetId'],
        `${at}.payload.sourceDatasetId`
      ),
      textSchemaVersion: integer(
        payload['textSchemaVersion'],
        `${at}.payload.textSchemaVersion`
      ),
      undergroundSchemaVersion:
        payload['undergroundSchemaVersion'] === null
          ? null
          : integer(
              payload['undergroundSchemaVersion'],
              `${at}.payload.undergroundSchemaVersion`
            )
    },
    settings: {
      flight: flightSettings(settings['flight'], `${at}.settings.flight`),
      message: {
        charactersPerSecond: finite(
          message['charactersPerSecond'],
          `${at}.settings.message.charactersPerSecond`
        ),
        holdSeconds: finite(
          message['holdSeconds'],
          `${at}.settings.message.holdSeconds`
        )
      },
      scripts: {
        instructionBudget: integer(
          scripts['instructionBudget'],
          `${at}.settings.scripts.instructionBudget`
        ),
        timeScale: finite(
          scripts['timeScale'],
          `${at}.settings.scripts.timeScale`
        )
      }
    }
  };
};

const replaceSignedZero = (_key: string, value: unknown): unknown =>
  typeof value === 'number' && Object.is(value, -0) ? { $number: '-0' } : value;

const reviveSignedZero = (_key: string, value: unknown): unknown => {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    '$number' in value
  ) {
    const tagged = value as Record<string, unknown>;
    if (Object.keys(tagged).length !== 1 || tagged['$number'] !== '-0') {
      return fail('invalid tagged number');
    }
    return -0;
  }
  return value;
};

const canonical = (value: unknown): string =>
  JSON.stringify(value, replaceSignedZero);

export const encodeSave = (value: SaveEnvelope): string => {
  const checked = decodeEnvelope(canonical(value));
  return canonical(checked);
};

const decodeEnvelope = (text: string): SaveEnvelope => {
  if (text.length > SAVE_JSON_CODE_UNIT_LIMIT) {
    return fail('JSON exceeds the Save size limit');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, reviveSignedZero);
  } catch (error) {
    if (error instanceof SaveCodecError) {
      throw error;
    }
    return fail(`invalid JSON (${String(error)})`);
  }
  const out = exact(parsed, '$', [
    'environment',
    'location',
    'savedAt',
    'schemaVersion',
    'snapshot'
  ]);
  const schemaVersion = integer(out['schemaVersion'], '$.schemaVersion');
  if (schemaVersion !== SAVE_SCHEMA_VERSION) {
    return fail(`unsupported Save schemaVersion ${schemaVersion}`);
  }
  const savedAt = string(out['savedAt'], '$.savedAt');
  let canonicalSavedAt: string;
  try {
    canonicalSavedAt = new Date(savedAt).toISOString();
  } catch {
    return fail('$.savedAt must be a canonical ISO timestamp');
  }
  if (canonicalSavedAt !== savedAt) {
    return fail('$.savedAt must be a canonical ISO timestamp');
  }
  return {
    environment: environment(out['environment'], '$.environment'),
    location: location(out['location'], '$.location'),
    savedAt,
    schemaVersion: SAVE_SCHEMA_VERSION,
    snapshot: snapshot(out['snapshot'], '$.snapshot')
  };
};

export const decodeSave = (
  text: string,
  expectedEnvironment: SaveEnvironment
): SaveEnvelope => {
  const out = decodeEnvelope(text);
  if (canonical(out.environment) !== canonical(expectedEnvironment)) {
    return fail('Save environment does not match the current environment');
  }
  return out;
};

export const inspectSave = (text: string): SaveEnvelope => decodeEnvelope(text);
