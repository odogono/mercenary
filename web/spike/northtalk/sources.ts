import { readFileSync } from 'node:fs';

import { BensonHostState } from '../../src/benson/host.ts';
import { BensonProgram } from '../../src/benson/program.ts';
import { loadPayload } from '../../test/replay/artifacts.ts';
import { type TalkScriptName } from './host.ts';

const read = (name: string) =>
  readFileSync(new URL(`scripts/${name}.talk`, import.meta.url), 'utf8');

export const talkSources: Readonly<Record<TalkScriptName, string>> = {
  escape: read('escape'),
  opening: read('opening')
};

/// The host state a new game starts from, seeded from the Data Payload as Benson's is.
export const seededHost = async (): Promise<BensonHostState> => {
  const bundle = await loadPayload();
  return BensonHostState.seeding(BensonProgram.fromDocument(bundle.benson!));
};
