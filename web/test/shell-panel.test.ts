import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { GameplaySession, type SessionSnapshot } from '../src/session/index.ts';
import {
  carriedNames,
  compassDegrees,
  gridReference,
  objectNamesOf,
  panelViewModel,
  timeOfDay,
  type PanelContext
} from '../src/shell/panel.ts';
import { emptyContent } from './fixtures/save.ts';

const CELL = 65_536;

const context = (overrides: Partial<PanelContext> = {}): PanelContext => ({
  cellSize: CELL,
  dayLengthMinutes: 24,
  objectNames: new Map(),
  ...overrides
});

const snapshotOf = (
  overrides: Partial<SessionSnapshot> = {}
): SessionSnapshot => {
  const session = new GameplaySession(
    emptyContent(),
    playerState({ position: { x: 8.5 * CELL, y: 0, z: 8.5 * CELL } }),
    undefined
  );
  return { ...session.snapshot, ...overrides };
};

describe('the Benson Panel view model', () => {
  test('reads the surface as a two-digit grid reference', () => {
    const model = panelViewModel(snapshotOf(), context());

    expect(model.locationLabel).toBe('08-08');
    expect(model.locationName).toBe('TARG');
  });

  test('names the Room it is in instead of the grid', () => {
    const model = panelViewModel(
      snapshotOf({ location: { id: 7, kind: 'room' } }),
      context()
    );

    expect(model.locationLabel).toBe('RM 07');
    expect(model.locationName).toBe('ROOM 07');
  });

  test('pads altitude and signs speed as the panel cells expect', () => {
    const forward = panelViewModel(
      snapshotOf({
        player: playerState({ position: { x: 0, y: 128, z: 0 }, speed: 42 })
      }),
      context()
    );
    expect(forward.altitude).toBe('00128');
    expect(forward.speed).toBe('+0042');

    const reverse = panelViewModel(
      snapshotOf({
        player: playerState({ position: { x: 0, y: 0, z: 0 }, speed: -7 })
      }),
      context()
    );
    // A sign, not a minus digit: the cells hold five characters either way.
    expect(reverse.speed).toBe('-0007');
    expect(reverse.speed).toHaveLength(5);
  });

  test('wraps the compass into one turn, whichever way the player faced', () => {
    expect(compassDegrees(0)).toBe(0);
    expect(compassDegrees(Math.PI)).toBeCloseTo(180);
    // Headings accumulate in both directions, but a compass only reads 0-360.
    expect(compassDegrees(-Math.PI / 2)).toBeCloseTo(270);
    expect(compassDegrees(3 * Math.PI)).toBeCloseTo(180);
  });

  test('reports elevation in degrees, signed nose up', () => {
    const model = panelViewModel(
      snapshotOf({
        player: playerState({
          pitch: Math.PI / 18,
          position: { x: 0, y: 0, z: 0 }
        })
      }),
      context()
    );

    expect(model.elevationDegrees).toBeCloseTo(10);
  });

  test('turns session time into a time of day that wraps', () => {
    expect(timeOfDay(0, 24)).toBe('00-00-00');
    // Half a day in, whatever the day is worth in real minutes.
    expect(timeOfDay(12 * 60, 24)).toBe('12-00-00');
    expect(timeOfDay(24 * 60, 24)).toBe('00-00-00');
    expect(timeOfDay(24 * 60 + 6 * 60, 24)).toBe('06-00-00');
  });

  test('shows the last thing picked up, or an empty window', () => {
    const names = objectNamesOf([
      { id: 'key', slot: 3 },
      { id: 'photon-cannon', slot: 9 }
    ]);

    expect(
      panelViewModel(snapshotOf(), context({ objectNames: names })).inventory
    ).toBe('EMPTY');

    const carrying = snapshotOf({
      carriedStack: [9, 3],
      residence: new Map([
        [3, { kind: 'carried' }],
        [9, { kind: 'carried' }]
      ])
    });
    const model = panelViewModel(carrying, context({ objectNames: names }));
    expect(model.inventoryFill).toBe(2);
    expect(carriedNames(carrying, names)).toEqual(['PHOTON-CANNON', 'KEY']);
  });

  test('names an object the payload did not name, rather than showing nothing', () => {
    const carrying = snapshotOf({
      carriedStack: [5],
      residence: new Map([[5, { kind: 'carried' }]])
    });

    expect(carriedNames(carrying, new Map())).toEqual(['OBJECT 05']);
  });

  test('counts only what is carried as inventory', () => {
    const mixed = snapshotOf({
      carriedStack: [1],
      residence: new Map([
        [1, { kind: 'carried' }],
        [2, { id: 4, kind: 'room' }],
        [3, { kind: 'gone' }],
        [4, { kind: 'surface' }]
      ])
    });

    expect(panelViewModel(mixed, context()).inventoryFill).toBe(1);
  });

  test('pads cash to the width of the Damocles readout', () => {
    const model = panelViewModel(snapshotOf({ credits: 512 }), context());

    expect(model.cash).toBe('000000512');
  });

  test('lights the run lamp on foot and the ground lamp only in flight', () => {
    const walking = panelViewModel(
      snapshotOf({
        player: playerState({ position: { x: 0, y: 0, z: 0 }, speed: 3 })
      }),
      context()
    );
    expect(walking.runLamp).toBeTrue();
    expect(walking.groundLamp).toBeFalse();

    const flyingLow = panelViewModel(
      snapshotOf({
        mode: 'flying',
        occupancy: { kind: 'aboard', slot: 2 },
        player: playerState({ position: { x: 0, y: 12, z: 0 }, speed: 40 })
      }),
      context()
    );
    expect(flyingLow.groundLamp).toBeTrue();
    // Aboard a craft the player is not running.
    expect(flyingLow.runLamp).toBeFalse();
  });

  test('keeps the attack lamp dark, having nothing on Targ to report', () => {
    expect(panelViewModel(snapshotOf(), context()).attackLamp).toBeFalse();
  });

  test('divides the surface by the world grid it was given', () => {
    expect(gridReference(0, 0, CELL)).toBe('00-00');
    expect(gridReference(3.9 * CELL, 11.2 * CELL, CELL)).toBe('03-11');
  });

  test('names objects by slot, uppercased for the readout', () => {
    expect(objectNamesOf([{ id: 'fuel-pod', slot: 2 }]).get(2)).toBe(
      'FUEL-POD'
    );
  });
});
