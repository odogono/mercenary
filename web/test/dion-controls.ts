import type { DionContent } from '../src/dion/content.ts';
import { DionSession, type DionAction } from '../src/dion/session.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { frames, press, until } from './dion-journey.ts';

// R3's 33 controls on six trajectories, expressed by semantic checkpoints at the
// accepted cadence rather than importing original-engine VBL/CPU timing.
const checkpoints = {
  sol: [
    'mid-reveal',
    'called',
    'waiting',
    'mid-walk',
    'B-pre',
    'B-post',
    'selected',
    'Start-pre',
    'departure',
    'scroll',
    'clear-pre',
    'descending',
    'dwell',
    'exit-pre',
    'exit-post'
  ],
  'sol-nostart': ['selected', 'stationary'],
  solwb: ['admission-first', 'admission-second', 'selected'],
  sp: [
    'selected',
    'Start-pre',
    'driver',
    'turn-pre',
    'turn-post',
    'travel',
    'clear',
    'dwell',
    'exit-post'
  ],
  'sp-early': ['L-post', 'arrived'],
  'sp-nostart': ['selected', 'stationary']
} as const;

export type DionControlOperation =
  | { kind: 'advance'; seconds: number }
  | { action: DionAction; kind: 'press' }
  | { intent: typeof IDLE; kind: 'intent' };
export const applyDionControl = (
  session: DionSession,
  operation: DionControlOperation
): void => {
  if (operation.kind === 'advance') {
    session.advance(operation.seconds);
  } else if (operation.kind === 'press') {
    session.press(operation.action);
  } else {
    session.intent = operation.intent;
  }
};
const track = (
  session: DionSession,
  operations: DionControlOperation[]
): DionSession =>
  new Proxy(session, {
    get: (target, property) => {
      if (property === 'advance') {
        return (seconds: number) => {
          operations.push({ kind: 'advance', seconds });
          return target.advance(seconds);
        };
      }
      if (property === 'press') {
        return (action: DionAction) => {
          operations.push({ action, kind: 'press' });
          target.press(action);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set: (target, property, value) => {
      if (property === 'intent') {
        operations.push({ intent: value, kind: 'intent' });
      }
      return Reflect.set(target, property, value);
    }
  });

export const dionControlCaptures = (
  content: DionContent,
  create: () => DionSession = () => new DionSession(content)
) => {
  const captures: {
    index: number;
    name: string;
    operations: DionControlOperation[];
    record: ReturnType<DionSession['captureResume']>;
  }[] = [];
  for (const [route, names] of Object.entries(checkpoints)) {
    const operations: DionControlOperation[] = [];
    const s = track(create(), operations);
    const capture = (name: string) => {
      if (names.includes(name as never)) {
        captures.push({
          index: operations.length,
          name: `${route}/${name}`,
          operations,
          record: s.captureResume()
        });
      }
    };
    until(s, () => s.snapshot.reveal === 0);
    press(s, 'activate');
    s.advance(11 / 50);
    capture('mid-reveal');
    s.advance(64 / 50);
    press(s, 'star');
    capture('called');
    while (s.snapshot.taxi.counter !== 2) {
      frames(s);
    }
    capture('waiting');
    s.intent = { ...IDLE, walk: 1 };
    frames(s, 25);
    capture('mid-walk');
    s.intent = IDLE;
    capture('B-pre');
    s.press('board');
    capture('B-post');
    frames(s);
    // Control a deferred failed attempt before continuing the real approach.
    capture('admission-first');
    frames(s);
    capture('admission-second');
    // Complete the same uninterrupted opening after the failed early B.
    s.intent = { ...IDLE, walk: 1 };
    while (s.snapshot.eye[2] > s.snapshot.taxi.position[2] - 500) {
      frames(s);
    }
    s.intent = IDLE;
    press(s, 'board');
    while (s.snapshot.narrative.flags[6] || s.snapshot.narrative.message.busy) {
      frames(s);
    }
    press(s, 'plus');
    if (route.startsWith('sp')) {
      press(s, 'plus');
    }
    capture('selected');
    capture('Start-pre');
    if (route.endsWith('nostart')) {
      frames(s, 300);
      capture('stationary');
      continue;
    }
    press(s, 'star');
    frames(s, 1);
    capture('departure');
    frames(s, 7);
    capture('driver');
    frames(s, 6);
    capture('scroll');
    const target = route.startsWith('sp') ? 507 : 112;
    const startFrame = s.snapshot.frame - 14;
    while (s.snapshot.frame - startFrame < 111) {
      frames(s);
    }
    capture('clear-pre');
    capture('turn-pre');
    frames(s);
    capture('turn-post');
    frames(s, 5);
    capture('descending');
    if (route.startsWith('sp')) {
      frames(s, 150);
      capture('travel');
      press(s, 'leave');
      capture('L-post');
    }
    while (s.snapshot.taxi.destination !== 0) {
      frames(s);
    }
    capture('clear');
    while (s.snapshot.taxi.counter !== 2) {
      frames(s);
    }
    capture('dwell');
    capture('arrived');
    if (route === 'sp-early') {
      continue;
    }
    capture('exit-pre');
    press(s, 'leave');
    capture('exit-post');
    if (s.snapshot.frame - startFrame < target + 22) {
      throw new Error('Journey ended before descent');
    }
  }
  return captures;
};
