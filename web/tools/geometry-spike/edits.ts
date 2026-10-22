/// Runs every #671 edit case in Blender on both candidates, then reviews the result: the two
/// candidates must agree, a rejected case must be rejected with the expected diagnostic, and an
/// accepted one gets a semantic diff and before/after previews from the existing renderers.
///
///   bun tools/geometry-spike/edits.ts [--blender PATH] [CASE...]
///
/// Writes out/edits/CASE/{diff.md, preview.*} and out/edits-report.md. Exits non-zero on any
/// unexpected outcome. Run roundtrip.ts first: it adopts the assets these cases edit.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Model } from '../../src/catalogue/data.ts';
import { canonicalJson } from '../../src/geometry/contract.ts';
import { semanticDiff } from '../../src/geometrySpike/diff.ts';
import { ASSETS, OUT, readGeometry, readSidecar, say } from './paths.ts';
import {
  clampedToCell,
  damoclesModelOf,
  damoclesPartMesh,
  damoclesPreview,
  svgToPng,
  targPreview
} from './preview.ts';
import { runBlender } from './roundtrip.ts';

interface Case {
  readonly expect: 'exported' | { readonly rejected: string };
  readonly name: string;
  /// The part to preview, for Damocles.
  readonly part?: string;
  readonly slug: string;
  readonly what: string;
}

export const CASES: readonly Case[] = [
  {
    expect: 'exported',
    name: 'coffin-edits',
    part: 'variant:record',
    slug: 'damocles-object-03f774',
    what: 'Move a vertex, recolour the six-sided lid, delete a side face and re-add it, add and colour a line'
  },
  {
    expect: { rejected: 'has no palette colour' },
    name: 'coffin-uncoloured-line',
    slug: 'damocles-object-03f774',
    what: 'Add and mark a line without giving it a colour'
  },
  {
    expect: { rejected: 'is not a line' },
    name: 'coffin-unmarked-edge',
    slug: 'damocles-object-03f774',
    what: 'Delete ▸ Only Faces, leaving an unmarked wire edge'
  },
  {
    expect: 'exported',
    name: 'atropos-remove-line',
    part: 'variant:record',
    slug: 'damocles-atropos-ground-02064a-00',
    what: 'Remove the explicit line; its coincident-but-distinct face vertices stay distinct'
  },
  {
    expect: 'exported',
    name: 'ground-day-colour',
    part: 'variant:record',
    slug: 'damocles-ground-021de0-06-54',
    what: 'Recolour a face to another day/night palette entry'
  },
  {
    expect: { rejected: 'references source record 0 in plan' },
    name: 'spaceport-delete-referenced-face',
    slug: 'damocles-structure-01484e',
    what: 'Delete a plan face the region queues draw'
  },
  {
    expect: 'exported',
    name: 'spaceport-rebuild-referenced-face',
    part: 'plan',
    slug: 'damocles-structure-01484e',
    what: 'Delete that face, rebuild it with F and give it the same source record'
  },
  {
    expect: 'exported',
    name: 'spaceport-move-combined',
    part: 'variant:combined',
    slug: 'damocles-structure-01484e',
    what: 'Raise two vertices of the combined display variant by 300'
  },
  {
    expect: { rejected: 'references source record 30 in variant:*' },
    name: 'interior-delete-detail-record',
    slug: 'damocles-interior-0303d6',
    what: 'Delete one palette variant’s face for a record the detail selection names'
  },
  {
    expect: { rejected: 'rotated input' },
    name: 'surface-move-rotated',
    slug: 'targ-surface-cell-1',
    what: 'Drag a runtime-rotated vertex'
  },
  {
    expect: { rejected: 'Road Workspace endpoint' },
    name: 'surface-move-external',
    slug: 'targ-surface-cell-1',
    what: 'Drag a Road Workspace endpoint'
  },
  {
    expect: 'exported',
    name: 'surface-move-structure',
    slug: 'targ-surface-cell-1',
    what: 'Raise the roof square; change one rotated input through its attribute'
  },
  {
    expect: 'exported',
    name: 'room-move-doorway-frame',
    slug: 'targ-room-0',
    what: 'Slide doorway 0’s frame along its wall'
  },
  {
    expect: 'exported',
    name: 'object-add-remove-lines',
    slug: 'targ-object-model-1700',
    what: 'Remove one line and add another'
  }
];

const detailOf = (slug: string): Model | undefined =>
  slug === 'damocles-structure-01484e'
    ? damoclesModelOf(
        readGeometry(
          join(ASSETS, 'damocles-interior-0303d6', 'recovered.contract.json')
        ),
        readSidecar(join(ASSETS, 'damocles-interior-0303d6', 'sidecar.json'))
      )
    : undefined;

if (import.meta.main) {
  const args = process.argv.slice(2);
  // Case names, without --blender and the path that follows it.
  const only = args.filter(
    (a, k) => !a.startsWith('--') && args[k - 1] !== '--blender'
  );
  const rows: string[] = [];
  let failed = false;
  for (const c of CASES.filter(
    x => only.length === 0 || only.includes(x.name)
  )) {
    const work = join(OUT, 'edits', c.name);
    const assets = join(ASSETS, c.slug);
    for (const candidate of ['blend', 'glb']) {
      runBlender('edits.py', c.name, candidate);
    }
    const diagnostics = {
      blend: readFileSync(join(work, 'diagnostics-blend.txt'), 'utf8'),
      glb: readFileSync(join(work, 'diagnostics-glb.txt'), 'utf8')
    };
    const exported =
      existsSync(join(work, 'edited.mgeo')) &&
      existsSync(join(work, 'edited.glb'));
    let outcome: string;
    let ok: boolean;
    if (c.expect === 'exported') {
      const a = exported ? readGeometry(join(work, 'edited.mgeo')) : undefined;
      const b = exported ? readGeometry(join(work, 'edited.glb')) : undefined;
      const agree =
        a !== undefined &&
        b !== undefined &&
        canonicalJson(a) === canonicalJson(b);
      ok = exported && agree;
      outcome = !exported
        ? `rejected: ${diagnostics.blend.split('\n')[0]}`
        : agree
          ? 'exported; .mgeo and .glb agree'
          : 'exported, but the candidates disagree';
      if (a !== undefined) {
        const before = readGeometry(join(assets, 'recovered.contract.json'));
        const sidecar = readSidecar(join(assets, 'sidecar.json'));
        const diff = semanticDiff(before, a, sidecar);
        writeFileSync(join(work, 'diff.md'), diff);
        if (sidecar.title === 'targ') {
          for (const [name, asset, title] of [
            ['before', before, `${c.slug} · recovered baseline`],
            ['after', a, `${c.name} · edited (.mgeo)`]
          ] as const) {
            const text = await targPreview(asset, sidecar, title);
            writeFileSync(join(work, `${name}.svg`), text);
            writeFileSync(join(work, `${name}.png`), await svgToPng(text));
          }
        } else {
          const detail = detailOf(c.slug);
          const model = (asset: typeof a) => damoclesModelOf(asset, sidecar);
          const variant = model(before).variants.find(
            v => `variant:${v.id}` === c.part
          );
          const ground = model(before).kind === 'ground';
          const shown = (mesh: ReturnType<typeof damoclesPartMesh>) =>
            ground ? clampedToCell(mesh) : mesh;
          const suffix = ground ? ' · clamped to ±1200 for display' : '';
          // Ground is easiest to read from above; other forms keep their inspection angle.
          const chosen =
            variant?.inspectionAngle ??
            (ground ? ([-0.4, 1.1] as const) : undefined);
          const angle = chosen === undefined ? {} : { angle: chosen };
          writeFileSync(
            join(work, 'preview.png'),
            await damoclesPreview([
              {
                ...angle,
                mesh: shown(damoclesPartMesh(model(before), c.part!, detail)),
                title: `${c.part} · recovered baseline${suffix}`
              },
              {
                ...angle,
                mesh: shown(damoclesPartMesh(model(a), c.part!, detail)),
                title: `${c.part} · edited (.mgeo)${suffix}`
              }
            ])
          );
        }
      }
    } else {
      const needle = c.expect.rejected;
      ok =
        !exported &&
        diagnostics.blend.includes(needle) &&
        diagnostics.glb.includes(needle);
      outcome = ok
        ? `rejected as expected: ${diagnostics.blend.split('\n')[0]!.replace(/^error: /, '')}`
        : `**unexpected**: ${diagnostics.blend.split('\n')[0]}`;
    }
    failed ||= !ok;
    rows.push(
      `| ${c.name} | ${c.what} | ${ok ? 'yes' : '**NO**'} | ${outcome.replaceAll('|', String.raw`\|`)} |`
    );
    say(`${c.name}: ${ok ? 'ok' : 'UNEXPECTED'} — ${outcome}`);
  }
  writeFileSync(
    join(OUT, 'edits-report.md'),
    [
      '# Blender edit cases',
      '',
      'Each case ran on both candidates: the `.blend` asset reopened, and the canonical GLB imported through the add-on.',
      '',
      '| Case | Edit | As expected | Outcome |',
      '| --- | --- | --- | --- |',
      ...rows,
      ''
    ].join('\n')
  );
  process.exit(failed ? 1 : 0);
}
