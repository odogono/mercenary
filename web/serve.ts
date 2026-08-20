import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/// The development server. Localhost only, and deliberately so.
///
/// A hosted build serves payload-derived data to every visitor, which is publication of a
/// Reconstructed Payload by any reading, and that is gated on written qualified-counsel
/// clearance under ADR 0004 (#67). Until then this binds to localhost and there is no build
/// step that produces a deployable bundle.
///
/// It serves the page, the gitignored `/payload/` from the repository root, and the one tracked
/// settings document the live Gameplay Session resolves. Neither is copied into `web/`.

const findRepositoryRoot = (): string => {
  let directory = import.meta.dir;
  for (;;) {
    if (existsSync(join(directory, 'trace-scenarios.json'))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error('could not find the repository root');
    }
    directory = parent;
  }
};

const root = findRepositoryRoot();
const payload = process.env['MERCENARY_PAYLOAD'] ?? join(root, 'payload');
const e2e = process.env['MERCENARY_E2E'] === '1';

if (!existsSync(join(payload, 'manifest.json'))) {
  console.error(
    `No Data Payload at ${payload}.\n` +
      'It is derived from the Reference Build and never tracked; export one with the lab tooling.'
  );
  process.exit(1);
}

const transpiler = new Bun.Transpiler({ loader: 'ts' });

const server = Bun.serve({
  development: true,
  async fetch(request) {
    const url = new URL(request.url);

    if (e2e && url.pathname === '/__e2e__/opening-loop') {
      return new Response(
        Bun.file(join(import.meta.dir, 'e2e/opening-loop.html')),
        {
          headers: { 'content-type': 'text/html; charset=utf-8' }
        }
      );
    }

    if (e2e && url.pathname === '/__e2e__/opening-loop.ts') {
      const file = Bun.file(join(import.meta.dir, 'e2e/opening-loop.ts'));
      return new Response(transpiler.transformSync(await file.text()), {
        headers: { 'content-type': 'text/javascript; charset=utf-8' }
      });
    }

    if (e2e && url.pathname === '/__e2e__/session/opening-loop.jsonl') {
      const file = Bun.file(join(root, 'traces/session/opening-loop.jsonl'));
      if (!(await file.exists())) {
        return new Response('opening-loop trace is required\n', {
          status: 404
        });
      }
      return new Response(file, {
        headers: { 'content-type': 'application/x-ndjson; charset=utf-8' }
      });
    }

    if (
      !e2e &&
      (url.pathname.startsWith('/e2e/') || url.pathname.startsWith('/test/'))
    ) {
      return new Response('not found', { status: 404 });
    }

    if (url.pathname.startsWith('/payload/')) {
      const name = url.pathname.slice('/payload/'.length);
      // Only the documents the loader asks for, by name. A path that could reach outside the
      // payload directory would make a dev server a file server.
      if (!/^[a-z]+\.json$/.test(name)) {
        return new Response('not found', { status: 404 });
      }
      const file = Bun.file(join(payload, name));
      if (!(await file.exists())) {
        return new Response('not found', { status: 404 });
      }
      return new Response(file, {
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.pathname === '/settings.json') {
      const file = Bun.file(join(root, 'settings.json'));
      if (!(await file.exists())) {
        return new Response('settings.json is required\n', { status: 404 });
      }
      return new Response(file, {
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(Bun.file(join(import.meta.dir, 'index.html')), {
        headers: { 'content-type': 'text/html' }
      });
    }

    // Source is served straight from disk, with the types stripped on the way out, so the
    // browser runs the same files the tests import. Stripping is not bundling: the import
    // specifiers keep their `.ts` extensions and the browser fetches each module from here in
    // turn, which is why there is still no build step and nothing that produces a deployable
    // bundle — the thing ADR 0019 gitignores and ADR 0004 gates.
    const candidate = join(import.meta.dir, url.pathname);
    if (candidate.startsWith(import.meta.dir)) {
      const file = Bun.file(candidate);
      if (await file.exists()) {
        if (candidate.endsWith('.ts')) {
          return new Response(transpiler.transformSync(await file.text()), {
            headers: { 'content-type': 'text/javascript; charset=utf-8' }
          });
        }
        return new Response(file);
      }
    }
    return new Response('not found', { status: 404 });
  },
  hostname: '127.0.0.1',
  port: Number(process.env['PORT'] ?? 5173)
});

console.log(
  `Targ on http://127.0.0.1:${server.port}  — payload from ${payload}`
);
