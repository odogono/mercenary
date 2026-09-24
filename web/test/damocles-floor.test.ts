import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue } from '../src/catalogue/data.ts';
import { ModelStore } from '../src/catalogue/modelStore.ts';
import { executeDamoclesConsoleCommand } from '../src/damocles/console.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { cellOf, erisSurfaceFrom } from '../src/damocles/world.ts';
import { parseConsoleCommand } from '../src/shell/console.ts';
import { arrivalPoses } from './damocles-pose.ts';
import {
  loadCatalogue,
  modelsOf,
  readPayloadJson
} from './fixtures/catalogue.ts';

/// The player's Floor in the Damocles session (#474), at the Eris State Office: its alias record
/// (slot 75, storey 150) binds Floors 0, 1, 2 and 10 to slots 76, 78, 78 and 79.

const STATE_OFFICE = 'eris-surface-89';
const STOREY = 150;

let catalogue: AssembledCatalogue;
let content: DamoclesContent;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

const eye = () => content.doc.eye.heightUnits;

/// A session standing at the centre of the State Office's cell, where it is bound.
const inStateOffice = (): DamoclesSession => {
  const session = new DamoclesSession(content);
  const placement = content.surface.placements.find(
    item => item.id === STATE_OFFICE
  )!;
  const cell = cellOf(placement.position, content.surface.grid);
  session.teleportToCell(cell.x, cell.z);
  expect(session.snapshot.structure?.instanceId).toBe(STATE_OFFICE);
  return session;
};

/// The slot of the structure whose selector the published State Office placement carries.
const boundSlot = (session: DamoclesSession): number | undefined => {
  const selection = session.snapshot.surface.placements.find(
    item => item.id === STATE_OFFICE
  )?.selection?.structure;
  const model = catalogue.models.find(
    item => item.structureSelection === selection
  );
  // Floor 0 is the ground bind, which the alias record carries as its own selector.
  return model?.recordClass === 'alias'
    ? model.levelBinding?.floors.find(entry => entry.level === 0)?.structureSlot
    : model?.slots[0];
};

/// A session standing in a cell that binds no structure.
const outside = (): DamoclesSession => {
  const session = new DamoclesSession(content);
  const { cellsPerAxis } = content.surface.grid;
  for (let x = 0; x < cellsPerAxis; x += 1) {
    for (let z = 0; z < cellsPerAxis; z += 1) {
      session.teleportToCell(x, z);
      if (session.snapshot.structure === null) {
        return session;
      }
    }
  }
  throw new Error('every Eris cell binds a structure');
};

const identity = () => damoclesSaveIdentity(catalogue, 'test');

const saved = (snapshot: DamoclesSaveSnapshot): string =>
  encodeDamoclesSave({
    identity: identity(),
    savedAt: '2026-09-24T00:00:00.000Z',
    schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
    snapshot,
    where: 'ERIS 09-08'
  });

const decoded = (encoded: string): DamoclesSaveSnapshot =>
  decodeDamoclesSave(encoded, identity(), {
    catalogue,
    poses: content.poses,
    strings: content.strings
  }).snapshot;

describe('the player stands on one Floor', () => {
  test('Floor 0 when the State Office is bound, and outside any structure', () => {
    const session = new DamoclesSession(content);
    expect(session.snapshot.structure?.floor ?? 0).toBe(0);
    expect(inStateOffice().snapshot.structure?.floor).toBe(0);
  });

  test('Floors 1, 2 and 10 bind slots 78, 78 and 79, at Floor x storey + eye', () => {
    for (const [floor, slot] of [
      [1, 78],
      [2, 78],
      [10, 79],
      [0, 76]
    ] as const) {
      const session = inStateOffice();
      const before = session.snapshot.pose;
      expect(session.changeFloor(floor)).toEqual({ kind: 'moved' });
      const after = session.snapshot;
      expect(after.structure?.floor).toBe(floor);
      expect(after.structure?.instanceId).toBe(STATE_OFFICE);
      expect(boundSlot(session)).toBe(slot);
      expect(after.pose.position).toEqual({
        x: before.position.x,
        y: floor * STOREY + eye(),
        z: before.position.z
      });
      expect(after.pose.heading).toBe(before.heading);
    }
  });

  test("the attachments are the Floor structure's own, closed on arrival", () => {
    const session = inStateOffice();
    session.changeFloor(10);
    const floorTen = catalogue.models.find(
      model => model.recordClass !== 'alias' && model.slots[0] === 79
    )!;
    expect(
      session.snapshot.structure?.attachments.map(item => item.slot)
    ).toEqual(
      floorTen.structureSelection!.attachments.map(
        attachment => attachment.slot
      )
    );
    expect(
      session.snapshot.structure?.attachments.every(
        item => item.openUnits === 0
      )
    ).toBe(true);
  });

  test('a Floor the table leaves at zero is refused and changes nothing', () => {
    const session = inStateOffice();
    session.changeFloor(2);
    const before = session.captureResume();
    for (const floor of [3, 9, 11, -1]) {
      expect(session.changeFloor(floor)).toEqual({
        kind: 'refused',
        reason: `STATE OFFICE binds no Floor ${floor}`
      });
    }
    expect(session.captureResume()).toEqual(before);
    expect(boundSlot(session)).toBe(78);
  });

  test('outside a structure every Floor is refused', () => {
    const session = outside();
    expect(session.changeFloor(1)).toEqual({
      kind: 'refused',
      reason: 'not inside a structure'
    });
  });

  test('walking holds the Floor, and binding another structure returns to Floor 0', () => {
    const session = inStateOffice();
    session.changeFloor(2);
    session.advance(0.5);
    expect(session.snapshot.structure?.floor).toBe(2);
    expect(boundSlot(session)).toBe(78);
    const cell = outside().snapshot.cell;
    session.teleportToCell(cell.x, cell.z);
    expect(session.snapshot.structure).toBeNull();
    session.teleportToCell(9, 8);
    expect(session.snapshot.structure?.floor).toBe(0);
    expect(boundSlot(session)).toBe(76);
  });
});

const run = (session: DamoclesSession, line: string) =>
  executeDamoclesConsoleCommand(parseConsoleCommand(line, 16, 256)!, {
    persistence: undefined as never,
    preferences: undefined as never,
    session: () => session,
    typeface: () => undefined
  });

describe('the console floor N', () => {
  test('moves between the Floors the table binds and refuses the rest', () => {
    const session = inStateOffice();
    expect(run(session, 'floor 1')).toEqual(['moved to Floor 1']);
    expect(run(session, 'floor 10')).toEqual(['moved to Floor 10']);
    expect(run(session, 'floor 3')).toEqual([
      'floor refused: STATE OFFICE binds no Floor 3'
    ]);
    expect(session.snapshot.structure?.floor).toBe(10);
    const cell = outside().snapshot.cell;
    session.teleportToCell(cell.x, cell.z);
    expect(run(session, 'floor 1')).toEqual([
      'floor refused: not inside a structure'
    ]);
  });

  test('parses one whole Floor', () => {
    expect(parseConsoleCommand('floor 2', 16)).toEqual({
      floor: 2,
      kind: 'floor'
    });
    expect(() => parseConsoleCommand('floor', 16)).toThrow(
      'floor takes one Floor'
    );
    expect(() => parseConsoleCommand('floor b', 16)).toThrow(
      "a Floor must be a whole number, and is 'b'"
    );
  });
});

describe('Save and Session Resume carry the Floor', () => {
  test('a Save on Floor 2 restores Floor 2 at the same pose', () => {
    const session = inStateOffice();
    session.changeFloor(2);
    session.advance(0.25);
    const snapshot = decoded(saved(session.captureResume()));
    expect(snapshot.structure?.floor).toBe(2);
    const restored = new DamoclesSession(content, snapshot);
    expect(restored.snapshot.structure).toEqual(session.snapshot.structure);
    expect(restored.snapshot.pose).toEqual(session.snapshot.pose);
    expect(boundSlot(restored)).toBe(78);
  });

  test('the Floor is never read off the height', () => {
    const ground = inStateOffice().captureResume().structure!;
    const session = inStateOffice();
    session.changeFloor(2);
    const upstairs = session.captureResume();
    // Floor 2's height, saved as Floor 0: the record's Floor is what binds.
    const restored = new DamoclesSession(content, {
      ...upstairs,
      structure: {
        ...upstairs.structure!,
        attachments: ground.attachments,
        floor: 0
      }
    });
    expect(restored.snapshot.pose.position.y).toBe(2 * STOREY + eye());
    expect(restored.snapshot.structure?.floor).toBe(0);
    expect(boundSlot(restored)).toBe(76);
  });

  test('a Floor the structure does not bind is refused whole', () => {
    const session = inStateOffice();
    const record = session.captureResume();
    expect(
      () =>
        new DamoclesSession(content, {
          ...record,
          structure: { ...record.structure!, floor: 3 }
        })
    ).toThrow('saved Floor is not one the structure binds');
  });

  test('a record outside the Floors, or without one, is refused', () => {
    const record = inStateOffice().captureResume();
    const withFloor = (floor: unknown) =>
      saved({
        ...record,
        structure: { ...record.structure!, floor } as never
      });
    expect(() => decoded(withFloor(11))).toThrow(
      'bound structure state is outside its recovered bounds'
    );
    expect(() => decoded(withFloor(1.5))).toThrow(
      'bound structure state is outside its recovered bounds'
    );
    expect(() => decoded(withFloor(undefined))).toThrow(
      'bound structure state is outside its recovered bounds'
    );
  });

  test('a schema-6 record is refused', () => {
    const record = JSON.parse(saved(inStateOffice().captureResume())) as {
      schemaVersion: number;
    };
    record.schemaVersion = 6;
    expect(() => decoded(JSON.stringify(record))).toThrow(
      'schema 6 is not Damocles Save 7'
    );
  });

  test('a restore on Floor 10 reads the Floor structure before it binds', async () => {
    const session = inStateOffice();
    session.changeFloor(10);
    const record = session.captureResume();
    const models = new ModelStore(catalogue, readPayloadJson);
    const lazy: DamoclesContent = {
      ...content,
      models,
      surface: erisSurfaceFrom(catalogue, models, content.doc)
    };
    await DamoclesSession.prepare(lazy, record);
    const floorTen = catalogue.models.find(
      model => model.recordClass !== 'alias' && model.slots[0] === 79
    )!;
    expect(models.peek(floorTen.id)).toBeDefined();
    const restored = new DamoclesSession(lazy, record);
    expect(restored.snapshot.structure?.floor).toBe(10);
    expect(restored.snapshot.pose.position.y).toBe(10 * STOREY + eye());
  });
});
