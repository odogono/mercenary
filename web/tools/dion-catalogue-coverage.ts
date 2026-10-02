import { resolve } from 'node:path';

import { loadDionCatalogue } from '../src/dion/catalogue.ts';
import { readSelection } from '../src/dionCatalogue/inspection.ts';
import {
  preparePreview,
  readRenderSupport,
  supportPath
} from '../src/dionCatalogue/preview.ts';

// Portable preview evidence contains identities, hashes and counts, never captures.
const root = resolve(import.meta.dir, '../..');
const read = (path: string): Promise<unknown> =>
  Bun.file(resolve(root, `.${path}`)).json();
const store = await loadDionCatalogue(read);
const support = readRenderSupport(await read(supportPath), store.catalogue);
const headings = [0, 128, 256, 512, 768];
const acceptedLimits = ['complete sky Body inventory waived by D1'];
const records = [];
for (const g of store.catalogue.geometryIndex) {
  const variants = [];
  for (const variant of g.dataVariants.length ? g.dataVariants : ['']) {
    const p = await preparePreview(
      store,
      support,
      readSelection(new URLSearchParams({ id: g.id, variant }))
    );
    const frames = headings.map(h => p.plan(h));
    const gaps = [...new Set(frames.flatMap(f => f.stats.gaps))].filter(
      g => !acceptedLimits.includes(g)
    );
    const primitives = Math.max(
      ...frames.map(f => f.description.primitives.length)
    );
    if (gaps.length || (!primitives && g.state !== 'empty')) {
      throw new Error(
        `${g.id}.${variant}: ${gaps.join('; ') || 'no visible geometry'}`
      );
    }
    variants.push({ id: variant, primitives });
  }
  records.push({ id: g.id, sha256: g.sha256, state: g.state, variants });
}
let contexts = 0;
for (const placement of store.catalogue.placements) {
  const structure = store.catalogue.structures.find(
    s => s.id === placement.structure
  )!;
  for (const floor of structure.floorBindings) {
    const p = await preparePreview(
      store,
      support,
      readSelection(
        new URLSearchParams({
          floor: String(floor.floor),
          id: placement.id,
          state: 'constructed'
        })
      )
    );
    for (const region of Array.from({ length: p.regions }, (_, i) => i + 1)) {
      const frame = p.plan(128, 1, region);
      const gaps = frame.stats.gaps.filter(g => !acceptedLimits.includes(g));
      if (gaps.length) {
        throw new Error(
          `${placement.id}.Floor${floor.floor}.region${region}: ${gaps.join('; ')}`
        );
      }
      contexts += 1;
    }
  }
}
const report = {
  comparisonMatrix: 'docs/research/dion-catalogue-validation.md',
  headings,
  kind: 'dion-catalogue-preview-evidence',
  limits: acceptedLimits,
  openingRamSha256: store.catalogue.source.openingRamSha256,
  placementFloorRegionContexts: contexts,
  programSha256: store.catalogue.source.programSha256,
  records,
  schemaVersion: 1
};
await Bun.write(
  process.argv[2] ??
    resolve(root, 'research/mercenary-iii-st/catalogue-previews.json'),
  JSON.stringify(report, null, 2) + '\n'
);
process.stdout.write(
  `${records.length} identities, ${records.reduce((n, r) => n + r.variants.length, 0)} stored variants, ${contexts} placement/Floor/region contexts\n`
);
