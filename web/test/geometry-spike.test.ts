import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { recoverDamoclesModel } from '../src/geometrySpike/baseline.ts';
import { checkAsset, compose } from '../src/geometrySpike/compose.ts';
import {
  canonicalJson,
  type GeometryAsset,
  type Part,
  type Sidecar
} from '../src/geometrySpike/contract.ts';
import {
  compare,
  loopChange,
  semanticDiff
} from '../src/geometrySpike/diff.ts';
import { decodeGlb } from '../src/geometrySpike/glb.ts';
import { decodeMgeo } from '../src/geometrySpike/mgeo.ts';
import { FIXTURES, sourceRecord } from '../tools/geometry-spike/fixtures.ts';
import { payloadDirectory, repositoryRoot } from './replay/artifacts.ts';

/// #671 spike: the contract, its composition back to payload records, both candidates' readers
/// and the review tools. The Blender side runs in research/blender-geometry-spike.

const payload = payloadDirectory();
const golden = join(
  repositoryRoot,
  'research/blender-geometry-spike/evidence/golden'
);
const fixture = (slug: string) => FIXTURES.find(f => f.slug === slug)!;

const withPart = (
  asset: GeometryAsset,
  id: string,
  change: (part: Part) => Part
): GeometryAsset => ({
  ...asset,
  parts: asset.parts.map(part => (part.id === id ? change(part) : part))
});

const move = (a: GeometryAsset, id: number, y: number) =>
  withPart(a, 'variant:record', p => ({
    ...p,
    vertices: p.vertices.map(v =>
      v.id === id ? { ...v, co: [v.co[0], y, v.co[2]] as const } : v
    )
  }));

const damoclesFile = (id: string) => {
  const document = `damocles/models/${id}.json`;
  return recoverDamoclesModel(
    JSON.parse(readFileSync(join(payload, document), 'utf8')),
    { document, path: '$', sha256: '' }
  );
};

describe('#671 geometry contract', () => {
  for (const f of FIXTURES) {
    test(`${f.slug} composes back to its payload record exactly`, async () => {
      const recovered = await f.recover(payload);
      const { record } = compose(recovered.asset, recovered.sidecar);
      expect(canonicalJson(record)).toBe(
        canonicalJson(sourceRecord(payload, recovered))
      );
    });
  }

  test('a baseline is the same every time it is recovered', async () => {
    const f = fixture('damocles-structure-01484e');
    const [a, b] = [await f.recover(payload), await f.recover(payload)];
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
});

describe('#671 references', () => {
  test('deleting a plan face the region queues draw is refused at every site', async () => {
    const { asset, sidecar } = await fixture(
      'damocles-structure-01484e'
    ).recover(payload);
    const edited = withPart(asset, 'plan', part => ({
      ...part,
      faces: part.faces.filter(face => face.record !== 0)
    }));
    const errors = checkAsset(edited, sidecar).filter(
      d => d.severity === 'error'
    );
    expect(errors.length).toBe(
      sidecar.references.filter(
        r =>
          r.target.kind === 'record' &&
          r.target.part === 'plan' &&
          r.target.record === 0
      ).length
    );
    expect(errors[0]!.site).toMatch(
      /^structureSelection\.regions\[\d+]\.queue\[\d+]$/
    );
    expect(errors[0]!.message).toContain('remap ref');
    expect(() => compose(edited, sidecar)).toThrow('source record 0 in plan');
  });

  test('an explicit sidecar remap composes to the new record', async () => {
    const { asset, sidecar } = await fixture(
      'damocles-structure-01484e'
    ).recover(payload);
    const edited = withPart(asset, 'plan', part => ({
      ...part,
      faces: part.faces.filter(face => face.record !== 0)
    }));
    const remapped: Sidecar = {
      ...sidecar,
      references: sidecar.references.map(r =>
        r.target.kind === 'record' &&
        r.target.part === 'plan' &&
        r.target.record === 0
          ? { ...r, target: { ...r.target, record: 1 } }
          : r
      )
    };
    const { record } = compose(edited, remapped);
    const queue = (
      record as {
        model: {
          structureSelection: {
            regions: { queue: { index?: number; kind: string }[] }[];
          };
        };
      }
    ).model.structureSelection.regions[0]!.queue;
    expect(queue.filter(e => e.kind === 'face' && e.index === 0)).toEqual([]);
    expect(queue.filter(e => e.kind === 'face' && e.index === 1).length).toBe(
      2
    );
  });

  test('a positional attachment-face reference follows its face, and refuses its deletion', () => {
    const { asset, sidecar } = damoclesFile(
      'structure-00fc7e-at-3x3-detail-40'
    );
    const queue = (asset: GeometryAsset) =>
      (
        compose(asset, sidecar).record as {
          model: {
            structureSelection: {
              regions: { queue: { index?: number; kind: string }[] }[];
            };
          };
        }
      ).model.structureSelection.regions[3]!.queue.filter(
        e => e.kind === 'attachmentFace'
      );
    expect(queue(asset).map(e => e.index)).toEqual([1, 0]);
    const withoutFace = (id: number) =>
      withPart(asset, 'attachment:1020', part => ({
        ...part,
        faces: part.faces.filter(face => face.id !== id)
      }));
    // Face 2 is unreferenced; deleting it changes nothing the queue names.
    expect(queue(withoutFace(2)).map(e => e.index)).toEqual([1, 0]);
    // Deleting face 0 moves face 1 to position 0, and the reference to face 0 has nothing to name.
    expect(() => compose(withoutFace(0), sidecar)).toThrow(
      'face 0 in attachment:1020'
    );
    const kept = withPart(asset, 'attachment:1020', part => ({
      ...part,
      faces: [part.faces[1]!, ...part.faces.slice(2), part.faces[0]!]
    }));
    expect(queue(kept).map(e => e.index)).toEqual([0, 5]);
  });

  test('a record a detail never drew is a recovered fact, not a break', () => {
    const { sidecar } = damoclesFile('interior-0303d6');
    expect(
      sidecar.references.every(r => typeof r.baselineResolved === 'boolean')
    ).toBe(true);
  });
});

describe('#671 malformed assets', () => {
  test('a surface cell may hold at most 60 local vertices', async () => {
    const { asset, sidecar } = await fixture('targ-surface-cell-1').recover(
      payload
    );
    const grown = withPart(asset, 'wireframe', part => ({
      ...part,
      vertices: [
        ...part.vertices,
        ...Array.from({ length: 41 }, (_, k) => ({
          co: [k, 0, 0] as const,
          id: 100 + k
        }))
      ]
    }));
    expect(() => compose(grown, sidecar)).toThrow('at most 60');
  });

  test('non-integer coordinates, duplicate identities and faces on external endpoints are refused', async () => {
    const { asset, sidecar } = await fixture('targ-surface-cell-1').recover(
      payload
    );
    const messages = (edited: GeometryAsset) =>
      checkAsset(edited, sidecar)
        .filter(d => d.severity === 'error')
        .map(d => d.message);
    expect(
      messages(
        withPart(asset, 'wireframe', p => ({
          ...p,
          vertices: p.vertices.map((v, k) =>
            k === 5 ? { ...v, co: [1.5, 0, 0] as const } : v
          )
        }))
      )
    ).toEqual([expect.stringContaining('non-integer')]);
    expect(
      messages(
        withPart(asset, 'wireframe', p => ({
          ...p,
          lines: [...p.lines, { ...p.lines[0]! }]
        }))
      )
    ).toEqual(['duplicate line identity']);
    const coffin = await fixture('damocles-object-03f774').recover(payload);
    expect(
      checkAsset(
        withPart(coffin.asset, 'variant:record', p => ({
          ...p,
          faces: [...p.faces, { ...p.faces[0]!, id: 99, loop: [0, 1, 0] }]
        })),
        coffin.sidecar
      ).map(d => d.message)
    ).toContain('face repeats a vertex');
  });
});

describe('#671 candidate readers', () => {
  for (const slug of [
    'damocles-object-03f774',
    'damocles-atropos-ground-02064a-00',
    'targ-surface-cell-1'
  ]) {
    test(`${slug}: the Python-written MGEO and GLB decode to the recovered baseline`, async () => {
      const { asset } = await fixture(slug).recover(payload);
      const expected = canonicalJson(asset);
      // A mismatch after a payload change means the goldens are stale: regenerate them with
      // research/blender-geometry-spike's roundtrip and copy them into evidence/golden.
      expect(
        canonicalJson(
          decodeMgeo(new Uint8Array(readFileSync(join(golden, `${slug}.mgeo`))))
        )
      ).toBe(expected);
      expect(
        canonicalJson(
          decodeGlb(new Uint8Array(readFileSync(join(golden, `${slug}.glb`))))
        )
      ).toBe(expected);
    });
  }

  test('truncated, padded and foreign files are refused', () => {
    const mgeo = new Uint8Array(
      readFileSync(join(golden, 'damocles-object-03f774.mgeo'))
    );
    expect(() => decodeMgeo(mgeo.subarray(0, mgeo.length - 3))).toThrow(
      'truncated'
    );
    expect(() => decodeMgeo(new Uint8Array([...mgeo, 0]))).toThrow('trailing');
    expect(() =>
      decodeMgeo(
        new Uint8Array(readFileSync(join(golden, 'damocles-object-03f774.glb')))
      )
    ).toThrow('not an MGEO');
    const glb = new Uint8Array(
      readFileSync(join(golden, 'damocles-object-03f774.glb'))
    );
    expect(() => decodeGlb(glb.subarray(0, 40))).toThrow('GLB');
  });

  test('a GLB that lost the extension is refused with what was lost', () => {
    const glb = new Uint8Array(
      readFileSync(join(golden, 'damocles-object-03f774.glb'))
    );
    const view = new DataView(glb.buffer, glb.byteOffset);
    const length = view.getUint32(12, true);
    const json = new TextDecoder()
      .decode(glb.subarray(20, 20 + length))
      .replace(
        '"MERCENARY_geometry":{"asset"',
        '"OTHERWISE_geometry":{"asset"'
      );
    const stripped = new Uint8Array(glb);
    stripped.set(new TextEncoder().encode(json), 20);
    expect(() => decodeGlb(stripped)).toThrow(
      'polygon boundaries, identities and game colours were lost'
    );
  });
});

describe('#671 review tools', () => {
  test('loop changes are told apart', () => {
    expect(loopChange([1, 2, 3, 4], [1, 2, 3, 4])).toBe('same');
    expect(loopChange([1, 2, 3, 4], [3, 4, 1, 2])).toBe('start');
    expect(loopChange([1, 2, 3, 4], [4, 3, 2, 1])).toBe('rewound');
    expect(loopChange([1, 2, 3, 4], [1, 2, 4, 3])).toBe('boundary');
  });

  test('a semantic diff names moved vertices, recolours and the walking geometry left behind', async () => {
    const { asset, sidecar } = await fixture(
      'damocles-structure-01484e'
    ).recover(payload);
    const edited = withPart(asset, 'variant:combined', p => ({
      ...p,
      faces: p.faces.map((f, k) =>
        k === 0
          ? {
              ...f,
              colour: { colour: '#123456', kind: 'palette' as const, source: 1 }
            }
          : f
      ),
      vertices: p.vertices.map(v =>
        v.id === 0
          ? { ...v, co: [v.co[0], v.co[1] + 300, v.co[2]] as const }
          : v
      )
    }));
    const text = semanticDiff(asset, edited, sidecar);
    expect(text).toContain('vertex v0 moved (840, 0, -760) → (840, 300, -760)');
    expect(text).toContain('colour #4488cc ($C08E) → #123456 ($1)');
    expect(text).toContain(
      'walking geometry walk:combined, walk:combined-closed did not'
    );
    expect(semanticDiff(asset, asset)).toContain(
      'No geometry or visual-attribute changes.'
    );
  });

  test('a fresh-baseline comparison separates recovery, authored, converged and conflicting changes', async () => {
    const { asset } = await fixture('damocles-object-03f774').recover(payload);
    const fresh = move(move(move(asset, 0, 5), 1, 7), 2, 9);
    const edited = move(move(move(asset, 1, 7), 2, 11), 3, 13);
    const text = compare({
      adopted: asset,
      edited,
      fresh,
      ledger: {
        changes: [
          {
            element: 'variant:record/v3',
            note: 'creative',
            provenance: 'creative'
          }
        ]
      },
      slug: 'coffin'
    });
    expect(text).toContain(
      'Recovery changes 1 · recovery corrections 0 · creative changes 1 · converged 1 · conflicts 1 · unclassified 0'
    );
  });
});
