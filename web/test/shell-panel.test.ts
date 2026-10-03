import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { GameplaySession, type SessionSnapshot } from '../src/session/index.ts';
import {
  carriedNames,
  gridReference,
  objectNamesOf,
  panelViewModel,
  type PanelContext
} from '../src/shell/panel.ts';
import { emptyContent } from './fixtures/save.ts';

const CELL = 65_536;

const context = (overrides: Partial<PanelContext> = {}): PanelContext => ({
  cellSize: CELL,
  clock: '09-00-00',
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
  test('hands the exact fixed-cell Benson Display to both renditions', () => {
    const displayText = ' '.repeat(7) + 'BENSON' + ' '.repeat(10);
    const model = panelViewModel(
      snapshotOf({
        bensonColour: 6,
        bensonMessage: {
          displayText,
          occurrence: {},
          reveal: { complete: false, progress: 6 }
        }
      }),
      context()
    );

    expect(model.message).toBe(displayText);
    expect(model.message).toHaveLength(23);
    expect(model.messageColour).toBe(6);
  });

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

  test('shows altitude in 256-unit bands without exposing viewpoint offsets', () => {
    const onFoot = panelViewModel(
      snapshotOf({
        player: playerState({ position: { x: 0, y: 128, z: 0 }, speed: 42 })
      }),
      context()
    );
    expect(onFoot.altitude).toBe('00000');
    expect(onFoot.speed).toBe('+0042');

    const groundedCraft = panelViewModel(
      snapshotOf({
        occupancy: { kind: 'aboard', slot: 1 },
        player: playerState({ position: { x: 0, y: 63, z: 0 }, speed: -7 })
      }),
      context()
    );
    expect(groundedCraft.altitude).toBe('00000');
    // A sign, not a minus digit: the cells hold five characters either way.
    expect(groundedCraft.speed).toBe('-0007');
    expect(groundedCraft.speed).toHaveLength(5);

    const airborneCraft = panelViewModel(
      snapshotOf({
        mode: 'flying',
        occupancy: { kind: 'aboard', slot: 1 },
        player: playerState({ position: { x: 0, y: 320, z: 0 } })
      }),
      context()
    );
    expect(airborneCraft.altitude).toBe('00001');
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

  test('presents the clock supplied by the Browser Shell', () => {
    expect(panelViewModel(snapshotOf(), context()).clock).toBe('09-00-00');
    expect(
      panelViewModel(snapshotOf(), context({ clock: '17-42-09' })).clock
    ).toBe('17-42-09');
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

  test('prints cash as the Damocles readout does, in thousands to the cent', () => {
    const model = panelViewModel(snapshotOf({ credits: 512 }), context());

    expect(model.cash).toBe('000,000,512.00');
    expect(
      panelViewModel(snapshotOf({ credits: 10_555 }), context()).cash
    ).toBe('000,010,555.00');
  });

  test('lights the altitude lamp aboard and the ground lamp only in flight', () => {
    const walking = panelViewModel(
      snapshotOf({
        player: playerState({ position: { x: 0, y: 0, z: 0 }, speed: 3 })
      }),
      context(),
      true
    );
    expect(walking.runLamp).toBeTrue();
    expect(walking.altitudeLamp).toBeFalse();
    expect(walking.groundLamp).toBeFalse();

    const flyingLow = panelViewModel(
      snapshotOf({
        mode: 'flying',
        occupancy: { kind: 'aboard', slot: 2 },
        player: playerState({ position: { x: 0, y: 12, z: 0 }, speed: 40 })
      }),
      context(),
      true
    );
    expect(flyingLow.groundLamp).toBeTrue();
    expect(flyingLow.altitudeLamp).toBeTrue();
    // Aboard a craft the run toggle moves nothing, so the lamp stays dark.
    expect(flyingLow.runLamp).toBeFalse();
  });

  test('the run lamp follows the run toggle rather than moving', () => {
    const moving = snapshotOf({
      player: playerState({ position: { x: 0, y: 0, z: 0 }, speed: 80 })
    });

    expect(panelViewModel(moving, context()).runLamp).toBeFalse();
    expect(panelViewModel(moving, context(), true).runLamp).toBeTrue();
    expect(panelViewModel(snapshotOf(), context(), true).runLamp).toBeTrue();
  });

  test('keeps the attack lamp dark, having nothing on Targ to report', () => {
    expect(panelViewModel(snapshotOf(), context()).attackLamp).toBeFalse();
  });

  test('divides the surface by the world grid it was given', () => {
    expect(gridReference(0, 0, CELL)).toBe('00-00');
    expect(gridReference(3.9 * CELL, 11.2 * CELL, CELL)).toBe('03-11');
    expect(gridReference(34.9 * CELL, 11.2 * CELL, CELL)).toBe('34-11');
    expect(gridReference(99.9 * CELL, 99.9 * CELL, CELL)).toBe('99-99');
    expect(gridReference(100 * CELL, 136 * CELL, CELL)).toBe('**-**');
  });

  test('names objects by slot, uppercased for the readout', () => {
    expect(objectNamesOf([{ id: 'fuel-pod', slot: 2 }]).get(2)).toBe(
      'FUEL-POD'
    );
  });
});
