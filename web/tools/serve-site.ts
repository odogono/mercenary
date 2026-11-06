/// Serve an exported Published Site the way GitHub Pages does, to check it before it deploys:
/// static files under the base path, a folder's `index.html`, and a redirect that adds the
/// trailing slash to a folder's path.
///
///   bun tools/serve-site.ts [--base /mercenary/] [--dir dist]   (PORT sets the port)

import { stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { default: '/', type: 'string' },
    dir: { default: 'dist', type: 'string' }
  }
});
const base = values.base.endsWith('/') ? values.base : `${values.base}/`;
const directory = join(import.meta.dir, '..', values.dir);

const isDirectory = async (path: string) =>
  (await stat(path).catch(() => undefined))?.isDirectory() ?? false;

const server = Bun.serve({
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    if (`${pathname}/` === base) {
      return Response.redirect(new URL(base, url), 301);
    }
    if (!pathname.startsWith(base)) {
      return new Response('not found', { status: 404 });
    }
    const path = normalize(join(directory, pathname.slice(base.length)));
    if (!path.startsWith(directory)) {
      return new Response('not found', { status: 404 });
    }
    if (await isDirectory(path)) {
      if (!pathname.endsWith('/')) {
        url.pathname = `${url.pathname}/`;
        return Response.redirect(url, 301);
      }
      return new Response(Bun.file(join(path, 'index.html')));
    }
    const file = Bun.file(path);
    return (await file.exists())
      ? new Response(file)
      : new Response('not found', { status: 404 });
  },
  hostname: '127.0.0.1',
  port: Number(process.env['PORT'] ?? 4173)
});

process.stdout.write(
  `Published Site on http://127.0.0.1:${server.port}${base}` + '\n'
);
