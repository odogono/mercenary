/// The Talk Script host for the NorthTalk spike: the Host Callout offered to
/// NorthTalk as three Capabilities, World Events delivered as Broadcasts, and
/// messages shown on the session's own Benson Display.
///
/// Throwaway. It shows what a Talk Script host has to own, not how the
/// Gameplay Session should own it (docs/research/targ-talk-scripts.md).
import {
  bool,
  createCore,
  nothing,
  num,
  shape,
  text,
  type Call,
  type Group,
  type Library,
  type Report,
  type Value
} from '@northtalk/ts';

import { BensonHostState } from '../../src/benson/host.ts';
import type { BensonSession } from '../../src/benson/session.ts';
import { objectName, objectSlot, roomName } from './names.ts';

/// A NorthTalk Core: the TS Core by default, or the WASM Core from `@northtalk/ts/wasm`.
export type TalkCore = Pick<
  ReturnType<typeof createCore>,
  'compileLibrary' | 'defineCapability' | 'newGroup' | 'restore'
>;

/// A change in play, as the Talk Scripts receive it: a Broadcast message.
export type WorldEvent =
  | { readonly kind: 'begin' }
  | { readonly kind: 'entered'; readonly room: string }
  | { readonly craft: string; readonly kind: 'boarded' | 'left' }
  | { readonly kind: 'took' | 'dropped'; readonly object: string }
  | {
      readonly faction: string;
      readonly kind: 'destroyed';
      readonly site: string;
    }
  | { readonly key: string; readonly kind: 'pressed' };

/// Engine flags a Talk Script may name, by their bit in `engineFlags`
/// (notes/decode/endgame.md, "Engine flags").
const FLAGS = {
  commanderAnnoyed: 32,
  gratitudeGiven: 2,
  shipHired: 4
} as const;

const CREDITS = 8;
const ADVERT_BLOCK = 50;
const MICROS = 1_000_000;

export interface TalkHostOptions {
  /// The Core to run on. Both Cores share the embedding API.
  readonly core?: TalkCore;
  /// The next random byte. The host owns randomness so tests can choose outcomes.
  readonly random?: () => number;
}

/// The host-side state a save must carry beside the Group's own bytes.
export interface TalkHostSave {
  readonly group: Uint8Array;
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

const message = (event: WorldEvent): { args: Value[]; name: string } => {
  switch (event.kind) {
    case 'begin':
      return { args: [], name: 'begin' };
    case 'entered':
      return { args: [text(event.room)], name: 'entered' };
    case 'boarded':
    case 'left':
      return { args: [text(event.craft)], name: event.kind };
    case 'took':
    case 'dropped':
      return { args: [text(event.object)], name: event.kind };
    case 'destroyed':
      return {
        args: [text(event.site), text(event.faction)],
        name: 'destroyed:by:'
      };
    case 'pressed':
      return { args: [text(event.key)], name: 'pressed' };
  }
};

/// One Group of Talk Scripts, alive for a whole Gameplay Session, sharing its
/// Benson Display and its Benson host state.
export class TalkHost {
  readonly core: TalkCore;
  /// Every World Event delivered, in order, with the host clock in seconds.
  readonly delivered: { readonly at: number; readonly event: WorldEvent }[] =
    [];
  /// Each Talk Script message as it began to play, with the host clock in seconds.
  readonly played: { readonly at: number; readonly text: string }[] = [];
  readonly reports: Report[] = [];
  /// Voices a Talk Script silenced.
  readonly silenced: string[] = [];
  group: Group;
  now = 0;
  readonly scripts: Readonly<Record<string, string>>;

  private readonly benson: BensonSession;
  private readonly capabilities;
  private readonly library: Library;
  private playing: { readonly call: Call<unknown> } | undefined;
  private readonly queue: { call: Call<unknown>; text: string }[] = [];
  private readonly random: () => number;

  constructor(
    scripts: Readonly<Record<string, string>>,
    library: { readonly name: string; readonly source: string },
    benson: BensonSession,
    options: TalkHostOptions = {}
  ) {
    this.core = options.core ?? createCore();
    this.scripts = scripts;
    this.benson = benson;
    this.random = options.random ?? (() => 0);
    this.capabilities = this.defineCapabilities();
    this.library = this.core.compileLibrary({ ...library, version: '1' }, [], {
      display: { show: { args: [shape.text], mode: 'suspending' } }
    });
    this.group = this.newGroup();
  }

  /// Delivers World Events as Broadcasts, in order, then lets the Talk Scripts run.
  deliver(events: readonly WorldEvent[]): void {
    for (const event of events) {
      this.delivered.push({ at: this.now, event });
      this.group.broadcast(message(event));
    }
    this.pump();
  }

  /// Moves the host clock on by one frame, after the session has advanced it.
  advance(seconds: number): void {
    this.now += seconds;
    this.pump();
  }

  get messages(): string[] {
    return this.played.map(entry => entry.text);
  }

  save(): TalkHostSave {
    return { group: this.group.save(), now: this.now };
  }

  /// Restores a save into this host's fresh Core. Calls the save left pending
  /// are reissued: a message that was playing plays again from its start.
  restore(save: TalkHostSave): void {
    this.now = save.now;
    this.queue.length = 0;
    this.playing = undefined;
    const grants = this.grants();
    const { group, result } = this.core.restore(save.group, {
      grants: (_script, name) => grants[name as keyof typeof grants],
      libraries: [this.library],
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

  private newGroup(): Group {
    const group = this.core.newGroup({ name: 'targ' });
    group.addLibrary(this.library);
    for (const [name, source] of Object.entries(this.scripts)) {
      group.load({
        grants: this.grants(),
        limits: { maxWaitMs: 2_147_483_647 },
        name,
        source
      });
    }
    return group;
  }

  /// Pumps until the display settles: answering a message that has played can
  /// let a Talk Script show the next one in the same frame.
  private pump(): void {
    for (;;) {
      const result = this.group.pump(BigInt(Math.round(this.now * MICROS)));
      this.reports.push(...result.reports);
      if (!this.settleDisplay()) {
        return;
      }
    }
  }

  /// Answers the message that finished and starts the next one the Benson
  /// Display is free for. Messages the engine shows itself take their turn:
  /// a Talk Script message waits while one is playing. True if a call was answered.
  private settleDisplay(): boolean {
    let answered = false;
    if (this.playing !== undefined && !this.benson.host.messagePlaying) {
      this.playing.call.answer(nothing);
      this.playing = undefined;
      answered = true;
    }
    if (this.playing === undefined && !this.benson.host.messagePlaying) {
      const next = this.queue.shift();
      if (next !== undefined) {
        this.benson.showText(next.text);
        this.playing = next;
        this.played.push({ at: this.now, text: next.text });
      }
    }
    return answered;
  }

  private grants() {
    const { display, sound, world } = this.capabilities;
    return {
      display: display.grant('all', undefined),
      sound: sound.grant('all', undefined),
      world: world.grant('all', undefined)
    };
  }

  /// Writes Benson host state the session reads back after the frame.
  private write(patch: Parameters<BensonSession['host']['with']>[0]): Value {
    this.benson.host = this.benson.host.with(patch);
    return nothing;
  }

  private defineCapabilities() {
    const world = this.core.defineCapability<void>('world', {
      advertIntact: {
        cost: { fuel: 1 },
        description: "Whether the author's advert on block 50 still stands.",
        do: () => bool(!this.benson.host.destroyedBlocks.has(ADVERT_BLOCK)),
        mode: 'immediate',
        result: shape.bool
      },
      boarded: {
        cost: { fuel: 1 },
        description: 'The craft the player is in, or nothing on foot.',
        do: () => {
          const craft = this.benson.host.boardedCraft;
          return craft === BensonHostState.onFoot
            ? nothing
            : text(objectName(craft));
        },
        mode: 'immediate',
        result: shape.optional(shape.text)
      },
      carries: {
        args: [shape.text],
        cost: { fuel: 1 },
        do: (_call, item) =>
          bool(this.benson.host.inventory.has(objectSlot(item.asText()!))),
        mode: 'immediate',
        result: shape.bool
      },
      clearFlag: {
        args: [shape.text],
        cost: { fuel: 1 },
        do: (_call, name) =>
          this.write({
            engineFlags: this.benson.host.engineFlags & ~flag(name) & 0xff
          }),
        mode: 'immediate'
      },
      credits: {
        cost: { fuel: 1 },
        do: () => num(this.benson.host.decimal(CREDITS)),
        mode: 'immediate',
        result: shape.number
      },
      escape: {
        cost: { fuel: 1 },
        description: 'Accepts the Escape: the Ending phase becomes 1.',
        do: () => this.write({ endingPhase: 1 }),
        mode: 'immediate'
      },
      flag: {
        args: [shape.text],
        cost: { fuel: 1 },
        do: (_call, name) =>
          bool((this.benson.host.engineFlags & flag(name)) !== 0),
        mode: 'immediate',
        result: shape.bool
      },
      here: {
        cost: { fuel: 1 },
        description: 'The name of the Room the player is in.',
        do: () => text(roomName(this.benson.host.currentRoom)),
        mode: 'immediate',
        result: shape.text
      },
      roll: {
        args: [shape.number],
        cost: { fuel: 1 },
        description: 'A random whole number from 1 to the given count.',
        do: (_call, count) => num((this.random() % whole(count)) + 1),
        mode: 'immediate',
        result: shape.number
      },
      sendAttacker: {
        cost: { fuel: 1 },
        description: 'Sends a hostile ship after the player.',
        do: () => this.write({ attackingShip: true }),
        mode: 'immediate'
      },
      setFlag: {
        args: [shape.text],
        cost: { fuel: 1 },
        do: (_call, name) =>
          this.write({
            engineFlags: (this.benson.host.engineFlags | flag(name)) & 0xff
          }),
        mode: 'immediate'
      },
      setMessageInterval: {
        args: [shape.number],
        cost: { fuel: 1 },
        do: (_call, frames) => this.write({ messageInterval: whole(frames) }),
        mode: 'immediate'
      },
      spend: {
        args: [shape.number],
        cost: { fuel: 1 },
        do: (_call, amount) => {
          this.benson.host = this.benson.host.addDecimal(
            CREDITS,
            -whole(amount)
          );
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
          'Queues a message for the Benson Display; answers once it has played.',
        mode: 'suspending',
        start: (call, line) => {
          this.queue.push({ call, text: line.asText()! });
          this.settleDisplay();
        }
      }
    });

    const sound = this.core.defineCapability<void>('sound', {
      silence: {
        args: [shape.text],
        cost: { fuel: 1 },
        fire: (_call, voice) => {
          this.silenced.push(voice.asText()!);
        },
        mode: 'fire-and-forget'
      }
    });

    return { display, sound, world };
  }
}
