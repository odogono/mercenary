export interface TourcraftBatch {
  readonly messageOccurrence: number | null;
  readonly ordinal: number;
  readonly tick: number;
  readonly writes: readonly {
    readonly register: number;
    readonly value: number;
  }[];
}
export interface TourcraftEvents {
  readonly consumedThrough: number | null;
  readonly deliveredEnvelope: {
    readonly ordinal: number;
    readonly writeIndex: number;
  } | null;
  readonly deliveredRegisters: readonly number[];
  readonly nextOrdinal: number;
  readonly pending: readonly TourcraftBatch[];
}
export const freshEvents = (registers: readonly number[]): TourcraftEvents => ({
  consumedThrough: null,
  deliveredEnvelope: null,
  deliveredRegisters: [...registers],
  nextOrdinal: 0,
  pending: []
});
export const appendEvent = (
  state: TourcraftEvents,
  tick: number,
  writes: TourcraftBatch['writes'],
  messageOccurrence: number | null
): TourcraftEvents => {
  if (state.nextOrdinal === Number.MAX_SAFE_INTEGER) {
    throw new Error('Sound event counter exhausted');
  }
  return {
    ...state,
    nextOrdinal: state.nextOrdinal + 1,
    pending: [
      ...state.pending,
      { messageOccurrence, ordinal: state.nextOrdinal, tick, writes }
    ]
  };
};
export const consumeEvent = (
  state: TourcraftEvents,
  batch: TourcraftBatch
): TourcraftEvents => {
  if (state.pending[0]?.ordinal !== batch.ordinal) {
    throw new Error('Sound events must be acknowledged in order');
  }
  const deliveredRegisters = [...state.deliveredRegisters];
  let deliveredEnvelope = state.deliveredEnvelope;
  batch.writes.forEach(({ register, value }, writeIndex) => {
    deliveredRegisters[register] = value;
    if (register === 13) {
      deliveredEnvelope = { ordinal: batch.ordinal, writeIndex };
    }
  });
  return {
    ...state,
    consumedThrough: batch.ordinal,
    deliveredEnvelope,
    deliveredRegisters,
    pending: state.pending.slice(1)
  };
};
