/// Programme mechanics shared by the ST titles. Title drivers retain their own
/// requests, continuations, engine rules and clocks; this module only writes PSG registers.
export interface PsgSink {
  readonly write: (register: number, value: number) => void;
}

type RegisterWrites = readonly (readonly [number, number])[];

export interface SoundTable {
  readonly loop: number | null;
  readonly pairs: readonly (readonly [count: number, value: number])[];
}

export interface SoundStream extends SoundTable {
  readonly registers: readonly number[];
}

/// Damocles $0508F8 and MIII $50E9E agree. Register 13 is not reset by either table.
export const ST_RESET_REGISTERS = [
  1, 0, 1, 0, 1, 0, 31, 0xda, 0, 16, 0, 0, 0
] as const;

export const writePeriod = (
  sink: PsgSink,
  fine: number,
  period: number
): void => {
  sink.write(fine, period & 0xff);
  sink.write(fine + 1, (period >> 8) & 0xff);
};

/// Seek a count/value table without replaying its history, including a finite prefix
/// before a loop. Dion uses this directly from saved ages; both titles use it for doors.
export const tableValueAt = (
  table: SoundTable,
  elapsed: number
): number | null => {
  const prefix = table.pairs
    .slice(0, table.loop ?? table.pairs.length)
    .reduce((total, [count]) => total + count, 0);
  const cycle =
    table.loop === null
      ? 0
      : table.pairs
          .slice(table.loop)
          .reduce((total, [count]) => total + count, 0);
  let remaining =
    table.loop !== null && elapsed >= prefix
      ? prefix + ((elapsed - prefix) % cycle)
      : elapsed;
  // Decoded tables have positive counts and, when looping, a nonempty cycle.
  for (const [count, value] of table.pairs) {
    if (remaining < count) {
      return value;
    }
    remaining -= count;
  }
  return null;
};

/// Writes little-endian values to each stream's register(s); true at a finite end.
export const playStreams = (
  sink: PsgSink,
  streams: readonly SoundStream[],
  elapsed: number
): boolean => {
  let ended = false;
  for (const stream of streams) {
    const value = tableValueAt(stream, elapsed);
    if (value === null) {
      ended = true;
    } else {
      stream.registers.forEach((register, index) =>
        sink.write(register, (value >> (8 * index)) & 0xff)
      );
    }
  }
  return ended;
};

const KEY_CLICK: RegisterWrites = [
  [11, 0],
  [12, 31],
  [2, 96],
  [3, 0],
  [9, 31],
  [13, 9]
];

/// Damocles's shared effect and Dion's key click: tone B under the same one-second decay.
/// Dion supplies its decoded setup; Damocles uses the recovered constants.
export const playKeyClick = (
  sink: PsgSink,
  mixer: number,
  registers: RegisterWrites = KEY_CLICK
): number => {
  for (const [register, value] of registers) {
    if (register !== 9 && register !== 13) {
      sink.write(register, value);
    }
  }
  mixer = (mixer & 0xfd) | 0x10;
  sink.write(7, mixer);
  for (const [register, value] of registers) {
    if (register === 9 || register === 13) {
      sink.write(register, value);
    }
  }
  return mixer;
};

const DOOR_PERIODS: SoundStream = {
  loop: 0,
  pairs: [
    [1, 1000],
    [1, 1050]
  ],
  registers: [4, 5]
};
const DOOR_MOVING: SoundStream = {
  loop: 6,
  pairs: [
    [1, 10],
    [1, 11],
    [1, 13],
    [1, 13],
    [1, 11],
    [1, 10],
    [1, 9],
    [1, 8],
    [1, 7],
    [1, 6],
    [1, 5]
  ],
  registers: [10]
};
const DOOR_STOP: SoundStream = {
  loop: null,
  pairs: [
    [1, 12],
    [1, 8],
    [1, 4],
    [1, 0]
  ],
  registers: [10]
};

/// Matching door entry writes, preserving Damocles's register order. Continuation
/// after the stop burst belongs to each title (craft engine or METIS ambient).
export const startDoor = (
  sink: PsgSink,
  mixer: number,
  moving: boolean,
  registers: RegisterWrites = moving
    ? [
        [4, 0],
        [5, 4],
        [10, 15]
      ]
    : [
        [4, 0],
        [5, 4],
        [6, 31]
      ]
): number => {
  for (const [register, value] of registers) {
    if (register !== 10) {
      sink.write(register, value);
    }
  }
  mixer = moving ? mixer & 0xdb : (mixer & 0xdf) | 4;
  sink.write(7, mixer);
  for (const [register, value] of registers) {
    if (register === 10) {
      sink.write(register, value);
    }
  }
  return mixer;
};

export const tickDoor = (
  sink: PsgSink,
  moving: boolean,
  elapsed: number,
  streams: readonly SoundStream[] = [
    DOOR_PERIODS,
    moving ? DOOR_MOVING : DOOR_STOP
  ]
): boolean => {
  if (moving) {
    sink.write(6, 0);
  }
  return playStreams(sink, streams, elapsed);
};

/// Both message bars consume four six-pixel glyphs per three scroll ticks. Pitch
/// scaling and the terminal hold differ between titles and stay in their drivers.
export const messageCharacter = (text: string, age: number): string =>
  text[Math.ceil((4 * (age - 1)) / 3)] ?? ' ';
