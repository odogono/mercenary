import { describe, expect, test } from 'bun:test';

import {
  DOORWAY_VBLS_PER_SECOND,
  doorwayTransitionVbls,
  type DoorwayWipeDirection
} from '../src/session/doorwayTransition.ts';
import type { SessionSnapshot } from '../src/session/index.ts';
import {
  SoundPresenter,
  type SoundBatch,
  type SoundCommand,
  type SoundTransport
} from '../src/sound/presenter.ts';
import {
  DOOR_SOUND_IDLE_MIXER,
  TARG_DOOR_SOUND
} from '../src/sound/targDoorSound.ts';
import { Ym2149 } from '../src/sound/ym2149.ts';
import { loadPayload } from './replay/artifacts.ts';
import { SAMPLE_RATE, offlineProcessor, rms } from './sound-processor.ts';

const { sound } = await loadPayload();

/// The wipes' YM writes as Hatari's `psg_write` trace logged them on real ST crossings
/// (research/targ-st/tests/test_door.py `TRACED`); the ST's last write restores its mixer
/// shadow, `$CA` there, which the browser replaces with its idle mixer.
const TRACED: Record<DoorwayWipeDirection, readonly (readonly number[])[]> = {
  down: [
    [4, 0x90],
    [5, 8],
    [2, 0x80],
    [3, 9],
    [9, 12],
    [10, 0],
    [10, 12],
    [7, 0xf8],
    [4, 0x80],
    [5, 7],
    [2, 0x80],
    [3, 6],
    [10, 0],
    [9, 0],
    [7, 0xca]
  ],
  up: [
    [4, 0x90],
    [5, 8],
    [2, 0x80],
    [3, 9],
    [10, 12],
    [9, 12],
    [7, 0xf8],
    [2, 0x80],
    [3, 7],
    [4, 0x80],
    [5, 6],
    [9, 0],
    [10, 0],
    [7, 0xca]
  ]
};

class RecordingTransport implements SoundTransport {
  readonly batches: SoundBatch[] = [];
  async unlock(): Promise<void> {}
  send(batch: SoundBatch): void {
    this.batches.push(batch);
  }
  suspend(): void {}
  resume(): void {}
  dispose(): void {}
}

const snapshot = (
  elapsed: number,
  direction?: DoorwayWipeDirection
): SessionSnapshot =>
  ({
    bensonMessage: undefined,
    carriedStack: [],
    core: {
      poweramp: false,
      stepInterlock: 0,
      touchdown: undefined,
      transitionCooldown: 0,
      wallContact: 0,
      wallContactLatch: 0
    },
    credits: 0,
    ...(direction === undefined
      ? {}
      : {
          doorwayTransition: {
            departed: {},
            direction,
            wipe: { cover: 'arrived', coverRows: 136, shows: 'departed' }
          }
        }),
    elapsed,
    ending: { kind: 'activePlay' },
    indoor: undefined,
    isScriptRunning: false,
    location: { id: 1, kind: 'room' },
    mode: 'grounded',
    objectFlags: new Map(),
    occupancy: { kind: 'onFoot' },
    player: {
      heading: 0,
      pitch: 0,
      position: { x: 0, y: 0, z: 0 },
      roll: 0,
      speed: 0,
      yawVelocity: 0
    },
    residence: new Map(),
    throttle: 0,
    throttleNotch: 0,
    worldFlipped: false
  }) as unknown as SessionSnapshot;

interface YmBatch {
  readonly at: number;
  readonly writes: readonly (readonly number[])[];
}

const ymBatches = (transport: RecordingTransport): YmBatch[] =>
  transport.batches
    .filter(batch => batch.commands.some(command => command.kind === 'ym'))
    .map(batch => ({
      at: batch.at,
      writes: batch.commands.map(command =>
        command.kind === 'ym' ? [command.register, command.value] : [-1]
      )
    }));

const phaseAt = (
  at: number,
  writes: readonly (readonly number[])[]
): YmBatch => ({ at, writes });

describe('the Targ ST door sound', () => {
  test('matches the register sequence recovered from the ST and traced in Hatari', () => {
    for (const direction of ['up', 'down'] as const) {
      const phases = TARG_DOOR_SOUND[direction];
      const writes: readonly (readonly number[])[] = phases.flatMap(
        phase => phase.writes
      );
      expect(writes.slice(0, -1)).toEqual(TRACED[direction].slice(0, -1));
      expect(writes.at(-1)).toEqual([7, DOOR_SOUND_IDLE_MIXER]);
      // It ends with the freeze: 54 VBLs up, 58 down.
      expect(phases.at(-1)!.vbl).toBe(doorwayTransitionVbls(direction));
    }
    expect(TARG_DOOR_SOUND.up.map(phase => phase.vbl)).toEqual([0, 33, 54]);
    expect(TARG_DOOR_SOUND.down.map(phase => phase.vbl)).toEqual([0, 25, 58]);
  });

  test('starts when a Doorway Transition starts and steps at its VBLs', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    await presenter.unlock();
    presenter.present({ events: [], snapshot: snapshot(9.9) });
    expect(ymBatches(transport)).toEqual([]);

    const start = 10;
    presenter.present({ events: [], snapshot: snapshot(start, 'up') });
    expect(ymBatches(transport)).toEqual([
      phaseAt(start, TARG_DOOR_SOUND.up[0]!.writes)
    ]);
    // A later step of the same wipe sends nothing until the next phase is reached.
    presenter.present({ events: [], snapshot: snapshot(start + 0.3, 'up') });
    expect(ymBatches(transport)).toHaveLength(1);
    presenter.present({ events: [], snapshot: snapshot(start + 0.56, 'up') });
    expect(ymBatches(transport).at(-1)).toEqual(
      phaseAt(
        start + 33 / DOORWAY_VBLS_PER_SECOND,
        TARG_DOOR_SOUND.up[1]!.writes
      )
    );
    // The wipe ends between steps: the off writes still land at its last VBL.
    presenter.present({ events: [], snapshot: snapshot(start + 0.95) });
    expect(ymBatches(transport).at(-1)).toEqual(
      phaseAt(
        start + 54 / DOORWAY_VBLS_PER_SECOND,
        TARG_DOOR_SOUND.up[2]!.writes
      )
    );
    expect(ymBatches(transport)).toHaveLength(3);

    // The next crossing starts it again, down this time.
    presenter.present({ events: [], snapshot: snapshot(20, 'down') });
    expect(ymBatches(transport).at(-1)).toEqual(
      phaseAt(20, TARG_DOOR_SOUND.down[0]!.writes)
    );
  });

  test('a reset forgets a door sound under way', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    await presenter.unlock();
    presenter.present({ events: [], snapshot: snapshot(10, 'down') });
    presenter.resetFromSnapshot(snapshot(10.2));
    presenter.present({ events: [], snapshot: snapshot(11) });
    expect(ymBatches(transport)).toHaveLength(1);
  });

  test('sounds through the Targ worklet beside the SID, and stops', async () => {
    const processor = await offlineProcessor<SoundCommand>(
      '../src/sound/worklet.ts',
      sound
    );
    expect(rms(processor.renderSamples(4800))).toBe(0);
    const at = processor.time();
    for (const phase of TARG_DOOR_SOUND.up) {
      processor.post({
        at: at + phase.vbl / DOORWAY_VBLS_PER_SECOND,
        commands: phase.writes.map(([register, value]) => ({
          kind: 'ym',
          register,
          value
        }))
      });
    }
    const during = processor.renderSamples(
      Math.round((54 / DOORWAY_VBLS_PER_SECOND) * SAMPLE_RATE)
    );
    expect(rms(during)).toBeGreaterThan(0.01);
    processor.renderSamples(4800); // the DC blocker settles
    expect(rms(processor.renderSamples(4800))).toBeLessThan(1e-4);
  });

  test('plays B and C at the recovered pitches', () => {
    // f = 2 MHz / (16 × period): $980 ≈ 51.4 Hz, $890 ≈ 57.0 Hz.
    const ym = new Ym2149(SAMPLE_RATE);
    for (const [register, value] of TARG_DOOR_SOUND.up[0]!.writes) {
      ym.write(register, value);
    }
    expect(ym.register(2) | (ym.register(3) << 8)).toBe(0x9_80);
    expect(ym.register(4) | (ym.register(5) << 8)).toBe(0x8_90);
    expect(rms(ym.render(SAMPLE_RATE / 2))).toBeGreaterThan(0.01);
  });
});
