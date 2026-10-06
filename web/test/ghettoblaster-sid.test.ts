import { describe, expect, test } from 'bun:test';

import { parseDamoclesMusic } from '../src/damocles/music.ts';
import { createGhettoblasterProgram } from '../src/soundboard/ghettoblasterProgram.ts';
import {
  GhettoblasterSid,
  envelopeForTable,
  sustainForLevel
} from '../src/soundboard/ghettoblasterSid.ts';
import { loadPayload } from './replay/artifacts.ts';

const sound = (await loadPayload()).sound;
const document = parseDamoclesMusic(
  await Bun.file('../payload/damocles/music.json').json()
);
const music = { ...document, addressZero: document.addressZero.bytes };
const peak = (samples: Float32Array): number =>
  samples.reduce((most, x) => Math.max(most, Math.abs(x)), 0);
const player = (): GhettoblasterSid =>
  new GhettoblasterSid(music, sound.sid.clockHz);

describe('the GHETTOBLASTER on the SID', () => {
  test('YM levels keep their loudness as sustain nibbles', () => {
    expect([0, 15, 16, 13, 11, 7, 5].map(sustainForLevel)).toEqual([
      0, 15, 15, 8, 4, 1, 0
    ]);
  });

  test('a volume table becomes a decay to its last level', () => {
    // Table 1 falls from 15 to 0 over 84 VBLs: 1.68 s, nearest the 1.5 s decay.
    expect(envelopeForTable(document.volumeTables[0]!.entries)).toEqual({
      attackDecay: 0x0a,
      sustainRelease: 0x02
    });
    // Table 5 holds 15.
    expect(envelopeForTable([[1, 15]])).toEqual({
      attackDecay: 0,
      sustainRelease: 0xf2
    });
  });

  test('every sounding note retriggers its gate', () => {
    const tune = player();
    tune.start();
    const gates = [0, 0, 0];
    for (let vbl = 0; vbl <= document.loopVbls; vbl += 1) {
      for (const { register, value } of tune.vbl()) {
        if (register % 7 === 4 && (value & 1) !== 0) {
          gates[Math.floor(register / 7)]! += 1;
        }
      }
    }
    const sounding = document.voices.map(
      voice =>
        voice.ops.filter(op => op.op === 'note' && op.period < 0x80_00).length
    );
    expect(gates).toEqual(sounding);
  });

  test('the board plays the tune, and reset silences it', () => {
    const program = createGhettoblasterProgram(
      { clockHz: sound.sid.clockHz, music },
      48_000
    );
    program.apply({ kind: 'play' });
    let energy = 0;
    for (let vbl = 0; vbl < 250; vbl += 1) {
      program.tick!.run();
      energy += program.chip
        .render(960)
        .reduce((sum, x) => sum + Math.abs(x), 0);
    }
    expect(energy).toBeGreaterThan(100);
    program.reset({ kind: 'reset' });
    program.chip.render(4800);
    program.tick!.run();
    expect(peak(program.chip.render(960))).toBeLessThan(1e-3);
  });

  test('the converted tune loops with the player', () => {
    const tune = player();
    tune.start();
    // Past the first pass's start-up, one loop's writes repeat the next loop's.
    const pass = (): string =>
      JSON.stringify(
        Array.from({ length: document.loopVbls }, () => tune.vbl())
      );
    pass();
    const second = pass();
    expect(pass()).toBe(second);
  });

  test('a tone voice keeps its pitch in hertz', () => {
    const tune = player();
    tune.start();
    const frequencies = new Set<number>();
    const voice3 = [0, 0];
    for (let vbl = 0; vbl < document.loopVbls; vbl += 1) {
      for (const { register, value } of tune.vbl()) {
        if (register === 14 || register === 15) {
          voice3[register - 14] = value;
          frequencies.add(voice3[0]! | (voice3[1]! << 8));
        }
      }
    }
    // Channel C's period 142 is 880 Hz on the ST's 2 MHz YM2149.
    const a880 = Math.round((880.28 * 2 ** 24) / sound.sid.clockHz);
    expect(
      [...frequencies].some(frequency => Math.abs(frequency - a880) <= 2)
    ).toBe(true);
  });
});
