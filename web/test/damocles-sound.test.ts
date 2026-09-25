import { describe, expect, test } from 'bun:test';

import {
  DamoclesPsgDriver,
  type DamoclesCue,
  type PsgSink
} from '../src/damocles/psg.ts';
import type { Effect } from '../src/damocles/script.ts';
import {
  DamoclesSoundPresenter,
  type DamoclesSoundCommand
} from '../src/damocles/sound.ts';
import type { SoundBatch, SoundTransport } from '../src/sound/presenter.ts';
import { Ym2149 } from '../src/sound/ym2149.ts';
import {
  SAMPLE_RATE,
  crossingsPerSecond,
  damoclesProcessor,
  vblLevels
} from './damocles-sound-processor.ts';

/// The Damocles door and shared-effect programmes (#508), recovered from `$04C220`–`$04C470`
/// and `$04C556`–`$04C60F` (docs/research/damocles-lift-ride.md#what-the-programmes-play).

type Write = readonly [register: number, value: number];

/// The value of the last write to `register`.
const lastTo = (
  writes: readonly Write[],
  register: number
): number | undefined => writes.filter(([to]) => to === register).at(-1)?.[1];

/// A VBL is heard above this RMS level and silent below the other, −66 dB. Level 5, the door
/// tone's quietest, gated by its noise, sits near 0.005.
const AUDIBLE = 3e-3;
const SILENT = 5e-4;

const recorder = (): PsgSink & { taken: () => Write[] } => {
  let writes: Write[] = [];
  return {
    taken: () => {
      const taken = writes;
      writes = [];
      return taken;
    },
    write: (register, value) => writes.push([register, value])
  };
};

/// The level channel C is left at after each of `count` VBLs.
const channelCLevels = (
  driver: DamoclesPsgDriver,
  sink: ReturnType<typeof recorder>,
  count: number
): (number | undefined)[] =>
  Array.from({ length: count }, () => {
    driver.vbl(sink);
    return lastTo(sink.taken(), 10);
  });

describe('the door tone', () => {
  test('its first VBL: period $400 and level 15, rewritten at once by the first step', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('door-start', sink);
    // Arming writes nothing: the programme runs on the next VBL.
    expect(sink.taken()).toEqual([]);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([
      [4, 0x00],
      [5, 0x04],
      // Channel C tone and noise on (`andi #$DB`).
      [7, 0xdb],
      [10, 15],
      [6, 0],
      [4, 0xe8],
      [5, 0x03],
      [10, 10]
    ]);
  });

  test('swells to 13, falls to 5, then holds 9 to 5 over and over while the door moves', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('door-start', sink);
    expect(channelCLevels(driver, sink, 21)).toEqual([
      10, 11, 13, 13, 11, 10, 9, 8, 7, 6, 5, 9, 8, 7, 6, 5, 9, 8, 7, 6, 5
    ]);
  });

  test('its period alternates $3E8 and $41A a VBL, with the fastest noise each VBL', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('door-start', sink);
    const periods = Array.from({ length: 6 }, () => {
      driver.vbl(sink);
      const writes = sink.taken();
      expect(writes).toContainEqual([6, 0]);
      const fine = lastTo(writes, 4)!;
      const coarse = lastTo(writes, 5)!;
      return (coarse << 8) | fine;
    });
    expect(periods).toEqual([
      0x03_e8, 0x04_1a, 0x03_e8, 0x04_1a, 0x03_e8, 0x04_1a
    ]);
  });
});

describe('the door burst', () => {
  test('noise only at period $1F, 12, 8, 4 and 0 a VBL, then channel C set back and idle', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('door-start', sink);
    channelCLevels(driver, sink, 30);
    driver.request('door-stop', sink);
    driver.vbl(sink);
    expect(sink.taken().slice(0, 4)).toEqual([
      [4, 0x00],
      [5, 0x04],
      [6, 0x1f],
      // Channel C noise on, tone off (`andi #$DF`, `ori #$04`).
      [7, 0xdf]
    ]);
    expect(channelCLevels(driver, sink, 3)).toEqual([8, 4, 0]);
    // The table ends and rearms the vector, writing nothing that VBL.
    driver.vbl(sink);
    expect(
      sink.taken().filter(([register]) => register !== 4 && register !== 5)
    ).toEqual([]);
    // `$04C220`: tone and noise on again, at level 0.
    driver.vbl(sink);
    expect(sink.taken()).toEqual([
      [7, 0xdb],
      [6, 0x1f]
    ]);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
  });

  test('a door starting again replaces the burst mid-way', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('door-stop', sink);
    driver.vbl(sink);
    driver.request('door-start', sink);
    expect(channelCLevels(driver, sink, 3)).toEqual([10, 11, 13]);
  });
});

describe('the shared effect', () => {
  test('a take cuts channel C at once, and the next VBL plays channel B under envelope 9', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('take', sink);
    expect(sink.taken()).toEqual([[10, 0]]);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([
      [11, 0x00],
      [12, 0x1f],
      [2, 0x60],
      [3, 0x00],
      // Channel B tone on, noise off (`andi #$FD`, `ori #$10`).
      [7, 0xfd],
      [9, 0x1f],
      [13, 0x09]
    ]);
    // It disarms itself; the chip's envelope carries the decay.
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
  });

  test('a drop asks for the same effect', () => {
    const take = recorder();
    const drop = recorder();
    const taking = new DamoclesPsgDriver();
    const dropping = new DamoclesPsgDriver();
    taking.request('take', take);
    dropping.request('drop', drop);
    taking.vbl(take);
    dropping.vbl(drop);
    expect(drop.taken()).toEqual(take.taken());
  });

  test('it leaves the door tone running on channel C, which rewrites its level the next VBL', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('door-start', sink);
    channelCLevels(driver, sink, 3);
    driver.request('take', sink);
    expect(sink.taken()).toEqual([[10, 0]]);
    // Both vectors run: the effect first, then the door's next step.
    expect(channelCLevels(driver, sink, 1)).toEqual([13]);
  });
});

describe('the YM2149', () => {
  test('is silent until a channel is given a level', () => {
    const chip = new Ym2149(SAMPLE_RATE);
    expect(chip.render(4800).every(sample => sample === 0)).toBeTrue();
  });

  test('the shared effect is a 1302 Hz tone that decays over about a second', () => {
    const chip = new Ym2149(SAMPLE_RATE);
    const driver = new DamoclesPsgDriver();
    driver.request('take', chip);
    driver.vbl(chip);
    const samples = chip.render(SAMPLE_RATE * 1.2);
    // 2 MHz / (16 × $60).
    const pitch = crossingsPerSecond(samples.subarray(0, SAMPLE_RATE / 4));
    expect(Math.abs(pitch - 1302)).toBeLessThan(13);
    const levels = vblLevels(samples);
    expect(levels[0]!).toBeGreaterThan(0.05);
    // Envelope shape 9 falls monotonically: 256 × $1F00 / 2 MHz is 1.016 s.
    for (let vbl = 5; vbl < 50; vbl += 5) {
      expect(levels[vbl]!).toBeLessThan(levels[vbl - 5]!);
    }
    expect(Math.max(...levels.slice(52))).toBeLessThan(SILENT);
  });

  test('the door tone is a buzz near 120 Hz under noise, and the burst dies in four VBLs', () => {
    const chip = new Ym2149(SAMPLE_RATE);
    const driver = new DamoclesPsgDriver();
    const vbls = (count: number): Float32Array => {
      const out = new Float32Array((count * SAMPLE_RATE) / 50);
      for (let vbl = 0; vbl < count; vbl += 1) {
        driver.vbl(chip);
        out.set(chip.render(SAMPLE_RATE / 50), (vbl * SAMPLE_RATE) / 50);
      }
      return out;
    };
    driver.request('door-start', chip);
    const tone = vblLevels(vbls(30));
    expect(Math.min(...tone)).toBeGreaterThan(AUDIBLE);
    // The swell: level 13 is louder than level 10, and the hold's 5 quieter still.
    expect(tone[2]!).toBeGreaterThan(tone[0]!);
    expect(tone[10]!).toBeLessThan(tone[0]!);
    driver.request('door-stop', chip);
    const burst = vblLevels(vbls(10));
    expect(burst[0]!).toBeGreaterThan(AUDIBLE);
    expect(burst[1]!).toBeLessThan(burst[0]!);
    expect(burst[2]!).toBeLessThan(burst[1]!);
    expect(Math.max(...burst.slice(4))).toBeLessThan(SILENT);
  });

  test('a reset silences a sounding channel at once', () => {
    const chip = new Ym2149(SAMPLE_RATE);
    const driver = new DamoclesPsgDriver();
    driver.request('door-start', chip);
    driver.vbl(chip);
    expect(vblLevels(chip.render(960))[0]!).toBeGreaterThan(AUDIBLE);
    chip.reset();
    driver.reset();
    driver.vbl(chip);
    expect(
      chip.render(960).every(sample => Math.abs(sample) < SILENT)
    ).toBeTrue();
  });
});

describe('the AudioWorklet processor', () => {
  test('registers as damocles-ym and plays a cue on the VBL after it lands', async () => {
    const processor = await damoclesProcessor();
    expect(processor.name).toBe('damocles-ym');
    expect(
      vblLevels(processor.render(0.1)).every(level => level === 0)
    ).toBeTrue();
    processor.post({
      at: processor.time(),
      commands: [{ cue: 'take', kind: 'cue' }]
    });
    const levels = vblLevels(processor.render(1.2));
    expect(levels[1]!).toBeGreaterThan(0.05);
    expect(Math.max(...levels.slice(55))).toBeLessThan(SILENT);
  });

  test('a reset clears queued cues and stops a tone mid-way', async () => {
    const processor = await damoclesProcessor();
    processor.post({
      at: processor.time(),
      commands: [{ cue: 'door-start', kind: 'cue' }]
    });
    processor.post({
      at: processor.time() + 0.5,
      commands: [{ cue: 'take', kind: 'cue' }]
    });
    expect(
      Math.min(...vblLevels(processor.render(0.2)).slice(1))
    ).toBeGreaterThan(AUDIBLE);
    processor.post({ at: processor.time(), commands: [{ kind: 'reset' }] });
    const after = processor.render(1);
    // The DC blocker's tail is all that is left of the tone.
    expect(Math.max(...vblLevels(after).slice(2))).toBeLessThan(SILENT);
  });

  test('a reset sent while the context is suspended survives the resume', async () => {
    const processor = await damoclesProcessor();
    processor.post({
      at: processor.time(),
      commands: [{ cue: 'door-start', kind: 'cue' }]
    });
    expect(
      Math.min(...vblLevels(processor.render(0.2)).slice(1))
    ).toBeGreaterThan(AUDIBLE);
    // A New Game while the menu holds the context suspended: the reset lands first, then the
    // resume replaces whatever the old timebase left queued. No block is rendered in between.
    processor.post({
      at: processor.time() + 0.05,
      commands: [{ kind: 'reset' }]
    });
    processor.post({ at: 0, commands: [], replacePending: true });
    const after = processor.render(1);
    expect(Math.max(...vblLevels(after).slice(2))).toBeLessThan(SILENT);
  });
});

class RecordingTransport implements SoundTransport<DamoclesSoundCommand> {
  readonly batches: SoundBatch<DamoclesSoundCommand>[] = [];
  readonly calls: string[] = [];
  failUnlock = false;

  dispose(): void {
    this.calls.push('dispose');
  }
  resume(): void {
    this.calls.push('resume');
  }
  send(batch: SoundBatch<DamoclesSoundCommand>): void {
    this.batches.push(batch);
  }
  suspend(): void {
    this.calls.push('suspend');
  }
  async unlock(): Promise<void> {
    this.calls.push('unlock');
    if (this.failUnlock) {
      throw new Error('no audio');
    }
  }
}

const cue = (name: DamoclesCue): Effect => ({
  cue: name,
  type: 'sound-request'
});

describe('the presenter', () => {
  test('drops cues until a gesture unlocks audio, then sends them in order', async () => {
    const transport = new RecordingTransport();
    const sound = new DamoclesSoundPresenter(transport);
    expect(sound.state).toBe('locked');
    sound.present([cue('door-start')], 1);
    sound.setMuted(true);
    sound.setVolume(40);
    expect(transport.batches).toEqual([]);
    await sound.unlock();
    expect(sound.state).toBe('running');
    // The preferences set while locked arrive with the unlock.
    expect(transport.batches).toEqual([
      {
        at: 0,
        commands: [
          { kind: 'mute', value: true },
          { kind: 'volume', value: 40 }
        ]
      }
    ]);
    sound.present([cue('take'), cue('door-start')], 2);
    sound.present([], 3);
    expect(transport.batches.at(-1)).toEqual({
      at: 2,
      commands: [
        { cue: 'take', kind: 'cue' },
        { cue: 'door-start', kind: 'cue' }
      ]
    });
    expect(transport.batches).toHaveLength(2);
  });

  test('suspended it sends nothing; a reset silences; dispose ends it', async () => {
    const transport = new RecordingTransport();
    const sound = new DamoclesSoundPresenter(transport);
    await sound.unlock();
    sound.suspend();
    expect(sound.state).toBe('suspended');
    sound.present([cue('door-start')], 1);
    expect(transport.batches).toHaveLength(1);
    sound.resume();
    sound.reset(7);
    expect(transport.batches.at(-1)).toEqual({
      at: 7,
      commands: [{ kind: 'reset' }]
    });
    sound.dispose();
    expect(sound.state).toBe('disposed');
    sound.present([cue('take')], 8);
    expect(transport.batches).toHaveLength(2);
    expect(transport.calls).toEqual(['unlock', 'suspend', 'resume', 'dispose']);
  });

  test('a message becomes the driver’s message command', async () => {
    const transport = new RecordingTransport();
    const sound = new DamoclesSoundPresenter(transport);
    await sound.unlock();
    sound.present([{ text: 'TOO HEAVY', type: 'message' }, cue('drop')], 4);
    expect(transport.batches.at(-1)).toEqual({
      at: 4,
      commands: [
        { kind: 'message', text: 'TOO HEAVY' },
        { cue: 'drop', kind: 'cue' }
      ]
    });
  });

  test('a failed unlock leaves it locked and silent', async () => {
    const transport = new RecordingTransport();
    transport.failUnlock = true;
    const sound = new DamoclesSoundPresenter(transport);
    expect(sound.unlock()).rejects.toThrow('no audio');
    await Promise.resolve();
    expect(sound.state).toBe('locked');
    sound.present([cue('take')], 1);
    expect(transport.batches).toEqual([]);
  });
});
