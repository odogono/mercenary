import type { Size } from '../projection/index.ts';
import type { RGB8 } from '../scene/index.ts';
import type { DepartureSettings } from '../settings/index.ts';
import type { SkyState } from '../sky/index.ts';
import { arrivalFieldPlan } from './arrivalField.ts';
import type { FramePlan } from './frame.ts';

/// The Departure: the authored, shell-owned opening in which the player chooses a Destination by
/// choosing where to fly (ADR 0040).
///
/// It runs in five states and only forwards: the carousel of Destinations in deep space, then
/// once one is committed a single continuous journey — interstellar run, flyby past the chosen
/// system's bodies, convergence — that ends on the exact planet-free first frame of the Arrival
/// Field. The Arrival (ADR 0032) begins there, untouched: `M E R C E N A R Y` stays its first
/// beat and it alone owns the later planet approach.
///
/// **The Departure never touches the session.** Unlike the Arrival it has no bridge to one: it
/// gives the session no time, reads nothing from it and checkpoints nothing, which is why a
/// reload from deep space returns to deep space and why a Departure that is fast-forwarded and
/// one that is watched hand the Arrival the identical untouched session.
///
/// The carousel offers only Destinations that exist. This release offers one; the snap model is
/// kept for the entries later releases add, and is exercised by the tests with abstract entries
/// rather than by teasing anything in the app.

/// One playable experience the Departure can commit to.
export interface Destination {
  /// The name the carousel shows.
  readonly name: string;
  /// Where the player will land, as the carousel says it.
  readonly place: string;
  /// The identifier a Save and a Session Resume will one day store (ADR 0041).
  readonly slug: string;
}

export const TARG_DESTINATION: Destination = {
  name: 'TARG',
  place: 'GAMMA FIVE · ORIGINAL CITY',
  slug: 'targ'
};

/// Every Destination that exists, in carousel order (ADR 0040: no locked or teased entries).
export const DESTINATIONS: readonly Destination[] = [TARG_DESTINATION];

export type DeparturePhaseKind =
  'carousel' | 'convergence' | 'done' | 'flyby' | 'interstellar';

export type DeparturePhase = { readonly kind: DeparturePhaseKind };

/// Whether the journey plays in full or as the shorter, calmer reduced-motion variant.
export type DepartureMotion = 'full' | 'reduced';

export const departureMotionFor = (
  prefersReducedMotion: boolean
): DepartureMotion => (prefersReducedMotion ? 'reduced' : 'full');

/// Where a Departure is starting from: at the carousel, or already over because a game is
/// already under way (a Session Resume, a loaded Save).
export type DepartureEntry = 'carousel' | 'done';

/// A celestial body the flyby shows, bound to the authority that names it.
export interface DepartureBody {
  readonly colour: RGB8;
  /// Diameter relative to the largest body in the roster.
  readonly relativeSize: number;
}

export interface DepartureOptions {
  readonly bodies: readonly DepartureBody[];
  readonly destinations: readonly Destination[];
  readonly entry: DepartureEntry;
  readonly motion: DepartureMotion;
  readonly settings: DepartureSettings;
}

/// How the journey is divided: interstellar run, flyby, convergence. Settled by the prototype
/// (`docs/research/departure-opening-prototype.md`).
const JOURNEY_SHARES = [0.3, 0.4, 0.3] as const;

/// How far the field drifts over the journey, in the Arrival Field's own drift units. The
/// reduced-motion variant keeps the same division of the journey with a fraction of the travel.
const FIELD_DRIFT: Readonly<Record<DepartureMotion, number>> = {
  full: 8,
  reduced: 0.6
};

/// The critically damped snap's stiffness. Normalised so the response reaches the target at
/// exactly the configured settle time, and clamped so it can never overshoot.
const SNAP_OMEGA = 7;

/// How many triangles a body's disc is drawn with.
const DISC_SEGMENTS = 48;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/// Targ's roster: its sun and two moons, in the Targ Orrery's own colours and relative angular
/// sizes (ADR 0025). Read from the sky model rather than copied, so the flyby cannot drift from
/// the sky the player later sees. Their screen spacing and path are choreography, not astronomy.
export const departureBodiesFrom = (
  sky: SkyState
): readonly DepartureBody[] => {
  const discs = [sky.sun, sky.moons[0], sky.moons[1]];
  const largest = Math.max(...discs.map(disc => disc.angularDiameterRadians));
  return discs.map(disc => ({
    colour: disc.litColour,
    relativeSize: disc.angularDiameterRadians / largest
  }));
};

const discVertices = (
  centreX: number,
  centreY: number,
  radius: number
): Float32Array => {
  const vertices: number[] = [];
  for (let segment = 0; segment < DISC_SEGMENTS; segment += 1) {
    const from = (segment / DISC_SEGMENTS) * Math.PI * 2;
    const to = ((segment + 1) / DISC_SEGMENTS) * Math.PI * 2;
    vertices.push(
      centreX,
      centreY,
      centreX + radius * Math.cos(from),
      centreY + radius * Math.sin(from),
      centreX + radius * Math.cos(to),
      centreY + radius * Math.sin(to)
    );
  }
  return new Float32Array(vertices);
};

/// A critically damped response, normalised to reach 1 at unit time.
export const snapResponse = (unit: number): number => {
  const clamped = clamp01(unit);
  if (clamped >= 1) {
    return 1;
  }
  const response =
    1 - Math.exp(-SNAP_OMEGA * clamped) * (1 + SNAP_OMEGA * clamped);
  const atSettle = 1 - Math.exp(-SNAP_OMEGA) * (1 + SNAP_OMEGA);
  return clamp01(response / atSettle);
};

export class DepartureDirector {
  private readonly bodies: readonly DepartureBody[];
  private readonly destinations: readonly Destination[];
  private readonly motion: DepartureMotion;
  private readonly settings: DepartureSettings;

  private phase: DeparturePhaseKind;
  /// The carousel's continuous position along its track, in entries; the resting place it is
  /// settling towards; and where the current settle started from. The track is continuous
  /// rather than wrapped so a settle always runs the short way; the entry it names is the
  /// position modulo the roster.
  private position = 0;
  private snapTarget = 0;
  private snapFrom = 0;
  private snapElapsed = 0;
  private commitPending = false;
  private journeyElapsed = 0;

  constructor(options: DepartureOptions) {
    if (options.destinations.length === 0) {
      throw new Error('the Departure needs at least one Destination');
    }
    this.bodies = options.bodies;
    this.destinations = options.destinations;
    this.motion = options.motion;
    this.settings = options.settings;
    this.phase = options.entry === 'carousel' ? 'carousel' : 'done';
  }

  current(): DeparturePhase {
    return { kind: this.phase };
  }

  isActive(): boolean {
    return this.phase !== 'done';
  }

  atCarousel(): boolean {
    return this.phase === 'carousel';
  }

  /// Whether the committed journey is under way: the only time the Departure can be hurried.
  inJourney(): boolean {
    return this.isActive() && this.phase !== 'carousel';
  }

  /// The Destination the carousel is snapped to, or is settling towards.
  selected(): Destination {
    const count = this.destinations.length;
    const index = ((Math.round(this.snapTarget) % count) + count) % count;
    return this.destinations[index]!;
  }

  /// The carousel's position in entries, for laying the track out. Continuous while settling.
  carouselPosition(): number {
    return this.position;
  }

  /// How far through the committed journey the Departure is, from 0 to 1.
  journeyProgress(): number {
    return clamp01(this.journeyElapsed / this.journeySeconds());
  }

  /// Turn the carousel one entry, wrapping. Direction input retargets immediately, even mid-snap.
  /// With a single Destination there is nowhere to turn to.
  select(delta: -1 | 1): void {
    if (this.phase !== 'carousel' || this.destinations.length < 2) {
      return;
    }
    this.snapFrom = this.position;
    this.snapElapsed = 0;
    this.snapTarget += delta;
  }

  /// Commit the Destination the carousel is settling on. A commit during a settle waits for the
  /// settle to finish, so the journey always leaves from a resting carousel.
  commit(): void {
    if (this.phase !== 'carousel') {
      return;
    }
    if (this.position !== this.snapTarget) {
      this.commitPending = true;
      return;
    }
    this.beginJourney();
  }

  /// Fast-forward the journey to the join. Nothing from the carousel: the journey can only be
  /// hurried once it is under way, and the carousel offers only a commit.
  skipJourney(): void {
    if (!this.inJourney()) {
      return;
    }
    this.journeyElapsed = this.journeySeconds();
    this.phase = 'done';
  }

  step(seconds: number): void {
    if (seconds <= 0 || this.phase === 'done') {
      return;
    }
    if (this.phase === 'carousel') {
      this.stepCarousel(seconds);
      return;
    }
    const duration = this.journeySeconds();
    this.journeyElapsed = Math.min(duration, this.journeyElapsed + seconds);
    const progress = this.journeyElapsed / duration;
    const flybyStart = JOURNEY_SHARES[0];
    const flybyEnd = flybyStart + JOURNEY_SHARES[1];
    this.phase =
      progress >= 1
        ? 'done'
        : progress >= flybyEnd
          ? 'convergence'
          : progress >= flybyStart
            ? 'flyby'
            : 'interstellar';
  }

  /// The frame one moment of the Departure draws.
  ///
  /// Every frame is the Arrival Field itself — the same stars, from the same seed — offset by a
  /// drift that the journey runs down to nothing, with the roster's discs laid over it. The final
  /// frame is therefore not a copy of the Arrival's first frame but the same plan, which is what
  /// makes the handover a fact rather than a resemblance.
  framePlan(size: Size): FramePlan {
    if (this.phase === 'done') {
      return arrivalFieldPlan({ drift: 0, planet: 0 }, size);
    }
    const progress = this.journeyProgress();
    const travel = FIELD_DRIFT[this.motion];
    // The carousel sits at the drift the journey leaves from, so commit does not move a star.
    const drift = this.phase === 'carousel' ? travel : travel * (1 - progress);
    const base = arrivalFieldPlan({ drift, planet: 0 }, size);
    const batches = [...base.batches];
    const flybyStart = JOURNEY_SHARES[0];
    const flybyEnd = flybyStart + JOURNEY_SHARES[1];
    const localFlyby = clamp01(
      (progress - flybyStart) / (flybyEnd - flybyStart)
    );
    const atCarousel = this.phase === 'carousel';
    const flybyScale =
      progress >= flybyStart && progress <= flybyEnd
        ? Math.sin(localFlyby * Math.PI)
        : 0;
    const baseRadius = Math.min(size.width, size.height) * 0.075;
    for (const [index, body] of this.bodies.entries()) {
      const spread = index - (this.bodies.length - 1) / 2;
      // A tableau behind the carousel entry; a sweep from right to left during the flyby.
      const centreX = atCarousel
        ? size.width * (0.5 + spread * 0.13)
        : size.width * (1.15 - localFlyby * 1.3 + spread * 0.22);
      const centreY = size.height * (0.43 + spread * 0.11);
      const scale = atCarousel ? 1 : flybyScale;
      if (scale <= 0) {
        continue;
      }
      batches.push({
        colour: body.colour,
        mode: 'triangles',
        pointSize: 1,
        vertices: discVertices(
          centreX,
          centreY,
          baseRadius * body.relativeSize * scale
        )
      });
    }
    return { ...base, batches };
  }

  private journeySeconds(): number {
    return this.motion === 'reduced'
      ? this.settings.reducedMotionJourneySeconds
      : this.settings.journeySeconds;
  }

  private stepCarousel(seconds: number): void {
    if (this.position === this.snapTarget) {
      return;
    }
    const settle = this.settings.snapSeconds;
    this.snapElapsed = Math.min(settle, this.snapElapsed + seconds);
    const amount = snapResponse(this.snapElapsed / settle);
    this.position = this.snapFrom + (this.snapTarget - this.snapFrom) * amount;
    if (this.snapElapsed >= settle) {
      this.position = this.snapTarget;
      if (this.commitPending) {
        this.beginJourney();
      }
    }
  }

  private beginJourney(): void {
    this.commitPending = false;
    this.journeyElapsed = 0;
    this.phase = 'interstellar';
  }
}
