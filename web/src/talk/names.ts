import type { Location } from '../world/index.ts';

/// The names Talk Scripts use for the world's subjects, and the payload slots
/// they stand for: the one adapter table ADR 0080 asks for. World Events and
/// `world` queries speak in these names, so a Talk Script never sees a slot.
///
/// Only the subjects a Talk Script names are here; anything else is reported
/// as `room 17` or `object 40`.

const ROOMS: Readonly<Record<number, string>> = {
  0: 'surface',
  102: 'mechanoid briefing',
  16: 'ship rental',
  41: 'palyar briefing',
  5: 'hangar'
};

const OBJECTS: Readonly<Record<number, string>> = {
  1: 'dart',
  12: 'captured mechanoid',
  25: 'novadrive',
  30: 'antenna',
  46: 'pass',
  7: 'ship'
};

/// A Site's low id as the Site Ledger keeps it. The generic installations of
/// each faction share one; every named Site has its own.
const SITES: Readonly<Record<number, string>> = {
  2: 'installation',
  3: 'installation'
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
export const locationName = (location: Location): string =>
  roomName(location.kind === 'room' ? location.id : 0);
export const objectName = (slot: number): string =>
  nameOf(OBJECTS, 'object', slot);
export const objectSlot = (name: string): number =>
  idOf(OBJECTS, 'object', name);
export const siteName = (lowId: number): string => nameOf(SITES, 'site', lowId);
