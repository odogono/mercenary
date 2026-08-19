import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/// The development server. Localhost only, and deliberately so.
///
/// A hosted build serves payload-derived data to every visitor, which is publication of a
/// Reconstructed Payload by any reading, and that is gated on written qualified-counsel
/// clearance under ADR 0004 (#67). Until then this binds to localhost and there is no build
/// step that produces a deployable bundle.
///
/// It serves three things: the page, the gitignored `/payload/` from the repository root, and
/// the Golden Traces beside it that the page flies. Neither directory is copied into `web/` —
/// both are derived from the Reference Build and belong in exactly one place.

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

if (!existsSync(join(payload, 'manifest.json'))) {
  console.error(
    `No Data Payload at ${payload}.\n` +
      'It is derived from the Reference Build and never tracked; export one with the lab tooling.'
  );
  process.exit(1);
}

const TRACE_PREFIX = '/traces/';

/// The Golden Traces the page is allowed to ask for, as `emitter/id`.
///
/// A trace is as payload-derived as the payload itself, so it is served the same way: by name,
/// against a list, and never by joining what arrived onto a directory. The list is the Trace
/// Scenarios' own, read from the file that marks the repository root, so it cannot drift from
/// what `--emit-traces` writes and there is nothing here to keep in step by hand. A name that is
/// not on it never reaches the filesystem.
///
/// Every emitter is listed rather than one, because which trace the page flies is the page's
/// choice: pinning an emitter here would mean editing the server the first time the page shows a
/// walk instead of a flight, and the failure would read as an unemitted trace rather than as a
/// route that was never allowed.
interface ScenarioFile {
  readonly scenarios?: readonly {
    readonly emitter?: string;
    readonly id?: string;
  }[];
}

const NAME = /^[\da-z-]+$/;

const scenarioNames = (): ReadonlySet<string> => {
  const file = JSON.parse(
    readFileSync(join(root, 'trace-scenarios.json'), 'utf8')
  ) as ScenarioFile;
  const names = new Set<string>();
  for (const { emitter, id } of file.scenarios ?? []) {
    if (
      emitter !== undefined &&
      id !== undefined &&
      NAME.test(emitter) &&
      NAME.test(id)
    ) {
      names.add(`${emitter}/${id}`);
    }
  }
  return names;
};

const traces = scenarioNames();

const transpiler = new Bun.Transpiler({ loader: 'ts' });

const server = Bun.serve({
  development: true,
  async fetch(request) {
    const url = new URL(request.url);

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

    if (url.pathname.startsWith(TRACE_PREFIX)) {
      const asked = url.pathname.slice(TRACE_PREFIX.length);
      const name = asked.endsWith('.jsonl')
        ? asked.slice(0, -'.jsonl'.length)
        : '';
      if (!traces.has(name)) {
        return new Response('not found', { status: 404 });
      }
      const file = Bun.file(join(root, 'traces', `${name}.jsonl`));
      if (!(await file.exists())) {
        // Absence is ordinary rather than broken here — a Golden Trace is never tracked — so
        // the answer says what to run instead of only that the file is not there.
        return new Response(
          `no Golden Trace for ${name}\n` +
            'emit it from the repository root with: ' +
            'cd app && swift run mercenary --emit-traces\n',
          { status: 404 }
        );
      }
      return new Response(file, {
        headers: { 'content-type': 'application/x-ndjson; charset=utf-8' }
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
