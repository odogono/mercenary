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
  message: DionMessageState
): DionSoundState => {
  let state = previous;
  const registers = [...state.registers];
  let mixer = state.mixer;
  const sink = {
    write: (register: number, value: number): void => {
      registers[register] = value;
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
  if (c !== null) {
    const programme = setup(c);
    const door = c === 'door_moving' || c === 'door_stop';
    if (elapsed === 0 && door) {
      mixer = startDoor(sink, mixer, c === 'door_moving', programme.registers);
    } else if (elapsed === 0) {
      for (const [register, value] of programme.registers) {
        registers[register] = value;
      }
      mixer = c === 'taxi_set_down' ? (mixer & 0xdf) | 4 : mixer & 0xdb;
      if (c === 'lift_off' || c === 'leave') {
        slew = 3584;
      }
    }
    const ended = door
      ? tickDoor(sink, c === 'door_moving', elapsed, programme.streams)
      : playStreams(sink, programme.streams, elapsed);
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
      writePeriod(sink, 4, period);
      registers[6] = period >> 6;
      if (c === 'engine') {
        registers[10] = 10;
      }
    }
    // The bounded METIS ambient input is negative ($FF001000): silent C.
    if (c === 'ambient') {
      registers[10] = 0;
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
