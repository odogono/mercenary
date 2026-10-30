/// The Talk Script host (ADR 0080): one NorthTalk Group alive for a whole
/// Gameplay Session, offered the World Port as the `world` Capability and the
/// Benson Display as `display` and `sound`. It tells the session's World Events as Broadcasts and
/// Player Input to its Input Owner, and shows lines on the session's Benson
/// Display a block at a time.
///
/// A save is the Group's own, beside the host's clock and claims. Restored,
/// it keeps each Talk Script whose code is unchanged as it stood, pending
/// lines and all; one whose code changed is reloaded with its Script
/// Variables carried over, and its Runs end.
///
/// Talk Scripts read and write the world only through the World Port
/// (ADR 0083), by name: `names.ts` turns names into the session's numbers.
import {
  bool,
  createCore,
  nothing,
  num,
  shape,
  text,
  type Call,
  type Decimal,
  type Grant,
  type Library,
  type Report,
  type TsGroup,
  type Value
} from '@northtalk/ts';

import type { BensonChannel } from '../benson/channel.ts';
import type { BensonEffect } from '../benson/effect.ts';
import type { WorldEvent } from '../session/worldEvents.ts';
import { SURFACE, room, type Location } from '../world/index.ts';
import librarySource from './benson.talk' with { type: 'text' };
import {
  locationName,
  objectName,
  objectSlot,
  roomId,
  siteName
} from './names.ts';
import { TalkSaveRefused, type TalkSaveSnapshot } from './save.ts';
import type { WorldPort } from './worldPort.ts';

/// One Talk Script, and the Benson Scripts it replaces.
export interface TalkScript {
  readonly name: string;
  readonly replaces: readonly number[];
  readonly source: string;
}

/// A Talk Script's claim on Player Input: the Run whose prompt took it.
export interface InputClaim {
  readonly run: string;
  readonly script: string;
}

export interface TalkHostOptions {
  /// The next random byte; the World Port's by default.
  readonly random?: () => number;
}

/// Lines that play back to back: one `show`, one `prompt`, or a whole
/// `report`. Another Talk Script's lines wait until the block ends.
interface Block {
  readonly call: Call<unknown>;
  /// Set for a prompt: the claim its line takes once it shows.
  readonly claim?: InputClaim;
  readonly lines: string[];
}

/// The Site cell of the author's advert.
const ADVERT_BLOCK = 50;
const MICROS = 1_000_000;
/// No Talk Script wait is bounded by a deadline of its own.
const LONGEST_WAIT_MS = 2_147_483_647;

const whole = (value: Decimal): number => Number(value.toBigInt());

/// An operation done for its effect, answering nothing.
const done = (act: () => void): Value => {
  act();
  return nothing;
};

/// The Location a Talk Script names: `surface`, or a Room.
const locationNamed = (name: string): Location => {
  const id = roomId(name);
  return id === 0 ? SURFACE : room(id);
};

/// `btoa` takes a string of bytes, and a spread argument list has a limit.
const BASE64_CHUNK = 0x80_00;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let at = 0; at < bytes.length; at += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + BASE64_CHUNK));
  }
  return btoa(binary);
};

const fromBase64 = (encoded: string): Uint8Array =>
  Uint8Array.from(atob(encoded), char => char.charCodeAt(0));

/// The name a Talk Script gives a key: `KeyY` is `Y`, `Digit1` is `1`, and
/// any other code stands as it is.
export const keyName = (code: string): string =>
  code.replace(/^(?:Key|Digit)(?=.)/, '');

/// A World Event as Talk Scripts hear it: a message naming its subjects.
const message = (
  event: WorldEvent
): { args: Value[]; name: string } | undefined => {
  switch (event.kind) {
    case 'entered':
      return { args: [text(locationName(event.location))], name: 'entered' };
    case 'boarded':
    case 'left':
      return { args: [text(objectName(event.craft))], name: event.kind };
    case 'took':
    case 'dropped':
    case 'struck':
      return { args: [text(objectName(event.object))], name: event.kind };
    case 'destroyed':
      return {
        args: [
          text(siteName(event.site)),
          text(event.faction),
          bool(event.reacting)
        ],
        name: 'destroyed:by:reacting:'
      };
    case 'gratitude':
      return { args: [text(event.faction)], name: 'gratitude' };
    case 'hit':
      return { args: [bool(event.aboard)], name: 'hit' };
  }
};

export class TalkHost {
  /// Prompts holding Player Input, oldest first: the last is the Input Owner.
  claims: InputClaim[] = [];
  /// Every Run's end and every failure, for tests and diagnostics.
  readonly reports: Report[] = [];
  /// Each line a Talk Script showed, as it began to play.
  readonly shown: string[] = [];

  private readonly benson: BensonChannel;
  private readonly world: WorldPort;
  /// Sound a Talk Script made since the session last took it.
  private effects: BensonEffect[] = [];
  private readonly grants: Readonly<Record<string, Grant<void>>>;
  private readonly group: TsGroup;
  private readonly library: Library;
  /// A key the Input Owner pressed while its prompt was still playing, held
  /// for the `wait for` after it, as Benson's key latch holds a key until a
  /// script tests it. Ready once the prompt has been answered.
  private latched:
    | { readonly key: string; ready: boolean; readonly script: string }
    | undefined;
  private now = 0;
  private playing: Block | undefined;
  private readonly queue: Block[] = [];
  private readonly random: () => number;
  /// The Benson Scripts the loaded Talk Scripts replace.
  readonly replaces: ReadonlySet<number>;

  /// Loads the Talk Scripts, or restores them from a save.
  constructor(
    scripts: readonly TalkScript[],
    benson: BensonChannel,
    world: WorldPort,
    options: TalkHostOptions = {},
    saved?: TalkSaveSnapshot
  ) {
    this.benson = benson;
    this.world = world;
    this.random = options.random ?? (() => world.random());
    this.replaces = new Set(scripts.flatMap(script => script.replaces));
    const core = createCore();
    const capabilities = this.defineCapabilities(core);
    this.grants = {
      display: capabilities.display.grant('all', undefined),
      sound: capabilities.sound.grant('all', undefined),
      world: capabilities.world.grant('all', undefined)
    };
    this.library = core.compileLibrary(
      { name: 'benson', source: librarySource, version: '1' },
      [],
      {
        display: {
          prompt: { args: [shape.text], mode: 'suspending' },
          report: { args: [shape.listOf(shape.text)], mode: 'suspending' },
          show: { args: [shape.text], mode: 'suspending' }
        }
      }
    );
    this.group =
      saved === undefined
        ? this.newGroup(core, scripts)
        : this.restore(core, scripts, saved);
    if (saved !== undefined) {
      // Reissued lines queue for the display at once, so a restored session
      // can tell who was speaking.
      this.pump();
    }
  }

  captureSaveSnapshot(): TalkSaveSnapshot {
    return {
      claims: this.claims.map(claim => ({ ...claim })),
      // The build carries every Talk Script's source, so the Save leaves it
      // out and restore asks for it back.
      group: toBase64(this.group.save({ sources: 'external' })),
      now: this.now
    };
  }

  private newGroup(
    core: ReturnType<typeof createCore>,
    scripts: readonly TalkScript[]
  ): TsGroup {
    const group = core.newGroup({ name: 'targ' });
    group.addLibrary(this.library);
    for (const script of scripts) {
      this.load(group, script);
    }
    return group;
  }

  private load(group: TsGroup, script: TalkScript): void {
    group.load({
      grants: this.grants,
      limits: { maxWaitMs: LONGEST_WAIT_MS },
      name: script.name,
      source: script.source
    });
  }

  /// The saved Group, brought up to the current Talk Scripts. One that no
  /// longer loads beside the current Library is refused (#933).
  ///
  /// A changed Library or Capability ends every Run, the Core restoring only
  /// Script Variables. A Talk Script no longer in the build is emptied, as no
  /// Core can unload one, and a new one loads with no `begin`. Display calls
  /// left pending are reissued, so their lines play again from the start.
  private restore(
    core: ReturnType<typeof createCore>,
    scripts: readonly TalkScript[],
    saved: TalkSaveSnapshot
  ): TsGroup {
    let restored: ReturnType<typeof core.restore>;
    try {
      restored = core.restore(fromBase64(saved.group), {
        grants: (_script, name) => this.grants[name],
        // A changed Talk Script still hears what happened before the Save.
        keepMailbox: true,
        libraries: [this.library],
        name: 'targ',
        onMismatch: 'reload changed',
        resolve: () => undefined,
        // This build's source: a Talk Script changed since the Save reloads
        // with its Script Variables, and the rest restore as they were.
        scriptSources: ({ name }) => ({
          source: scripts.find(script => script.name === name)?.source ?? ''
        })
      });
    } catch (error) {
      // Whether it no longer loads beside this build (`LoadError`) or is no
      // Group at all, the story it held can't come back.
      throw new TalkSaveRefused(
        error instanceof Error ? error.message : String(error)
      );
    }
    const { group, result } = restored;
    this.now = saved.now;
    const ended = new Set(result.discardedRuns);
    this.claims = saved.claims.filter(claim => !ended.has(claim.run));
    this.record(result.reports);
    const current = new Set(scripts.map(script => script.name));
    const reloaded = new Set(result.reloaded);
    for (const name of group.scriptNames()) {
      if (!current.has(name)) {
        this.record(group.reload(name, '', 'reset variables'));
        reloaded.add(name);
      }
    }
    for (const call of result.pending) {
      if (!reloaded.has(call.script)) {
        group.settle(call.id, { reissue: true });
      }
    }
    const loaded = new Set(group.scriptNames());
    for (const script of scripts) {
      if (!loaded.has(script.name)) {
        this.load(group, script);
      }
    }
    return group;
  }

  /// The Talk Script whose line plays or waits first for the display.
  get speaker(): string | undefined {
    return (this.playing ?? this.queue[0])?.call.scriptName;
  }

  /// Nothing for the display and no prompt waiting for Player Input.
  get isQuiet(): boolean {
    return (
      this.playing === undefined &&
      this.queue.length === 0 &&
      this.claims.length === 0 &&
      !this.benson.messagePlaying
    );
  }

  /// A new game has begun.
  begin(): void {
    this.group.broadcast({ name: 'begin' });
    this.pump();
  }

  /// Tells a frame's World Events, in order, then lets the Talk Scripts run.
  deliver(events: readonly WorldEvent[]): void {
    for (const event of events) {
      const told = message(event);
      if (told !== undefined) {
        this.group.broadcast(told);
      }
    }
    this.pump();
  }

  /// A key no Binding took, as Player Input: to the Input Owner alone, or to
  /// every Talk Script when no prompt holds it.
  input(code: string): void {
    const key = keyName(code);
    const owner = this.claims.at(-1);
    if (owner !== undefined && this.playing?.claim?.run === owner.run) {
      this.latched = { key, ready: false, script: owner.script };
      return;
    }
    this.send(key, owner?.script);
    this.pump();
  }

  /// The sound Talk Scripts made since last asked, as a Benson Script's.
  takeEffects(): BensonEffect[] {
    const taken = this.effects;
    this.effects = [];
    return taken;
  }

  /// Moves the host clock on by one frame, after the session has advanced.
  advance(seconds: number): void {
    this.now += seconds;
    this.pump();
  }

  private send(key: string, script: string | undefined): void {
    const pressed = { args: [text(key)], name: 'pressed' };
    if (script === undefined) {
      this.group.broadcast(pressed);
    } else {
      this.group.script(script)!.deliver(pressed);
    }
  }

  /// Pumps until the display settles: answering a line that has played can
  /// let a Talk Script show the next in the same frame. A latched key goes in
  /// once its prompt's Run has reached what follows the prompt.
  private pump(): void {
    for (;;) {
      const result = this.group.pump(BigInt(Math.round(this.now * MICROS)));
      this.record(result.reports);
      if (this.latched?.ready) {
        this.send(this.latched.key, this.latched.script);
        this.latched = undefined;
        continue;
      }
      if (!this.settleDisplay()) {
        return;
      }
    }
  }

  /// Keeps the reports and lets go of every claim whose Run has ended.
  private record(reports: readonly Report[]): void {
    for (const report of reports) {
      if (report.kind === 'run end' || report.kind === 'run discarded') {
        this.claims = this.claims.filter(claim => claim.run !== report.run);
        if (report.kind === 'run end' && report.outcome === 'unhandled') {
          // A World Event whose Guard didn't match: the commonest Run there is.
          continue;
        }
      }
      if (
        report.kind === 'run end' ||
        report.kind === 'run discarded' ||
        report.kind === 'call failed' ||
        report.kind === 'host error'
      ) {
        this.reports.push(report);
      }
    }
  }

  /// Plays the next line of the block on the Benson Display once it is free,
  /// answering the block after its last line. The engine's own messages cut
  /// in whenever it shows them, and the block carries on with its next line.
  /// True if a call was answered.
  private settleDisplay(): boolean {
    if (this.benson.messagePlaying) {
      return false;
    }
    let answered = false;
    if (this.playing?.lines.length === 0) {
      this.playing.call.answer(nothing);
      if (this.playing.claim !== undefined && this.latched !== undefined) {
        this.latched.ready = true;
      }
      this.playing = undefined;
      answered = true;
    }
    this.playing ??= this.queue.shift();
    const line = this.playing?.lines.shift();
    if (line !== undefined) {
      const claim = this.playing!.claim;
      if (claim !== undefined) {
        this.claims = [
          ...this.claims.filter(held => held.run !== claim.run),
          claim
        ];
      }
      this.benson.showText(line);
      this.shown.push(line);
    }
    return answered;
  }

  private enqueue(block: Block): void {
    this.queue.push(block);
    this.settleDisplay();
  }

  private defineCapabilities(core: ReturnType<typeof createCore>) {
    const world = this.world;
    const worldCapability = core.defineCapability('world', {
      advertIntact: {
        cost: { fuel: 1 },
        description: "Whether the author's advert on block 50 still stands.",
        do: () => bool(!world.destroyed(ADVERT_BLOCK)),
        mode: 'immediate',
        result: shape.bool
      },
      arm: {
        args: [shape.text],
        cost: { fuel: 1 },
        description: 'Makes boarding or taking the object start its Talk.',
        do: (_call, item) => done(() => world.arm(objectSlot(item))),
        mode: 'immediate'
      },
      armed: {
        args: [shape.text],
        cost: { fuel: 1 },
        description: 'Whether boarding or taking the object starts its Talk.',
        do: (_call, item) => bool(world.armed(objectSlot(item))),
        mode: 'immediate',
        result: shape.bool
      },
      boarded: {
        cost: { fuel: 1 },
        description: 'The craft the player is in, or nothing on foot.',
        do: () => {
          const craft = world.boarded();
          return craft === undefined ? nothing : text(objectName(craft));
        },
        mode: 'immediate',
        result: shape.optional(shape.text)
      },
      carries: {
        args: [shape.text],
        cost: { fuel: 1 },
        do: (_call, item) => bool(world.carries(objectSlot(item))),
        mode: 'immediate',
        result: shape.bool
      },
      credits: {
        cost: { fuel: 1 },
        do: () => num(world.credits()),
        mode: 'immediate',
        result: shape.number
      },
      disarm: {
        args: [shape.text],
        cost: { fuel: 1 },
        description:
          "Takes the Talk away from the object, as the Dart's sale does: boarding it starts nothing more.",
        do: (_call, item) => done(() => world.disarm(objectSlot(item))),
        mode: 'immediate'
      },
      escape: {
        cost: { fuel: 1 },
        description: 'Accepts the Escape: the Ending begins.',
        do: () => done(() => world.escape()),
        mode: 'immediate'
      },
      fix: {
        args: [shape.text],
        cost: { fuel: 1 },
        description: 'Fixes the object where it lies.',
        do: (_call, item) => done(() => world.fix(objectSlot(item))),
        mode: 'immediate'
      },
      here: {
        cost: { fuel: 1 },
        description: 'The name of the Room the player is in.',
        do: () => text(locationName(world.here())),
        mode: 'immediate',
        result: shape.text
      },
      lies: {
        args: [shape.text],
        cost: { fuel: 1 },
        description:
          'The name of the Room the object lies in, or nothing while carried or gone.',
        do: (_call, item) => {
          const where = world.lies(objectSlot(item));
          return where === undefined ? nothing : text(locationName(where));
        },
        mode: 'immediate',
        result: shape.optional(shape.text)
      },
      move: {
        args: [shape.text, shape.text],
        cost: { fuel: 1 },
        description: 'Moves a loose object to the named Room.',
        do: (_call, item, destination) =>
          done(() => world.move(objectSlot(item), locationNamed(destination))),
        mode: 'immediate'
      },
      pay: {
        args: [shape.number],
        cost: { fuel: 1 },
        description: 'Adds to the credits.',
        do: (_call, amount) => done(() => world.pay(whole(amount))),
        mode: 'immediate'
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
        do: () => done(() => world.sendAttacker()),
        mode: 'immediate'
      },
      sendShip: {
        cost: { fuel: 1 },
        description: 'Starts the Ship Delivery: the hired ship lands at 8-8.',
        do: () => done(() => world.sendShip()),
        mode: 'immediate'
      },
      setMessageWait: {
        args: [shape.number],
        cost: { fuel: 1 },
        description:
          "The Benson Display's silent wait between bursts, in milliseconds, for the messages that follow.",
        do: (_call, ms) =>
          done(() => {
            this.benson.messageWaitSeconds = whole(ms) / 1000;
          }),
        mode: 'immediate'
      },
      spend: {
        args: [shape.number],
        cost: { fuel: 1 },
        do: (_call, amount) => done(() => world.spend(whole(amount))),
        mode: 'immediate'
      }
    });

    const display = core.defineCapability('display', {
      prompt: {
        args: [shape.text],
        cost: { fuel: 1 },
        description:
          'Shows a line asking for a key; once it shows, Player Input goes to this Run until it ends.',
        mode: 'suspending',
        start: (call, line) => {
          this.enqueue({
            call,
            claim: { run: call.runId, script: call.scriptName },
            lines: [line]
          });
        }
      },
      report: {
        args: [shape.listOf(shape.text)],
        cost: { fuel: 1 },
        description:
          "Shows lines back to back, with no other Talk Script's between them; answers after the last.",
        mode: 'suspending',
        start: (call, lines) => {
          this.enqueue({
            call,
            // NorthTalk lists count from 1.
            lines: Array.from({ length: lines.length }, (_, at) =>
              lines.index(at + 1).asText()!
            )
          });
        }
      },
      show: {
        args: [shape.text],
        cost: { fuel: 1 },
        description:
          'Queues a line for the Benson Display; answers once it has played.',
        mode: 'suspending',
        start: (call, line) => {
          this.enqueue({ call, lines: [line] });
        }
      }
    });

    const sound = core.defineCapability('sound', {
      silence: {
        args: [shape.text],
        cost: { fuel: 1 },
        description: 'Silences a voice, as a Benson Script writes 0 to it.',
        fire: (_call, voice) => {
          this.effects.push({
            sound: { symbol: `${voice}.control`, value: 0 }
          });
        },
        mode: 'fire-and-forget'
      }
    });

    return { display, sound, world: worldCapability };
  }
}
