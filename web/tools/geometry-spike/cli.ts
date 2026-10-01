/// The #671 spike's TypeScript commands. Run from web/: `bun tools/geometry-spike/cli.ts <command>`.
///
///   baseline [--payload DIR] [--out DIR]   recover every fixture as a fresh baseline
///   adopt SLUG                             start an asset from the fresh baseline (never overwrites)
///   read FILE                              decode a .mgeo, .glb or contract JSON; print canonical JSON
///   compose FILE SIDECAR                   print the payload record the asset composes to
///   diff BEFORE AFTER [--sidecar FILE]     semantic diff of two geometry files, as Markdown
///   compare ASSET FRESH GEOMETRY           three-way: adopted baseline, fresh baseline, edited asset
///   sweep                                  recover and compose every Damocles Model and Targ record
///
/// Writes only under research/blender-geometry-spike/out/, and `baseline` refuses to write into
/// the assets directory, so a re-extraction never overwrites an edited asset.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import {
  UnsupportedGeometry,
  recoverDamoclesModel,
  recoverTargObjectModel,
  recoverTargRoom
} from '../../src/geometrySpike/baseline.ts';
import { compose } from '../../src/geometrySpike/compose.ts';
import { canonicalJson, sha256 } from '../../src/geometrySpike/contract.ts';
import { compare, semanticDiff } from '../../src/geometrySpike/diff.ts';
import { FIXTURES } from './fixtures.ts';
import {
  ASSETS,
  OUT,
  ROOT,
  complain,
  readGeometry,
  readSidecar,
  say
} from './paths.ts';

const option = (args: string[], name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] !== undefined
    ? resolve(args[at + 1]!)
    : fallback;
};

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

const baseline = async (args: string[]) => {
  const payload = option(args, '--payload', join(ROOT, 'payload'));
  const out = option(args, '--out', join(OUT, 'baseline'));
  // An asset directory is any directory holding a ledger. A baseline lands beside assets, never
  // in one, so a re-extraction cannot overwrite an edited asset.
  const guarded = (directory: string): boolean =>
    existsSync(join(directory, 'ledger.json')) ||
    (dirname(directory) !== directory && guarded(dirname(directory)));
  const holdsAsset =
    !relative(ASSETS, out).startsWith('..') ||
    guarded(out) ||
    FIXTURES.some(f => existsSync(join(out, f.slug, 'ledger.json')));
  if (holdsAsset) {
    throw new Error(
      `refusing to write a baseline into ${out}: it holds or lies inside an edited asset, and assets are never overwritten`
    );
  }
  for (const fixture of FIXTURES) {
    const { asset, sidecar } = await fixture.recover(payload);
    write(
      join(out, fixture.slug, 'recovered.contract.json'),
      canonicalJson(asset)
    );
    write(join(out, fixture.slug, 'sidecar.json'), canonicalJson(sidecar));
    say(
      `${fixture.slug}: ${asset.parts.length} parts, ${sidecar.references.length} references`
    );
  }
};

const adopt = (args: string[]) => {
  const slug = args[0]!;
  const from = join(OUT, 'baseline', slug);
  const to = join(ASSETS, slug);
  if (existsSync(to)) {
    throw new Error(
      `${relative(ROOT, to)} exists; an asset is adopted once and never overwritten`
    );
  }
  for (const name of ['recovered.contract.json', 'sidecar.json']) {
    write(join(to, name), readFileSync(join(from, name), 'utf8'));
  }
  write(
    join(to, 'ledger.json'),
    canonicalJson({ changes: [], format: 'mercenary-geometry-ledger' })
  );
  say(`adopted ${slug} into ${relative(ROOT, to)}`);
};

const sweep = () => {
  const failures = new Map<string, string[]>();
  let ok = 0;
  const directory = join(ROOT, 'payload/damocles/models');
  const contracts = join(OUT, 'sweep');
  for (const name of readdirSync(directory).sort()) {
    const document = `damocles/models/${name}`;
    const text = readFileSync(join(directory, name), 'utf8');
    const source = JSON.parse(text) as Record<string, unknown>;
    try {
      const recovered = recoverDamoclesModel(source, {
        document,
        path: '$',
        sha256: sha256(text)
      });
      const { record } = compose(recovered.asset, recovered.sidecar);
      if (canonicalJson(record) !== canonicalJson(source)) {
        throw new UnsupportedGeometry(
          'composition differs from the source record'
        );
      }
      write(
        join(contracts, name.replace('.json', '.contract.json')),
        canonicalJson(recovered.asset)
      );
      write(
        join(contracts, name.replace('.json', '.sidecar.json')),
        canonicalJson(recovered.sidecar)
      );
      ok += 1;
    } catch (error) {
      const reason =
        (error as Error).name === 'UnsupportedGeometry'
          ? (error as Error).message
              .replace(/^[^:]*: /, '')
              .replaceAll(/\[\d+]/g, '[]')
          : String(error);
      failures.set(reason, [...(failures.get(reason) ?? []), name]);
    }
  }
  const targ = { objects: 0, rooms: 0 };
  const objects = JSON.parse(
    readFileSync(join(ROOT, 'payload/objects.json'), 'utf8')
  ) as { models: Record<string, unknown>[] };
  for (const model of objects.models) {
    const r = recoverTargObjectModel(model, {
      document: 'objects.json',
      path: '',
      sha256: ''
    });
    if (
      canonicalJson(compose(r.asset, r.sidecar).record) === canonicalJson(model)
    ) {
      targ.objects += 1;
    }
  }
  const rooms = JSON.parse(
    readFileSync(join(ROOT, 'payload/rooms.json'), 'utf8')
  ) as { rooms: Record<string, unknown>[] };
  for (const room of rooms.rooms) {
    const r = recoverTargRoom(room, {
      document: 'rooms.json',
      path: '',
      sha256: ''
    });
    if (
      canonicalJson(compose(r.asset, r.sidecar).record) === canonicalJson(room)
    ) {
      targ.rooms += 1;
    }
  }
  const report = {
    damocles: {
      composedExactly: ok,
      unsupported: Object.fromEntries(
        [...failures].map(([reason, names]) => [
          reason,
          { count: names.length, examples: names.slice(0, 3) }
        ])
      )
    },
    targ: {
      objectModels: `${targ.objects}/${objects.models.length}`,
      rooms: `${targ.rooms}/${rooms.rooms.length}`
    }
  };
  write(join(OUT, 'sweep-report.json'), canonicalJson(report));
  say(canonicalJson(report));
};

const main = async ([command, ...args]: string[]) => {
  switch (command) {
    case 'baseline':
      await baseline(args);
      break;
    case 'adopt':
      adopt(args);
      break;
    case 'read':
      process.stdout.write(canonicalJson(readGeometry(resolve(args[0]!))));
      break;
    case 'compose': {
      const { diagnostics, record } = compose(
        readGeometry(resolve(args[0]!)),
        readSidecar(resolve(args[1]!))
      );
      for (const d of diagnostics) {
        complain(`${d.severity}: ${d.site}: ${d.message}`);
      }
      process.stdout.write(canonicalJson(record));
      break;
    }
    case 'diff': {
      const sidecarPath = args.indexOf('--sidecar');
      process.stdout.write(
        semanticDiff(
          readGeometry(resolve(args[0]!)),
          readGeometry(resolve(args[1]!)),
          sidecarPath >= 0
            ? readSidecar(resolve(args[sidecarPath + 1]!))
            : undefined
        )
      );
      break;
    }
    case 'compare': {
      // compare ASSET_DIR FRESH_BASELINE_DIR EDITED_GEOMETRY
      const [assetDir, freshDir, edited] = args.map(a => resolve(a));
      process.stdout.write(
        compare({
          adopted: readGeometry(join(assetDir!, 'recovered.contract.json')),
          edited: readGeometry(edited!),
          fresh: readGeometry(join(freshDir!, 'recovered.contract.json')),
          ledger: JSON.parse(
            readFileSync(join(assetDir!, 'ledger.json'), 'utf8')
          ),
          slug: assetDir!.split('/').at(-1)!
        })
      );
      break;
    }
    case 'sweep':
      sweep();
      break;
    default:
      complain(
        'usage: bun tools/geometry-spike/cli.ts baseline|adopt|read|compose|diff|compare|sweep …'
      );
      process.exit(2);
  }
};

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    complain(
      `error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
