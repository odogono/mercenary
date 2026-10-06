import {
  briefcaseDrop,
  rotateBackward,
  rotateForward,
  takeRefusal
} from '../interaction/carriedStack.ts';
import type { DionResident } from './world.ts';

/// Mercenary III's Take, Drop and Carried Stack (#756): the original handlers `$55364` (Take)
/// and `$55794` (Drop), the stack moves `$4E1FC`/`$4E230`/`$4E2A6`/`$4E2B8`, the panel label
/// scroll `$4E3A6` and the storage staging `$53CC4`. The rules every Title shares are in
/// `interaction/carriedStack.ts`; this file owns Mercenary III's resident records, Residence and
/// effects.
///
/// Effects the port has not reached are reported as `unported` rather than run: the pawn
/// at structure `$52` region 9 (`$557D6`) and the slot-213 flag (`$5591E`).

export type CarriedResident = DionResident & { readonly bodyOffset: number };

export interface DionCarry {
  /// `$7098`: 10, or 20 while the BRIEFCASE is carried.
  readonly capacity: number;
  /// The name the label scrolls towards (`$4E390`).
  readonly incoming: string;
  /// The sixteen characters the panel shows now (`$4E380`).
  readonly label: string;
  /// `$4E394`: positive scrolls the incoming name in from the left, negative from the right.
  readonly scroll: number;
  /// `$563E`, head first, `$563C` long.
  readonly stack: readonly number[];
  /// The objects the dropped BRIEFCASE holds: the stack bytes past ten (`$563A` of them).
  readonly stored: readonly number[];
}

export interface CarryWorld {
  /// The sixteen-character name before each object's model record.
  readonly labels: ReadonlyMap<number, string>;
  /// The highest vertex of a candidate's model, or undefined where `$55848` refuses its header.
  readonly supportTop: (slot: number) => number | undefined;
}

/// Where the player stands, as the Drop handler reads it.
export interface CarryPlace {
  readonly body: number;
  readonly cell: number;
  /// `$715E`: the player is on the ground.
  readonly contact: boolean;
  readonly eye: readonly [number, number, number];
  readonly floor: number;
  readonly group: number;
  /// `$7142 == 1` inside a structure region that is not exterior; null outside.
  readonly interior: {
    readonly associations: readonly number[];
    readonly region: number;
  } | null;
  readonly zone: number;
}

export interface CarryCandidate {
  readonly exponent: number;
  readonly slot: number;
}

export type CarryOutcome =
  | { readonly kind: 'refused'; readonly message?: number }
  | {
      readonly carry: DionCarry;
      readonly closes?: number;
      readonly kind: 'done';
      readonly message?: number;
      readonly residents: readonly CarriedResident[];
      readonly script?: number;
      readonly unported?: string;
    };

const VOID = 0x78;
const BLANK = ' '.repeat(16);
const BRIEFCASE = 108;

/// `$4E328`: the TRANSPORTERs (64–73) and KEYs A–J (30–39) show their own digit or letter.
export const carriedLabel = (world: CarryWorld, slot: number): string => {
  const name = world.labels.get(slot) ?? BLANK;
  if (slot >= 64 && slot <= 73) {
    return `${name.slice(0, 13)}${String.fromCharCode(slot - 16)}${name.slice(14)}`;
  }
  if (slot >= 30 && slot <= 39) {
    return `${name.slice(0, 12)}${String.fromCharCode(slot + 0x23)}${name.slice(13)}`;
  }
  return name;
};

/// `$555C0`: the gauge reads the count, doubled unless the BRIEFCASE has raised the capacity.
export const inventoryGauge = (carry: DionCarry): number =>
  carry.capacity === 20 ? carry.stack.length : carry.stack.length * 2;

const held = (residents: readonly CarriedResident[], slot: number): boolean =>
  (residents.find(r => r.slot === slot)?.state ?? 0) >= 0x80;

const update = (
  residents: readonly CarriedResident[],
  slot: number,
  change: (r: CarriedResident) => CarriedResident
): CarriedResident[] => residents.map(r => (r.slot === slot ? change(r) : r));

/// `$53CC4`: carried objects keep storage places in group 49, ten to a row.
const staged = (
  residents: readonly CarriedResident[],
  stack: readonly number[]
): CarriedResident[] =>
  residents.map(r => {
    const i = stack.indexOf(r.slot);
    if (i < 0) {
      return r;
    }
    return {
      ...r,
      association: 1,
      body: i % 10,
      bodyOffset: VOID,
      cell: i < 10 ? 0x10 : 0x20,
      group: 49,
      position: [0x81_d5, 300 * (i % 10), i < 10 ? 0x1_83_1c : 0x2_83_1c]
    };
  });

const scrolled = (
  world: CarryWorld,
  stack: readonly number[],
  scroll: number
): Pick<DionCarry, 'incoming' | 'scroll' | 'stack'> => ({
  incoming: stack[0] === undefined ? BLANK : carriedLabel(world, stack[0]),
  scroll,
  stack
});

/// `$4E3A6`, once a VBL: one character of the incoming name moves in.
export const stepCarriedLabel = (carry: DionCarry): DionCarry => {
  const { incoming, label, scroll } = carry;
  if (scroll > 0) {
    return {
      ...carry,
      label: `${incoming[scroll - 1]}${label.slice(0, 15)}`,
      scroll: scroll - 1
    };
  }
  if (scroll < 0) {
    return {
      ...carry,
      label: `${label.slice(1)}${incoming[16 + scroll]}`,
      scroll: scroll + 1
    };
  }
  return carry;
};

const RESPONSES: ReadonlyMap<number, number> = new Map([
  [216, 0x1c],
  [218, 0x73],
  [127, 0x18]
]);

/// `$55364`: Take the preceding frame's candidate.
export const take = (
  carry: DionCarry,
  residents: readonly CarriedResident[],
  world: CarryWorld,
  candidate: CarryCandidate | null,
  body: number
): CarryOutcome => {
  if (
    candidate === null ||
    candidate.exponent > 8 ||
    candidate.slot === 0 ||
    body === VOID ||
    carry.scroll !== 0
  ) {
    return { kind: 'refused' };
  }
  const { slot } = candidate;
  const resident = residents.find(r => r.slot === slot);
  if (resident === undefined) {
    return { kind: 'refused' };
  }
  const refusal = takeRefusal(
    resident.state,
    s => s !== 0 && held(residents, s),
    carry.stack.length,
    carry.capacity
  );
  if (refusal !== null) {
    return refusal === 'tooHeavy'
      ? { kind: 'refused', message: 2 }
      : { kind: 'refused' };
  }
  let { capacity, stack, stored } = carry;
  if (slot === BRIEFCASE) {
    capacity = 20;
    stack = [...stack, ...stored];
    stored = [];
  }
  stack = [slot, ...stack];
  const taken = update(residents, slot, r => ({
    ...r,
    association: 0,
    body: 0,
    bodyOffset: VOID,
    cell: 0,
    group: 0,
    state: r.state | 0x80
  }));
  const response = RESPONSES.get(slot);
  return {
    carry: {
      ...carry,
      ...scrolled(world, stack, -16),
      capacity,
      stored
    },
    kind: 'done',
    residents: staged(taken, stack),
    ...(response === undefined ? {} : { script: response })
  };
};

/// `$55794`: Drop the head object onto the candidate that supports it, or where the player
/// stands.
export const drop = (
  carry: DionCarry,
  residents: readonly CarriedResident[],
  world: CarryWorld,
  candidate: CarryCandidate | null,
  place: CarryPlace
): CarryOutcome => {
  const head = carry.stack[0];
  if (place.body === VOID || carry.scroll !== 0 || head === undefined) {
    return { kind: 'refused' };
  }
  if (
    place.interior !== null &&
    !place.interior.associations.includes(place.interior.region)
  ) {
    return { kind: 'refused', message: 9 };
  }
  let placed: (r: CarriedResident) => CarriedResident;
  // A candidate within exponent 6 is the support; any other Drop is direct.
  if (candidate !== null && candidate.exponent <= 6 && candidate.slot !== 74) {
    const support = residents.find(r => r.slot === candidate.slot);
    const headState = residents.find(r => r.slot === head)!.state;
    // KEY A39 held lifts the rank test.
    if (!held(residents, 39)) {
      const demand = headState & 0x0c;
      const supply = (support?.state ?? 0) & 0x03;
      if (demand === 0 || supply === 0 || supply * 4 < demand) {
        return { kind: 'refused', message: 9 };
      }
    }
    const top = support && world.supportTop(support.slot);
    if (support === undefined || top === undefined) {
      return { kind: 'refused', message: 9 };
    }
    const y = top + support.position[1];
    if (y > place.eye[1]) {
      return { kind: 'refused', message: 9 };
    }
    placed = r => ({
      ...r,
      association: support.association,
      body: support.body,
      bodyOffset: support.bodyOffset,
      cell: support.cell,
      group: support.group,
      position: [support.position[0], y, support.position[2]],
      zone: support.zone
    });
  } else {
    if (!place.contact) {
      return { kind: 'refused' };
    }
    placed = r => ({
      ...r,
      association: place.interior?.region ?? 0,
      body: place.floor,
      bodyOffset: place.body,
      cell: place.cell,
      group: place.group,
      position: [place.eye[0], place.eye[1] - 63, place.eye[2]],
      zone: place.zone
    });
  }
  let { capacity, stack, stored } = carry;
  let message: number | undefined;
  if (head === BRIEFCASE) {
    capacity = 10;
    if (stack.length > 10) {
      message = 1;
      ({ carried: stack, stored } = briefcaseDrop(stack));
    } else {
      stack = stack.slice(1);
      stored = [];
    }
  } else {
    stack = stack.slice(1);
  }
  const dropped = update(residents, head, r => ({
    ...placed(r),
    state: r.state & 0x7f
  }));
  return {
    carry: { ...carry, ...scrolled(world, stack, 16), capacity, stored },
    closes: head,
    kind: 'done',
    ...(message === undefined ? {} : { message }),
    residents: staged(dropped, stack),
    ...(head === 213 ? { unported: 'slot 213 drop flag $6EDE' } : {})
  };
};

/// `$4E230` and `$4E2B8`: rotate the stack, the label following.
export const rotate = (
  carry: DionCarry,
  residents: readonly CarriedResident[],
  world: CarryWorld,
  direction: 'forward' | 'backward'
): CarryOutcome => {
  if (carry.scroll !== 0 || carry.stack.length === 0) {
    return { kind: 'refused' };
  }
  const stack =
    direction === 'forward'
      ? rotateForward(carry.stack)
      : rotateBackward(carry.stack);
  return {
    carry: {
      ...carry,
      ...scrolled(world, stack, direction === 'forward' ? 16 : -16)
    },
    kind: 'done',
    residents: staged(residents, stack)
  };
};
