import { beforeAll, expect, test } from 'bun:test';

import {
  loadDionCatalogue,
  type GeometryStore
} from '../src/dion/catalogue.ts';
import { frameRgba } from '../src/dion/frame.ts';
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
  expect(repeat.residents.map(o => o.slot)).toEqual([101, 118, 177]);
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

test('replays a selected upper Floor from an exact cell-local evidence camera', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const preview = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=placement-02-03&floor=4'))
  );
  const pose = { eye: [33_211, 663, 30_889] as const, heading: 0, region: 3 };
  const frame = preview.planAt(pose);
  expect(frame.stats.models).toContain(30);
  expect(
    frame.description.primitives.some(p => p.source.startsWith('structure:'))
  ).toBe(true);
  expect(preview.planAt(pose).frame.pixels).toEqual(frame.frame.pixels);
});

test('LOGOS absence retains its recovered cell ground and Body day palette', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const p = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=placement-08-32'))
  );
  expect(
    p.plan().description.primitives.some(p => p.source.includes(':ground:'))
  ).toBe(true);
});

test('ground selector 3 uses the recovered swap-and-negate transform 5', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const preview = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=placement-08-32&state=constructed'))
  );
  const f = preview.planAt({
    eye: [30_518, 63, 34_068],
    heading: 0,
    region: 3
  });
  const primitive = f.description.primitives.find(
    p => p.source.includes(':ground:') && p.kind === 'polygon'
  );
  expect(primitive).toBeDefined();
  // The original selector table $561FC maps index 3 to transform bits 5.
  // This road polygon must span the view below the horizon in this capture.
  const rgba = new Uint8ClampedArray(320 * 136 * 4);
  const { frameRgba } = await import('../src/dion/frame.ts');
  frameRgba(f, rgba);
  expect(
    Array.from(rgba.slice((120 * 320 + 160) * 4, (120 * 320 + 160) * 4 + 3))
  ).toEqual([146, 36, 36]);
});

test('definition cameras expose large models, flat ground and first-group-only details', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  for (const id of ['model-034dd4', 'ground-01d1bc', 'detail-02a808']) {
    const preview = await preparePreview(
      store,
      support,
      readSelection(new URLSearchParams({ id }))
    );
    expect(
      [0, 128, 256, 512, 768].some(
        h => preview.plan(h).description.primitives.length > 0
      )
    ).toBe(true);
  }
});

test('Connection street furniture retains the viewer-selected lettered front', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const preview = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=placement-02-29'))
  );
  const frame = preview.planAt({
    eye: [32_768, 63, 35_268],
    heading: 0,
    pitch: 511,
    region: 1
  });
  const rgba = new Uint8ClampedArray(320 * 136 * 4);
  frameRgba(frame, rgba);
  // Original Connection: the alternate front is blue, beside the yellow wall.
  expect(
    Array.from(rgba.slice((40 * 320 + 25) * 4, (40 * 320 + 25) * 4 + 3))
  ).toEqual([73, 146, 219]);
});

test('captured MIDAS structure camera stays independent of resident world height', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const preview = await preparePreview(
    store,
    support,
    readSelection(
      new URLSearchParams('id=placement-56-00&fieldX=393&fieldZ=2694')
    )
  );
  // $5A102 places the world eye at resident Y + 63; $56E2C resets $703C to 63.
  const frame = preview.planAt({
    eye: [32_524, 93, 33_065],
    heading: 0,
    pitch: 511,
    region: 1,
    structureEyeY: 63
  });
  const rgba = new Uint8ClampedArray(320 * 136 * 4);
  frameRgba(frame, rgba);
  expect(
    Array.from(rgba.slice((50 * 320 + 100) * 4, (50 * 320 + 100) * 4 + 3))
  ).toEqual([219, 73, 0]);
});

test('upper Floor detail selection uses world height rather than lift-relative wall height', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const preview = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=placement-15-68&floor=9'))
  );
  const frame = preview.planAt({
    eye: [33_089, 1413, 31_096],
    heading: 0,
    pitch: 511,
    region: 5,
    structureEyeY: 63
  });
  // Original $AA50 is empty: $54D62 selects detail 31's upper box at world Y1413.
  expect(
    frame.description.primitives.filter(p => p.source.includes(':detail:'))
  ).toHaveLength(0);
});

test('Floor lettering uses its selected label while exact probes can retain a captured label', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  for (const query of [
    'id=placement-02-03&floor=4',
    'id=placement-18-8b&floor=10'
  ]) {
    const preview = await preparePreview(
      store,
      support,
      readSelection(new URLSearchParams(query))
    );
    let differs = false;
    for (const heading of [0, 128, 256, 512, 768]) {
      const pose = {
        eye: [32_768, query.includes('floor=4') ? 663 : 1563, 32_768] as const,
        heading,
        region: 1
      };
      const selected = preview.planAt(pose);
      const opening = preview.planAt({ ...pose, floorLabel: 71 });
      differs ||=
        selected.description.primitives.length !==
          opening.description.primitives.length ||
        !selected.frame.pixels.every((v, i) => v === opening.frame.pixels[i]);
    }
    expect(differs, query).toBe(true);
  }
});

test('a Floor-zero host retains the nearby surface residents that occlude its lettering', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const preview = await preparePreview(
    store,
    support,
    readSelection(new URLSearchParams('id=placement-03-62'))
  );
  const frame = preview.planAt({
    eye: [32_777, 63, 32_868],
    heading: 512,
    pitch: 511,
    region: 3
  });
  expect(frame.stats.models).toContain(219);
  expect(frame.stats.models).toContain(220);
});

test('a hooked resident binds its own key letter rather than a shared opening buffer', async () => {
  const support = readRenderSupport(await read(supportPath), store.catalogue);
  const tokens = new Map(support.tokens);
  tokens.delete(0x87);
  const preview = await preparePreview(
    store,
    { ...support, tokens },
    readSelection(new URLSearchParams('id=placement-50-01'))
  );
  const frame = preview.planAt({
    eye: [32_993, 63, 29_856],
    heading: 0,
    region: 4
  });
  expect(frame.stats.models).toContain(31);
  expect(frame.stats.gaps).not.toContain('text token $87 is not bound');
});
