import { expect, it } from 'bun:test';

import {
  FLOOR_LABEL_CHARACTERS,
  parseCatalogue
} from '../src/catalogue/data.ts';
import { loadCatalogue, readRawCatalogue } from './fixtures/catalogue.ts';

// The State Office binds Floors 0, 1/2 and 10 to slots 76, 78 and 79 (#473).
const STATE_OFFICE_FLOORS = [
  'structure-014aec',
  'structure-014f52',
  'structure-01532a'
];

it('publishes a Floor Label beside each State Office lift car on every Floor', async () => {
  const data = await loadCatalogue();
  for (const id of STATE_OFFICE_FLOORS) {
    const model = data.models.find(item => item.id === id)!;
    const cars = model
      .structureSelection!.floorLabels!.filter(
        label => label.anchor[0] === -610
      )
      .map(({ anchor, face, font, plane, scale }) => ({
        anchor,
        face,
        font,
        plane,
        scale
      }));
    expect(cars).toEqual([
      {
        anchor: [-610, 70, -260],
        face: { index: 14, kind: 'face' },
        font: 2,
        plane: 128,
        scale: [-4, 4]
      },
      {
        anchor: [-610, 70, -60],
        face: { index: 25, kind: 'face' },
        font: 2,
        plane: 128,
        scale: [-4, 4]
      }
    ]);
  }
});

it('carries every Floor Label character in each font a label uses', async () => {
  const data = await loadCatalogue();
  // A font-4 label draws in its font-3 fallback while slot 49 or 91 is carried (#485).
  const fonts = new Set(
    data.models.flatMap(model =>
      (model.structureSelection?.floorLabels ?? []).flatMap(label =>
        [label.font, label.fallback?.font]
          .filter(font => font !== undefined)
          .map(String)
      )
    )
  );
  expect([...fonts].sort()).toEqual(Object.keys(data.floorLabelGlyphs).sort());
  for (const glyphs of Object.values(data.floorLabelGlyphs)) {
    expect(Object.keys(glyphs).sort()).toEqual(
      [...FLOOR_LABEL_CHARACTERS].sort()
    );
  }
  // Font 2 draws G as a filled glyph.
  expect(data.floorLabelGlyphs['2']!['G']!.faces!.length).toBeGreaterThan(0);
});

it('refuses a Floor Label whose font carries no glyphs', async () => {
  const raw = await readRawCatalogue();
  const glyphs = raw['floorLabelGlyphs'] as Record<string, unknown>;
  const { ['2']: _dropped, ...rest } = glyphs;
  expect(() => parseCatalogue({ ...raw, floorLabelGlyphs: rest })).toThrow(
    'floor label font 2 has no glyphs'
  );
});

it('refuses a glyph font missing a Floor Label character', async () => {
  const raw = await readRawCatalogue();
  const glyphs = raw['floorLabelGlyphs'] as Record<
    string,
    Record<string, unknown>
  >;
  const { B: _dropped, ...font } = glyphs['2']!;
  expect(() =>
    parseCatalogue({ ...raw, floorLabelGlyphs: { ...glyphs, '2': font } })
  ).toThrow('does not carry every Floor Label character');
});
