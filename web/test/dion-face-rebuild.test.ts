import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { TaxiFaceModel } from '../../research/mercenary-iii-st/scripts/taxi-face-model.ts';
import { auditTaxiFaceRebuild } from '../../research/mercenary-iii-st/scripts/taxi-face-rebuild-audit.ts';
import {
  advanceFaceSnapshot,
  readFaceSnapshot,
  rebuildFaceOutputs
} from '../../research/mercenary-iii-st/scripts/taxi-face-snapshot.ts';

test('current selection cannot rebuild both retained outputs of the ordinary partial-frame collision', async () => {
  const audit = await auditTaxiFaceRebuild();
  expect(audit).toEqual(
    JSON.parse(
      readFileSync(
        new URL(
          '../../research/mercenary-iii-st/taxi-face-rebuild-evidence.json',
          import.meta.url
        ),
        'utf8'
      )
    )
  );
  expect(audit.collision.equalProposedInputs).toBe(true);
  expect(audit.collision.rebuilt).toEqual({ $A1: 67 << 8, $A5: 80 << 8 });
  expect(audit.collision.matchesRetained).toEqual([true, false]);
  expect(audit.collision.lastSelectionRebuildMatches).toEqual([true, true]);
  expect(audit.collision.afterNextFrameEqual).toBe(true);
  expect(audit.collision.equalFutureFrames).toBe(600);
  expect(audit.a1OrderWitness.equalCursors).toBe(true);
  expect(audit.a1OrderWitness.outputs).toEqual([67 << 8, 70 << 8]);
  expect(audit.opening.sameCursorsAfterWrap).toBe(true);
  expect(audit.opening.outputs).toEqual([8192, 67 << 8]);
  expect(audit.taggedRestore.initialTags).toEqual(['base', 'alternate']);
  expect(audit.taggedRestore.framesPerHistory).toBe(602);
  expect(audit.taggedRestore.matchingFaceStates).toBe(1204);
  expect(audit.taggedRestore.matchingFrameDescriptions).toBe(1204);
  expect(audit.taggedRestore.serializedOutputs).toBe(false);
}, 30_000);

const programmes = JSON.parse(
  readFileSync(
    new URL(
      '../../payload/dion/tourcraft/presentation/programmes.json',
      import.meta.url
    ),
    'utf8'
  )
);
const collisionFaces = {
  $A1: { alternate: 25, base: 13 },
  $A5: { alternate: 2, base: 8 }
};

test('the uninterrupted reference records initial and each completed shared selection', () => {
  const initial = JSON.parse(
    readFileSync(
      new URL(
        '../../payload/dion/tourcraft/presentation/gameplay.json',
        import.meta.url
      ),
      'utf8'
    )
  ).initial;
  const model = new TaxiFaceModel(programmes, initial);
  expect(model.faceSelection).toBe('initial');
  model.frame(true);
  expect(model.faceSelection).toBe('alternate');
  model.frame(false);
  expect(model.faceSelection).toBe('base');
});

test('the saved last selection reconstructs P and Q without consuming a frame', () => {
  const base = { faces: collisionFaces, faceSelection: 'base' };
  const alternate = { faces: collisionFaces, faceSelection: 'alternate' };
  const before = JSON.stringify([base, alternate]);
  expect(rebuildFaceOutputs(programmes, base).$A5.output).toBe(80 << 8);
  expect(rebuildFaceOutputs(programmes, alternate).$A5.output).toBe(81 << 8);
  expect(JSON.stringify([base, alternate])).toBe(before);
});

test('initial is distinct from a noninitial wrap with the same zero cursors', () => {
  const faces = {
    $A1: { alternate: 0, base: 0 },
    $A5: { alternate: 0, base: 0 }
  };
  expect(
    rebuildFaceOutputs(programmes, { faces, faceSelection: 'initial' }).$A1
      .output
  ).toBe(8192);
  expect(
    rebuildFaceOutputs(programmes, { faces, faceSelection: 'base' }).$A1.output
  ).toBe(67 << 8);
  expect(
    rebuildFaceOutputs(programmes, { faces, faceSelection: 'alternate' }).$A1
      .output
  ).toBe(70 << 8);
});

test('tagged reconstruction rejects malformed and contradictory saved owners', () => {
  for (const faceSelection of [undefined, null, false, 'current', 1]) {
    expect(() =>
      readFaceSnapshot(programmes, { faces: collisionFaces, faceSelection })
    ).toThrow('faceSelection');
  }
  expect(() =>
    readFaceSnapshot(programmes, {
      faces: collisionFaces,
      faceSelection: 'initial'
    })
  ).toThrow('initial');
  for (const alternate of [-1, 45, 1.5]) {
    expect(() =>
      readFaceSnapshot(programmes, {
        faces: { ...collisionFaces, $A1: { alternate, base: 13 } },
        faceSelection: 'base'
      })
    ).toThrow('$A1.alternate');
  }
  expect(() =>
    readFaceSnapshot(programmes, {
      faces: {
        ...collisionFaces,
        $A1: { ...collisionFaces.$A1, output: 17_152 }
      },
      faceSelection: 'base'
    })
  ).toThrow('output');
});

test('a completed update advances only selected cursors and records their shared selection', () => {
  const saved = {
    faces: {
      $A1: { alternate: 44, base: 13 },
      $A5: { alternate: 30, base: 8 }
    },
    faceSelection: 'base'
  };
  const next = advanceFaceSnapshot(programmes, saved, 'alternate');
  expect(next).toEqual({
    faces: {
      $A1: { alternate: 0, base: 13 },
      $A5: { alternate: 0, base: 8 }
    },
    faceSelection: 'alternate'
  });
  expect(rebuildFaceOutputs(programmes, next).$A1.output).toBe(70 << 8);
  expect(saved.faces.$A1.alternate).toBe(44);
});
