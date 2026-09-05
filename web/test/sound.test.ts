import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { load } from '../src/payload/load.ts';
import { SoundPresenter, type SoundTransport } from '../src/sound/presenter.ts';
import { renderSidSequence } from '../src/sound/sequence.ts';
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
  test('the initial state is silent and register sequences preserve ordered writes', () => {
    expect(energy(new SidSynth(sound, 48_000).render(4800))).toBe(0);
    const writes = [{ cycle: 98_525, register: 15, value: 60 }];
    const samples = renderSidSequence(sound, writes, 9600);
    expect(energy(samples.subarray(0, 4800))).toBe(0);
    expect(energy(samples.subarray(5000))).toBeGreaterThan(10);
    expect(() =>
      renderSidSequence(sound, [{ cycle: -1, register: 0, value: 0 }], 100)
    ).toThrow('ordered');
  });
  test('renders only the waveforms present in the decoded document', () => {
    const synth = new SidSynth(sound, 48_000);
    synth.play(0, 1);

    expect(synth.debugState().registers[0]).toBe(0x80);
    expect(energy(synth.render(4800))).toBeGreaterThan(20);
    expect(() => synth.write(4, 0x21)).toThrow('unsupported SID control');
    expect(() => synth.write(23, 1)).toThrow('unsupported SID filter');
  });

  test('mixes simultaneous voices and retriggers a program', () => {
    const one = new SidSynth(sound, 48_000);
    one.play(8, 1);
    const oneVoice = energy(one.render(2000));

    const mixed = new SidSynth(sound, 48_000);
    mixed.play(8, 1);
    mixed.play(12, 2);
    expect(energy(mixed.render(2000))).toBeGreaterThan(oneVoice);
    const envelope = mixed.debugState().voices[0]?.envelope;
    mixed.play(8, 1);
    expect(mixed.debugState().voices[0]?.envelope).toBe(envelope);
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

  test('initial gate-on state makes Benson frequency writes audible', () => {
    const synth = new SidSynth(sound, 48_000);
    synth.write(15, 60);
    expect(energy(synth.render(4800))).toBeGreaterThan(100);
  });

  test('lift ring modulation changes the triangle signal', () => {
    const ring = new SidSynth(sound, 48_000);
    const plain = new SidSynth(sound, 48_000);
    for (const synth of [ring, plain]) {
      sound.liftProfiles[0]!.registers.slice(1).forEach((value, index) =>
        synth.write(index + 1, value)
      );
      synth.write(11, 0x15);
    }
    // Changing the otherwise inaudible source oscillator changes ring output.
    plain.write(1, 0);
    expect(ring.render(4800)).not.toEqual(plain.render(4800));
  });

  test('noise decays exponentially rather than remaining loud through its tail', () => {
    const synth = new SidSynth(sound, 48_000);
    synth.play(8, 1);
    synth.render(2400);
    const early = energy(synth.render(2400));
    synth.render(19_200);
    expect(energy(synth.render(2400))).toBeLessThan(early * 0.2);
  });
});

describe('the required sound payload', () => {
  test('rejects missing programs/profiles and unsupported initial or lift controls', async () => {
    for (const invalid of [
      {
        ...sound,
        counts: { ...sound.counts, liftProfiles: 0 },
        liftProfiles: []
      },
      {
        ...sound,
        counts: { ...sound.counts, oneShotPrograms: 0 },
        oneShots: []
      },
      {
        ...sound,
        initialRegisters: sound.initialRegisters.map((value, index) =>
          index === 4 ? 0x21 : value
        )
      },
      {
        ...sound,
        initialRegisters: sound.initialRegisters.map((value, index) =>
          index === 23 ? 1 : value
        )
      },
      {
        ...sound,
        liftProfiles: sound.liftProfiles.map(profile => ({
          ...profile,
          startControl: 0x21
        }))
      }
    ]) {
      await expect(load(payloadReader(invalid))).rejects.toThrow(
        'unsupported bounded SID contract'
      );
    }
  });
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
  test('special Room arrivals play both transition voices after scene initialization', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    await presenter.unlock();
    const base = bundleSnapshot();
    presenter.present({
      events: [{ arrived: { id: 1, kind: 'room' } }],
      snapshot: {
        ...base,
        core: { ...base.core, transitionCooldown: 20 },
        location: { id: 1, kind: 'room' }
      }
    });
    expect(transport.batches.at(-1)).toMatchObject({
      commands: [
        ...sound.initialRegisters
          .slice(0, 14)
          .map((value, register) => ({ kind: 'write', register, value })),
        { kind: 'play', selector: 28, voice: 1 },
        { kind: 'play', selector: 32, voice: 2 }
      ]
    });
  });
  test('discards suspended steps and pre-unlock lift tails', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    const snapshot = bundleSnapshot();
    presenter.present({ events: [{ lift: 'down' }], snapshot });
    await presenter.unlock();
    presenter.present({ events: [], snapshot: { ...snapshot, elapsed: 0.6 } });
    expect(transport.batches).toHaveLength(1);
    presenter.suspend();
    presenter.present({
      events: [{ fire: { sound: 8 } }],
      snapshot: { ...snapshot, elapsed: 10 }
    });
    presenter.resume();
    presenter.present({ events: [], snapshot: { ...snapshot, elapsed: 11 } });
    expect(transport.batches).toHaveLength(2);
    expect(transport.batches.at(-1)).toMatchObject({
      commands: [
        { kind: 'write', register: 15, value: 0 },
        { kind: 'write', register: 11, value: 0 }
      ]
    });
  });
  test('resting craft does not retrigger and suspension survives initial unlock', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    presenter.suspend();
    await presenter.unlock();
    expect(transport.suspended).toBeTrue();
    presenter.resume();
    presenter.present({
      events: [],
      snapshot: { ...bundleSnapshot(), occupancy: { kind: 'aboard', slot: 0 } }
    });
    expect(transport.batches.at(-1)).toMatchObject({
      commands: [
        { kind: 'write', register: 15, value: 0 },
        { kind: 'write', register: 8, value: 0 },
        { kind: 'write', register: 13, value: 0 }
      ]
    });
  });
  test('Benson follows active scanout and stops during the reading hold', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    await presenter.unlock();
    const message = {
      displayText: 'A',
      occurrence: {},
      reveal: { complete: false, progress: 1 }
    };
    presenter.present({
      events: [],
      snapshot: {
        ...bundleSnapshot(),
        bensonMessage: { ...message, soundCharacter: 'A' }
      }
    });
    expect(transport.batches.at(-1)).toMatchObject({
      commands: [{ kind: 'write', register: 15, value: 49 }]
    });
    presenter.present({
      events: [],
      snapshot: { ...bundleSnapshot(), bensonMessage: message }
    });
    expect(transport.batches.at(-1)).toMatchObject({
      commands: [{ kind: 'write', register: 15, value: 0 }]
    });
  });

  test('craft pitch uses speed mantissa/exponent and does not retrigger steady input', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    await presenter.unlock();
    const base = bundleSnapshot();
    const snapshot = {
      ...base,
      occupancy: { kind: 'aboard', slot: 0 } as const,
      player: { ...base.player, speed: 256 }
    };
    presenter.present({ events: [], snapshot });
    expect(transport.batches.at(-1)).toMatchObject({
      commands: [
        { kind: 'play', selector: 36, voice: 2 },
        { kind: 'write', register: 8, value: 80 },
        { kind: 'write', register: 13, value: 88 }
      ]
    });
    const count = transport.batches.length;
    presenter.present({ events: [], snapshot: { ...snapshot, throttle: 999 } });
    expect(transport.batches).toHaveLength(count);
  });

  test('lift profiles change once and settle without restarting on subsequent steps', async () => {
    const transport = new RecordingTransport();
    const presenter = new SoundPresenter(sound, transport);
    await presenter.unlock();
    const snapshot = bundleSnapshot();
    presenter.present({ events: [{ lift: 'down' }], snapshot });
    expect(transport.batches.at(-1)).toMatchObject({
      commands: expect.arrayContaining([
        { kind: 'write', register: 7, value: 80 },
        { kind: 'write', register: 11, value: 21 }
      ])
    });
    presenter.present({ events: [], snapshot: { ...snapshot, elapsed: 0.6 } });
    expect(transport.batches.at(-1)).toMatchObject({
      commands: expect.arrayContaining([
        { kind: 'write', register: 7, value: 228 }
      ])
    });
    presenter.present({ events: [], snapshot: { ...snapshot, elapsed: 1.1 } });
    expect(transport.batches.at(-1)).toMatchObject({
      commands: expect.arrayContaining([
        { kind: 'write', register: 11, value: 0 }
      ])
    });
    const count = transport.batches.length;
    presenter.present({ events: [], snapshot: { ...snapshot, elapsed: 1.2 } });
    expect(transport.batches).toHaveLength(count);
  });
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
