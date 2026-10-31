import type { Location } from '../world/index.ts';
import type { Faction } from './sites.ts';

/// A completed change in play, delivered within its step (ADR 0085).
///
/// Subjects are the session's own numbers here: Room ids, object slots, Site
/// cells and low ids. Whoever tells them on, to Talk Scripts, names them.
export type WorldEvent =
  | { readonly kind: 'entered'; readonly location: Location }
  /// The player came near a Surface Region's building or into it, or went
  /// out of it or away (ADR 0084), on foot or aboard.
  | {
      readonly kind: 'approached' | 'arrived' | 'departed' | 'withdrew';
      readonly region: string;
    }
  /// A loose object came to lie in a Surface Region's building, or stopped:
  /// left there or taken away.
  | {
      readonly kind: 'received' | 'lost';
      readonly object: number;
      readonly region: string;
    }
  /// Boarding, and leaving by any way out, a crash included.
  | { readonly craft: number; readonly kind: 'boarded' | 'left' }
  | { readonly kind: 'took' | 'dropped'; readonly object: number }
  /// A Site destroyed and counted for `faction`, its owner. `site` is its low
  /// id, or 0 for a Site that has none, or has spent it.
  | {
      readonly cell: number;
      readonly faction: Faction;
      readonly kind: 'destroyed';
      /// False when gratitude replaces the Faction Reaction, or it is spent.
      readonly reacting: boolean;
      readonly site: number;
    }
  /// A faction's lead reached the Gratitude Threshold: `faction` is the one
  /// the player has helped.
  | { readonly faction: Faction; readonly kind: 'gratitude' }
  /// The Player Projectile struck an object and put it out of the world.
  | { readonly kind: 'struck'; readonly object: number }
  /// The hostile craft's shot reached the player.
  | { readonly aboard: boolean; readonly kind: 'hit' };

/// What the World Event log compares from one look at the world to the next.
export interface WorldSeen {
  readonly carried: readonly number[];
  readonly craft: number | undefined;
  /// The Surface Regions whose building the player is in.
  readonly inside: readonly string[];
  readonly location: Location;
  /// Each loose object lying in a Surface Region's building, as `[slot,
  /// region]`.
  readonly lying: readonly (readonly [number, string])[];
  /// The Surface Regions the player is near, or in.
  readonly near: readonly string[];
}

const sameLocation = (a: Location, b: Location): boolean =>
  a.kind === 'room' ? b.kind === 'room' && a.id === b.id : b.kind === a.kind;

const without = <T>(
  from: readonly T[],
  these: readonly T[],
  same: (a: T, b: T) => boolean = (a, b) => a === b
): T[] => from.filter(item => !these.some(other => same(item, other)));

const sameLying = (
  a: readonly [number, string],
  b: readonly [number, string]
): boolean => a[0] === b[0] && a[1] === b[1];

/// The changes from one look to the next, in the order a player would tell
/// them: leaving, arriving, boarding, then what changed hands.
export const changesBetween = (
  before: WorldSeen,
  after: WorldSeen
): WorldEvent[] => {
  const events: WorldEvent[] = [];
  if (before.craft !== undefined && before.craft !== after.craft) {
    events.push({ craft: before.craft, kind: 'left' });
  }
  for (const region of without(before.inside, after.inside)) {
    events.push({ kind: 'departed', region });
  }
  for (const region of without(before.near, after.near)) {
    events.push({ kind: 'withdrew', region });
  }
  if (!sameLocation(before.location, after.location)) {
    events.push({ kind: 'entered', location: after.location });
  }
  for (const region of without(after.near, before.near)) {
    events.push({ kind: 'approached', region });
  }
  for (const region of without(after.inside, before.inside)) {
    events.push({ kind: 'arrived', region });
  }
  if (after.craft !== undefined && after.craft !== before.craft) {
    events.push({ craft: after.craft, kind: 'boarded' });
  }
  for (const slot of after.carried) {
    if (!before.carried.includes(slot)) {
      events.push({ kind: 'took', object: slot });
    }
  }
  for (const slot of before.carried) {
    if (!after.carried.includes(slot)) {
      events.push({ kind: 'dropped', object: slot });
    }
  }
  for (const [object, region] of without(
    before.lying,
    after.lying,
    sameLying
  )) {
    events.push({ kind: 'lost', object, region });
  }
  for (const [object, region] of without(
    after.lying,
    before.lying,
    sameLying
  )) {
    events.push({ kind: 'received', object, region });
  }
  return events;
};

/// The World Events of one frame, in the order they happened (#931).
///
/// Owns observation around completed operations. Callers supply the operation,
/// not before/after snapshots or a checkpoint protocol (ADR 0085).
export class WorldEventLog {
  private pending: WorldEvent[] = [];
  private depth = 0;

  private seen: WorldSeen;

  constructor(private readonly observe: () => WorldSeen) {
    this.seen = observe();
  }

  /// One completed operation, including its nested helpers. Separate operations
  /// record separate changes, even when the second undoes the first.
  change<T>(action: () => T): T {
    const outer = this.depth === 0;
    if (outer) {
      this.note(this.observe());
    }
    this.depth++;
    try {
      return action();
    } finally {
      this.depth--;
      if (outer) {
        this.note(this.observe());
      }
    }
  }

  get unsettled(): boolean {
    return (
      this.pending.length > 0 ||
      changesBetween(this.seen, this.observe()).length > 0
    );
  }

  /// An event the session raises itself, such as a Site destroyed.
  raise(event: WorldEvent): void {
    this.pending.push(event);
  }

  /// Records whatever changed since the world was last noted.
  private note(seen: WorldSeen): void {
    this.pending.push(...changesBetween(this.seen, seen));
    this.seen = seen;
  }

  /// Notes the world, then hands over everything recorded since the last take.
  take(): WorldEvent[] {
    this.note(this.observe());
    const events = this.pending;
    this.pending = [];
    return events;
  }

  /// Starts again from a world that is where play resumes, not a change in it.
  resume(): void {
    this.pending = [];
    this.seen = this.observe();
  }
}
