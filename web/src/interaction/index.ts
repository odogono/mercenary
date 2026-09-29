import { BensonHostState } from '../benson/host.ts';
import type { Vector3 } from '../orientation/index.ts';
import type {
  EndgameTakeOverrides,
  InteractionDocument
} from '../payload/documents.ts';

/// The room a craft belongs to when it is standing on the surface.
export const SURFACE_ROOM = 0;

/// An object that is no longer in the world, because the player took it or climbed into it.
export const OUT_OF_THE_WORLD = BensonHostState.outOfTheWorld;

export type InteractionAction = 'take' | 'board';

/// The Damocles keypad's four commands: the ST's Enter, `*`, `+` and `-` (`$04D3D2`). Open acts on
/// the Carried Stack's head; the other three act on whatever the head opened
/// (docs/research/damocles-head-commands.md).
export type HeadCommand = 'open' | 'read' | 'next' | 'previous';

export interface Candidate {
  readonly position: Vector3;
  readonly slot: number;
}

export type Outcome =
  | { readonly kind: 'took'; readonly slot: number }
  | { readonly kind: 'boarded'; readonly slot: number }
  | { readonly kind: 'nothingInReach' }
  | { readonly kind: 'fixedInPlace'; readonly slot: number }
  | { readonly kind: 'tooHeavy'; readonly slot: number }
  | { readonly kind: 'handsFull' }
  | { readonly kind: 'notACraft'; readonly slot: number }
  | { readonly kind: 'alreadyAboard' };

export type Description =
  | { readonly kind: 'none' }
  | { readonly index: number; readonly kind: 'message' }
  | { readonly id: number; readonly kind: 'script' };

/// Reaching for the world: what the player may take or board, and what happens.
export class Interaction {
  readonly boardKey: number;
  readonly boardRange: number;
  readonly carriedMask: number;
  readonly craftSlotBound: number;
  readonly descriptionMask: number;
  readonly fixedMask: number;
  readonly heavyMask: number;
  readonly inventoryLimit: number;
  readonly rangeUnit: number;
  readonly takeKey: number;
  readonly takeRange: number;
  readonly tooHeavyMessage: number;
  private readonly takeOverrides: EndgameTakeOverrides | undefined;

  constructor(
    document: InteractionDocument,
    takeOverrides?: EndgameTakeOverrides
  ) {
    this.takeKey = document.takeKey;
    this.boardKey = document.boardKey;
    this.takeRange = document.takeRange;
    this.boardRange = document.boardRange;
    this.rangeUnit = document.rangeUnit;
    this.craftSlotBound = document.craftSlotBound;
    this.inventoryLimit = document.inventoryLimit;
    this.fixedMask = document.fixedMask & 0xff;
    this.heavyMask = document.heavyMask & 0xff;
    this.carriedMask = document.carriedMask & 0xff;
    this.descriptionMask = document.descriptionMask & 0xff;
    this.tooHeavyMessage = document.tooHeavyMessage;
    this.takeOverrides = takeOverrides;
  }

  /// Whether an object is within reach on every axis. Reach is a cube whose edge is a
  /// whole number of range units rather than a smooth distance.
  isWithinReach(candidate: Candidate, player: Vector3, range: number): boolean {
    const limit = range * this.rangeUnit + (this.rangeUnit - 1);
    const dx = Math.abs(candidate.position.x - player.x);
    const dy = Math.abs(candidate.position.y - player.y);
    const dz = Math.abs(candidate.position.z - player.z);
    return dx <= limit && dy <= limit && dz <= limit;
  }

  isCraft(slot: number): boolean {
    return slot < this.craftSlotBound;
  }

  nearest(
    candidates: readonly Candidate[],
    player: Vector3,
    range: number
  ): Candidate | undefined {
    const inReach = candidates.filter(candidate =>
      this.isWithinReach(candidate, player, range)
    );
    if (inReach.length === 0) {
      return undefined;
    }
    return inReach.reduce((first, second) =>
      distanceSquared(first.position, player) <
      distanceSquared(second.position, player)
        ? first
        : second
    );
  }

  attempt(
    action: InteractionAction,
    player: Vector3,
    candidates: readonly Candidate[],
    host: BensonHostState
  ): { readonly host: BensonHostState; readonly outcome: Outcome } {
    if (action === 'take') {
      const candidate = this.nearest(candidates, player, this.takeRange);
      if (candidate === undefined) {
        return { host, outcome: { kind: 'nothingInReach' } };
      }
      const flags = host.objectFlags.get(candidate.slot) ?? 0;
      const carriesSink =
        this.takeOverrides !== undefined &&
        host.inventory.has(this.takeOverrides.sinkSlot);
      const carriesAntigrav =
        this.takeOverrides !== undefined &&
        host.inventory.has(this.takeOverrides.antigravSlot);
      if (
        !host.canTakeAnything &&
        !carriesSink &&
        (flags & this.fixedMask) !== 0
      ) {
        return {
          host,
          outcome: { kind: 'fixedInPlace', slot: candidate.slot }
        };
      }
      if (
        !host.canLiftAnything &&
        !carriesSink &&
        !carriesAntigrav &&
        (flags & this.heavyMask) !== 0
      ) {
        return { host, outcome: { kind: 'tooHeavy', slot: candidate.slot } };
      }
      if (host.inventory.size >= this.inventoryLimit) {
        return { host, outcome: { kind: 'handsFull' } };
      }
      const inventory = new Set(host.inventory);
      inventory.add(candidate.slot);
      return {
        host: host
          .with({ inventory })
          .withObjectFlag(candidate.slot, flags | this.carriedMask)
          .withObjectRoom(candidate.slot, BensonHostState.outOfTheWorld),
        outcome: { kind: 'took', slot: candidate.slot }
      };
    }

    if (host.boardedCraft !== BensonHostState.onFoot) {
      return { host, outcome: { kind: 'alreadyAboard' } };
    }
    const candidate = this.nearest(candidates, player, this.boardRange);
    if (candidate === undefined) {
      return { host, outcome: { kind: 'nothingInReach' } };
    }
    if (!this.isCraft(candidate.slot)) {
      return { host, outcome: { kind: 'notACraft', slot: candidate.slot } };
    }
    return {
      host: host
        .with({ boardedCraft: candidate.slot })
        .withObjectRoom(candidate.slot, BensonHostState.outOfTheWorld),
      outcome: { kind: 'boarded', slot: candidate.slot }
    };
  }

  leave(host: BensonHostState): {
    readonly host: BensonHostState;
    readonly slot: number | undefined;
  } {
    const slot = host.boardedCraft;
    if (slot === BensonHostState.onFoot) {
      return { host, slot: undefined };
    }
    return {
      // The craft is left where the player stands, which underground is the
      // current Room rather than the surface — the occupancy-preserving
      // recovery route depends on a craft left in room 5 staying there.
      host: host
        .with({ boardedCraft: BensonHostState.onFoot })
        .withObjectRoom(slot, host.currentRoom),
      slot
    };
  }

  description(slot: number, flags: number): Description {
    const selector = flags & this.descriptionMask;
    if (selector === 0) {
      return { kind: 'none' };
    }
    return selector >> 3 === 0
      ? { id: slot, kind: 'script' }
      : { index: slot, kind: 'message' };
  }
}

const distanceSquared = (a: Vector3, b: Vector3): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};
