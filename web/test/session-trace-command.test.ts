import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { GameplaySession } from '../src/session/index.ts';
import {
  applySessionTraceCommand,
  decodeSessionScenarioLeg,
  decodeSessionScenarioLegs,
  decodeSessionTraceCommand
} from '../src/trace/session.ts';
import { snapshotValue } from './replay/sessionReplay.ts';

const onFoot = (): GameplaySession =>
  new GameplaySession(
    {
      cellSize: 65_536,
      doorwayRules: undefined,
      flight: undefined,
      interaction: undefined,
      objects: [],
      rooms: new Map(),
      underground: undefined
    },
    playerState({ position: { x: 0, y: 0, z: 0 } })
  );

describe('a recorded Session command', () => {
  test('decodes only the discrete actions the opening-loop replay may apply', () => {
    expect(decodeSessionTraceCommand({ press: 'keyY' })).toEqual({
      key: 'keyY',
      kind: 'press'
    });
    expect(decodeSessionTraceCommand({ throttleNotch: 10 })).toEqual({
      kind: 'throttleNotch',
      notch: 10
    });
    expect(decodeSessionTraceCommand({ shutThrottle: true })).toEqual({
      kind: 'shutThrottle'
    });
    expect(decodeSessionTraceCommand({ leaveCraft: true })).toEqual({
      kind: 'leaveCraft'
    });
    expect(decodeSessionTraceCommand({ rideLift: true })).toEqual({
      kind: 'rideLift'
    });
    expect(decodeSessionTraceCommand({ drop: true })).toEqual({ kind: 'drop' });
  });

  test('refuses setup commands that would fake parity', () => {
    expect(() => decodeSessionTraceCommand({ board: 1 })).toThrow(
      'will not replay board'
    );
    expect(() => decodeSessionTraceCommand({ teleport: { room: 1 } })).toThrow(
      'will not replay teleport'
    );
  });

  test('refuses ambiguous and malformed commands', () => {
    expect(() =>
      decodeSessionTraceCommand({ leaveCraft: true, rideLift: true })
    ).toThrow('exactly one action');
    expect(() => decodeSessionTraceCommand({ throttleNotch: 0 })).toThrow(
      'throttleNotch'
    );
    expect(() => decodeSessionTraceCommand({ rideLift: false })).toThrow(
      'rideLift'
    );
  });

  test('fails when a recorded contextual action is impossible', () => {
    expect(() =>
      applySessionTraceCommand(onFoot(), { leaveCraft: true })
    ).toThrow('leaveCraft action was refused');
    expect(() =>
      applySessionTraceCommand(onFoot(), { rideLift: true })
    ).toThrow('rideLift action was refused');
    expect(() =>
      applySessionTraceCommand(onFoot(), { press: 'keyNope' })
    ).toThrow('unknown Benson key');
  });

  test('returns a serializable Drop outcome, including refusal', () => {
    expect(applySessionTraceCommand(onFoot(), { drop: true })).toEqual(
      'emptyInventory'
    );
  });

  test('serializes the complete object authority in Session snapshots', () => {
    expect(snapshotValue(onFoot().snapshot)).toMatchObject({
      carriedStack: [],
      objectFlags: {},
      residence: {}
    });
  });
});

describe('the legs a legal route is built from', () => {
  test('reads a walk with its heading and effort', () => {
    expect(
      decodeSessionScenarioLeg({
        walk: { running: true, seconds: 2, turn: -1 }
      })
    ).toEqual({ kind: 'walk', running: true, seconds: 2, turn: -1 });
  });

  test('defaults a walk to straight ahead at walking pace', () => {
    expect(decodeSessionScenarioLeg({ walk: { seconds: 1 } })).toEqual({
      kind: 'walk',
      running: false,
      seconds: 1,
      turn: 0
    });
  });

  test('reads a wait and a reach', () => {
    expect(decodeSessionScenarioLeg({ wait: 3 })).toEqual({
      kind: 'wait',
      seconds: 3
    });
    expect(
      decodeSessionScenarioLeg({ reach: { action: 'board', slot: 1 } })
    ).toEqual({ action: 'board', kind: 'reach', slot: 1 });
  });

  test('carries a Session command through unchanged', () => {
    expect(decodeSessionScenarioLeg({ drop: true })).toEqual({
      command: { kind: 'drop' },
      kind: 'command'
    });
  });

  test('refuses to be placed anywhere', () => {
    // Boarding is legal, but only by reaching for it.
    expect(() => decodeSessionScenarioLeg({ board: 7 })).toThrow(
      'a legal route will not board'
    );
    expect(() => decodeSessionScenarioLeg({ teleport: 16 })).toThrow(
      'a legal route will not teleport'
    );
  });

  test('refuses time that does not pass', () => {
    expect(() => decodeSessionScenarioLeg({ wait: 0 })).toThrow(
      'positive number of seconds'
    );
    expect(() => decodeSessionScenarioLeg({ walk: { seconds: -1 } })).toThrow(
      'positive number of seconds'
    );
  });

  test('refuses a leg that names more than one step', () => {
    expect(() => decodeSessionScenarioLeg({ wait: 1, walk: {} })).toThrow(
      'exactly one step'
    );
  });

  test('reads a route in order', () => {
    expect(
      decodeSessionScenarioLegs([
        { walk: { seconds: 1 } },
        { reach: { action: 'take', slot: 29 } },
        { drop: true }
      ]).map(leg => leg.kind)
    ).toEqual(['walk', 'reach', 'command']);
  });

  test('refuses a route that is not a list', () => {
    expect(() => decodeSessionScenarioLegs({ wait: 1 })).toThrow(
      'must be a list of legs'
    );
  });
});
