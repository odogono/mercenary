import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { BensonChannel } from '../src/benson/index.ts';
import type { UndergroundLift } from '../src/payload/documents.ts';
import {
  GameplaySession,
  sessionContent,
  type PresentationEvent
} from '../src/session/index.ts';
import {
  advanceLiftJourney,
  liftCameraAltitude,
  startLiftJourney
} from '../src/session/liftJourney.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
import { panelViewModel } from '../src/shell/panel.ts';
import { TextTable } from '../src/text/index.ts';
import { World, type Residence } from '../src/world/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

/// Where two residences agree, to a float's rounding.
const expectSamePlace = (a: Residence, b: Residence): void => {
  expect(a.kind).toBe(b.kind);
  const at = 'at' in a ? a.at : undefined;
  const other = 'at' in b ? b.at : undefined;
  expect(at === undefined).toBe(other === undefined);
  if (at !== undefined && other !== undefined) {
    expect(at.x).toBeCloseTo(other.x, 3);
    expect(at.y).toBeCloseTo(other.y, 3);
    expect(at.z).toBeCloseTo(other.z, 3);
  }
};

const lift: UndergroundLift = {
  access: { passSlot: 46, refusalMessage: 57, restrictedRoom: 5 },
  altitudeWrap: 6,
  altitudeWrapSubtract: 7,
  ascending: { position: 66, sceneAt: 12, stage: 0, stopAt: 14 },
  cameraOffsets: { ascending: 38, descending: 6 },
  descending: { floor: 128, position: 131, sceneAt: 8, stage: 13 },
  framesPerSecond: 50,
  motionRates: [2, 4, ...Array(22).fill(8), 5, 3, 2, 1],
  pitchHighBytes: [
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    4,
    ...Array(12).fill(5),
    4,
    3,
    2,
    0
  ],
  positionWrap: 132,
  screen: {
    descendingInitialLineColour: 11,
    descendingInitialScreenColour: 0,
    indoorLineColours: [11, 0, 9, 0],
    outdoorLineColours: [6, 9, 4, 5, 2, 2, 8],
    rasterBase: 50,
    rasterLimit: 133
  },
  submergeAt: 8,
  submergeMiddle: 8,
  surfaceAt: 12,
  surfaceMiddle: 113,
  timing: [
    {
      down: { sceneAt: 193, stopAt: 340 },
      room: 1,
      up: { sceneAt: 206, stopAt: 338 }
    },
    {
      down: { sceneAt: 193, stopAt: 340 },
      room: 5,
      up: { sceneAt: 204, stopAt: 338 }
    }
  ]
};

describe('the Reference Lift Journey clock', () => {
  test('wraps the surface camera below ground before emerging', () => {
    const journey = {
      ...startLiftJourney('up', 1, lift),
      position: 0,
      stage: 12
    };
    expect(liftCameraAltitude(journey, lift)).toBe(-154);
    expect(
      liftCameraAltitude({ ...journey, position: 132, stage: 13 }, lift)
    ).toBe(87);
  });
  test('ascends through the surface scene and stops on captured Room-1 ticks 206 and 338', () => {
    let journey = startLiftJourney('up', 1, lift);
    journey = advanceLiftJourney(journey, 205 / 50, lift).journey!;
    expect(journey.scene).toBe('room');

    journey = advanceLiftJourney(journey, 1 / 50, lift).journey!;
    expect(journey.scene).toBe('surface');
    expect(journey.stage).toBe(12);

    const result = advanceLiftJourney(journey, 132 / 50, lift);
    expect(result.journey).toBeUndefined();
    expect(result.completed).toBeTrue();
  });

  test('descends through the room scene and reaches its floor on captured Room-1 ticks 193 and 340', () => {
    let journey = startLiftJourney('down', 1, lift);
    journey = advanceLiftJourney(journey, 192 / 50, lift).journey!;
    expect(journey.scene).toBe('surface');

    journey = advanceLiftJourney(journey, 1 / 50, lift).journey!;
    expect(journey.scene).toBe('room');
    expect(journey.stage).toBe(8);

    const result = advanceLiftJourney(journey, 147 / 50, lift);
    expect(result.journey).toBeUndefined();
    expect(result.completed).toBeTrue();
  });

  test('is deterministic across differently sized browser steps', () => {
    const once = advanceLiftJourney(startLiftJourney('down', 5, lift), 4, lift);
    let many = startLiftJourney('down', 5, lift);
    for (let frame = 0; frame < 80; frame += 1) {
      many = advanceLiftJourney(many, 1 / 20, lift).journey!;
    }
    const { elapsedSeconds, ...phase } = many;
    const { elapsedSeconds: onceSeconds, ...oncePhase } = once.journey!;
    expect(phase).toEqual(oncePhase);
    expect(elapsedSeconds).toBeCloseTo(onceSeconds, 9);
    expect(once.surfaceSeconds).toBeCloseTo(193 / 50);
  });

  test('accounts for only the visibly outdoor part of a crossing', () => {
    const down = advanceLiftJourney(startLiftJourney('down', 1, lift), 7, lift);
    const up = advanceLiftJourney(startLiftJourney('up', 1, lift), 7, lift);
    expect(down.surfaceSeconds).toBeCloseTo(193 / 50);
    expect(up.surfaceSeconds).toBeCloseTo(7 - 206 / 50);
  });

  test('derives the same fixed-point camera altitude as the native controller', () => {
    expect(liftCameraAltitude(startLiftJourney('up', 1, lift), lift)).toBe(158);
    const down = advanceLiftJourney(
      startLiftJourney('down', 1, lift),
      340 / 50,
      lift
    );
    expect(down.finalAltitude).toBe(128);
  });
});

const bundle = await loadPayload();
const world = new World(bundle);
const settings = loadSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
const content = sessionContent(
  world,
  bundle,
  flightModel(settings.flight, bundle.flight!, world.groundExtent)
);
const newSession = (): GameplaySession =>
  new GameplaySession(
    content,
    {
      heading: 0,
      pitch: 0,
      position: {
        x: 3 * 0x1_00_00 + 0x71_00,
        y: 128,
        z: 15 * 0x1_00_00 + 0x71_00
      },
      roll: 0,
      speed: 0,
      yawVelocity: 0
    },
    new BensonChannel(new TextTable(bundle.text!))
  );

const panel = (subject: GameplaySession) =>
  panelViewModel(subject.snapshot, {
    cellSize: content.cellSize,
    clock: '',
    objectNames: new Map()
  }).altitude;

describe('Lift Journeys in a Gameplay Session', () => {
  test('gives arrival narration only the time after arrival across frame sizes', () => {
    const once = newSession();
    const many = newSession();
    for (const session of [once, many]) {
      session.carry(46);
      session.rideLift();
    }
    const events = once.advance(7).events;
    const steppedEvents: PresentationEvent[] = [];
    for (let frame = 0; frame < 350; frame += 1) {
      steppedEvents.push(...many.advance(0.02).events);
    }
    expect(once.captureSaveSnapshot().benson).toEqual(
      many.captureSaveSnapshot().benson
    );
    expect(events).toEqual(steppedEvents);
  });

  test('holds the altitude instrument throughout both directions and Save restore', () => {
    const session = newSession();
    session.carry(46);
    for (let ride = 0; ride < 2; ride += 1) {
      const altitude = panel(session);
      session.rideLift();
      for (let frame = 0; frame < 330; frame += 1) {
        session.advance(1 / 50);
        expect(panel(session)).toBe(altitude);
      }
      const restored = GameplaySession.restore(
        content,
        session.scripts,
        session.captureSaveSnapshot()
      );
      expect(panel(restored)).toBe(altitude);
      session.advance(0.3);
      expect(session.snapshot.liftJourney).toBeUndefined();
      expect(panel(session)).toBe('00000');
    }
  });
  test('refuses restricted hangar descent without a carried Pass', () => {
    const session = newSession();
    const before = session.snapshot;
    expect(session.rideLift()).toBeUndefined();
    expect(session.snapshot.liftJourney).toBeUndefined();
    expect(session.snapshot.location).toEqual(before.location);
    expect(session.captureSaveSnapshot().benson!.activeMessageText).toContain(
      'PASS HOLDERS ONLY'
    );
  });

  test('a nearby but uncarried Pass does not satisfy the restricted entrance', () => {
    const session = newSession();
    session.carry(46);
    session.drop(46);
    expect(session.rideLift()).toBeUndefined();
    expect(session.snapshot.liftJourney).toBeUndefined();
  });

  test('travels down and up through every decoded ordinary entrance', () => {
    for (const entrance of bundle.underground!.entrances) {
      const session = newSession();
      session.place({
        x: entrance.cell[0]! * 0x1_00_00 + 0x71_00,
        y: 128,
        z: entrance.cell[1]! * 0x1_00_00 + 0x71_00
      });
      if (entrance.room === bundle.underground!.lift.access.restrictedRoom) {
        session.carry(bundle.underground!.lift.access.passSlot);
      }
      expect(session.rideLift()).toEqual([{ lift: 'down' }]);
      session.advance(7);
      expect(session.snapshot.location).toEqual({
        id: entrance.room,
        kind: 'room'
      });
      expect(session.rideLift()).toEqual([{ lift: 'up' }]);
      session.advance(7);
      expect(session.snapshot.location).toEqual({ kind: 'surface' });
    }
  });

  test('starts with a carried Pass, changes scene mid-journey, and arrives', () => {
    const session = newSession();
    session.carry(46);
    expect(session.rideLift()).toEqual([{ lift: 'down' }]);
    expect(session.snapshot.location).toEqual({ kind: 'surface' });
    expect(session.snapshot.liftJourney?.destination).toEqual({
      id: 5,
      kind: 'room'
    });

    session.advance(193 / 50);
    expect(session.snapshot.location).toEqual({ id: 5, kind: 'room' });
    expect(session.snapshot.liftJourney).toBeDefined();

    const events = session.advance(147 / 50).events;
    expect(session.snapshot.liftJourney).toBeUndefined();
    expect(events).toContainEqual({ arrived: { id: 5, kind: 'room' } });
  });

  test('rejects a second lift request while travel is active', () => {
    const session = newSession();
    session.carry(46);
    expect(session.rideLift()).toEqual([{ lift: 'down' }]);
    const before = session.captureSaveSnapshot().liftJourney;
    expect(session.rideLift()).toBeUndefined();
    expect(session.captureSaveSnapshot().liftJourney).toEqual(before);
  });

  test('keeps the destination Room script-facing before the visible scene changes', () => {
    const session = newSession();
    session.carry(46);
    session.carry(42);
    session.rideLift();
    expect(session.snapshot.location).toEqual({ kind: 'surface' });
    expect(session.drop(42).outcome).toEqual({ kind: 'dropped', slot: 42 });
    expect(session.residenceOf(42).kind).toBe('room');
  });

  test('advances outdoor effects deterministically across a scene crossing', () => {
    const once = newSession();
    const many = newSession();
    for (const session of [once, many]) {
      session.carry(46);
      session.rideLift();
    }
    once.advance(7);
    for (let frame = 0; frame < 350; frame += 1) {
      many.advance(1 / 50);
    }
    expectSamePlace(once.residenceOf(0), many.residenceOf(0));
  });

  test('restores a mid-journey Save and continues identically', () => {
    const session = newSession();
    session.carry(46);
    session.rideLift();
    session.advance(2.345);
    const restored = GameplaySession.restore(
      content,
      session.scripts,
      session.captureSaveSnapshot()
    );
    session.advance(4.5);
    restored.advance(4.5);
    expect(restored.captureSaveSnapshot()).toEqual(
      session.captureSaveSnapshot()
    );
  });

  test('rejects a restored journey whose route or visible scene is impossible', () => {
    const session = newSession();
    session.carry(46);
    session.rideLift();
    const saved = session.captureSaveSnapshot();
    expect(() =>
      GameplaySession.restore(content, session.scripts, {
        ...saved,
        liftJourney: { ...saved.liftJourney!, entranceRoom: 99 }
      })
    ).toThrow('Lift Journey refers to missing entrance');
    expect(() =>
      GameplaySession.restore(content, session.scripts, {
        ...saved,
        game: { ...saved.game, room: 5 }
      })
    ).toThrow('Lift Journey visible scene');
    expect(() =>
      GameplaySession.restore(content, session.scripts, {
        ...saved,
        liftJourney: { ...saved.liftJourney!, elapsedSeconds: 340 / 50 }
      })
    ).toThrow('Lift Journey has already completed');
  });
});

describe('Metal Detector feedback', () => {
  test('leaves the normal Benson colour alone when the detector is not carried', () => {
    expect(newSession().snapshot.bensonColour).toBeUndefined();
  });

  test('uses the occupied cell faction and the altitude high-byte boundary', () => {
    const rules = bundle.endgame.combat.siteDestruction;
    const mechanoid = rules.initialTable.findIndex(
      byte =>
        (byte & rules.mechanoidMask) !== 0 && (byte & rules.neutralMask) === 0
    );
    const session = newSession();
    session.carry(bundle.objectEffects.metalDetector.slot);
    session.place({
      x: (mechanoid & 15) * 0x1_00_00 + 0x71_00,
      y: 0xff_ff,
      z: (mechanoid >> 4) * 0x1_00_00 + 0x71_00
    });
    expect(session.snapshot.bensonColour).toBe(6);

    session.place({ ...session.snapshot.player.position, y: 0x1_00_00 });
    expect(session.snapshot.bensonColour).toBe(2);
  });

  test('retains its last colour throughout a Lift Journey', () => {
    const session = newSession();
    session.carry(26);
    session.carry(46);
    const before = session.snapshot.bensonColour;
    session.rideLift();
    session.drop(26);
    session.advance(1);
    expect(session.snapshot.bensonColour).toBe(before);
  });

  test('updates for live cell ownership and gives neutral flags precedence', () => {
    const rules = bundle.endgame.combat.siteDestruction;
    const palyar = rules.initialTable.findIndex(
      byte =>
        (byte & rules.mechanoidMask) === 0 &&
        (byte & rules.neutralMask) === 0 &&
        byte !== 0
    );
    const neutral = rules.initialTable.findIndex(
      byte => (byte & rules.neutralMask) !== 0
    );
    const precedenceContent = {
      ...content,
      sites: {
        ...content.sites!,
        initialTable: content.sites!.initialTable.map((byte, cell) =>
          cell === neutral ? byte | rules.mechanoidMask : byte
        )
      }
    };
    const session = new GameplaySession(
      precedenceContent,
      newSession().game.player,
      newSession().scripts
    );
    session.carry(bundle.objectEffects.metalDetector.slot);
    session.place({
      x: (palyar & 15) * 0x1_00_00,
      y: 0,
      z: (palyar >> 4) * 0x1_00_00
    });
    expect(session.snapshot.bensonColour).toBe(5);
    session.place({
      x: (neutral & 15) * 0x1_00_00,
      y: 0,
      z: (neutral >> 4) * 0x1_00_00
    });
    expect(session.snapshot.bensonColour).toBe(2);
    session.drop(bundle.objectEffects.metalDetector.slot);
    expect(session.snapshot.bensonColour).toBeUndefined();
  });

  test('shows no reading indoors or outside the city grid', () => {
    const session = newSession();
    session.carry(bundle.objectEffects.metalDetector.slot);
    session.place({ x: -1, y: 0, z: 0 });
    expect(session.snapshot.bensonColour).toBe(2);
    session.place({ x: 16 * 0x1_00_00, y: 0, z: 0 });
    expect(session.snapshot.bensonColour).toBe(2);
    session.place({
      x: 3 * 0x1_00_00 + 0x71_00,
      y: 128,
      z: 15 * 0x1_00_00 + 0x71_00
    });
    session.carry(46);
    session.rideLift();
    session.advance(7);
    expect(session.snapshot.location.kind).toBe('room');
    expect(session.snapshot.bensonColour).toBe(2);
  });
});
