/// The frozen interpreter adapter for the opening-loop browser Replay Gate.
/// Ordinary browser play imports only src/shell/session.ts.
import type { Bundle } from '../../src/payload/documents.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../../src/session/index.ts';
import type { SaveSnapshot } from '../../src/session/save.ts';
import {
  bensonTunables,
  flightModel,
  type Settings
} from '../../src/settings/index.ts';
import { TextTable } from '../../src/text/index.ts';
import { World } from '../../src/world/index.ts';
import type { BensonDocument } from './documents.ts';
import { BensonOracle, BensonProgram, DEFAULT_SESSION_SEED } from './index.ts';

export const createOracleWalkabout = (
  bundle: Bundle,
  settings: Settings,
  document: BensonDocument,
  saved?: SaveSnapshot
) => {
  if (bundle.flight === undefined || bundle.text === undefined) {
    throw new Error('incomplete oracle payload');
  }
  const world = new World(bundle);
  const program = BensonProgram.fromDocument(document);
  const scripts = new BensonOracle(
    program,
    new TextTable(bundle.text),
    bensonTunables(settings, program.framesPerTick),
    DEFAULT_SESSION_SEED,
    'legacyOracle'
  );
  const flight = {
    ...flightModel(settings.flight, bundle.flight, world.groundExtent),
    headingConvention: 'traceOracle' as const
  };
  const content = sessionContent(world, bundle, flight);
  const session =
    saved === undefined
      ? new GameplaySession(
          content,
          { ...openingPlayer(), heading: 0 },
          scripts
        )
      : GameplaySession.restore(content, scripts, saved);
  if (saved === undefined && !session.start(0)) {
    throw new Error('oracle opening did not start');
  }
  return { session, world };
};
