import {
  bensonKeyCode,
  type BensonKey,
  type BensonProgram,
  type BensonSymbol
} from './program.ts';

/// Something a Benson Script asks the host to do, which is not just a change to host state.
export type BensonEffect =
  | { readonly playMessage: string }
  | 'keyAcknowledged'
  | { readonly sound: { readonly symbol: string; readonly value: number } }
  | { readonly cityLocationChanged: number }
  | 'scriptFinished';

const DECIMAL_SCALES = [1_000_000, 10_000, 100, 1] as const;

/// The engine state a Benson Script is allowed to see — the complete Host Callout surface.
export class BensonHostState {
  /// On foot. Slot 0 is a real ship, so this is a sentinel rather than zero.
  static readonly onFoot = 0x80;
  static readonly outOfTheWorld = 0xff;
  static readonly inputDetected = 0x80;
  static readonly scriptRunning = 0x40;
  static readonly decimalCount = 16;
  static readonly firstNumberDecimal = 8;
  static readonly decimalLimit = 100_000_000;
  static readonly defaultMessageInterval = 125;

  attackingShip: boolean;
  boardedCraft: number;
  canLiftAnything: boolean;
  canTakeAnything: boolean;
  currentRoom: number;
  decimals: number[];
  destroyedBlocks: Set<number>;
  engineFlags: number;
  gameComplete: boolean;
  inventory: Set<number>;
  messageInterval: number;
  messagePlaying: boolean;
  objectFlags: Map<number, number>;
  objectRooms: Map<number, number>;
  pendingKey: BensonKey | undefined;
  shipInbound: number;
  signedRegister: number;
  tickCounter: number;

  constructor() {
    this.engineFlags = 0;
    this.messagePlaying = false;
    this.pendingKey = undefined;
    this.tickCounter = 0;
    this.messageInterval = BensonHostState.defaultMessageInterval;
    this.currentRoom = 0;
    this.boardedCraft = BensonHostState.onFoot;
    this.decimals = Array.from(
      { length: BensonHostState.decimalCount },
      () => 0
    );
    this.objectRooms = new Map();
    this.objectFlags = new Map();
    this.inventory = new Set();
    this.destroyedBlocks = new Set();
    this.canLiftAnything = false;
    this.canTakeAnything = false;
    this.attackingShip = false;
    this.gameComplete = false;
    this.shipInbound = 0;
    this.signedRegister = 0;
  }

  static seeding(program: BensonProgram): BensonHostState {
    const host = new BensonHostState();
    for (const [slot, value] of Object.entries(program.decimalSeeds)) {
      const index = Number(slot);
      if (index >= 0 && index < host.decimals.length) {
        host.decimals[index] = value;
      }
    }
    return host;
  }

  clone(): BensonHostState {
    const copy = new BensonHostState();
    copy.engineFlags = this.engineFlags;
    copy.messagePlaying = this.messagePlaying;
    copy.pendingKey = this.pendingKey;
    copy.tickCounter = this.tickCounter;
    copy.messageInterval = this.messageInterval;
    copy.currentRoom = this.currentRoom;
    copy.boardedCraft = this.boardedCraft;
    copy.decimals = this.decimals.slice();
    copy.objectRooms = new Map(this.objectRooms);
    copy.objectFlags = new Map(this.objectFlags);
    copy.inventory = new Set(this.inventory);
    copy.destroyedBlocks = new Set(this.destroyedBlocks);
    copy.canLiftAnything = this.canLiftAnything;
    copy.canTakeAnything = this.canTakeAnything;
    copy.attackingShip = this.attackingShip;
    copy.gameComplete = this.gameComplete;
    copy.shipInbound = this.shipInbound;
    copy.signedRegister = this.signedRegister;
    return copy;
  }

  get isScriptRunning(): boolean {
    return (this.engineFlags & BensonHostState.scriptRunning) !== 0;
  }

  valueOf(symbol: BensonSymbol): number {
    if (typeof symbol === 'string') {
      switch (symbol) {
        case 'engineFlags':
          return this.engineFlags;
        case 'currentRoom':
          return this.currentRoom;
        case 'boardedCraft':
          return this.boardedCraft;
        case 'inputKey':
          return this.pendingKey === undefined
            ? 0
            : bensonKeyCode(this.pendingKey);
        case 'signedRegister':
          return this.signedRegister;
        case 'messageInterval':
          return this.messageInterval;
        case 'attackingShip':
          return this.attackingShip ? 1 : 0;
        case 'gameComplete':
          return this.gameComplete ? 1 : 0;
        case 'shipInbound':
          return this.shipInbound;
      }
    }
    if ('decimalByte' in symbol) {
      return this.decimalByte(
        symbol.decimalByte.decimal,
        symbol.decimalByte.byte
      );
    }
    if ('objectRoom' in symbol) {
      return this.objectRooms.get(symbol.objectRoom) ?? 0;
    }
    return this.objectFlags.get(symbol.objectFlags) ?? 0;
  }

  write(symbol: BensonSymbol, value: number): void {
    if (typeof symbol === 'string') {
      switch (symbol) {
        case 'engineFlags':
          this.engineFlags = value & 0xff;
          return;
        case 'currentRoom':
          this.currentRoom = value;
          return;
        case 'boardedCraft':
          this.boardedCraft = value;
          return;
        case 'inputKey':
          if (value === 0) {
            this.pendingKey = undefined;
          }
          return;
        case 'signedRegister':
          this.signedRegister = value;
          return;
        case 'messageInterval':
          this.messageInterval = value;
          return;
        case 'attackingShip':
          this.attackingShip = value !== 0;
          return;
        case 'gameComplete':
          this.gameComplete = value !== 0;
          return;
        case 'shipInbound':
          this.shipInbound = value;
          return;
      }
    }
    if ('decimalByte' in symbol) {
      this.setDecimalByte(
        symbol.decimalByte.decimal,
        symbol.decimalByte.byte,
        value
      );
      return;
    }
    if ('objectRoom' in symbol) {
      this.objectRooms.set(symbol.objectRoom, value);
      return;
    }
    this.objectFlags.set(symbol.objectFlags, value & 0xff);
  }

  decimalByte(slot: number, byte: number): number {
    if (slot < 0 || slot >= this.decimals.length || byte < 0 || byte > 3) {
      return 0;
    }
    const scale = DECIMAL_SCALES[byte];
    const value = this.decimals[slot];
    if (scale === undefined || value === undefined) {
      return 0;
    }
    return Math.trunc(value / scale) % 100;
  }

  setDecimalByte(slot: number, byte: number, pair: number): void {
    if (slot < 0 || slot >= this.decimals.length || byte < 0 || byte > 3) {
      return;
    }
    const scale = DECIMAL_SCALES[byte];
    const value = this.decimals[slot];
    if (scale === undefined || value === undefined) {
      return;
    }
    const existing = Math.trunc(value / scale) % 100;
    this.decimals[slot] = value + ((pair % 100) - existing) * scale;
  }

  addDecimal(slot: number, value: number): void {
    if (slot < 0 || slot >= this.decimals.length) {
      return;
    }
    const limit = BensonHostState.decimalLimit;
    this.decimals[slot] =
      (((this.decimals[slot]! + value) % limit) + limit) % limit;
  }

  decimal(slot: number): number {
    return this.decimals[slot] ?? 0;
  }

  /// Number-slot values a message composes with, from decimals 8..15 as slots 0..7.
  numberSubstitutions(): Readonly<Record<number, number>> {
    const values: Record<number, number> = {};
    const count =
      BensonHostState.decimalCount - BensonHostState.firstNumberDecimal;
    for (let slot = 0; slot < count; slot++) {
      values[slot] = this.decimal(BensonHostState.firstNumberDecimal + slot);
    }
    return values;
  }
}
