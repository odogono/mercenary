import { beforeAll, describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  initialDamoclesSaveScript,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';

let loaded: DamoclesContent;

beforeAll(async () => {
  const [catalogueValue, presentation, stringsValue] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const catalogue = parseCatalogue(catalogueValue);
  const doc = readErisPresentation(presentation);
  loaded = {
    catalogue,
    doc,
    presentationSha256: 'test',
    strings: parseDamoclesStrings(stringsValue),
    surface: erisSurfaceFrom(catalogue, doc)
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
      carried: [],
      elapsed: 0,
      frameAccumulator: 0,
      pose: {
        body: 'body-11',
        heading: 0,
        position: {
          x: parent.position.x + x,
          y: loaded.doc.eye.heightUnits,
          z: parent.position.z + z
        }
      },
      residence: [],
      script: initialDamoclesSaveScript(),
      scrollCounter: 0,
      structure: {
        attachments: parent.selection!.structure.attachments.map(
          attachment => ({ openUnits: 0, slot: attachment.slot })
        ),
        instanceId: parent.id,
        regionIndex: 0
      }
    } satisfies DamoclesSaveSnapshot,
    { soundPermitted: () => soundPermitted }
  );
};

describe('ordinary Eris limo-key take and drop', () => {
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
        residence: { drawClass: 4, kind: 'carried' }
      }
    ]);
    expect(session.snapshot.residents).toEqual([]);
    expect(session.drainEffects()).toEqual([
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
    expect(parkedInRegion2.drainEffects()).toEqual([]);
  });

  test('keeps state changes when the recovered sound guard refuses', () => {
    const session = besideKey(false);
    expect(session.take()).toEqual({ kind: 'took' });
    expect(session.snapshot.carried).toEqual(['object-slot-183']);
    expect(session.drainEffects()).toEqual([]);
  });
});
