import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DionContent } from '../../../web/src/dion/content.ts';
import { list, record } from '../../../web/src/dion/read.ts';
import type { DionScriptState } from '../../../web/src/dion/script.ts';
import type { DionSnapshot } from '../../../web/src/dion/session.ts';
import { loadTourcraftContent } from '../../../web/src/dion/tourcraftContent.ts';
import { TaxiFaceModel } from './taxi-face-model.ts';
import { TAXI_SOURCE_REVISION, withTaxiSource } from './taxi-source.ts';

interface Control {
  available: number[];
  flags: bigint;
  hold: number;
  keyA: boolean;
  pc: number | null;
  stack: number[];
}
interface Node extends Control {
  scriptRequests: number;
  completeAlternateFrames: number;
  minimumInstructions: number;
}
const bit = (n: number) => 1n << BigInt(n);
const flagsOf = (flags: readonly boolean[]) =>
  flags.reduce((value, set, i) => (set ? value | bit(i) : value), 0n);
const controlKey = (s: Control) =>
  JSON.stringify([
    s.available,
    s.flags.toString(),
    s.hold,
    s.keyA,
    s.pc,
    s.stack
  ]);
const nodeKey = (s: Node) =>
  `${controlKey(s)}:${s.scriptRequests}:${s.completeAlternateFrames}`;
const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Complete OVERAPPROXIMATION of the pinned narrative's control paths/counts.
 * One VM instruction per frame bounds minimumInstructions by source.frame.
 * Busy/wait stutters, elapsed-call grouping and physical Start/ID guards are
 * omitted; accepted external IDs do not change any Control member. Thus every
 * genuine history maps to a path here, but an abstract path is not a witness.
 * Only exhausted traversal can prove that a request-count set is a singleton.
 */
export const taxiRequestCountGraph = (
  content: DionContent,
  bounds: { frame: number; serial: number; maxStates?: number }
) => {
  const instructions = new Map(
    content.scripts.routines.flatMap(r =>
      r.instructions.map(i => [i.address, i] as const)
    )
  );
  const initial: Node = {
    available: [0x33, 0x34],
    flags: bit(6),
    hold: 200,
    keyA: false,
    pc: content.scripts.entries.get(0x19)!,
    stack: [],
    scriptRequests: 0,
    completeAlternateFrames: 0,
    minimumInstructions: 0
  };
  assert.ok(initial.pc !== undefined);
  const states = new Map<string, Node>([[nodeKey(initial), initial]]);
  const queue = [initial];
  const maxStates = bounds.maxStates ?? 100_000;
  let complete = true;
  const add = (next: Node) => {
    if (
      next.scriptRequests > bounds.serial ||
      next.minimumInstructions > bounds.frame
    )
      return;
    const key = nodeKey(next);
    const previous = states.get(key);
    if (previous && previous.minimumInstructions <= next.minimumInstructions)
      return;
    if (!previous && states.size >= maxStates) {
      complete = false;
      return;
    }
    states.set(key, next);
    queue.push(next);
  };
  for (let at = 0; at < queue.length && complete; at++) {
    const state = queue[at]!;
    if (states.get(nodeKey(state)) !== state) continue;
    // Starts happen before the VM. A false flag 6 is the archived guard;
    // physical passenger/cell/selection guards are deliberately relaxed.
    if (!(state.flags & bit(6)))
      for (const id of state.available) {
        const entry = content.scripts.entries.get(id);
        assert.ok(entry !== undefined);
        add({
          ...state,
          available: state.available.filter(n => n !== id),
          flags: state.flags | bit(6),
          pc: entry,
          stack: state.pc === null ? [] : [state.pc]
        });
      }
    if (state.pc === null) continue;
    const i = instructions.get(state.pc);
    assert.ok(i, `Unadmitted abstract PC ${state.pc}`);
    const next: Node = {
      ...state,
      pc: i.next,
      stack: [...state.stack],
      minimumInstructions: state.minimumInstructions + 1
    };
    switch (i.op) {
      case 0x00:
        next.pc = null;
        break;
      case 0x02:
        break; // Only wait changes; it is deliberately not a Control member.
      case 0x03:
        next.pc = i.operands[0]!;
        break;
      case 0x04:
        next.stack.push(i.next);
        next.pc = i.operands[0]!;
        break;
      case 0x05:
        next.pc = next.stack.pop() ?? null;
        break;
      case 0x07:
        break; // Repetition is a stutter; taking next relaxes the wait guard.
      case 0x10:
        next.flags |= bit(i.operands[0]!);
        break;
      case 0x11:
        next.flags &= ~bit(i.operands[0]!);
        break;
      case 0x14:
      case 0x25:
        // frame refuses opcode execution while busy, so an executed request
        // is accepted. Every admitted script message is non-scrolling.
        next.scriptRequests++;
        if (state.flags & bit(13))
          next.completeAlternateFrames += 1 + Math.floor(state.hold / 11);
        break;
      case 0x19:
        if (i.operands[0] === 0x6ff46)
          next.hold = i.operands[1]! * 256 + i.operands[2]!;
        else assert.equal(i.operands[0], 0x6ff4a); // Consumed cabin selector.
        break;
      case 0x20:
        assert.deepEqual(i.operands, [0x26, 0x87]);
        next.keyA = true;
        break;
      default:
        throw new Error(`Unadmitted abstract opcode ${i.op}`);
    }
    add(next);
  }
  return { complete, states: [...states.values()], maxStates };
};

export const taxiRequestCountCandidates = (
  graph: ReturnType<typeof taxiRequestCountGraph>,
  narrative: DionScriptState,
  frame: number
) => {
  const key = controlKey({
    available: [...narrative.available],
    flags: flagsOf(narrative.flags),
    hold: narrative.hold,
    keyA: narrative.keyA,
    pc: narrative.pc,
    stack: [...narrative.stack]
  });
  const candidates = graph.states.filter(
    s =>
      controlKey(s) === key &&
      s.minimumInstructions <= frame &&
      s.scriptRequests <= narrative.message.serial
  );
  return { complete: graph.complete, candidates };
};

export const taxiZeroExternalFaceCertificate = (
  result: ReturnType<typeof taxiRequestCountCandidates>,
  target: Pick<DionSnapshot, 'tick' | 'frame' | 'narrative'>,
  periods: Readonly<
    Record<string, { readonly base: number; readonly alternate: number }>
  >
): {
  status: 'certified' | 'unknown';
  alternateFrames?: number;
  cursors?: Record<string, { base: number; alternate: number }>;
} => {
  // The old narrative has no campaign scheduler. Before this first atomic
  // threshold reader it supplies the expanded early selector; later sources
  // require the expanded campaign history even with zero old external IDs.
  if (target.tick >= 1_619_981) return { status: 'unknown' };
  const counts = [...new Set(result.candidates.map(s => s.scriptRequests))];
  const totals = [
    ...new Set(result.candidates.map(s => s.completeAlternateFrames))
  ];
  if (
    !result.complete ||
    counts.length !== 1 ||
    target.narrative.message.serial - counts[0]! !== 0 ||
    totals.length !== 1
  )
    return { status: 'unknown' };
  let count = totals[0]!;
  const message = target.narrative.message;
  if (message.busy && target.narrative.flags[13]) {
    const creationTick = target.tick - message.age - 1;
    assert.equal(creationTick % 11, 0);
    count -= 1 + Math.floor(message.hold / 11);
    count += 1 + Math.floor((target.tick - creationTick) / 11);
  }
  const cursors = Object.fromEntries(
    Object.entries(periods).map(([token, period]) => [
      token,
      {
        base: (target.frame - count) % period.base,
        alternate: count % period.alternate
      }
    ])
  );
  return { status: 'certified', alternateFrames: count, cursors };
};

export const auditTaxiRequestCounts = async ({ maxStates = 100_000 } = {}) => {
  const expanded = await loadTourcraftContent(async path => {
    const text = readFileSync(
      join(import.meta.dir, '../../..', path.slice(1)),
      'utf8'
    );
    return { text, value: JSON.parse(text) };
  });
  assert.equal(
    expanded.contentSha256,
    '5a75345df63a88282ac08b9a679020b26a8053542fc268bd64c25798ef062a19'
  );
  const sequences = record(
    record(expanded.programmes, 'programmes')['faceSequences'],
    'faces'
  );
  const periods = Object.fromEntries(
    ['$A1', '$A5'].map(token => {
      const face = record(sequences[token], token);
      return [
        token,
        {
          base: list(face['base'], 'base').length - 1,
          alternate: list(face['alternate'], 'alternate').length - 1
        }
      ];
    })
  );
  return withTaxiSource(async source => {
    const controls = source.dionControlCaptures(source.content);
    assert.equal(controls.length, 33);
    const graph = taxiRequestCountGraph(source.content, {
      frame: Math.max(...controls.map(c => c.record.snapshot.frame)),
      serial: Math.max(
        ...controls.map(c => c.record.snapshot.narrative.message.serial)
      ),
      maxStates
    });
    const rows = controls.map(control => {
      const session = new source.SourceSession(source.content);
      const n = (
        session as unknown as {
          narrative: {
            state: DionScriptState;
            request(text: string, hold: number, scrollsOut?: boolean): boolean;
            idMessage(id: number): boolean;
            frame(): void;
          };
        }
      ).narrative;
      let scriptRequests = 0;
      let externalRequests = 0;
      let alternateFrames = 0;
      const faces = new TaxiFaceModel(
        expanded.programmes,
        expanded.gameplay.initial
      );
      let externalDepth = 0;
      const request = n.request.bind(n);
      n.request = (text, hold, scrollsOut) => {
        const accepted = request(text, hold, scrollsOut);
        if (accepted) {
          if (externalDepth) externalRequests++;
          else scriptRequests++;
        }
        return accepted;
      };
      const idMessage = n.idMessage.bind(n);
      n.idMessage = id => {
        externalDepth++;
        try {
          return idMessage(id);
        } finally {
          externalDepth--;
        }
      };
      const opcode = n.frame.bind(n);
      n.frame = () => {
        opcode();
        const alternate = n.state.message.busy && n.state.flags[13]!;
        faces.frame(alternate);
        if (alternate) alternateFrames++;
      };
      const operations = control.operations.slice(0, control.index);
      for (const op of operations) {
        if (op.kind === 'advance') session.advance(op.seconds);
        else if (op.kind === 'press') session.press(op.action);
        else session.intent = op.intent;
      }
      const snapshot = session.captureResume();
      assert.deepEqual(snapshot, control.record);
      const target = snapshot.snapshot;
      assert.equal(
        scriptRequests + externalRequests,
        target.narrative.message.serial
      );
      const result = taxiRequestCountCandidates(
        graph,
        target.narrative,
        target.frame
      );
      const counts = [
        ...new Set(result.candidates.map(s => s.scriptRequests))
      ].sort((a, b) => a - b);
      if (result.complete) assert.ok(counts.includes(scriptRequests));
      const externalCounts = counts
        .map(c => target.narrative.message.serial - c)
        .sort((a, b) => a - b);
      const observedCursors = Object.fromEntries(
        Object.entries(faces.capture()).map(([token, face]) => [
          token,
          { base: face.base, alternate: face.alternate }
        ])
      );
      const faceCertificate = taxiZeroExternalFaceCertificate(
        result,
        target,
        periods
      );
      if (faceCertificate.status === 'certified') {
        assert.equal(faceCertificate.alternateFrames, alternateFrames);
        assert.deepEqual(faceCertificate.cursors, observedCursors);
      }
      return {
        name: control.name,
        tick: target.tick,
        frame: target.frame,
        sourceSnapshotSha256: sha(snapshot),
        serial: target.narrative.message.serial,
        observed: {
          scriptRequests,
          externalRequests,
          alternateFrames,
          cursors: observedCursors
        },
        abstractionComplete: result.complete,
        scriptRequestCandidates: counts,
        acceptedExternalRequestCandidates: externalCounts,
        acceptedExternalCountCertificate:
          result.complete && externalCounts.length === 1
            ? externalCounts[0]!
            : null,
        faceCursorCertificate: faceCertificate,
        expandedOwnerClass: 'unknown' as const
      };
    });
    return {
      sourceRevision: TAXI_SOURCE_REVISION,
      identity: source.codec.dionRecordIdentity(source.content),
      expandedContentSha256: expanded.contentSha256,
      faceSequencePeriods: periods,
      abstraction: {
        complete: graph.complete,
        states: graph.states.length,
        maxStates: graph.maxStates,
        projection:
          'availability, flags, hold, keyA, PC, stack, script requests, complete selected-message contribution; busy/wait and physical service guards relaxed',
        completeness:
          'Every genuine execution projects to these CFG paths: request serial is monotone; external accepted IDs do not change control members; busy/wait repetitions stutter; each VM opcode consumes a frame; genuine restores preserve narrative control/counts.',
        faceScope:
          'Script request creation precedes its face call; selected hold-h messages contribute 1+floor(h/11). For a current busy script message, creationTick=tick-age-1 fixes its partial contribution. Cursor continuity through expanded restores is conditional on the retained-cursor contract; no output omission is inferred.'
      },
      controls: rows,
      certifiedFaceCursorClasses: rows.filter(
        r => r.faceCursorCertificate.status === 'certified'
      ).length,
      limit:
        'Singleton complete overapproximation certifies narrative request counts and zero-external face-cursor projection only; no abstract path is a natural full-source witness, no divergent set proves ambiguity, and no full expanded-owner or output-rebuild classification is claimed.'
    };
  });
};

if (import.meta.main)
  console.log(JSON.stringify(await auditTaxiRequestCounts(), null, 2));
