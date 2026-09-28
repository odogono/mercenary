import { beforeAll, describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  initialDamoclesSaveScript,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import type { Effect } from '../src/damocles/script.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import {
  parseDamoclesStrings,
  presentedText
} from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

let loaded: DamoclesContent;

/// The ask for a message's tone, as the session makes it when the message begins.
const shown = (id: Parameters<typeof presentedText>[1]): Effect => ({
  text: presentedText(loaded.strings, id)!,
  type: 'message'
});

beforeAll(async () => {
  const [catalogueValue, presentation, stringsValue] = await Promise.all([
    loadCatalogue(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const catalogue = catalogueValue;
  const doc = readErisPresentation(presentation);
  loaded = {
    catalogue,
    doc,
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(stringsValue),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

const besideKey = (soundPermitted = true): DamoclesSession => {
  const parent = loaded.surface.placements.find(
    placement => placement.id === 'eris-surface-87'
  )!;
  const key = loaded.catalogue.instances.find(
    instance => instance.id === 'object-slot-183'
  )!;
  const [x, _y, z] = key.placement!.position;
  return new DamoclesSession(
    loaded,
    {
      angleBytes: [],
      bodyTurn: 0,
      briefcaseStore: [],
      carried: [],
      craft: null,
      doorsMoving: false,
      elapsed: 0,
      footTicks: 0,
      frameAccumulator: 0,
      occupancy: { kind: 'onFoot' },
      pendingBriefcaseDrop: null,
      pose: {
        body: 'body-11',
        heading: 0,
        pitch: 0,
        position: {
          x: parent.position.x + x,
          y: loaded.doc.eye.heightUnits,
          z: parent.position.z + z
        }
      },
      residence: [],
      script: initialDamoclesSaveScript(),
      scrollCounter: 0,
      spaceMemory: null,
      structure: {
        attachments: parent.selection!.structure.attachments.map(
          attachment => ({
            latch: 'closed' as const,
            openUnits: 0,
            slot: attachment.slot
          })
        ),
        doorway: null,
        floor: 0,
        instanceId: parent.id,
        regionIndex: 0,
        ride: null
      }
    } satisfies DamoclesSaveSnapshot,
    { soundPermitted: () => soundPermitted }
  );
};

const carriedResidence = (instance: string) => ({
  instance,
  residence: {
    kind: 'carried' as const,
    placementClass: loaded.catalogue.instances.find(
      item => item.id === instance
    )!.placementClass!
  }
});

const dynamicAtOrigin = (
  instance: string,
  carried: readonly string[] = [],
  content = loaded
): DamoclesSession =>
  new DamoclesSession(content, {
    angleBytes: [],
    bodyTurn: 0,
    briefcaseStore: [],
    carried: [...carried],
    craft: null,
    doorsMoving: false,
    elapsed: 0,
    footTicks: 0,
    frameAccumulator: 0,
    occupancy: { kind: 'onFoot' },
    pendingBriefcaseDrop: null,
    pose: {
      body: 'body-11',
      heading: 0,
      pitch: 0,
      position: { x: 0, y: content.doc.eye.heightUnits, z: 0 }
    },
    residence: [
      ...carried.map(instance => ({
        instance,
        residence: {
          kind: 'carried' as const,
          placementClass: content.catalogue.instances.find(
            item => item.id === instance
          )!.placementClass!
        }
      })),
      {
        instance,
        residence: {
          body: 'body-11',
          kind: 'surface' as const,
          placementClass: content.catalogue.instances.find(
            item => item.id === instance
          )!.placementClass!,
          position: { x: 0, y: 0, z: 0 }
        }
      }
    ],
    script: {
      ...initialDamoclesSaveScript(),
      triggers: initialDamoclesSaveScript().triggers.map(trigger =>
        trigger.index === 2 && carried.includes('object-slot-183')
          ? { ...trigger, armed: false }
          : trigger
      )
    },
    scrollCounter: 0,
    spaceMemory: null,
    structure: null
  });

describe('ordinary Eris limo-key take and drop', () => {
  test('observed: restoring an elevated Pose preserves the height used by direct placement', () => {
    const saved = dynamicAtOrigin('object-slot-151', [
      'object-slot-92'
    ]).captureResume();
    const session = new DamoclesSession(loaded, {
      ...saved,
      pose: { ...saved.pose, position: { x: 0, y: 380, z: 0 } }
    });
    expect(session.snapshot.pose.position.y).toBe(380);
    expect(session.drop()).toEqual({ kind: 'dropped' });
    expect(session.snapshot.residence).toContainEqual({
      instance: 'object-slot-92',
      residence: {
        body: 'body-11',
        kind: 'surface',
        placementClass: 0,
        position: { x: 0, y: 317, z: 0 }
      }
    });
  });
  test('derived: support height compares world Y before returning parent-local residence', () => {
    const saved = besideKey().captureResume();
    const key = loaded.catalogue.instances.find(
      instance => instance.id === 'object-slot-183'
    )!;
    const parentModel = loaded.catalogue.instances.find(
      instance => instance.id === 'eris-surface-87'
    )!.model;
    for (const top of [2, 12]) {
      const content = {
        ...loaded,
        catalogue: {
          ...loaded.catalogue,
          modelIndex: loaded.catalogue.modelIndex.map(model =>
            model.id === key.model
              ? { ...model, supportTop: top }
              : model.id === parentModel
                ? { ...model, storeyHeight: 200 }
                : model
          )
        },
        surface: {
          ...loaded.surface,
          placements: loaded.surface.placements.map(placement =>
            placement.id === 'eris-surface-87'
              ? { ...placement, position: { ...placement.position, y: 60 } }
              : placement
          )
        }
      };
      const session = new DamoclesSession(content, {
        ...saved,
        carried: ['object-slot-92', 'object-slot-39'],
        residence: ['object-slot-92', 'object-slot-39'].map(carriedResidence)
      });
      expect(session.drop()).toEqual({
        kind: top === 2 ? 'dropped' : 'refused'
      });
      if (top === 2) {
        expect(session.snapshot.residence).toContainEqual({
          instance: 'object-slot-92',
          residence: {
            body: 'body-11',
            insertionGroup: 12,
            kind: 'structure',
            level: 0,
            parent: 'eris-surface-87',
            // `$0546C4`: the support's class, KEY- V.I.P. LIMO's authored 4.
            placementClass: 4,
            position: { x: 1038, y: 2, z: 789 }
          }
        });
      }
    }
  });
  test('derived: slot 74 is drawn but never selected', () => {
    const session = dynamicAtOrigin('object-slot-74');
    expect(session.snapshot.residents.map(resident => resident.id)).toContain(
      'object-slot-74'
    );
    expect(session.snapshot.selection).toEqual({ kind: 'none' });
    expect(session.take()).toEqual({ kind: 'refused' });
  });
  test('derived: support uses the native top and refuses unknown or rejected model forms', () => {
    const supportModel = loaded.catalogue.instances.find(
      instance => instance.id === 'object-slot-151'
    )!.model;
    for (const top of [12, null, undefined] as const) {
      const content = {
        ...loaded,
        catalogue: {
          ...loaded.catalogue,
          modelIndex: loaded.catalogue.modelIndex.map(model => {
            if (model.id !== supportModel) {
              return model;
            }
            const { supportTop: _supportTop, ...withoutTop } = model;
            return top === undefined
              ? withoutTop
              : { ...withoutTop, supportTop: top };
          })
        }
      };
      const session = dynamicAtOrigin(
        'object-slot-151',
        ['object-slot-92'],
        content
      );
      expect(session.drop()).toEqual({
        kind: top === 12 ? 'dropped' : 'refused'
      });
      if (top === 12) {
        expect(session.snapshot.residence).toContainEqual({
          instance: 'object-slot-92',
          residence: {
            body: 'body-11',
            kind: 'surface',
            // `$0546C4`: the support's class, DAMOCLES FILE's authored 4.
            placementClass: 4,
            position: { x: 0, y: 12, z: 0 }
          }
        });
      }
    }
  });
  test('observed: overflow contents stay hidden at their Catalogue placement', () => {
    const carried = [
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
      'object-slot-183'
    ];
    const session = new DamoclesSession(loaded, {
      ...besideKey().captureResume(),
      carried,
      residence: carried.map(carriedResidence),
      script: {
        ...initialDamoclesSaveScript(),
        triggers: [{ armed: false, index: 2 }]
      }
    });
    session.drop();
    session.advance(200 / 50);
    expect(session.drop()).toEqual({ kind: 'dropped' });
    expect(session.snapshot.briefcaseStore).toEqual(['object-slot-183']);
    expect(
      session.snapshot.residents.map(resident => resident.id)
    ).not.toContain('object-slot-183');
    expect(session.snapshot.selection).not.toMatchObject({
      instance: 'object-slot-183'
    });
  });
  test('observed: the live slot-0 flag bypasses both take refusal bits', () => {
    const content = {
      ...loaded,
      catalogue: {
        ...loaded.catalogue,
        instances: [
          ...loaded.catalogue.instances,
          {
            ...loaded.catalogue.instances.find(
              instance => instance.id === 'object-slot-156'
            )!,
            handling: {
              ...loaded.catalogue.instances.find(
                instance => instance.id === 'object-slot-156'
              )!.handling!,
              carried: true
            },
            id: 'object-slot-0',
            location: null
          }
        ]
      }
    };
    expect(dynamicAtOrigin('object-slot-156', [], content).take()).toEqual({
      kind: 'took'
    });
    expect(dynamicAtOrigin('object-slot-3', [], content).take()).toEqual({
      kind: 'took'
    });
  });
  test('derived: slot 39 bypasses zero supply and zero requirement as well as rank comparison', () => {
    const content = {
      ...loaded,
      catalogue: {
        ...loaded.catalogue,
        instances: loaded.catalogue.instances.map(instance =>
          instance.id === 'object-slot-151'
            ? {
                ...instance,
                handling: {
                  ...instance.handling!,
                  byte: 4,
                  suppliedSupportRank: 0
                }
              }
            : instance
        )
      }
    };
    const zeroSupply = dynamicAtOrigin(
      'object-slot-151',
      ['object-slot-92', 'object-slot-39'],
      content
    );
    expect(zeroSupply.drop()).toEqual({ kind: 'dropped' });
    const zeroRequirement = dynamicAtOrigin('object-slot-151', [
      'object-slot-215',
      'object-slot-39'
    ]);
    expect(zeroRequirement.drop()).toEqual({ kind: 'dropped' });
  });
  test('takes the selected key atomically and launches slot 2 once', () => {
    const session = besideKey();
    expect(session.snapshot.selection).toEqual({
      inRange: true,
      instance: 'object-slot-183',
      kind: 'object'
    });
    expect(session.snapshot.residents.map(resident => resident.id)).toEqual([
      'object-slot-183'
    ]);
    expect(session.snapshot.residents[0]?.mesh?.displayCode).toBe('VL');

    expect(session.take()).toEqual({ kind: 'took' });
    expect(session.snapshot).toMatchObject({
      carried: ['object-slot-183'],
      inventoryLabel: '',
      message: { id: 'script2-inline-1', remainingFrames: 200 },
      scrollCounter: -16
    });
    expect(session.snapshot.residence).toEqual([
      {
        instance: 'object-slot-183',
        residence: { kind: 'carried', placementClass: 4 }
      }
    ]);
    expect(session.snapshot.residents).toEqual([]);
    expect(session.drainEffects()).toEqual([
      shown('script2-inline-1'),
      { cue: 'take', type: 'sound-request' }
    ]);
    expect(session.take()).toEqual({ kind: 'refused' });
    expect(session.drainEffects()).toEqual([]);
  });

  test('gates the opposite action until the inventory label finishes', () => {
    const session = besideKey();
    session.take();
    expect(session.drop()).toEqual({ kind: 'refused' });
    session.advance(8 / 50);
    expect(session.snapshot.inventoryLabel).toBe('KEY- V.I');
    session.advance(8 / 50);
    expect(session.snapshot.scrollCounter).toBe(0);
    expect(session.drop()).toEqual({ kind: 'dropped' });
    expect(session.snapshot.carried).toEqual([]);
    expect(session.drainEffects()).toEqual([
      shown('script2-inline-1'),
      { cue: 'take', type: 'sound-request' },
      { cue: 'drop', type: 'sound-request' }
    ]);
  });

  test('presents the missing-group refusal only after slot 2 has parked', () => {
    const pending = besideKey();
    pending.take();
    pending.advance(16 / 50);
    const pendingSnapshot = pending.captureResume();
    const inRegion2 = new DamoclesSession(loaded, {
      ...pendingSnapshot,
      structure: { ...pendingSnapshot.structure!, regionIndex: 1 }
    });
    expect(inRegion2.drop()).toEqual({ kind: 'refused' });
    expect(inRegion2.snapshot.message?.id).toBe('script2-inline-1');

    pending.advance((1000 - 16) / 50);
    const parkedSnapshot = pending.captureResume();
    const parkedInRegion2 = new DamoclesSession(loaded, {
      ...parkedSnapshot,
      structure: { ...parkedSnapshot.structure!, regionIndex: 1 }
    });
    expect(parkedInRegion2.drop()).toEqual({ kind: 'refused' });
    expect(parkedInRegion2.snapshot.message).toEqual({
      id: 'system-string-9',
      remainingFrames: 200
    });
    expect(parkedInRegion2.drainEffects()).toEqual([shown('system-string-9')]);
  });

  test('keeps state changes when the recovered sound guard refuses', () => {
    const session = besideKey(false);
    expect(session.take()).toEqual({ kind: 'took' });
    expect(session.snapshot.carried).toEqual(['object-slot-183']);
    // `$7A0C` guards the take's cue, not the tone of the message the take launches.
    expect(session.drainEffects()).toEqual([shown('script2-inline-1')]);
  });

  test('takes a non-key surface resident and keeps it at the Carried Stack head', () => {
    const sunshade = loaded.catalogue.instances.find(
      instance => instance.id === 'object-slot-92'
    )!;
    const [x, _y, z] = sunshade.location!.position;
    const session = new DamoclesSession(loaded, {
      angleBytes: [],
      bodyTurn: 0,
      briefcaseStore: [],
      carried: [],
      craft: null,
      doorsMoving: false,
      elapsed: 0,
      footTicks: 0,
      frameAccumulator: 0,
      occupancy: { kind: 'onFoot' },
      pendingBriefcaseDrop: null,
      pose: {
        body: 'body-11',
        heading: 0,
        pitch: 0,
        position: {
          x: x * 65_536,
          y: loaded.doc.eye.heightUnits,
          z: z * 65_536
        }
      },
      residence: [],
      script: initialDamoclesSaveScript(),
      scrollCounter: 0,
      spaceMemory: null,
      structure: null
    });
    expect(session.snapshot.selection).toEqual({
      inRange: true,
      instance: 'object-slot-92',
      kind: 'object'
    });
    expect(session.take()).toEqual({ kind: 'took' });
    expect(session.snapshot.carried).toEqual(['object-slot-92']);
    expect(session.snapshot.residence).toEqual([
      {
        instance: 'object-slot-92',
        residence: { kind: 'carried', placementClass: 0 }
      }
    ]);
  });

  test('rotates the head and drops the newly selected object', () => {
    const session = new DamoclesSession(loaded, {
      angleBytes: [],
      bodyTurn: 0,
      briefcaseStore: [],
      carried: ['object-slot-183', 'object-slot-92'],
      craft: null,
      doorsMoving: false,
      elapsed: 0,
      footTicks: 0,
      frameAccumulator: 0,
      occupancy: { kind: 'onFoot' },
      pendingBriefcaseDrop: null,
      pose: {
        body: 'body-11',
        heading: 0,
        pitch: 0,
        position: { x: 0, y: loaded.doc.eye.heightUnits, z: 0 }
      },
      residence: [
        {
          instance: 'object-slot-183',
          residence: { kind: 'carried', placementClass: 4 }
        },
        {
          instance: 'object-slot-92',
          residence: { kind: 'carried', placementClass: 0 }
        }
      ],
      script: {
        ...initialDamoclesSaveScript(),
        triggers: initialDamoclesSaveScript().triggers.map(trigger =>
          trigger.index === 2 ? { ...trigger, armed: false } : trigger
        )
      },
      scrollCounter: 0,
      spaceMemory: null,
      structure: null
    });
    expect(session.snapshot.inventoryLabel).toContain('KEY-');
    expect(session.rotateForward()).toEqual({ kind: 'rotated' });
    expect(session.snapshot.carried).toEqual([
      'object-slot-92',
      'object-slot-183'
    ]);
    session.advance(16 / 50);
    expect(session.drop()).toEqual({ kind: 'dropped' });
    expect(session.snapshot.carried).toEqual(['object-slot-183']);
    expect(
      session.snapshot.residence.find(
        item => item.instance === 'object-slot-92'
      )?.residence.kind
    ).toBe('surface');
  });

  test('derives capacity and round-trips the BRIEFCASE overflow store', () => {
    const session = dynamicAtOrigin('object-slot-108', [
      'object-slot-92',
      'object-slot-178'
    ]);
    expect(session.take()).toEqual({ kind: 'took' });
    expect(session.snapshot.carried).toEqual([
      'object-slot-108',
      'object-slot-92',
      'object-slot-178'
    ]);
    expect(session.snapshot.capacity).toBe(20);
    expect(session.snapshot.briefcaseStore).toEqual([]);

    const carried = [
      'object-slot-108',
      'object-slot-92',
      'object-slot-178',
      'object-slot-151',
      'object-slot-157',
      'object-slot-158',
      'object-slot-180',
      'object-slot-183',
      'object-slot-202',
      'object-slot-203',
      'object-slot-204',
      'object-slot-215',
      'object-slot-225',
      'object-slot-230',
      'object-slot-234'
    ];
    const overflow = new DamoclesSession(loaded, {
      angleBytes: [],
      bodyTurn: 0,
      briefcaseStore: [],
      carried,
      craft: null,
      doorsMoving: false,
      elapsed: 0,
      footTicks: 0,
      frameAccumulator: 0,
      occupancy: { kind: 'onFoot' },
      pendingBriefcaseDrop: null,
      pose: {
        body: 'body-11',
        heading: 0,
        pitch: 0,
        position: { x: 0, y: loaded.doc.eye.heightUnits, z: 0 }
      },
      residence: carried.map(carriedResidence),
      script: {
        ...initialDamoclesSaveScript(),
        triggers: initialDamoclesSaveScript().triggers.map(trigger =>
          trigger.index === 2 ? { ...trigger, armed: false } : trigger
        )
      },
      scrollCounter: 0,
      spaceMemory: null,
      structure: null
    });
    expect(overflow.drop()).toEqual({ kind: 'refused' });
    expect(overflow.snapshot.message?.id).toBe('system-string-1');
    const pendingRestored = new DamoclesSession(
      loaded,
      overflow.captureResume()
    );
    expect(pendingRestored.captureResume().pendingBriefcaseDrop).toEqual({
      head: 'object-slot-108',
      residence: {
        body: 'body-11',
        kind: 'surface',
        // No structure is bound at the Body origin, so the zone is 0 over the authored 4.
        placementClass: 0,
        position: { x: 0, y: 0, z: 0 }
      }
    });
    pendingRestored.intent = { ...pendingRestored.intent, walk: 1 };
    pendingRestored.advance(200 / 50);
    pendingRestored.intent = { ...pendingRestored.intent, walk: 0 };
    const movedPose = pendingRestored.snapshot.pose.position;
    expect(movedPose.z).toBeGreaterThan(0);
    expect(pendingRestored.drop()).toEqual({ kind: 'dropped' });
    expect(pendingRestored.snapshot.residence).toContainEqual({
      instance: 'object-slot-108',
      residence: {
        body: 'body-11',
        kind: 'surface',
        placementClass: 0,
        position: { x: movedPose.x, y: 0, z: movedPose.z }
      }
    });
    overflow.advance(200 / 50);
    expect(overflow.drop()).toEqual({ kind: 'dropped' });
    expect(overflow.snapshot.carried).toEqual(carried.slice(1, 10));
    expect(overflow.snapshot.briefcaseStore).toEqual(carried.slice(10));
    expect(
      new DamoclesSession(loaded, overflow.captureResume()).snapshot
        .briefcaseStore
    ).toEqual(carried.slice(10));
    overflow.advance(16 / 50);
    expect(overflow.take()).toEqual({ kind: 'took' });
    expect(overflow.snapshot.carried).toEqual(carried);
    expect(overflow.snapshot.briefcaseStore).toEqual([]);
  });

  test('uses the live ANTIGRAV residence only for the bit-five bypass', () => {
    const refused = dynamicAtOrigin('object-slot-3');
    expect(refused.take()).toEqual({ kind: 'refused' });
    expect(refused.snapshot.message?.id).toBe('system-string-2');

    const accepted = dynamicAtOrigin('object-slot-3', ['object-slot-157']);
    expect(accepted.take()).toEqual({ kind: 'took' });
    expect(accepted.snapshot.carried).toEqual([
      'object-slot-3',
      'object-slot-157'
    ]);

    const liveHandling = {
      ...loaded,
      catalogue: {
        ...loaded.catalogue,
        instances: loaded.catalogue.instances.map(instance =>
          instance.id === 'object-slot-157'
            ? {
                ...instance,
                handling: { ...instance.handling!, carried: true }
              }
            : instance
        )
      }
    };
    const listedNotStacked = dynamicAtOrigin('object-slot-3', [], liveHandling);
    expect(listedNotStacked.take()).toEqual({ kind: 'took' });
  });

  test('forces a nearby support placement and refuses a failed rank without ground fallback', () => {
    const supported = dynamicAtOrigin('object-slot-151', ['object-slot-92']);
    expect(supported.drop()).toEqual({ kind: 'dropped' });
    expect(supported.snapshot.residence).toContainEqual({
      instance: 'object-slot-92',
      residence: {
        body: 'body-11',
        kind: 'surface',
        // The support's class, not SUNSHADE's own authored 0.
        placementClass: 4,
        position: { x: 0, y: 2, z: 0 }
      }
    });

    const refused = dynamicAtOrigin('object-slot-151', ['object-slot-202']);
    expect(refused.drop()).toEqual({ kind: 'refused' });
    expect(refused.snapshot.carried).toEqual(['object-slot-202']);
    expect(refused.snapshot.message?.id).toBe('system-string-9');
  });
});
