import { beforeAll, describe, expect, test } from 'bun:test';

import { modelPath, type AssembledCatalogue } from '../src/catalogue/data.ts';
import { ModelStore } from '../src/catalogue/modelStore.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom, modelWaves } from '../src/damocles/world.ts';
import { arrivalPoses } from './damocles-pose.ts';
import {
  loadCatalogue,
  modelsOf,
  readPayloadJson
} from './fixtures/catalogue.ts';

/// A Damocles session reading its Models as the browser does, a Body's islands at a time
/// (ADR 0048), rather than from a store that already holds them all.

let catalogue: AssembledCatalogue;
let whole: DamoclesContent;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  const models = modelsOf(catalogue);
  whole = {
    catalogue,
    doc,
    models,
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, models, doc)
  };
});

/// Content whose store starts empty and reads through `read`.
const reading = (
  read: (path: string) => Promise<unknown> = readPayloadJson
): DamoclesContent => {
  const models = new ModelStore(catalogue, read);
  return {
    ...whole,
    models,
    surface: erisSurfaceFrom(catalogue, models, whole.doc)
  };
};

/// Lets every read in flight settle, then steps the session so it sees what landed.
const landed = async (session: DamoclesSession, content: DamoclesContent) => {
  const body = session.snapshot.surface.body.id;
  await content.models.prefetch(
    catalogue.instances
      .filter(instance => instance.location?.body === body)
      .map(instance => instance.model)
  );
  await Bun.sleep(0);
  session.advance(0);
};

const placementIds = (session: DamoclesSession) =>
  session.snapshot.surface.placements.map(placement => placement.id).sort();

describe('a Body read progressively', () => {
  test('draws ground and sea before any Model lands, then the whole Body', async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const content = reading(async path => {
      await gate;
      return readPayloadJson(path);
    });
    const session = new DamoclesSession(content);
    session.advance(0);
    expect(session.snapshot.surface.placements).toEqual([]);
    expect(session.snapshot.surface.islands.length).toBeGreaterThan(0);

    release();
    await landed(session, content);
    expect(placementIds(session)).toEqual(
      placementIds(new DamoclesSession(whole))
    );
  });

  test('reads the island the player stands on before any other', async () => {
    // Gaea carries two populated islands; Eris carries one, which is a single wave.
    const reads: string[] = [];
    const content = reading(path => {
      reads.push(path);
      return readPayloadJson(path);
    });
    const session = new DamoclesSession(content);
    await landed(session, content);
    reads.length = 0;
    expect(session.switchToPose('gaea-ur-city-4-2').kind).toBe('switched');
    const { pose, surface } = session.snapshot;
    await landed(session, content);
    const [first = [], ...rest] = modelWaves(catalogue, surface, pose.position);
    const later = new Set(
      rest
        .flat()
        .filter(id => !first.includes(id))
        .map(modelPath)
        .filter(path => reads.includes(path))
    );
    const lastFirst = Math.max(
      ...first
        .map(id => reads.indexOf(modelPath(id)))
        .filter(index => index >= 0)
    );
    const firstLater = reads.findIndex(path => later.has(path));
    expect(later.size).toBeGreaterThan(0);
    expect(lastFirst).toBeLessThan(firstLater);
  });

  test('leaves an Instance whose file cannot be read undrawn, and draws the rest', async () => {
    const spaceport = catalogue.instances.find(
      instance => instance.id === 'eris-surface-87'
    )!;
    const content = reading(path =>
      path === modelPath(spaceport.model)
        ? Promise.reject(new Error('HTTP 404'))
        : readPayloadJson(path)
    );
    const session = new DamoclesSession(content);
    await landed(session, content);
    const drawn = placementIds(session);
    expect(drawn).not.toContain('eris-surface-87');
    expect(drawn.length).toBe(
      placementIds(new DamoclesSession(whole)).filter(
        id =>
          catalogue.instances.find(instance => instance.id === id)!.model !==
          spaceport.model
      ).length
    );
  });
});

describe('an arrival above Floor 0 read progressively', () => {
  test('waits unbound for its structure and its Floor, then lands on Floor 10', async () => {
    const content = reading();
    const session = new DamoclesSession(content);
    await landed(session, content);
    expect(session.switchToPose('vesta-transporter').kind).toBe('switched');
    // Nothing of Vesta is in hand yet, so nothing binds, and in particular not Floor 0.
    expect(session.snapshot.structure).toBeNull();
    for (let tries = 0; tries < 50; tries += 1) {
      await landed(session, content);
      // The Floor's structure is not an island wave; the next step's binding finds it in hand.
      session.advance(1 / 50);
      if (session.snapshot.structure !== null) {
        break;
      }
    }
    expect(session.snapshot.structure).toMatchObject({
      floor: 10,
      instanceId: 'vesta-surface-64'
    });
    expect(session.snapshot.pose.position.y).toBe(3233);
  });
});

describe('a restore read progressively', () => {
  test('binds its saved structure once prepared, on another Body', async () => {
    const away = new DamoclesSession(whole);
    expect(away.switchToPose('vesta-parliament-4-6').kind).toBe('switched');
    const saved = away.captureResume();
    expect(saved.structure).not.toBeNull();

    expect(() => new DamoclesSession(reading(), saved)).toThrow(
      'saved structure does not match the current cell'
    );

    const content = reading();
    await DamoclesSession.prepare(content, saved);
    const restored = new DamoclesSession(content, saved);
    expect(restored.snapshot.structure?.instanceId).toBe(
      saved.structure!.instanceId
    );
  });
});
