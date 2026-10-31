import { BensonChannel } from '../benson/index.ts';
import type { Bundle } from '../payload/documents.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent,
  type SettledStep
} from '../session/index.ts';
import type { SaveEnvironment, SaveSnapshot } from '../session/save.ts';
import {
  bensonPacing,
  flightModel,
  loadSettings,
  type Settings
} from '../settings/index.ts';
import type { TalkScript } from '../talk/host.ts';
import { TALK_SCRIPTS } from '../talk/scripts.ts';
import { TextTable } from '../text/index.ts';
import { World } from '../world/index.ts';

export interface Walkabout {
  /// What a new game's Talk Scripts settled as they began, to present.
  readonly opening?: SettledStep;
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
    message: { ...settings.message }
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
  const scripts = new BensonChannel(text, bensonPacing(settings));
  const flight = flightModel(
    settings.flight,
    bundle.flight,
    world.groundExtent
  );
  const content = sessionContent(world, bundle, flight);
  // The opening starts here even when the Arrival is about to present, so that a Save
  // taken during the opening restores a game with an opening to play. The Arrival holds it by
  // not advancing the session rather than by leaving it unstarted (ADR 0032). It is a Talk
  // Script (ADR 0080).
  const talk = talkScripts.length === 0 ? undefined : { scripts: talkScripts };
  if (restore !== undefined) {
    return {
      session: GameplaySession.restore(content, scripts, restore, talk),
      world
    };
  }
  if (talk === undefined) {
    return {
      session: new GameplaySession(content, openingPlayer(), scripts),
      world
    };
  }
  return { ...GameplaySession.newGame(content, scripts, talk), world };
};
