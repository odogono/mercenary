import { BensonDisplay } from '../benson/index.ts';
import {
  ARRIVAL_TUNING,
  arrivalCruisePose,
  arrivalPose,
  fallAltitude,
  planetCoverage,
  profileFloor,
  profileRate,
  profileSecondsAt,
  type ArrivalCameraPose
} from './arrivalCamera.ts';
import {
  ARRIVAL_NARRATION,
  ARRIVAL_TITLE,
  PLANET_APPROACH_LINE,
  type NarrationItem
} from './arrivalNarration.ts';
import {
  script00BeatOf,
  type Script00Beat,
  type Script00Milestones
} from './arrivalScript.ts';

/// The Arrival: the authored opening the Browser Shell plays before the game is in the player's
/// hands (ADR 0032).
///
/// It runs in seven states and only forwards. Four of them are the shell's alone — the title
/// card, the space segment, the planet approach and the blackout — and the other three are the
/// opening Benson Script's own beats, watched rather than driven. The Arrival never touches
/// Session State: the session it hands over to is the same session the game would have started
/// with, standing at the same Pose, and every difference is in what is drawn and what the panel
/// reads.
///
/// **The session is idle until the handover.** That is what makes skipping honest. Before the
/// handover there is nothing to skip past but the shell's own narration; after it, the session
/// has received a run of fixed steps and nothing else, so replaying that run as fast as the
/// loop will go reaches the identical state. A skipped Arrival and a watched one are the same
/// game.

export type ArrivalPhaseKind =
  | 'blackout'
  | 'descent'
  | 'done'
  | 'groundVerdict'
  | 'planetApproach'
  | 'space'
  | 'titleCard';

export type ArrivalPhase = { readonly kind: ArrivalPhaseKind };

/// Where an Arrival is starting from.
///
/// A fresh session gets the whole sequence. A restored one gets whatever is left of it: the
/// Session Resume record has no Arrival in it, deliberately, so the only thing that says how far
/// the opening had got is the opening script itself.
export type ArrivalEntry =
  | { readonly kind: 'done' }
  | { readonly kind: 'fresh' }
  | { readonly beat: Script00Beat; readonly kind: 'resumed' };

/// How the Arrival paces its own narration, already scaled.
export interface ArrivalPacing {
  readonly charactersPerSecond: number;
  readonly holdSeconds: number;
  readonly timeScale: number;
  readonly titleCardSeconds: number;
}

/// Everything the Arrival needs from the session it is presenting over.
///
/// A narrow seam rather than the session itself: the Arrival may give the session time, choose
/// which clock its scripts run on, and ask what it is currently saying. It may not reach
/// anything else, which is what keeps the authored opening out of Game Semantics.
///
/// Notably it cannot *start* the opening script. The script is already started, by the walkabout,
/// as it always was; what the Arrival withholds is time. Holding a started script rather than
/// deferring its start is what makes a Save taken mid-opening restore into a game that still has
/// its opening to play.
export interface ArrivalSessionBridge {
  /// Advance the session by one fixed step, exactly as the frame loop would.
  readonly advance: (seconds: number) => void;
  /// The whole composed text of the message playing now, or undefined for none.
  readonly playingMessage: () => string | undefined;
}

export interface ArrivalOptions {
  readonly bridge: ArrivalSessionBridge;
  readonly entry: ArrivalEntry;
  readonly milestones: Script00Milestones;
  readonly narration?: readonly NarrationItem[];
  readonly pacing: ArrivalPacing;
}

/// How long the impact blacks the screen out for.
const BLACKOUT_SECONDS = 0.9;

/// A bound on the fast-forward, well past any pacing the settings could ask for. Reaching it
/// means the join will never arrive, which is a defect rather than a slow opening.
const SKIP_STEP_LIMIT = 40_000;

const STEP_SECONDS = 1 / 60;

/// Centre one fitting authored line inside the recovered 25-shift burst.
///
/// Two leading cells are sacrificed as the 25 inputs pass through 23 cells. The last cell is
/// supplied by the source terminator, so a fitting line completes in one burst and leaves its
/// actual cells behind for the next line, just like decoded Benson text does.
const arrivalDisplaySource = (text: string): string => {
  const points = [...text];
  if (points.length >= BensonDisplay.width) {
    return text;
  }
  const empty = BensonDisplay.width - points.length;
  const left = Math.floor(empty / 2);
  const right = empty - left;
  const cells = [
    ...Array.from({ length: left }, () => ' '),
    ...points,
    ...Array.from({ length: right }, () => ' ')
  ];
  return `  ${cells.slice(0, -1).join('')}`;
};

export class ArrivalDirector {
  private readonly bridge: ArrivalSessionBridge;
  private readonly milestones: Script00Milestones;
  private readonly narration: readonly NarrationItem[];
  private readonly pacing: ArrivalPacing;

  private phase: ArrivalPhaseKind;
  private titleHeld = 0;
  private line = -1;
  private readonly display: BensonDisplay;
  private handedOver = false;
  private beat: Script00Beat | undefined;
  /// Where the fall is on the recording's curve, in seconds before impact (`arrivalCamera.ts`).
  private profile: number = ARRIVAL_TUNING.profile.planetAppears;
  /// Seconds since the view turned to look down, which is what the road plan's turn follows.
  private spinSeconds = 0;
  /// The approach's own clock: from the line Targ appears on to the handover.
  private approachSeconds = 0;
  private approachTotal = 0;
  private blackoutLeft = 0;

  constructor(options: ArrivalOptions) {
    this.bridge = options.bridge;
    this.milestones = options.milestones;
    this.narration = options.narration ?? ARRIVAL_NARRATION;
    this.pacing = options.pacing;
    this.display = new BensonDisplay(0, { clearsAfterHold: false });
    switch (options.entry.kind) {
      case 'done':
        this.phase = 'done';
        break;
      case 'fresh':
        this.phase = 'titleCard';
        break;
      case 'resumed':
        this.phase =
          options.entry.beat === 'verdict' ? 'groundVerdict' : 'descent';
        this.handedOver = true;
        this.beat = options.entry.beat;
        this.profile =
          profileSecondsAt(options.entry.beat) ??
          ARRIVAL_TUNING.profile.surface;
        break;
    }
  }

  /// Which entry a session that is already running the opening script deserves.
  ///
  /// Only the opening script's own beats put a session back into the Arrival. Anything else it
  /// could be saying — including a landing verdict from ordinary play, were one ever spoken
  /// outside the opening — leaves the Arrival over, because a restored game is a game.
  static entryFor(
    milestones: Script00Milestones,
    playing: string | undefined,
    withinOpeningScript: boolean
  ): ArrivalEntry {
    const beat = withinOpeningScript
      ? script00BeatOf(milestones, playing)
      : undefined;
    return beat === undefined || beat === 'statusReport'
      ? { kind: 'done' }
      : { beat, kind: 'resumed' };
  }

  current(): ArrivalPhase {
    return { kind: this.phase };
  }

  isActive(): boolean {
    return this.phase !== 'done';
  }

  /// Whether the shell should hold the player's keys.
  ///
  /// True for the whole Arrival, including the seconds of ground view the landing verdict is
  /// read over: the game is not yet the player's, and the status report is where it becomes so.
  gatesInput(): boolean {
    return this.isActive();
  }

  /// Whether the frame loop should advance the session itself.
  ///
  /// False for the whole Arrival: before the handover there is nothing to advance, and after it
  /// the Arrival advances the session itself, so that a skipped run presents the session with
  /// exactly the run of steps a watched one did.
  ownsSession(): boolean {
    return this.isActive();
  }

  /// What the message line shows, or undefined once the opening script owns it.
  narrationText(): string | undefined {
    if (!this.isActive() || this.handedOver) {
      return undefined;
    }
    return this.phase === 'titleCard'
      ? ARRIVAL_TITLE
      : this.display.readingText(this.narration[this.line]?.text);
  }

  /// Whether the panel's readouts are still asterisks.
  ///
  /// The original's are until the height fits the altimeter's five digits, well after the view
  /// has turned to the ground; then every readout turns to a number on the same frame, and the
  /// count down from there is most of the descent's tension.
  readsAsterisks(): boolean {
    return (
      this.inSpace() || this.altitude() >= ARRIVAL_TUNING.measurableAltitude
    );
  }

  pose(): ArrivalCameraPose {
    // The instruments are live from the first frame. In space the ship is level with Targ
    // ahead; from the handover it looks straight down.
    return this.inSpace()
      ? arrivalCruisePose(this.altitude())
      : arrivalPose(this.altitude(), this.spinSeconds);
  }

  private inSpace(): boolean {
    return (
      this.phase === 'titleCard' ||
      this.phase === 'space' ||
      this.phase === 'planetApproach'
    );
  }

  private altitude(): number {
    return fallAltitude(this.profile);
  }

  /// How far through the space segment the field has drifted, and how much of it the planet
  /// covers.
  fieldProgress(): { readonly drift: number; readonly planet: number } {
    const drift =
      this.line < 0
        ? 0
        : Math.min(1, this.line / Math.max(1, this.narration.length));
    if (this.phase !== 'planetApproach') {
      return { drift, planet: 0 };
    }
    // Targ's apparent size at the fall's height: a dot that creeps, then rushes, and fills the
    // screen as the narration hands over.
    return { drift, planet: planetCoverage(this.altitude()) };
  }

  /// The Arrival's own hold clock is separate from the shell-owned Benson Display so the four
  /// countdown lines can retain their shorter authored holds without changing the component.
  private heldSeconds = 0;

  private holdFor(item: NarrationItem | undefined): number {
    return this.pacing.holdSeconds * (item?.holdScale ?? 1);
  }

  /// Preserve the authored line duration by putting any time beyond the half-second burst into
  /// the silent wait the in-game display uses.
  private waitFor(item: NarrationItem): number {
    const desired =
      [...item.text].length / Math.max(0.001, this.pacing.charactersPerSecond);
    return Math.max(0, desired - this.burstSeconds);
  }

  private displaySecondsFor(item: NarrationItem): number {
    return this.burstSeconds + this.waitFor(item);
  }

  private get burstSeconds(): number {
    return BensonDisplay.burstShifts * this.display.shiftSeconds;
  }

  private beginLine(index: number): void {
    this.line = index;
    const item = this.narration[index];
    if (item === undefined) {
      this.handOver();
      return;
    }
    this.display.start(arrivalDisplaySource(item.text), this.waitFor(item));
    this.heldSeconds = 0;
    if (index === PLANET_APPROACH_LINE) {
      // The approach spans every line left, so the disc fills the screen at the handover
      // whatever the pacing.
      this.approachSeconds = 0;
      this.approachTotal = this.narration
        .slice(index)
        .reduce(
          (total, line) =>
            total + this.displaySecondsFor(line) + this.holdFor(line),
          0
        );
    }
    this.phase = index >= PLANET_APPROACH_LINE ? 'planetApproach' : 'space';
  }

  private handOver(): void {
    this.handedOver = true;
    this.phase = 'descent';
    this.profile = Math.min(this.profile, ARRIVAL_TUNING.profile.surface);
  }

  /// One fixed step of the Arrival.
  ///
  /// Before the handover this is the shell's narration alone. After it, this is where the
  /// session is advanced — one step, exactly as the frame loop would have — and the beat it is
  /// now saying decides the fall.
  step(seconds: number): void {
    if (this.phase === 'done' || seconds <= 0) {
      return;
    }
    if (!this.handedOver) {
      this.stepNarration(seconds);
      return;
    }
    this.bridge.advance(seconds);
    this.spinSeconds += seconds;
    if (this.observeBeat() === 'join') {
      return;
    }
    if (this.phase === 'blackout') {
      this.blackoutLeft -= seconds;
      if (this.blackoutLeft <= 0) {
        this.phase = 'groundVerdict';
      }
      return;
    }
    if (this.phase === 'descent') {
      this.profile = Math.max(
        profileFloor(this.beat),
        this.profile - profileRate(this.beat) * seconds
      );
    }
  }

  private stepNarration(seconds: number): void {
    if (this.phase === 'titleCard') {
      this.titleHeld += seconds;
      if (this.titleHeld >= this.pacing.titleCardSeconds) {
        this.beginLine(0);
      }
      return;
    }
    const item = this.narration[this.line];
    if (item === undefined) {
      this.handOver();
      return;
    }
    this.display.advance(seconds);
    if (this.phase === 'planetApproach') {
      const { planetAppears, surface } = ARRIVAL_TUNING.profile;
      this.approachSeconds += seconds;
      const progress = Math.min(
        1,
        this.approachSeconds / Math.max(1e-9, this.approachTotal)
      );
      this.profile = planetAppears - (planetAppears - surface) * progress;
    }
    if (this.display.isFinished) {
      this.heldSeconds += seconds;
    }
    if (this.display.isFinished && this.heldSeconds >= this.holdFor(item)) {
      this.beginLine(this.line + 1);
    }
  }

  private observeBeat(): 'heard' | 'join' {
    const heard = script00BeatOf(this.milestones, this.bridge.playingMessage());
    if (heard === undefined || heard === this.beat) {
      return 'heard';
    }
    this.beat = heard;
    if (heard === 'statusReport') {
      // The join. The game is the player's from here.
      this.phase = 'done';
      return 'join';
    }
    // A beat pins the fall to its place on the curve. One that comes early pulls the fall down
    // to it; a late one has been held at it already.
    const anchor = profileSecondsAt(heard);
    if (anchor !== undefined) {
      this.profile = Math.min(this.profile, anchor);
    }
    if (heard === 'verdict') {
      this.phase = 'blackout';
      this.blackoutLeft = BLACKOUT_SECONDS;
    }
    return 'heard';
  }

  /// Fast-forward to the join.
  ///
  /// The narration is the shell's own, so it is simply finished. The opening script is not: it
  /// is run, in the same fixed steps and through the same code, until it reaches the status
  /// report. Both paths therefore give the same waiting script the identical run of steps, and
  /// the state at the join is the same either way.
  skipToJoin(): void {
    if (!this.isActive()) {
      return;
    }
    if (!this.handedOver) {
      this.handOver();
    }
    for (let step = 0; step < SKIP_STEP_LIMIT; step += 1) {
      this.step(STEP_SECONDS);
      if (!this.isActive()) {
        return;
      }
    }
    throw new Error('the Arrival could not reach the opening status report');
  }
}
