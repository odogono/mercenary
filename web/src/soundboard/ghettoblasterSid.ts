import type { MusicOp, MusicTable } from '../damocles/music.ts';
import { DamoclesPsgDriver, type DamoclesMusicData } from '../damocles/psg.ts';
import { YM_CLOCK_HERTZ } from '../sound/ym2149.ts';

/// The GHETTOBLASTER's tune arranged for the SID (the sound board's Targ section).
///
/// Not a recovery: the C64 never played it. The Damocles player `$033F6A` runs as the ST does,
/// a VBL at a time, and gives every pitch, bend and rest; YM channels A, B and C become SID
/// voices 1, 2 and 3 at the same frequencies in hertz. Each voice is a SID instrument:
///
/// - voice 1 the hi-hat: noise, struck at full and gone by the end of its note;
/// - voice 2 the bass: a pulse whose width sweeps, through the resonant low-pass filter, its
///   cutoff opening at each note and closing over the next few VBLs;
/// - voice 3 the lead: a sawtooth.
///
/// Every note retriggers its voice's gate, and every rest lets it go into its release. A tone
/// voice's ADSR comes from the volume table its note walks: the decay closest to the table's
/// fall, sustaining at its last level.

const VOICE_STRIDE = 7;
const GATE = 0x01;
const NOISE = 0x80;
const PULSE = 0x40;
const SAWTOOTH = 0x20;
/// Each voice's waveform, by YM channel.
const WAVEFORMS = [NOISE, PULSE, SAWTOOTH] as const;

/// The bass's pulse width: a triangle between the bounds, in 12-bit widths.
const SWEEP = { high: 0xc_00, low: 0x4_00, step: 16 } as const;
/// The bass's 11-bit cutoff: where each note opens it, where it closes to, and how much of
/// the way there it keeps each VBL.
const CUTOFF = { closed: 0x0_c0, keep: 0.8, open: 0x5_80 } as const;
/// Resonance 10, voice 2 into the filter.
const RESONANCE_ROUTING = 0xa2;
/// Low-pass, full volume.
const MODE_VOLUME = 0x1f;

/// The datasheet's decay and release times, by rate nibble.
const DECAY_SECONDS = [
  0.006, 0.024, 0.048, 0.072, 0.114, 0.168, 0.204, 0.24, 0.3, 0.75, 1.5, 2.4, 3,
  9, 15, 24
] as const;

export interface SidRegisterWrite {
  readonly register: number;
  readonly value: number;
}

/// A YM level (bit 4, the envelope, read as full) as a SID sustain nibble: the YM's 3 dB
/// steps on the envelope's linear sixteen.
export const sustainForLevel = (level: number): number =>
  (level & 0x1f) === 0
    ? 0
    : Math.round(15 * 2 ** ((Math.min(level & 0x1f, 15) - 15) / 2));

/// The rate nibble whose decay time is closest to `seconds`.
export const decayRate = (seconds: number): number =>
  DECAY_SECONDS.reduce(
    (best, time, rate) =>
      Math.abs(time - seconds) < Math.abs(DECAY_SECONDS[best]! - seconds)
        ? rate
        : best,
    0
  );

/// A volume table's envelope: no attack, its fall as the decay, its last level as the sustain.
export const envelopeForTable = (
  entries: readonly (readonly [count: number, value: number])[]
): { readonly attackDecay: number; readonly sustainRelease: number } => {
  const fall = entries.slice(0, -1).reduce((sum, [count]) => sum + count, 0);
  const sustain = sustainForLevel(entries.at(-1)?.[1] ?? 0);
  return {
    attackDecay: fall === 0 ? 0 : decayRate(fall / 50),
    sustainRelease: (sustain << 4) | 0x02
  };
};

/// A SID frequency word for `hertz` under `clockHz`, the most a voice can play.
const frequencyWord = (hertz: number, clockHz: number): number =>
  Math.min(0xff_ff, Math.round((hertz * 0x1_00_00_00) / clockHz));

interface NoteStart {
  readonly rest: boolean;
  readonly table: number;
  readonly vbls: number;
}

/// One voice's stream as `$033F6A` walks it, for the notes it starts; the driver owns the
/// pitches. The counter and loop are the player's.
class NoteWalk {
  private counter = 1;
  private cursor = 0;
  private table = 0;

  constructor(
    private readonly ops: readonly MusicOp[],
    private readonly loop: number
  ) {}

  /// The note this VBL starts, if one does.
  step(): NoteStart | undefined {
    this.counter = (this.counter - 1) & 0xff;
    if (this.counter !== 0) {
      return undefined;
    }
    for (;;) {
      if (this.cursor >= this.ops.length) {
        this.cursor = this.loop;
      }
      const op = this.ops[this.cursor]!;
      this.cursor += 1;
      if (op.op === 'volume') {
        this.table = op.table;
      } else if (op.op === 'note') {
        this.counter = op.vbls;
        return {
          rest: (op.period & 0x80_00) !== 0,
          table: this.table,
          vbls: op.vbls
        };
      }
    }
  }
}

/// The (count, value) pairs at address 0 a table index of 0 walks, up to a zero count.
const addressZeroEntries = (
  bytes: readonly number[]
): [count: number, value: number][] => {
  const entries: [number, number][] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    if (bytes[index] === 0 || bytes[index]! >= 0x80) {
      break;
    }
    entries.push([bytes[index]!, bytes[index + 1]!]);
  }
  return entries;
};

export class GhettoblasterSid {
  private readonly driver: DamoclesPsgDriver;
  private readonly walks: NoteWalk[];
  private readonly tables: Map<number, MusicTable['entries']>;
  private readonly ym = new Array<number>(16).fill(0);
  private readonly sid = new Map<number, number>();
  private width: number = SWEEP.low;
  private direction = 1;
  private cutoff: number = CUTOFF.closed;
  private started = false;

  constructor(
    music: DamoclesMusicData,
    private readonly clockHz: number
  ) {
    this.driver = new DamoclesPsgDriver(music);
    this.walks = music.voices.map(voice => new NoteWalk(voice.ops, voice.loop));
    this.tables = new Map([
      [0, addressZeroEntries(music.addressZero)],
      ...music.volumeTables.map(table => [table.index, table.entries] as const)
    ]);
    this.ym[7] = 0xff;
    this.driver.setMusic(true);
  }

  /// The writes before the first VBL: every voice cleared with its gate off, the filter set.
  start(): readonly SidRegisterWrite[] {
    const writes: SidRegisterWrite[] = [];
    for (let register = 0; register < 3 * VOICE_STRIDE; register += 1) {
      writes.push({ register, value: 0 });
    }
    writes.push(
      { register: 21, value: this.cutoff & 7 },
      { register: 22, value: this.cutoff >> 3 },
      { register: 23, value: RESONANCE_ROUTING },
      { register: 24, value: MODE_VOLUME }
    );
    for (const { register, value } of writes) {
      this.sid.set(register, value);
    }
    return writes;
  }

  /// One VBL of the player, as the SID writes that change what the voices play.
  vbl(): readonly SidRegisterWrite[] {
    this.driver.vbl({
      write: (register, value) => {
        this.ym[register] = value & 0xff;
      }
    });
    const writes: SidRegisterWrite[] = [];
    const set = (register: number, value: number, always = false): void => {
      if (always || this.sid.get(register) !== value) {
        this.sid.set(register, value);
        writes.push({ register, value });
      }
    };
    // The player's first VBL only starts it; its notes begin on the next.
    const notes = this.started
      ? this.walks.map(walk => walk.step())
      : this.walks.map(() => undefined);
    this.started = true;
    this.width += this.direction * SWEEP.step;
    if (this.width >= SWEEP.high || this.width <= SWEEP.low) {
      this.direction = -this.direction;
    }
    set(9, this.width & 0xff);
    set(10, this.width >> 8);
    for (let voice = 0; voice < 3; voice += 1) {
      const base = voice * VOICE_STRIDE;
      const waveform = WAVEFORMS[voice]!;
      const frequency = this.frequency(voice);
      set(base, frequency & 0xff);
      set(base + 1, frequency >> 8);
      const note = notes[voice];
      if (note === undefined) {
        continue;
      }
      if (note.rest) {
        set(base + 4, waveform);
        continue;
      }
      if (waveform === NOISE) {
        set(base + 5, decayRate((note.vbls * 0.6) / 50));
        set(base + 6, 0x00);
      } else {
        const envelope = envelopeForTable(this.tables.get(note.table) ?? []);
        set(base + 5, envelope.attackDecay);
        set(base + 6, envelope.sustainRelease);
      }
      if (waveform === PULSE) {
        this.cutoff = CUTOFF.open;
      }
      // Gate off and on in one batch: the attack restarts the note.
      set(base + 4, waveform, true);
      set(base + 4, waveform | GATE, true);
    }
    set(21, this.cutoff & 7);
    set(22, this.cutoff >> 3);
    this.cutoff = Math.round(
      CUTOFF.closed + (this.cutoff - CUTOFF.closed) * CUTOFF.keep
    );
    return writes;
  }

  private frequency(voice: number): number {
    if (WAVEFORMS[voice] === NOISE) {
      // The YM's noise shifts at the clock over 16 × its period; the SID's at 16 × its pitch.
      const period = this.ym[6]! & 0x1f || 1;
      return frequencyWord(YM_CLOCK_HERTZ / (16 * period) / 16, this.clockHz);
    }
    const period =
      this.ym[2 * voice]! | ((this.ym[2 * voice + 1]! & 0x0f) << 8) || 1;
    return frequencyWord(YM_CLOCK_HERTZ / (16 * period), this.clockHz);
  }
}
