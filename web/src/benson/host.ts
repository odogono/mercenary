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

export interface BensonHostFields {
  readonly attackingShip: boolean;
  readonly boardedCraft: number;
  readonly canLiftAnything: boolean;
  readonly canTakeAnything: boolean;
  readonly currentRoom: number;
  readonly decimals: readonly number[];
  readonly destroyedBlocks: ReadonlySet<number>;
  readonly engineFlags: number;
  /// The Ending phase byte: 0 in active play, 1 once script 7's Escape is
  /// accepted, 255 in the mature terminal presentation. A byte rather than a
  /// Boolean because the Reference Build reads all three values apart
  /// (`notes/decode/endgame.md`, "Ending phases"). Only script 7's `stor`
  /// writes 1; nothing in active play writes 255, which is M7.5's.
  readonly gameComplete: number;
  readonly inventory: ReadonlySet<number>;
  readonly messageInterval: number;
  readonly messagePlaying: boolean;
  readonly objectFlags: ReadonlyMap<number, number>;
  readonly objectRooms: ReadonlyMap<number, number>;
  readonly pendingKey: BensonKey | undefined;
  readonly shipInbound: number;
  readonly signedRegister: number;
  readonly tickCounter: number;
}

/// The engine state a Benson Script is allowed to see — the complete Host Callout surface.
///
/// Persistent: every write returns a new value (ADR 0023). Collections that did not
/// change are shared by reference.
export class BensonHostState implements BensonHostFields {
  /// On foot. Slot 0 is a real ship, so this is a sentinel rather than zero.
  static readonly onFoot = 0x80;
  static readonly outOfTheWorld = 0xff;
  static readonly inputDetected = 0x80;
  static readonly scriptRunning = 0x40;
  static readonly decimalCount = 16;
  static readonly firstNumberDecimal = 8;
  static readonly decimalLimit = 100_000_000;
  static readonly defaultMessageInterval = 125;

  readonly attackingShip: boolean;
  readonly boardedCraft: number;
  readonly canLiftAnything: boolean;
  readonly canTakeAnything: boolean;
  readonly currentRoom: number;
  readonly decimals: readonly number[];
  readonly destroyedBlocks: ReadonlySet<number>;
  readonly engineFlags: number;
  readonly gameComplete: number;
  readonly inventory: ReadonlySet<number>;
  readonly messageInterval: number;
  readonly messagePlaying: boolean;
  readonly objectFlags: ReadonlyMap<number, number>;
  readonly objectRooms: ReadonlyMap<number, number>;
  readonly pendingKey: BensonKey | undefined;
  readonly shipInbound: number;
  readonly signedRegister: number;
  readonly tickCounter: number;

  constructor(fields: Partial<BensonHostFields> = {}) {
    this.engineFlags = fields.engineFlags ?? 0;
    this.messagePlaying = fields.messagePlaying ?? false;
    this.pendingKey = fields.pendingKey;
    this.tickCounter = fields.tickCounter ?? 0;
    this.messageInterval =
      fields.messageInterval ?? BensonHostState.defaultMessageInterval;
    this.currentRoom = fields.currentRoom ?? 0;
    this.boardedCraft = fields.boardedCraft ?? BensonHostState.onFoot;
    this.decimals =
      fields.decimals ??
      Array.from({ length: BensonHostState.decimalCount }, () => 0);
    this.objectRooms = fields.objectRooms ?? new Map();
    this.objectFlags = fields.objectFlags ?? new Map();
    this.inventory = fields.inventory ?? new Set();
    this.destroyedBlocks = fields.destroyedBlocks ?? new Set();
    this.canLiftAnything = fields.canLiftAnything ?? false;
    this.canTakeAnything = fields.canTakeAnything ?? false;
    this.attackingShip = fields.attackingShip ?? false;
    this.gameComplete = fields.gameComplete ?? 0;
    this.shipInbound = fields.shipInbound ?? 0;
    this.signedRegister = fields.signedRegister ?? 0;
  }

  /// Seeds are applied by slot index, not Map insertion order — Swift's dictionary
  /// walk is unspecified, and a JS `Map` would hide a real dependency.
  static seeding(program: BensonProgram): BensonHostState {
    const decimals = Array.from(
      { length: BensonHostState.decimalCount },
      () => 0
    );
    for (let slot = 0; slot < decimals.length; slot++) {
      const value = program.decimalSeeds[slot];
      if (value !== undefined) {
        decimals[slot] = value;
      }
    }
    return new BensonHostState({ decimals });
  }

  with(patch: Partial<BensonHostFields>): BensonHostState {
    return new BensonHostState({
      attackingShip: patch.attackingShip ?? this.attackingShip,
      boardedCraft: patch.boardedCraft ?? this.boardedCraft,
      canLiftAnything: patch.canLiftAnything ?? this.canLiftAnything,
      canTakeAnything: patch.canTakeAnything ?? this.canTakeAnything,
      currentRoom: patch.currentRoom ?? this.currentRoom,
      decimals: patch.decimals ?? this.decimals,
      destroyedBlocks: patch.destroyedBlocks ?? this.destroyedBlocks,
      engineFlags: patch.engineFlags ?? this.engineFlags,
      gameComplete: patch.gameComplete ?? this.gameComplete,
      inventory: patch.inventory ?? this.inventory,
      messageInterval: patch.messageInterval ?? this.messageInterval,
      messagePlaying: patch.messagePlaying ?? this.messagePlaying,
      objectFlags: patch.objectFlags ?? this.objectFlags,
      objectRooms: patch.objectRooms ?? this.objectRooms,
      pendingKey:
        patch.pendingKey !== undefined ? patch.pendingKey : this.pendingKey,
      shipInbound: patch.shipInbound ?? this.shipInbound,
      signedRegister: patch.signedRegister ?? this.signedRegister,
      tickCounter: patch.tickCounter ?? this.tickCounter
    });
  }

  /// `with({ pendingKey: undefined })` cannot clear the key: `??` would keep the
  /// old one. This is the write that means "no key held".
  withoutPendingKey(): BensonHostState {
    // The eighteen fields written out rather than spread, for the reason `BensonState.withPc`
    // gives: spreading a class instance enumerates it and the constructor then re-reads what it
    // was handed, which measured about thirteen times the cost over a record this wide.
    return new BensonHostState({
      attackingShip: this.attackingShip,
      boardedCraft: this.boardedCraft,
      canLiftAnything: this.canLiftAnything,
      canTakeAnything: this.canTakeAnything,
      currentRoom: this.currentRoom,
      decimals: this.decimals,
      destroyedBlocks: this.destroyedBlocks,
      engineFlags: this.engineFlags,
      gameComplete: this.gameComplete,
      inventory: this.inventory,
      messageInterval: this.messageInterval,
      messagePlaying: this.messagePlaying,
      objectFlags: this.objectFlags,
      objectRooms: this.objectRooms,
      pendingKey: undefined,
      shipInbound: this.shipInbound,
      signedRegister: this.signedRegister,
      tickCounter: this.tickCounter
    });
  }

  withObjectRoom(slot: number, room: number): BensonHostState {
    const objectRooms = new Map(this.objectRooms);
    objectRooms.set(slot, room);
    return this.with({ objectRooms });
  }

  withObjectFlag(slot: number, flags: number): BensonHostState {
    const objectFlags = new Map(this.objectFlags);
    objectFlags.set(slot, flags & 0xff);
    return this.with({ objectFlags });
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
          return this.gameComplete;
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

  write(symbol: BensonSymbol, value: number): BensonHostState {
    if (typeof symbol === 'string') {
      switch (symbol) {
        case 'engineFlags':
          return this.with({ engineFlags: value & 0xff });
        case 'currentRoom':
          return this.with({ currentRoom: value });
        case 'boardedCraft':
          return this.with({ boardedCraft: value });
        case 'inputKey':
          return value === 0 ? this.withoutPendingKey() : this;
        case 'signedRegister':
          return this.with({ signedRegister: value });
        case 'messageInterval':
          return this.with({ messageInterval: value });
        case 'attackingShip':
          return this.with({ attackingShip: value !== 0 });
        case 'gameComplete':
          return this.with({ gameComplete: value & 0xff });
        case 'shipInbound':
          return this.with({ shipInbound: value });
      }
    }
    if ('decimalByte' in symbol) {
      return this.setDecimalByte(
        symbol.decimalByte.decimal,
        symbol.decimalByte.byte,
        value
      );
    }
    if ('objectRoom' in symbol) {
      return this.withObjectRoom(symbol.objectRoom, value);
    }
    return this.withObjectFlag(symbol.objectFlags, value);
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

  setDecimalByte(slot: number, byte: number, pair: number): BensonHostState {
    if (slot < 0 || slot >= this.decimals.length || byte < 0 || byte > 3) {
      return this;
    }
    const scale = DECIMAL_SCALES[byte];
    const value = this.decimals[slot];
    if (scale === undefined || value === undefined) {
      return this;
    }
    const existing = Math.trunc(value / scale) % 100;
    const decimals = this.decimals.slice();
    decimals[slot] = value + ((pair % 100) - existing) * scale;
    return this.with({ decimals });
  }

  addDecimal(slot: number, value: number): BensonHostState {
    if (slot < 0 || slot >= this.decimals.length) {
      return this;
    }
    const limit = BensonHostState.decimalLimit;
    const decimals = this.decimals.slice();
    decimals[slot] = (((this.decimals[slot]! + value) % limit) + limit) % limit;
    return this.with({ decimals });
  }

  withDecimal(slot: number, value: number): BensonHostState {
    if (slot < 0 || slot >= this.decimals.length) {
      return this;
    }
    const decimals = this.decimals.slice();
    decimals[slot] = value;
    return this.with({ decimals });
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
