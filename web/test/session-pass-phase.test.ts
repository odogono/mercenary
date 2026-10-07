import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { launchedIntoSpace } from './damocles-space-harness.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The pass phase each Gameplay Session gives the Enhanced view to draw between passes by
/// (ADR 0078, #825). Reading it is presentation only: it changes nothing a Save carries.

const STEP = 1 / 60;

describe('Mercenary III', async () => {
  const tourcraft = await loadTourcraftContent(async path => {
    const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
    return { text, value: JSON.parse(text) };
  });

  test('counts a pass every eleven ticks, and the fraction of one run since', () => {
    const session = new TourcraftSession(tourcraft);
    const start = session.passPhase();
    expect(start.pass).toBe(Math.floor(session.snapshot.tick / 11));
    let passes = 0;
    let last = start;
    for (let step = 0; step < 600; step += 1) {
      session.advance(STEP);
      const phase = session.passPhase();
      expect(phase.fraction).toBeGreaterThanOrEqual(0);
      expect(phase.fraction).toBeLessThan(1);
      if (phase.pass !== last.pass) {
        expect(phase.pass).toBe(last.pass + 1);
        expect(phase.fraction).toBeLessThan(last.fraction);
        passes += 1;
      } else {
        expect(phase.fraction).toBeGreaterThan(last.fraction);
      }
      last = phase;
    }
    // Ten seconds at 50 Hz is 500 ticks: 45 or 46 passes of eleven.
    expect(passes).toBe(Math.floor(session.snapshot.tick / 11) - start.pass);
    expect(passes).toBeGreaterThanOrEqual(45);
    // Time the display has given but the session not yet taken counts toward the next pass.
    const now = session.passPhase();
    expect(session.passPhase(1 / 50).fraction).toBeCloseTo(
      now.fraction + 1 / 11,
      9
    );
  });

  test('reading the phase leaves the session byte-identical', () => {
    const read = new TourcraftSession(tourcraft);
    const unread = new TourcraftSession(tourcraft);
    for (const session of [read, unread]) {
      session.intent = { ...session.intent, turn: 1, walk: 1 };
    }
    for (let step = 0; step < 300; step += 1) {
      read.advance(STEP);
      read.passPhase(STEP / 2);
      unread.advance(STEP);
    }
    expect(JSON.stringify(read.captureResume())).toBe(
      JSON.stringify(unread.captureResume())
    );
  });
});

describe('Damocles aboard', () => {
  let content: DamoclesContent;

  beforeAll(async () => {
    const catalogue = await loadCatalogue();
    const doc = readErisPresentation(
      await Bun.file('damocles/eris.json').json()
    );
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

  test('on foot there is no pass to draw between', () => {
    expect(new DamoclesSession(content).passPhase()).toBeNull();
  });

  test('aboard, counts a craft pass every four ticks', () => {
    const session = launchedIntoSpace(content, saved => saved);
    const ticks = content.doc.time.ticksPerPass;
    let last = session.passPhase()!;
    let passes = 0;
    for (let step = 0; step < 240; step += 1) {
      session.advance(STEP);
      const phase = session.passPhase()!;
      expect(phase.fraction).toBeGreaterThanOrEqual(0);
      expect(phase.fraction).toBeLessThan(1 + 1e-9);
      if (phase.pass !== last.pass) {
        expect(phase.pass).toBe(last.pass + 1);
        passes += 1;
      }
      last = phase;
    }
    // Four seconds at 50 Hz: 200 ticks, 50 passes.
    expect(passes).toBe((4 * content.doc.time.vblHertz) / ticks);
  });

  test('reading the phase leaves the Save byte-identical', () => {
    const read = launchedIntoSpace(content, saved => saved);
    const unread = launchedIntoSpace(content, saved => saved);
    for (let step = 0; step < 120; step += 1) {
      read.advance(STEP);
      read.passPhase(STEP / 2);
      unread.advance(STEP);
    }
    expect(JSON.stringify(read.captureResume())).toBe(
      JSON.stringify(unread.captureResume())
    );
  });
});
