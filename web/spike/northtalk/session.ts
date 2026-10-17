/// A real Gameplay Session run by Talk Scripts instead of Benson Scripts.
///
/// Benson stays in place for what the Host Callout does for the engine
/// (taking, boarding, leaving, the Benson Display), but refuses to start any
/// Benson Script. The Talk Scripts learn what happened from World Events,
/// derived here by comparing the session before and after each frame: the
/// spike leaves `web/src` untouched, so the Gameplay Session doesn't emit them
/// itself (docs/research/targ-talk-scripts.md).
import { join } from 'node:path';

import {
  BensonProgram,
  BensonSession,
  DEFAULT_SESSION_SEED,
  type BensonKey,
  type BensonTunables
} from '../../src/benson/index.ts';
import type { PlayerState } from '../../src/gameCore/index.ts';
import type { EndgameCombat } from '../../src/payload/documents.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent,
  type SessionContent
} from '../../src/session/index.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings
} from '../../src/settings/index.ts';
import { TextTable } from '../../src/text/index.ts';
import { World, type Location } from '../../src/world/index.ts';
import { loadPayload, repositoryRoot } from '../../test/replay/artifacts.ts';
import {
  TalkHost,
  type TalkHostOptions,
  type TalkHostSave,
  type WorldEvent
} from './host.ts';
import { objectName, roomName, siteName } from './names.ts';
import { talkLibrary, talkScripts } from './sources.ts';

type SiteRules = EndgameCombat['siteDestruction'];

/// Benson with every Benson Script refused. `refused` records what Benson
/// would have started, so a test can check a World Event stands in for it.
export class QuietBenson extends BensonSession {
  readonly refused: number[] = [];

  override start(script: number): boolean {
    this.refused.push(script);
    return false;
  }
}

/// What a frame is compared on to find its World Events.
interface Seen {
  readonly carried: readonly number[];
  readonly craft: number | undefined;
  readonly destroyed: ReadonlySet<number>;
  readonly mechanoid: number;
  readonly palyar: number;
  readonly room: number;
}

const roomOf = (location: Location): number =>
  location.kind === 'room' ? location.id : 0;

const cellsOf = (list: unknown): Set<number> =>
  new Set(
    typeof list === 'string' && list !== ''
      ? list.split(',').map(cell => Number.parseInt(cell, 16))
      : []
  );

export interface TalkSessionOptions extends TalkHostOptions {
  /// Where the player starts; the opening player by default.
  readonly player?: PlayerState;
  /// The Talk Scripts to load, by name; all of them by default.
  readonly scripts?: readonly string[];
}

export class TalkSession extends GameplaySession {
  talk: TalkHost;
  private lastSeen: Seen;
  private readonly siteRules: SiteRules;

  constructor(
    content: SessionContent,
    benson: QuietBenson,
    sites: SiteRules,
    options: TalkSessionOptions = {}
  ) {
    super(
      content,
      options.player ?? openingPlayer(),
      benson,
      DEFAULT_SESSION_SEED
    );
    this.siteRules = sites;
    this.talk = new TalkHost(
      options.scripts === undefined
        ? talkScripts
        : Object.fromEntries(
            options.scripts.map(name => [name, talkScripts[name]!])
          ),
      talkLibrary,
      benson,
      options
    );
    this.lastSeen = this.lookForEvents();
    this.talk.deliver([{ kind: 'begin' }]);
  }

  /// Replaces the Talk Scripts with a save restored into a new host, on its
  /// own Core, while the session itself carries on.
  restoreTalk(save: TalkHostSave, options: TalkHostOptions = {}): void {
    const scripts = this.talk.scripts;
    this.talk = new TalkHost(scripts, talkLibrary, this.benson, options);
    this.talk.restore(save);
  }

  get benson(): QuietBenson {
    return this.scripts as QuietBenson;
  }

  override advance(seconds: number): ReturnType<GameplaySession['advance']> {
    const result = super.advance(seconds);
    // The frame's events go before the clock moves on, so a Handler's
    // queries see the world exactly as the frame left it.
    this.talk.deliver(this.worldEvents());
    this.talk.advance(seconds);
    return result;
  }

  override press(key: BensonKey | undefined): void {
    super.press(key);
    if (key !== undefined) {
      this.talk.deliver([{ key: key.replace(/^key/, ''), kind: 'pressed' }]);
    }
  }

  private lookForEvents(): Seen {
    const observed = this.observations().observations;
    return {
      carried: this.snapshot.carriedStack,
      craft: this.occupancy.kind === 'aboard' ? this.occupancy.slot : undefined,
      destroyed: cellsOf(observed['destroyedCells']),
      mechanoid: Number(observed['mechanoidDestroyed'] ?? 0),
      palyar: Number(observed['palyarDestroyed'] ?? 0),
      room: roomOf(this.location)
    };
  }

  /// The World Events between the last look and this one, in the order a
  /// player would tell them: leaving, arriving, then what changed hands, then
  /// what was destroyed.
  private worldEvents(): WorldEvent[] {
    const before = this.lastSeen;
    const after = this.lookForEvents();
    this.lastSeen = after;
    const events: WorldEvent[] = [];
    if (before.craft !== undefined && before.craft !== after.craft) {
      events.push({ craft: objectName(before.craft), kind: 'left' });
    }
    if (before.room !== after.room) {
      events.push({ kind: 'entered', room: roomName(after.room) });
    }
    if (after.craft !== undefined && after.craft !== before.craft) {
      events.push({ craft: objectName(after.craft), kind: 'boarded' });
    }
    for (const slot of after.carried) {
      if (!before.carried.includes(slot)) {
        events.push({ kind: 'took', object: objectName(slot) });
      }
    }
    for (const slot of before.carried) {
      if (!after.carried.includes(slot)) {
        events.push({ kind: 'dropped', object: objectName(slot) });
      }
    }
    // A Site counts for a faction only when its destruction was credited, so
    // a neutral Site, or one destroyed away from the player, isn't an event.
    const faction =
      after.palyar > before.palyar
        ? 'palyar'
        : after.mechanoid > before.mechanoid
          ? 'mechanoid'
          : undefined;
    if (faction !== undefined) {
      for (const cell of after.destroyed) {
        if (!before.destroyed.has(cell)) {
          const lowId =
            (this.siteRules.initialTable[cell] ?? 0) & this.siteRules.lowIdMask;
          events.push({ faction, kind: 'destroyed', site: siteName(lowId) });
        }
      }
    }
    return events;
  }
}

/// Opens a new game on Talk Scripts: the opening player, the Data Payload,
/// and the settings every test session uses.
export const openTalkSession = async (
  options: TalkSessionOptions = {}
): Promise<TalkSession> => {
  const bundle = await loadPayload();
  const settings = loadSettings(
    await Bun.file(join(repositoryRoot, 'settings.json')).text()
  );
  const world = new World(bundle);
  if (
    bundle.benson === undefined ||
    bundle.text === undefined ||
    bundle.flight === undefined
  ) {
    throw new Error('the Data Payload is incomplete');
  }
  const program = BensonProgram.fromDocument(bundle.benson);
  const tunables: BensonTunables = bensonTunables(
    settings,
    program.framesPerTick
  );
  return new TalkSession(
    sessionContent(
      world,
      bundle,
      flightModel(settings.flight, bundle.flight, world.groundExtent)
    ),
    new QuietBenson(
      program,
      new TextTable(bundle.text),
      tunables,
      DEFAULT_SESSION_SEED
    ),
    bundle.endgame.combat.siteDestruction,
    options
  );
};
