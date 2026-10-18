import type { TalkScript } from './host.ts';
import opening from './scripts/opening.talk' with { type: 'text' };

/// The Talk Script that plays the opening, by name.
export const OPENING = 'opening';

/// Every Talk Script the game loads, and the Benson Scripts each replaces.
export const TALK_SCRIPTS: readonly TalkScript[] = [
  { name: OPENING, replaces: [0], source: opening }
];
