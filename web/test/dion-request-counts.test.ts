import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { TaxiFaceModel } from '../../research/mercenary-iii-st/scripts/taxi-face-model.ts';
import {
  auditTaxiRequestCounts,
  taxiRequestCountCandidates,
  taxiRequestCountGraph,
  taxiZeroExternalFaceCertificate
} from '../../research/mercenary-iii-st/scripts/taxi-request-count-audit.ts';
import { withTaxiSource } from '../../research/mercenary-iii-st/scripts/taxi-source.ts';
import type { DionScriptState } from '../src/dion/script.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';

test('complete narrative CFG abstraction certifies bounded request counts without claiming full source classes', async () => {
  const audit = await auditTaxiRequestCounts();
  expect(audit.abstraction.complete).toBe(true);
  expect(audit.controls).toHaveLength(33);
  expect(audit.certifiedFaceCursorClasses).toBeGreaterThan(0);
  for (const row of audit.controls) {
    expect(row.scriptRequestCandidates).toContain(row.observed.scriptRequests);
    expect(row.acceptedExternalRequestCandidates).toContain(
      row.observed.externalRequests
    );
    expect(row.expandedOwnerClass).toBe('unknown');
  }
  expect(audit).toEqual(
    JSON.parse(
      readFileSync(
        new URL(
          '../../research/mercenary-iii-st/taxi-request-count-evidence.json',
          import.meta.url
        ),
        'utf8'
      )
    )
  );
}, 30_000);

test('a truncated abstraction returns unknown rather than a singleton certificate', async () => {
  const audit = await auditTaxiRequestCounts({ maxStates: 1 });
  expect(audit.abstraction.complete).toBe(false);
  for (const row of audit.controls) {
    expect(row.acceptedExternalCountCertificate).toBeNull();
    expect(row.faceCursorCertificate.status).toBe('unknown');
  }
}, 30_000);

test('a natural partial busy script message certifies its actual face updates rather than its full hold', async () => {
  const expanded = await loadTourcraftContent(async path => {
    const text = readFileSync(
      join(import.meta.dir, '../..', path.slice(1)),
      'utf8'
    );
    return { text, value: JSON.parse(text) };
  });
  expect(expanded.contentSha256).toBe(
    '5a75345df63a88282ac08b9a679020b26a8053542fc268bd64c25798ef062a19'
  );
  const programmes = expanded.programmes as unknown as {
    faceSequences: Record<string, { alternate: number[]; base: number[] }>;
  };
  const periods = Object.fromEntries(
    ['$A1', '$A5'].map(token => [
      token,
      {
        alternate: programmes.faceSequences[token]!.alternate.length - 1,
        base: programmes.faceSequences[token]!.base.length - 1
      }
    ])
  );
  await withTaxiSource(async source => {
    const session = new source.SourceSession(source.content);
    const faces = new TaxiFaceModel(
      expanded.programmes,
      expanded.gameplay.initial
    );
    const n = (
      session as unknown as {
        narrative: { frame(): void; state: DionScriptState };
      }
    ).narrative;
    const frame = n.frame.bind(n);
    n.frame = () => {
      frame();
      faces.frame(n.state.message.busy && n.state.flags[13]!);
    };
    session.advance(1107 / 50);
    const target = session.captureResume().snapshot;
    expect(target.tick).toBe(1107);
    expect(target.frame).toBe(100);
    expect(target.narrative.message.busy).toBe(true);
    expect(target.narrative.flags[13]).toBe(true);
    expect(target.narrative.message.age).toBe(39);
    expect(target.narrative.message.hold).toBe(200);
    const graph = taxiRequestCountGraph(source.content, {
      frame: target.frame,
      serial: target.narrative.message.serial
    });
    const candidates = taxiRequestCountCandidates(
      graph,
      target.narrative,
      target.frame
    );
    const certificate = taxiZeroExternalFaceCertificate(
      candidates,
      target,
      periods
    );
    expect(certificate.status).toBe('certified');
    expect(certificate.alternateFrames).toBe(23);
    expect(certificate.cursors).toEqual(
      Object.fromEntries(
        Object.entries(faces.capture()).map(([token, face]) => [
          token,
          { alternate: face.alternate, base: face.base }
        ])
      )
    );
    expect(
      taxiZeroExternalFaceCertificate(
        { ...candidates, complete: false },
        target,
        periods
      ).status
    ).toBe('unknown');
    // Synthetic analysis boundaries change only abstract candidates; the
    // natural session above is never assigned a fabricated snapshot.
    expect(
      taxiZeroExternalFaceCertificate(
        candidates,
        { ...target, tick: 1_619_981 },
        periods
      ).status
    ).toBe('unknown');
    const candidate = candidates.candidates[0]!;
    const external = {
      ...candidate,
      scriptRequests: candidate.scriptRequests - 1
    };
    for (const alternatives of [
      [external],
      [candidate, external],
      [
        candidate,
        {
          ...candidate,
          completeAlternateFrames: candidate.completeAlternateFrames + 1
        }
      ]
    ]) {
      expect(
        taxiZeroExternalFaceCertificate(
          { ...candidates, candidates: alternatives },
          target,
          periods
        ).status
      ).toBe('unknown');
    }
  });
}, 30_000);
