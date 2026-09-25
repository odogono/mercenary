import { expect, test } from 'bun:test';

import { atlasHref, readAtlasState } from '../src/atlas/state.ts';
import { createAtlasHandoff } from '../src/atlas/travel.ts';

test('a pin survives URL round trips without rounding fractional coordinates', () => {
  const pin = { bodyId: 'eris', x: 2048.123_456_78, z: 2047.987_654_32 };
  const state = { level: 'system' as const, pin, view: null };
  expect(
    readAtlasState(new URL(atlasHref(state), 'http://localhost').search, [
      'eris'
    ]).pin
  ).toEqual(pin);
  expect(
    readAtlasState('?pinBody=eris&pinX=NaN&pinZ=0', ['eris']).pin
  ).toBeUndefined();
});

test('travel requests are scoped to their token and consumed once', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
  const handoff = createAtlasHandoff(storage);
  const target = { bodyId: 'body-11', x: 2048.123, z: 2047.456 };
  const token = handoff.request(target);
  expect(handoff.peek('different')).toBeNull();
  expect(handoff.peek(token)).toEqual(target);
  expect(handoff.consume(token)).toEqual(target);
  expect(handoff.consume(token)).toBeNull();
});

test('unavailable handoff storage refuses instead of navigating without a request', () => {
  const handoff = createAtlasHandoff(undefined);
  expect(() => handoff.request({ bodyId: 'body-11', x: 0, z: 0 })).toThrow();
});

test('player handoff preserves facing separately from travel destinations', () => {
  const values = new Map<string, string>();
  const handoff = createAtlasHandoff({
    getItem: key => values.get(key) ?? null,
    removeItem: key => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  });
  const player = { bodyId: 'eris', heading: Math.PI / 2, x: 12, z: 34 };
  handoff.rememberPlayer(player);
  expect(handoff.player()).toEqual(player);
});
