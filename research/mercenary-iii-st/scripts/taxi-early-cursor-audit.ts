import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { int, list, record } from '../../../web/src/dion/read.ts';
import type { DionScriptState } from '../../../web/src/dion/script.ts';
import { loadTourcraftContent } from '../../../web/src/dion/tourcraftContent.ts';
import { TaxiFaceModel } from './taxi-face-model.ts';
import { TaxiHistoryModel } from './taxi-history-model.ts';
import { readTaxiSourceCandidate } from './taxi-source-eligibility.ts';
import { TAXI_SOURCE_REVISION, withTaxiSource } from './taxi-source.ts';

const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Ordinary uninterrupted input only. The independent VM supplies each face
// selector; wrappers preserve all archived method results and write no state.
export const auditTaxiEarlyCursorAmbiguity = async () => {
  const expanded = await loadTourcraftContent(async path => {
    const text = readFileSync(
      join(import.meta.dir, '../../..', path.slice(1)),
      'utf8'
    );
    return { text, value: JSON.parse(text) };
  });
  assert.equal(
    expanded.contentSha256,
    '824a2ec18b5cf98980544bb4d9e178cb9a47c013785b49319035c841569299b0'
  );
  return withTaxiSource(async source => {
    const controls = source.dionControlCaptures(source.content);
    const control = controls.find(c => c.name === 'sol/selected');
    assert.ok(control);
    const prefix = control.operations.slice(0, control.index);
    const boardIndex = prefix
      .map(op => (op.kind === 'press' ? op.action : null))
      .lastIndexOf('board');
    assert.ok(boardIndex >= 0);
    const operations = prefix.slice(0, boardIndex);
    const identity = source.codec.dionRecordIdentity(source.content);
    const histories = [7, 8].map(delay => {
      const session = new source.SourceSession(source.content);
      const vm = new TaxiHistoryModel(
        expanded.legacy,
        expanded.programmes,
        expanded.gameplay.initial
      );
      const faces = new TaxiFaceModel(
        expanded.programmes,
        expanded.gameplay.initial
      );
      const acceptedIds: {
        id: number;
        tick: number;
        alternate: boolean;
        pc: number | null;
      }[] = [];
      const observed = session as unknown as {
        frame(): void;
        narrative: {
          tick(): void;
          frame(): void;
          start(id: number): boolean;
          idMessage(id: number): boolean;
          state: DionScriptState;
        };
      };
      const n = observed.narrative;
      const tick = n.tick.bind(n);
      n.tick = () => {
        vm.tick();
        tick();
      };
      const frame = observed.frame.bind(session);
      observed.frame = () => {
        vm.beforeInput(session.snapshot.clock.seconds);
        frame();
      };
      const opcode = n.frame.bind(n);
      n.frame = () => {
        vm.frame();
        faces.frame(vm.state.messageRemaining !== 0 && vm.state.flags[13]!);
        opcode();
        assert.equal(vm.state.pc, n.state.pc);
        assert.equal(vm.state.flags[13], n.state.flags[13]);
        assert.equal(vm.state.messageRemaining !== 0, n.state.message.busy);
      };
      const start = n.start.bind(n);
      n.start = id => {
        vm.start(id);
        return start(id);
      };
      const message = n.idMessage.bind(n);
      n.idMessage = id => {
        vm.idMessage(id);
        const accepted = message(id);
        if (accepted)
          acceptedIds.push({
            id,
            tick: session.snapshot.tick,
            alternate: n.state.flags[13]!,
            pc: n.state.pc
          });
        return accepted;
      };
      for (const op of operations) {
        if (op.kind === 'advance') session.advance(op.seconds);
        else if (op.kind === 'press') session.press(op.action);
        else session.intent = op.intent;
      }
      session.press('board');
      session.advance(11 / 50);
      assert.equal(session.snapshot.taxi.passenger, true);
      session.press('plus');
      session.advance(11 / 50);
      assert.equal(session.snapshot.taxi.destination, 0x60);
      for (let i = 0; i < delay; i++) session.advance(11 / 50);
      session.press('star');
      session.advance(11 / 50);
      const startTick = session.snapshot.tick;
      while (session.snapshot.frame < 2000) session.advance(11 / 50);
      assert.equal(session.snapshot.taxi.counter, 2);
      assert.equal(session.snapshot.taxi.destination, 0);
      const beforeLeave = session.captureResume();
      // Common ordinary Leave resets the last sound programme's elapsed owner.
      // The earlier arrival times are otherwise retained by that old owner.
      session.press('leave');
      session.advance(11 / 50);
      assert.equal(session.snapshot.taxi.passenger, false);
      assert.equal(session.snapshot.clock.day, 0);
      assert.ok(session.snapshot.tick < 1_619_981);
      session.drainSound();
      const snapshot = session.captureResume();
      const saveBytes = source.codec.encodeDionRecord({
        identity,
        savedAt: '2026-10-03T00:00:00.000Z',
        schemaVersion: 1,
        snapshot,
        where: 'early solicitor cursor collision'
      });
      assert.deepEqual(
        readTaxiSourceCandidate(saveBytes, source).snapshot,
        snapshot
      );
      assert.deepEqual(
        new source.SourceSession(
          source.content,
          source.codec.decodeDionRecord(saveBytes, identity, source.content)
            .snapshot
        ).captureResume(),
        snapshot
      );
      const resumeBytes = source.resume.encodeDionResume(
        source.content,
        session
      );
      const resumed = source.resume.readDionResume(
        {
          getItem: () => resumeBytes,
          setItem: () => {
            throw new Error('Unexpected storage write');
          },
          removeItem: () => {
            throw new Error('Unexpected storage removal');
          }
        },
        source.content
      );
      assert.equal(resumed.reason, null);
      assert.deepEqual(resumed.session.captureResume(), snapshot);
      const state = faces.capture();
      // Independent recovered glyph lookup: overwriting outputs cannot identify
      // distinct serialized cursor pairs. This does not implement #736 restore.
      const programmes = expanded.programmes as unknown as {
        faceSequences: Record<string, { base: number[] }>;
      };
      const baseRebuild = Object.fromEntries(
        Object.entries(state).map(([token, face]) => [
          token,
          programmes.faceSequences[token]!.base[face.base]! << 8
        ])
      );
      return {
        session,
        vm,
        faces,
        snapshot,
        saveBytes,
        resumeRecord: { ...JSON.parse(resumeBytes), savedAt: null },
        summary: {
          delayFrames: delay,
          startTick,
          acceptedIds,
          alternateFrames: faces.alternateFrames,
          faces: state,
          baseRebuild,
          beforeLeaveSoundElapsed: beforeLeave.snapshot.sound.elapsed
        }
      };
    });
    const [a, b] = histories;
    assert.ok(a && b);
    assert.deepEqual(a.snapshot, b.snapshot);
    assert.equal(a.saveBytes, b.saveBytes);
    assert.deepEqual(a.resumeRecord, b.resumeRecord);
    assert.deepEqual(a.vm.state, b.vm.state);
    assert.notDeepEqual(a.summary.faces, b.summary.faces);
    assert.notDeepEqual(a.summary.baseRebuild, b.summary.baseRebuild);
    const model = expanded.geometry.get('model-036974');
    assert.ok(model);
    const form = model.variants['form=default']!;
    const face = list(form['faces'], 'faces')
      .map(f => record(f, 'face'))
      .find(f => f['kind'] === 'text');
    assert.ok(face);
    assert.equal(face['flags'], 0x8007);
    assert.deepEqual(face['text'], [0xa5]);
    const glyphs = record(expanded.support['glyphs'], 'glyphs');
    const drawingInputs = histories.map(h => {
      const code = h.summary.baseRebuild['$A5']! >>> 8;
      const glyph = record(
        glyphs[`7:${code.toString(16).toUpperCase()}`],
        'glyph'
      );
      assert.equal(int(glyph['code'], 'code'), code);
      return {
        code,
        points: list(glyph['points'], 'points').length,
        linePrimitives: list(glyph['primitives'], 'primitives').length,
        glyphSha256: sha(glyph)
      };
    });
    assert.deepEqual(
      drawingInputs.map(g => g.code),
      [80, 79]
    );
    assert.notDeepEqual(drawingInputs[0], drawingInputs[1]);
    let differentFutureCursorFrames = 0;
    let differentFutureOutputFrames = 0;
    const firstDifferentGlyphs: {
      frameOffset: number;
      outputs: Record<string, number>[];
    }[] = [];
    for (let frame = 1; frame <= 600; frame++) {
      const requestCounts = histories.map(h => h.vm.requests.length);
      for (const h of histories) h.session.advance(11 / 50);
      assert.deepEqual(a.session.captureResume(), b.session.captureResume());
      assert.deepEqual(a.session.drainSound(), b.session.drainSound());
      assert.deepEqual(a.vm.state, b.vm.state);
      assert.deepEqual(
        a.vm.requests.slice(requestCounts[0]),
        b.vm.requests.slice(requestCounts[1])
      );
      const states = histories.map(h => h.faces.capture());
      const cursors = states.map(state =>
        Object.fromEntries(
          Object.entries(state).map(([token, face]) => [
            token,
            [face.base, face.alternate]
          ])
        )
      );
      assert.notDeepEqual(cursors[0], cursors[1]);
      for (const token of ['$A1', '$A5'] as const) {
        assert.notEqual(states[0]![token].base, states[1]![token].base);
        assert.notEqual(
          states[0]![token].alternate,
          states[1]![token].alternate
        );
      }
      differentFutureCursorFrames++;
      const outputs = states.map(state =>
        Object.fromEntries(
          Object.entries(state).map(([token, face]) => [token, face.output])
        )
      );
      if (!isDeepStrictEqual(outputs[0], outputs[1])) {
        differentFutureOutputFrames++;
        if (firstDifferentGlyphs.length < 3)
          firstDifferentGlyphs.push({ frameOffset: frame, outputs });
      }
    }
    assert.ok(differentFutureOutputFrames > 0);
    return {
      sourceRevision: TAXI_SOURCE_REVISION,
      identity,
      expandedContentSha256: expanded.contentSha256,
      prefixControl: control.name,
      prefixOperationCount: boardIndex,
      prefixOperationsSha256: sha(operations),
      commonCaptureFrame: 2001,
      source: {
        tick: a.snapshot.snapshot.tick,
        frame: a.snapshot.snapshot.frame,
        clock: a.snapshot.snapshot.clock,
        remainder: a.snapshot.remainder,
        messageSerial: a.snapshot.snapshot.narrative.message.serial,
        messageAge: a.snapshot.snapshot.narrative.message.age,
        messageText: a.snapshot.snapshot.narrative.message.text,
        wait: a.snapshot.snapshot.narrative.wait
      },
      sourceSnapshotSha256: sha(a.snapshot),
      saveBytesSha256: createHash('sha256').update(a.saveBytes).digest('hex'),
      equalCompleteSource: true,
      equalSaveBytes: true,
      equalResumeExceptTimestamp: true,
      histories: histories.map(h => h.summary),
      drawingEffect: { model: model.id, token: '$A5', font: 7, drawingInputs },
      equalFutureSourceFrames: 600,
      differentFutureCursorFrames,
      differentFutureOutputFrames,
      firstDifferentGlyphs,
      limit:
        'Independent recovered VM/face reader comparison; no original-machine rerun, expanded browser restore or indexed scene raster comparison.'
    };
  });
};

if (import.meta.main)
  console.log(JSON.stringify(await auditTaxiEarlyCursorAmbiguity(), null, 2));
