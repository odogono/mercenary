import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, test } from 'bun:test';

import { impactTime } from '../src/damocles/comet.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { skyPass } from '../src/damocles/sky.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import {
  planEnhancedFrame,
  type EnhancedFramePlan
} from '../src/enhanced/frame.ts';
import {
  readGammaSystem,
  type GammaSystemDocument
} from '../src/flyover/documents.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';
import { onRecordingLibm } from './replay/platform.ts';

/// The Damocles Enhanced frame at every switchable arrival Pose, by day and by night, on foot
/// and with whole structures aboard, pinned by digest. A change to the shared Enhanced planner
/// that moves one float of Damocles's output fails here; an intended change regenerates the
/// digests with `UPDATE_ENHANCED_SNAPSHOT=1 bun test test/enhanced-frame-snapshot.test.ts`.

const FIXTURE = new URL(
  './fixtures/enhanced-frame-digests.json',
  import.meta.url
);

let content: DamoclesContent;
let system: GammaSystemDocument;

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
  system = readGammaSystem(
    await Bun.file('../payload/damocles/system.json').json()
  );
});

const digest = (plan: EnhancedFramePlan): string => {
  const hash = createHash('sha256');
  for (const values of [
    plan.vertices,
    plan.skyVertices,
    plan.horizonVertices,
    plan.horizonIslandVertices,
    plan.roadVertices
  ]) {
    hash.update(
      new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
    );
  }
  hash.update(
    JSON.stringify({
      clear: plan.clear,
      drawn: plan.drawnPlacements,
      enclosed: plan.enclosed,
      fill: plan.fillTriangleCount,
      ground: plan.groundTriangleCount,
      island: plan.islandTriangleCount,
      roads: plan.roadEdges,
      skipped: plan.skippedFaces,
      sky: plan.skyBodies,
      stars: plan.starCount,
      triangles: plan.triangleCount
    })
  );
  return hash.digest('hex');
};

const frames = (): Record<string, string> => {
  const found: Record<string, string> = {};
  for (const arrival of content.poses.poses) {
    const session = new DamoclesSession(content);
    if (session.switchToPose(arrival.id).kind !== 'switched') {
      continue;
    }
    const snapshot = session.snapshot;
    for (const daylight of [false, true]) {
      for (const aboard of [false, true]) {
        const plan = planEnhancedFrame(
          snapshot.surface,
          snapshot.pose,
          content.doc,
          snapshot.structure,
          snapshot.residents,
          [...snapshot.carried, ...snapshot.removedResidents],
          slot => session.carriesSlot(slot),
          daylight,
          skyPass(system, {
            body: snapshot.pose.body,
            daylight,
            horizonCut: true,
            impact: impactTime(snapshot.elapsed, content.doc.time),
            position: snapshot.pose.position,
            sky: snapshot.surface.sky,
            smooth: true,
            turn: snapshot.bodyTurn
          }),
          false,
          aboard,
          'whole',
          1080
        );
        found[
          `${arrival.id}:${daylight ? 'day' : 'night'}:${aboard ? 'aboard' : 'onFoot'}`
        ] = digest(plan);
      }
    }
  }
  return found;
};

describe('the Damocles Enhanced frame', () => {
  test.skipIf(!onRecordingLibm)(
    'is unchanged at every arrival Pose',
    async () => {
      const found = frames();
      expect(Object.keys(found).length).toBeGreaterThan(0);
      if (process.env['UPDATE_ENHANCED_SNAPSHOT'] === '1') {
        await Bun.write(FIXTURE, `${JSON.stringify(found, null, 2)}\n`);
      }
      expect(found).toEqual(await Bun.file(FIXTURE).json());
    }
  );
});
