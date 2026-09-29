import type { AtlasDestination } from '../damocles/session.ts';

/// A tab-local handoff, never a second owner of play. URLs carry an opaque, one-use token;
/// sharing a pin URL only shares a position and cannot issue a gameplay action.
interface HandoffStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface AtlasPlayer extends AtlasDestination {
  readonly destroyedBodies?: readonly string[];
  readonly heading?: number;
}

const REQUEST = 'mercenary.damocles.atlas-request';
const PLAYER = 'mercenary.damocles.atlas-player';

const destination = (value: unknown): AtlasDestination | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const item = value as Record<string, unknown>;
  return typeof item['bodyId'] === 'string' &&
    typeof item['x'] === 'number' &&
    Number.isFinite(item['x']) &&
    typeof item['z'] === 'number' &&
    Number.isFinite(item['z'])
    ? { bodyId: item['bodyId'], x: item['x'], z: item['z'] }
    : null;
};

export const createAtlasHandoff = (storage: HandoffStorage | undefined) => {
  const required = (): HandoffStorage => {
    if (!storage) {
      throw new Error('Atlas travel requires browser session storage.');
    }
    return storage;
  };
  const read = (key: string): unknown => {
    try {
      return JSON.parse(storage?.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  };
  const peek = (token: string): AtlasDestination | null => {
    const value = read(REQUEST) as { target?: unknown; token?: unknown } | null;
    return value?.token === token ? destination(value.target) : null;
  };
  return {
    clearPlayer: () => storage?.removeItem(PLAYER),
    consume: (token: string): AtlasDestination | null => {
      const target = peek(token);
      if (target) {
        required().removeItem(REQUEST);
      }
      return target;
    },
    peek,
    player: (): AtlasPlayer | null => {
      const value = read(PLAYER);
      const point = destination(value);
      const heading = (value as { heading?: unknown } | null)?.heading;
      const destroyedBodies = (value as { destroyedBodies?: unknown } | null)
        ?.destroyedBodies;
      const destroyed =
        Array.isArray(destroyedBodies) &&
        destroyedBodies.every(
          id => typeof id === 'string' && /^body-(?:\d|[12]\d)$/.test(id)
        )
          ? (destroyedBodies as string[])
          : [];
      const endgame =
        destroyedBodies === undefined ? {} : { destroyedBodies: destroyed };
      return point && typeof heading === 'number' && Number.isFinite(heading)
        ? { ...point, ...endgame, heading }
        : point === null
          ? null
          : { ...point, ...endgame };
    },
    rememberPlayer: (player: AtlasPlayer): void =>
      required().setItem(PLAYER, JSON.stringify(player)),
    request: (target: AtlasDestination): string => {
      const token = crypto.randomUUID();
      required().setItem(REQUEST, JSON.stringify({ target, token }));
      return token;
    }
  };
};

export const browserAtlasHandoff = () => {
  let storage: Storage | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = undefined;
  }
  return createAtlasHandoff(storage);
};
