import type { DionContent } from './content.ts';
import type { DionInstruction } from './narrative.ts';
import { address, list, record } from './read.ts';
import {
  DionNarrative,
  emptyNarrative,
  type DionScriptState
} from './script.ts';
import type { TourcraftContent } from './tourcraftContent.ts';

export interface TourcraftScriptState extends DionScriptState {
  readonly availabilityBytes: readonly (readonly [number, number])[];
  readonly timedTarget: number | null;
  readonly timerBits: number;
}
export type TourcraftScriptEffect =
  | { readonly kind: 'cash'; readonly value: string }
  | { readonly kind: 'encounter'; readonly request: number };

/// The recovered one-opcode scheduler, kept title-local. Damocles's run-to-block
/// interpreter and frame-counted waits cannot implement Dion's VBL-owned timer.
export const tourcraftNarrativeContent = (
  content: TourcraftContent
): DionContent => {
  const routines = [
    ...list(content.programmes['scripts'], 'scripts'),
    content.programmes['sharedReturn']
  ].map(v => {
    const r = record(v, 'routine');
    return {
      instructions: list(r['instructions'], 'instructions').map(v => {
        const i = record(v, 'instruction');
        const operands = list(i['operands'] ?? [], 'operands').map((v, n) =>
          i['name'] === 'set_account' && n === 1
            ? 0
            : typeof v === 'string'
              ? address(v, 'operand')
              : address(record(v, 'operand')['address'], 'operand.address')
        );
        const next = address(
          list(record(i['source'], 'source')['range'], 'range')[1],
          'next'
        );
        return {
          address: address(i['address'], 'address'),
          name: String(i['name']),
          next,
          op: address(i['op'], 'op'),
          operands,
          target:
            i['target'] === undefined
              ? undefined
              : address(i['target'], 'target'),
          text:
            i['text'] === undefined
              ? undefined
              : String(record(i['text'], 'text')['text'])
        };
      }),
      name: String(r['id'] ?? 'shared-return')
    };
  });
  return {
    ...content.legacy,
    scripts: {
      ...content.legacy.scripts,
      entries: new Map([
        ...content.legacy.scripts.entries,
        ...Object.entries(record(content.programmes['entries'], 'entries')).map(
          ([id, pc]) => [Number(id), address(pc, 'entry')] as const
        )
      ]),
      routines: [...content.legacy.scripts.routines, ...routines]
    },
    service: {
      ...content.legacy.service,
      headTurns: new Map([
        ...content.legacy.service.headTurns,
        ...Object.entries(
          record(content.programmes['headSequences'], 'headSequences')
        ).map(
          ([key, values]) =>
            [
              address(key, 'sequence') - 0x6_fd_44,
              (list(values, 'durations') as number[]).slice(0, -1)
            ] as const
        )
      ])
    }
  };
};

export class TourcraftNarrative extends DionNarrative {
  declare state: TourcraftScriptState;
  private effects: TourcraftScriptEffect[] = [];
  private readonly expandedInstructions: ReadonlyMap<
    number,
    DionInstruction & { target?: number }
  >;
  constructor(content: DionContent, restore?: TourcraftScriptState) {
    super(content);
    this.expandedInstructions = new Map(
      content.scripts.routines.flatMap(r =>
        r.instructions.map(i => [i.address, i] as const)
      )
    );
    const flags = Array<boolean>(64).fill(false);
    flags[6] = true;
    flags[15] = true;
    this.state = restore ?? {
      ...emptyNarrative(),
      availabilityBytes: [
        [5, 160],
        [6, 160],
        [19, 160],
        [25, 224],
        [41, 192],
        [51, 128],
        [52, 128],
        [119, 160]
      ],
      available: [5, 6, 0x19, 0x29, 0x33, 0x34, 0x13, 0x77],
      flags,
      hold: 150,
      pc: 0x6_ff_57,
      stack: [0x7_66_d5],
      timedTarget: null,
      timerBits: 65_507,
      wait: 29
    };
  }
  override start(id: number): boolean {
    const bytes = new Map(this.state.availabilityBytes);
    const availability = bytes.get(id) ?? 0;
    if (!(availability & 128)) {
      return false;
    }
    if (this.state.flags[6]) {
      if (!(availability & 32)) {
        return false;
      }
      this.state = { ...this.state, queued: id };
      return false;
    }
    const entry = this.content.scripts.entries.get(id);
    if (entry === undefined) {
      return false;
    }
    if (!(availability & 64)) {
      bytes.set(id, availability & 127);
    }
    this.enter(entry);
    this.state = {
      ...this.state,
      availabilityBytes: [...bytes],
      available: [...bytes].filter(([, v]) => v & 128).map(([id]) => id)
    };
    return true;
  }
  private enter(pc: number): void {
    const flags = [...this.state.flags];
    flags[6] = true;
    const stack =
      this.state.pc === null
        ? this.state.stack
        : [...this.state.stack, this.state.pc];
    if (stack.length > 8) {
      throw new Error('Dion return stack exceeded eight entries');
    }
    this.state = { ...this.state, flags, pc, stack };
  }
  top(seconds: number): void {
    if (!this.state.flags[9] && seconds >= 32_400) {
      this.start(0x77);
    } else if (this.state.flags[9] && seconds >= 61_200) {
      this.start(0x13);
    }
    if (
      this.state.timedTarget !== null &&
      this.state.timerBits >= 32_768 &&
      !this.state.flags[6]
    ) {
      const target = this.state.timedTarget;
      this.state = { ...this.state, timedTarget: null };
      this.enter(target);
    }
  }
  override tick(): void {
    super.tick();
    this.state = {
      ...this.state,
      timerBits: (this.state.timerBits - 1) & 65_535
    };
  }
  override frame(): void {
    if (this.state.message.busy) {
      return;
    }
    if (!this.state.flags[6] && this.state.queued !== null) {
      const id = this.state.queued;
      this.state = { ...this.state, queued: null };
      this.start(id);
    }
    const i =
      this.state.pc === null
        ? undefined
        : this.expandedInstructions.get(this.state.pc);
    if (!i) {
      super.frame();
      return;
    }
    let next = i.next;
    const op = i.operands;
    switch (i.op) {
      case 0x0d:
        if (op[0] !== 0xf8) {
          throw new Error('Unsupported account');
        }
        this.effects.push({ kind: 'cash', value: '000000000000' });
        break;
      case 0x12:
        if (this.state.flags[op[0]!]) {
          if (!this.expandedInstructions.has(i.target!)) {
            throw new Error('Excluded Dion campaign branch');
          }
          next = i.target!;
        }
        break;
      case 0x24: {
        const bytes = new Map(this.state.availabilityBytes);
        bytes.set(op[0]!, op[1]!);
        this.state = {
          ...this.state,
          availabilityBytes: [...bytes],
          available: [...bytes].filter(([, v]) => v & 128).map(([id]) => id)
        };
        break;
      }
      case 0x26:
        this.state = {
          ...this.state,
          timedTarget: 0x6_fd_44 + op[1]!,
          timerBits: op[0]!
        };
        break;
      case 0x2a:
        this.effects.push({ kind: 'encounter', request: 0xff_00 | op[0]! });
        break;
      default:
        super.frame();
        return;
    }
    this.state = { ...this.state, pc: next };
  }
  drainEffects(): TourcraftScriptEffect[] {
    const effects = this.effects;
    this.effects = [];
    return effects;
  }
}
