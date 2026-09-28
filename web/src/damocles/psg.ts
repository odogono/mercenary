import type { MusicOp, MusicTable } from './music.ts';
import type { Effect } from './script.ts';

/// The Damocles sound driver, as recovered from the ST's 68000 code (#508, #514:
/// `docs/research/damocles-lift-ride.md#what-the-programmes-play` and
/// `docs/research/damocles-sound-programmes.md`).
///
/// The game plays most of its sounds from two per-VBL vectors, `$04BF54` and `$04BF58`, which
/// `$051E0E` and `$051E16` call in that order. A request arms a vector, and the armed programme
/// then writes the YM2149 once a VBL until it disarms itself or another request replaces it.
/// The first vector plays on channel B and the second on channel C. A few sounds write the chip
/// from outside the vectors: the Geiger counter's click, the message tone, the New Game descent
/// drone, and the GHETTOBLASTER's music player, which replaces both vectors while it plays.
///
/// This is presentation only. It reads requests a Gameplay Session (or the sound board) has
/// already made and writes nothing back.

/// What a Gameplay Session asks for.
export type DamoclesCue = Extract<
  Effect,
  { readonly type: 'sound-request' }
>['cue'];

/// The rest of the driver, which no session asks for yet; the sound board plays them.
export type DamoclesProgramme =
  | 'blown-up'
  | 'channel-c-off'
  | 'descent-end'
  | 'descent-start'
  | 'descent-step'
  | 'geiger-click'
  | 'hazard-alarm'
  | 'restore'
  | 'spell'
  | 'transporter';

export type DamoclesRequest = DamoclesCue | DamoclesProgramme;

export interface PsgSink {
  readonly write: (register: number, value: number) => void;
}

/// A table the driver's step routines `$04C722` (words) and `$04C73A` (bytes) walk: each entry
/// holds its value for `count` VBLs, a count of zero ends the table, and `loop` is where the
/// `$8000`/`$80` marker sends the walk once the last entry is spent.
interface StepTable {
  readonly entries: readonly (readonly [count: number, value: number])[];
  readonly loop: number | null;
}

/// `$04C43C`: the door tone's period, $3E8 and $41A a VBL each, for ever.
const DOOR_PERIODS: StepTable = {
  entries: [
    [1, 0x03_e8],
    [1, 0x04_1a]
  ],
  loop: 0
};

/// `$04C44A`: the door tone swells and falls, then holds 9 to 5 over and over (`$04C456`).
const DOOR_START_LEVELS: StepTable = {
  entries: [
    [1, 10],
    [1, 11],
    [1, 13],
    [1, 13],
    [1, 11],
    [1, 10],
    [1, 9],
    [1, 8],
    [1, 7],
    [1, 6],
    [1, 5]
  ],
  loop: 6
};

/// `$04C466`: the door burst's four levels, then the table ends.
const DOOR_STOP_LEVELS: StepTable = {
  entries: [
    [1, 12],
    [1, 8],
    [1, 4],
    [1, 0]
  ],
  loop: null
};

/// `$04C1DC`: the hazard alarm's levels, 16 VBLs a loop.
const ALARM_LEVELS: StepTable = {
  entries: [
    [2, 2],
    [3, 3],
    [4, 4],
    [2, 7],
    [2, 15],
    [3, 3]
  ],
  loop: 0
};

/// `$008702`: the bump's periods. `$FFFF` sends the reader back to the start without a write
/// that VBL; the stream holds no `$FFFE`, so the bump never ends by itself.
const BUMP_STREAM = [
  0x0f_f0, 0x0f_e0, 0x0f_d0, 0x0f_c2, 0x0f_b0, 0x0f_a0, 0x0f_50, 0x0f_40,
  0xff_ff
] as const;

/// `$0508F8`: registers 0 to 12 as the reset `$0508BC` writes them. The mixer `$DA` leaves
/// channel A's tone on, which the message tone needs and nothing else in the driver changes.
const RESET_REGISTERS = [
  0x01, 0x00, 0x01, 0x00, 0x01, 0x00, 0x1f, 0xda, 0x00, 0x10, 0x00, 0x00, 0x00
] as const;

/// A walk through one table: the counter `$04BF1E`/`$04BF25` and the pointer after it.
class TableWalk {
  private counter = 1;
  private cursor = 0;

  constructor(private readonly table: StepTable) {}

  /// One VBL: `subq #1` on the counter, and a step once it reaches zero. Answers the value a
  /// step reads, `'end'` when the table ends, or nothing when the counter is still running.
  tick(): number | 'end' | undefined {
    // The counter is a word or a byte in the ST; a spent table leaves it at zero, so the next
    // decrement wraps instead of stepping again.
    this.counter -= 1;
    if (this.counter !== 0) {
      return undefined;
    }
    if (this.cursor >= this.table.entries.length) {
      if (this.table.loop === null) {
        return 'end';
      }
      this.cursor = this.table.loop;
    }
    const [count, value] = this.table.entries[this.cursor]!;
    this.cursor += 1;
    this.counter = count;
    return value;
  }
}

/// What the first vector `$04BF54` holds. An entry runs on the VBL after it is armed; the
/// continuations then run once a VBL.
type ChannelB =
  | { readonly kind: 'idle' }
  | {
      readonly entry:
        | 'blast'
        | 'blown-up'
        | 'bump'
        | 'effect'
        | 'shot'
        | 'spell'
        | 'splash'
        | 'thud'
        | 'transporter'
        | 'zap';
      readonly kind: 'armed';
    }
  | { cursor: number; readonly kind: 'bump' }
  | { counter: number; readonly kind: 'spell' | 'splash' | 'transporter' };

/// What the second vector `$04BF58` holds.
type ChannelC =
  | {
      readonly kind:
        'alarm' | 'engine' | 'off' | 'restore' | 'silence' | 'start' | 'stop';
    }
  | { readonly kind: 'alarm-step'; readonly levels: TableWalk }
  | {
      readonly kind: 'start-step' | 'stop-step';
      readonly levels: TableWalk;
      readonly periods: TableWalk;
    };

/// The 68000's `move.w d7,d6; ror.w #8,d7` split of a period into fine and coarse registers.
const writePeriod = (sink: PsgSink, fine: number, period: number): void => {
  sink.write(fine, period & 0xff);
  sink.write(fine + 1, (period >> 8) & 0xff);
};

/// The tune as the player needs it: the payload's voices and tables, and the bytes at address
/// 0 that a voice with no table walks (`docs/research/damocles-sound-programmes.md`).
export interface DamoclesMusicData {
  readonly addressZero: readonly number[];
  readonly pitchTables: readonly MusicTable[];
  readonly voices: readonly {
    readonly loop: number;
    readonly ops: readonly MusicOp[];
  }[];
  readonly volumeTables: readonly MusicTable[];
}

/// One voice of `$033F6A`: its stream position, its note counter, the tables it has picked
/// and the walks through them, and the level byte and period word they leave.
interface MusicVoiceState {
  base: number;
  counter: number;
  cursor: number;
  level: number;
  period: number;
  pitch: StepTable;
  pitchWalk: TableWalk | null;
  volume: StepTable;
  volumeWalk: TableWalk | null;
}

/// The (count, value) pairs at address 0, walked as a table (`$033F96` reads whatever the
/// null pointer reaches). It stops where a count of zero ends it.
const addressZeroTable = (bytes: readonly number[]): StepTable => {
  const entries: [number, number][] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const count = bytes[index]!;
    if (count === 0 || count >= 0x80) {
      break;
    }
    const value = bytes[index + 1]!;
    entries.push([count, value >= 0x80 ? value - 0x1_00 : value]);
  }
  return { entries, loop: null };
};

/// The payload's tables by index, as the walks read them.
const stepTables = (tables: readonly MusicTable[]): Map<number, StepTable> =>
  new Map(tables.map(t => [t.index, { entries: t.entries, loop: t.loop }]));

/// The GHETTOBLASTER's player `$033F6A`, called every VBL instead of both vectors while
/// `$033F68` is set. Its state survives a stop, so a restart resumes the tune where it was.
class MusicPlayer {
  /// `$033F68`: 0 idle, `$0100` start asked for, `$0001` stop asked for, `$FFFF` playing.
  state = 0;
  /// `$033F7C`: the player keeps a mixer copy of its own.
  private mixer = 0xff;
  private readonly voices: MusicVoiceState[];
  private readonly volumeTables: Map<number, StepTable>;
  private readonly pitchTables: Map<number, StepTable>;
  private readonly zero: StepTable;

  constructor(private readonly data: DamoclesMusicData) {
    this.zero = addressZeroTable(data.addressZero);
    this.volumeTables = stepTables(data.volumeTables);
    this.pitchTables = stepTables(data.pitchTables);
    this.voices = data.voices.map(() => ({
      base: 0,
      counter: 1,
      cursor: 0,
      level: 0,
      period: 0,
      pitch: this.zero,
      pitchWalk: null,
      volume: this.zero,
      volumeWalk: null
    }));
  }

  /// `$0594A4`, once a main-loop pass: start the tune if nothing plays, or stop it.
  ask(playing: boolean): void {
    if (playing) {
      if ((this.state & 0x80_00) === 0) {
        this.state = 0x01_00;
      }
    } else if (this.state !== 0) {
      this.state = 0x00_01;
    }
  }

  /// One VBL, on the high byte of `$033F68`.
  vbl(sink: PsgSink): void {
    const high = (this.state >> 8) & 0xff;
    if (high >= 0x80) {
      this.play(sink);
      return;
    }
    this.stop(sink);
    if (high !== 0) {
      // `$034024`–`$03407E`: noise without tone on A, tone without noise on B and C.
      this.writeMixer(sink, (this.mixer & 0xf7) | 0x01);
      this.writeMixer(sink, (this.mixer & 0xfd) | 0x10);
      this.writeMixer(sink, (this.mixer & 0xfb) | 0x20);
      this.state = 0xff_ff;
    }
  }

  /// `$034390`: every channel off in the mixer, their levels 0, and `$033F68` cleared.
  private stop(sink: PsgSink): void {
    this.writeMixer(sink, this.mixer | 0x09);
    this.writeMixer(sink, this.mixer | 0x12);
    this.writeMixer(sink, this.mixer | 0x24);
    sink.write(8, 0);
    sink.write(9, 0);
    sink.write(10, 0);
    this.state = 0;
  }

  private play(sink: PsgSink): void {
    // `$034088`–`$034262`: each voice's note counter, and the stream when it runs out.
    this.data.voices.forEach((voice, index) => {
      const state = this.voices[index]!;
      state.counter = (state.counter - 1) & 0xff;
      if (state.counter !== 0) {
        return;
      }
      for (;;) {
        if (state.cursor >= voice.ops.length) {
          state.cursor = voice.loop;
        }
        const op = voice.ops[state.cursor]!;
        state.cursor += 1;
        if (op.op === 'volume') {
          state.volume = this.volumeTables.get(op.table) ?? this.zero;
        } else if (op.op === 'pitch') {
          state.pitch = this.pitchTables.get(op.table) ?? this.zero;
        } else if (op.op === 'note') {
          state.counter = op.vbls;
          state.base = op.period;
          state.volumeWalk = new TableWalk(state.volume);
          state.pitchWalk = new TableWalk(state.pitch);
          return;
        }
      }
    });
    // `$034262`–`$0342F8`: each voice's two walks, the level and the base-plus-bend period.
    for (const state of this.voices) {
      const level = state.volumeWalk?.tick();
      if (typeof level === 'number') {
        state.level = level & 0xff;
      }
      const bend = state.pitchWalk?.tick();
      if (typeof bend === 'number') {
        state.period = (state.base + bend) & 0xff_ff;
      }
    }
    // `$0342F8`–`$03438E`: a negative period is a rest. Voice 1's period goes nowhere; the
    // noise period is the byte at `$000001`, which is the TOS ROM's.
    const levels = this.voices.map(voice =>
      voice.period & 0x80_00 ? 0 : voice.level
    );
    const [, second, third] = this.voices;
    sink.write(6, this.data.addressZero[1] ?? 0);
    sink.write(8, levels[0]!);
    writePeriod(sink, 2, second!.period);
    sink.write(9, levels[1]!);
    writePeriod(sink, 4, third!.period);
    sink.write(10, levels[2]!);
  }

  private writeMixer(sink: PsgSink, value: number): void {
    this.mixer = value & 0xff;
    sink.write(7, this.mixer);
  }
}

/// `$052402`'s walk through a message: the reveal counter `$7BE6`, the text pointer `$7B98`
/// and the sub-cell shift `$0523B6`.
class MessageReveal {
  private counter: number | null = null;
  private cursor = 0;
  private shift = -2;

  constructor(private readonly text: string) {}

  /// One VBL: the character code whose tone it sounds, `'hold'` when it writes nothing, or
  /// `'silent'` once the scroll-in is over.
  step(): number | 'hold' | 'silent' {
    if (this.counter === null) {
      // `$0523C6`: counter 0 and the shift `$FFFE`.
      this.counter = 0;
      return 'hold';
    }
    this.counter += 1;
    if (this.counter === 37) {
      return 'hold';
    }
    if (this.counter > 37) {
      return 'silent';
    }
    // `$052424` pitches from the first fetch. A spent shift fetches again at `$0525C4` to start
    // the next glyph pair and resets to 4, and each VBL takes 2 off it, so the pointer runs 2, 1,
    // 1: the tones are characters 0, 2, 3, 4, 6, 7 and so on, never 1, 5, 9.
    const code = this.fetch();
    if (this.shift < 0) {
      this.fetch();
      this.shift = 4;
    }
    this.shift -= 2;
    return code;
  }

  /// `$05234C`. At the terminator it answers a space and leaves the pointer on the NUL. No
  /// record holds a numeric field (a code of `$61` or above), so that path is not followed.
  private fetch(): number {
    const code = this.text.charCodeAt(this.cursor);
    if (Number.isNaN(code) || code === 0) {
      return 0x20;
    }
    this.cursor += 1;
    return code;
  }
}

export class DamoclesPsgDriver {
  /// `$7C04`: the driver keeps its own copy of the mixer and edits that, never reading the chip.
  private mixer = 0xff;
  /// `$04BF54`, idle on the bare `rts` at `$051E86`.
  private channelB: ChannelB = { kind: 'idle' };
  /// `$04BF58`. Every capture holds the idle engine `$04C250` there.
  private channelC: ChannelC = { kind: 'engine' };
  /// `$797A`'s high word: the exponent of the craft's speed. The engine sounds at 0 and up.
  private speedExponent = -1;
  /// `$7C0C`: set while the engine is sounding, so the next quiet VBL silences it once.
  private engineSounding = false;
  /// The descent drone's two periods, `$7BEE` (channel B) and `$7BF0` (channel C).
  private drone = { b: 0x04_00, c: 0x04_80 };
  /// The message presenting behind the gate `$7BA0`, while its scroll-in still writes channel A.
  private message: MessageReveal | null = null;
  private readonly music: MusicPlayer | null;

  constructor(music: DamoclesMusicData | null = null) {
    this.music = music === null ? null : new MusicPlayer(music);
  }

  /// `$033F68` non-zero: the player runs instead of the vectors, and the writers outside them
  /// stand aside.
  private get musicPlaying(): boolean {
    return (this.music?.state ?? 0) !== 0;
  }

  /// `$0508BC`, at start-up and after a load: both vectors idle, and registers 0 to 12 from
  /// `$0508F8` unless the music is playing.
  powerOn(sink: PsgSink): void {
    this.channelB = { kind: 'idle' };
    this.channelC = { kind: 'off' };
    this.mixer = RESET_REGISTERS[7];
    if (!this.musicPlaying) {
      RESET_REGISTERS.forEach((value, register) => sink.write(register, value));
    }
  }

  /// What a request itself writes, in the frame loop and before any VBL runs.
  request(request: DamoclesRequest, sink: PsgSink): void {
    switch (request) {
      case 'drop':
      case 'take':
      case 'throttle':
        // `$054848`, after the session's `$7A0C` guard: arm `$04C556`, then cut channel C at
        // once, unless the engine is sounding (`$7C0C`) or the music plays (`$033F68`).
        this.channelB = { entry: 'effect', kind: 'armed' };
        if (!this.engineSounding && !this.musicPlaying) {
          sink.write(10, 0);
        }
        return;
      case 'door-start':
        // `$05AA2A`: a door has started moving.
        this.channelC = { kind: 'start' };
        return;
      case 'door-stop':
        // `$05A9DC`: every door has stopped.
        this.channelC = { kind: 'stop' };
        return;
      case 'blast':
      case 'blown-up':
      case 'bump':
      case 'shot':
      case 'spell':
      case 'splash':
      case 'thud':
      case 'transporter':
      case 'zap':
        this.channelB = { entry: request, kind: 'armed' };
        return;
      case 'hazard-alarm':
        // `$050F46`: a warning's ten seconds begin.
        this.channelC = { kind: 'alarm' };
        return;
      case 'channel-c-off':
        // `$050F7C` and the hazard's other ends arm `$04C1EE`.
        this.channelC = { kind: 'silence' };
        return;
      case 'restore':
        // Boarding (`$054358`), the main loop's entry and the pause menu's F10 arm `$04C220`.
        this.channelC = { kind: 'restore' };
        return;
      case 'geiger-click':
        // `$051D62` calls `$04C6B2` directly from the tick: a 2604 Hz blip under envelope
        // period $40, ending in the tail that disarms whatever channel B programme was running.
        sink.write(11, 0x40);
        sink.write(12, 0x00);
        writePeriod(sink, 2, 0x00_30);
        this.writeMixer(sink, (this.mixer & 0xfd) | 0x10);
        this.envelopeTail(sink);
        return;
      case 'descent-start':
        // `$051274`: tone B $400 and tone C $480.
        this.drone = { b: 0x04_00, c: 0x04_80 };
        this.writeDrone(sink);
        return;
      case 'descent-step':
        // `$051340`: both periods 4 longer, a step a frame.
        this.drone = { b: this.drone.b + 4, c: this.drone.c + 4 };
        this.writeDrone(sink);
        return;
      case 'descent-end':
        // `$05142E`: channels B and C to 0, and the restore armed.
        if (!this.musicPlaying) {
          sink.write(9, 0);
          sink.write(10, 0);
        }
        this.channelC = { kind: 'restore' };
    }
  }

  /// `$797A`, which the flight code rewrites as the craft's speed changes: the exponent of
  /// the speed as the program's float holds it.
  setSpeedExponent(exponent: number): void {
    this.speedExponent = exponent;
  }

  /// A message raised the gate `$7BA0` with `text` behind the pointer `$7B98`. `$052402`, in
  /// the VBL at `$051E1E`, begins it on the next VBL and sounds its scroll-in on the 36 after.
  showMessage(text: string): void {
    this.message = new MessageReveal(text);
  }

  /// `$0594A4`: the GHETTOBLASTER switched on while carried, or off. Without the tune there is
  /// nothing to play.
  setMusic(playing: boolean): void {
    this.music?.ask(playing);
  }

  /// One VBL: the music player while it plays, otherwise the first vector and then the second;
  /// then the message routine, which runs either way and only writes while the music is off.
  vbl(sink: PsgSink): void {
    if (this.music !== null && this.musicPlaying) {
      this.music.vbl(sink);
    } else {
      this.stepChannelB(sink);
      this.stepChannelC(sink);
    }
    this.stepMessage(sink);
  }

  reset(): void {
    this.mixer = 0xff;
    this.channelB = { kind: 'idle' };
    this.channelC = { kind: 'engine' };
    this.speedExponent = -1;
    this.engineSounding = false;
    this.message = null;
    if (this.music !== null) {
      this.music.state = 0;
    }
  }

  /// One VBL of `$052402` (`docs/research/damocles-message-reveal.md#sound`). Counter 0 is the
  /// VBL that finds the gate just raised and writes nothing. On 1 to 36 channel A's fine period
  /// (register 0 only) is the character fetched first that VBL times two, at level 12, or 0 for
  /// a space. 37 copies the row and writes nothing, so the last tone holds a second VBL; from 38
  /// every VBL writes level 0 until the message ends. Nothing else writes channel A while the
  /// music is off, so the first of those writes stands for all of them and the reveal ends there.
  private stepMessage(sink: PsgSink): void {
    const message = this.message;
    if (message === null) {
      return;
    }
    const tone = message.step();
    if (tone === 'hold') {
      return;
    }
    if (tone === 'silent') {
      this.message = null;
    }
    if (this.musicPlaying) {
      return;
    }
    if (tone === 'silent') {
      sink.write(8, 0);
      return;
    }
    sink.write(0, (tone * 2) & 0xff);
    sink.write(8, 12);
    if (tone === 0x20) {
      sink.write(8, 0);
    }
  }

  private writeDrone(sink: PsgSink): void {
    // `$051288`–`$05133E`: the mixer written outright as $F8 (every tone, no noise), not
    // through the copy `$7C04`, then both periods and both levels at 9.
    if (this.musicPlaying) {
      return;
    }
    sink.write(7, 0xf8);
    writePeriod(sink, 2, this.drone.b);
    writePeriod(sink, 4, this.drone.c);
    sink.write(9, 9);
    sink.write(10, 9);
  }

  /// `$04C5C6`: noise period $1F, channel B noise on and tone off, then the envelope tail.
  private noiseTail(sink: PsgSink): void {
    sink.write(6, 0x1f);
    this.writeMixer(sink, (this.mixer & 0xef) | 0x02);
    this.envelopeTail(sink);
  }

  /// `$04C5EC`: channel B under the envelope, shape 9 (one decay, then silence), and the
  /// vector disarmed.
  private envelopeTail(sink: PsgSink): void {
    sink.write(9, 0x1f);
    sink.write(13, 0x09);
    this.channelB = { kind: 'idle' };
  }

  private envelopePeriod(sink: PsgSink, period: number): void {
    sink.write(11, period & 0xff);
    sink.write(12, (period >> 8) & 0xff);
  }

  private stepChannelB(sink: PsgSink): void {
    const b = this.channelB;
    switch (b.kind) {
      case 'idle':
        return;
      case 'armed':
        this.enterChannelB(b.entry, sink);
        return;
      case 'spell': {
        // `$04BFE2`: the counter gains $333 a VBL, and tone B is it masked with $1F1.
        b.counter = (b.counter + 0x03_33) & 0xff_ff;
        writePeriod(sink, 2, b.counter & 0x01_f1);
        return;
      }
      case 'splash': {
        // `$04C09C`: the counter's high byte gains $46 a VBL, and is the noise period.
        b.counter = (b.counter + 0x46) & 0xff;
        sink.write(6, b.counter);
        return;
      }
      case 'transporter': {
        // `$04C13A`: the counter gains $313 a VBL, and tone B is it masked with $118.
        b.counter = (b.counter + 0x03_13) & 0xff_ff;
        writePeriod(sink, 2, b.counter & 0x01_18);
        return;
      }
      case 'bump': {
        // `$04C4EA`: the next word of the stream.
        const word = BUMP_STREAM[b.cursor]!;
        b.cursor += 1;
        if (word === 0xff_ff) {
          b.cursor = 0;
          return;
        }
        writePeriod(sink, 2, word);
      }
    }
  }

  private enterChannelB(
    entry: Extract<ChannelB, { kind: 'armed' }>['entry'],
    sink: PsgSink
  ): void {
    switch (entry) {
      case 'effect':
        // `$04C556` and its tail `$04C5EC`: a channel B tone of period $60 under envelope
        // shape 9 of period $1F00, one decay of about a second.
        this.envelopePeriod(sink, 0x1f_00);
        writePeriod(sink, 2, 0x00_60);
        // Channel B tone on, channel B noise off.
        this.writeMixer(sink, (this.mixer & 0xfd) | 0x10);
        this.envelopeTail(sink);
        return;
      case 'spell':
        // `$04BF5C`: tone B, noise and envelope under a $8021 decay of 4.2 s.
        writePeriod(sink, 2, 0);
        sink.write(6, 0);
        this.writeMixer(sink, (this.mixer & 0xfd) | 0x10);
        sink.write(9, 0x1f);
        this.envelopePeriod(sink, 0x80_21);
        sink.write(13, 0x09);
        this.channelB = { counter: 0x02_00, kind: 'spell' };
        this.stepChannelB(sink);
        return;
      case 'splash':
        // `$04C016`: noise on B only, under shape 2 of period $1A00.
        writePeriod(sink, 2, 0x0a_a0);
        sink.write(6, 0xa0);
        this.writeMixer(sink, (this.mixer & 0xef) | 0x02);
        sink.write(9, 0x1f);
        this.envelopePeriod(sink, 0x1a_00);
        sink.write(13, 0x02);
        this.channelB = { counter: 0, kind: 'splash' };
        this.stepChannelB(sink);
        return;
      case 'transporter':
        // `$04C0B4`: tone and noise on B, under a $2021 decay.
        writePeriod(sink, 2, 0x0f_ff);
        sink.write(6, 0xf0);
        this.writeMixer(sink, this.mixer & 0xed);
        sink.write(9, 0x1f);
        this.envelopePeriod(sink, 0x20_21);
        sink.write(13, 0x09);
        this.channelB = { counter: 0x0f_00, kind: 'transporter' };
        this.stepChannelB(sink);
        return;
      case 'bump':
        // `$04C470`: tone B under a $3021 decay, its periods from the stream at `$008702`.
        writePeriod(sink, 2, 0);
        this.writeMixer(sink, (this.mixer & 0xfd) | 0x10);
        sink.write(9, 0x1f);
        this.envelopePeriod(sink, 0x30_21);
        sink.write(13, 0x09);
        this.channelB = { cursor: 0, kind: 'bump' };
        this.stepChannelB(sink);
        return;
      case 'blast':
        // `$04C5A8`: noise under a $3FFF decay of 2.1 s.
        this.envelopePeriod(sink, 0x3f_ff);
        this.noiseTail(sink);
        return;
      case 'shot':
        // `$04C610`: noise under $0F00, 0.49 s.
        this.envelopePeriod(sink, 0x0f_00);
        this.noiseTail(sink);
        return;
      case 'thud':
        // `$04C630`: noise under $0800, 0.26 s.
        this.envelopePeriod(sink, 0x08_00);
        this.noiseTail(sink);
        return;
      case 'blown-up':
        // `$04C700`: noise under $8F00, 4.7 s.
        this.envelopePeriod(sink, 0x8f_00);
        this.noiseTail(sink);
        return;
      case 'zap':
        // `$04C652`: tone B $00C and noise 5 together under $4000.
        this.envelopePeriod(sink, 0x40_00);
        writePeriod(sink, 2, 0x00_0c);
        sink.write(6, 0x05);
        this.writeMixer(sink, this.mixer & 0xed);
        this.envelopeTail(sink);
    }
  }

  private stepChannelC(sink: PsgSink): void {
    const c = this.channelC;
    switch (c.kind) {
      case 'off':
        return;
      case 'start': {
        // `$04C37A`: period $400, channel C tone and noise both on, level 15. The step it falls
        // into rewrites the period and level in the same VBL.
        writePeriod(sink, 4, 0x04_00);
        this.writeMixer(sink, this.mixer & 0xdb);
        sink.write(10, 15);
        this.channelC = {
          kind: 'start-step',
          levels: new TableWalk(DOOR_START_LEVELS),
          periods: new TableWalk(DOOR_PERIODS)
        };
        this.stepChannelC(sink);
        return;
      }
      case 'start-step': {
        // `$04C3EA`: the fastest noise, and each table's next step.
        sink.write(6, 0);
        const period = c.periods.tick();
        if (typeof period === 'number') {
          writePeriod(sink, 4, period);
        }
        const level = c.levels.tick();
        if (typeof level === 'number') {
          sink.write(10, level);
        }
        return;
      }
      case 'stop': {
        // `$04C2B8`: noise period $1F, channel C noise on and tone off.
        writePeriod(sink, 4, 0x04_00);
        sink.write(6, 0x1f);
        this.writeMixer(sink, (this.mixer & 0xdf) | 0x04);
        this.channelC = {
          kind: 'stop-step',
          levels: new TableWalk(DOOR_STOP_LEVELS),
          periods: new TableWalk(DOOR_PERIODS)
        };
        this.stepChannelC(sink);
        return;
      }
      case 'stop-step': {
        // `$04C328`: as the tone's step, less the noise write; the burst's end rearms the vector.
        const period = c.periods.tick();
        if (typeof period === 'number') {
          writePeriod(sink, 4, period);
        }
        const level = c.levels.tick();
        if (level === 'end') {
          this.channelC = { kind: 'restore' };
        } else if (level !== undefined) {
          sink.write(10, level);
        }
        return;
      }
      case 'restore':
        // `$04C220`: channel C tone and noise back on at level 0, and noise period $1F, then
        // the idle engine `$04C250` in the same VBL.
        this.writeMixer(sink, this.mixer & 0xdb);
        sink.write(6, 0x1f);
        this.channelC = { kind: 'engine' };
        this.stepEngine(sink);
        return;
      case 'engine':
        this.stepEngine(sink);
        return;
      case 'silence':
        this.channelCOff(sink);
        this.channelC = { kind: 'off' };
        return;
      case 'alarm':
        // `$04C16E`: tone C $800 (61 Hz), tone on and noise off, and the level walk.
        writePeriod(sink, 4, 0x08_00);
        this.writeMixer(sink, (this.mixer & 0xfb) | 0x20);
        this.channelC = {
          kind: 'alarm-step',
          levels: new TableWalk(ALARM_LEVELS)
        };
        this.stepChannelC(sink);
        return;
      case 'alarm-step': {
        // `$04C1C0`: a level step writes channel C's level.
        const level = c.levels.tick();
        if (typeof level === 'number') {
          sink.write(10, level);
        }
      }
    }
  }

  /// `$04C1EE`: channel C's tone and noise off, its level 0, and the vector left on `rts`.
  private channelCOff(sink: PsgSink): void {
    this.writeMixer(sink, this.mixer | 0x24);
    sink.write(10, 0);
  }

  /// `$04C250`: while the speed's exponent is not negative, channel C at that level (at most
  /// 15) over tone $10 and noise $1F; once it falls below, one write of level 0.
  private stepEngine(sink: PsgSink): void {
    if (this.speedExponent >= 0) {
      this.engineSounding = true;
      sink.write(10, Math.min(this.speedExponent, 15));
      writePeriod(sink, 4, 0x00_10);
      sink.write(6, 0x1f);
      return;
    }
    if (this.engineSounding) {
      sink.write(10, 0);
      this.engineSounding = false;
    }
  }

  private writeMixer(sink: PsgSink, value: number): void {
    this.mixer = value;
    sink.write(7, value);
  }
}
