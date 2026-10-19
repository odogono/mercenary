/// The Talk Script host (ADR 0080): one NorthTalk Group alive for a whole
/// Gameplay Session, offered the Host Callout as the `world`, `display` and
/// `sound` Capabilities. It tells the session's World Events as Broadcasts and
/// Player Input to its Input Owner, and shows lines on the session's Benson
/// Display a block at a time.
///
/// A save is the Group's own, beside the host's clock and claims. Restored,
/// it keeps each Talk Script whose code is unchanged as it stood, pending
/// lines and all; one whose code changed is reloaded with its Script
/// Variables carried over, and its Runs end.
///
/// Until no Benson Script is left to run, Benson's host state is where Talk
/// Scripts read and write the world, as Benson Scripts do, and the Benson
/// Display is the display both share.
import {
  LoadError,
  bool,
  codeIdentity,
  createCore,
  nothing,
  num,
  shape,
  text,
  type Call,
  type Grant,
  type Group,
  type Library,
  type Report,
  type Value
} from '@northtalk/ts';

import { BensonHostState, type BensonEffect } from '../benson/host.ts';
import type { BensonSession } from '../benson/session.ts';
import { OUT_OF_THE_WORLD } from '../interaction/index.ts';
import type { TalkSaveSnapshot } from '../session/save.ts';
import type { WorldEvent } from '../session/worldEvents.ts';
import librarySource from './benson.talk' with { type: 'text' };
import {
  locationName,
  objectName,
  objectSlot,
  roomName,
  siteName
} from './names.ts';

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
  /// The next random byte; the game's shared generator by default.
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

/// Engine flags a Talk Script may name, by their bit in `engineFlags`.
const FLAGS = {
  commanderAnnoyed: 32,
  dartBought: 1,
  gratitudeGiven: 2,
  shipHired: 4
} as const;

const CREDITS = BensonHostState.firstNumberDecimal;
/// An object's description bit that makes boarding or taking it start the
/// Benson Script of its slot.
const STARTS_SCRIPT = 4;
/// An object's flag bits a delivery sets: paid for, and fixed where it lies.
const DELIVERED = 1;
const FIXED = 16;
const ADVERT_BLOCK = 50;
const MICROS = 1_000_000;
/// No Talk Script wait is bounded by a deadline of its own.
const LONGEST_WAIT_MS = 2_147_483_647;

const flag = (name: Value): number => {
  const bit = FLAGS[name.asText() as keyof typeof FLAGS];
  if (bit === undefined) {
    throw new Error(`unknown flag ${name.toString()}`);
  }
  return bit;
};

/// The Library's `codeIdentity`, which every Talk Script's counts in.
const LIBRARY_IDENTITY = codeIdentity('library', 'benson', librarySource);

const whole = (value: Value): number => Number(value.asDecimal()!.toBigInt());

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
      return { args: [text(objectName(event.object))], name: event.kind };
    case 'destroyed':
      return {
        args: [text(siteName(event.site)), text(event.faction)],
        name: 'destroyed:by:'
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

  private readonly benson: BensonSession;
  /// Sound a Talk Script made since the session last took it.
  private effects: BensonEffect[] = [];
  private readonly grants: Readonly<Record<string, Grant<void>>>;
  private readonly group: Group;
  /// Each Talk Script's `codeIdentity`, the Library's counted in, by name.
  private readonly identities: ReadonlyMap<string, string>;
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
    benson: BensonSession,
    options: TalkHostOptions = {},
    saved?: TalkSaveSnapshot
  ) {
    this.benson = benson;
    this.random = options.random ?? (() => benson.nextRandomByte());
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
    this.identities = new Map(
      scripts.map(script => [
        script.name,
        codeIdentity('script', script.name, script.source, [LIBRARY_IDENTITY])
      ])
    );
    this.group =
      (saved && this.restore(core, scripts, saved)) ??
      this.newGroup(core, scripts);
    if (saved !== undefined) {
      // Reissued lines queue for the display at once, so a restored session
      // can tell who was speaking.
      this.pump();
    }
  }

  captureSaveSnapshot(): TalkSaveSnapshot {
    return {
      claims: this.claims.map(claim => ({ ...claim })),
      group: toBase64(this.group.save()),
      library: LIBRARY_IDENTITY,
      now: this.now,
      scripts: [...this.identities]
    };
  }

  private newGroup(
    core: ReturnType<typeof createCore>,
    scripts: readonly TalkScript[]
  ): Group {
    const group = core.newGroup({ name: 'targ' });
    group.addLibrary(this.library);
    for (const script of scripts) {
      this.load(group, script);
    }
    return group;
  }

  private load(group: Group, script: TalkScript): void {
    group.load({
      grants: this.grants,
      limits: { maxWaitMs: LONGEST_WAIT_MS },
      name: script.name,
      source: script.source
    });
  }

  /// The saved Group, brought up to the current Talk Scripts, or undefined
  /// if a saved Talk Script no longer loads beside the current Library.
  ///
  /// A changed Library or Capability ends every Run, the Core restoring only
  /// Script Variables. A Talk Script no longer in the build is emptied, as no
  /// Core can unload one, and a new one loads with no `begin`. Display calls
  /// left pending are reissued, so their lines play again from the start.
  private restore(
    core: ReturnType<typeof createCore>,
    scripts: readonly TalkScript[],
    saved: TalkSaveSnapshot
  ): Group | undefined {
    let restored: ReturnType<typeof core.restore>;
    try {
      restored = core.restore(fromBase64(saved.group), {
        grants: (_script, name) => this.grants[name],
        libraries: [this.library],
        name: 'targ',
        onMismatch: 'variables only',
        resolve: () => undefined
      });
    } catch (error) {
      if (error instanceof LoadError) {
        return undefined;
      }
      throw error;
    }
    const { group, result } = restored;
    this.now = saved.now;
    const ended = new Set(result.discardedRuns);
    this.claims = saved.claims.filter(claim => !ended.has(claim.run));
    this.record(result.reports);
    const was = new Map(saved.scripts);
    const current = new Map(scripts.map(script => [script.name, script]));
    const reloaded = new Set<string>();
    for (const name of group.scriptNames()) {
      const script = current.get(name);
      if (script === undefined) {
        this.record(group.reload(name, '', 'reset variables'));
        reloaded.add(name);
      } else if (was.get(name) !== this.identities.get(name)) {
        this.record(group.reload(name, script.source, 'carry variables'));
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
  /// A Benson Script still running holds the display. True if a call was
  /// answered.
  private settleDisplay(): boolean {
    if (this.benson.host.messagePlaying) {
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
    if (this.benson.host.isScriptRunning) {
      return answered;
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

  /// Writes Benson host state, which the session reads as it reads a Benson
  /// Script's writes.
  private write(patch: Parameters<BensonHostState['with']>[0]): Value {
    this.benson.host = this.benson.host.with(patch);
    return nothing;
  }

  private defineCapabilities(core: ReturnType<typeof createCore>) {
    const world = core.defineCapability<void>('world', {
      advertIntact: {
        cost: { fuel: 1 },
        description: "Whether the author's advert on block 50 still stands.",
        do: () => bool(!this.benson.host.destroyedBlocks.has(ADVERT_BLOCK)),
        mode: 'immediate',
        result: shape.bool
      },
      arm: {
        args: [shape.text],
        cost: { fuel: 1 },
        description:
          'Makes boarding or taking the object start its own Benson Script.',
        do: (_call, item) => {
          const slot = objectSlot(item.asText()!);
          this.benson.host = this.benson.host.withObjectFlag(
            slot,
            (this.benson.host.objectFlags.get(slot) ?? 0) | STARTS_SCRIPT
          );
          return nothing;
        },
        mode: 'immediate'
      },
      boarded: {
        cost: { fuel: 1 },
        description: 'The craft the player is in, or nothing on foot.',
        do: () =>
          this.benson.host.boardedCraft === BensonHostState.onFoot
            ? nothing
            : text(objectName(this.benson.host.boardedCraft)),
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
      deliver: {
        args: [shape.text],
        cost: { fuel: 1 },
        description:
          'Marks the object delivered: paid for, and fixed where it lies.',
        do: (_call, item) => {
          const slot = objectSlot(item.asText()!);
          this.benson.host = this.benson.host.withObjectFlag(
            slot,
            (this.benson.host.objectFlags.get(slot) ?? 0) | DELIVERED | FIXED
          );
          return nothing;
        },
        mode: 'immediate'
      },
      delivered: {
        args: [shape.text],
        cost: { fuel: 1 },
        description: 'Whether the object has been paid for.',
        do: (_call, item) =>
          bool(
            ((this.benson.host.objectFlags.get(objectSlot(item.asText()!)) ??
              0) &
              DELIVERED) !==
              0
          ),
        mode: 'immediate',
        result: shape.bool
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
      lies: {
        args: [shape.text],
        cost: { fuel: 1 },
        description:
          'The name of the Room the object lies in, or nothing while carried or gone.',
        do: (_call, item) => {
          const room = this.benson.host.objectRooms.get(
            objectSlot(item.asText()!)
          );
          return room === undefined || room === OUT_OF_THE_WORLD
            ? nothing
            : text(roomName(room));
        },
        mode: 'immediate',
        result: shape.optional(shape.text)
      },
      pay: {
        args: [shape.number],
        cost: { fuel: 1 },
        description: 'Adds to the credits.',
        do: (_call, amount) => {
          this.benson.host = this.benson.host.addDecimal(
            CREDITS,
            whole(amount)
          );
          return nothing;
        },
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

    const display = core.defineCapability<void>('display', {
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
            lines: [line.asText()!]
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
          this.enqueue({ call, lines: [line.asText()!] });
        }
      }
    });

    const sound = core.defineCapability<void>('sound', {
      silence: {
        args: [shape.text],
        cost: { fuel: 1 },
        description: 'Silences a voice, as a Benson Script writes 0 to it.',
        fire: (_call, voice) => {
          this.effects.push({
            sound: { symbol: `${voice.asText()!}.control`, value: 0 }
          });
        },
        mode: 'fire-and-forget'
      }
    });

    return { display, sound, world };
  }
}
