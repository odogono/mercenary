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

/// One step of a journey the player could actually make.
///
/// A Session command is a single instant; a leg is a stretch of play, so these
/// carry the walking and the waiting that get the player from one place to the
/// next. `board` and `teleport` stay refused here for the same reason the gate
/// refuses them: arriving somewhere by being placed there proves nothing about
/// whether the route exists. Boarding is reachable, but only as `reach`, which
/// has to satisfy the same proximity rule play does.
export type SessionScenarioLeg =
  | {
      readonly kind: 'walk';
      readonly running: boolean;
      readonly seconds: number;
      readonly turn: number;
    }
  | { readonly kind: 'wait'; readonly seconds: number }
  | {
      readonly action: 'board' | 'take';
      readonly kind: 'reach';
      readonly slot: number;
    }
  | { readonly command: SessionTraceCommand; readonly kind: 'command' };

const positiveSeconds = (
  operand: TraceValue | undefined,
  name: string
): number => {
  if (
    typeof operand !== 'number' ||
    !(operand > 0) ||
    !Number.isFinite(operand)
  ) {
    throw new Error(`${name} must be a positive number of seconds`);
  }
  return operand;
};

export const decodeSessionScenarioLeg = (
  value: TraceValue
): SessionScenarioLeg => {
  if (!isObject(value)) {
    throw new Error('a Session leg must be an object');
  }
  const object = value as TraceObject;
  const keys = Object.keys(object);
  for (const key of keys) {
    if (FORBIDDEN.has(key)) {
      throw new Error(`a legal route will not ${key}`);
    }
  }
  if (keys.length !== 1) {
    throw new Error('a Session leg must name exactly one step');
  }
  const key = keys[0]!;
  const operand = object[key];
  switch (key) {
    case 'walk': {
      if (!isObject(operand)) {
        throw new Error('walk must describe how long and which way');
      }
      const walk = operand as TraceObject;
      const turn = walk['turn'] ?? 0;
      const running = walk['running'] ?? false;
      if (typeof turn !== 'number' || turn < -1 || turn > 1) {
        throw new Error('walk turn must be between -1 and 1');
      }
      if (typeof running !== 'boolean') {
        throw new Error('walk running must be a boolean');
      }
      return {
        kind: 'walk',
        running,
        seconds: positiveSeconds(walk['seconds'], 'walk'),
        turn
      };
    }
    case 'wait':
      return { kind: 'wait', seconds: positiveSeconds(operand, 'wait') };
    case 'reach': {
      if (!isObject(operand)) {
        throw new Error('reach must name a slot and an action');
      }
      const reach = operand as TraceObject;
      const slot = reach['slot'];
      const action = reach['action'];
      if (!Number.isInteger(slot) || typeof slot !== 'number' || slot < 0) {
        throw new Error('reach must name an object slot');
      }
      if (action !== 'take' && action !== 'board') {
        throw new Error("reach action must be 'take' or 'board'");
      }
      return { action, kind: 'reach', slot };
    }
    default:
      return { command: decodeSessionTraceCommand(value), kind: 'command' };
  }
};

export const decodeSessionScenarioLegs = (
  value: TraceValue
): SessionScenarioLeg[] => {
  if (!Array.isArray(value)) {
    throw new Error('a legal route must be a list of legs');
  }
  return value.map(leg => decodeSessionScenarioLeg(leg));
};

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
