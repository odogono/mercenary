import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue } from '../src/catalogue/data.ts';
import { ModelStore } from '../src/catalogue/modelStore.ts';
import { impactTime } from '../src/damocles/comet.ts';
import { executeDamoclesConsoleCommand } from '../src/damocles/console.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  FLOATS_PER_VERTEX,
  floorLabelGlyphsOf,
  planErisFrame,
  type ErisFramePlan
} from '../src/damocles/frame.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import {
  structureLocalPosition,
  structureMeshes,
  structureRegionAt
} from '../src/damocles/selection.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { skyPass } from '../src/damocles/sky.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { cellOf, erisSurfaceFrom } from '../src/damocles/world.ts';
import {
  readGammaSystem,
  type GammaSystemDocument
} from '../src/flyover/documents.ts';
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
let system: GammaSystemDocument;

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
  system = readGammaSystem(
    await Bun.file('../payload/damocles/system.json').json()
  );
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

const negateZ = () => content.doc.orientation.modelZ === 'negate';

/// A session on `floor` of the State Office, standing at the middle of that Floor's region 0.
const inRegionZero = (floor: number): DamoclesSession => {
  const session = inStateOffice();
  expect(session.changeFloor(floor)).toEqual({ kind: 'moved' });
  const resume = session.captureResume();
  const bound = session.snapshot.surface.placements.find(
    item => item.id === STATE_OFFICE
  )!;
  const [xs, zs] = bound.selection!.structure.regions[0]!.bounds;
  const x = (xs![0] + xs![1]) / 2;
  const z = ((zs![0] + zs![1]) / 2) * (negateZ() ? -1 : 1);
  const cos = Math.cos(bound.heading);
  const sin = Math.sin(bound.heading);
  const pose = {
    ...resume.pose,
    position: {
      ...resume.pose.position,
      x: bound.position.x + x * cos + z * sin,
      z: bound.position.z - x * sin + z * cos
    }
  };
  return new DamoclesSession(content, {
    ...resume,
    pose,
    structure: {
      ...resume.structure!,
      regionIndex: structureRegionAt(bound, pose, negateZ())
    }
  });
};

const rgb = (colour: string): readonly [number, number, number] => [
  Number.parseInt(colour.slice(1, 3), 16) / 255,
  Number.parseInt(colour.slice(3, 5), 16) / 255,
  Number.parseInt(colour.slice(5, 7), 16) / 255
];

/// The colours of the base plane's triangles, which lead the vertex list.
const fillColours = (plan: ErisFramePlan): Set<string> => {
  const colours = new Set<string>();
  for (let vertex = 0; vertex < plan.fillTriangleCount * 3; vertex += 1) {
    const at = vertex * FLOATS_PER_VERTEX + 3;
    colours.add(
      `#${[0, 1, 2]
        .map(channel =>
          Math.round(plan.vertices[at + channel]! * 255)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')}`
    );
  }
  return colours;
};

/// The slot of the structure whose selector the published State Office placement carries.
const boundSlot = (session: DamoclesSession): number | undefined => {
  const selection = session.snapshot.surface.placements.find(
    item => item.id === STATE_OFFICE
  )?.selection?.structure;
  // A Floor's selector is recoloured through its palette, which leaves its regions as they are.
  const model = catalogue.models.find(
    item => item.structureSelection?.regions === selection?.regions
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
  test('a resident on an authored upper Floor is drawn and selectable only there', () => {
    const session = inStateOffice();
    expect(session.changeFloor(1)).toEqual({ kind: 'moved' });
    const upstairs = session.captureResume();
    const parent = content.surface.placements.find(
      item => item.id === STATE_OFFICE
    )!;
    const position = {
      x: upstairs.pose.position.x - parent.position.x,
      y: STOREY,
      z: upstairs.pose.position.z - parent.position.z
    };
    const original = catalogue.instances.find(
      item => item.id === 'object-slot-180'
    )!;
    const resident = {
      ...original,
      association: {
        ...original.association!,
        insertionGroupSelector: 1,
        insertions: [],
        levelSelector: 1
      },
      placement: {
        ...original.placement!,
        parent: STATE_OFFICE,
        position: [position.x, position.y, position.z] as const
      }
    };
    const isolated: DamoclesContent = {
      ...content,
      catalogue: {
        ...catalogue,
        instances: catalogue.instances.map(item =>
          item.id === resident.id ? resident : item
        )
      }
    };
    const placed = new DamoclesSession(isolated, {
      ...upstairs,
      residence: [
        {
          instance: resident.id,
          residence: {
            body: upstairs.pose.body,
            insertionGroup: 1,
            kind: 'structure',
            level: 1,
            parent: STATE_OFFICE,
            placementClass: resident.placementClass!,
            position
          }
        }
      ],
      structure: { ...upstairs.structure!, regionIndex: 0 }
    });
    expect(placed.snapshot.residents.map(item => item.id)).toContain(
      resident.id
    );
    expect(placed.snapshot.selection).toMatchObject({
      instance: resident.id,
      kind: 'object'
    });
    expect(placed.changeFloor(2)).toEqual({ kind: 'moved' });
    expect(placed.snapshot.residents.map(item => item.id)).not.toContain(
      resident.id
    );
    expect(placed.changeFloor(0)).toEqual({ kind: 'moved' });
    expect(placed.snapshot.residents.map(item => item.id)).not.toContain(
      resident.id
    );
  });

  test('an interior Drop records the current Floor', () => {
    const session = inStateOffice();
    expect(session.changeFloor(1)).toEqual({ kind: 'moved' });
    const snapshot = session.captureResume();
    const parent = catalogue.instances.find(item => item.id === STATE_OFFICE)!;
    const dropContent: DamoclesContent = {
      ...content,
      catalogue: {
        ...catalogue,
        instances: catalogue.instances.map(item =>
          item.id === STATE_OFFICE
            ? { ...parent, associationGroups: [{ group: 1, pairs: [] }] }
            : item
        )
      }
    };
    const dropping = new DamoclesSession(dropContent, {
      ...snapshot,
      carried: ['object-slot-92'],
      residence: [
        {
          instance: 'object-slot-92',
          residence: { kind: 'carried', placementClass: 0 }
        }
      ],
      structure: { ...snapshot.structure!, regionIndex: 0 }
    });
    expect(dropping.drop()).toEqual({ kind: 'dropped' });
    expect(dropping.snapshot.residence).toContainEqual({
      instance: 'object-slot-92',
      residence: expect.objectContaining({
        kind: 'structure',
        level: 1,
        parent: STATE_OFFICE
      })
    });
    expect(dropping.snapshot.residents.map(item => item.id)).toContain(
      'object-slot-92'
    );
  });

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

  test("the bound structure is drawn at its Floor's height, 63 below the eye", () => {
    const ground = content.surface.placements.find(
      item => item.id === STATE_OFFICE
    )!;
    for (const floor of [0, 1, 2, 10]) {
      const session = inRegionZero(floor);
      const { pose, structure, surface } = session.snapshot;
      expect(structure?.regionIndex).toBe(0);
      const drawn = surface.placements.find(item => item.id === STATE_OFFICE)!;
      expect(drawn.position).toEqual({
        ...ground.position,
        y: ground.position.y + floor * STOREY
      });
      // `$79AC`, the structure-local eye height the game draws from, is 63 on every Floor.
      expect(structureLocalPosition(drawn, pose.position, negateZ()).y).toBe(
        eye()
      );
      const heights = structureMeshes(drawn, pose, negateZ(), undefined, 0)
        .filter(mesh => mesh.wallTextPlane === undefined)
        .flatMap(mesh =>
          mesh.vertices.map(vertex => drawn.position.y + vertex[1])
        );
      expect(Math.min(...heights)).toBeLessThan(pose.position.y);
      expect(Math.max(...heights)).toBeGreaterThan(pose.position.y);
    }
  });

  test('B A S E M E N T is drawn on Floor 10, above the eye', () => {
    const { pose, surface } = inRegionZero(10).snapshot;
    const drawn = surface.placements.find(item => item.id === STATE_OFFICE)!;
    const basement = structureMeshes(drawn, pose, negateZ(), undefined, 0)
      .filter(mesh => mesh.wallTextPlane !== undefined)
      .find(mesh => mesh.vertices.every(vertex => vertex[0] === -410));
    expect(basement).toBeDefined();
    const heights = basement!.vertices.map(
      vertex => drawn.position.y + vertex[1]
    );
    expect(Math.min(...heights)).toBe(10 * STOREY + 115);
    expect(Math.max(...heights)).toBe(10 * STOREY + 123);
  });

  test('the lift shows G, 1, 2 and B on Floors 0, 1, 2 and 10, at the recovered placement', () => {
    for (const [floor, character] of [
      [0, 'G'],
      [1, '1'],
      [2, '2'],
      [10, 'B']
    ] as const) {
      const session = inStateOffice();
      expect(session.changeFloor(floor)).toEqual({ kind: 'moved' });
      const { pose, structure, surface } = session.snapshot;
      const drawn = surface.placements.find(item => item.id === STATE_OFFICE)!;
      const { floorLabels = [], regions } = drawn.selection!.structure;
      // One label beside each lift car's doorway, on queue bytes 15 and 26 (#473).
      const lift = floorLabels.filter(label => label.anchor[0] === -610);
      expect(lift.map(label => [label.face, label.anchor])).toEqual([
        [{ index: 14, kind: 'face' }, [-610, 70, -260]],
        [{ index: 25, kind: 'face' }, [-610, 70, -60]]
      ]);
      const glyph = catalogue.floorLabelGlyphs['2']![character]!;
      for (const label of lift) {
        expect([label.font, label.plane, label.scale]).toEqual([
          2,
          128,
          [-4, 4]
        ]);
        const { face: entry } = label;
        if (entry.kind !== 'face') {
          throw new Error('the lift labels ride on plan faces');
        }
        const regionIndex = regions.findIndex(region =>
          region.queue.some(
            item => item.kind === 'face' && item.index === entry.index
          )
        );
        expect(regionIndex).toBeGreaterThanOrEqual(0);
        const meshes = structureMeshes(
          drawn,
          pose,
          negateZ(),
          undefined,
          regionIndex,
          undefined,
          floorLabelGlyphsOf(surface, structure)
        );
        const face = meshes.findIndex(mesh =>
          mesh.faces.some(item => item.sourceIndex === entry.index)
        );
        const drawnLabel = meshes[face + 1]!;
        expect(drawnLabel.wallTextPlane).toBe(128);
        expect(drawnLabel.vertices).toEqual(
          glyph.points.map(([x, y]) => [
            -610,
            70 + y * 4,
            label.anchor[2] - x * 4
          ])
        );
        expect(
          [...drawnLabel.faces, ...drawnLabel.lines].every(
            item => item.colour === label.colour
          )
        ).toBe(true);
      }
    }
  });

  test('outside a structure carrying a Floor Label record, no label is drawn', () => {
    const labelled = content.surface.placements.filter(
      item => item.selection?.structure.floorLabels !== undefined
    );
    expect(labelled.map(item => item.id)).toContain(STATE_OFFICE);
    const unlabelled = content.surface.placements.find(
      item =>
        item.selection !== undefined &&
        item.selection.structure.floorLabels === undefined
    )!;
    const glyphs = floorLabelGlyphsOf(content.surface, null);
    const base = new DamoclesSession(content).snapshot.pose;
    for (const [index] of unlabelled.selection!.structure.regions.entries()) {
      const pose = { ...base, position: unlabelled.position };
      const withLabels = structureMeshes(
        unlabelled,
        pose,
        negateZ(),
        undefined,
        index,
        undefined,
        glyphs
      );
      expect(withLabels).toEqual(
        structureMeshes(unlabelled, pose, negateZ(), undefined, index)
      );
    }
  });

  test('an enclosed region fills ceiling and floor from its scene colours, and draws only the structure', () => {
    for (const [floor, ceiling, ground] of [
      [1, '#eeaa00', '#662200'],
      [2, '#eeaa00', '#662200'],
      [10, '#eeeeee', '#006666']
    ] as const) {
      const { bodyTurn, daylight, pose, structure, surface } =
        inRegionZero(floor).snapshot;
      const plan = planErisFrame(
        surface,
        pose,
        content.doc,
        structure,
        [],
        [],
        () => false,
        daylight,
        skyPass(system, {
          body: pose.body,
          daylight,
          impact: impactTime(0, content.doc.time),
          position: pose.position,
          sky: surface.sky,
          turn: bodyTurn
        })
      );
      expect(plan.clear).toEqual(rgb(ceiling));
      // No sky pass runs in the enclosed branch, as no sky fill does (#530).
      expect(plan.skyBodies).toEqual([]);
      expect(plan.skyVertices.length).toBe(0);
      expect(plan.fillTriangleCount).toBeGreaterThan(0);
      expect(fillColours(plan)).toEqual(new Set([ground]));
      expect(plan.islandTriangleCount).toBe(0);
      expect(plan.groundTriangleCount).toBe(0);
      expect(plan.drawnPlacements).toEqual([STATE_OFFICE]);
    }
  });

  test('a region with flag bit 15 set keeps the sky and the Body around it', () => {
    const { pose, structure, surface } = inRegionZero(0).snapshot;
    // Floor 0's region 0 is `$8000`, the lobby.
    const plan = planErisFrame(surface, pose, content.doc, structure);
    // Eris at night, as the start capture is: its night word `$001` (#494).
    expect(plan.clear).toEqual(rgb('#000022'));
    expect(plan.drawnPlacements.length).toBeGreaterThan(1);
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
    openAtlas: () => undefined,
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

  test('a schema-7 record is refused', () => {
    const record = JSON.parse(saved(inStateOffice().captureResume())) as {
      schemaVersion: number;
    };
    record.schemaVersion = 7;
    expect(() => decoded(JSON.stringify(record))).toThrow(
      'schema 7 is not Damocles Save 13'
    );
  });

  test('whether a door moved last pass round-trips, and a record without it is refused', () => {
    const record = inStateOffice().captureResume();
    for (const doorsMoving of [false, true]) {
      expect(decoded(saved({ ...record, doorsMoving })).doorsMoving).toBe(
        doorsMoving
      );
    }
    for (const doorsMoving of [undefined, 1]) {
      expect(() => decoded(saved({ ...record, doorsMoving } as never))).toThrow(
        'doorsMoving is not a boolean'
      );
    }
  });

  test('each door’s latch round-trips, and a record without one is refused', () => {
    const record = inStateOffice().captureResume();
    const withLatch = (latch: unknown) =>
      saved({
        ...record,
        structure: {
          ...record.structure!,
          attachments: record.structure!.attachments.map((item, index) =>
            index === 0 ? { ...item, latch } : item
          )
        } as never
      });
    for (const latch of ['closed', 'moving'] as const) {
      expect(decoded(withLatch(latch)).structure?.attachments[0]?.latch).toBe(
        latch
      );
    }
    for (const latch of [undefined, 0, 'shut']) {
      expect(() => decoded(withLatch(latch))).toThrow(
        'attachment state is outside its recovered bounds'
      );
    }
    // A latch settles only at its endpoint, so a shut door cannot be restored latched open.
    const open = decoded(withLatch('open'));
    expect(() => new DamoclesSession(content, open)).toThrow(
      'saved attachments do not match the bound structure'
    );
  });

  test('a lift ride and doorway round-trip, and are refused outside their bounds', () => {
    const record = inStateOffice().captureResume();
    const ride = { countdown: 12, destination: 10, label: 0 };
    const withLift = (doorway: unknown, lift: unknown) =>
      saved({
        ...record,
        structure: { ...record.structure!, doorway, ride: lift } as never
      });
    expect(decoded(withLift(0x03_f4, ride)).structure).toMatchObject({
      doorway: 0x03_f4,
      ride
    });
    for (const doorway of [0x03_f5, 0, undefined]) {
      expect(() => decoded(withLift(doorway, null))).toThrow(
        'bound structure state is outside its recovered bounds'
      );
    }
    for (const lift of [
      { ...ride, countdown: 0 },
      { ...ride, countdown: 26 },
      { ...ride, destination: 11 },
      { ...ride, label: -1 }
    ]) {
      expect(() => decoded(withLift(null, lift))).toThrow(
        'lift ride is outside its recovered bounds'
      );
    }
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
