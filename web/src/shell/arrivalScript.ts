import type { BensonProgram, Instruction } from '../benson/index.ts';
import type { TextTable } from '../text/index.ts';

/// The beats of the opening Benson Script the Arrival has to recognise.
///
/// The Arrival's descent is synchronised to the opening script rather than to a stopwatch
/// (ADR 0032), so the shell has to know which message is playing. It cannot ask: the script's
/// text is inlined in its own instructions rather than addressed through the message table
/// (`notes/decode/text-tables.md`), and presentation only carries what a message says.
///
/// So the beats are resolved once, at boot, by walking script 0's own instructions and
/// composing their tokens through the same `TextTable` the interpreter composes them with. That
/// makes the classifier a fact about the loaded payload rather than a list of English strings
/// this file believes are in it: a re-export that renumbers a word still produces the text the
/// interpreter will produce, and a payload whose opening no longer has this shape fails here,
/// loudly, instead of leaving the Arrival watching for something that never comes.

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

const OPENING_SCRIPT = 0;

const failed = (reason: string): never => {
  throw new Error(`the opening Benson Script ${reason}`);
};

/// Whether an instruction continues straight into the next one.
///
/// The opening's commentary runs as one unbroken stretch — the first branch in it is the
/// buy-the-Dart argument, long after the join — so the walk stops at the first instruction
/// that could go somewhere else rather than trying to follow it.
const linear = (instruction: Instruction): boolean =>
  instruction.op !== 'jmp' &&
  instruction.op !== 'ret' &&
  !('onTaken' in instruction);

interface Spoken {
  readonly index: number;
  readonly text: string;
}

/// Every message the opening script plays, in order, until its first branch.
const spokenPrelude = (
  program: BensonProgram,
  text: TextTable
): readonly Spoken[] => {
  const entry = program.entries[OPENING_SCRIPT];
  if (entry === undefined) {
    return failed('is not in this Data Payload');
  }
  const spoken: Spoken[] = [];
  for (let index = entry; index < program.instructions.length; index += 1) {
    const instruction = program.instructions[index]!;
    switch (instruction.op) {
      case 'msg':
        spoken.push({ index, text: text.compose(instruction.tokens) });
        break;
      case 'msgi': {
        // A message read from a register cannot be resolved without running the script; the
        // opening addresses every one of its own by index.
        const composed =
          'immediate' in instruction.source
            ? text.message(instruction.source.immediate)
            : undefined;
        spoken.push({ index, text: composed ?? '' });
        break;
      }
      case 'msgr':
        // The random verdict is not one text but four, so it is recognised by its instruction
        // rather than folded into this list.
        spoken.push({ index, text: '' });
        break;
      default:
        break;
    }
    if (!linear(instruction)) {
      break;
    }
  }
  return spoken;
};

const verdictTexts = (
  program: BensonProgram,
  text: TextTable
): readonly string[] => {
  const entry = program.entries[OPENING_SCRIPT]!;
  for (let index = entry; index < program.instructions.length; index += 1) {
    const instruction = program.instructions[index]!;
    if (instruction.op === 'msgr') {
      const verdicts: string[] = [];
      for (let offset = 0; offset <= instruction.mask; offset += 1) {
        const composed = text.message(instruction.base + offset);
        if (composed === undefined || composed.length === 0) {
          return failed(
            `has a landing verdict at message ${instruction.base + offset} that this Data Payload does not carry`
          );
        }
        verdicts.push(composed);
      }
      return verdicts;
    }
    if (!linear(instruction)) {
      break;
    }
  }
  return failed('no longer picks a landing verdict before its first branch');
};

/// Resolve the opening script's beats from the payload the session is actually running.
export const resolveScript00Milestones = (
  program: BensonProgram,
  text: TextTable
): Script00Milestones => {
  const spoken = spokenPrelude(program, text);
  const verdictAt = spoken.findIndex(
    entry => program.instructions[entry.index]!.op === 'msgr'
  );
  if (verdictAt < 0) {
    return failed('no longer picks a landing verdict before its first branch');
  }
  // Empty texts are the script clearing the line between beats; they are not beats.
  const before = spoken.slice(0, verdictAt).filter(entry => entry.text !== '');
  const after = spoken.slice(verdictAt + 1).filter(entry => entry.text !== '');
  const [crashImminent, returningTo, manualControl] = before;
  const statusReport = after[0];
  if (
    before.length !== 3 ||
    crashImminent === undefined ||
    returningTo === undefined ||
    manualControl === undefined ||
    statusReport === undefined
  ) {
    return failed(
      `no longer plays three lines before its landing verdict and one after it (found ${before.length} and ${after.length})`
    );
  }
  const milestones: Script00Milestones = {
    crashImminent: crashImminent.text,
    manualControl: manualControl.text,
    returningTo: returningTo.text,
    statusReport: statusReport.text,
    verdicts: verdictTexts(program, text)
  };
  // Every beat has to be tellable from every other, or the descent would take a milestone
  // twice and skip one. Verdicts are deliberately compared as a set: which of the four plays
  // is random, and all four mean the same thing to the Arrival.
  const distinct = new Set([
    milestones.crashImminent,
    milestones.manualControl,
    milestones.returningTo,
    milestones.statusReport,
    ...milestones.verdicts
  ]);
  if (distinct.size !== 4 + milestones.verdicts.length) {
    return failed('no longer says something different at each of its beats');
  }
  return milestones;
};

/// Whether a program counter is inside the opening script.
///
/// The opening runs from its own entry up to wherever the next script begins. This is what has
/// the final say over a restored session: a landing verdict is the one beat ordinary play could
/// ever repeat word for word, and a game that has landed a Dart at leisure must not find itself
/// back in the Arrival because Benson said "GOOD LANDING," again.
export const withinOpeningScript = (
  program: BensonProgram,
  pc: number | undefined
): boolean => {
  const entry = program.entries[OPENING_SCRIPT];
  if (entry === undefined || pc === undefined) {
    return false;
  }
  const next = program.entries
    .filter(address => address > entry)
    .reduce(
      (lowest, address) => Math.min(lowest, address),
      Number.POSITIVE_INFINITY
    );
  return pc >= entry && pc < next;
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
