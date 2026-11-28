import type { Vector3 } from '../orientation/index.ts';

/// The Damocles Transporter rules as the first-world image reads them (#998,
/// docs/research/damocles-arrival-routes.md#what-the-handlers-do-1005). They are pure: the
/// session says which Transporter the player stands in, how available each slot is and which
/// way they are going, and these say where the hop lands and which string it raises.

/// The Transporter Ring: resident slots 64 to 73, all `TRANSPORTER a`. `$059130` steps the
/// selector by four between `$100` and `$124`, wrapping at both ends (`$059164`–`$059178`).
export const FIRST_TRANSPORTER = 64;
export const LAST_TRANSPORTER = 73;

export const isTransporterSlot = (slot: number): boolean =>
  Number.isInteger(slot) &&
  slot >= FIRST_TRANSPORTER &&
  slot <= LAST_TRANSPORTER;

export const transporterInstance = (slot: number): string =>
  `object-slot-${slot}`;

/// The VOID staging Body, selector `$78`, where carried objects are parked.
export const VOID_BODY = 'body-30';

/// Whether a player may stand in VOID with these objects carried or left in the BRIEFCASE: only
/// a carried Transporter's digit takes them there, and nothing there lets it go (#1017).
export const reachesVoid = (held: readonly string[]): boolean =>
  held.some(id => {
    const slot = Number(/^object-slot-(\d+)$/.exec(id)?.[1] ?? -1);
    return isTransporterSlot(slot);
  });

/// A region box as the Model payload publishes it (`mesh.viewGroups[n].bounds`): per axis, the
/// half-open range the object's position less the eye's must lie in.
export type CubeBounds = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number]
];

/// `$0538F6`: the player is in the Transporter's cube when the slot's position less the eye's
/// lies in its model's region box, in world axes. For the TRANSPORTER model `$038820` that is
/// X and Z within (−50, 50] of the slot's and the eye more than 0 and at most 128 above its Y.
export const insideTransporterCube = (
  eye: { readonly x: number; readonly y: number; readonly z: number },
  slot: { readonly x: number; readonly y: number; readonly z: number },
  bounds: CubeBounds
): boolean => {
  const offsets = [slot.x - eye.x, slot.y - eye.y, slot.z - eye.z];
  return bounds.every(
    ([low, high], axis) => offsets[axis]! >= low && offsets[axis]! < high
  );
};

/// How the ring sees a slot after a step (`$0591D2`–`$0591EC`).
/// - `available`: the hop may land there.
/// - `unavailable`: Association B byte 0 is `$00` or `$78` (a carried Transporter), or, aboard,
///   byte 1 is non-zero. The ring passes it.
export type RingAvailability = 'available' | 'unavailable';

export type RingHop =
  /// String 17, `NO OTHER TRANSPORTERS AVAILABLE`: the steps came back to the entry slot.
  | { readonly kind: 'none' }
  /// The hop, with string 18, `INTERMEDIATE TRANSPORTERS NOT AVAILABLE`, first where any slot
  /// was passed. String 18 is a notice, not a refusal.
  | { readonly kind: 'hop'; readonly skipped: boolean; readonly slot: number };

/// The next slot round the ring, one step up (toward 73) or down (toward 64), wrapping.
export const ringStep = (slot: number, up: boolean): number => {
  const next = slot + (up ? 1 : -1);
  return next > LAST_TRANSPORTER
    ? FIRST_TRANSPORTER
    : next < FIRST_TRANSPORTER
      ? LAST_TRANSPORTER
      : next;
};

/// `$059130`–`$0591F6`: step from the entry slot until an available one, refusing only when the
/// steps return to the entry slot.
export const ringHop = (
  from: number,
  up: boolean,
  availability: (slot: number) => RingAvailability
): RingHop => {
  let skipped = false;
  for (let slot = ringStep(from, up); ; slot = ringStep(slot, up)) {
    if (slot === from) {
      return { kind: 'none' };
    }
    if (availability(slot) === 'available') {
      return { kind: 'hop', skipped, slot };
    }
    skipped = true;
  }
};

/// `$05913A`–`$05915C`: which way round the ring. The yaw word plus `$100` is inverted on foot
/// unless the stick's forward bit is set, and aboard while the speed is negative; bit 9 clear
/// then steps up. In yaw units of 1024 a turn, walking forwards facing `$300` round to `$0FF`
/// steps up, and facing `$100` to `$2FF` steps down. The split is in world yaw.
export const ringStepsUp = (yaw: number, inverted: boolean): boolean => {
  const word = (yaw + 0x1_00) & 0xff_ff;
  return (((inverted ? ~word : word) >> 9) & 1) === 0;
};

/// What a digit key does to a slot's body byte (`$059184`), which is tested for 0 and nothing
/// else.
/// - `unclaimed`: body byte 0, which raises string 20, `TRANSPORTER NOT AVAILABLE`.
/// - `claimed`: any other, the hop. Nothing else is checked: not VOID, so a carried Transporter
///   takes the player to its parked placement (#1017); not interior, not the slot the player
///   stands in, and not the latch.
export type DigitTarget = 'claimed' | 'unclaimed';

export type DigitHop =
  | { readonly kind: 'hop'; readonly slot: number }
  | { readonly kind: 'ignored' }
  | { readonly kind: 'refused' };

/// Key `n` names slot 64 + `n`: `0` is slot 64 through `9` for slot 73.
export const digitSlot = (digit: number): number => FIRST_TRANSPORTER + digit;

export const digitHop = (
  digit: number,
  target: (slot: number) => DigitTarget
): DigitHop => {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
    return { kind: 'ignored' };
  }
  const slot = digitSlot(digit);
  return target(slot) === 'unclaimed'
    ? { kind: 'refused' }
    : { kind: 'hop', slot };
};

/// `$052D42`, at every scene rebuild: where the object at `index` in the Carried Stack is
/// parked, in VOID. Index `i` below 10 is at X 33237, Z 99100, Y 300 × `i`; from 10 the loop
/// wraps (`$052D94`–`$052DA2`), and index 10 + `k` is at Z 164636 (`$2831C`), Y 300 × `k`. An
/// object left in the BRIEFCASE keeps the placement of the index 10 + `k` it held when the case
/// was dropped (docs/research/damocles-arrival-routes.md#a-carried-transporters-digit-1017).
export const parkedPosition = (index: number): Vector3 => ({
  x: 0x81_d5,
  y: 0x1_2c * (index % 10),
  z: index < 10 ? 0x1_83_1c : 0x2_83_1c
});

/// `$0591FA` writes the player's Y as the destination's resident Y plus `$3F`.
export const ARRIVAL_EYE_OFFSET = 0x3f;
