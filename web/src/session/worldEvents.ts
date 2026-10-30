import type { Location } from '../world/index.ts';
import type { Faction } from './sites.ts';

/// A change in play the Gameplay Session tells after each frame (ADR 0080).
///
/// Subjects are the session's own numbers here: Room ids, object slots, Site
/// cells and low ids. Whoever tells them on, to Talk Scripts, names them.
export type WorldEvent =
  | { readonly kind: 'entered'; readonly location: Location }
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
  readonly location: Location;
}

const sameLocation = (a: Location, b: Location): boolean =>
  a.kind === 'room' ? b.kind === 'room' && a.id === b.id : b.kind === a.kind;

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
  if (!sameLocation(before.location, after.location)) {
    events.push({ kind: 'entered', location: after.location });
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
  return events;
};

/// The World Events of one frame, in the order they happened (#931).
///
/// The session notes the world before each operation that can change it and
/// after each slice of simulation, so a change made and undone within one
/// frame (leaving a craft and boarding it again, passing through a Room) is
/// told rather than lost to a comparison of where the frame began and ended.
export class WorldEventLog {
  private pending: WorldEvent[] = [];

  constructor(private seen: WorldSeen) {}

  /// An event the session raises itself, such as a Site destroyed.
  raise(event: WorldEvent): void {
    this.pending.push(event);
  }

  /// Records whatever changed since the world was last noted.
  note(seen: WorldSeen): void {
    this.pending.push(...changesBetween(this.seen, seen));
    this.seen = seen;
  }

  /// Notes the world, then hands over everything recorded since the last take.
  take(seen: WorldSeen): WorldEvent[] {
    this.note(seen);
    const events = this.pending;
    this.pending = [];
    return events;
  }

  /// Starts again from a world that is where play resumes, not a change in it.
  resume(seen: WorldSeen): void {
    this.pending = [];
    this.seen = seen;
  }
}
