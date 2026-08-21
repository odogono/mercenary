import { parseBensonKey } from '../benson/index.ts';
import type { GameplaySession } from '../session/index.ts';
import { isObject, type TraceObject, type TraceValue } from './index.ts';

export type SessionTraceCommand =
  | { readonly key: string | null; readonly kind: 'press' }
  | { readonly kind: 'throttleNotch'; readonly notch: number }
  | { readonly kind: 'shutThrottle' }
  | { readonly kind: 'leaveCraft' }
  | { readonly kind: 'rideLift' }
  | { readonly kind: 'drop' };

const FORBIDDEN = new Set(['board', 'teleport']);

export const decodeSessionTraceCommand = (
  value: TraceValue
): SessionTraceCommand => {
  if (!isObject(value)) {
    throw new Error('a Session command must be an object');
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    if (FORBIDDEN.has(key)) {
      throw new Error(`the Session gate will not replay ${key}`);
    }
  }
  if (keys.length !== 1) {
    throw new Error('a Session command must name exactly one action');
  }

  const key = keys[0]!;
  const operand = (value as TraceObject)[key];
  switch (key) {
    case 'press':
      if (operand !== null && typeof operand !== 'string') {
        throw new Error('press must name a key or null');
      }
      return { key: operand, kind: 'press' };
    case 'throttleNotch':
      if (
        !Number.isInteger(operand) ||
        typeof operand !== 'number' ||
        operand < 1 ||
        operand > 10
      ) {
        throw new Error('throttleNotch must be an integer from 1 through 10');
      }
      return { kind: 'throttleNotch', notch: operand };
    case 'shutThrottle':
    case 'leaveCraft':
    case 'rideLift':
    case 'drop':
      if (operand !== true) {
        throw new Error(`${key} must be true`);
      }
      return { kind: key };
    default:
      throw new Error(`unknown Session command '${key}'`);
  }
};

const commandKey = (key: string | null) => {
  if (key === null || key === 'any') {
    return undefined;
  }
  const parsed =
    parseBensonKey(key) ?? parseBensonKey(`key${key.toUpperCase()}`);
  if (parsed === undefined) {
    throw new Error(`a Session command names unknown Benson key '${key}'`);
  }
  return parsed;
};

export const applySessionTraceCommand = (
  session: GameplaySession,
  value: TraceValue
): TraceValue | undefined => {
  const command = decodeSessionTraceCommand(value);
  switch (command.kind) {
    case 'press':
      session.press(commandKey(command.key));
      break;
    case 'throttleNotch':
      session.throttleNotchValue(command.notch);
      break;
    case 'shutThrottle':
      session.shutThrottle();
      break;
    case 'leaveCraft':
      if (session.leaveCraft() === undefined) {
        throw new Error('the recorded leaveCraft action was refused');
      }
      break;
    case 'rideLift':
      if (session.rideLift() === undefined) {
        throw new Error('the recorded rideLift action was refused');
      }
      break;
    case 'drop': {
      const outcome = session.drop().outcome;
      return outcome.kind === 'dropped'
        ? { dropped: outcome.slot }
        : outcome.kind;
    }
  }
  return undefined;
};
