/// Replays a Benson script-0 Golden Trace's inputs against the opening Talk
/// Script and prints where the message sequences diverge. A diff baseline,
/// not a gate: the Talk Script is a free rewrite.
///
///   bun spike/northtalk/trace-diff.ts [trace id …]   (default: script-0-parked script-0-answered)
import { readFileSync } from 'node:fs';

import { parseBensonKey } from '../../src/benson/index.ts';
import { openTalkSession } from './session.ts';

const STEP = 1 / 50;

interface Played {
  readonly at: number;
  readonly text: string;
}

const traceMessages = (id: string) => {
  const lines = readFileSync(
    new URL(`../../../traces/benson/${id}.jsonl`, import.meta.url),
    'utf8'
  )
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const header = lines[0];
  const played: Played[] = [];
  for (const record of lines.slice(1)) {
    for (const effect of record.effects ?? []) {
      if (typeof effect === 'object' && effect?.playMessage) {
        played.push({ at: record.elapsed, text: effect.playMessage });
      }
    }
  }
  return {
    played,
    presses: header.scenario.presses as { at: number; key: string }[],
    seconds: header.scenario.seconds as number
  };
};

const talkMessages = async (
  presses: readonly { at: number; key: string }[],
  seconds: number
) => {
  const session = await openTalkSession({
    random: () => 2,
    scripts: ['opening']
  });
  const advanceTo = (at: number) => {
    while (session.talk.now < at - 1e-9) {
      session.advance(Math.min(STEP, at - session.talk.now));
    }
  };
  for (const press of presses) {
    advanceTo(press.at);
    session.press(parseBensonKey(`key${press.key.toUpperCase()}`));
  }
  advanceTo(seconds);
  return session.talk.played;
};

/// Longest-common-subsequence alignment of two message sequences.
const align = (a: readonly Played[], b: readonly Played[]) => {
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i]!.text === b[j]!.text
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const rows: [Played | undefined, Played | undefined][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i]!.text === b[j]!.text) {
      rows.push([a[i++], b[j++]]);
    } else if (
      j >= b.length ||
      (i < a.length && table[i + 1]![j]! >= table[i]![j + 1]!)
    ) {
      rows.push([a[i++], undefined]);
    } else {
      rows.push([undefined, b[j++]]);
    }
  }
  return rows;
};

const cell = (played: Played | undefined) =>
  played === undefined
    ? ''.padEnd(32)
    : `${played.at.toFixed(1).padStart(6)} ${JSON.stringify(played.text)}`.padEnd(
        32
      );

const ids = process.argv.slice(2);
for (const id of ids.length > 0
  ? ids
  : ['script-0-parked', 'script-0-answered']) {
  const benson = traceMessages(id);
  const talk = await talkMessages(benson.presses, benson.seconds);
  console.log(
    `\n${id}: presses ${JSON.stringify(benson.presses)}, ${benson.seconds} s`
  );
  console.log(`${'  Benson (s, text)'.padEnd(34)}  Talk (s, text)`);
  for (const [left, right] of align(benson.played, talk)) {
    const mark = left && right ? ' ' : left ? '-' : '+';
    console.log(`${mark} ${cell(left)}  ${cell(right)}`);
  }
}
