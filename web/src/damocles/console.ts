import {
  SETTING_VALUES,
  applySetting,
  parseConsoleCommand,
  type ConsoleCommand,
  type ConsoleSettingHost
} from '../shell/console.ts';
import { describePads, type PadDescription } from '../shell/gamepad.ts';
import type { SavePersistence } from '../shell/saves.ts';
import { formatTargTime, parseTargTime } from '../sky/time.ts';
import { clockLevelAtRate } from './comet.ts';
import { DAMOCLES_ROW_CELLS } from './display.ts';
import { damoclesWhere } from './save.ts';
import type {
  DamoclesFetchObjectOutcome,
  DamoclesSession,
  DamoclesTakeObjectOutcome
} from './session.ts';

export type DamoclesConsoleCommand =
  | ConsoleCommand
  | { readonly kind: 'impact' | 'rate' }
  | { readonly kind: 'setRate'; readonly multiplier: number }
  | { readonly kind: 'setImpact'; readonly seconds: number };

export const parseDamoclesConsoleCommand = (
  line: string,
  cellsPerAxis: number
): DamoclesConsoleCommand | undefined => {
  const [verb, ...rest] = line.trim().toLowerCase().split(/\s+/);
  if (verb === 'rate') {
    if (rest.length === 0) {
      return { kind: 'rate' };
    }
    if (rest.length !== 1 || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(rest[0]!)) {
      throw new Error('rate takes no value, or one speed multiplier');
    }
    const multiplier = Number(rest[0]);
    clockLevelAtRate(multiplier);
    return { kind: 'setRate', multiplier };
  }
  if (verb !== 'impact') {
    return parseConsoleCommand(line, cellsPerAxis, 256, 'selected');
  }
  if (rest.length === 0) {
    return { kind: 'impact' };
  }
  if (rest.length !== 1) {
    throw new Error('impact takes no value, or one [+]H:MM[:SS] value');
  }
  const value = rest[0]!;
  const passed = value.startsWith('+');
  const seconds = parseTargTime(passed ? value.slice(1) : value);
  return { kind: 'setImpact', seconds: passed ? seconds : -seconds };
};

const SETTING_NAMES = Object.keys(SETTING_VALUES);

const HELP = [
  'help · where · inventory · atlas · pads',
  'time [h]h:mm[:ss] · impact [+][h]h:mm[:ss]',
  'rate [multiplier] · powers of two from 0.0625 to 64; 1 is normal',
  'goto <x> <z>',
  'get [<object-slot>] · drop [<object-slot|name>] · fetch <object-slot>',
  'panel <targ|damocles> · set <name> <value>',
  `set names: ${SETTING_NAMES.join(', ')}`,
  'save <slot> [confirm] · load <slot>',
  'switch <pose-id|body> · floor <n>'
];

const threeDecimals = (value: number): string => {
  const formatted = value.toFixed(3);
  return formatted === '-0.000' ? '0.000' : formatted;
};

export const DAMOCLES_CONSOLE_BANNER = [
  'shell console',
  'a development tool: type help for commands'
] as const;

/// The transcript line for one message the message bar has started to show, as Targ's
/// Benson Messages are logged. `text` runs from the block's start to the record's end, so a
/// document body is logged a block, one row of the bar, at a time.
export const damoclesMessageTranscript = (text: string): readonly string[] => {
  const shown = text.slice(0, DAMOCLES_ROW_CELLS).trim();
  return shown === '' ? [] : [`BENSON · ${shown}`];
};

export interface DamoclesConsoleHost extends ConsoleSettingHost {
  readonly openAtlas: () => void;
  /// The browser's pads, for `pads`.
  readonly pads?: () => readonly (PadDescription | null)[];
  readonly persistence: SavePersistence;
  readonly session: () => DamoclesSession;
}

const describeOutcome = (outcome: {
  readonly kind: string;
  readonly reason?: string;
}): string => outcome.reason ?? outcome.kind;

/// A slot as Targ's console writes one: two digits at least.
const label = (slot: number): string => String(slot).padStart(2, '0');

/// The console's report of a remote Take, worded as Targ's `get` reports one.
const describeTake = (
  outcome: DamoclesTakeObjectOutcome
): readonly string[] => {
  switch (outcome.kind) {
    case 'took':
      return [`took object ${label(outcome.slot)}`];
    case 'fixedInPlace':
      return [`object ${label(outcome.slot)} is fixed in place`];
    case 'tooHeavy':
      return [`object ${label(outcome.slot)} is too heavy`];
    case 'handsFull':
      return ['inventory is full'];
    case 'alreadyCarried':
      return [`object ${label(outcome.slot)} is already carried`];
    case 'gone':
      return [`object ${label(outcome.slot)} is not in the world`];
    case 'missing':
      return [`there is no object ${label(outcome.slot)}`];
    case 'busy':
      return [`get refused: ${outcome.reason}`];
  }
};

/// The console's report of a fetch, worded as Targ's `fetch` reports one.
const describeFetch = (
  outcome: DamoclesFetchObjectOutcome
): readonly string[] => {
  switch (outcome.kind) {
    case 'fetched':
      return [`fetched object ${label(outcome.slot)}`];
    case 'fixedInPlace':
      return [`object ${label(outcome.slot)} is fixed in place`];
    case 'noRoom':
      return [`no room for object ${label(outcome.slot)}`];
    case 'alreadyCarried':
      return [`object ${label(outcome.slot)} is already carried; use drop`];
    case 'gone':
      return [`object ${label(outcome.slot)} is not in the world`];
    case 'missing':
      return [`there is no object ${label(outcome.slot)}`];
    case 'busy':
      return [`fetch refused: ${outcome.reason}`];
  }
};

/// Damocles command set: settings and Saves as Targ, where/goto on Eris, Targ-only verbs refused.
export const executeDamoclesConsoleCommand = (
  command: DamoclesConsoleCommand,
  host: DamoclesConsoleHost
): readonly string[] => {
  switch (command.kind) {
    case 'atlas':
      host.openAtlas();
      return ['Opening Gamma Atlas…'];
    case 'help':
      return HELP;
    case 'pads':
      return describePads(host.pads?.() ?? []);
    case 'where': {
      const snapshot = host.session().snapshot;
      const { heading, position } = snapshot.pose;
      return [
        `${damoclesWhere(snapshot)} · cell ${snapshot.cell.x}-${snapshot.cell.z}`,
        `position x ${threeDecimals(position.x)} y ${threeDecimals(position.y)} z ${threeDecimals(position.z)}`,
        `orientation heading ${threeDecimals(heading)} radians`,
        'on foot'
      ];
    }
    case 'gotoCell': {
      if (command.height !== undefined) {
        return ['goto takes two cells on Eris'];
      }
      try {
        host.session().teleportToCell(command.x, command.z);
      } catch (error) {
        return [error instanceof Error ? error.message : String(error)];
      }
      return [`moved to cell ${command.x}-${command.z}`];
    }
    case 'set':
      return [applySetting(command.setting, host)];
    case 'save': {
      const outcome = host.persistence.save(command.slot);
      if (outcome.kind === 'failed') {
        return [`save refused: ${describeOutcome(outcome)}`];
      }
      if (outcome.kind === 'done') {
        return [`saved slot ${command.slot}`];
      }
      if (!command.confirm) {
        host.persistence.disarm();
        return [
          `slot ${command.slot} holds a Save: 'save ${command.slot} confirm' to overwrite`
        ];
      }
      const confirmed = host.persistence.save(command.slot);
      return confirmed.kind === 'done'
        ? [`saved slot ${command.slot}`]
        : [`save refused: ${describeOutcome(confirmed)}`];
    }
    case 'load': {
      const outcome = host.persistence.load(command.slot);
      return outcome.kind === 'done'
        ? [`restored slot ${command.slot}`]
        : [`load refused: ${describeOutcome(outcome)}`];
    }
    case 'time':
    case 'setTime': {
      const session = host.session();
      if (session.bodyTime() === null) {
        return ['time needs a Body underfoot'];
      }
      if (command.kind === 'setTime') {
        session.setBodyTime(command.secondsOfDay);
      }
      return [`time ${formatTargTime(session.bodyTime()!)}`];
    }
    case 'impact':
    case 'setImpact': {
      const session = host.session();
      if (command.kind === 'setImpact') {
        session.setImpactTime(command.seconds);
      }
      const seconds = session.snapshot.impact.seconds;
      return [
        `impact ${formatTargTime(Math.abs(seconds), '-')} ${seconds < 0 ? 'to impact' : 'since impact'}`
      ];
    }
    case 'rate':
    case 'setRate': {
      const session = host.session();
      if (command.kind === 'setRate') {
        session.setTimeRate(command.multiplier);
      }
      return [`rate ${session.timeRate()}x`];
    }
    case 'inventory': {
      const snapshot = host.session().snapshot;
      return snapshot.carried.length === 0
        ? ['inventory is empty']
        : [snapshot.inventoryLabel];
    }
    case 'getObject': {
      const session = host.session();
      if (command.slot !== undefined) {
        return describeTake(session.takeObject(command.slot));
      }
      // Bare `get` is the Take key: the original picks up whatever the selection routine chose.
      const selection = session.snapshot.selection;
      if (selection.kind === 'none' || !selection.inRange) {
        return ['nothing is in reach'];
      }
      const name = session.objectName(selection.instance);
      return session.take().kind === 'took'
        ? [`took ${name ?? selection.instance}`]
        : ['take refused'];
    }
    case 'fetchObject':
      return describeFetch(host.session().fetchObject(command.slot));
    case 'dropObject': {
      const snapshot = host.session().snapshot;
      if (snapshot.carried.length === 0) {
        return ['inventory is empty'];
      }
      const selector = command.selector?.toUpperCase();
      // Only the head can be dropped, so a selector confirms the head rather than choosing one.
      // It matches the head's own slot digits or any part of its Catalogue name.
      const head = snapshot.carried[0]!;
      const headSlot = /^object-slot-(\d+)$/.exec(head)?.[1];
      if (
        selector !== undefined &&
        selector !== headSlot &&
        !(host.session().objectName(head) ?? '')
          .toUpperCase()
          .includes(selector)
      ) {
        return [`carried head does not match '${command.selector}'`];
      }
      return host.session().drop().kind === 'dropped'
        ? [`dropped ${snapshot.inventoryLabel}`]
        : ['drop refused'];
    }
    case 'switchBody': {
      const outcome = host.session().switchToPose(command.name);
      if (outcome.kind === 'declined') {
        return [`switch declined: ${outcome.reason}`];
      }
      // A one-shot Semantic Action. The boot wrapper's existing rule checkpoints Session Resume
      // for it, so there is no new checkpoint rule here.
      const snapshot = host.session().snapshot;
      return [
        `switched to ${outcome.pose}`,
        `${damoclesWhere(snapshot)} · cell ${snapshot.cell.x}-${snapshot.cell.z}`
      ];
    }
    case 'floor': {
      const outcome = host.session().changeFloor(command.floor);
      return outcome.kind === 'refused'
        ? [`floor refused: ${outcome.reason}`]
        : [`moved to Floor ${command.floor}`];
    }
    case 'gotoRoom':
      return ['Damocles has no Rooms'];
    case 'gotoObject':
      return ['Damocles has no objects to go to'];
  }
};
