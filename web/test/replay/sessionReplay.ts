import {
  parseBensonKey,
  type BensonKey
} from '../../src/benson/index.ts';
import type { Intent } from '../../src/gameCore/index.ts';
import type { Outcome } from '../../src/interaction/index.ts';
import {
  GameplaySession,
  type Occupancy,
  type PresentationEvent,
  type SessionSnapshot
} from '../../src/session/index.ts';
import type { Location, Residence } from '../../src/world/index.ts';
import type { TraceObject, TraceValue } from '../../src/trace/index.ts';
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
      return { room: residence.id };
    case 'carried':
      return 'carried';
    case 'gone':
      return 'gone';
  }
};

export const outcomeValue = (outcome: Outcome): TraceValue => {
  switch (outcome.kind) {
    case 'took':
      return { took: outcome.slot };
    case 'boarded':
      return { boarded: outcome.slot };
    case 'nothingInReach':
      return 'nothingInReach';
    case 'fixedInPlace':
      return { fixedInPlace: outcome.slot };
    case 'tooHeavy':
      return { tooHeavy: outcome.slot };
    case 'handsFull':
      return 'handsFull';
    case 'notACraft':
      return { notACraft: outcome.slot };
    case 'alreadyAboard':
      return 'alreadyAboard';
  }
};

export const eventValue = (event: PresentationEvent): TraceValue => {
  if (event === 'tone') {
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
  return { worldFlipped: event.worldFlipped };
};

export const snapshotValue = (
  snapshot: SessionSnapshot,
  game: GameplaySession['game']
): TraceValue => {
  const residence: TraceObject = {};
  for (const [slot, where] of snapshot.residence) {
    residence[String(slot)] = residenceValue(where);
  }
  return {
    core: {
      poweramp: game.poweramp,
      stepInterlock: game.stepInterlock,
      touchdown: game.touchdown ?? null,
      transitionCooldown: game.transitionCooldown,
      wallContact: game.wallContact,
      wallContactLatch: game.wallContactLatch
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
    message: snapshot.message,
    mode: snapshot.mode,
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

export const intentFromRecord = (input: TraceObject): Intent => ({
  pitch: input['pitch'] as number,
  running: input['running'] as boolean,
  turn: input['turn'] as number,
  walk: input['walk'] as number
});

export const keyFromCommand = (value: TraceValue): BensonKey | undefined => {
  if (value === 'any' || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return parseBensonKey(value) ?? parseBensonKey(`key${value.toUpperCase()}`);
};
