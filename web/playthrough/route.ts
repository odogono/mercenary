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
