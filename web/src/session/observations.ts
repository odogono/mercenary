import { BensonHostState } from '../benson/host.ts';
import type { BensonSession } from '../benson/session.ts';
import { hostRoom, type Location, type Residence } from '../world/index.ts';
import type { Occupancy } from './index.ts';

/// The version the lab's observation maps are decoded against
/// (`c64lab/semantics.py`). The two sides only line up while these agree.
export const SEMANTIC_OBSERVATION_SCHEMA_VERSION = 1;

/// Everything a semantic observation can be. Deliberately the lab's domain and
/// no wider: it decodes bytes into exactly these three.
export type ObservationValue = boolean | number | string;

/// One flat, comparable description of a Gameplay Session's Game Semantics.
///
/// This is the browser's half of a lab/browser comparison, not a second
/// Session Snapshot: a Session Snapshot exists to be drawn from and carries
/// presentation shapes, while these are scalars an emulator can be read for.
/// Anything here is already owned elsewhere in the session — nothing computes
/// a new fact, and observing never mutates.
export interface SemanticObservations {
  readonly observations: Readonly<Record<string, ObservationValue>>;
  readonly schemaVersion: number;
}

export interface ObservationSources {
  readonly carriedStack: readonly number[];
  readonly location: Location;
  readonly objectFlags: ReadonlyMap<number, number>;
  readonly occupancy: Occupancy;
  readonly residence: ReadonlyMap<number, Residence>;
  readonly scripts: BensonSession | undefined;
}

const NO_SCRIPT_PC = -1;

/// Slots ascend so two runs of the same moment serialise identically.
const bySlot = (slots: Iterable<number>): number[] =>
  [...slots].sort((a, b) => a - b);

export const observationsOf = (
  sources: ObservationSources
): SemanticObservations => {
  const host = sources.scripts?.host;
  const state = sources.scripts?.state;
  const observations: Record<string, ObservationValue> = {
    attackingShip: host?.attackingShip ?? false,
    carriedStack: sources.carriedStack.join(','),
    credits: sources.scripts?.credits ?? 0,
    engineFlags: host?.engineFlags ?? 0,
    gameComplete: host?.gameComplete ?? false,
    messagePlaying: host?.messagePlaying ?? false,
    messageText: sources.scripts?.messageText ?? '',
    occupancy:
      sources.occupancy.kind === 'onFoot'
        ? BensonHostState.onFoot
        : sources.occupancy.slot,
    room: sources.location.kind === 'room' ? sources.location.id : 0,
    scriptPc: state?.pc ?? NO_SCRIPT_PC,
    scriptStack: (state?.callStack ?? []).join(','),
    shipInbound: host?.shipInbound ?? 0
  };
  for (const slot of bySlot(sources.residence.keys())) {
    const residence = sources.residence.get(slot)!;
    observations[`objectRoom.${slot}`] = hostRoom(residence);
    observations[`objectFlags.${slot}`] = sources.objectFlags.get(slot) ?? 0;
  }
  return {
    observations,
    schemaVersion: SEMANTIC_OBSERVATION_SCHEMA_VERSION
  };
};
