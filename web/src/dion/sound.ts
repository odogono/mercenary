import type { DionSoundProgramme } from './narrative.ts';
import type { DionMessageState } from './script.ts';

export interface DionSoundState {
  readonly c: string | null;
  readonly clickAge: number;
  readonly elapsed: number;
  readonly keyClick: boolean;
  readonly mixer: number;
  readonly registers: readonly number[];
  readonly slew: number;
}
export const freshSound = (): DionSoundState => ({
  c: null,
  clickAge: 255,
  elapsed: -1,
  keyClick: false,
  mixer: 0xda,
  registers: [1, 0, 1, 0, 1, 0, 31, 0xda, 0, 16, 0, 0, 0, 0],
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

const streamValue = (
  stream: DionSoundProgramme['streams'][number],
  elapsed: number
): number | null => {
  let index = 0;
  const loop = stream.loop;
  const prefix = stream.pairs
    .slice(0, loop ?? stream.pairs.length)
    .reduce((total, [count]) => total + count, 0);
  const cycle =
    loop === null
      ? 0
      : stream.pairs.slice(loop).reduce((total, [count]) => total + count, 0);
  let remaining =
    loop !== null && elapsed >= prefix
      ? prefix + ((elapsed - prefix) % cycle)
      : elapsed;
  // The captured streams are all finite or have a loop with positive counts.
  while (index < stream.pairs.length) {
    const [count, value] = stream.pairs[index]!;
    if (remaining < count) {
      return value;
    }
    remaining -= count;
    index += 1;
    if (index === stream.pairs.length && stream.loop !== null) {
      index = stream.loop;
    }
  }
  return null;
};

export const tickSound = (
  programmes: readonly DionSoundProgramme[],
  previous: DionSoundState,
  control: number,
  message: DionMessageState
): DionSoundState => {
  let state = previous;
  const registers = [...state.registers];
  let mixer = state.mixer;
  const setup = (name: string): DionSoundProgramme =>
    programmes.find(item => item.name === name)!;
  if (state.keyClick) {
    for (const [register, value] of setup('key_click').registers) {
      registers[register] = value;
    }
    mixer = (mixer & 0xfd) | 0x10;
    state = { ...state, clickAge: -1, keyClick: false };
  }
  let c = state.c;
  let elapsed = state.elapsed + 1;
  let slew = state.slew;
  if (c !== null) {
    const programme = setup(c);
    if (elapsed === 0) {
      for (const [register, value] of programme.registers) {
        registers[register] = value;
      }
      mixer =
        c === 'door_stop' || c === 'taxi_set_down'
          ? (mixer & 0xdf) | 4
          : mixer & 0xdb;
      if (c === 'lift_off' || c === 'leave') {
        slew = 3584;
      }
    }
    let ended = false;
    for (const stream of programme.streams) {
      const value = streamValue(stream, elapsed);
      if (value === null) {
        ended = true;
        continue;
      }
      stream.registers.forEach(
        (register, index) =>
          (registers[register] = (value >> (8 * index)) & 255)
      );
    }
    if (ended) {
      if (c === 'lift_off') {
        c = 'engine';
        elapsed = -1;
      } else if (c === 'door_stop') {
        c = 'ambient';
        elapsed = -1;
        registers[10] = 0;
      } else {
        c = null;
        mixer |= 0x24;
        registers[10] = 0;
      }
    }
    if (c === 'engine' || c === 'lift_off' || c === 'leave') {
      const target = (((control & 7) ^ 7) + 4) << 8;
      slew += Math.sign(target - slew) * Math.min(8, Math.abs(target - slew));
      const period = (slew >> 1) + 256;
      registers[4] = period & 255;
      registers[5] = period >> 8;
      registers[6] = period >> 6;
      if (c === 'engine') {
        registers[10] = 10;
      }
    }
    // The bounded METIS ambient input is negative ($FF001000): silent C.
    if (c === 'ambient') {
      registers[10] = 0;
    }
    if (c === 'door_moving') {
      registers[6] = 0;
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
        : (source[Math.ceil((4 * (age - 1)) / 3)] ?? ' ');
    const period = character.charCodeAt(0) * 4;
    registers[0] = period & 255;
    registers[1] = period >> 8;
    registers[8] = character === ' ' ? 0 : 12;
  } else {
    registers[8] = 0;
  }
  registers[7] = mixer;
  return {
    ...state,
    c,
    clickAge: Math.min(255, state.clickAge + 1),
    elapsed,
    mixer,
    registers,
    slew
  };
};
