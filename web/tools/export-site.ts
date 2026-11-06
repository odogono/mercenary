/// Export the Published Site: every page of the app as static files a host such as GitHub
/// Pages can serve under a base path (ADR 0093).
///
///   bun tools/export-site.ts [--base /mercenary/] [--out dist]
///
/// It does what `serve.ts` does per request, once, ahead of time. Source is stripped of its
/// types file by file, as the development server strips it, so the site runs the same modules
/// the tests import; it is not bundled. Two differences follow from a static host: modules are
/// renamed `.js` (a host types `.ts` as video), and each document is written to its path's
/// `index.html`, with its root-relative links rebased.

import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';

import { TARG_ASSETS_PATH, readTargAssets } from '../src/server/assets.ts';
import { DOCUMENT_FILES } from '../src/server/document.ts';
import {
  documentPaths,
  resolveDocumentPath
} from '../src/shell/documentPath.ts';

const { values } = parseArgs({
  options: {
    base: { default: '/', type: 'string' },
    out: { default: 'dist', type: 'string' }
  }
});
const base = values.base.endsWith('/') ? values.base : `${values.base}/`;
if (!base.startsWith('/')) {
  throw new Error(`--base must be root-relative: ${base}`);
}

const web = join(import.meta.dir, '..');
const root = join(web, '..');
const out = join(web, values.out);
const transpiler = new Bun.Transpiler({ loader: 'ts' });

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true
  });
  return entries
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name));
};

/// A relative module specifier, renamed to the file the export writes for it.
const renameSpecifiers = (code: string): string =>
  code.replaceAll(
    /(["'])(\.{1,2}\/[^\n"']+?)\.(ts|talk)\1/g,
    (_, quote: string, path: string, extension: string) =>
      `${quote}${path}${extension === 'ts' ? '.js' : '.talk.js'}${quote}`
  );

/// A document's root-relative `href`, `src` and CSS `url()`, moved under the base; its
/// module scripts renamed as the modules are.
const rebaseDocument = (html: string): string =>
  html
    .replaceAll(
      /\b(href|src)="\/(?!\/)([^"]*)"/g,
      (_, attribute: string, path: string) =>
        `${attribute}="${base}${path.startsWith('src/') ? path.replace(/\.ts$/, '.js') : path}"`
    )
    // An import map names packages by their served path, as the development server serves
    // them from `node_modules`.
    .replaceAll('"/node_modules/', `"${base}node_modules/`)
    .replaceAll(
      /url\((["']?)\/(?!\/)/g,
      (_, quote: string) => `url(${quote}${base}`
    );

const write = async (path: string, body: string | Uint8Array) => {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, body);
};

await rm(out, { force: true, recursive: true });

// Source: the browser's modules and stylesheets. Tests and the development server stay behind.
for (const file of await walk(join(web, 'src'))) {
  const path = relative(web, file);
  if (path.startsWith('src/server/') || /\.test\.ts$|\.d\.ts$/.test(path)) {
    continue;
  }
  if (path.endsWith('.ts')) {
    const code = transpiler.transformSync(await Bun.file(file).text());
    await write(
      join(out, path.replace(/\.ts$/, '.js')),
      renameSpecifiers(code)
    );
  } else if (path.endsWith('.talk')) {
    const text = await Bun.file(file).text();
    await write(
      join(out, `${path}.js`),
      `export default ${JSON.stringify(text)};\n`
    );
  } else {
    await write(join(out, path), await Bun.file(file).bytes());
  }
}

// Documents, each at its path, so a clean path such as `/targ` is served as `/targ/`.
for (const path of documentPaths()) {
  const route = resolveDocumentPath(path);
  if (route.kind !== 'document') {
    throw new Error(`${path} is not a document`);
  }
  const html = await Bun.file(join(web, DOCUMENT_FILES[route.document])).text();
  await write(join(out, path, 'index.html'), rebaseDocument(html));
}

// The packages the import maps name, served from `node_modules` as the development server
// serves them.
const packages = new Set<string>();
for (const file of Object.values(DOCUMENT_FILES)) {
  const html = await Bun.file(join(web, file)).text();
  for (const [, name] of html.matchAll(
    /"\/node_modules\/((?:@[^"/]+\/)?[^"/]+)\//g
  )) {
    packages.add(name!);
  }
}
for (const name of packages) {
  await cp(join(web, 'node_modules', name), join(out, 'node_modules', name), {
    filter: source => !source.endsWith('.d.ts'),
    recursive: true
  });
}

// Presentation documents beside the pages, the Data Payload, the Targ assets the server lists
// on request, and the settings every session reads.
for (const directory of ['flyover', 'dion', 'damocles', 'systems']) {
  for (const file of await walk(join(web, directory))) {
    await write(join(out, relative(web, file)), await Bun.file(file).bytes());
  }
}
await cp(join(root, 'payload'), join(out, 'payload'), { recursive: true });
await write(
  join(out, TARG_ASSETS_PATH.slice(1)),
  JSON.stringify(await readTargAssets(join(root, 'assets/targ')))
);
await cp(join(root, 'settings.json'), join(out, 'settings.json'));
// GitHub Pages would otherwise run Jekyll, which drops files whose names start with `_`.
await write(join(out, '.nojekyll'), '');

process.stdout.write(
  `Exported the Published Site to ${out} for ${base}` + '\n'
);
