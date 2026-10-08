import {
  SETTING_VALUES,
  applySetting,
  loadFromSlot,
  parseConsoleCommand,
  saveToSlot,
  type ConsoleCommand,
  type ConsoleSettingHost
} from '../shell/console.ts';
import { describePads, type PadDescription } from '../shell/gamepad.ts';
import type { SavePersistence } from '../shell/saves.ts';
import { formatTargTime, parseTargTime } from '../sky/time.ts';
import { tourcraftWhere } from './tourcraftSave.ts';
import type { TourcraftSession } from './tourcraftSession.ts';

/// Mercenary III's Shell Console: Targ's shared command set, read as Damocles reads it, with the
/// panel clock beside Body Time. Verbs whose Dion counterpart is not ported answer so.
export type DionConsoleCommand =
  | ConsoleCommand
  | { readonly kind: 'clock' }
  | { readonly kind: 'setClock'; readonly secondsOfDay: number };

export const DION_CONSOLE_BANNER = [
  'shell console',
  'a development tool: type help for commands'
] as const;

/// A Body's cells a side, as `tourcraftWhere` reads the cell byte.
const CELLS_PER_AXIS = 16;
/// Dion's object slots run to 255, as Damocles's do.
const OBJECT_SLOTS = 256;

export const parseDionConsoleCommand = (
  line: string
): DionConsoleCommand | undefined => {
  const [verb, ...rest] = line.trim().toLowerCase().split(/\s+/);
  if (verb !== 'clock') {
    return parseConsoleCommand(line, CELLS_PER_AXIS, OBJECT_SLOTS, 'selected');
  }
  if (rest.length === 0) {
    return { kind: 'clock' };
  }
  if (rest.length !== 1) {
    throw new Error('clock takes no value, or one H:MM[:SS] value');
  }
  return { kind: 'setClock', secondsOfDay: parseTargTime(rest[0]!) };
};

const HELP = [
  'help · where · inventory · pads',
  'time [h]h:mm[:ss] · clock [h]h:mm[:ss]',
  'get · drop [<object-slot|name>]',
  'set <name> <value>',
  `set names: ${Object.keys(SETTING_VALUES).join(', ')}`,
  'save <slot> [confirm] · load <slot>',
  'floor <n>'
];

/// The transcript line for one message the message bar has started to show, as Damocles's and
/// Targ's Benson Messages are logged.
export const dionMessageTranscript = (text: string): readonly string[] => {
  const shown = text.trim();
  return shown === '' ? [] : [`BENSON · ${shown}`];
};

export interface DionConsoleHost extends ConsoleSettingHost {
  /// The browser's pads, for `pads`.
  readonly pads?: () => readonly (PadDescription | null)[];
  readonly persistence: SavePersistence;
  readonly session: () => TourcraftSession;
}

/// A slot as Targ's console writes one: two digits at least.
const label = (slot: number): string => String(slot).padStart(2, '0');

export const executeDionConsoleCommand = (
  command: DionConsoleCommand,
  host: DionConsoleHost
): readonly string[] => {
  const session = host.session();
  switch (command.kind) {
    case 'help':
      return HELP;
    case 'pads':
      return describePads(host.pads?.() ?? []);
    case 'where': {
      const { eye, heading } = session.snapshot;
      return [
        tourcraftWhere(session),
        `eye x ${eye[0]} y ${eye[1]} z ${eye[2]}`,
        `heading ${heading}`,
        session.aboard ? 'aboard' : 'on foot'
      ];
    }
    case 'inventory': {
      const stack = session.snapshot.tourcraft!.carry.stack;
      return stack.length === 0
        ? ['inventory is empty']
        : stack.map(
            slot =>
              `(${slot}) ${session.objectName(slot) ?? `OBJECT ${label(slot)}`}`
          );
    }
    // Take and Drop are the keys' own actions: the next step answers them, and the game's
    // message, logged as Benson, says what came of it.
    case 'getObject': {
      if (command.slot !== undefined) {
        return ['Mercenary III takes only what is in reach: type get'];
      }
      if (session.snapshot.candidate === null) {
        return ['nothing is in reach'];
      }
      const { slot } = session.snapshot.candidate;
      session.press('take');
      return [`take ${session.objectName(slot) ?? `OBJECT ${label(slot)}`}`];
    }
    case 'dropObject': {
      const head = session.snapshot.tourcraft!.carry.stack[0];
      if (head === undefined) {
        return ['inventory is empty'];
      }
      const name = session.objectName(head) ?? `OBJECT ${label(head)}`;
      // Only the head can be dropped, so a selector confirms the head rather than choosing one.
      const selector = command.selector?.toUpperCase();
      if (
        selector !== undefined &&
        selector !== String(head) &&
        !name.toUpperCase().includes(selector)
      ) {
        return [`carried head does not match '${command.selector}'`];
      }
      session.press('drop');
      return [`drop ${name}`];
    }
    case 'set':
      return [applySetting(command.setting, host)];
    case 'save':
      return saveToSlot(host.persistence, command.slot, command.confirm);
    case 'load':
      return loadFromSlot(host.persistence, command.slot);
    case 'setTime':
      session.setBodyTime(command.secondsOfDay);
      return [`time ${formatTargTime(session.bodyTime())}`];
    case 'time':
      return [`time ${formatTargTime(session.bodyTime())}`];
    case 'setClock':
      session.setPanelClock(command.secondsOfDay);
      return [`clock ${formatTargTime(session.snapshot.clock.seconds)}`];
    case 'clock':
      return [`clock ${formatTargTime(session.snapshot.clock.seconds)}`];
    case 'fetchObject':
      return ['fetch is not ported to Mercenary III yet'];
    case 'gotoCell':
    case 'gotoObject':
    case 'gotoRoom':
      return ['goto is not ported to Mercenary III yet'];
    case 'floor': {
      const outcome = session.changeFloor(command.floor);
      return outcome.kind === 'refused'
        ? [`floor refused: ${outcome.reason}`]
        : [`moved to Floor ${command.floor}`];
    }
    case 'switchBody':
      return ['switch is not ported to Mercenary III yet'];
    case 'atlas':
      return ['The Gamma Atlas belongs to Damocles'];
  }
};
