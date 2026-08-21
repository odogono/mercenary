import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { GameplaySession } from '../src/session/index.ts';
import {
  applySessionTraceCommand,
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
