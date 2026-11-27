import { beforeAll, describe, expect, test } from 'bun:test';

import type { Catalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { parseDamoclesArrivalPoses } from '../src/damocles/poses.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import {
  SURFACE_CELLS,
  erisSurfaceFrom,
  inOneFrame,
  placementById
} from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The Pose frame of ADR 0095: a position on a Body is held as the image nearest its nearest
/// island's origin, and what it is measured against is read in the same frame (#999).

const CELL = 65_536;
const SPAN = SURFACE_CELLS * CELL;

let catalogue: Catalogue;
let content: DamoclesContent;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses: parseDamoclesArrivalPoses(
      await Bun.file('../payload/damocles/arrival-poses.json').json()
    ),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

describe('the Damocles Pose frame', () => {
  test('restores a Save from before the frame standing at Key West across the wrap', () => {
    const newton = content.surface.placements.find(
      placement => placement.id === 'eris-key-west-surface-77'
    )!;
    const resume = new DamoclesSession(content).captureResume();
    // Saved unbound, as the session before ADR 0095 left it after the short flight.
    const restored = new DamoclesSession(content, {
      ...resume,
      pose: {
        ...resume.pose,
        position: {
          x: newton.position.x - SPAN,
          y: 63,
          z: newton.position.z - SPAN
        }
      },
      structure: null
    });
    expect(restored.captureResume().structure?.instanceId).toBe(newton.id);
    expect(restored.snapshot.pose.position.x).toBeCloseTo(newton.position.x, 6);
  });

  test('moves a generated field copy to the image nearest the Pose it is asked for from', () => {
    const midas = erisSurfaceFrom(catalogue, modelsOf(catalogue), content.doc, {
      bodyId: 'body-2',
      origin: content.doc.grid.origin
    });
    const id = 'midas-the-midas-project-surface-5-4000';
    const raw = placementById(midas, id)!;
    expect(raw.position.z).toBe((4000 + 0.5) * CELL);
    const near = { ...raw.position, z: raw.position.z - SPAN + 100 };
    expect(placementById(midas, id, near)!.position.z).toBe(
      raw.position.z - SPAN
    );
  });

  test('cuts a blended view where the Pose moves into another island frame', () => {
    const from = { x: 1889 * CELL, y: 63, z: 0 };
    expect(inOneFrame(from, { ...from, x: from.x + 1 }, CELL)).toBeTrue();
    expect(inOneFrame(from, { ...from, z: SPAN }, CELL)).toBeFalse();
  });
});
