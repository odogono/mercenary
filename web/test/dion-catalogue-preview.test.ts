import { beforeAll, expect, test } from 'bun:test';

import {
  loadDionCatalogue,
  type GeometryStore
} from '../src/dion/catalogue.ts';
import { readSelection } from '../src/dionCatalogue/inspection.ts';
import {
  preparePreview,
  readRenderSupport,
  supportPath
} from '../src/dionCatalogue/preview.ts';
import { renderAuthentic } from '../src/rendering/authentic.ts';

const read = (path: string): Promise<unknown> =>
  Bun.file(new URL(`../..${path}`, import.meta.url)).json();
let store: GeometryStore;
beforeAll(async () => {
  store = await loadDionCatalogue(read);
});
test('renders object forms, surface structures and upper Floors through the Dion planner', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  for (const params of [
    'id=object-001',
    'id=placement-02-03&floor=4',
    'id=placement-18-11',
    'id=model-02edd6'
  ]) {
    const preview = await preparePreview(
      store,
      support,
      readSelection(new URLSearchParams(params))
    );
    const planned = preview.plan();
    expect(planned.description.projection.width).toBe(320);
    expect(planned.description.primitives.length).toBeGreaterThan(0);
    expect(renderAuthentic(planned.description).pixels.some(v => v !== 8)).toBe(
      true
    );
  }
});
test('rejects mismatched preview support with a document-specific diagnostic', async () => {
  const value = (await read(supportPath)) as { source: { title: string } };
  value.source.title = 'damocles';
  expect(() => readRenderSupport(value, store.catalogue)).toThrow(
    'render-support.json'
  );
});
test('rejects missing render bindings instead of inventing palettes or glyphs', async () => {
  const value = (await read(supportPath)) as {
    glyphs: Record<string, unknown>;
    palettes: Record<string, unknown>;
  };
  const palette = store.catalogue.structures[0]!.floorBindings[0]!.palette;
  delete value.palettes[String(palette)];
  expect(() => readRenderSupport(value, store.catalogue)).toThrow(
    `missing reference ${palette}`
  );
  const font = (await read(supportPath)) as typeof value;
  delete font.glyphs['0:20'];
  expect(() => readRenderSupport(font, store.catalogue)).toThrow(
    'expected all eight fonts'
  );
});
test('empty geometry and invalid Floor or variant links have explicit dispositions', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const empty = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=model-0317f6'))
  );
  expect(empty.message).toContain('Evidenced absence');
  for (const [query, diagnostic] of [
    ['id=placement-02-04&floor=9', 'Floor 9 is not bound'],
    ['id=object-001&variant=absent', 'variant']
  ]) {
    await expect(
      preparePreview(store, support, readSelection(new URLSearchParams(query)))
    ).rejects.toThrow(diagnostic);
  }
});
test('LOGOS initial state draws no constructed geometry and MIDAS repeats retain exact residence', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const initial = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=placement-08-32'))
  );
  expect(
    initial
      .plan()
      .description.primitives.filter(p => p.source.startsWith('structure:'))
  ).toHaveLength(0);
  const built = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=placement-08-32&state=constructed'))
  );
  expect(built.plan().description.primitives.length).toBeGreaterThan(0);
  const repeat = await preparePreview(
    store,
    support,
    readSelection(
      new URLSearchParams('id=placement-56-00&fieldX=393&fieldZ=2694')
    )
  );
  expect(repeat.residents.map(o => o.slot)).toEqual([101, 118]);
  const other = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=placement-56-00&fieldX=9&fieldZ=6'))
  );
  expect(other.residents).toHaveLength(0);
});

test('every stored geometry variant can be planned without unresolved vertex crashes', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  for (const entry of store.catalogue.geometryIndex) {
    for (const variant of entry.dataVariants) {
      const preview = await preparePreview(
        store,
        support,
        readSelection(new URLSearchParams({ id: entry.id, variant }))
      );
      expect(() => preview.plan()).not.toThrow();
    }
  }
});

test('independent ground inspection loads its referenced street furniture', async () => {
  const inspection = await loadDionCatalogue(read);
  const furniture = store.catalogue.geometryIndex.find(
    g => g.family === 'model' && g.entries?.includes(305)
  )!;
  expect(inspection.peek(furniture.id)).toBeUndefined();
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const preview = await preparePreview(
    inspection,
    support,
    readSelection(new URLSearchParams('id=ground-01b970&variant=transform=1'))
  );
  expect(inspection.peek(furniture.id)).toBeDefined();
  expect(() => preview.plan()).not.toThrow();
});

test('shared coast classification reproduces the 36 evidenced Dion Land/Sea answers', async () => {
  const { classifyPosition } = await import('../src/coast/islands.ts');
  const { catalogueCoast } = await import('../src/dionCatalogue/coast.ts');
  const fixture = (await Bun.file(
    new URL('./fixtures/dion-coasts.json', import.meta.url)
  ).json()) as {
    probes: {
      answer: number;
      body: string;
      island: string;
      relative: number[];
    }[];
    programSha256: string;
  };
  expect(fixture.programSha256).toBe(store.catalogue.source.programSha256);
  expect(fixture.probes).toHaveLength(36);
  for (const p of fixture.probes) {
    const body = store.catalogue.bodies.find(b => b.id === p.body)!;
    const island = body.islands.find(i => i.id === p.island)!;
    const surface = await catalogueCoast(store, body.id, island.origin);
    const answer = classifyPosition(surface, {
      x: p.relative[0]! * 65_536,
      y: 63,
      z: p.relative[1]! * 65_536
    });
    expect(answer.kind).toBe(
      p.answer === 0 ? 'core' : p.answer === 1 ? 'land' : 'sea'
    );
  }
});
