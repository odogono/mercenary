import {
  ST_RESET_REGISTERS,
  messageCharacter,
  playKeyClick,
  playStreams,
  startDoor,
  tickDoor,
  writePeriod
} from '../sound/stProgrammes.ts';
import type { DionSoundProgramme } from './narrative.ts';
import type { DionMessageState } from './script.ts';

export interface DionSoundCursor {
  readonly count: number;
  readonly cursor: {
    readonly nextPair: number;
    readonly programme: string;
    readonly stream: number;
  } | null;
}
export interface DionSoundState {
  readonly c: string | null;
  readonly cLevelLatch?: number;
  readonly clickAge: number;
  readonly elapsed: number;
  readonly keyClick: boolean;
  readonly mixer: number;
  readonly registers: readonly number[];
  readonly slew: number;
  readonly streams?: Readonly<
    Record<'doorTone' | 'doorLevel' | 'cLevel', DionSoundCursor>
  >;
}
export const freshSound = (): DionSoundState => ({
  c: null,
  clickAge: 255,
  elapsed: -1,
  keyClick: false,
  mixer: 0xda,
  registers: [...ST_RESET_REGISTERS, 0],
  slew: 3584
});
export const requestSound = (
  state: DionSoundState,
  name: string
): DionSoundState => {
  if (name === 'reset') {
    return freshSound();
  }
  if (name === 'key_click') {
    return { ...state, keyClick: true };
  }
  if (name === 'cut') {
    const registers = [...state.registers];
    registers[9] = 0;
    registers[10] = 0;
    registers[6] = 31;
    return { ...state, registers };
  }
  return { ...state, c: name, elapsed: -1 };
};

/// Register changes for the game and listening board. Writing the same envelope
/// shape again starts a new click, even when its saved register value is unchanged.
export const soundRegisterChanges = (
  previous: DionSoundState,
  next: DionSoundState
): readonly (readonly [number, number])[] =>
  next.registers.flatMap((value, index) =>
    value !== previous.registers[index] ||
    (index === 13 && previous.keyClick && !next.keyClick && next.clickAge === 0)
      ? [[index, value] as const]
      : []
  );

export const tickSound = (
  programmes: readonly DionSoundProgramme[],
  previous: DionSoundState,
  control: number,
  message: DionMessageState,
  options?: {
    readonly messageWasBusy?: boolean;
    readonly onWrite: (register: number, value: number) => void;
    readonly speed: number;
  }
): DionSoundState => {
  let state = previous;
  const registers = [...state.registers];
  let mixer = state.mixer;
  const sink = {
    write: (register: number, value: number): void => {
      registers[register] = value;
      options?.onWrite(register, value);
    }
  };
  const setup = (name: string): DionSoundProgramme =>
    programmes.find(item => item.name === name)!;
  if (state.keyClick) {
    mixer = playKeyClick(sink, mixer, setup('key_click').registers);
    state = { ...state, clickAge: -1, keyClick: false };
  }
  let c = state.c;
  let elapsed = state.elapsed + 1;
  let slew = state.slew;
  let cLevelLatch = state.cLevelLatch ?? 0;
  let streams = previous.streams ?? {
    cLevel: { count: 0, cursor: null },
    doorLevel: { count: 0, cursor: null },
    doorTone: { count: 0, cursor: null }
  };
  const walkStreams = (
    programme: DionSoundProgramme,
    door: boolean
  ): boolean => {
    let ended = false;
    const updated = { ...streams };
    programme.streams.forEach((stream, index) => {
      const key = door ? (index === 0 ? 'doorTone' : 'doorLevel') : 'cLevel';
      let owner =
        elapsed === 0
          ? {
              count: 1,
              cursor: { nextPair: 0, programme: programme.name, stream: index }
            }
          : updated[key];
      if (owner.cursor === null) {
        throw new Error('Missing sound stream cursor');
      }
      const count = (owner.count - 1) & (key === 'doorTone' ? 65_535 : 255);
      owner = { ...owner, count };
      if (count === 0) {
        let nextPair = owner.cursor!.nextPair;
        if (nextPair === stream.pairs.length && stream.loop !== null) {
          nextPair = stream.loop;
        }
        const pair = stream.pairs[nextPair];
        if (pair === undefined) {
          ended = true;
          owner = { ...owner, count: 0 };
        } else {
          owner = {
            count: pair[0],
            cursor: {
              nextPair: nextPair + 1,
              programme: programme.name,
              stream: index
            }
          };
          stream.registers.forEach((r, n) =>
            sink.write(r, (pair[1] >> (8 * n)) & 255)
          );
        }
      }
      updated[key] = owner;
    });
    streams = updated;
    return ended;
  };
  if (c === 'ambient' && options) {
    if (elapsed === 0) {
      mixer &= 0xdb;
      sink.write(7, mixer);
      sink.write(6, 31);
    }
    if ((options.speed | 0) >= 0) {
      sink.write(10, Math.min(15, options.speed >>> 16));
      writePeriod(sink, 4, 16);
      sink.write(6, 31);
      cLevelLatch = 65_535;
    } else if (cLevelLatch !== 0) {
      sink.write(10, 0);
      cLevelLatch = 0;
    }
  } else if (c !== null) {
    const programme = setup(c);
    const door = c === 'door_moving' || c === 'door_stop';
    if (elapsed === 0 && door) {
      mixer = startDoor(sink, mixer, c === 'door_moving', programme.registers);
    } else if (elapsed === 0) {
      for (const [register, value] of programme.registers) {
        sink.write(register, value);
      }
      mixer = c === 'taxi_set_down' ? (mixer & 0xdf) | 4 : mixer & 0xdb;
      if (options) {
        sink.write(7, mixer);
      }
      if (c === 'lift_off' || c === 'leave') {
        slew = 3584;
      }
    }
    if (options && c === 'door_moving') {
      sink.write(6, 0);
    }
    const ended = options
      ? walkStreams(programme, door)
      : door
        ? tickDoor(sink, c === 'door_moving', elapsed, programme.streams)
        : playStreams(sink, programme.streams, elapsed);
    if (ended) {
      if (c === 'lift_off') {
        c = 'engine';
        elapsed = -1;
      } else if (c === 'door_stop') {
        c = 'ambient';
        elapsed = -1;
        sink.write(10, 0);
      } else {
        c = null;
        mixer |= 0x24;
        if (options) {
          sink.write(7, mixer);
        }
        sink.write(10, 0);
      }
    }
    if (c === 'engine' || c === 'lift_off' || c === 'leave') {
      const target = (((control & 7) ^ 7) + 4) << 8;
      slew += Math.sign(target - slew) * Math.min(8, Math.abs(target - slew));
      const period = (slew >> 1) + 256;
      writePeriod(sink, 4, period);
      sink.write(6, period >> 6);
      if (c === 'engine') {
        sink.write(10, 10);
      }
    }
    // The bounded METIS ambient input is negative ($FF001000): silent C.
    if (c === 'ambient') {
      sink.write(10, 0);
    }
  }
  // #648: 8 pixel columns consume 4 six-pixel characters per three ticks.
  // The tone reads before the extra glyph read on tick 1 mod 3: 0,2,3,4,6,7…
  const age =
    message.scrollsOut && message.age >= 200 ? message.age - 200 : message.age;
  if (message.busy && age >= 1 && age <= 36) {
    const source =
      ' '.repeat(Math.ceil(Math.max(0, 48 - message.text.length) / 2)) +
      message.text;
    const character =
      message.scrollsOut && message.age >= 200
        ? ' '
        : messageCharacter(source, age);
    const period = character.charCodeAt(0) * 4;
    writePeriod(sink, 0, period);
    sink.write(8, character === ' ' ? 0 : 12);
  } else if (
    !options ||
    ((message.busy || options.messageWasBusy) && age !== 37)
  ) {
    sink.write(8, 0);
  }
  if (!options) {
    sink.write(7, mixer);
  }
  return {
    ...state,
    ...(options ? { cLevelLatch, streams } : {}),
    c,
    clickAge: Math.min(255, state.clickAge + 1),
    elapsed,
    mixer,
    registers,
    slew
  };
};
