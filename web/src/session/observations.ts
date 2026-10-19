import type { BensonPort } from '../benson/channel.ts';
import { BensonHostState } from '../benson/host.ts';
import type { Vector3 } from '../orientation/index.ts';
import { hostRoom, type Location, type Residence } from '../world/index.ts';
import type { Occupancy } from './index.ts';

/// The version the lab's observation maps are decoded against
/// (`c64lab/semantics.py`). The two sides only line up while these agree.
export const SEMANTIC_OBSERVATION_SCHEMA_VERSION = 2;

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

/// What a session at war can be asked for. Absent while a session owns no
/// combat state at all, which reads the same as a session that has not fought.
export interface CombatObservationSources {
  /// Cells whose destroyed bit is set, in any order.
  readonly destroyedCells: Iterable<number>;
  /// Frames left on each occupied Effect Slot, keyed by slot.
  readonly effectLifecycles: ReadonlyMap<number, number>;
  readonly mechanoidDestroyed: number;
  /// The Craft Parameter Block installed over the occupied craft's own, if any.
  readonly mover: number | undefined;
  readonly palyarDestroyed: number;
}

export interface ObservationSources {
  readonly carriedStack: readonly number[];
  /// The special transition flag the Reference Build keeps at `$FA`: `$FF` on
  /// the Colony Craft, zero otherwise.
  readonly colonyCraftFlag: number;
  readonly combat?: CombatObservationSources;
  readonly location: Location;
  readonly objectFlags: ReadonlyMap<number, number>;
  readonly occupancy: Occupancy;
  /// The player's full position, for the Colony Craft comparisons that need real
  /// coordinates rather than a Room id. Truncated on the way out, since the
  /// emulator's three-byte fields hold integers.
  readonly position: Vector3;
  readonly residence: ReadonlyMap<number, Residence>;
  readonly scripts: BensonPort | undefined;
}

const NO_SCRIPT_PC = -1;

/// No installed mover reads as an absence rather than block zero, which is a
/// real block a craft can fly on.
const NO_MOVER = -1;

/// The two Effect Slots a comparison can turn on: the player's shot and the
/// hostile shot aimed back. The other slots in the table are not lifecycles a
/// run's outcome turns on.
const OBSERVED_EFFECT_SLOTS = [8, 14] as const;

/// Cells ascend, and each is two lower-case hex digits, so two runs of the same
/// moment serialise identically on both sides of a comparison.
const asCellList = (cells: Iterable<number>): string =>
  [...cells]
    .sort((a, b) => a - b)
    .map(cell => cell.toString(16).padStart(2, '0'))
    .join(',');

/// Slots ascend so two runs of the same moment serialise identically.
const bySlot = (slots: Iterable<number>): number[] =>
  [...slots].sort((a, b) => a - b);

export const observationsOf = (
  sources: ObservationSources
): SemanticObservations => {
  const host = sources.scripts?.host;
  const state = sources.scripts?.reference?.state;
  const observations: Record<string, ObservationValue> = {
    attackingShip: host?.attackingShip ?? false,
    carriedStack: sources.carriedStack.join(','),
    colonyCraftFlag: sources.colonyCraftFlag,
    credits: sources.scripts?.credits ?? 0,
    destroyedCells: asCellList(sources.combat?.destroyedCells ?? []),
    endingPhase: host?.endingPhase ?? 0,
    engineFlags: host?.engineFlags ?? 0,
    mechanoidDestroyed: sources.combat?.mechanoidDestroyed ?? 0,
    messagePlaying: host?.messagePlaying ?? false,
    messageText: sources.scripts?.messageText ?? '',
    mover: sources.combat?.mover ?? NO_MOVER,
    occupancy:
      sources.occupancy.kind === 'onFoot'
        ? BensonHostState.onFoot
        : sources.occupancy.slot,
    palyarDestroyed: sources.combat?.palyarDestroyed ?? 0,
    playerX: Math.trunc(sources.position.x),
    playerY: Math.trunc(sources.position.y),
    playerZ: Math.trunc(sources.position.z),
    room: sources.location.kind === 'room' ? sources.location.id : 0,
    scriptPc: state?.pc ?? NO_SCRIPT_PC,
    scriptStack: (state?.callStack ?? []).join(','),
    shipInbound: host?.shipInbound ?? 0
  };
  for (const slot of OBSERVED_EFFECT_SLOTS) {
    observations[`effectLifecycle${slot}`] =
      sources.combat?.effectLifecycles.get(slot) ?? 0;
  }
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
