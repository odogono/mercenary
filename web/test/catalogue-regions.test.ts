import { describe, expect, test } from 'bun:test';

import { type Mesh, type Model } from '../src/catalogue/data.ts';
import { regionForms } from '../src/catalogue/regions.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

const known = (index: number | undefined): index is number =>
  index !== undefined;

const primitive = (vertices: readonly number[], sourceIndex: number) => ({
  colour: '#ffffff',
  sourceColour: 0x07_77,
  sourceIndex,
  vertices
});

/** Four vertices at a given height, so merged parts stay distinguishable. */
const quad = (y: number): Mesh => ({
  faces: [primitive([0, 1, 2], 0)],
  lines: [],
  vertices: [
    [0, y, 0],
    [1, y, 0],
    [1, y, 1]
  ]
});

const structure = (
  flags: number,
  queue: readonly object[],
  planFaces = 2
): Model =>
  ({
    detailSelection: undefined,
    id: 'structure-1',
    kind: 'structure',
    name: 'Structure',
    status: 'partial',
    structureSelection: {
      attachments: [
        {
          constructor: { leafCount: 1, motionAxis: 'x', movingSide: 'high' },
          controlWord: 0x40_00,
          mesh: {
            faces: [primitive([0, 1, 2], 0), primitive([0, 1, 2], 1)],
            lines: [],
            vertices: [
              [9, 0, 0],
              [9, 1, 0],
              [9, 1, 1]
            ]
          },
          proximityBox: { x: [0, 1], z: [0, 1] },
          slot: 0x03_fc
        }
      ],
      detailModel: 'interior-1',
      detailVariant: 'palette-0',
      plan: {
        faces: Array.from({ length: planFaces }, (_, index) =>
          primitive([0, 1, 2], index)
        ),
        lines: [],
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 0, 1]
        ]
      },
      regions: [
        {
          bounds: [
            [-10, 10],
            [-32_768, 32_767]
          ],
          flags,
          gate: 'none',
          queue
        }
      ],
      scale: [2, 3]
    },
    variants: []
  }) as unknown as Model;

const detailModel = (): Model =>
  ({
    detailSelection: [
      { boxes: [], default: [] },
      { boxes: [], default: [0] }
    ],
    id: 'interior-1',
    kind: 'interior',
    name: 'Building detail 1',
    status: 'partial',
    variants: [{ id: 'palette-0', mesh: quad(5), name: 'Palette 0' }]
  }) as unknown as Model;

describe('region inspection forms', () => {
  test('names each region by the bounds the viewer must stand in', () => {
    const forms = regionForms(
      structure(0, [{ index: 0, kind: 'face' }]),
      undefined
    );
    expect(forms).toHaveLength(1);
    expect(forms[0]!.id).toBe('region-0');
    expect(forms[0]!.name).toBe('Region 1 · viewer within X -10–10, any Z');
  });

  test('follows the queue order and expands attachment entries', () => {
    const forms = regionForms(
      structure(0, [
        { index: 1, kind: 'face' },
        { kind: 'attachment', slot: 0x03_fc },
        { index: 0, kind: 'face' },
        { index: 1, kind: 'attachmentFace', slot: 0x03_fc }
      ]),
      undefined
    );
    // One plan face, both attachment faces, another plan face, then the
    // attachment's second face on its own.
    expect(forms[0]!.mesh.faces.map(face => face.sourceIndex)).toEqual([
      1, 0, 1, 0, 1
    ]);
  });

  test('adds the linked detail only when the region flag asks for it', () => {
    const queue = [{ index: 0, kind: 'face' }];
    const without = regionForms(structure(0, queue), detailModel());
    expect(without.at(0)?.mesh.faces).toHaveLength(1);

    const withDetail = regionForms(structure(0x80_00, queue), detailModel());
    expect(withDetail.at(0)?.mesh.faces).toHaveLength(2);
    // Detail vertices carry the structure's X and Z scale; Y is untouched.
    expect(withDetail.at(0)?.mesh.vertices[0]).toEqual([0, 5, 0]);
    expect(withDetail.at(0)?.mesh.vertices[2]).toEqual([2, 5, 3]);
  });

  test('draws the plan first only when the flags say so', () => {
    const queue = [{ index: 0, kind: 'face' }];
    const detailFirst = regionForms(structure(0x80_00, queue), detailModel());
    expect(detailFirst.at(0)?.mesh.vertices[0]?.[1]).toBe(5);

    const planFirst = regionForms(structure(0xc0_00, queue), detailModel());
    expect(planFirst.at(0)?.mesh.vertices[0]?.[1]).toBe(0);
  });

  test('leaves out a region that names nothing drawable', () => {
    expect(regionForms(structure(0, []), detailModel())).toEqual([]);
    expect(regionForms({ kind: 'object' } as Model, undefined)).toEqual([]);
  });
});

const catalogue = async () => await loadCatalogue();

test('every retained structure selector offers its regions', async () => {
  const data = await catalogue();
  const withSelector = data.models.filter(model => model.structureSelection);
  const offered = withSelector.filter(
    model =>
      regionForms(
        model,
        data.models.find(m => m.id === model.structureSelection?.detailModel)
      ).length > 0
  );
  expect(withSelector).toHaveLength(256);
  expect(offered).toHaveLength(256);
});

test('the spaceport region 1 form reproduces the reviewed interior order', async () => {
  const data = await catalogue();
  const port = data.models.find(m => m.id === 'structure-01484e')!;
  const forms = regionForms(
    port,
    data.models.find(m => m.id === port.structureSelection!.detailModel)
  );
  const layout = port.variants.find(v => v.id === 'interior-layout')!.mesh;
  // The hand-reviewed layout drops the entrance attachment and appends the
  // captured key, so compare the plan faces the region names.
  const planSources = new Set(
    port.structureSelection!.plan.faces.map(face => face.sourceIndex)
  );
  const fromRegion = forms[0]!.mesh.faces
    .map(face => face.sourceIndex)
    .filter(known);
  const fromLayout = layout.faces
    .map(face => face.sourceIndex)
    .filter(known)
    .filter(index => planSources.has(index));
  expect(fromRegion.slice(-fromLayout.length)).toEqual(fromLayout);
  expect(fromLayout).toHaveLength(28);
});
