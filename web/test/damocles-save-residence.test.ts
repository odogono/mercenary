import { beforeAll, describe, expect, test } from 'bun:test';

import { type Catalogue } from '../src/catalogue/data.ts';
import {
  effectiveMessageRow,
  type DamoclesMessageId
} from '../src/damocles/display.ts';
import { initialHeadCommands } from '../src/damocles/headCommands.ts';
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
  initialDamoclesSaveScript,
  type DamoclesSaveOccupancy
} from '../src/damocles/save.ts';
import {
  fireTrigger,
  initialScriptState,
  runFrame,
  type ScriptState
} from '../src/damocles/script.ts';
import {
  ORDINARY_DISPLAY_FRAMES,
  SCRIPTS,
  TRIGGER_FOR_RESIDENT
} from '../src/damocles/scripts.ts';
import {
  parseDamoclesStrings,
  presentedText,
  type DamoclesStrings
} from '../src/damocles/strings.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

let catalogue: Catalogue;
let strings: DamoclesStrings;
beforeAll(async () => {
  catalogue = await loadCatalogue();
  strings = parseDamoclesStrings(
    await Bun.file('../payload/damocles/strings.json').json()
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
    angleBytes: [],
    bodyTurn: 0,
    briefcaseStore: [] as string[],
    carried: [] as string[],
    craft: null,
    doorsMoving: false,
    elapsed: 0,
    encounter: null,
    footTicks: 0,
    frameAccumulator: 0,
    headCommands: initialHeadCommands(),
    occupancy: { kind: 'onFoot' } as DamoclesSaveOccupancy,
    pendingBriefcaseDrop: null as {
      head: string;
      residence: ReturnType<typeof surface>;
    } | null,
    pose: {
      body: 'body-14',
      heading: 0,
      pitch: 0,
      position: { x: 12, y: 80, z: 34 }
    },
    residence: [] as { instance: string; residence: Residence }[],
    running: false,
    script: initialDamoclesSaveScript(),
    scrollCounter: 0,
    spaceMemory: null,
    structure: null
  },
  where: 'VESTA'
});
const decode = (value: ReturnType<typeof record>) =>
  decodeDamoclesSave(JSON.stringify(value), value.identity, {
    catalogue,
    strings
  });
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
  // Taking an object fires its pickup trigger and the launch path clears bit 7, so a carried
  // trigger object cannot leave its trigger armed. Nothing re-arms one.
  value.snapshot.script = {
    ...value.snapshot.script,
    triggers: value.snapshot.script.triggers.map(trigger =>
      ids.some(id => TRIGGER_FOR_RESIDENT[id] === trigger.index)
        ? { ...trigger, armed: false }
        : trigger
    )
  };
};

const rules = () => ({
  messageFrames: ORDINARY_DISPLAY_FRAMES,
  messageText: (id: DamoclesMessageId) => presentedText(strings, id)!,
  // The Save codec reads trigger 2's `WAIT_FROM_DOCUMENT` threshold as 200 frames, which is
  // what the Eris presentation document authors; the model takes it from the rules.
  noise: new Uint16Array(0x8_00),
  waitFrames: 200
});

/// Run the recovered script model exactly as play runs it, from the pickup to the frame the
/// execution parks on its `poll-wait`. Whatever row this leaves held is by construction a row
/// live play produces, so the rule is measured against the model rather than restated.
const midWait = (trigger: number): ScriptState => {
  let state = fireTrigger(initialScriptState(), trigger, rules()).state;
  for (let frame = 0; frame < 4096; frame += 1) {
    const execution = state.execution;
    if (
      execution !== null &&
      state.message === null &&
      SCRIPTS[execution.script].ops[execution.step]?.kind === 'poll-wait'
    ) {
      return state;
    }
    state = runFrame(state, rules()).state;
  }
  throw new Error('the script never reached its wait');
};

const waiting = (trigger: number, resident: string) => {
  const state = midWait(trigger);
  const value = record();
  carry(value, [resident]);
  value.snapshot.script = {
    counter: state.counter,
    display: state.display,
    displayDuration: state.displayDuration,
    encounter: state.encounter,
    execution: state.execution,
    flags: state.flags,
    message: state.message,
    noise: state.noise,
    pending: state.pending,
    read: state.read,
    triggers: state.triggers.map(({ armed, index }) => ({ armed, index })),
    zaps: state.zaps
  };
  return value;
};

const held = (value: ReturnType<typeof record>, cells: string) => {
  value.snapshot.script = {
    ...value.snapshot.script,
    display: { cells, kind: 'held', plane: 0 }
  };
  return value;
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
      // A Drop writes zones 0-8, so only a class past them contradicts the Catalogue.
      { instance: 'object-slot-92', residence: surface(9) }
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
        reveal: {
          beneath: ' '.repeat(48),
          beneathPlane: 0,
          offset: 0,
          pixels: 0
        }
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
          reveal: {
            beneath: ' '.repeat(48),
            beneathPlane: 0,
            offset: 0,
            pixels: 0
          }
        },
        message: { id, offset: 0, remainingFrames: 200 }
      };
      expect(decode(value)).toEqual(value);
      value.snapshot.script = {
        ...value.snapshot.script,
        display: { cells: 'MESSAGE'.padEnd(48), kind: 'held', plane: 0 },
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
      placementClass: 9
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
      residence: surface(9)
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
        modelIndex: catalogue.modelIndex.map(model => {
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

describe('a suspended Damocles Script holds the row it last wrote', () => {
  test('restores the limo key mid-wait exactly as play left it', () => {
    const value = waiting(2, 'object-slot-183');
    expect(value.snapshot.script.display).toEqual({
      cells: effectiveMessageRow(presentedText(strings, 'script2-inline-3')!),
      kind: 'held',
      plane: 0
    });
    expect(decode(value)).toEqual(value);
  });

  test('refuses a blank or unrelated row inside the limo key wait', () => {
    expect(() =>
      decode(held(waiting(2, 'object-slot-183'), ' '.repeat(48)))
    ).toThrow(/the row it last wrote/);
    expect(() =>
      decode(
        held(
          waiting(2, 'object-slot-183'),
          effectiveMessageRow(presentedText(strings, 'script2-inline-1')!)
        )
      )
    ).toThrow(/the row it last wrote/);
  });

  test('leaves a wait its own script has written nothing before unconstrained', () => {
    // Trigger 62's wait is its first operation, so the row it sits on came from whatever
    // presented before the pickup -- a finished response's blank clearing line, or none at all.
    const value = waiting(62, 'object-slot-94');
    expect(value.snapshot.script.display).toEqual({
      cells: ' '.repeat(48),
      kind: 'held',
      plane: 0
    });
    expect(decode(value)).toEqual(value);
    const inherited = held(
      waiting(62, 'object-slot-94'),
      effectiveMessageRow(presentedText(strings, 'script6-inline-2')!)
    );
    expect(decode(inherited)).toEqual(inherited);
  });

  test('refuses a held row that is not the message presenting over it', () => {
    const value = record();
    value.snapshot.script = {
      ...value.snapshot.script,
      display: { cells: 'NOT THE MESSAGE'.padEnd(48), kind: 'held', plane: 0 },
      message: { id: 'system-string-2', offset: 0, remainingFrames: 100 }
    };
    expect(() => decode(value)).toThrow(/presenting message row/);
    expect(
      decode(
        held(
          value,
          effectiveMessageRow(presentedText(strings, 'system-string-2')!)
        )
      )
    ).toEqual(value);
  });
});
