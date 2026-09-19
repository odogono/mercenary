import { beforeAll, describe, expect, test } from 'bun:test';

import { parseCatalogue, type Catalogue } from '../src/catalogue/data.ts';
import {
  catalogueResidence,
  structureStoreyHeight,
  validStructureResidence,
  type Residence
} from '../src/damocles/residence.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  initialDamoclesSaveScript
} from '../src/damocles/save.ts';

let catalogue: Catalogue;
beforeAll(async () => {
  catalogue = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
});

const surface = (placementClass = 4) => ({
  body: 'body-14',
  kind: 'surface' as const,
  placementClass,
  position: { x: 12, y: 0, z: 34 }
});
const record = () => ({
  identity: damoclesSaveIdentity(catalogue, 'presentation'),
  savedAt: '2026-09-18T17:00:00Z',
  schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
  snapshot: {
    briefcaseStore: [] as string[],
    carried: [] as string[],
    elapsed: 0,
    frameAccumulator: 0,
    pendingBriefcaseDrop: null as {
      head: string;
      residence: ReturnType<typeof surface>;
    } | null,
    pose: { body: 'body-14', heading: 0, position: { x: 12, y: 80, z: 34 } },
    residence: [] as { instance: string; residence: Residence }[],
    script: initialDamoclesSaveScript(),
    scrollCounter: 0,
    structure: null
  },
  where: 'VESTA'
});
const decode = (value: ReturnType<typeof record>) =>
  decodeDamoclesSave(JSON.stringify(value), value.identity, catalogue);
const carry = (value: ReturnType<typeof record>, ids: string[]) => {
  value.snapshot.carried = ids;
  value.snapshot.residence = ids.map(instance => ({
    instance,
    residence: {
      kind: 'carried',
      placementClass: catalogue.instances.find(item => item.id === instance)!
        .placementClass!
    }
  }));
};

describe('body-aware Save Snapshot admission', () => {
  test('round-trips generalized carried, cross-Body surface and structure residence', () => {
    const value = record();
    carry(value, ['object-slot-108', 'object-slot-178']);
    value.snapshot.residence.push(
      { instance: 'object-slot-92', residence: surface(0) },
      {
        instance: 'object-slot-202',
        residence: catalogueResidence(catalogue, 'object-slot-202')!
      }
    );
    expect(decode(value)).toEqual(value);
  });

  test('carries the recovered placement class, not the handling nibble', () => {
    // Association A byte 3 for slot 183 is 4 while its handling byte is also 4, but slot 202
    // has handling $0F and class 4 and slot 178 has handling 4 and class 6. Only the recovered
    // byte admits all three (docs/research/damocles-placement-class.md).
    expect(
      ['object-slot-183', 'object-slot-202', 'object-slot-178'].map(
        id => catalogue.instances.find(item => item.id === id)!.placementClass
      )
    ).toEqual([4, 4, 6]);
    const value = record();
    value.snapshot.residence.push({
      instance: 'object-slot-183',
      residence: { ...surface(4), body: 'body-11' }
    });
    value.snapshot.script = {
      ...value.snapshot.script,
      triggers: value.snapshot.script.triggers.map(t =>
        t.index === 2 ? { ...t, armed: false } : t
      )
    };
    expect(decode(value)).toEqual(value);
  });

  test('round-trips stored objects in their original order', () => {
    const value = record();
    value.snapshot.briefcaseStore = ['object-slot-178', 'object-slot-92'];
    value.snapshot.residence.push({
      instance: 'object-slot-108',
      residence: surface()
    });
    expect(decode(value)).toEqual(value);
  });

  test('round-trips a pending Drop and more than ten carried objects', () => {
    const value = record();
    carry(value, [
      'object-slot-108',
      'object-slot-92',
      'object-slot-178',
      'object-slot-151',
      'object-slot-157',
      'object-slot-158',
      'object-slot-180',
      'object-slot-202',
      'object-slot-203',
      'object-slot-204',
      'object-slot-215'
    ]);
    value.snapshot.pendingBriefcaseDrop = {
      head: 'object-slot-108',
      residence: surface()
    };
    expect(decode(value)).toEqual(value);
  });

  test('normalizes omitted legacy schema-4 continuation fields', () => {
    const value = record();
    const expected = record();
    Reflect.deleteProperty(value.snapshot, 'briefcaseStore');
    Reflect.deleteProperty(value.snapshot, 'pendingBriefcaseDrop');
    expect(decode(value)).toEqual(expected);
  });

  test('rejects partially omitted continuation fields', () => {
    for (const field of ['briefcaseStore', 'pendingBriefcaseDrop']) {
      const value = record();
      Reflect.deleteProperty(value.snapshot, field);
      expect(() => decode(value)).toThrow(/continuation/);
    }
  });

  test('rejects unknown Bodies, objects and contradictory classes', () => {
    for (const departure of [
      {
        instance: 'object-slot-92',
        residence: { ...surface(0), body: 'unknown' }
      },
      { instance: 'unknown', residence: surface() },
      { instance: 'object-slot-92', residence: surface(7) }
    ]) {
      const value = record();
      value.snapshot.residence.push(departure);
      expect(() => decode(value)).toThrow(/Catalogue/);
    }
    const value = record();
    value.snapshot.pose.body = 'unknown';
    expect(() => decode(value)).toThrow(/Body/);
  });

  test('rejects duplicate, unknown or simultaneously carried briefcase contents', () => {
    for (const stored of [
      ['object-slot-92', 'object-slot-92'],
      ['unknown'],
      ['object-slot-108'],
      ['object-slot-178']
    ]) {
      const value = record();
      carry(value, ['object-slot-178']);
      value.snapshot.briefcaseStore = stored;
      value.snapshot.residence.push({
        instance: 'object-slot-108',
        residence: surface()
      });
      expect(() => decode(value)).toThrow();
    }
  });

  test('rejects a pending Drop without a carried briefcase head', () => {
    const value = record();
    value.snapshot.pendingBriefcaseDrop = {
      head: 'object-slot-108',
      residence: surface()
    };
    expect(() => decode(value)).toThrow();
  });

  test('rejects an unowned scrolling display', () => {
    const value = record();
    value.snapshot.script = {
      ...value.snapshot.script,
      display: {
        id: 'system-string-2',
        kind: 'scrolling',
        reveal: { beneath: ' '.repeat(48), offset: 0, pixels: 0 }
      }
    };
    expect(() => decode(value)).toThrow(/display/);
  });

  test('retains system messages before the key trigger, during and after presentation', () => {
    for (const id of [
      'system-string-1',
      'system-string-2',
      'system-string-9'
    ] as const) {
      const value = record();
      value.snapshot.script = {
        ...value.snapshot.script,
        display: {
          id,
          kind: 'scrolling',
          reveal: { beneath: ' '.repeat(48), offset: 0, pixels: 0 }
        },
        message: { id, remainingFrames: 200 }
      };
      expect(decode(value)).toEqual(value);
      value.snapshot.script = {
        ...value.snapshot.script,
        display: { cells: 'MESSAGE'.padEnd(48), kind: 'held' },
        message: null
      };
      expect(decode(value)).toEqual(value);
    }
  });

  test('rejects carried classes and capacities that contradict the Catalogue', () => {
    const value = record();
    carry(value, ['object-slot-92']);
    value.snapshot.residence[0]!.residence = {
      kind: 'carried',
      placementClass: 7
    };
    expect(() => decode(value)).toThrow(/class/);
    carry(value, [
      'object-slot-92',
      'object-slot-178',
      'object-slot-151',
      'object-slot-157',
      'object-slot-158',
      'object-slot-180',
      'object-slot-202',
      'object-slot-203',
      'object-slot-204',
      'object-slot-215',
      'object-slot-225'
    ]);
    expect(() => decode(value)).toThrow(/capacity/);
  });

  test('rejects a pending Drop whose placement contradicts the Catalogue', () => {
    const value = record();
    carry(value, [
      'object-slot-108',
      'object-slot-92',
      'object-slot-178',
      'object-slot-151',
      'object-slot-157',
      'object-slot-158',
      'object-slot-180',
      'object-slot-202',
      'object-slot-203',
      'object-slot-204',
      'object-slot-215'
    ]);
    value.snapshot.pendingBriefcaseDrop = {
      head: 'object-slot-108',
      residence: surface(7)
    };
    expect(() => decode(value)).toThrow(/Catalogue/);
  });

  test('uses only the parent Model pitch and enforces its storey interval', () => {
    const residence = catalogueResidence(catalogue, 'object-slot-202')!;
    if (residence.kind !== 'structure') {
      throw new Error('expected structure');
    }
    expect(structureStoreyHeight(catalogue, residence.parent)).toBe(317);
    expect(validStructureResidence(catalogue, residence)).toBe(true);
    expect(
      validStructureResidence(catalogue, {
        ...residence,
        position: { ...residence.position, y: (residence.level + 1) * 317 }
      })
    ).toBe(false);
    expect(
      validStructureResidence(catalogue, { ...residence, body: 'body-11' })
    ).toBe(false);
  });

  test('rejects non-finite structure coordinates and selectors outside byte bounds', () => {
    const residence = catalogueResidence(catalogue, 'object-slot-202')!;
    if (residence.kind !== 'structure') {
      throw new Error('expected structure');
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      for (const value of [Number.NaN, Infinity, -Infinity]) {
        expect(
          validStructureResidence(catalogue, {
            ...residence,
            position: { ...residence.position, [axis]: value }
          })
        ).toBe(false);
      }
    }
    for (const field of ['level', 'insertionGroup'] as const) {
      for (const value of [-1, 256, 1.5, Number.NaN, Infinity]) {
        expect(
          validStructureResidence(catalogue, {
            ...residence,
            [field]: value,
            position: {
              ...residence.position,
              y: field === 'level' ? value * 317 : residence.position.y
            }
          })
        ).toBe(false);
      }
    }
  });

  test('does not infer storey pitch from coordinates or provenance prose', () => {
    const residence = catalogueResidence(catalogue, 'object-slot-202')!;
    if (residence.kind !== 'structure') {
      throw new Error('expected structure');
    }
    const parent = catalogue.instances.find(
      instance => instance.id === residence.parent
    )!;
    for (const height of [undefined, 0, -1, 1.5]) {
      const changed = {
        ...catalogue,
        models: catalogue.models.map(model => {
          if (model.id !== parent.model) {
            return model;
          }
          const { storeyHeight: _height, ...withoutHeight } = model;
          return height === undefined
            ? withoutHeight
            : { ...model, storeyHeight: height };
        })
      };
      expect(structureStoreyHeight(changed, residence.parent)).toBeUndefined();
      expect(validStructureResidence(changed, residence)).toBe(false);
    }
  });

  test('admits the recovered direct level-zero placement without inventing a pitch', () => {
    const key = catalogueResidence(catalogue, 'object-slot-183')!;
    if (key.kind !== 'structure') {
      throw new Error('expected structure');
    }
    expect(structureStoreyHeight(catalogue, key.parent)).toBeUndefined();
    expect(validStructureResidence(catalogue, key)).toBe(true);
    expect(
      validStructureResidence(catalogue, {
        ...key,
        position: { x: key.position.x + 1, y: 0, z: key.position.z + 1 }
      })
    ).toBe(true);
    expect(
      validStructureResidence(catalogue, { ...key, insertionGroup: 255 })
    ).toBe(false);
    expect(
      validStructureResidence(catalogue, {
        ...key,
        position: { ...key.position, y: key.position.y + 1 }
      })
    ).toBe(false);
    expect(validStructureResidence(catalogue, { ...key, level: 1 })).toBe(
      false
    );
  });
});
