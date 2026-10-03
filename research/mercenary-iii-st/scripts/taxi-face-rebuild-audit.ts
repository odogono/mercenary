import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import {
  planDionFrame,
  type DionFrameWorld
} from '../../../web/src/dion/frame.ts';
import { int, list, record } from '../../../web/src/dion/read.ts';
import { dionFrameState } from '../../../web/src/dion/session.ts';
import { tourcraftFrameWorld } from '../../../web/src/dion/tourcraftFrame.ts';
import { auditTaxiEarlyInitialization } from './taxi-early-audit.ts';
import { TaxiFaceModel, type TaxiFaceState } from './taxi-face-model.ts';
import {
  advanceFaceSnapshot,
  readFaceSnapshot,
  rebuildFaceOutputs,
  type FaceSnapshot
} from './taxi-face-snapshot.ts';

const tokens = ['$A1', '$A5'] as const;
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

// Research candidate only: read each selected sequence at the saved cursor,
// without executing the animation writer or incrementing either cursor.
const rebuild = (
  programmes: unknown,
  states: Record<(typeof tokens)[number], TaxiFaceState>,
  lastSelection: boolean | null
) =>
  Object.fromEntries(
    tokens.map(token => {
      if (lastSelection === null) return [token, 8192];
      const selected = lastSelection ? 'alternate' : 'base';
      const sequences = record(
        record(programmes, 'programmes')['faceSequences'],
        'faces'
      );
      const sequence = list(
        record(sequences[token], token)[selected],
        selected
      );
      const glyph = int(sequence[states[token][selected]], 'glyph');
      assert.ok(glyph > 0 && glyph <= 255);
      return [token, glyph << 8];
    })
  );

export const auditTaxiFaceRebuild = async () => {
  // Re-execute the actual pinned input histories, source codecs and 600-frame
  // uninterrupted comparison. Do not treat the committed ledger as execution.
  const text = readFileSync(
    new URL(
      '../../../payload/dion/tourcraft/presentation/programmes.json',
      import.meta.url
    ),
    'utf8'
  );
  const programmes: unknown = JSON.parse(text);
  const initial: unknown = JSON.parse(
    readFileSync(
      new URL(
        '../../../payload/dion/tourcraft/presentation/gameplay.json',
        import.meta.url
      ),
      'utf8'
    )
  ).initial;
  let world: DionFrameWorld | undefined;
  let restored: FaceSnapshot[] = [];
  let framesPerHistory = 0;
  let matchingFaceStates = 0;
  let matchingFrameDescriptions = 0;
  let initialTags: string[] = [];
  const early = await auditTaxiEarlyInitialization(
    (frame, histories, content) => {
      world ??= tourcraftFrameWorld(content, 3);
      if (frame === 0) {
        // Serialize only the approved owners, then read the actual JSON back.
        restored = histories.map(h =>
          readFaceSnapshot(
            programmes,
            JSON.parse(
              JSON.stringify({
                faceSelection: h.faceSelection,
                faces: Object.fromEntries(
                  tokens.map(token => [
                    token,
                    {
                      base: h.faces[token].base,
                      alternate: h.faces[token].alternate
                    }
                  ])
                )
              })
            )
          )
        );
        initialTags = restored.map(s => s.faceSelection);
      }
      for (const [i, h] of histories.entries()) {
        if (frame > 0) {
          assert.notEqual(h.faceSelection, 'initial');
          restored[i] = advanceFaceSnapshot(
            programmes,
            restored[i],
            h.faceSelection as 'base' | 'alternate'
          );
        }
        const faces = rebuildFaceOutputs(programmes, restored[i]);
        assert.deepEqual(faces, h.faces);
        matchingFaceStates++;
        const liveTokens = (outputs: typeof faces) =>
          new Map(
            tokens.map(token => [
              Number.parseInt(token.slice(1), 16),
              [outputs[token].output >> 8]
            ])
          );
        const state = dionFrameState(h.snapshot);
        // Both calls plan the saved moment, before any later input/advance.
        // All non-face inputs come from the uninterrupted source observation.
        const reference = planDionFrame(world!, {
          ...state,
          tokens: liveTokens(h.faces)
        });
        const candidate = planDionFrame(world!, {
          ...state,
          tokens: liveTokens(faces)
        });
        assert.deepEqual(candidate, reference);
        matchingFrameDescriptions++;
      }
      framesPerHistory++;
    }
  );
  const { collision } = early;
  const cursors = collision.histories.map(h =>
    Object.fromEntries(
      tokens.map(token => [
        token,
        {
          alternate: h.faces[token].alternate,
          base: h.faces[token].base
        }
      ])
    )
  );
  assert.deepEqual(cursors[0], cursors[1]);
  assert.equal(collision.source.messageBusy, false);
  const rebuilt = rebuild(programmes, collision.histories[0]!.faces, false);
  const outputs = collision.histories.map(h =>
    Object.fromEntries(tokens.map(token => [token, h.faces[token].output]))
  );
  const matchesRetained = outputs.map(output =>
    isDeepStrictEqual(output, rebuilt)
  );
  assert.deepEqual(matchesRetained, [true, false]);
  const lastSelectionRebuildMatches = collision.histories.map(h =>
    isDeepStrictEqual(
      rebuild(programmes, h.faces, h.lastAlternate),
      Object.fromEntries(tokens.map(token => [token, h.faces[token].output]))
    )
  );
  assert.deepEqual(lastSelectionRebuildMatches, [true, true]);

  // Synthetic writer-order control, not a naturally reached source collision:
  // one base update and a full 45-update alternate cycle, in opposite orders.
  const order = [true, false].map(baseLast => {
    const face = new TaxiFaceModel(programmes, initial);
    if (!baseLast) face.frame(false);
    for (let i = 0; i < 45; i++) face.frame(true);
    if (baseLast) face.frame(false);
    return face.capture()['$A1'];
  });
  assert.equal(order[0]!.base, order[1]!.base);
  assert.equal(order[0]!.alternate, order[1]!.alternate);
  assert.notEqual(order[0]!.output, order[1]!.output);

  // Both base cursors return to zero after lcm(31, 21) updates. Cursor zero
  // cannot distinguish this state from the coherent blank opening.
  const wrapped = new TaxiFaceModel(programmes, initial);
  const opening = wrapped.capture();
  for (let i = 0; i < 651; i++) wrapped.frame(false);
  const afterWrap = wrapped.capture();
  for (const token of tokens) {
    assert.equal(afterWrap[token].base, opening[token].base);
    assert.equal(afterWrap[token].alternate, opening[token].alternate);
    assert.notEqual(afterWrap[token].output, opening[token].output);
  }
  assert.deepEqual(
    rebuild(programmes, opening, null),
    Object.fromEntries(tokens.map(token => [token, opening[token].output]))
  );
  assert.deepEqual(
    rebuild(programmes, afterWrap, false),
    Object.fromEntries(tokens.map(token => [token, afterWrap[token].output]))
  );
  return {
    sourceRevision: early.sourceRevision,
    identity: early.identity,
    expandedContentSha256: early.expandedContentSha256,
    programmesSha256: sha(text),
    disposition:
      'D2 accepted shared initial/base/alternate faceSelection; derived outputs rebuild before first reader',
    taggedRestore: {
      evidenceClass:
        'Research-only tagged restoration against uninterrupted pinned-I2 face references and promoted METIS frame planner',
      initialTags,
      framesPerHistory,
      matchingFaceStates,
      matchingFrameDescriptions,
      serializedOutputs: false,
      scope:
        'Four face cursors/tag only; non-face inputs supplied by uninterrupted source; no schema-2 codec, total migration constructor or original raster claim'
    },
    collision: {
      evidenceClass:
        'Ordinary pinned-I2 input replay with independent documented face writer',
      sourceSnapshotSha256: collision.sourceSnapshotSha256,
      saveBytesSha256: collision.saveBytesSha256,
      prefixOperationsSha256: collision.prefixOperationsSha256,
      tick: collision.source.tick,
      frame: collision.source.frame,
      messageBusy: collision.source.messageBusy,
      equalProposedInputs:
        collision.equalCompleteSource &&
        isDeepStrictEqual(cursors[0], cursors[1]),
      cursors: cursors[0],
      lastSelections: collision.histories.map(h => h.lastAlternate),
      retainedOutputs: outputs,
      rebuilt,
      matchesRetained,
      lastSelectionRebuildMatches,
      visibleFirstFrameMismatchProved: false,
      afterNextFrameEqual: collision.afterNextFrameEqual,
      equalFutureFrames: collision.equalFutureFrames,
      futureComparison:
        'Uninterrupted references after their next animation writer; not a restore omission proof'
    },
    a1OrderWitness: {
      evidenceClass: 'Synthetic independent writer-order control',
      equalCursors: true,
      base: order[0]!.base,
      alternate: order[0]!.alternate,
      outputs: order.map(s => s.output)
    },
    opening: {
      evidenceClass:
        'Synthetic independent base-wrap control against coherent opening',
      baseUpdates: 651,
      sameCursorsAfterWrap: true,
      outputs: [opening['$A1'].output, afterWrap['$A1'].output],
      a5Outputs: [opening['$A5'].output, afterWrap['$A5'].output]
    }
  };
};

if (import.meta.main)
  console.log(JSON.stringify(await auditTaxiFaceRebuild(), null, 2));
