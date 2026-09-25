import type { Effect } from './script.ts';

/// The Damocles sound driver's door and shared-effect programmes, as recovered from the ST's
/// 68000 code (#508, `docs/research/damocles-lift-ride.md#what-the-programmes-play`).
///
/// The game plays these from two per-VBL vectors, `$04BF54` and `$04BF58`, which `$051E0E` and
/// `$051E16` call in that order. A request arms a vector, and the armed programme then writes
/// the YM2149 once a VBL until it disarms itself or another request replaces it. The shared
/// effect plays on channel B and the door tone and burst on channel C, so the two never
/// interrupt one another; a door edge replaces whatever door programme is running.
///
/// This is presentation only. It reads Sound Cues a Gameplay Session has already committed and
/// writes nothing back.

export type DamoclesCue = Effect['cue'];

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

type DoorProgramme =
  | { readonly kind: 'idle' }
  | { readonly kind: 'start' | 'stop' }
  | {
      readonly kind: 'start-step' | 'stop-step';
      readonly levels: TableWalk;
      readonly periods: TableWalk;
    }
  | { readonly kind: 'restore' };

/// The 68000's `move.w d7,d6; ror.w #8,d7` split of a period into fine and coarse registers.
const writePeriod = (sink: PsgSink, fine: number, period: number): void => {
  sink.write(fine, period & 0xff);
  sink.write(fine + 1, (period >> 8) & 0xff);
};

export class DamoclesPsgDriver {
  /// `$7C04`: the driver keeps its own copy of the mixer and edits that, never reading the chip.
  private mixer = 0xff;
  /// `$04BF54`: `$04C556` when the shared effect is armed, else the idle `rts` at `$051E86`.
  private effectArmed = false;
  /// `$04BF58`, which idles on `$04C250` once a door burst has run.
  private door: DoorProgramme = { kind: 'idle' };

  /// What the request itself writes, in the frame loop and before any VBL runs.
  request(cue: DamoclesCue, sink: PsgSink): void {
    switch (cue) {
      case 'drop':
      case 'take':
        // `$054848`, after the session's `$7A0C` guard: arm `$04C556`, then cut channel C at
        // once. `$7C0C` and `$033F68` would skip that write, and neither is ever set here.
        this.effectArmed = true;
        sink.write(10, 0);
        return;
      case 'door-start':
        // `$05AA2A`: a door has started moving.
        this.door = { kind: 'start' };
        return;
      case 'door-stop':
        // `$05A9DC`: every door has stopped.
        this.door = { kind: 'stop' };
    }
  }

  /// One VBL of the driver: the effect vector, then the door vector.
  vbl(sink: PsgSink): void {
    if (this.effectArmed) {
      this.playEffect(sink);
    }
    this.stepDoor(sink);
  }

  reset(): void {
    this.mixer = 0xff;
    this.effectArmed = false;
    this.door = { kind: 'idle' };
  }

  /// `$04C556` and its tail `$04C5EC`: a channel B tone of period $60 under envelope shape 9 of
  /// period $1F00, one decay of about a second. It runs once and disarms itself; the chip's
  /// envelope does the rest.
  private playEffect(sink: PsgSink): void {
    sink.write(11, 0x00);
    sink.write(12, 0x1f);
    writePeriod(sink, 2, 0x00_60);
    // Channel B tone on, channel B noise off.
    this.writeMixer(sink, (this.mixer & 0xfd) | 0x10);
    sink.write(9, 0x1f);
    sink.write(13, 0x09);
    this.effectArmed = false;
  }

  private stepDoor(sink: PsgSink): void {
    const door = this.door;
    switch (door.kind) {
      case 'idle':
        return;
      case 'start': {
        // `$04C37A`: period $400, channel C tone and noise both on, level 15. The step it falls
        // into rewrites the period and level in the same VBL.
        writePeriod(sink, 4, 0x04_00);
        this.writeMixer(sink, this.mixer & 0xdb);
        sink.write(10, 15);
        this.door = {
          kind: 'start-step',
          levels: new TableWalk(DOOR_START_LEVELS),
          periods: new TableWalk(DOOR_PERIODS)
        };
        this.stepDoor(sink);
        return;
      }
      case 'start-step': {
        // `$04C3EA`: the fastest noise, and each table's next step.
        sink.write(6, 0);
        const period = door.periods.tick();
        if (typeof period === 'number') {
          writePeriod(sink, 4, period);
        }
        const level = door.levels.tick();
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
        this.door = {
          kind: 'stop-step',
          levels: new TableWalk(DOOR_STOP_LEVELS),
          periods: new TableWalk(DOOR_PERIODS)
        };
        this.stepDoor(sink);
        return;
      }
      case 'stop-step': {
        // `$04C328`: as the tone's step, less the noise write; the burst's end rearms the vector.
        const period = door.periods.tick();
        if (typeof period === 'number') {
          writePeriod(sink, 4, period);
        }
        const level = door.levels.tick();
        if (level === 'end') {
          this.door = { kind: 'restore' };
        } else if (level !== undefined) {
          sink.write(10, level);
        }
        return;
      }
      case 'restore':
        // `$04C220`: channel C tone and noise back on at level 0, and noise period $1F, before
        // falling into the idle `$04C250`. That reads `$797A`, which every capture holds
        // negative and the port does not keep, so its engine sound never plays here.
        this.writeMixer(sink, this.mixer & 0xdb);
        sink.write(6, 0x1f);
        this.door = { kind: 'idle' };
    }
  }

  private writeMixer(sink: PsgSink, value: number): void {
    this.mixer = value;
    sink.write(7, value);
  }
}
