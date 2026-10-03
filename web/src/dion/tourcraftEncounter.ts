import { craftFixed, craftMultiply } from '../craft/pass.ts';
import { list, record } from './read.ts';
import type { TourcraftContent } from './tourcraftContent.ts';

export interface TourcraftActor {
  readonly association: number;
  readonly bodyOffset: number;
  readonly cell: number;
  readonly flags: number;
  readonly floor: number;
  readonly group: number;
  readonly incrementX: number;
  readonly incrementY: number;
  readonly incrementZ: number;
  readonly objectState: number;
  readonly slot: number;
  readonly state: number;
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly z: number;
  readonly zone: number;
}
export interface TourcraftEncounter {
  readonly actors: readonly TourcraftActor[];
  readonly pairBytes: readonly number[];
  readonly priorEye: readonly [number, number, number];
  readonly programme: 0 | 36;
  readonly request: number;
  readonly spawnBudget: number;
  readonly timer: number;
  readonly trajectories: readonly number[];
}
export const initialEncounter = (
  content: TourcraftContent,
  eye: TourcraftEncounter['priorEye']
): TourcraftEncounter => {
  const owners = record(content.gameplay.initial['owners'], 'owners');
  const seed = record(owners['encounter'], 'encounter');
  return {
    actors: structuredClone(
      list(owners['actors'], 'actors')
    ) as TourcraftActor[],
    pairBytes: list(seed['pairBytes'], 'pairs') as number[],
    priorEye: eye,
    programme: 0,
    request: 0,
    spawnBudget: 5,
    timer: 0,
    trajectories: [0, 0, 0]
  };
};
export const resetEncounter = (
  state: TourcraftEncounter
): TourcraftEncounter => ({
  ...state,
  actors: state.actors.map(a =>
    a.slot >= 56 && a.slot <= 59
      ? {
          ...a,
          bodyOffset: 0,
          cell: 0,
          floor: 0,
          group: 0,
          state: 0
        }
      : a
  ),
  request: 65_535
});

/// The deferred post-wait tail. Pool motion always runs; programme time/spawning
/// only runs on a surface. Neither expiry nor waiting advances the paired table.
export const encounterTail = (
  content: TourcraftContent,
  state: TourcraftEncounter,
  eye: TourcraftEncounter['priorEye'],
  pitch: number,
  yaw: number,
  body: number,
  group: number,
  space: boolean,
  relativeView: TourcraftEncounter['priorEye'] = eye
): TourcraftEncounter => {
  let actors = state.actors.map(a => {
    if (a.state === 0 || a.state === 32_767) {
      return a;
    }
    const count = (a.state - 1) & 65_535;
    if (count === 0) {
      return { ...a, bodyOffset: 0, cell: 0, floor: 0, group: 0, state: 0 };
    }
    let y = (a.y + a.incrementY) >>> 0;
    let incrementY = a.incrementY;
    if (!space && (y | 0) <= 200) {
      y = 201;
      incrementY = -incrementY >>> 0;
    }
    return {
      ...a,
      incrementY,
      state: count,
      x: (a.x + a.incrementX) >>> 0,
      y,
      z: (a.z + a.incrementZ) >>> 0
    };
  });
  let next = { ...state, actors, priorEye: space ? state.priorEye : eye };
  if (space || state.request === 0) {
    return next;
  }
  if (state.request >= 32_768) {
    const programme = ~state.request & 65_535;
    if (programme !== 0 && programme !== 36) {
      throw new Error('Excluded encounter programme');
    }
    return {
      ...next,
      programme,
      request: 1,
      spawnBudget: (state.spawnBudget & 0xff_00) | state.pairBytes[programme]!,
      timer: 1000
    };
  }
  const timer = Math.max(0, state.timer - 1);
  let budget = state.spawnBudget;
  const trajectories = [...state.trajectories];
  const paths = list(
    record(content.programmes['encounter'], 'encounter')['trajectories'],
    'trajectories'
  );
  const sine = (angle: number) => content.arithmetic.sine[angle & 1023]!;
  const forward = [
    craftFixed(
      (craftMultiply(content.arithmetic, sine(pitch + 256), sine(yaw)) +
        0xc_00_00) >>>
        0
    ),
    craftFixed((sine(pitch) + 0xc_00_00) >>> 0),
    craftFixed(
      (craftMultiply(content.arithmetic, sine(pitch + 256), sine(yaw + 256)) +
        0xc_00_00) >>>
        0
    )
  ];
  actors = actors.map(a => {
    const path = a.slot - 56;
    if (path < 0 || path > 2) {
      return a;
    }
    if (a.state >= 32_768 || (a.state === 0 && (timer === 0 || budget === 0))) {
      return a.state >= 32_768
        ? {
            ...a,
            x: (a.x + eye[0] - state.priorEye[0]) >>> 0,
            y: (a.y + eye[1] - state.priorEye[1]) >>> 0,
            z: (a.z + eye[2] - state.priorEye[2]) >>> 0
          }
        : a;
    }
    if (timer === 0) {
      return a.state === 32_767 ? { ...a, incrementX: 0x8_00, state: 200 } : a;
    }
    if (a.state === 0) {
      budget--;
    }
    const records = list(record(paths[path], 'path')['records'], 'records');
    const cursor = trajectories[path] === 4 ? 0 : trajectories[path]!;
    const r = record(records[cursor], 'trajectory');
    trajectories[path] = cursor + 1;
    const relative = [
      a.x - relativeView[0] - forward[0]! + Number(r['x']),
      a.y - relativeView[1] - forward[1]! + Number(r['y']),
      a.z - relativeView[2] - forward[2]! + Number(r['z'])
    ];
    const increments = relative.map(v => -(v >> Number(r['shift'])) >>> 0);
    return {
      ...a,
      bodyOffset: body,
      group,
      incrementX: increments[0]!,
      incrementY: increments[1]!,
      incrementZ: increments[2]!,
      state: 32_768 | Number(r['count']),
      x: (a.x + eye[0] - state.priorEye[0]) >>> 0,
      y: (a.y + eye[1] - state.priorEye[1]) >>> 0,
      z: (a.z + eye[2] - state.priorEye[2]) >>> 0
    };
  });
  next = { ...next, actors };
  return {
    ...next,
    request:
      timer === 0 &&
      actors.filter(a => a.slot >= 56 && a.slot <= 58).every(a => a.state === 0)
        ? 0
        : state.request,
    spawnBudget: budget,
    timer,
    trajectories
  };
};
