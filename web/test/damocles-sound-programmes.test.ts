import { describe, expect, test } from 'bun:test';

import { parseDamoclesMusic } from '../src/damocles/music.ts';
import {
  DamoclesPsgDriver,
  type DamoclesMusicData,
  type PsgSink
} from '../src/damocles/psg.ts';
import { Ym2149 } from '../src/sound/ym2149.ts';
import { SAMPLE_RATE, vblLevels } from './damocles-sound-processor.ts';

/// The rest of the Damocles sound driver (#514), as
/// docs/research/damocles-sound-programmes.md decodes it: channel B's programmes, channel C's
/// alarm, silence and engine, and the writers outside the vectors, down to the music player.

type Write = readonly [register: number, value: number];

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

const lastTo = (
  writes: readonly Write[],
  register: number
): number | undefined => writes.filter(([to]) => to === register).at(-1)?.[1];

const period = (writes: readonly Write[], fine: number): number | undefined => {
  const low = lastTo(writes, fine);
  const high = lastTo(writes, fine + 1);
  return low === undefined || high === undefined
    ? undefined
    : (high << 8) | low;
};

/// Channel B's period after each of `count` VBLs.
const channelBPeriods = (
  driver: DamoclesPsgDriver,
  sink: ReturnType<typeof recorder>,
  count: number
): (number | undefined)[] =>
  Array.from({ length: count }, () => {
    driver.vbl(sink);
    return period(sink.taken(), 2);
  });

const document = parseDamoclesMusic(
  await Bun.file('../payload/damocles/music.json').json()
);
const music: DamoclesMusicData = {
  ...document,
  addressZero: document.addressZero.bytes
};

describe('the channel B programmes', () => {
  test('each runs the VBL after it is armed, as the shared effect does', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('spell', sink);
    expect(sink.taken()).toEqual([]);
    driver.vbl(sink);
    expect(sink.taken().length).toBeGreaterThan(0);
  });

  test('the spell: tone B, envelope $8021 shape 9, then $333 a VBL masked with $1F1', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('spell', sink);
    driver.vbl(sink);
    const entry = sink.taken();
    expect(entry).toEqual([
      [2, 0x00],
      [3, 0x00],
      [6, 0x00],
      // Channel B tone on, noise off.
      [7, 0xfd],
      [9, 0x1f],
      [11, 0x21],
      [12, 0x80],
      [13, 0x09],
      // The step it falls into: $200 + $333 = $533, masked to $131.
      [2, 0x31],
      [3, 0x01]
    ]);
    expect(channelBPeriods(driver, sink, 5)).toEqual([
      0x00_60, 0x01_91, 0x00_c0, 0x01_f1, 0x01_30
    ]);
  });

  test('the splash: noise on B under shape 2, its period stepping $46 a VBL', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('splash', sink);
    driver.vbl(sink);
    const entry = sink.taken();
    expect(lastTo(entry, 7)).toBe(0xef);
    expect(lastTo(entry, 13)).toBe(0x02);
    expect([lastTo(entry, 11), lastTo(entry, 12)]).toEqual([0x00, 0x1a]);
    const noise = [lastTo(entry, 6)];
    for (let vbl = 0; vbl < 5; vbl += 1) {
      driver.vbl(sink);
      noise.push(lastTo(sink.taken(), 6));
    }
    // The chip keeps five bits: 6, 12, 18, 24, 30, 4.
    expect(noise.map(value => value! & 0x1f)).toEqual([6, 12, 18, 24, 30, 4]);
  });

  test('the transporter: tone and noise on B, its period $313 a VBL masked with $118', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('transporter', sink);
    driver.vbl(sink);
    const entry = sink.taken();
    expect(lastTo(entry, 7)).toBe(0xed);
    expect(lastTo(entry, 6)).toBe(0xf0);
    expect([lastTo(entry, 11), lastTo(entry, 12)]).toEqual([0x21, 0x20]);
    expect(period(entry, 2)).toBe(0x0_10);
    expect(channelBPeriods(driver, sink, 5)).toEqual([
      0x01_00, 0x00_18, 0x01_08, 0x00_18, 0x01_10
    ]);
  });

  test('the bump: the stream at $008702, nine VBLs a loop, and no end', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('bump', sink);
    expect(channelBPeriods(driver, sink, 19)).toEqual([
      0x0f_f0,
      0x0f_e0,
      0x0f_d0,
      0x0f_c2,
      0x0f_b0,
      0x0f_a0,
      0x0f_50,
      0x0f_40,
      undefined,
      0x0f_f0,
      0x0f_e0,
      0x0f_d0,
      0x0f_c2,
      0x0f_b0,
      0x0f_a0,
      0x0f_50,
      0x0f_40,
      undefined,
      0x0f_f0
    ]);
  });

  test('blast, shot, thud and blown up: one noise at four envelope periods, then disarmed', () => {
    const envelopes = {
      blast: 0x3f_ff,
      'blown-up': 0x8f_00,
      shot: 0x0f_00,
      thud: 0x08_00
    } as const;
    for (const [programme, envelope] of Object.entries(envelopes)) {
      const driver = new DamoclesPsgDriver();
      const sink = recorder();
      driver.request(programme as keyof typeof envelopes, sink);
      driver.vbl(sink);
      expect(sink.taken()).toEqual([
        [11, envelope & 0xff],
        [12, envelope >> 8],
        [6, 0x1f],
        // Channel B noise on, tone off.
        [7, 0xef],
        [9, 0x1f],
        [13, 0x09]
      ]);
      driver.vbl(sink);
      expect(sink.taken()).toEqual([]);
    }
  });

  test('the zap: tone $00C and noise 5 together under $4000', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('zap', sink);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([
      [11, 0x00],
      [12, 0x40],
      [2, 0x0c],
      [3, 0x00],
      [6, 0x05],
      [7, 0xed],
      [9, 0x1f],
      [13, 0x09]
    ]);
  });

  test('the Geiger click writes at once and cuts whatever channel B was playing', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('bump', sink);
    channelBPeriods(driver, sink, 3);
    driver.request('geiger-click', sink);
    expect(sink.taken()).toEqual([
      [11, 0x40],
      [12, 0x00],
      [2, 0x30],
      [3, 0x00],
      [7, 0xfd],
      [9, 0x1f],
      [13, 0x09]
    ]);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
  });
});

describe('channel C', () => {
  test('the hazard alarm: 61 Hz, its level walking 2, 3, 4, 7, 15, 3 over 16 VBLs', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('hazard-alarm', sink);
    driver.vbl(sink);
    const entry = sink.taken();
    expect(period(entry, 4)).toBe(0x08_00);
    expect(lastTo(entry, 7)).toBe(0xfb);
    const levels = [lastTo(entry, 10)];
    for (let vbl = 1; vbl < 32; vbl += 1) {
      driver.vbl(sink);
      levels.push(lastTo(sink.taken(), 10) ?? levels.at(-1));
    }
    const loop = [2, 2, 3, 3, 3, 4, 4, 4, 4, 7, 7, 15, 15, 3, 3, 3];
    expect(levels).toEqual([...loop, ...loop]);
  });

  test('silenced the VBL after it is asked: tone and noise off and level 0, then nothing', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('hazard-alarm', sink);
    driver.vbl(sink);
    sink.taken();
    driver.request('channel-c-off', sink);
    expect(sink.taken()).toEqual([]);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([
      [7, 0xff],
      [10, 0]
    ]);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
  });

  test('the engine: the speed exponent is its level, at most 15, and silent below speed 1', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('restore', sink);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([
      [7, 0xdb],
      [6, 0x1f]
    ]);
    driver.setSpeedExponent(20);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([
      [10, 15],
      [4, 0x10],
      [5, 0x00],
      [6, 0x1f]
    ]);
    driver.setSpeedExponent(4);
    driver.vbl(sink);
    expect(lastTo(sink.taken(), 10)).toBe(4);
    // While it sounds, a take does not cut channel C.
    driver.request('take', sink);
    expect(sink.taken()).toEqual([]);
    driver.setSpeedExponent(-16);
    driver.vbl(sink);
    expect(sink.taken().filter(([register]) => register === 10)).toEqual([
      [10, 0]
    ]);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
  });
});

describe('outside the vectors', () => {
  test('the reset table $0508F8 leaves channel A tone on for the message tone', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.powerOn(sink);
    expect(sink.taken()).toEqual([
      [0, 1],
      [1, 0],
      [2, 1],
      [3, 0],
      [4, 1],
      [5, 0],
      [6, 0x1f],
      [7, 0xda],
      [8, 0],
      [9, 0x10],
      [10, 0],
      [11, 0],
      [12, 0]
    ]);
    // Both vectors idle after it.
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
  });

  test('the message tone: nothing on the VBL that begins it, then 36 VBLs of the scroll-in', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.showMessage('AB CDEFG');
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
    const vbls = Array.from({ length: 38 }, () => {
      driver.vbl(sink);
      return sink.taken();
    });
    // Characters 0, 2, 3, 4, 6, 7: the second fetch of a VBL is drawn and never heard.
    expect(vbls[0]).toEqual([
      [0, 0x82],
      [8, 12]
    ]);
    expect(vbls[1]).toEqual([
      [0, 0x40],
      [8, 12],
      [8, 0]
    ]);
    expect(vbls.slice(2, 6).map(writes => lastTo(writes, 0))).toEqual([
      0x86, 0x88, 0x8c, 0x8e
    ]);
    // Past the terminator every fetch is a space.
    expect(vbls.slice(6, 36).every(writes => lastTo(writes, 8) === 0)).toBe(
      true
    );
    // VBL 37 copies the row and writes nothing; 38 silences channel A, and that is the end.
    expect(vbls[36]).toEqual([]);
    expect(vbls[37]).toEqual([[8, 0]]);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
  });

  test('the last character of a full row sounds on the 36th VBL and holds through the 37th', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    // 48 characters, the last one a `Z`.
    driver.showMessage(`${' '.repeat(47)}Z`);
    const vbls = Array.from({ length: 39 }, () => {
      driver.vbl(sink);
      return sink.taken();
    });
    expect(vbls[36]).toEqual([
      [0, 0xb4],
      [8, 12]
    ]);
    expect(vbls[37]).toEqual([]);
    expect(vbls[38]).toEqual([[8, 0]]);
  });

  test('a message shown again begins again, and a reset forgets it', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.showMessage('AAAA');
    driver.vbl(sink);
    driver.vbl(sink);
    sink.taken();
    driver.showMessage('BBBB');
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
    driver.vbl(sink);
    expect(lastTo(sink.taken(), 0)).toBe(0x84);
    driver.reset();
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
  });

  test('the descent drone: B $400 and C $480 at level 9, 4 longer a step, then the restore', () => {
    const driver = new DamoclesPsgDriver();
    const sink = recorder();
    driver.request('descent-start', sink);
    expect(sink.taken()).toEqual([
      [7, 0xf8],
      [2, 0x00],
      [3, 0x04],
      [4, 0x80],
      [5, 0x04],
      [9, 9],
      [10, 9]
    ]);
    driver.request('descent-step', sink);
    const step = sink.taken();
    expect([period(step, 2), period(step, 4)]).toEqual([0x04_04, 0x04_84]);
    driver.request('descent-end', sink);
    expect(sink.taken()).toEqual([
      [9, 0],
      [10, 0]
    ]);
    driver.vbl(sink);
    // `$04C220`, from the driver's own mixer copy: the drone wrote $F8 around it.
    expect(sink.taken()).toEqual([
      [7, 0xdb],
      [6, 0x1f]
    ]);
  });
});

const playing = () => {
  const driver = new DamoclesPsgDriver(music);
  const sink = recorder();
  driver.setMusic(true);
  driver.vbl(sink);
  return { driver, first: sink.taken(), sink };
};

describe('the music player', () => {
  test('reads the tracked tune: three voices looping together, with their tables', () => {
    expect(document.voices.map(voice => voice.notes)).toEqual([377, 418, 166]);
    expect(document.voices.every(voice => voice.loopVbls === 3328)).toBeTrue();
    expect(document.volumeTables.map(table => table.index)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(document.pitchTables.map(table => table.index)).toEqual([
      1, 2, 3, 4, 5, 6
    ]);
    expect(document.source.evidence).toBe(
      'docs/research/damocles-sound-programmes.md'
    );
  });

  test('refuses a voice that picks a table the document does not hold', () => {
    const raw = structuredClone(document as unknown as Record<string, unknown>);
    const voices = raw['voices'] as { ops: unknown[] }[];
    voices[0]!.ops.unshift({ op: 'pitch', table: 9 });
    expect(() => parseDamoclesMusic(raw)).toThrow(/pitch table 9/);
  });

  test('its start silences all three, then noise on A and tone on B and C', () => {
    const { first } = playing();
    expect(first).toEqual([
      [7, 0xff],
      [7, 0xff],
      [7, 0xff],
      [8, 0],
      [9, 0],
      [10, 0],
      // A noise on and tone off; B tone on; C tone on.
      [7, 0xf7],
      [7, 0xf5],
      [7, 0xf1]
    ]);
  });

  test('it replaces both vectors while it plays, and the message tone stands aside', () => {
    const { driver, sink } = playing();
    driver.request('door-start', sink);
    driver.vbl(sink);
    const writes = sink.taken();
    expect(writes.map(([register]) => register)).toEqual([
      6, 8, 2, 3, 9, 4, 5, 10
    ]);
    // A message's scroll-in, begun and then sounding, writes nothing over the tune.
    const quiet = playing();
    const shown = playing();
    shown.driver.showMessage('AAAA');
    for (let vbl = 0; vbl < 3; vbl += 1) {
      quiet.driver.vbl(quiet.sink);
      shown.driver.vbl(shown.sink);
      expect(shown.sink.taken()).toEqual(quiet.sink.taken());
    }
  });

  test('the hi-hat and the first pass of the bass read the bytes at address 0', () => {
    const { driver, sink } = playing();
    const vbls = Array.from({ length: 40 }, () => {
      driver.vbl(sink);
      return sink.taken();
    });
    // Noise period: address 0's second byte, the TOS ROM's.
    expect(lastTo(vbls[0]!, 6)).toBe(music.addressZero[1]);
    // Voice 1 rests 16 VBLs, then hits for 4 at the level address 0 holds.
    expect(vbls.map(writes => lastTo(writes, 8))).toEqual([
      ...Array<number>(16).fill(0),
      ...Array<number>(4).fill(music.addressZero[1]!),
      ...Array<number>(12).fill(0),
      ...Array<number>(8).fill(0)
    ]);
    // Voice 2's first note is $6A7, walked with no pitch table: + address 0's second byte.
    expect(period(vbls[0]!, 2)).toBe(0x06_a7 + music.addressZero[1]!);
  });

  test('every voice loops in 3328 VBLs, and the bass is in tune from its second pass', () => {
    const { driver, sink } = playing();
    const bass: (number | undefined)[] = [];
    for (let vbl = 0; vbl < 3328 + 1; vbl += 1) {
      driver.vbl(sink);
      bass.push(period(sink.taken(), 2));
    }
    expect(bass[0]).toBe(0x06_a7 + 0x2e);
    expect(bass[3328]).toBe(0x06_a7);
  });

  test('switched off it stops, and switched on again it resumes where it was', () => {
    const { driver, sink } = playing();
    for (let vbl = 0; vbl < 50; vbl += 1) {
      driver.vbl(sink);
    }
    sink.taken();
    driver.setMusic(false);
    driver.vbl(sink);
    expect(sink.taken().slice(3)).toEqual([
      [8, 0],
      [9, 0],
      [10, 0]
    ]);
    driver.vbl(sink);
    expect(sink.taken()).toEqual([]);
    driver.setMusic(true);
    driver.vbl(sink);
    driver.vbl(sink);
    // Were it back at the start, voice 2 would be on its first note's detuned period.
    expect(period(sink.taken(), 2)).not.toBe(0x06_a7 + 0x2e);
  });
});

const render = (driver: DamoclesPsgDriver, chip: Ym2149, vbls: number) => {
  const out = new Float32Array((vbls * SAMPLE_RATE) / 50);
  for (let vbl = 0; vbl < vbls; vbl += 1) {
    driver.vbl(chip);
    out.set(chip.render(SAMPLE_RATE / 50), (vbl * SAMPLE_RATE) / 50);
  }
  return vblLevels(out);
};

describe('on the YM2149', () => {
  test('each envelope programme decays over its 256 × E / 2 MHz', () => {
    const decays = {
      blast: 2.1,
      'blown-up': 4.69,
      bump: 1.58,
      shot: 0.49,
      spell: 4.2,
      thud: 0.26,
      transporter: 1.05,
      zap: 2.1
    } as const;
    for (const [programme, seconds] of Object.entries(decays)) {
      const chip = new Ym2149(SAMPLE_RATE);
      const driver = new DamoclesPsgDriver();
      driver.request(programme as keyof typeof decays, chip);
      const levels = render(driver, chip, Math.ceil(seconds * 50) + 10);
      const vbl = Math.round(seconds * 50);
      expect(levels[1]!).toBeGreaterThan(3e-3);
      // Loud halfway through, silent once the decay is over.
      expect(levels[Math.round(vbl / 4)]!).toBeGreaterThan(levels[vbl - 2]!);
      expect(Math.max(...levels.slice(vbl + 2))).toBeLessThan(5e-4);
    }
  });

  test('the message tone sounds once the reset table has turned channel A on', () => {
    const chip = new Ym2149(SAMPLE_RATE);
    // A reset chip has every channel off in the mixer, as the driver's copy starts. A level on
    // a channel with its tone off is only a step, which the coupling capacitor lets die away.
    chip.reset();
    const driver = new DamoclesPsgDriver();
    driver.showMessage('A'.repeat(48));
    expect(render(driver, chip, 10)[9]!).toBeLessThan(5e-4);
    driver.powerOn(chip);
    driver.showMessage('A'.repeat(48));
    expect(render(driver, chip, 10)[9]!).toBeGreaterThan(3e-3);
  });
});
