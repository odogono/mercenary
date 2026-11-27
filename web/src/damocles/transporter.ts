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

/// The Transporter's model, `$038820`, carries one region: lower bounds −50, −128 and −50,
/// extents 100, 128 and 100, in world axes (`$0538F6`). Turned to the player's side, they are
/// inside when X and Z are each within (−50, 50] of the slot's and the eye is more than 0 and at
/// most 128 above its Y.
export const TRANSPORTER_CUBE = { half: 50, height: 128 } as const;

export const insideTransporterCube = (
  eye: { readonly x: number; readonly y: number; readonly z: number },
  slot: { readonly x: number; readonly y: number; readonly z: number }
): boolean => {
  const dx = eye.x - slot.x;
  const dy = eye.y - slot.y;
  const dz = eye.z - slot.z;
  return (
    dx > -TRANSPORTER_CUBE.half &&
    dx <= TRANSPORTER_CUBE.half &&
    dz > -TRANSPORTER_CUBE.half &&
    dz <= TRANSPORTER_CUBE.half &&
    dy > 0 &&
    dy <= TRANSPORTER_CUBE.height
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

/// What a digit key does to a slot's body byte (`$059184`).
/// - `unclaimed`: body byte 0, which raises string 20, `TRANSPORTER NOT AVAILABLE`.
/// - `carried`: body byte `$78`. The original hops to the carried object's parked placement,
///   which is unrecovered (#1007), so the port does nothing.
/// - `placed`: the hop. Nothing else is checked: not VOID, not interior, not the slot the player
///   stands in, and not the latch.
export type DigitTarget = 'carried' | 'placed' | 'unclaimed';

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
  switch (target(slot)) {
    case 'unclaimed':
      return { kind: 'refused' };
    case 'carried':
      return { kind: 'ignored' };
    case 'placed':
      return { kind: 'hop', slot };
  }
};

/// `$0591FA` writes the player's Y as the destination's resident Y plus `$3F`.
export const ARRIVAL_EYE_OFFSET = 0x3f;
