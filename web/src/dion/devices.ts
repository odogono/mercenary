import {
  craftAdd,
  craftLongFloat,
  craftSquare,
  type CraftArithmetic
} from '../craft/pass.ts';
import type { CarriedResident } from './carry.ts';
import type { DionHead } from './head.ts';

/// Dion's device owners: `$710C/$710E/$7110`, the rotating random table and the
/// fruit machine's `$6E9A..$6EA0` and `$B330` reels. No executable pointers are saved.
export interface DionDevices {
  readonly counter: number;
  readonly machine: {
    readonly count: number;
    readonly credit: number;
    readonly delay: number;
    readonly payout: number;
    readonly reels: readonly number[];
    readonly stage: number;
  };
  readonly priority: number;
  readonly randomCursor: number;
  readonly randomWords: readonly number[];
}

export const initialDevices = (head: DionHead): DionDevices => ({
  counter: 0,
  machine: {
    count: 0,
    credit: 0,
    delay: 0,
    payout: 0,
    reels: [...head.fruitReels],
    stage: 0
  },
  priority: 0,
  randomCursor: 0,
  randomWords: [...head.random]
});

/// `$517F0` / `$53034`: rotate the current table word, then advance with wrap.
const random = (
  state: DionDevices
): { readonly state: DionDevices; readonly value: number } => {
  const words = [...state.randomWords];
  const word = words[state.randomCursor]!;
  const value = (word >>> 1) | ((word & 1) << 15);
  words[state.randomCursor] = value;
  return {
    state: {
      ...state,
      randomCursor: (state.randomCursor + 1) & 511,
      randomWords: words
    },
    value
  };
};

const stopReel = (state: DionDevices): DionDevices => {
  const r = random(state);
  return {
    ...r.state,
    machine: {
      ...state.machine,
      count: (r.value & 15) + 31,
      stage: state.machine.stage + 1
    }
  };
};

/// `$517CE`: `+` advances an active stage 1..3. It never sets switch bit 0.
export const electromagnet = (state: DionDevices): DionDevices =>
  state.machine.stage >= 1 && state.machine.stage <= 3
    ? stopReel(state)
    : state;

export const startFruitMachine = (state: DionDevices): DionDevices => {
  const r = random(state);
  return {
    ...r.state,
    machine: {
      ...state.machine,
      count: (r.value & 15) + 31,
      credit: (state.machine.credit + 1) & 65_535,
      delay: 1,
      stage: 1
    }
  };
};

/// `$516AE..$51774`: one frame of the fruit machine, independently of its open panel.
export const stepFruitMachine = (
  state: DionDevices
): {
  readonly bankrupt: boolean;
  readonly pays: boolean;
  readonly state: DionDevices;
} => {
  let next = state;
  let m = state.machine;
  if (m.stage >= 1 && m.stage <= 3) {
    let delay = (m.delay - 1) & 255;
    let count = m.count;
    const reels = [...m.reels];
    if (delay === 0) {
      count = (count - 1) & 255;
      if (count === 0) {
        next = stopReel(next);
        m = next.machine;
        count = m.count;
      }
      delay = count < 7 ? ((count >> 1) ^ 3) + 1 : 1;
      const index = state.machine.stage - 1;
      reels[index] = reels[index] === 39 ? 34 : reels[index]! + 1;
    }
    for (let i = state.machine.stage; i < 3; i++) {
      reels[i] = reels[i] === 39 ? 34 : reels[i]! + 1;
    }
    next = { ...next, machine: { ...m, count, delay, reels } };
  } else if (m.stage === 4) {
    const [a, b, c] = m.reels;
    const payout = a !== b ? 0 : a !== c ? 3 : a === 34 ? 50 : 10;
    next = {
      ...state,
      machine: {
        ...m,
        count: payout === 0 ? m.count : 5,
        payout: payout === 0 ? m.payout : payout,
        stage: payout === 0 ? 0 : 5
      }
    };
  } else if (m.stage === 5) {
    if (m.credit & 32_768) {
      return {
        bankrupt: true,
        pays: false,
        state: { ...state, machine: { ...m, stage: 0 } }
      };
    }
    const count = (m.count - 1) & 65_535;
    if (count === 0) {
      const payout = (m.payout - 1) & 65_535;
      return {
        bankrupt: false,
        pays: true,
        state: {
          ...state,
          machine: {
            ...m,
            count: 1,
            credit: (m.credit - 1) & 65_535,
            payout,
            stage: payout === 0 ? 0 : 5
          }
        }
      };
    }
    next = { ...state, machine: { ...m, count } };
  }
  return { bankrupt: false, pays: false, state: next };
};

/// `$4CC46`: held149 and switch bit1 gate ore127 first, then ore114, on this Body.
/// The squared-distance exponent, rather than Euclidean distance, sets the beep rate.
export const detectorRate = (
  arithmetic: CraftArithmetic,
  residents: readonly CarriedResident[],
  switches: number,
  body: number,
  eye: readonly [number, number, number]
): number => {
  if (
    !residents.some(r => r.slot === 149 && r.state & 128) ||
    !(switches & 2)
  ) {
    return 0;
  }
  const target = [127, 114]
    .map(slot => residents.find(r => r.slot === slot))
    .find(r => r?.bodyOffset === body);
  if (!target) {
    return 0;
  }
  const squares = target.position.map((v, i) =>
    craftSquare(arithmetic, craftLongFloat((v - eye[i]!) | 0))
  );
  const sum = craftAdd(craftAdd(squares[0]!, squares[1]!), squares[2]!);
  let rate = Math.max(0, (sum >> 16) - 16) + 3;
  if (rate >= 25) {
    rate = (rate - 20) ** 2;
  }
  return rate & 65_535;
};

/// `$53028`: higher-priority B sounds pause the counter and random consumption.
export const stepDetector = (
  state: DionDevices,
  rate: number
): { readonly beep: boolean; readonly state: DionDevices } => {
  if (state.priority !== 0) {
    return { beep: false, state: { ...state, priority: state.priority - 1 } };
  }
  if (rate === 0) {
    return { beep: false, state };
  }
  const r = random(state);
  const count = (state.counter + 1) & 65_535;
  const beep = Math.floor((r.value * rate) / 65_536) <= count;
  return { beep, state: { ...r.state, counter: beep ? 0 : count } };
};

/// `$4DF34/$55F52`: A TO Z shows this group's cell label, falling back to its
/// header. Only an empty table (including space) reads OUT OF RANGE.
export const locationCardLines = (
  head: DionHead,
  group: number,
  cell: number
): readonly [string, string] => {
  const labels = head.locationLabels.get(group);
  const label = labels?.records.get(cell) ?? labels?.header;
  return !label
    ? ['  OUT OF  ', '  RANGE   ']
    : [label.slice(0, 10), label.slice(10)];
};
