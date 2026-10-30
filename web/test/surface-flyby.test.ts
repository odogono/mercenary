import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { createWalkabout, requiredSettings } from '../src/shell/session.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const settings = requiredSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);

describe("the Palyar commander's surface craft", () => {
  test('flies across the landscape at its constant speed', () => {
    const session = createWalkabout(bundle, settings).session;
    const before = bundle.objects.instances.find(
      instance => instance.slot === 0
    )!;
    const x = before.position[0]!;
    const y = before.position[1]!;
    const z = before.position[2]!;

    session.advance(1 / settings.flight.referenceFrameRate);

    const where = session.residenceOf(0);
    if (where.kind !== 'surface' || where.at === undefined) {
      throw new Error('the flyby should be on the surface');
    }
    expect(where.at.x).toBe(x);
    expect(where.at.y).toBe(y);
    expect(where.at.z).toBeCloseTo(z + 0x1_00, 6);
  });

  test('moves at the original speed and wraps around the world', () => {
    const session = createWalkabout(bundle, settings).session;
    const before = bundle.objects.instances.find(
      instance => instance.slot === 0
    )!;
    const x = before.position[0]!;
    const y = before.position[1]!;
    const z = before.position[2]!;
    const frame = 1 / settings.flight.referenceFrameRate;

    const frames = 2000;
    session.advance(frame * frames);
    const where = session.residenceOf(0);
    if (where.kind !== 'surface' || where.at === undefined) {
      throw new Error('the flyby should be on the surface');
    }
    expect(where.at.x).toBe(x);
    expect(where.at.y).toBe(y);
    expect(where.at.z).toBeCloseTo((z + frames * 0x1_00) % 0x10_00_00, 3);
  });

  test('presents equal movement on every browser frame at close range', () => {
    const session = createWalkabout(bundle, settings).session;
    const before = bundle.objects.instances.find(
      instance => instance.slot === 0
    )!;
    const z = before.position[2]!;
    const browserFrame = 1 / 60;
    const presentedZ = (): number => {
      const where = session.snapshot.residence.get(0);
      if (where?.kind !== 'surface' || where.at === undefined) {
        return z;
      }
      return where.at.z;
    };

    session.advance(browserFrame);
    const first = presentedZ();
    session.advance(browserFrame);
    const second = presentedZ();

    const expectedStep = (0x1_00 * settings.flight.referenceFrameRate) / 60;
    expect(first - z).toBeCloseTo(expectedStep, 6);
    expect(second - first).toBeCloseTo(expectedStep, 6);
  });

  test('waits while the player is underground', () => {
    const session = createWalkabout(bundle, settings).session;

    session.teleport({ id: 4, kind: 'room' });
    session.advance(4 / settings.flight.referenceFrameRate);

    expect(session.residenceOf(0)).toEqual({ kind: 'surface' });
  });
});
