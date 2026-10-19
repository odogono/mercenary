import type { Location } from '../world/index.ts';

/// The names Talk Scripts use for the world's subjects, and the payload slots
/// they stand for: the one adapter table ADR 0080 asks for. World Events and
/// `world` queries speak in these names, so a Talk Script never sees a slot.
///
/// Only the subjects a Talk Script names are here; anything else is reported
/// as `room 17` or `object 40`.

const ROOMS: Readonly<Record<number, string>> = {
  0: 'surface',
  1: 'red hangar',
  102: 'mechanoid briefing',
  16: 'ship rental',
  41: 'palyar briefing',
  5: 'hangar',
  80: 'pass store',
  // Where Benson speaks on arrival.
  159: 'bank',
  42: 'bank',
  79: 'bank',
  81: 'prison',
  // Where the factions take deliveries.
  136: 'engine room',
  144: 'laboratory',
  146: 'armoury',
  147: 'stores',
  154: 'interview room',
  155: 'conference room',
  162: 'exchequer',
  163: 'kitchen',
  165: 'infirmary',
  170: 'control room',
  173: 'power room',
  18: 'mechanoid laboratory',
  34: 'mechanoid armoury',
  48: 'mechanoid stores',
  50: 'mechanoid power room',
  70: 'mechanoid fuel stores'
};

const OBJECTS: Readonly<Record<number, string>> = {
  0: 'brother-in-law ship',
  1: 'dart',
  12: 'captured mechanoid',
  25: 'novadrive',
  30: 'antenna',
  46: 'pass',
  7: 'ship',
  // What the factions pay for.
  29: 'neutron fuel',
  31: 'energy crystal',
  34: 'large box',
  35: 'useful armament',
  38: 'gold',
  41: 'medical supplies',
  42: 'essential supply',
  43: 'winchester',
  44: 'catering provisions',
  45: 'databank'
};

/// A Site's low id as the Site Ledger keeps it. The generic installations of
/// each faction share one; every named Site has its own.
const SITES: Readonly<Record<number, string>> = {
  10: 'tyler point',
  11: 'bosher stadium',
  12: 'jordan airport',
  13: 'vector henge',
  14: 'brother-in-law house',
  15: 'mechanoid fort',
  16: 'coach and horses',
  17: 'traitor site',
  18: 'good show site',
  2: 'installation',
  3: 'installation',
  4: 'novabill',
  5: 'authors advert',
  6: 'sabins cube',
  7: 'walton monument',
  8: 'st stallards',
  9: 'moorby arch'
};

const nameOf = (
  table: Readonly<Record<number, string>>,
  kind: string,
  id: number
): string => table[id] ?? `${kind} ${id}`;

const idOf = (
  table: Readonly<Record<number, string>>,
  kind: string,
  name: string
): number => {
  for (const [id, entry] of Object.entries(table)) {
    if (entry === name) {
      return Number(id);
    }
  }
  const match = new RegExp(String.raw`^${kind} (\d+)$`).exec(name);
  if (match?.[1] === undefined) {
    throw new Error(`no ${kind} is called ${name}`);
  }
  return Number(match[1]);
};

export const roomName = (room: number): string => nameOf(ROOMS, 'room', room);
export const roomId = (name: string): number => idOf(ROOMS, 'room', name);
export const locationName = (location: Location): string =>
  roomName(location.kind === 'room' ? location.id : 0);
export const objectName = (slot: number): string =>
  nameOf(OBJECTS, 'object', slot);
export const objectSlot = (name: string): number =>
  idOf(OBJECTS, 'object', name);
export const siteName = (lowId: number): string => nameOf(SITES, 'site', lowId);
