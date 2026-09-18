import type { GameplaySession, PresentationEvent } from '../session/index.ts';
import type { PresentationPreset, StructureReach } from '../settings/index.ts';
import { formatTargTime, parseTargTime } from '../sky/time.ts';
import { SURFACE, locationText, room } from '../world/index.ts';
import type {
  Composition,
  PanelRendition,
  PreferencesStore,
  WireframeGlow,
  WireframeWeight
} from './preferences.ts';
import type { SavePersistence, SaveSlot } from './saves.ts';
import type { TypefaceId } from './typography.ts';

/// One understood command line.
///
/// Parsing is separated from doing so that what the console accepts can be reasoned about without
/// a session to run it against — the same reason the trace decoder is its own function.
export type ConsoleCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'where' }
  | { readonly kind: 'inventory' }
  | { readonly kind: 'time' }
  | { readonly kind: 'setTime'; readonly secondsOfDay: number }
  | { readonly kind: 'dropObject'; readonly selector?: string }
  | { readonly kind: 'getObject'; readonly slot?: number }
  | {
      readonly height?: number;
      readonly kind: 'gotoCell';
      readonly x: number;
      readonly z: number;
    }
  | { readonly kind: 'gotoObject'; readonly slot: number }
  | { readonly kind: 'gotoRoom'; readonly room: number }
  | { readonly kind: 'set'; readonly setting: SettingChoice }
  | {
      readonly confirm: boolean;
      readonly kind: 'save';
      readonly slot: SaveSlot;
    }
  | { readonly kind: 'load'; readonly slot: SaveSlot };

export type SettingName =
  | 'composition'
  | 'glow'
  | 'road-glow'
  | 'road-weight'
  | 'rendition'
  | 'sky'
  | 'structures'
  | 'typeface'
  | 'weight';

/// One setting paired with the value it will be set to.
///
/// The value is narrowed at parse time, so execution never re-asks what a string means.
export type SettingChoice =
  | { readonly name: 'composition'; readonly value: Composition }
  | { readonly name: 'road-glow'; readonly value: 'document' | WireframeGlow }
  | {
      readonly name: 'road-weight';
      readonly value: 'document' | WireframeWeight;
    }
  | { readonly name: 'glow'; readonly value: 'document' | WireframeGlow }
  | { readonly name: 'rendition'; readonly value: PanelRendition }
  | { readonly name: 'sky'; readonly value: 'document' | PresentationPreset }
  | { readonly name: 'structures'; readonly value: 'document' | StructureReach }
  | { readonly name: 'typeface'; readonly value: TypefaceId }
  | { readonly name: 'weight'; readonly value: 'document' | WireframeWeight };

const COMPOSITIONS: readonly Composition[] = ['panel', 'strip'];
const GLOWS: readonly ('document' | WireframeGlow)[] = [
  'document',
  'off',
  'soft',
  'bright'
];
const RENDITIONS: readonly PanelRendition[] = ['targ', 'damocles'];
const SKIES: readonly ('document' | PresentationPreset)[] = [
  'document',
  'authentic',
  'enhanced'
];
const STRUCTURES: readonly ('document' | StructureReach)[] = [
  'document',
  'cell',
  'all'
];
const TYPEFACES: readonly TypefaceId[] = ['mercenary', 'damocles'];
const WEIGHTS: readonly ('document' | WireframeWeight)[] = [
  'document',
  'fine',
  'bold',
  'heavy'
];

/// Every value each setting accepts, spelled as the settings page spells them.
///
/// One vocabulary for both surfaces: a console that renamed a setting would be a second place to
/// look when a name stops working.
export const SETTING_VALUES: Readonly<Record<SettingName, readonly string[]>> =
  {
    composition: COMPOSITIONS,
    glow: GLOWS,
    rendition: RENDITIONS,
    'road-glow': GLOWS,
    'road-weight': WEIGHTS,
    sky: SKIES,
    structures: STRUCTURES,
    typeface: TYPEFACES,
    weight: WEIGHTS
  };

const SETTING_NAMES = Object.keys(SETTING_VALUES) as readonly SettingName[];

/// Rooms the Data Payload carries. Room zero is the surface's own host value, so it names no Room.
export const FIRST_ROOM = 1;

const isSettingName = (value: string): value is SettingName =>
  (SETTING_NAMES as readonly string[]).includes(value);

const integer = (word: string, what: string): number => {
  if (!/^-?\d+$/.test(word)) {
    throw new Error(`${what} must be a whole number, and is '${word}'`);
  }
  return Number(word);
};

const oneOf = <T extends string>(
  allowed: readonly T[],
  word: string,
  what: string
): T => {
  const match = allowed.find(value => value === word);
  if (match === undefined) {
    throw new Error(`${what} takes ${allowed.join(', ')}, and not '${word}'`);
  }
  return match;
};

const SETTING_PARSERS: Readonly<
  Record<SettingName, (word: string) => SettingChoice>
> = {
  composition: word => ({
    name: 'composition',
    value: oneOf(COMPOSITIONS, word, 'composition')
  }),
  glow: word => ({ name: 'glow', value: oneOf(GLOWS, word, 'glow') }),
  rendition: word => ({
    name: 'rendition',
    value: oneOf(RENDITIONS, word, 'rendition')
  }),
  'road-glow': word => ({
    name: 'road-glow',
    value: oneOf(GLOWS, word, 'road-glow')
  }),
  'road-weight': word => ({
    name: 'road-weight',
    value: oneOf(WEIGHTS, word, 'road-weight')
  }),
  sky: word => ({ name: 'sky', value: oneOf(SKIES, word, 'sky') }),
  structures: word => ({
    name: 'structures',
    value: oneOf(STRUCTURES, word, 'structures')
  }),
  typeface: word => ({
    name: 'typeface',
    value: oneOf(TYPEFACES, word, 'typeface')
  }),
  weight: word => ({ name: 'weight', value: oneOf(WEIGHTS, word, 'weight') })
};

const cell = (word: string, axis: string, cellsPerAxis: number): number => {
  const value = integer(word, `a ${axis} cell`);
  if (value < 0 || value >= cellsPerAxis) {
    throw new Error(
      `a ${axis} cell must be from 0 through ${cellsPerAxis - 1}, and is ${value}`
    );
  }
  return value;
};

const height = (word: string): number => {
  const value = integer(word, 'a height');
  const highest = 0xff_ff_ff;
  if (value < 0 || value > highest) {
    throw new Error(
      `a height must be from 0 through ${highest}, and is ${value}`
    );
  }
  return value;
};

const objectSlot = (word: string, objectSlots: number): number => {
  const value = integer(word, 'an object slot');
  if (value < 0 || value >= objectSlots) {
    throw new Error(
      `an object slot must be from 0 through ${objectSlots - 1}, and is ${value}`
    );
  }
  return value;
};

const slotOf = (word: string): SaveSlot => {
  const value = integer(word, 'a slot');
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new Error(`a slot must be 1, 2, or 3, and is ${value}`);
  }
  return value;
};

/// Read one command line, or refuse it with the reason.
///
/// Nothing is coerced or guessed: an unusable line throws a message naming what was wrong, in the
/// style the trace decoder established, because a console that quietly did something adjacent to
/// what was typed would be worse than one that declined. The grid bound comes from the caller, so
/// the parser is honest about the world it is reading for rather than pinning one payload's shape.
export const parseConsoleCommand = (
  line: string,
  cellsPerAxis: number,
  objectSlots = 64,
  objectActions: 'named' | 'selected' = 'named'
): ConsoleCommand | undefined => {
  const words = line.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const verb = words[0];
  if (verb === undefined) {
    return undefined;
  }
  const rest = words.slice(1);

  switch (verb) {
    case 'help':
      return { kind: 'help' };
    case 'where':
      if (rest.length !== 0) {
        throw new Error('where takes no arguments');
      }
      return { kind: 'where' };
    case 'time':
      if (rest.length === 0) {
        return { kind: 'time' };
      }
      if (rest.length !== 1) {
        throw new Error('time takes no value, or one H:MM[:SS] value');
      }
      return { kind: 'setTime', secondsOfDay: parseTargTime(rest[0]!) };
    case 'inventory':
      if (rest.length !== 0) {
        throw new Error('inventory takes no arguments');
      }
      return { kind: 'inventory' };
    case 'drop':
      if (rest.length === 0) {
        if (objectActions === 'selected') {
          return { kind: 'dropObject' };
        }
        throw new Error('drop takes an object id or name');
      }
      return { kind: 'dropObject', selector: rest.join(' ') };
    case 'get':
      if (rest.length === 0 && objectActions === 'selected') {
        return { kind: 'getObject' };
      }
      if (rest.length !== 1) {
        throw new Error('get takes one object slot');
      }
      return {
        kind: 'getObject',
        slot: objectSlot(rest[0]!, objectSlots)
      };
    case 'goto':
      if (rest[0] === 'object') {
        if (rest.length !== 2) {
          throw new Error('goto object takes one object slot');
        }
        return {
          kind: 'gotoObject',
          slot: objectSlot(rest[1]!, objectSlots)
        };
      }
      if (rest[0] === 'room') {
        if (rest.length !== 2) {
          throw new Error('goto room takes one Room');
        }
        const id = integer(rest[1]!, 'a Room');
        if (id < FIRST_ROOM) {
          throw new Error(
            `Room ${id} is not a Room: the surface is not one, so Rooms start at ${FIRST_ROOM}`
          );
        }
        return { kind: 'gotoRoom', room: id };
      }
      if (rest.length < 2 || rest.length > 3) {
        throw new Error(
          'goto takes two cells and an optional height, or the word room and one Room'
        );
      }
      return {
        ...(rest[2] === undefined ? {} : { height: height(rest[2]) }),
        kind: 'gotoCell',
        x: cell(rest[0]!, 'x', cellsPerAxis),
        z: cell(rest[1]!, 'z', cellsPerAxis)
      };
    case 'panel':
      // An alias: the panel's rendition is a setting like any other.
      if (rest.length !== 1) {
        throw new Error('panel takes one rendition');
      }
      return { kind: 'set', setting: SETTING_PARSERS.rendition(rest[0]!) };
    case 'set': {
      if (rest.length !== 2) {
        throw new Error('set takes a name and a value');
      }
      const name = rest[0]!;
      if (!isSettingName(name)) {
        throw new Error(
          `unknown setting '${name}': try ${SETTING_NAMES.join(', ')}`
        );
      }
      return { kind: 'set', setting: SETTING_PARSERS[name](rest[1]!) };
    }
    case 'save':
      if (rest.length < 1 || rest.length > 2) {
        throw new Error('save takes a slot, and optionally the word confirm');
      }
      if (rest.length === 2 && rest[1] !== 'confirm') {
        throw new Error(`save takes the word confirm, not '${rest[1]}'`);
      }
      return {
        confirm: rest.length === 2,
        kind: 'save',
        slot: slotOf(rest[0]!)
      };
    case 'load':
      if (rest.length !== 1) {
        throw new Error('load takes a slot');
      }
      return { kind: 'load', slot: slotOf(rest[0]!) };
    default:
      throw new Error(`unknown command '${verb}': type help`);
  }
};

export interface ConsoleParseContext {
  readonly cellsPerAxis: () => number;
  readonly objectActions?: () => 'named' | 'selected';
  readonly objectSlots: () => number;
}

export interface ConsoleSettingHost {
  readonly preferences: PreferencesStore;
  readonly typeface: (face: TypefaceId) => void;
}

export interface ConsoleDeps extends ConsoleParseContext, ConsoleSettingHost {
  readonly cellSize: () => number;
  readonly hasRoom: (id: number) => boolean;
  readonly objectName: (slot: number) => string | undefined;
  readonly persistence: SavePersistence;
  readonly present?: (events: readonly PresentationEvent[]) => void;
  readonly session: () => GameplaySession;
  readonly setTime: (secondsOfDay: number) => void;
  readonly time: () => number;
}

const HELP = [
  'help · where · time [h]h:mm[:ss] · inventory · get <object-slot>',
  'drop <object-id|name>',
  'goto <x> <z> [height] · goto room <n> · goto object <slot>',
  'panel <targ|damocles> · set <name> <value>',
  `set names: ${SETTING_NAMES.join(', ')}`,
  'save <slot> [confirm] · load <slot>'
];

const twoDigits = (value: number): string =>
  String(Math.trunc(value)).padStart(2, '0');

const threeDecimals = (value: number): string => {
  const formatted = value.toFixed(3);
  return formatted === '-0.000' ? '0.000' : formatted;
};

const inventoryLabel = (
  slot: number,
  objectName: (slot: number) => string | undefined
): string => `(${slot}) ${objectName(slot) ?? `OBJECT ${twoDigits(slot)}`}`;

const normalName = (value: string): string =>
  value.trim().toLowerCase().replaceAll(/\s+/g, ' ');

const regexLiteral = (value: string): string =>
  value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

/// Resolve a selector only within the Carried Stack. A literal carried id wins; names then use
/// the strongest available match so a precise phrase is not made ambiguous by a looser substring.
const matchingCarriedSlots = (
  selector: string,
  carried: readonly number[],
  objectName: (slot: number) => string | undefined
): readonly number[] => {
  if (/^\d+$/.test(selector)) {
    const id = Number(selector);
    if (carried.includes(id)) {
      return [id];
    }
  }

  const query = normalName(selector);
  const named = carried.map(slot => ({
    name: normalName(objectName(slot) ?? `OBJECT ${twoDigits(slot)}`),
    slot
  }));
  const exact = named.filter(candidate => candidate.name === query);
  if (exact.length > 0) {
    return exact.map(candidate => candidate.slot);
  }
  const whole = new RegExp(
    `(?:^|[^a-z0-9])${regexLiteral(query)}(?:$|[^a-z0-9])`
  );
  const words = named.filter(candidate => whole.test(candidate.name));
  if (words.length > 0) {
    return words.map(candidate => candidate.slot);
  }
  return named
    .filter(candidate => candidate.name.includes(query))
    .map(candidate => candidate.slot);
};

/// Do what one understood command says, and report what happened.
///
/// Every gameplay change goes through the Gameplay Session's own actions, and every preference
/// through the stores that own it — the console holds no state of its own beyond its transcript.
export const executeConsoleCommand = (
  command: ConsoleCommand,
  deps: ConsoleDeps
): readonly string[] => {
  switch (command.kind) {
    case 'help':
      return HELP;
    case 'where': {
      const snapshot = deps.session().snapshot;
      const { heading, pitch, position, roll } = snapshot.player;
      const size = deps.cellSize();
      return [
        `${locationText(snapshot.location)} · cell ${twoDigits(position.x / size)}-${twoDigits(position.z / size)}`,
        `position x ${threeDecimals(position.x)} y ${threeDecimals(position.y)} z ${threeDecimals(position.z)}`,
        `orientation heading ${threeDecimals(heading)} pitch ${threeDecimals(pitch)} roll ${threeDecimals(roll)} radians`,
        snapshot.occupancy.kind === 'onFoot'
          ? 'on foot'
          : `aboard craft ${twoDigits(snapshot.occupancy.slot)}`
      ];
    }
    case 'time': {
      return [`time ${formatTargTime(deps.time())}`];
    }
    case 'setTime': {
      deps.setTime(command.secondsOfDay);
      return [`time ${formatTargTime(deps.time())}`];
    }
    case 'inventory': {
      const carried = deps.session().snapshot.carriedStack;
      return carried.length === 0
        ? ['inventory is empty']
        : carried.map(slot => inventoryLabel(slot, deps.objectName));
    }
    case 'dropObject': {
      if (command.selector === undefined) {
        return ['drop takes an object id or name'];
      }
      const session = deps.session();
      const carried = session.snapshot.carriedStack;
      if (carried.length === 0) {
        return ['inventory is empty'];
      }
      const matches = matchingCarriedSlots(
        command.selector,
        carried,
        deps.objectName
      );
      if (matches.length === 0) {
        return [`no carried object matches '${command.selector}'`];
      }
      if (matches.length > 1) {
        return [
          `'${command.selector}' matches more than one carried object: ${matches
            .map(slot => inventoryLabel(slot, deps.objectName))
            .join(', ')}`
        ];
      }
      const slot = matches[0]!;
      const result = session.drop(slot);
      deps.present?.(result.events);
      const outcome = result.outcome;
      switch (outcome.kind) {
        case 'dropped':
          return [`dropped ${inventoryLabel(slot, deps.objectName)}`];
        case 'emptyInventory':
          return ['inventory is empty'];
        case 'airborneRefused':
          return ['cannot drop objects while airborne'];
      }
      throw new Error('unknown object drop outcome');
    }
    case 'getObject': {
      if (command.slot === undefined) {
        return ['get takes one object slot'];
      }
      const result = deps.session().takeObject(command.slot);
      deps.present?.(result.events);
      const outcome = result.outcome;
      const label = twoDigits(command.slot);
      switch (outcome.kind) {
        case 'took':
          return [`took object ${label}`];
        case 'fixedInPlace':
          return [`object ${label} is fixed in place`];
        case 'tooHeavy':
          return [`object ${label} is too heavy`];
        case 'handsFull':
          return ['inventory is full'];
        case 'alreadyCarried':
          return [`object ${label} is already carried`];
        case 'gone':
          return [`object ${label} is not in the world`];
        case 'missing':
          return [`there is no object ${label}`];
        case 'unsupported':
          return ['getting objects is unavailable'];
      }
      throw new Error('unknown object take outcome');
    }
    case 'gotoCell': {
      const session = deps.session();
      const size = deps.cellSize();
      // The surface first: placing alone would move the player inside whatever Room they are in.
      session.teleport(SURFACE);
      // The cell's middle, and the altitude they already had — the session would take any number
      // given to it, including one no play could reach.
      const position = {
        x: (command.x + 0.5) * size,
        y: command.height ?? session.snapshot.player.position.y,
        z: (command.z + 0.5) * size
      };
      if (command.height === undefined) {
        session.place(position);
      } else {
        session.placeInAir(position);
      }
      return [
        `moved to cell ${twoDigits(command.x)}-${twoDigits(command.z)}${
          command.height === undefined ? '' : ` at height ${command.height}`
        }`
      ];
    }
    case 'gotoObject': {
      const outcome = deps.session().placeAtObject(command.slot);
      const label = twoDigits(command.slot);
      switch (outcome.kind) {
        case 'placed':
          return [
            `moved to object ${label} ${
              outcome.location.kind === 'surface'
                ? 'on SURFACE'
                : `in ${locationText(outcome.location)}`
            }`
          ];
        case 'carried':
          return [`object ${label} is being carried`];
        case 'gone':
          return [`object ${label} is not in the world`];
        case 'missing':
          return [`there is no object ${label}`];
      }
      throw new Error('unknown object placement outcome');
    }
    case 'gotoRoom': {
      if (!deps.hasRoom(command.room)) {
        return [`there is no Room ${command.room}`];
      }
      // Teleporting settles the player inside the Room's own bounds; placing afterwards would
      // step around that and leave later wall contact disagreeing with the world.
      const destination = room(command.room);
      deps.session().teleport(destination);
      return [`teleported to ${locationText(destination)}`];
    }
    case 'set':
      return [applySetting(command.setting, deps)];
    case 'save': {
      const outcome = deps.persistence.save(command.slot);
      if (outcome.kind === 'failed') {
        return [`save refused: ${describeOutcome(outcome)}`];
      }
      if (outcome.kind === 'done') {
        return [`saved slot ${command.slot}`];
      }
      if (!command.confirm) {
        // Arming is left cleared, so a press in the chooser cannot finish what was typed here.
        deps.persistence.disarm();
        return [
          `slot ${command.slot} holds a Save: 'save ${command.slot} confirm' to overwrite`
        ];
      }
      const confirmed = deps.persistence.save(command.slot);
      return confirmed.kind === 'done'
        ? [`saved slot ${command.slot}`]
        : [`save refused: ${describeOutcome(confirmed)}`];
    }
    case 'load': {
      const outcome = deps.persistence.load(command.slot);
      return outcome.kind === 'done'
        ? [`restored slot ${command.slot}`]
        : [`load refused: ${describeOutcome(outcome)}`];
    }
  }
};

const describeOutcome = (outcome: {
  readonly kind: string;
  readonly reason?: string;
}): string => outcome.reason ?? outcome.kind;

export const applySetting = (
  setting: SettingChoice,
  deps: ConsoleSettingHost
): string => {
  switch (setting.name) {
    case 'composition':
      deps.preferences.update({ composition: setting.value });
      return `composition ${setting.value}`;
    case 'rendition':
      deps.preferences.update({ panelRendition: setting.value });
      return `rendition ${setting.value}`;
    case 'road-glow':
      deps.preferences.update({
        roadGlow: setting.value === 'document' ? undefined : setting.value
      });
      return `road-glow ${setting.value === 'document' ? 'as tuned' : setting.value}`;
    case 'road-weight':
      deps.preferences.update({
        roadWeight: setting.value === 'document' ? undefined : setting.value
      });
      return `road-weight ${setting.value === 'document' ? 'as tuned' : setting.value}`;
    case 'glow':
      // As with the sky, 'document' hands the choice back to the tuning document.
      if (setting.value === 'document') {
        deps.preferences.update({ wireframeGlow: undefined });
        return 'glow as tuned';
      }
      deps.preferences.update({ wireframeGlow: setting.value });
      return `glow ${setting.value}`;
    case 'weight':
      if (setting.value === 'document') {
        deps.preferences.update({ wireframeWeight: undefined });
        return 'weight as tuned';
      }
      deps.preferences.update({ wireframeWeight: setting.value });
      return `weight ${setting.value}`;
    case 'sky':
      // The tuning document owns the sky; handing the choice back to it is itself a choice.
      deps.preferences.update(
        setting.value === 'document'
          ? { presentationPreset: undefined }
          : { presentationPreset: setting.value }
      );
      return setting.value === 'document'
        ? 'sky as tuned'
        : `sky ${setting.value}`;
    case 'structures':
      if (setting.value === 'document') {
        deps.preferences.update({ structureReach: undefined });
        return 'structures as tuned';
      }
      deps.preferences.update({ structureReach: setting.value });
      return `structures ${setting.value}`;
    case 'typeface':
      deps.typeface(setting.value);
      return `typeface ${setting.value}`;
  }
};
