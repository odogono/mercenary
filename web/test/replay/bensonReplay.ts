import {
  BensonHostState,
  BensonSession,
  parseBensonKey,
  type BensonEffect,
  type BensonKey,
  type BensonObserver,
  type BensonProgram,
  type BensonStep,
  type BensonTunables,
  type Instruction
} from '../../src/benson/index.ts';
import type { TextTable } from '../../src/text/index.ts';
import {
  changes,
  type TraceObject,
  type TraceValue
} from '../../src/trace/index.ts';

/// Reconstruct the interpreter snapshot a benson Golden Trace records.
export const sessionSnapshot = (session: BensonSession): TraceValue => ({
  host: hostValue(session.host),
  isMessageComplete: session.isMessageComplete,
  isRunning: session.isRunning,
  message: session.messageText,
  state: {
    callStack: session.state.callStack.slice(),
    pc: session.state.pc ?? null,
    randomState: session.state.randomState.toString(),
    registers: session.state.registers.slice(),
    resumeAfterTick: session.state.resumeAfterTick ?? null
  }
});

const sortedSlots = (map: ReadonlyMap<number, number>): TraceObject => {
  const out: TraceObject = {};
  for (const slot of [...map.keys()].sort((a, b) => a - b)) {
    out[String(slot)] = map.get(slot)!;
  }
  return out;
};

const hostValue = (host: BensonHostState): TraceObject => ({
  attackingShip: host.attackingShip,
  boardedCraft: host.boardedCraft,
  canLiftAnything: host.canLiftAnything,
  canTakeAnything: host.canTakeAnything,
  currentRoom: host.currentRoom,
  decimals: host.decimals.slice(),
  destroyedBlocks: [...host.destroyedBlocks].sort((a, b) => a - b),
  engineFlags: host.engineFlags,
  gameComplete: host.gameComplete,
  inventory: [...host.inventory].sort((a, b) => a - b),
  messageInterval: host.messageInterval,
  messagePlaying: host.messagePlaying,
  objectFlags: sortedSlots(host.objectFlags),
  objectRooms: sortedSlots(host.objectRooms),
  pendingKey: host.pendingKey ?? null,
  shipInbound: host.shipInbound,
  signedRegister: host.signedRegister,
  tickCounter: host.tickCounter
});

export const effectValue = (effect: BensonEffect): TraceValue => {
  if (effect === 'keyAcknowledged' || effect === 'scriptFinished') {
    return effect;
  }
  if ('playMessage' in effect) {
    return { playMessage: effect.playMessage };
  }
  if ('cityLocationChanged' in effect) {
    return { cityLocationChanged: effect.cityLocationChanged };
  }
  return { sound: { symbol: effect.sound.symbol, value: effect.sound.value } };
};

export const instructionValue = (instruction: Instruction): TraceValue =>
  instruction as unknown as TraceValue;

const keyFromScenario = (name: string | null): BensonKey | undefined => {
  if (name === null || name === 'any') {
    return undefined;
  }
  return parseBensonKey(name) ?? parseBensonKey(`key${name.toUpperCase()}`);
};

export interface HostPatch {
  readonly carrying?: readonly number[] | null;
  readonly craft?: number | null;
  readonly objectFlags?: Readonly<Record<string, number>> | null;
  readonly objectRooms?: Readonly<Record<string, number>> | null;
  readonly room?: number | null;
}

const parseSlotKey = (key: string, field: string): number => {
  const slot = Number.parseInt(key, 10);
  if (!Number.isInteger(slot) || String(slot) !== key) {
    throw new Error(
      `${field} is keyed by object slot, and '${key}' is not a slot number`
    );
  }
  return slot;
};

export const applyHost = (
  host: BensonHostState,
  patch: HostPatch,
  initial: boolean
): BensonHostState => {
  let next = host;
  if (patch.room !== undefined && patch.room !== null) {
    next = next.with({ currentRoom: patch.room });
  }
  if (initial) {
    next = next.with({ boardedCraft: patch.craft ?? BensonHostState.onFoot });
  } else if (patch.craft !== undefined && patch.craft !== null) {
    next = next.with({ boardedCraft: patch.craft });
  }
  if (patch.carrying !== undefined && patch.carrying !== null) {
    next = next.with({ inventory: new Set(patch.carrying) });
  }
  if (patch.objectRooms !== undefined && patch.objectRooms !== null) {
    const objectRooms = new Map(next.objectRooms);
    for (const [key, room] of Object.entries(patch.objectRooms)) {
      objectRooms.set(parseSlotKey(key, 'objectRooms'), room);
    }
    next = next.with({ objectRooms });
  }
  if (patch.objectFlags !== undefined && patch.objectFlags !== null) {
    const objectFlags = new Map(next.objectFlags);
    for (const [key, flags] of Object.entries(patch.objectFlags)) {
      const slot = parseSlotKey(key, 'objectFlags');
      if (!Number.isInteger(flags) || flags < 0 || flags > 255) {
        throw new Error(
          `object ${slot}'s flags are one byte, and ${flags} does not fit in one`
        );
      }
      objectFlags.set(slot, flags);
    }
    next = next.with({ objectFlags });
  }
  return next;
};

export interface BensonScenario {
  readonly host: HostPatch;
  readonly maxInstructions: number;
  readonly presses: readonly {
    readonly at: number;
    readonly key: string | null;
  }[];
  readonly script: number;
  readonly seconds: number;
  readonly timeScale: number | null;
  readonly writes: readonly (HostPatch & { readonly at: number })[];
}

export const scenarioFromHeader = (header: TraceObject): BensonScenario => {
  const body = header['scenario'] as TraceObject;
  const host = (body['host'] as TraceObject) ?? {};
  const presses = ((body['presses'] as TraceValue[]) ?? []) as TraceObject[];
  const writes = ((body['writes'] as TraceValue[]) ?? []) as TraceObject[];
  return {
    host: {
      carrying: (host['carrying'] as number[]) ?? [],
      craft: (host['craft'] as number | null) ?? null,
      objectFlags: (host['objectFlags'] as Record<string, number>) ?? {},
      objectRooms: (host['objectRooms'] as Record<string, number>) ?? {},
      room: (host['room'] as number | null) ?? 0
    },
    maxInstructions: (body['maxInstructions'] as number) ?? 20_000,
    presses: presses.map(press => ({
      at: press['at'] as number,
      key: (press['key'] as string | null) ?? null
    })),
    script: body['script'] as number,
    seconds: body['seconds'] as number,
    timeScale: (body['timeScale'] as number | null) ?? null,
    writes: writes.map(write => ({
      at: write['at'] as number,
      carrying: (write['carrying'] as number[] | undefined) ?? null,
      craft: (write['craft'] as number | undefined) ?? null,
      objectFlags:
        (write['objectFlags'] as Record<string, number> | undefined) ?? null,
      objectRooms:
        (write['objectRooms'] as Record<string, number> | undefined) ?? null,
      room: (write['room'] as number | undefined) ?? null
    }))
  };
};

const writeValue = (
  write: HostPatch & { readonly at: number }
): TraceObject => {
  const members: TraceObject = { at: write.at };
  if (write.room !== undefined && write.room !== null) {
    members['room'] = write.room;
  }
  if (write.craft !== undefined && write.craft !== null) {
    members['craft'] = write.craft;
  }
  if (write.carrying !== undefined && write.carrying !== null) {
    members['carrying'] = [...write.carrying].sort((a, b) => a - b);
  }
  if (write.objectRooms !== undefined && write.objectRooms !== null) {
    members['objectRooms'] = { ...write.objectRooms };
  }
  if (write.objectFlags !== undefined && write.objectFlags !== null) {
    members['objectFlags'] = { ...write.objectFlags };
  }
  return members;
};

/// Drive a session the way `ScriptTrace` does, producing the same record mix.
export const emitRecords = (
  session: BensonSession,
  scenario: BensonScenario,
  dt: number
): TraceObject[] => {
  const records: TraceObject[] = [];
  let elapsed = 0;
  let stepIndex = 0;
  let instructions = 0;
  let previous = sessionSnapshot(session);
  const presses = [...scenario.presses].sort((a, b) => a.at - b.at);
  const writes = [...scenario.writes].sort((a, b) => a.at - b.at);
  let pressAt = 0;
  let writeAt = 0;

  while (elapsed < scenario.seconds) {
    if (instructions >= scenario.maxInstructions) {
      records.push({
        elapsed,
        step: stepIndex,
        stopped: {
          instructions,
          limit: scenario.maxInstructions,
          reason: 'instructionLimit',
          secondsRequested: scenario.seconds,
          stillRunning: session.isRunning
        }
      });
      return records;
    }

    while (pressAt < presses.length && presses[pressAt]!.at <= elapsed) {
      const press = presses[pressAt]!;
      pressAt += 1;
      const key = keyFromScenario(press.key);
      session.press(key);
      records.push({
        elapsed,
        input: { press: key ?? 'any' },
        step: stepIndex
      });
    }
    while (writeAt < writes.length && writes[writeAt]!.at <= elapsed) {
      const write = writes[writeAt]!;
      writeAt += 1;
      session.host = applyHost(session.host, write, false);
      records.push({
        elapsed,
        input: { hostWrite: writeValue(write) },
        step: stepIndex
      });
    }

    const executed: BensonStep[] = [];
    const observer: BensonObserver = step => {
      executed.push(step);
    };
    session.advance(dt, observer);
    instructions += executed.length;
    for (const instruction of executed) {
      records.push({
        blocked: instruction.blocked,
        effects: instruction.effects.map(effectValue),
        elapsed,
        instruction: instructionValue(instruction.instruction),
        nextPc: instruction.stateAfter.pc ?? null,
        pc: instruction.pc,
        step: stepIndex
      });
    }

    const now = sessionSnapshot(session);
    const delta = changes(previous, now);
    if (delta !== undefined) {
      records.push({
        changed: delta,
        elapsed,
        step: stepIndex
      });
      previous = now;
    }

    elapsed += dt;
    stepIndex += 1;
    if (!session.isRunning) {
      break;
    }
  }

  records.push({
    elapsed,
    finished: {
      credits: session.credits,
      stillRunning: session.isRunning
    },
    step: stepIndex
  });
  return records;
};

export const prepareSession = (
  program: BensonProgram,
  text: TextTable,
  tunables: BensonTunables,
  scenario: BensonScenario
): BensonSession => {
  const session = new BensonSession(program, text, tunables);
  session.host = applyHost(session.host, scenario.host, true);
  if (!session.start(scenario.script)) {
    throw new Error(`script ${scenario.script} would not start`);
  }
  return session;
};
