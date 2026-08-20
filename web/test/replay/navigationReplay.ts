import type { GameplaySession } from '../../src/session/index.ts';
import { isObject, type TraceValue } from '../../src/trace/index.ts';

export type NavigationTraceCommand =
  | { readonly kind: 'carry'; readonly slots: readonly number[] }
  | { readonly heading: number; readonly kind: 'face'; readonly leg: number };

export const decodeNavigationTraceCommand = (
  value: TraceValue
): NavigationTraceCommand => {
  if (!isObject(value)) {
    throw new Error('a Navigation command must be an object');
  }
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === 'carry') {
    const slots = value['carry'];
    if (!Array.isArray(slots) || slots.length === 0) {
      throw new Error('carry must name at least one object slot');
    }
    const checked: number[] = [];
    for (const slot of slots) {
      if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0) {
        throw new Error('carry object slots must be non-negative integers');
      }
      checked.push(slot);
    }
    return { kind: 'carry', slots: checked };
  }
  if (keys.length === 2 && keys.includes('face') && keys.includes('leg')) {
    const heading = value['face'];
    const leg = value['leg'];
    if (typeof heading !== 'number' || !Number.isFinite(heading)) {
      throw new Error('face must name a finite heading');
    }
    if (typeof leg !== 'number' || !Number.isInteger(leg) || leg < 1) {
      throw new Error('face leg must be a positive integer');
    }
    return { heading, kind: 'face', leg };
  }
  if (keys.some(key => key === 'carry' || key === 'face' || key === 'leg')) {
    throw new Error('a Navigation command must be either carry or face');
  }
  throw new Error(`unknown Navigation command '${keys[0] ?? ''}'`);
};

export const applyNavigationTraceCommand = (
  session: GameplaySession,
  value: TraceValue
): void => {
  const command = decodeNavigationTraceCommand(value);
  if (command.kind === 'carry') {
    for (const slot of command.slots) {
      session.carry(slot);
    }
    return;
  }
  session.place(session.snapshot.player.position, command.heading);
};
