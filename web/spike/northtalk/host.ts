/// The Talk Script host for the NorthTalk spike: the Host Callout of
/// `web/src/benson/host.ts`, offered to NorthTalk as four Capabilities.
///
/// Throwaway. It shows what a Talk Script host has to own, not how the
/// Gameplay Session should own it (docs/research/targ-talk-scripts.md).
import {
  bool,
  createCore,
  nothing,
  num,
  shape,
  type Call,
  type Group,
  type PumpResult,
  type Report,
  type Value
} from '@northtalk/ts';

import { BensonHostState, type BensonEffect } from '../../src/benson/host.ts';

/// The Talk Scripts this spike loads, by the name the host starts them under.
export type TalkScriptName = 'opening' | 'escape';

/// Engine flags a Talk Script may name, by their bit in `engineFlags`
/// (notes/decode/endgame.md, "Engine flags").
const FLAGS = {
  commanderAnnoyed: 32,
  gratitudeGiven: 2,
  shipHired: 4
} as const;

/// The Talk Script an armed object starts. Only the Escape is rewritten here.
const ARMED_SCRIPTS: Readonly<Record<number, TalkScriptName>> = {
  7: 'escape'
};

const CREDITS = 8;
const NOVADRIVE = 25;
const ADVERT_BLOCK = 50;
const SCRIPT_ARMED = 4;
const MICROS = 1_000_000;

/// A NorthTalk Core: the TS Core by default, or the WASM Core from `@northtalk/ts/wasm`.
export type TalkCore = Pick<
  ReturnType<typeof createCore>,
  'defineCapability' | 'newGroup' | 'restore'
>;

export interface TalkHostOptions {
  /// Seconds each character of a message adds to its playing time. The
  /// default fits the script-0 traces: Benson Messages start about
  /// 0.09 s per character plus a 3 s hold apart.
  readonly cellSeconds?: number;
  /// The Core to run on. Both Cores share the embedding API.
  readonly core?: TalkCore;
  /// Seconds a message holds once it has scrolled in.
  readonly holdSeconds?: number;
  /// The next random byte. The host owns randomness so saves stay replayable.
  readonly random?: () => number;
}

interface Queued {
  readonly call: Call<unknown> | undefined;
  readonly text: string;
}

interface Playing extends Queued {
  readonly until: number;
}

interface KeyWait {
  readonly call: Call<unknown>;
  /// A key name, or `undefined` for any input.
  readonly key: string | undefined;
  readonly until: number;
}

/// The host-side state a save must carry beside the Group's own bytes.
export interface TalkHostSave {
  readonly armed: readonly number[];
  readonly group: Uint8Array;
  readonly heard: boolean;
  readonly host: BensonHostState;
  readonly now: number;
}

const flag = (name: Value): number => {
  const bit = FLAGS[name.asText() as keyof typeof FLAGS];
  if (bit === undefined) {
    throw new Error(`unknown flag ${name.toString()}`);
  }
  return bit;
};

const whole = (value: Value): number => Number(value.asDecimal()!.toBigInt());

/// One Group of Talk Scripts sharing a Benson Display, a key stream and a host state.
export class TalkHost {
  readonly core: TalkCore;
  readonly effects: BensonEffect[] = [];
  /// Each message as it began to play, with the host clock in seconds.
  readonly played: { readonly at: number; readonly text: string }[] = [];
  readonly reports: Report[] = [];
  host: BensonHostState;
  group: Group;
  now = 0;

  private readonly cellSeconds: number;
  private readonly holdSeconds: number;
  private readonly random: () => number;
  private readonly sources: Readonly<Record<TalkScriptName, string>>;
  private armed = new Set<number>();
  private heard = false;
  private playing: Playing | undefined;
  private readonly queue: Queued[] = [];
  private keyWaits: KeyWait[] = [];
  private readonly capabilities;

  constructor(
    sources: Readonly<Record<TalkScriptName, string>>,
    host: BensonHostState,
    options: TalkHostOptions = {}
  ) {
    this.core = options.core ?? createCore();
    this.sources = sources;
    this.host = host;
    this.cellSeconds = options.cellSeconds ?? 0.09;
    this.holdSeconds = options.holdSeconds ?? 3;
    this.random = options.random ?? (() => 0);
    this.capabilities = this.defineCapabilities();
    this.group = this.core.newGroup({ name: 'targ' });
    for (const name of Object.keys(sources) as TalkScriptName[]) {
      this.group.load({
        grants: this.grants(),
        limits: { maxWaitMs: 2_147_483_647 },
        name,
        source: sources[name]
      });
    }
  }

  /// Starts a Talk Script. Several may run at once; they share the display queue.
  start(name: TalkScriptName): void {
    this.group.script(name)?.deliver({ name: 'begin' });
    this.pump();
  }

  /// The player boards a craft. An armed object starts its Talk Script, as
  /// Benson's object bit 4 starts the script numbered by the slot.
  board(craft: number): void {
    this.host = this.host.with({ boardedCraft: craft });
    const script = ARMED_SCRIPTS[craft];
    if (script !== undefined && this.armed.has(craft)) {
      this.start(script);
    }
  }

  leaveCraft(): void {
    this.host = this.host.with({ boardedCraft: BensonHostState.onFoot });
  }

  /// A key press reaches every Talk Script waiting for it, and counts as input heard.
  press(key: string): void {
    this.heard = true;
    const waits = this.keyWaits;
    this.keyWaits = [];
    for (const wait of waits) {
      if (wait.key === undefined || wait.key === key) {
        wait.call.answer(bool(true));
      } else {
        this.keyWaits.push(wait);
      }
    }
    this.pump();
  }

  /// Advances the host clock, settling display and key deadlines as it passes them.
  advance(seconds: number): void {
    const target = this.now + seconds;
    for (;;) {
      this.settleDue();
      const result = this.pump();
      const pumped =
        result.nextDeadline === undefined
          ? Number.POSITIVE_INFINITY
          : Number(result.nextDeadline) / MICROS;
      const next = Math.min(pumped, this.nextHostDeadline());
      if (next > target) {
        this.now = target;
        this.settleDue();
        this.pump();
        return;
      }
      this.now = Math.max(next, this.now + 1 / MICROS);
    }
  }

  get messages(): string[] {
    return this.effects.flatMap(effect =>
      typeof effect === 'object' && 'playMessage' in effect
        ? [effect.playMessage]
        : []
    );
  }

  save(): TalkHostSave {
    return {
      armed: [...this.armed],
      group: this.group.save(),
      heard: this.heard,
      host: this.host,
      now: this.now
    };
  }

  /// Restores a save into this host's fresh Core. Calls the save left
  /// pending are reissued: a message replays, a key wait restarts its window.
  restore(save: TalkHostSave): void {
    this.armed = new Set(save.armed);
    this.heard = save.heard;
    this.host = save.host;
    this.now = save.now;
    this.queue.length = 0;
    this.playing = undefined;
    this.keyWaits = [];
    const { group, result } = this.core.restore(save.group, {
      grants: (_script, name) =>
        this.grants()[name as keyof ReturnType<TalkHost['grants']>],
      libraries: [],
      name: 'targ',
      onMismatch: 'reject',
      resolve: () => undefined
    });
    this.group = group;
    this.reports.push(...result.reports);
    for (const call of result.pending) {
      this.group.settle(call.id, { reissue: true });
    }
    this.pump();
  }

  private pump(): PumpResult {
    const result = this.group.pump(BigInt(Math.round(this.now * MICROS)));
    this.reports.push(...result.reports);
    return result;
  }

  private nextHostDeadline(): number {
    return Math.min(
      this.playing?.until ?? Number.POSITIVE_INFINITY,
      ...this.keyWaits.map(wait => wait.until)
    );
  }

  private settleDue(): void {
    if (this.playing !== undefined && this.playing.until <= this.now) {
      this.playing.call?.answer(nothing);
      this.playing = undefined;
      this.host = this.host.with({ messagePlaying: false });
    }
    this.playNext();
    const waits = this.keyWaits;
    this.keyWaits = [];
    for (const wait of waits) {
      if (wait.until <= this.now) {
        wait.call.answer(bool(false));
      } else {
        this.keyWaits.push(wait);
      }
    }
  }

  private playNext(): void {
    if (this.playing !== undefined) {
      return;
    }
    const next = this.queue.shift();
    if (next === undefined) {
      return;
    }
    const seconds = next.text.length * this.cellSeconds + this.holdSeconds;
    this.playing = { ...next, until: this.now + seconds };
    this.host = this.host.with({ messagePlaying: true });
    this.effects.push({ displaySource: 'talk', playMessage: next.text });
    this.played.push({ at: this.now, text: next.text });
  }

  private grants() {
    const { display, keys, sound, world } = this.capabilities;
    return {
      display: display.grant('all', undefined),
      keys: keys.grant('all', undefined),
      sound: sound.grant('all', undefined),
      world: world.grant('all', undefined)
    };
  }

  private defineCapabilities() {
    const world = this.core.defineCapability<void>('world', {
      advertIntact: {
        cost: { fuel: 1 },
        description: "Whether the author's advert on block 50 still stands.",
        do: () => bool(!this.host.destroyedBlocks.has(ADVERT_BLOCK)),
        mode: 'immediate',
        result: shape.bool
      },
      arm: {
        args: [shape.number],
        cost: { fuel: 1 },
        description: 'Boarding or taking this object starts its Talk Script.',
        do: (_call, object) => {
          const slot = whole(object);
          this.armed.add(slot);
          this.host = this.host.withObjectFlag(
            slot,
            (this.host.objectFlags.get(slot) ?? 0) | SCRIPT_ARMED
          );
          return nothing;
        },
        mode: 'immediate'
      },
      boarded: {
        cost: { fuel: 1 },
        description: 'The craft the player is in, or nothing on foot.',
        do: () =>
          this.host.boardedCraft === BensonHostState.onFoot
            ? nothing
            : num(this.host.boardedCraft),
        mode: 'immediate',
        result: shape.optional(shape.number)
      },
      carries: {
        args: [shape.text],
        cost: { fuel: 1 },
        do: (_call, item) => {
          if (item.asText() !== 'novadrive') {
            throw new Error(`unknown item ${item.toString()}`);
          }
          return bool(this.host.inventory.has(NOVADRIVE));
        },
        mode: 'immediate',
        result: shape.bool
      },
      clearFlag: {
        args: [shape.text],
        cost: { fuel: 1 },
        do: (_call, name) => {
          this.host = this.host.with({
            engineFlags: this.host.engineFlags & ~flag(name) & 0xff
          });
          return nothing;
        },
        mode: 'immediate'
      },
      credits: {
        cost: { fuel: 1 },
        do: () => num(this.host.decimal(CREDITS)),
        mode: 'immediate',
        result: shape.number
      },
      escape: {
        cost: { fuel: 1 },
        description: 'Accepts the Escape: the Ending phase becomes 1.',
        do: () => {
          this.host = this.host.with({ endingPhase: 1 });
          return nothing;
        },
        mode: 'immediate'
      },
      flag: {
        args: [shape.text],
        cost: { fuel: 1 },
        do: (_call, name) => bool((this.host.engineFlags & flag(name)) !== 0),
        mode: 'immediate',
        result: shape.bool
      },
      onSurface: {
        cost: { fuel: 1 },
        do: () => bool(this.host.currentRoom === 0),
        mode: 'immediate',
        result: shape.bool
      },
      roll: {
        args: [shape.number],
        cost: { fuel: 1 },
        description: 'A random whole number from 1 to the given count.',
        do: (_call, count) => num((this.random() % whole(count)) + 1),
        mode: 'immediate',
        result: shape.number
      },
      setFlag: {
        args: [shape.text],
        cost: { fuel: 1 },
        do: (_call, name) => {
          this.host = this.host.with({
            engineFlags: (this.host.engineFlags | flag(name)) & 0xff
          });
          return nothing;
        },
        mode: 'immediate'
      },
      setMessageInterval: {
        args: [shape.number],
        cost: { fuel: 1 },
        do: (_call, frames) => {
          this.host = this.host.with({ messageInterval: whole(frames) });
          return nothing;
        },
        mode: 'immediate'
      },
      spend: {
        args: [shape.number],
        cost: { fuel: 1 },
        do: (_call, amount) => {
          this.host = this.host.addDecimal(CREDITS, -whole(amount));
          return nothing;
        },
        mode: 'immediate'
      }
    });

    const display = this.core.defineCapability<void>('display', {
      show: {
        args: [shape.text],
        cost: { fuel: 1 },
        description:
          'Queues a message on the Benson Display; answers once it has played.',
        mode: 'suspending',
        start: (call, message) => {
          this.queue.push({ call, text: message.asText()! });
          this.playNext();
        }
      }
    });

    const keys = this.core.defineCapability<void>('keys', {
      awaitAny: {
        args: [shape.number],
        cost: { fuel: 1 },
        description: 'True when any key arrives within the given seconds.',
        mode: 'suspending',
        result: shape.bool,
        start: (call, seconds) => {
          this.keyWaits.push({
            call,
            key: undefined,
            until: this.now + whole(seconds)
          });
        }
      },
      awaitKey: {
        args: [shape.text, shape.number],
        cost: { fuel: 1 },
        description: 'True when the key arrives within the given seconds.',
        mode: 'suspending',
        result: shape.bool,
        start: (call, key, seconds) => {
          this.keyWaits.push({
            call,
            key: key.asText()!,
            until: this.now + whole(seconds)
          });
        }
      },
      forget: {
        cost: { fuel: 1 },
        description: 'Forgets any input heard so far.',
        do: () => {
          this.heard = false;
          return nothing;
        },
        mode: 'immediate'
      },
      heard: {
        cost: { fuel: 1 },
        description: 'Whether any key arrived since the last forget.',
        do: () => bool(this.heard),
        mode: 'immediate',
        result: shape.bool
      }
    });

    const sound = this.core.defineCapability<void>('sound', {
      silence: {
        args: [shape.text],
        cost: { fuel: 1 },
        fire: (_call, voice) => {
          this.effects.push({
            sound: { symbol: `${voice.asText()!}.control`, value: 0 }
          });
        },
        mode: 'fire-and-forget'
      }
    });

    return { display, keys, sound, world };
  }
}
