import type { SolutionStep } from './ledger.ts';

/// The main route's step table (Novabomb on ICARUS): ST Format 14's opening up to the Eagle,
/// then ST Format 20's steps 2 to 8, cross-checked against ST Format 15.
///
/// Every step is a paraphrase with a citation; the solutions' own text stays out of the
/// repository. A target names an island by the area its workspace publishes and the cell as the
/// Cell Readout prints it, which is how the solutions write them (`07.08` is `07-08`).

const ERIS = 'ERIS';
const CAPITAL = 'CAPITAL CITY';

/// Chapter 1: from the start on foot at Capital Spaceport to EAGLE NINE S E in the air.
export const CHAPTER_1 = {
  backToLimo: {
    cite: { section: '¶3', solution: 'stf14' },
    id: '1.9',
    proves: 'the player is aboard V.I.P. LIMO again',
    says: 'Get back in the car.',
    target: { body: ERIS, cell: '09-08', island: CAPITAL }
  },
  boardEagle: {
    cite: { section: '¶4', solution: 'stf14' },
    id: '1.10',
    proves: 'the player is aboard EAGLE NINE S E',
    says: 'The craft is at the Moorby School of Flying: get in.',
    target: { body: ERIS, cell: '09-09', island: CAPITAL }
  },
  boardLimo: {
    cite: { section: '¶2', solution: 'stf14' },
    id: '1.2',
    proves: 'the player is aboard V.I.P. LIMO',
    says: 'Get into the limo.',
    target: { body: ERIS, cell: '07-08', island: CAPITAL }
  },
  driveToStateOffice: {
    cite: { section: '¶2', solution: 'stf14' },
    id: '1.3',
    proves: 'the limo stops at the State Office and the player leaves it there',
    says: 'Drive to the first building you find, the State Office.',
    target: { body: ERIS, cell: '09-08', island: CAPITAL }
  },
  eagleKey: {
    cite: { section: '¶3', solution: 'stf14' },
    id: '1.8',
    proves: 'the inventory head reads KEY - EAGLE 9SE',
    says: 'Fetch the spacecraft key (the President says: the basement).',
    target: { body: ERIS, cell: '09-08', floor: 10, island: CAPITAL }
  },
  haggle: {
    cite: { section: '¶3', solution: 'stf14' },
    id: '1.7',
    proves:
      'refusing raises the offer to 20 million, accepting it is acknowledged, and the President says where the spacecraft key is',
    says: 'Haggle with the President for the bounty until she offers 20 million, then accept; she says where the spacecraft key is.',
    target: { body: ERIS, cell: '09-08', floor: 2, island: CAPITAL }
  },
  liftToPresident: {
    cite: { section: '¶3', solution: 'stf14' },
    id: '1.6',
    proves: 'the lift arrives at Floor 2',
    says: 'Take the lift to the President’s office.',
    target: { body: ERIS, cell: '09-08', floor: 2, island: CAPITAL }
  },
  limoKey: {
    cite: { section: '¶2', solution: 'stf14' },
    id: '1.1',
    proves: 'the inventory head reads KEY- V.I.P. LIMO',
    says: 'At Capital Spaceport, go into the building and take the key to the VIP limo.',
    target: { body: ERIS, cell: '07-08', island: CAPITAL }
  },
  readFile: {
    cite: { section: '¶3', solution: 'stf14' },
    id: '1.5',
    proves: 'the DAMOCLES FILE is carried and a Read shows a document',
    says: 'Take the Damocles file and read it.',
    target: { body: ERIS, cell: '09-08', floor: 0, island: CAPITAL }
  },
  takeOff: {
    cite: { section: '¶4', solution: 'stf14' },
    id: '1.11',
    proves: 'EAGLE NINE S E is airborne and the altitude window counts',
    says: 'Take off.',
    target: { body: ERIS, island: CAPITAL }
  },
  welcome: {
    cite: { section: '¶3', solution: 'stf14' },
    id: '1.4',
    proves: 'the State President’s welcome reaches the Damocles Display',
    says: 'Go inside the State Office.',
    target: { body: ERIS, cell: '09-08', floor: 0, island: CAPITAL }
  }
} as const satisfies Record<string, SolutionStep>;

const KEY_WEST = 'KEY WEST';
const SNOW_ISLAND = 'SNOW ISLAND';
const METIS = 'METIS';
const METIS_MOONBASE = 'METIS MOONBASE';

/// Chapter 2: from EAGLE NINE S E at Moorby to the fourth NOVA TRIGGER on Metis, after ST Format
/// 20 steps 1 to 4, with ST Format 14 for where the ANTIGRAV is.
export const CHAPTER_2 = {
  antigrav: {
    cite: { section: 'step 1; stf14 ¶5', solution: 'stf20' },
    id: '2.1',
    proves: 'the inventory head reads ANTIGRAV',
    says: 'Fly to Key West 07.07 and take the Antigrav from the basement. ST Format 20 gives the square as 09.02; its own excursion (f), ST Format 14 and ST Format 15 all give Key West 07.07, which this step follows.',
    target: { body: ERIS, cell: '07-07', floor: 10, island: KEY_WEST }
  },
  cupboard: {
    cite: { section: 'step 2', solution: 'stf20' },
    id: '2.2',
    proves:
      'the CUPBOARD is NOVA TRIGGER 2, switches ON from the centre box, and is dropped switched on',
    says: 'Fly to Snow Island 03.00, find NOVA TRIGGER 2 (the cupboard), take it, turn it on and drop it.',
    target: { body: ERIS, cell: '03-00', island: SNOW_ISLAND }
  },
  liftTheEagle: {
    cite: { section: 'step 3', solution: 'stf20' },
    id: '2.3',
    proves: 'EAGLE NINE S E is carried, and the player reaches Floor 10',
    says: 'Fly to Capital City 11.08, pick up the Eagle, take the lift down to the basement.',
    target: { body: ERIS, cell: '11-08', floor: 10, island: CAPITAL }
  },
  transporter: {
    cite: { section: 'step 4', solution: 'stf20' },
    id: '2.4',
    proves:
      'walking into the basement transporter carries the player to its first hop, GAEA at CHALDEA METROPOLIS 08-08 (docs/research/damocles-arrival-routes.md, "Driven live")',
    says: 'Walk into the transporters by their arrowed sides until you come out at the Metis moon base, 00.06. This step proves the first hop only.',
    target: { body: 'GAEA', cell: '08-08', island: 'CHALDEA METROPOLIS' }
  },
  washbasin: {
    cite: { section: 'step 4', solution: 'stf20' },
    id: '2.5',
    proves:
      'the ring reaches METIS MOONBASE 00-06, and the WASHBASIN is NOVA TRIGGER 4, switches ON, and is dropped switched on',
    says: 'Ride on round the ring to Metis 00.06. Take the transporter, go outside, drop the Eagle and fly to 05.06; take the Eagle again, go in, walk to the table to open a secret door, go through, drop the transporter and take NOVA TRIGGER 4 (the washbasin); turn it on and drop it.',
    target: { body: METIS, cell: '05-06', island: METIS_MOONBASE }
  }
} as const satisfies Record<string, SolutionStep>;

/// The seam probe: ST Format 20's first leg flown the short way, across the wrap of Eris's
/// surface, as a player heading straight for Key West would.
export const CHAPTER_2_SEAM = {
  keyWest: {
    cite: { section: 'step 1; stf14 ¶5', solution: 'stf20' },
    id: '2s.1',
    proves:
      'after the shortest flight from Moorby, Key West’s NEWTON LTD RESEARCH is bound and drawn at its door',
    says: 'Fly from the Moorby School of Flying to Key West 07.07, the short way.',
    target: { body: ERIS, cell: '07-07', island: KEY_WEST }
  }
} as const satisfies Record<string, SolutionStep>;
