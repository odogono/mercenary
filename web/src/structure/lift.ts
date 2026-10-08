/// The Lift that Damocles and Mercenary III share: a structure region whose flags have bit 13.
///
/// Both programs carry the same request, step and arrival code, instruction for instruction
/// (docs/research/damocles-lift-control.md, docs/research/damocles-lift-ride.md and
/// docs/research/mercenary-iii-lift.md). The Damocles addresses come first and the
/// Mercenary III ones follow in brackets. A ride is the request, the label stepping once the
/// door it pins is shut, and the arrival one period after the label shows the destination.
/// Each title binds its own Floor's structure and doors on arrival.

/// Region flags bit 13 marks a lift car.
export const LIFT_REGION = 0x20_00;

/// `$788C` (`$6F3C`): the step period in ticks, a constant 25.
export const LIFT_STEP_TICKS = 25;

/// The highest Floor: the Floor Table's level 10, which the lift labels `B`.
export const HIGHEST_FLOOR = 10;

/// The pitch word the arrival writes, `$055BA6` (`$56E34`): the view is levelled.
export const ARRIVAL_PITCH_WORD = 0x01_ff;

/// A ride between admission and arrival. The region stays frozen for the whole ride
/// (`$05A35C`, `$5B320`), so the player is still in the lift it began in.
export interface LiftRide {
  /// `$788E` (`$6F3E`): ticks until the next step, 1 to 25. It runs only while the pinned
  /// door is shut.
  readonly countdown: number;
  /// `$788A` (`$6F3A`): the Floor asked for. A later admitted key replaces it.
  readonly destination: number;
  /// `$7AC4` (`$7158`): the Floor the Floor Label shows, stepped one Floor at a time along
  /// B, G, 1 … 9.
  readonly label: number;
}

/// The Floor the label shows after one step towards `destination`: `$055A88`–`$055AB2`
/// (`$56D0E`–`$56D3A`). The lift walks B, G, 1, … 9, so Floor 10 is below Floor 0 and is
/// always reached going down.
export const nextLabel = (label: number, destination: number): number =>
  destination < label || destination === 10
    ? label === 10
      ? 0
      : label === 0
        ? 10
        : label - 1
    : label + 1;

/// A lift key asking for `floor`: `$055AE0` (`$56D66`). The Floor the label shows now, or one
/// the Floor Table leaves zero, is refused and changes nothing: null. Otherwise the ride
/// starts, or during one its destination is replaced; the countdown carries on from where it
/// stands. The caller pins the doorway's door shut.
export const requestLift = (
  ride: LiftRide | null,
  label: number,
  floor: number,
  bound: (floor: number) => boolean
): LiftRide | null =>
  floor === label || !bound(floor)
    ? null
    : {
        countdown: ride?.countdown ?? LIFT_STEP_TICKS,
        destination: floor,
        label
      };

/// One tick of a pending ride: `$055A6E` (`$56CF4`), which the on-foot loop calls once a
/// substep. Nothing counts while the pinned door is still moving. When the period runs out
/// the label steps, or, once it shows the destination, the player arrives.
export const stepLift = (
  ride: LiftRide,
  doorShut: boolean
):
  | { readonly kind: 'arrive' }
  | { readonly kind: 'ride'; readonly ride: LiftRide } => {
  if (!doorShut) {
    return { kind: 'ride', ride };
  }
  if (ride.countdown > 1) {
    return { kind: 'ride', ride: { ...ride, countdown: ride.countdown - 1 } };
  }
  if (ride.label !== ride.destination) {
    return {
      kind: 'ride',
      ride: {
        countdown: LIFT_STEP_TICKS,
        destination: ride.destination,
        label: nextLabel(ride.label, ride.destination)
      }
    };
  }
  return { kind: 'arrive' };
};

/// The character code the Floor Label shows for `floor`: `G` for Floor 0, `B` for Floor 10
/// and the digit otherwise (`$055AB8`, `$56D40`–`$56D5E`).
export const floorLabelCode = (floor: number): number =>
  floor === 0 ? 0x47 : floor === 10 ? 0x42 : 0x30 + floor;
