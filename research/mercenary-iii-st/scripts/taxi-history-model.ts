import type { DionContent } from '../../../web/src/dion/content.ts';
import type { DionInstruction } from '../../../web/src/dion/narrative.ts';
import {
  address,
  int,
  list,
  record,
  text
} from '../../../web/src/dion/read.ts';

// Research-only scheduler witness for R8. Independently applies the documented
// R6 rules to admitted decoded facts. It models neither a playable expanded
// session nor display, sound, actors or original-machine restoration.
interface Instruction extends DionInstruction {
  readonly target?: number;
}
export class TaxiHistoryModel {
  readonly state: {
    availability: Record<number, number>;
    cash: string;
    flags: boolean[];
    hold: number;
    lastEncounterRequest: number;
    messageRemaining: number;
    pc: number | null;
    queue: number;
    stack: (number | null)[];
    target: number;
    timer: number;
    wait: number;
  };
  readonly launches: { entry: number; tick: number }[] = [];
  readonly requests: { address: number; tick: number }[] = [];
  private readonly instructions = new Map<number, Instruction>();
  private readonly entries = new Map<number, number>();
  private ticks = 0;

  constructor(
    private readonly content: DionContent,
    programmes: unknown,
    initial: unknown
  ) {
    for (const routine of content.scripts.routines) {
      for (const ins of routine.instructions) {
        this.instructions.set(ins.address, ins);
      }
    }
    for (const [id, entry] of content.scripts.entries) {
      this.entries.set(id, entry);
    }
    const p = record(programmes, 'programmes');
    for (const [id, entry] of Object.entries(record(p['entries'], 'entries'))) {
      this.entries.set(Number(id), address(entry, `entry.${id}`));
    }
    for (const routine of [
      ...list(p['scripts'], 'scripts'),
      p['sharedReturn']
    ]) {
      const r = record(routine, 'routine');
      for (const value of list(r['instructions'], 'instructions')) {
        const i = record(value, 'instruction');
        const op = address(i['op'], 'instruction.op');
        const operands = list(i['operands'] ?? [], 'instruction.operands').map(
          v => {
            if (typeof v === 'object' && v !== null) {
              return address(
                record(v, 'operand')['address'],
                'operand.address'
              );
            }
            if (op === 0x0d && typeof v === 'string' && !v.startsWith('$')) {
              if (v !== '000000000000') {
                throw new Error('Unadmitted account value');
              }
              return 0;
            }
            return address(v, 'operand');
          }
        );
        const range = list(record(i['source'], 'source')['range'], 'range');
        this.instructions.set(address(i['address'], 'instruction.address'), {
          address: address(i['address'], 'instruction.address'),
          name: text(i['name'], 'instruction.name'),
          next: address(range[1], 'instruction.next'),
          op,
          operands,
          ...(i['target'] === undefined
            ? {}
            : { target: address(i['target'], 'target') }),
          text:
            i['text'] === undefined
              ? undefined
              : text(record(i['text'], 'text')['text'], 'text.text')
        });
      }
    }
    const source = record(initial, 'initial');
    const vm = record(source['vm'], 'initial.vm');
    const bits = list(source['flags'], 'initial.flags').map((v, i) =>
      int(v, `flags.${i}`)
    );
    this.state = {
      availability: Object.fromEntries(
        Object.entries(record(source['availability'], 'availability')).map(
          ([k, v]) => [Number(k), int(v, `availability.${k}`)]
        )
      ),
      cash: text(record(source['opening'], 'opening')['cash'], 'cash'),
      flags: Array.from(
        { length: 64 },
        (_, i) => (bits[Math.floor(i / 32)]! & (1 << (i % 32))) !== 0
      ),
      hold: int(vm['hold'], 'hold'),
      lastEncounterRequest: 0,
      messageRemaining: 0,
      pc: address(vm['pc'], 'pc'),
      queue: int(vm['queue'], 'queue'),
      stack: [],
      target: int(vm['timedTarget'], 'target'),
      timer: int(vm['timer'], 'timer'),
      wait: int(vm['wait'], 'wait')
    };
    if (vm['continuation'] !== 0 || vm['busy'] !== 0) {
      throw new Error('Unsupported opening continuation');
    }
  }

  tick(): void {
    this.ticks++;
    this.state.wait = (this.state.wait + 1) & 0xff_ff;
    this.state.timer = (this.state.timer - 1) & 0xff_ff;
    this.state.messageRemaining = Math.max(0, this.state.messageRemaining - 1);
  }

  private enter(entry: number): void {
    if (!this.instructions.has(entry)) {
      throw new Error(`Unadmitted entry ${entry}`);
    }
    this.state.stack.push(this.state.pc);
    this.state.pc = entry;
    this.state.flags[6] = true;
    this.launches.push({ entry, tick: this.ticks });
  }

  start(id: number): void {
    const available = this.state.availability[id] ?? 0;
    if (!(available & 0x80)) {
      return;
    }
    if (this.state.flags[6]) {
      if (available & 0x20) {
        this.state.queue = id;
      }
      return;
    }
    if (!(available & 0x40)) {
      this.state.availability[id] = available & 0x7f;
    }
    const entry = this.entries.get(id);
    if (entry === undefined) {
      throw new Error(`Unadmitted script ${id}`);
    }
    this.enter(entry);
  }

  beforeInput(seconds: number): void {
    if (this.state.flags[10] || this.state.flags[22]) {
      throw new Error('Excluded campaign flags');
    }
    if (!this.state.flags[9]) {
      if (seconds >= 32_400) {
        this.start(0x77);
      }
    } else if (seconds >= 61_200) {
      this.start(0x13);
    }
    if (
      this.state.target !== 0 &&
      this.state.timer >= 0x80_00 &&
      !this.state.flags[6]
    ) {
      const target = this.state.target;
      this.state.target = 0;
      this.enter(0x6_fd_44 + target);
    }
  }

  idMessage(id: number): void {
    const message = this.content.messages[id];
    if (message && this.state.messageRemaining === 0) {
      this.state.messageRemaining = message.scrollsOut ? 251 : 201;
    }
  }

  frame(): void {
    const s = this.state;
    if (s.messageRemaining !== 0) {
      return;
    }
    if (!s.flags[6] && s.queue !== 0) {
      const id = s.queue;
      s.queue = 0;
      this.start(id);
    }
    if (s.pc === null) {
      return;
    }
    const i = this.instructions.get(s.pc);
    if (!i) {
      throw new Error(`Unadmitted instruction ${s.pc}`);
    }
    let next: number | null = i.next;
    switch (i.op) {
      case 0x00:
        next = null;
        break;
      case 0x02:
        s.wait = 0;
        break;
      case 0x03:
        next = i.operands[0]!;
        break;
      case 0x04:
        s.stack.push(i.next);
        next = i.operands[0]!;
        break;
      case 0x05:
        next = s.stack.pop() ?? null;
        break;
      case 0x07:
        if (s.wait < i.operands[0]!) {
          next = i.address;
        }
        break;
      case 0x0d:
        if (i.operands[0] !== 0xf8 || i.operands[1] !== 0) {
          throw new Error('Unadmitted account assignment');
        }
        s.cash = '000000000000';
        break;
      case 0x10:
        s.flags[i.operands[0]!] = true;
        break;
      case 0x11:
        s.flags[i.operands[0]!] = false;
        break;
      case 0x12:
        if (s.flags[i.operands[0]!]) {
          next = i.target!;
        }
        break;
      case 0x14:
      case 0x25:
        s.messageRemaining = s.hold + 1;
        this.requests.push({ address: i.address, tick: this.ticks });
        break;
      case 0x19: {
        const value = i.operands[1]! * 256 + i.operands[2]!;
        if (i.operands[0] === 0x6_ff_46) {
          s.hold = value;
        } else if (i.operands[0] !== 0x6_ff_4a) {
          throw new Error('Unadmitted store');
        }
        break;
      }
      case 0x20:
        break; // The admitted key-A bit has no scheduler reader.
      case 0x24:
        s.availability[i.operands[0]!] = i.operands[1]!;
        break;
      case 0x26:
        s.timer = i.operands[0]!;
        s.target = i.operands[1]!;
        break;
      case 0x2a:
        s.lastEncounterRequest = 0xff_00 | i.operands[0]!;
        break;
      default:
        throw new Error(`Unadmitted opcode ${i.op}`);
    }
    s.pc = next;
  }
}
