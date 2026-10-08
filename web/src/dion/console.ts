import { describePads, type PadDescription } from '../shell/gamepad.ts';
import { formatTargTime, parseTargTime } from '../sky/time.ts';
import type { DionSession } from './session.ts';

export type DionConsoleCommand =
  | { readonly kind: 'help' | 'pads' | 'time' | 'clock' }
  | { readonly kind: 'setTime' | 'setClock'; readonly secondsOfDay: number };

export const DION_CONSOLE_BANNER = [
  'shell console',
  'a development tool: type help for commands'
] as const;

export const parseDionConsoleCommand = (
  line: string
): DionConsoleCommand | undefined => {
  const [verb, ...rest] = line
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (verb === undefined) {
    return undefined;
  }
  if ((verb === 'help' || verb === 'pads') && rest.length === 0) {
    return { kind: verb };
  }
  if (verb !== 'time' && verb !== 'clock') {
    throw new Error(`unknown command '${verb}': type help`);
  }
  if (rest.length === 0) {
    return { kind: verb };
  }
  if (rest.length !== 1) {
    throw new Error(`${verb} takes no value, or one H:MM[:SS] value`);
  }
  return {
    kind: verb === 'time' ? 'setTime' : 'setClock',
    secondsOfDay: parseTargTime(rest[0]!)
  };
};

export const executeDionConsoleCommand = (
  command: DionConsoleCommand,
  host: {
    /// The browser's pads, for `pads`.
    readonly pads?: () => readonly (PadDescription | null)[];
    readonly session: () => DionSession;
  }
): readonly string[] => {
  const session = host.session();
  switch (command.kind) {
    case 'help':
      return ['help · time [h]h:mm[:ss] · clock [h]h:mm[:ss] · pads'];
    case 'pads':
      return describePads(host.pads?.() ?? []);
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
  }
};
