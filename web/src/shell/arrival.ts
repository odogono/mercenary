import { BensonDisplay } from '../benson/index.ts';
import {
  ARRIVAL_TUNING,
  altitudeAt,
  arrivalCruisePose,
  arrivalPose,
  chasedAltitude,
  type ArrivalCameraPose
} from './arrivalCamera.ts';
import {
  ARRIVAL_NARRATION,
  ARRIVAL_TITLE,
  DESCENT_LINE,
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

/// Which clock the opening script should be running on.
export type ArrivalPacingChoice = 'arrival' | 'game';

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
  readonly setPacing: (pacing: ArrivalPacingChoice) => void;
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
  private altitude: number = ARRIVAL_TUNING.entryAltitude;
  private descentSeconds = 0;
  private blackoutLeft = 0;
  private lineElapsed = 0;

  constructor(options: ArrivalOptions) {
    this.bridge = options.bridge;
    this.milestones = options.milestones;
    this.narration = options.narration ?? ARRIVAL_NARRATION;
    this.pacing = options.pacing;
    this.display = new BensonDisplay(50, this.pacing.timeScale, 0);
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
        this.altitude = altitudeAt(options.entry.beat) ?? this.altitude;
        this.bridge.setPacing('arrival');
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
  /// The original flips them to live values on the frame the view becomes Targ's surface, and
  /// the altimeter counting down from there is most of the descent's tension.
  readsAsterisks(): boolean {
    return (
      this.phase === 'titleCard' ||
      this.phase === 'space' ||
      this.phase === 'planetApproach'
    );
  }

  pose(): ArrivalCameraPose {
    // The instruments are live from the first frame, but the ship is not falling yet: in space it
    // is under way and level, and the fall starts when the view becomes Targ's surface.
    return this.readsAsterisks()
      ? arrivalCruisePose(this.altitude)
      : arrivalPose(this.altitude, this.descentSeconds);
  }

  /// How far through the space segment the field has drifted, and how much of it the planet
  /// covers.
  fieldProgress(): { readonly drift: number; readonly planet: number } {
    const drift =
      this.line < 0 ? 0 : Math.min(1, this.line / Math.max(1, DESCENT_LINE));
    if (this.phase !== 'planetApproach') {
      return { drift, planet: 0 };
    }
    // The planet grows across the one line it appears on, from a dot to larger than the frame.
    return { drift, planet: 0.02 + 1.6 * this.lineProgress() };
  }

  private lineProgress(): number {
    const item = this.narration[this.line];
    if (item === undefined) {
      return 0;
    }
    const total = this.displaySecondsFor(item) + this.holdFor(item);
    return Math.min(1, total <= 0 ? 1 : this.lineElapsed / total);
  }

  /// The Arrival's own hold clock is separate from the shell-owned Benson Display so the four
  /// countdown lines can retain their shorter authored holds without changing the component.
  private heldSeconds = 0;

  private holdFor(item: NarrationItem | undefined): number {
    return this.pacing.holdSeconds * (item?.holdScale ?? 1);
  }

  /// Preserve the authored line duration by putting any time beyond the authentic half-second
  /// scanout into the same silent interval the in-game display uses.
  private intervalFor(item: NarrationItem): number {
    const desired =
      [...item.text].length / Math.max(0.001, this.pacing.charactersPerSecond);
    const active = BensonDisplay.activeFrames / 50;
    const waiting = Math.max(0, desired - active);
    return Math.max(
      26,
      BensonDisplay.activeFrames +
        Math.round(waiting * 50 * Math.max(0, this.pacing.timeScale))
    );
  }

  private displaySecondsFor(item: NarrationItem): number {
    const interval = this.intervalFor(item);
    return (
      BensonDisplay.activeFrames / 50 +
      (interval - BensonDisplay.activeFrames) /
        (50 * Math.max(0.001, this.pacing.timeScale))
    );
  }

  private beginLine(index: number): void {
    this.line = index;
    const item = this.narration[index];
    if (item === undefined) {
      this.handOver();
      return;
    }
    this.display.start(arrivalDisplaySource(item.text), this.intervalFor(item));
    this.heldSeconds = 0;
    this.lineElapsed = 0;
    this.phase =
      index >= DESCENT_LINE
        ? 'descent'
        : index >= PLANET_APPROACH_LINE
          ? 'planetApproach'
          : 'space';
  }

  private handOver(): void {
    this.handedOver = true;
    this.phase = 'descent';
    // The opening script has been waiting since the session was built, unadvanced. Its clock is
    // chosen before it gets its first step, so its first line reveals at the Arrival's rhythm
    // rather than at the game's.
    this.bridge.setPacing('arrival');
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
    this.descentSeconds += seconds;
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
      this.altitude = chasedAltitude(this.altitude, this.beat, seconds);
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
    this.lineElapsed += seconds;
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
      // The join. The game is the player's from here, at the game's own pace.
      this.bridge.setPacing('game');
      this.phase = 'done';
      return 'join';
    }
    const anchor = altitudeAt(heard);
    if (anchor !== undefined) {
      this.altitude = anchor;
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
