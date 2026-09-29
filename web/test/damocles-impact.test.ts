import { beforeAll, describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave
} from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

let content: DamoclesContent;

beforeAll(async () => {
  const catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

const beforeImpact = (
  body: 'gaea-ur-city-4-2' | 'eris-spaceport-onfoot',
  accepted = false
) => {
  const first = new DamoclesSession(content);
  if (body !== 'eris-spaceport-onfoot') {
    expect(first.switchToPose(body)).toEqual({ kind: 'switched', pose: body });
  }
  const saved = first.captureResume();
  return new DamoclesSession(content, {
    ...saved,
    elapsed: content.doc.time.impactDeadlineSeconds - 2,
    script: {
      ...saved.script,
      carried: accepted ? [38] : [],
      flags: accepted ? 1 : 0,
      reward: accepted ? 0x10 : 0,
      triggers: saved.script.triggers.map(trigger =>
        accepted && trigger.index === 4 ? { ...trigger, armed: false } : trigger
      )
    }
  });
};

describe('zero on the Damocles impact clock', () => {
  test('destroys ERIS and DAMOCLES once and runs the accepted too-late script', () => {
    const session = beforeImpact('gaea-ur-city-4-2', true);
    session.advance(3);
    const saved = session.captureResume();
    expect(saved.destroyedBodies).toEqual(['body-29', 'body-11']);
    expect(saved.blastCentre?.body).toBe('body-11');
    expect(saved.debrisPasses).toBeGreaterThan(0);
    expect(saved.removedResidents).toContain('eris-surface-87');
    expect(session.switchToPose('eris-spaceport-onfoot').kind).toBe('declined');
    expect(session.travelToAtlas({ bodyId: 'body-11', x: 7, z: 8 }).kind).toBe(
      'declined'
    );
    expect(saved.impactPassed).toBe(true);
    expect(saved.script.triggers.find(item => item.index === 15)?.armed).toBe(
      false
    );
    expect(session.snapshot.message?.id).toBe('script15-inline-1');
    expect(session.snapshot.screen.dead).toBe(false);
    const restored = new DamoclesSession(content, saved);
    restored.advance(1);
    expect(restored.captureResume().destroyedBodies).toEqual([
      'body-29',
      'body-11'
    ]);
    expect(
      restored.captureResume().script.triggers.find(item => item.index === 15)
        ?.armed
    ).toBe(false);
    const identity = damoclesSaveIdentity(
      content.catalogue,
      content.presentationSha256
    );
    const encoded = encodeDamoclesSave({
      identity,
      savedAt: '2026-09-29T00:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: saved,
      where: 'GAEA'
    });
    const decoded = decodeDamoclesSave(encoded, identity, {
      catalogue: content.catalogue,
      strings: content.strings
    });
    expect(decoded.snapshot.destroyedBodies).toEqual(['body-29', 'body-11']);
    expect(decoded.snapshot.impactPassed).toBe(true);
    expect(
      decoded.snapshot.script.triggers.find(item => item.index === 15)?.armed
    ).toBe(false);
    const afterLoad = new DamoclesSession(content, decoded.snapshot);
    afterLoad.advance(1);
    expect(afterLoad.captureResume().destroyedBodies).toHaveLength(2);
  });

  test('kills a player standing on ERIS and names the Body VOID', () => {
    const session = beforeImpact('eris-spaceport-onfoot');
    session.advance(3);
    expect(session.captureResume().destroyedBodies).toEqual([
      'body-29',
      'body-11'
    ]);
    expect(session.snapshot.screen.dead).toBe(true);
    expect(session.snapshot.bodyName).toBe('VOID');
    expect(session.snapshot.message?.id).toBe('system-string-35');
    expect(session.drainEffects()).toContainEqual({
      cue: 'blown-up',
      type: 'sound-request'
    });
    const stopped = session.snapshot.elapsed;
    session.advance(1);
    expect(session.snapshot.elapsed).toBe(stopped);
  });

  test('runs the unaccepted too-late branch without a reward', () => {
    const session = beforeImpact('gaea-ur-city-4-2');
    session.advance(3);
    expect(session.snapshot.message?.id).toBe('script15-inline-6');
    expect(session.captureResume().script.reward).toBe(0);
  });

  test('migrates schema 20 with live Bodies and an armed impact trigger', () => {
    const identity = damoclesSaveIdentity(
      content.catalogue,
      content.presentationSha256
    );
    const snapshot = new DamoclesSession(content).captureResume();
    const old = {
      identity,
      savedAt: '2026-09-29T00:00:00.000Z',
      schemaVersion: 20,
      snapshot: {
        ...snapshot,
        destroyedBodies: undefined,
        drift: undefined,
        impactPassed: undefined,
        removedResidents: undefined,
        script: {
          ...snapshot.script,
          triggers: snapshot.script.triggers.filter(item => item.index !== 15)
        }
      },
      where: 'ERIS'
    };
    const migrated = decodeDamoclesSave(JSON.stringify(old), identity, {
      catalogue: content.catalogue
    });
    expect(migrated.snapshot.destroyedBodies).toEqual([]);
    expect(migrated.snapshot.impactPassed).toBe(false);
    expect(
      migrated.snapshot.script.triggers.find(item => item.index === 15)?.armed
    ).toBe(true);
  });
});
