import {
  SETTING_VALUES,
  applySetting,
  type ConsoleCommand,
  type ConsoleSettingHost
} from '../shell/console.ts';
import type { SavePersistence } from '../shell/saves.ts';
import { DAMOCLES_ROW_CELLS } from './display.ts';
import { damoclesWhere } from './save.ts';
import type { DamoclesSession } from './session.ts';

const SETTING_NAMES = Object.keys(SETTING_VALUES);

const HELP = [
  'help · where · inventory · atlas',
  'goto <x> <z>',
  'get [<object-slot>] · drop [<object-slot|name>]',
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
  readonly persistence: SavePersistence;
  readonly session: () => DamoclesSession;
}

const describeOutcome = (outcome: {
  readonly kind: string;
  readonly reason?: string;
}): string => outcome.reason ?? outcome.kind;

/// Damocles command set: settings and Saves as Targ, where/goto on Eris, Targ-only verbs refused.
export const executeDamoclesConsoleCommand = (
  command: ConsoleCommand,
  host: DamoclesConsoleHost
): readonly string[] => {
  switch (command.kind) {
    case 'atlas':
      host.openAtlas();
      return ['Opening Gamma Atlas…'];
    case 'help':
      return HELP;
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
    case 'setTime':
      return ["time belongs to Targ's orrery"];
    case 'inventory': {
      const snapshot = host.session().snapshot;
      return snapshot.carried.length === 0
        ? ['inventory is empty']
        : [snapshot.inventoryLabel];
    }
    case 'getObject': {
      const session = host.session();
      const selection = session.snapshot.selection;
      if (selection.kind === 'none' || !selection.inRange) {
        return ['nothing is in reach'];
      }
      // `take` has no argument: the original picks up whatever the selection routine chose, so a
      // slot here names what the player expects to be in reach rather than choosing a target.
      if (
        command.slot !== undefined &&
        selection.instance !== `object-slot-${command.slot}`
      ) {
        const reachable = session.objectName(selection.instance);
        return [
          `object ${command.slot} is not in reach; ${reachable ?? selection.instance} is`
        ];
      }
      const name = session.objectName(selection.instance);
      return session.take().kind === 'took'
        ? [`took ${name ?? selection.instance}`]
        : ['take refused'];
    }
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
