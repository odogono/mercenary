import type { Location } from '../world/index.ts';

/// The World Port (ADR 0083): what a Talk Script may ask of the world and do
/// to it, as named operations on the Gameplay Session's own state. Subjects
/// are the session's numbers — object slots, Locations, Site cells — and the
/// Talk host names them through `names.ts`.
///
/// Each operation checks its own subject and throws on one the world doesn't
/// have, so a Talk Script's mistake fails the Run that made it.
export interface WorldPort {
  arm(slot: number): void;
  /// Whether taking or boarding the object starts its Talk.
  armed(slot: number): boolean;
  /// The craft the player is in, by slot, or undefined on foot.
  boarded(): number | undefined;
  carries(slot: number): boolean;
  credits(): number;
  /// Whether the Site at a cell has been destroyed.
  destroyed(cell: number): boolean;
  /// Takes the object's Talk away, as the Dart's sale does at first boarding.
  disarm(slot: number): void;
  /// Accepts the Escape: the Ending begins.
  escape(): void;
  /// Fixes the object where it lies.
  fix(slot: number): void;
  /// Whether the object is fixed where it lies.
  fixed(slot: number): boolean;
  /// Where the player is.
  here(): Location;
  /// Where a loose object lies, or undefined while it is carried or gone.
  lies(slot: number): Location | undefined;
  /// Puts a loose object at a Location. A carried object can't be moved.
  move(slot: number, to: Location): void;
  pay(amount: number): void;
  /// The next byte of the world's random stream.
  random(): number;
  /// The Surface Regions a loose object lies in (ADR 0084), none while it is
  /// carried, in a Room or gone. The Talk host asks, to tell each region
  /// what was left in it.
  regionsHolding(slot: number): readonly string[];
  sendAttacker(): void;
  /// Starts the Ship Delivery.
  sendShip(): void;
  spend(amount: number): void;
}
