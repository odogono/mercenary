import type { GameplaySession } from '../../src/session/index.ts';
import {
  isObject,
  type Trace,
  type TraceObject,
  type TraceValue
} from '../../src/trace/index.ts';
import {
  gameplaySessionGate,
  type GameplaySessionGateContext,
  type GameplaySessionTraceSet
} from './gameplaySessionGate.ts';
import { applyNavigationTraceCommand } from './navigationReplay.ts';

const nonNegativeInteger = (
  value: TraceValue | undefined,
  name: string
): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `a Navigation scenario ${name} must be a non-negative integer`
    );
  }
  return value;
};

const coordinate = (at: TraceObject, axis: 'x' | 'z'): number => {
  const value = at[axis];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`a Navigation scenario ${axis} coordinate must be finite`);
  }
  return value;
};

export const navigationSession = (
  context: GameplaySessionGateContext,
  trace: Trace
): GameplaySession => {
  const scenario = trace.header['scenario'];
  if (!isObject(scenario)) {
    throw new Error('a Navigation trace must carry a scenario');
  }
  const roomId = nonNegativeInteger(scenario['room'], 'room');
  const room = context.world.rooms.get(roomId);
  if (room === undefined) {
    throw new Error(`a Navigation scenario names missing Room ${roomId}`);
  }
  const recordedSeed = scenario['seed'];
  let randomSeed: bigint | undefined;
  if (recordedSeed !== null && recordedSeed !== undefined) {
    if (
      typeof recordedSeed !== 'number' ||
      !Number.isSafeInteger(recordedSeed)
    ) {
      throw new Error('a Navigation scenario seed must be a safe integer');
    }
    randomSeed = BigInt(recordedSeed);
  }
  const session = context.createSession(
    randomSeed === undefined ? undefined : { randomSeed }
  );
  session.teleport({ id: roomId, kind: 'room' });

  const middle = {
    x: (room.bounds.min.x + room.bounds.max.x) / 2,
    z: (room.bounds.min.z + room.bounds.max.z) / 2
  };
  const recordedAt = scenario['at'];
  if (recordedAt !== undefined && !isObject(recordedAt)) {
    throw new Error('a Navigation scenario position must be an object');
  }
  session.place({
    x: recordedAt === undefined ? middle.x : coordinate(recordedAt, 'x'),
    y: session.snapshot.player.position.y,
    z: recordedAt === undefined ? middle.z : coordinate(recordedAt, 'z')
  });

  const carrying = scenario['carrying'];
  if (!Array.isArray(carrying)) {
    throw new Error('a Navigation scenario carrying field must be an array');
  }
  for (const slot of carrying) {
    session.carry(nonNegativeInteger(slot, 'carried object slot'));
  }
  return session;
};

export const navigationGate = (gate: GameplaySessionTraceSet): Promise<void> =>
  gameplaySessionGate({
    ...gate,
    applyCommand: applyNavigationTraceCommand,
    createSession: navigationSession,
    emitter: 'navigation'
  });
