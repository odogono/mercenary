import { BensonProgram, BensonSession } from '../benson/index.ts';
import type { Bundle } from '../payload/documents.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../session/index.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings,
  type Settings
} from '../settings/index.ts';
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

/// Assemble the one live opening loop the Browser Shell presents.
///
/// The payload schema permits several documents to be absent for research and inspection
/// tools. The walkabout does not: without any one of these it would load successfully into a
/// surface whose advertised controls or opening script could not work.
export const createWalkabout = (
  bundle: Bundle,
  settings: Settings
): Walkabout => {
  if (bundle.flight === undefined) {
    throw new Error('flight.json is required by the browser walkabout');
  }
  if (bundle.text === undefined) {
    throw new Error('text.json is required by the browser walkabout');
  }
  if (bundle.benson === undefined) {
    throw new Error('benson.json is required by the browser walkabout');
  }
  if (bundle.interaction === undefined) {
    throw new Error('interaction.json is required by the browser walkabout');
  }

  const world = new World(bundle);
  const program = BensonProgram.fromDocument(bundle.benson);
  const text = new TextTable(bundle.text);
  const scripts = new BensonSession(
    program,
    text,
    bensonTunables(settings, program.framesPerTick)
  );
  const flight = flightModel(
    settings.flight,
    bundle.flight,
    world.groundExtent
  );
  const session = new GameplaySession(
    sessionContent(world, bundle, flight),
    openingPlayer(),
    scripts
  );
  if (!session.start(0)) {
    throw new Error('the opening Benson Script could not start');
  }
  return { session, world };
};
