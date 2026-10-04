import type { DionContent } from './content.ts';
import type { DionInstruction } from './narrative.ts';

// Title-local interpreter over decoded facts, independently implemented from R2/#642.
export interface DionMessageState {
  readonly age: number;
  readonly bar: readonly number[];
  readonly busy: boolean;
  readonly hold: number;
  readonly scrollsOut: boolean;
  readonly serial: number;
  readonly text: string;
}
export interface DionScriptState {
  readonly available: readonly number[];
  readonly cabin: number;
  readonly flags: readonly boolean[];
  readonly hold: number;
  readonly keyA: boolean;
  readonly message: DionMessageState;
  readonly pc: number | null;
  readonly queued: number | null;
  readonly stack: readonly number[];
  readonly timed: {
    readonly remaining: number;
    readonly script: number;
  } | null;
  readonly wait: number;
}

export const emptyNarrative = (): DionScriptState => ({
  available: [0x19, 0x33, 0x34],
  cabin: 0,
  flags: Array<boolean>(64).fill(false),
  hold: 200,
  keyA: false,
  message: {
    age: 0,
    bar: Array<number>(288 * 6).fill(0),
    busy: false,
    hold: 200,
    scrollsOut: false,
    serial: 0,
    text: ''
  },
  pc: null,
  queued: null,
  stack: [],
  timed: null,
  wait: 0
});

export class DionNarrative {
  state: DionScriptState;
  private readonly instructions: ReadonlyMap<number, DionInstruction>;
  constructor(
    protected readonly content: DionContent,
    restore = emptyNarrative()
  ) {
    this.state = restore;
    this.instructions = new Map(
      content.scripts.routines.flatMap(r =>
        r.instructions.map(i => [i.address, i] as const)
      )
    );
  }
  start(script: number): boolean {
    if (this.state.flags[6] || !this.state.available.includes(script)) {
      return false;
    }
    const pc = this.content.scripts.entries.get(script);
    if (pc === undefined) {
      return false;
    }
    const flags = [...this.state.flags];
    flags[6] = true;
    this.state = {
      ...this.state,
      available: this.state.available.filter(n => n !== script),
      flags,
      pc,
      stack: this.state.pc === null ? [] : [this.state.pc]
    };
    return true;
  }
  idMessage(id: number): boolean {
    const message = this.content.messages[id];
    return (
      message !== undefined &&
      this.request(message.text, 200, message.scrollsOut)
    );
  }
  private request(text: string, hold: number, scrollsOut = false): boolean {
    if (this.state.message.busy) {
      return false;
    }
    this.state = {
      ...this.state,
      message: {
        age: -1,
        bar: this.state.message.bar,
        busy: true,
        hold,
        scrollsOut,
        serial: this.state.message.serial + 1,
        text
      }
    };
    return true;
  }
  tick(): void {
    const { message, timed } = this.state;
    const age = message.busy ? message.age + 1 : message.age;
    // Script requests hold+1 ticks. The padded ID path runs 200 then 50.
    const duration = message.scrollsOut ? 250 : message.hold;
    this.state = {
      ...this.state,
      message: {
        ...message,
        age,
        bar: this.scrollBar(message, age),
        busy: message.busy && age < duration
      },
      timed:
        timed === null
          ? null
          : { ...timed, remaining: Math.max(0, timed.remaining - 1) },
      wait: (this.state.wait + 1) & 0xff_ff
    };
  }
  private scrollBar(message: DionMessageState, age: number): readonly number[] {
    if (!message.busy) {
      return message.bar;
    }
    const local = message.scrollsOut && age >= 200 ? age - 200 : age;
    if (local < 1 || local > 36) {
      return message.bar;
    }
    const pad = Math.ceil(Math.max(0, 48 - message.text.length) / 2);
    const source = ' '.repeat(pad) + message.text;
    const offset = message.scrollsOut && age >= 200 ? 288 : 0;
    const font = this.content.panel.fonts.get('message')!;
    const bar = [...message.bar];
    for (let row = 0; row < 6; row += 1) {
      for (let x = 0; x < 288; x += 1) {
        if (x < 280) {
          bar[row * 288 + x] = message.bar[row * 288 + x + 8]!;
        } else {
          const column = offset + (local - 1) * 8 + x - 280;
          const character = source[Math.floor(column / 6)] ?? ' ';
          bar[row * 288 + x] =
            font.glyphs.get(character)?.[row]?.[column % 6] === '1' ? 1 : 0;
        }
      }
    }
    return bar;
  }
  frame(): void {
    if (
      this.state.timed?.remaining === 0 &&
      this.start(this.state.timed.script)
    ) {
      this.state = { ...this.state, timed: null };
    }
    if (this.state.message.busy) {
      return;
    }
    if (!this.state.flags[6] && this.state.queued !== null) {
      const script = this.state.queued;
      this.state = { ...this.state, queued: null };
      this.start(script);
    }
    if (this.state.pc === null) {
      return;
    }
    const instruction = this.instructions.get(this.state.pc!);
    if (instruction === undefined) {
      throw new Error(`Unknown MIII instruction ${this.state.pc}`);
    }
    const operands = instruction.operands;
    let next: number | null = instruction.next;
    switch (instruction.op) {
      case 0x00:
        next = null;
        break;
      case 0x02:
        this.state = { ...this.state, wait: 0 };
        break;
      case 0x03:
        next = operands[0]!;
        break;
      case 0x04:
        this.state = {
          ...this.state,
          stack: [...this.state.stack, instruction.next]
        };
        next = operands[0]!;
        break;
      case 0x05:
        next = this.state.stack.at(-1) ?? null;
        this.state = { ...this.state, stack: this.state.stack.slice(0, -1) };
        break;
      case 0x07:
        if (this.state.wait < operands[0]!) {
          next = instruction.address;
        }
        break;
      case 0x10:
      case 0x11: {
        const flags = [...this.state.flags];
        flags[operands[0]!] = instruction.op === 0x10;
        this.state = { ...this.state, flags };
        break;
      }
      case 0x14:
        this.request(
          this.content.messages[operands[0]!]!.text,
          this.state.hold
        );
        break;
      case 0x19: {
        const value = operands[1]! * 256 + operands[2]!;
        if (operands[0] === 0x6_ff_46) {
          this.state = { ...this.state, hold: value };
        } else if (operands[0] === 0x6_ff_4a) {
          this.state = { ...this.state, cabin: value };
        } else {
          throw new Error('Unsupported MIII script store');
        }
        break;
      }
      case 0x20:
        if (operands[0] !== 0x26 || operands[1] !== 0x87) {
          throw new Error('Unsupported MIII object bit');
        }
        this.state = { ...this.state, keyA: true };
        break;
      case 0x25:
        this.request(instruction.text!, this.state.hold);
        break;
      default:
        throw new Error(`Unsupported MIII opcode ${instruction.op}`);
    }
    this.state = { ...this.state, pc: next };
  }
}
