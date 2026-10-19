/// A real Gameplay Session with Talk Scripts beside Benson Scripts, as a
/// migration would run them.
///
/// Benson stays in place for what the Host Callout does for the engine
/// (taking, boarding, leaving, the Benson Display) and runs every Benson
/// Script no Talk Script replaces; it refuses the ported ones. The Talk
/// Scripts learn what happened from the Gameplay Session's World Events, told
/// here by name (docs/research/targ-talk-scripts.md).
import { join } from 'node:path';

import type { PlayerState } from '../../src/gameCore/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent,
  type SessionContent,
  type WorldEvent as SessionWorldEvent
} from '../../src/session/index.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings
} from '../../src/settings/index.ts';
import { TextTable } from '../../src/text/index.ts';
import { World } from '../../src/world/index.ts';
import {
  BensonProgram,
  BensonSession,
  DEFAULT_SESSION_SEED,
  type BensonKey,
  type BensonTunables
} from '../../test/oracle/index.ts';
import { loadPayload, repositoryRoot } from '../../test/replay/artifacts.ts';
import {
  TalkHost,
  type TalkHostOptions,
  type TalkHostSave,
  type WorldEvent
} from './host.ts';
import { objectName, roomName, siteName } from './names.ts';
import { talkLibrary, talkScripts } from './sources.ts';

/// The Benson Scripts each Talk Script replaces.
export const PORTED: Readonly<Record<string, readonly number[]>> = {
  briefing: [13],
  escape: [7],
  opening: [0],
  reaction: [34, 35]
};

/// Benson refusing the Benson Scripts a Talk Script replaces and running the
/// rest. `refused` records what Benson would have started, so a test can
/// check a World Event stands in for it.
export class QuietBenson extends BensonSession {
  readonly refused: number[] = [];
  override refusing: ReadonlySet<number> = new Set();

  override start(script: number): boolean {
    if (this.refusing.has(script)) {
      this.refused.push(script);
      return false;
    }
    return super.start(script);
  }
}

/// The name a Talk Script gives a key: `KeyY` and Benson's `keyY` are `Y`,
/// `Digit1` is `1`, and any other code stands as it is.
export const keyName = (code: string): string =>
  code.replace(/^(?:[Kk]ey|Digit)(?=.)/, '');

/// A World Event as the Talk Scripts are told it: its subjects by name.
const named = (event: SessionWorldEvent): WorldEvent | undefined => {
  switch (event.kind) {
    case 'entered':
      return {
        kind: 'entered',
        room: roomName(event.location.kind === 'room' ? event.location.id : 0)
      };
    case 'boarded':
    case 'left':
      return { craft: objectName(event.craft), kind: event.kind };
    case 'took':
    case 'dropped':
      return { kind: event.kind, object: objectName(event.object) };
    case 'destroyed':
      return {
        faction: event.faction,
        kind: 'destroyed',
        site: siteName(event.site)
      };
    case 'gratitude':
    case 'hit':
      // No Talk Script listens for these yet.
      return undefined;
  }
};

export interface TalkSessionOptions extends TalkHostOptions {
  /// Where the player starts; the opening player by default.
  readonly player?: PlayerState;
  /// The Talk Scripts to load, by name; all of them by default.
  readonly scripts?: readonly string[];
}

export class TalkSession extends GameplaySession {
  northtalk: TalkHost;
  /// The code of the key last pressed, before any Binding took it.
  private made: string | undefined;

  constructor(
    content: SessionContent,
    benson: QuietBenson,
    options: TalkSessionOptions = {}
  ) {
    super(
      content,
      options.player ?? openingPlayer(),
      benson,
      DEFAULT_SESSION_SEED
    );
    const scripts =
      options.scripts === undefined
        ? talkScripts
        : Object.fromEntries(
            options.scripts.map(name => [name, talkScripts[name]!])
          );
    benson.refusing = new Set(
      Object.keys(scripts).flatMap(name => PORTED[name] ?? [])
    );
    this.northtalk = new TalkHost(scripts, talkLibrary, benson, options);
    this.northtalk.deliver([{ kind: 'begin' }]);
  }

  /// Replaces the Talk Scripts with a save restored into a new host, on its
  /// own Core, while the session itself carries on.
  restoreTalk(save: TalkHostSave, options: TalkHostOptions = {}): void {
    const scripts = this.northtalk.scripts;
    this.northtalk = new TalkHost(scripts, talkLibrary, this.benson, options);
    this.northtalk.restore(save);
  }

  get benson(): QuietBenson {
    return this.scripts as QuietBenson;
  }

  override advance(seconds: number): ReturnType<GameplaySession['advance']> {
    const result = super.advance(seconds);
    // The frame's events go before the clock moves on, so a Handler's
    // queries see the world exactly as the frame left it.
    this.northtalk.deliver(
      result.worldEvents
        .map(named)
        .filter((event): event is WorldEvent => event !== undefined)
    );
    this.northtalk.advance(seconds);
    return result;
  }

  /// Every key the player presses, before any Binding takes it.
  keyMake(code: string): void {
    this.made = code;
  }

  /// A key no Binding took: Benson's answer, and Player Input named by the
  /// key's code. The shell would pass the code itself once Talk Scripts are
  /// accepted; here `keyMake` remembers it.
  override press(key: BensonKey | undefined): void {
    super.press(key);
    const code = this.made ?? key;
    this.made = undefined;
    if (code !== undefined) {
      this.northtalk.input(keyName(code));
    }
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
    options
  );
};
