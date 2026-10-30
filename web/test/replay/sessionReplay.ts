import {
  type Occupancy,
  type PresentationEvent,
  type SessionSnapshot
} from '../../src/session/index.ts';
import type { TraceObject, TraceValue } from '../../src/trace/index.ts';
import type { Location, Residence } from '../../src/world/index.ts';
import { effectValue } from './bensonReplay.ts';

export const locationValue = (location: Location): TraceValue =>
  location.kind === 'surface' ? 'surface' : { room: location.id };

export const occupancyValue = (occupancy: Occupancy): TraceValue =>
  occupancy.kind === 'onFoot' ? 'onFoot' : { craft: occupancy.slot };

export const residenceValue = (residence: Residence): TraceValue => {
  switch (residence.kind) {
    case 'surface':
      return residence.at === undefined
        ? 'surface'
        : {
            surface: {
              x: residence.at.x,
              y: residence.at.y,
              z: residence.at.z
            }
          };
    case 'room':
      return residence.at === undefined
        ? { room: residence.id }
        : {
            room: {
              id: residence.id,
              x: residence.at.x,
              y: residence.at.y,
              z: residence.at.z
            }
          };
    case 'carried':
      return 'carried';
    case 'gone':
      return 'gone';
  }
};

export const eventValue = (event: PresentationEvent): TraceValue => {
  if (event === 'tone' || 'lift' in event) {
    return 'tone';
  }
  if ('script' in event) {
    return { script: effectValue(event.script) };
  }
  if ('touchdown' in event) {
    return { touchdown: event.touchdown };
  }
  if ('arrived' in event) {
    return { arrived: locationValue(event.arrived) };
  }
  if ('wall' in event) {
    return { wall: { sound: event.wall.sound } };
  }
  if ('fire' in event) {
    return { fire: { sound: event.fire.sound } };
  }
  if ('impact' in event) {
    return { impact: { sound: event.impact.sound } };
  }
  return { worldFlipped: event.worldFlipped };
};

export const snapshotValue = (snapshot: SessionSnapshot): TraceValue => {
  const residence: TraceObject = {};
  for (const [slot, where] of snapshot.residence) {
    residence[String(slot)] = residenceValue(where);
  }
  return {
    carriedStack: [...snapshot.carriedStack],
    core: {
      poweramp: snapshot.core.poweramp,
      stepInterlock: snapshot.core.stepInterlock,
      touchdown: snapshot.core.touchdown ?? null,
      transitionCooldown: snapshot.core.transitionCooldown,
      wallContact: snapshot.core.wallContact,
      wallContactLatch: snapshot.core.wallContactLatch
    },
    credits: snapshot.credits,
    indoor:
      snapshot.indoor === undefined
        ? null
        : {
            background: snapshot.indoor.background,
            dark: snapshot.indoor.dark,
            foreground: snapshot.indoor.foreground,
            lineColour: snapshot.indoor.lineColour
          },
    isScriptRunning: snapshot.isScriptRunning,
    location: locationValue(snapshot.location),
    message: snapshot.bensonMessage?.displayText ?? '',
    mode: snapshot.mode,
    objectFlags: Object.fromEntries(snapshot.objectFlags),
    occupancy: occupancyValue(snapshot.occupancy),
    player: {
      heading: snapshot.player.heading,
      pitch: snapshot.player.pitch,
      position: { ...snapshot.player.position },
      roll: snapshot.player.roll,
      speed: snapshot.player.speed,
      yawVelocity: snapshot.player.yawVelocity
    },
    residence,
    throttle: snapshot.throttle,
    throttleNotch: snapshot.throttleNotch,
    worldFlipped: snapshot.worldFlipped
  };
};
