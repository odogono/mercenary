import { BensonChannel, DEFAULT_SESSION_SEED } from '../benson/index.ts';
import type { Bundle } from '../payload/documents.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../session/index.ts';
import type { SaveEnvironment, SaveSnapshot } from '../session/save.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings,
  type Settings
} from '../settings/index.ts';
import type { TalkScript } from '../talk/host.ts';
import { TALK_SCRIPTS } from '../talk/scripts.ts';
import { TextTable } from '../text/index.ts';
import { World } from '../world/index.ts';

export interface Walkabout {
  readonly session: GameplaySession;
  readonly world: World;
}

export const requiredSettings = (text: string | undefined): Settings => {
  if (text === undefined) {
    throw new Error('settings.json is required by the browser walkabout');
  }
  return loadSettings(text);
};

export const saveEnvironment = (
  bundle: Bundle,
  settings: Settings
): SaveEnvironment => ({
  payload: {
    // Reserved schema-14 identity: retiring the document must not refuse old Saves.
    bensonSchemaVersion: 1,
    decoderVersion: bundle.manifest.decoderVersion,
    endgameSchemaVersion: bundle.endgame.schemaVersion,
    flightSchemaVersion: bundle.flight?.schemaVersion ?? 0,
    interactionSchemaVersion: bundle.interaction?.schemaVersion ?? 0,
    schemaVersion: bundle.manifest.schemaVersion,
    sourceCoreDigest: bundle.manifest.sourceCoreDigest,
    sourceDatasetId: bundle.manifest.sourceDatasetId,
    textSchemaVersion: bundle.text?.schemaVersion ?? 0,
    undergroundSchemaVersion: bundle.underground?.schemaVersion ?? null
  },
  settings: {
    flight: {
      ...settings.flight,
      groundAltitude: settings.flight.groundAltitude ?? null
    },
    message: { ...settings.message },
    scripts: { ...settings.scripts }
  }
});

/// Assemble the one live opening loop the Browser Shell presents.
///
/// The payload schema permits several documents to be absent for research and inspection
/// tools. The walkabout does not: without any one of these it would load successfully into a
/// surface whose advertised controls or opening script could not work.
export const createWalkabout = (
  bundle: Bundle,
  settings: Settings,
  restore?: SaveSnapshot,
  talkScripts: readonly TalkScript[] = TALK_SCRIPTS
): Walkabout => {
  if (bundle.flight === undefined) {
    throw new Error('flight.json is required by the browser walkabout');
  }
  if (bundle.text === undefined) {
    throw new Error('text.json is required by the browser walkabout');
  }
  if (bundle.interaction === undefined) {
    throw new Error('interaction.json is required by the browser walkabout');
  }

  const world = new World(bundle);
  const text = new TextTable(bundle.text);
  const scripts = new BensonChannel(
    text,
    bensonTunables(settings, 50),
    DEFAULT_SESSION_SEED
  );
  const flight = flightModel(
    settings.flight,
    bundle.flight,
    world.groundExtent
  );
  const content = sessionContent(world, bundle, flight);
  const session =
    restore === undefined
      ? new GameplaySession(content, openingPlayer(), scripts)
      : GameplaySession.restore(
          content,
          scripts,
          restore,
          talkScripts.length === 0 ? undefined : { scripts: talkScripts }
        );
  if (restore === undefined && talkScripts.length > 0) {
    session.useTalkScripts(talkScripts);
  }
  // The opening is started here even when the Arrival is about to present, so that a Save
  // taken during the opening restores a game with an opening to play. The Arrival holds it by
  // not advancing the session rather than by leaving it unstarted (ADR 0032). It is a Talk
  // Script (ADR 0080); the historical Replay Gate assembles its own oracle.
  if (restore === undefined) {
    session.begin();
  }
  return { session, world };
};
