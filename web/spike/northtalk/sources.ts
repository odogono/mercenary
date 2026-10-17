import { readFileSync } from 'node:fs';

const read = (name: string) =>
  readFileSync(new URL(`scripts/${name}.talk`, import.meta.url), 'utf8');

/// The Talk Scripts, loaded into one Group for the whole Gameplay Session.
export const talkScripts: Readonly<Record<string, string>> = {
  briefing: read('briefing'),
  escape: read('escape'),
  opening: read('opening'),
  reaction: read('reaction')
};

/// The Library every Talk Script may import.
export const talkLibrary = { name: 'benson', source: read('benson') };
