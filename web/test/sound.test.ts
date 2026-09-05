import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { load } from '../src/payload/load.ts';
import { SoundPresenter, type SoundTransport } from '../src/sound/presenter.ts';
import { SidSynth } from '../src/sound/synth.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const sound = bundle.sound;

const payloadReader =
  (override?: unknown, missing = false) =>
  async (name: string): Promise<string | undefined> => {
    if (name === 'sound.json') {
      if (missing) {
        return undefined;
      }
      return JSON.stringify(override ?? sound);
    }
    const file = Bun.file(join(repositoryRoot, 'payload', name));
    return (await file.exists()) ? await file.text() : undefined;
  };

const energy = (samples: Float32Array): number =>
  samples.reduce((sum, sample) => sum + Math.abs(sample), 0);

describe('the bounded SID synthesizer', () => {
  test('renders only the waveforms present in the decoded document', () => {
    const synth = new SidSynth(sound, 48_000);
    synth.play(0, 1);

    expect(synth.debugState().registers[0]).toBe(0x80);
    expect(energy(synth.render(4800))).toBeGreaterThan(20);
    expect(() => synth.write(4, 0x21)).toThrow('unsupported SID control');
  });

  test('mixes simultaneous voices and retriggers a program', () => {
    const one = new SidSynth(sound, 48_000);
    one.play(8, 1);
    const oneVoice = energy(one.render(2000));

    const mixed = new SidSynth(sound, 48_000);
    mixed.play(8, 1);
    mixed.play(12, 2);
    expect(energy(mixed.render(2000))).toBeGreaterThan(oneVoice);
    mixed.play(8, 1);
    expect(mixed.debugState().voices[0]?.envelope).toBe(0);
  });

  test('suspends phase, while mute advances synthesis behind the master gain', () => {
    const synth = new SidSynth(sound, 48_000);
    synth.play(0, 1);
    synth.render(500);
    synth.suspend();
    const frozen = synth.debugState().voices[0]?.phase;
    expect(energy(synth.render(500))).toBe(0);
    expect(synth.debugState().voices[0]?.phase).toBe(frozen);

    synth.resume();
    synth.setMuted(true);
    synth.render(500);
    expect(synth.debugState().voices[0]?.phase).not.toBe(frozen);
    synth.setMuted(false);
    synth.setVolume(50);
    expect(energy(synth.render(500))).toBeGreaterThan(0);
  });

  test('hard reset reconstructs the effective initial register state', () => {
    const synth = new SidSynth(sound, 48_000);
    synth.play(8, 1);
    synth.render(200);
    synth.reset(sound.initialRegisters);

    expect(synth.debugState().registers).toEqual(sound.initialRegisters);
    expect(synth.debugState().voices.map(voice => voice.phase)).toEqual([
      0, 0, 0
    ]);
  });
});

describe('the required sound payload', () => {
  test('refuses a missing document and unsupported controls', async () => {
    await expect(load(payloadReader(undefined, true))).rejects.toThrow(
      'sound.json'
    );
    const unsupported = {
      ...sound,
      oneShots: sound.oneShots.map((program, index) =>
        index === 0 ? { ...program, control: 0x21 } : program
      )
    };
    await expect(load(payloadReader(unsupported))).rejects.toThrow(
      'unsupported bounded SID contract'
    );
  });
});

class RecordingTransport implements SoundTransport {
  readonly batches: unknown[] = [];
  suspended = false;

  async unlock(): Promise<void> {}
  send(batch: unknown): void {
    this.batches.push(batch);
  }
  suspend(): void {
    this.suspended = true;
  }
  resume(): void {
    this.suspended = false;
  }
  dispose(): void {}
}

describe('the Sound Presenter', () => {
  test('discards pre-gesture cues and includes the unlocking gesture cue', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    const snapshot = { ...bundleSnapshot(), elapsed: 2 };
    presenter.present({ events: [{ fire: { sound: 8 } }], snapshot });
    expect(transport.batches).toHaveLength(0);

    const unlocking = presenter.unlock();
    presenter.present({ events: [{ fire: { sound: 8 } }], snapshot });
    await unlocking;
    expect(transport.batches).toHaveLength(2);
    expect(transport.batches.at(-1)).toMatchObject({
      commands: [{ kind: 'play', selector: 8, voice: 1 }]
    });
  });

  test('preserves ordered multi-event batches and can suppress Arrival transients', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    await presenter.unlock();
    const snapshot = { ...bundleSnapshot(), elapsed: 7 };

    presenter.present({
      events: [{ fire: { sound: 8 } }, { impact: { sound: 16 } }],
      snapshot
    });
    presenter.present({ events: ['tone'], snapshot, suppressTransient: true });

    expect(transport.batches.at(-1)).toMatchObject({
      at: 7,
      commands: [
        { kind: 'play', selector: 8, voice: 1 },
        { kind: 'play', selector: 16, voice: 1 }
      ]
    });
    expect(transport.batches).toHaveLength(2);
  });

  test('maps Benson stops and lifecycle controls without feeding session state back', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    await presenter.unlock();
    const snapshot = bundleSnapshot();
    presenter.present({
      events: [{ script: { sound: { symbol: 'voice1.control', value: 0 } } }],
      snapshot
    });
    presenter.suspend();
    expect(transport.suspended).toBeTrue();
    presenter.resume();
    expect(transport.suspended).toBeFalse();

    expect(transport.batches.at(-1)).toMatchObject({
      commands: [{ kind: 'write', register: 4, value: 0 }]
    });
  });
});

const bundleSnapshot = () => ({
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
  elapsed: 0,
  ending: { kind: 'activePlay' } as const,
  indoor: undefined,
  isScriptRunning: false,
  location: { kind: 'surface' } as const,
  mode: 'grounded' as const,
  objectFlags: new Map<number, number>(),
  occupancy: { kind: 'onFoot' } as const,
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
});
