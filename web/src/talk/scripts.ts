import type { TalkScript } from './host.ts';
import deliveries from './scripts/deliveries.talk' with { type: 'text' };
import escape from './scripts/escape.talk' with { type: 'text' };
import opening from './scripts/opening.talk' with { type: 'text' };

/// The Talk Script that plays the opening, by name.
export const OPENING = 'opening';
/// The Talk Script that launches the Interstellar Ship, by name.
export const ESCAPE = 'escape';
/// The Talk Script that pays for deliveries, by name.
export const DELIVERIES = 'deliveries';

/// Every Talk Script the game loads, and the Benson Scripts each replaces.
export const TALK_SCRIPTS: readonly TalkScript[] = [
  { name: OPENING, replaces: [0], source: opening },
  { name: ESCAPE, replaces: [7], source: escape },
  {
    name: DELIVERIES,
    replaces: [3, 4, 5, 6, 9, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25],
    source: deliveries
  }
];
