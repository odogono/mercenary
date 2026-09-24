import { expect, it } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { regionForms } from '../src/catalogue/regions.ts';
import { loadCatalogue, readRawCatalogue } from './fixtures/catalogue.ts';

// The State Office's Floor 10 (slot 79) carries the literal wall text B A S E M E N T (#485).
const FLOOR_TEN = 'structure-01532a';

it('publishes literal wall text in the plane of the face it rides on', async () => {
  const data = await loadCatalogue();
  const model = data.models.find(item => item.id === FLOOR_TEN)!;
  const selection = model.structureSelection!;
  const [basement] = selection.wallTexts!;
  expect(basement!.text).toBe('B A S E M E N T');
  expect(basement!.face).toEqual({ index: 5, kind: 'face' });
  expect(basement!.plane).toBe(128);
  const face = selection.plan.faces.find(f => f.sourceIndex === 5)!;
  const wall = new Set(face.vertices.map(i => selection.plan.vertices[i]![0]));
  expect(new Set(basement!.mesh.vertices.map(vertex => vertex[0]))).toEqual(
    wall
  );
  expect(basement!.mesh.lines.length).toBeGreaterThan(0);
});

it('gives font-4 text and Floor Labels the font-3 fallback of slots 49 and 91', async () => {
  const data = await loadCatalogue();
  const texts = data.models.flatMap(
    model => model.structureSelection?.wallTexts ?? []
  );
  const labels = data.models.flatMap(
    model => model.structureSelection?.floorLabels ?? []
  );
  const fontFour = [...texts, ...labels].filter(item => item.font === 4);
  expect(fontFour.length).toBeGreaterThan(0);
  for (const item of fontFour) {
    expect(item.fallback?.font).toBe(3);
    expect(item.fallback?.whileCarried).toEqual([49, 91]);
  }
  for (const item of [...texts, ...labels]) {
    expect(item.fallback === undefined).toBe(item.font !== 4);
  }
  expect(Object.keys(data.floorLabelGlyphs)).toContain('3');
  expect(Object.keys(data.floorLabelGlyphs)).toContain('4');
});

it('draws wall text straight after its face in the region inspection forms', async () => {
  const data = await loadCatalogue();
  const model = data.models.find(item => item.id === FLOOR_TEN)!;
  const detail = data.models.find(
    item => item.id === model.structureSelection!.detailModel
  );
  const [basement] = model.structureSelection!.wallTexts!;
  const forms = regionForms(model, detail);
  const withText = forms.filter(form =>
    form.mesh.lines.some(
      line => line.colour === basement!.mesh.lines[0]!.colour
    )
  );
  expect(withText.length).toBeGreaterThan(0);
});

it('refuses a font fallback on a wall text that is not in font 4', async () => {
  const raw = await readRawCatalogue();
  const models = raw.models.map(value => {
    const model = value as { id: string; structureSelection?: object };
    if (model.id !== FLOOR_TEN) {
      return value;
    }
    const selection = model.structureSelection as {
      wallTexts: { mesh: unknown }[];
    };
    return {
      ...model,
      structureSelection: {
        ...selection,
        wallTexts: selection.wallTexts.map(text => ({
          ...text,
          fallback: { font: 3, mesh: text.mesh, whileCarried: [49, 91] }
        }))
      }
    };
  });
  expect(() => parseCatalogue({ ...raw, models })).toThrow(
    'invalid font fallback'
  );
});
