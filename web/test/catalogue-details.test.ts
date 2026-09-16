import { describe, expect, test } from 'bun:test';

import { parseCatalogue, type Model } from '../src/catalogue/data.ts';
import { detailForms } from '../src/catalogue/details.ts';

const primitive = (sourceIndex: number) => ({
  colour: '#ffffff',
  sourceColour: 0x07_77,
  sourceIndex,
  vertices: [0, 1, 2]
});

const detail = (groups: readonly object[]): Model =>
  ({
    detailSelection: groups,
    id: 'interior-1',
    kind: 'interior',
    name: 'Building detail 1',
    status: 'partial',
    variants: [
      {
        id: 'palette-0',
        mesh: {
          faces: [primitive(0), primitive(1), primitive(1)],
          lines: [primitive(2)],
          recordCount: 3,
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [1, 0, 1]
          ]
        },
        name: 'Palette 0'
      }
    ]
  }) as unknown as Model;

describe('building detail visibility forms', () => {
  test('names each box by the bounds the viewer must stand in', () => {
    const forms = detailForms(
      detail([
        {
          boxes: [
            {
              bounds: [
                [-100, 100],
                [-32_768, 32_767],
                [0, 200]
              ],
              records: [0]
            }
          ],
          default: [1]
        },
        { boxes: [], default: [2] }
      ])
    );
    expect(forms.map(form => form.id)).toEqual([
      'group-0-box-0',
      'group-0-default',
      'group-1-default'
    ]);
    expect(forms[0]!.name).toBe(
      'Group 1 · box 1 · viewer within X -100–100, any Y, Z 0–200'
    );
    expect(forms[1]!.name).toBe('Group 1 · default · viewer in no box');
  });

  test('a selector byte names a record, which may carry several primitives', () => {
    const forms = detailForms(
      detail([
        { boxes: [], default: [1] },
        { boxes: [], default: [0, 2] }
      ])
    );
    // Record 1 contributes two faces; record 2 is a line, not a face.
    expect(forms[0]!.mesh.faces).toHaveLength(2);
    expect(forms[0]!.mesh.lines).toHaveLength(0);
    expect(forms[1]!.mesh.faces).toHaveLength(1);
    expect(forms[1]!.mesh.lines).toHaveLength(1);
  });

  test('leaves out a list that names nothing drawable', () => {
    const forms = detailForms(
      detail([
        { boxes: [{ bounds: [[0, 1]], records: [] }], default: [0] },
        { boxes: [], default: [] }
      ])
    );
    expect(forms.map(form => form.id)).toEqual(['group-0-default']);
  });

  test('a model without a detail selector offers nothing', () => {
    expect(
      detailForms({ kind: 'structure', variants: [] } as unknown as Model)
    ).toEqual([]);
  });
});

test('every retained detail selector offers its visibility lists', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const withSelector = data.models.filter(model => model.detailSelection);
  expect(withSelector).toHaveLength(58);
  expect(withSelector.every(model => detailForms(model).length > 0)).toBe(true);
  const lists = withSelector.flatMap(model =>
    model.detailSelection!.flatMap(group => [
      ...group.boxes.map(box => box.records),
      group.default
    ])
  );
  // 60 authored lists name no record at all: inside those boxes the game draws
  // none of the detail, which is not something a form can show.
  expect(lists).toHaveLength(467);
  expect(lists.filter(records => records.length === 0)).toHaveLength(60);
  expect(
    withSelector.reduce((count, model) => count + detailForms(model).length, 0)
  ).toBe(407);
});
