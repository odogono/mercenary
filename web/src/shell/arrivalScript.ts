/// The opening Talk Script's presentation contract with the Arrival. These
/// authored lines are checked against opening.talk by the outcome tests.
/// The Arrival's classification of whatever the opening script is currently saying.
export type Script00Beat =
  | 'crashImminent'
  | 'manualControl'
  | 'returningTo'
  | 'statusReport'
  | 'verdict';

export interface Script00Milestones {
  /// "CRASH IMMINENT," — the first line of the script's own commentary.
  readonly crashImminent: string;
  /// "MANUAL CONTROL" — the second half of the handback.
  readonly manualControl: string;
  /// "RETURNING TO - - -" — the first half of the handback.
  readonly returningTo: string;
  /// "STATUS REPORT" — the join: the first line the player sees from the ground, and where
  /// the Arrival ends.
  readonly statusReport: string;
  /// The four landing verdicts the script picks between at impact, in table order.
  readonly verdicts: readonly string[];
}

export const OPENING_MILESTONES: Script00Milestones = {
  crashImminent: 'CRASH IMMINENT,',
  manualControl: 'MANUAL CONTROL',
  returningTo: 'RETURNING TO - - -',
  statusReport: 'STATUS REPORT',
  verdicts: ['WHERE AM I', 'YOU CRASHED', 'GOOD LANDING,', 'OUCH,']
};

/// Which beat a playing message is, or undefined when it is none of them.
///
/// Takes the message's whole composed text rather than what is visible so far, so a beat is
/// recognised on the frame it begins: the descent's altitude anchors are the moments these
/// lines *start*, not the moments they finish.
export const script00BeatOf = (
  milestones: Script00Milestones,
  playing: string | undefined
): Script00Beat | undefined => {
  if (playing === undefined) {
    return undefined;
  }
  if (playing === milestones.crashImminent) {
    return 'crashImminent';
  }
  if (playing === milestones.returningTo) {
    return 'returningTo';
  }
  if (playing === milestones.manualControl) {
    return 'manualControl';
  }
  if (playing === milestones.statusReport) {
    return 'statusReport';
  }
  return milestones.verdicts.includes(playing) ? 'verdict' : undefined;
};
