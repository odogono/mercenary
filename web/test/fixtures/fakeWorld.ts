import type { WorldPort } from '../../src/talk/worldPort.ts';
import { SURFACE, type Location } from '../../src/world/index.ts';

/// An in-memory World Port: the second adapter beside the Gameplay Session,
/// so a Talk Script's dealings with the world can be tested without one.
export class FakeWorld implements WorldPort {
  armedSlots = new Set<number>();
  attackerSent = false;
  balance = 0;
  carried = new Set<number>();
  craft: number | undefined;
  destroyedCells = new Set<number>();
  escaped = false;
  fixed = new Set<number>();
  location: Location = SURFACE;
  readonly places = new Map<number, Location>();
  /// Each loose object's Surface Region, by slot.
  readonly regions = new Map<number, string>();
  shipSent = false;

  boarded(): number | undefined {
    return this.craft;
  }
  carries(slot: number): boolean {
    return this.carried.has(slot);
  }
  here(): Location {
    return this.location;
  }
  lies(slot: number): Location | undefined {
    return this.carried.has(slot) ? undefined : this.places.get(slot);
  }
  move(slot: number, to: Location): void {
    if (this.carried.has(slot)) {
      throw new Error('cannot move a carried object');
    }
    this.places.set(slot, to);
  }
  armed(slot: number): boolean {
    return this.armedSlots.has(slot);
  }
  arm(slot: number): void {
    this.armedSlots.add(slot);
  }
  disarm(slot: number): void {
    this.armedSlots.delete(slot);
  }
  fix(slot: number): void {
    this.fixed.add(slot);
  }
  destroyed(cell: number): boolean {
    return this.destroyedCells.has(cell);
  }
  credits(): number {
    return this.balance;
  }
  pay(amount: number): void {
    this.balance += amount;
  }
  spend(amount: number): void {
    this.balance -= amount;
  }
  escape(): void {
    this.escaped = true;
  }
  random(): number {
    return 0;
  }
  sendAttacker(): void {
    this.attackerSent = true;
  }
  sendShip(): void {
    this.shipSent = true;
  }
  within(slot: number, region: string): boolean {
    return !this.carried.has(slot) && this.regions.get(slot) === region;
  }
}
