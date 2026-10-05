import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  DionNarrative,
  DionScriptState
} from '../../../web/src/dion/script.ts';
import type { DionSnapshot } from '../../../web/src/dion/session.ts';
import { loadTourcraftContent } from '../../../web/src/dion/tourcraftContent.ts';
import { TaxiFaceModel } from './taxi-face-model.ts';
import {
  advanceFaceSnapshot,
  rebuildFaceOutputs,
  type FaceSelection,
  type FaceSnapshot
} from './taxi-face-snapshot.ts';
import {
  taxiRequestCountCandidates,
  taxiRequestCountGraph
} from './taxi-request-count-audit.ts';
import { TAXI_SOURCE_REVISION, withTaxiSource } from './taxi-source.ts';

type Source = Parameters<Parameters<typeof withTaxiSource>[0]>[0];
interface Node {
  narrative: DionScriptState;
  external: number;
  alternateFrames: number;
  selection: FaceSelection;
}
const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Pixels have no narrative/control/face reader. Omitting them RELAXES terminal
// matching; a divergent abstract set is never proof of natural ambiguity.
const signature = (n: DionScriptState) =>
  JSON.stringify([
    n.available,
    n.flags,
    n.hold,
    n.keyA,
    n.pc,
    n.stack,
    n.wait,
    n.message.age,
    n.message.busy,
    n.message.hold,
    n.message.scrollsOut,
    n.message.serial,
    n.message.text
  ]);
const key = (node: Node) =>
  `${signature(node.narrative)}:${node.external}:${node.alternateFrames}:${node.selection}`;
const elapsed = (n: DionScriptState, ticks: number): DionScriptState => ({
  ...n,
  wait: (n.wait + ticks) & 0xffff,
  message: {
    ...n.message,
    age: n.message.busy
      ? Math.min(
          n.message.age + ticks,
          n.message.scrollsOut ? 250 : n.message.hold
        )
      : n.message.age,
    busy:
      n.message.busy &&
      n.message.age + ticks < (n.message.scrollsOut ? 250 : n.message.hold)
  }
});

// Exhaust a timed OVERAPPROXIMATION of narrative histories. Physical Start,
// boarding and arrival guards are relaxed; all accepted external requests still
// occur after the VM/face call, and script starts before it. Genuine restores
// preserve every member here and add no animation invocation. This abstraction
// is restricted to early, pre-wait-wrap input; it is not source admission.
export const taxiTimedFaceCandidates = (
  source: Source,
  interpreter: DionNarrative,
  target: Pick<DionSnapshot, 'tick' | 'frame' | 'narrative'>,
  externalCount: number,
  maxStates = 100_000
) => {
  assert.ok(
    Number.isSafeInteger(target.tick) &&
      target.tick < 65_536 &&
      target.tick >= 0
  );
  assert.equal(target.frame, Math.floor(target.tick / 11));
  assert.ok(Number.isSafeInteger(externalCount) && externalCount >= 0);
  assert.ok(Number.isSafeInteger(maxStates) && maxStates > 0);
  const lastReset = target.tick - target.narrative.wait;
  assert.ok(lastReset >= 0 && lastReset % 11 === 0);
  const initial = new source.SourceSession(source.content).snapshot.narrative;
  let nodes = new Map<string, Node>();
  const root: Node = {
    narrative: initial,
    external: 0,
    alternateFrames: 0,
    selection: 'initial'
  };
  nodes.set(key(root), root);
  let states = 1;
  let peakStates = 1;
  let complete = true;
  for (let frame = 1; frame <= target.frame && complete; frame++) {
    const tick = frame * 11;
    const nextNodes = new Map<string, Node>();
    const add = (node: Node) => {
      const n = node.narrative;
      if (
        n.message.serial > target.narrative.message.serial ||
        node.external > externalCount
      )
        return;
      if (target.narrative.available.some(id => !n.available.includes(id)))
        return;
      // With no wait rollover, the last reset is an exact atomic timestamp.
      // Before it earlier resets are unrestricted; at/after it the wait fixes
      // the reset and rules out every subsequent reset.
      if (tick >= lastReset && n.wait !== tick - lastReset) return;
      const k = key(node);
      if (nextNodes.has(k)) return;
      if (nextNodes.size >= maxStates) {
        complete = false;
        return;
      }
      nextNodes.set(k, node);
    };
    for (const node of nodes.values()) {
      const n = elapsed(node.narrative, 11);
      const starts: (number | null)[] = [null];
      if (!n.flags[6])
        starts.push(
          ...n.available.filter(id => !target.narrative.available.includes(id))
        );
      for (const start of starts) {
        interpreter.state = n;
        if (start !== null) assert.equal(interpreter.start(start), true);
        interpreter.frame();
        // The source cabin command is consumed later in this same atomic pass.
        const after = { ...interpreter.state, cabin: 0 };
        const alternate = after.message.busy && after.flags[13]!;
        const candidate: Node = {
          narrative: after,
          external: node.external,
          alternateFrames: node.alternateFrames + Number(alternate),
          selection: alternate ? 'alternate' : 'base'
        };
        add(candidate);
        if (
          frame >= 19 &&
          !after.message.busy &&
          node.external < externalCount
        ) {
          for (const id of [0x25, 0x28]) {
            interpreter.state = after;
            assert.equal(interpreter.idMessage(id), true);
            add({
              ...candidate,
              narrative: interpreter.state,
              external: node.external + 1
            });
          }
        }
      }
      if (!complete) break;
    }
    nodes = nextNodes;
    states += nodes.size;
    peakStates = Math.max(peakStates, nodes.size);
  }
  const targetSignature = signature(target.narrative);
  const matches = complete
    ? [...nodes.values()].filter(
        node =>
          node.external === externalCount &&
          signature(elapsed(node.narrative, target.tick % 11)) ===
            targetSignature
      )
    : [];
  return {
    complete,
    states,
    peakStates,
    selections: [
      ...new Map(
        matches.map(node => [
          `${node.alternateFrames}:${node.selection}`,
          {
            alternateFrames: node.alternateFrames,
            faceSelection: node.selection
          }
        ])
      ).values()
    ].sort(
      (a, b) =>
        a.alternateFrames - b.alternateFrames ||
        a.faceSelection.localeCompare(b.faceSelection)
    )
  };
};

export const auditTaxiTimedFaceClasses = async ({
  maxStates = 100_000
} = {}) => {
  const expanded = await loadTourcraftContent(async path => {
    const text = readFileSync(
      join(import.meta.dir, '../../..', path.slice(1)),
      'utf8'
    );
    return { text, value: JSON.parse(text) };
  });
  assert.equal(
    expanded.contentSha256,
    '89bc7ab4ce73051b41e14d2da7605587cd8facc51b9abc9b203e2e5b23fcedbf'
  );
  return withTaxiSource(async source => {
    const { DionNarrative: Interpreter } = (await import(
      join(source.root, 'web/src/dion/script.ts')
    )) as typeof import('../../../web/src/dion/script.ts');
    const interpreter = new Interpreter(source.content);
    const controls = source.dionControlCaptures(source.content);
    const additional = [0, 10, 1107, 6003].map(tick => {
      const session = new source.SourceSession(source.content);
      session.advance(tick / 50);
      return {
        name: `no-input/tick-${tick}`,
        index: 1,
        operations: [{ kind: 'advance' as const, seconds: tick / 50 }],
        record: session.captureResume()
      };
    });
    const allControls = [...controls, ...additional];
    const countGraph = taxiRequestCountGraph(source.content, {
      frame: Math.max(...allControls.map(c => c.record.snapshot.frame)),
      serial: Math.max(
        ...allControls.map(c => c.record.snapshot.narrative.message.serial)
      )
    });
    assert.ok(countGraph.complete);
    const cache = new Map<string, ReturnType<typeof taxiTimedFaceCandidates>>();
    const rows = allControls.map(control => {
      const session = new source.SourceSession(source.content);
      const faces = new TaxiFaceModel(
        expanded.programmes,
        expanded.gameplay.initial
      );
      const n = (session as unknown as { narrative: DionNarrative }).narrative;
      let candidate: FaceSnapshot | undefined;
      let futureMatches = 0;
      const frame = n.frame.bind(n);
      n.frame = () => {
        frame();
        const selected =
          n.state.message.busy && n.state.flags[13]! ? 'alternate' : 'base';
        faces.frame(selected === 'alternate');
        if (candidate) {
          candidate = advanceFaceSnapshot(
            expanded.programmes,
            candidate,
            selected
          );
          assert.deepEqual(
            rebuildFaceOutputs(expanded.programmes, candidate),
            faces.capture()
          );
          futureMatches++;
        }
      };
      for (const op of control.operations.slice(0, control.index)) {
        if (op.kind === 'advance') session.advance(op.seconds);
        else if (op.kind === 'press') session.press(op.action);
        else session.intent = op.intent;
      }
      const captured = session.captureResume();
      assert.deepEqual(captured, control.record);
      const target = captured.snapshot;
      const counts = taxiRequestCountCandidates(
        countGraph,
        target.narrative,
        target.frame
      );
      const external = [
        ...new Set(
          counts.candidates.map(
            c => target.narrative.message.serial - c.scriptRequests
          )
        )
      ];
      assert.equal(external.length, 1);
      const cacheKey = `${target.tick}:${signature(target.narrative)}:${external[0]}`;
      let analysis = cache.get(cacheKey);
      if (!analysis) {
        analysis = taxiTimedFaceCandidates(
          source,
          interpreter,
          target,
          external[0]!,
          maxStates
        );
        cache.set(cacheKey, analysis);
      }
      const observed = {
        alternateFrames: faces.alternateFrames,
        faceSelection: faces.faceSelection
      };
      if (analysis.complete)
        assert.ok(
          analysis.selections.some(
            c =>
              c.alternateFrames === observed.alternateFrames &&
              c.faceSelection === observed.faceSelection
          ),
          control.name
        );
      const certificate =
        analysis.complete && analysis.selections.length === 1
          ? analysis.selections[0]!
          : null;
      let restoredFaces = null;
      if (certificate) {
        const base = target.frame - certificate.alternateFrames;
        const alternate = certificate.alternateFrames;
        candidate = {
          faceSelection: certificate.faceSelection,
          faces: {
            $A1: { base: base % 31, alternate: alternate % 45 },
            $A5: { base: base % 21, alternate: alternate % 31 }
          }
        };
        // Field decoder checks the periods against the pinned admitted data.
        restoredFaces = rebuildFaceOutputs(expanded.programmes, candidate);
        assert.deepEqual(restoredFaces, faces.capture());
        for (let i = 0; i < 600; i++) session.advance(11 / 50);
        assert.equal(futureMatches, 600);
      }
      return {
        name: control.name,
        tick: target.tick,
        frame: target.frame,
        sourceSnapshotSha256: sha(captured),
        externalRequests: external[0]!,
        analysisComplete: analysis.complete,
        states: analysis.states,
        peakStates: analysis.peakStates,
        observed,
        faceCandidates: analysis.selections,
        faceOwnerCertificate: certificate,
        restoredFaces,
        futureFaceMatches: futureMatches
      };
    });
    return {
      sourceRevision: TAXI_SOURCE_REVISION,
      identity: source.codec.dionRecordIdentity(source.content),
      expandedContentSha256: expanded.contentSha256,
      maxStates,
      scope:
        'Complete timed narrative overapproximation before the first 16-bit wait wrap; no external ID before the proved relaxed-service frame 19. Other physical guards and terminal message pixels omitted. Singleton selections certify cumulative face updates and last selection, not all expanded owners. Divergent selections are not natural collision witnesses.',
      minimumExternalFrame: 19,
      controls: rows.slice(0, controls.length),
      additionalSources: rows.slice(controls.length)
    };
  });
};

if (import.meta.main)
  console.log(JSON.stringify(await auditTaxiTimedFaceClasses(), null, 2));
