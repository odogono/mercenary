import { fail, int, list, record } from '../../../web/src/dion/read.ts';

export const FACE_TOKENS = ['$A1', '$A5'] as const;
export type FaceToken = (typeof FACE_TOKENS)[number];
export type FaceSelection = 'initial' | 'base' | 'alternate';
export interface FaceCursors {
  readonly base: number;
  readonly alternate: number;
}
export interface FaceSnapshot {
  readonly faceSelection: FaceSelection;
  readonly faces: Readonly<Record<FaceToken, FaceCursors>>;
}

const onlyKeys = (
  raw: Record<string, unknown>,
  keys: readonly string[],
  path: string
) => {
  for (const key of Object.keys(raw)) {
    if (!keys.includes(key))
      fail(`${path}.${key} is not a serialized face owner`);
  }
};
const sequence = (
  programmes: unknown,
  token: FaceToken,
  selected: 'base' | 'alternate'
) => {
  const faces = record(
    record(programmes, 'programmes')['faceSequences'],
    'faceSequences'
  );
  return list(record(faces[token], token)[selected], `${token}.${selected}`);
};

// Research-only field contract. Immutable sequences have already been admitted
// by the TOURCRAFT content loader. Whole-session phase/reachability validation
// and the production Save/Resume transaction belong to #737/#711.
export const readFaceSnapshot = (
  programmes: unknown,
  value: unknown
): FaceSnapshot => {
  const raw = record(value, 'animation');
  onlyKeys(raw, ['faceSelection', 'faces'], 'animation');
  const tag = raw['faceSelection'];
  if (tag !== 'initial' && tag !== 'base' && tag !== 'alternate') {
    return fail('animation.faceSelection must be initial, base or alternate');
  }
  const faces = record(raw['faces'], 'animation.faces');
  onlyKeys(faces, FACE_TOKENS, 'animation.faces');
  const read = (token: FaceToken): FaceCursors => {
    const path = `animation.faces.${token}`;
    const cursors = record(faces[token], path);
    onlyKeys(cursors, ['base', 'alternate'], path);
    const base = int(
      cursors['base'],
      `${path}.base`,
      0,
      sequence(programmes, token, 'base').length - 2
    );
    const alternate = int(
      cursors['alternate'],
      `${path}.alternate`,
      0,
      sequence(programmes, token, 'alternate').length - 2
    );
    if (tag === 'initial' && (base !== 0 || alternate !== 0)) {
      fail(`${path} must have zero cursors for initial faceSelection`);
    }
    return { base, alternate };
  };
  return { faceSelection: tag, faces: { $A1: read('$A1'), $A5: read('$A5') } };
};

// Read the saved positions; never execute the animation writer during restore.
export const rebuildFaceOutputs = (programmes: unknown, value: unknown) => {
  const saved = readFaceSnapshot(programmes, value);
  const face = (token: FaceToken) => {
    const cursors = saved.faces[token];
    const selected = saved.faceSelection;
    const output =
      selected === 'initial'
        ? 8192
        : int(
            sequence(programmes, token, selected)[cursors[selected]],
            `${token}.glyph`,
            1,
            255
          ) << 8;
    return { ...cursors, output };
  };
  return { $A1: face('$A1'), $A5: face('$A5') };
};

// An independent candidate continuation over the saved owners, used only by
// research comparisons. Selection is supplied by the uninterrupted VM observer.
export const advanceFaceSnapshot = (
  programmes: unknown,
  value: unknown,
  selected: Exclude<FaceSelection, 'initial'>
): FaceSnapshot => {
  const saved = readFaceSnapshot(programmes, value);
  const advance = (token: FaceToken) => ({
    ...saved.faces[token],
    [selected]:
      (saved.faces[token][selected] + 1) %
      (sequence(programmes, token, selected).length - 1)
  });
  return {
    faceSelection: selected,
    faces: { $A1: advance('$A1'), $A5: advance('$A5') }
  };
};
