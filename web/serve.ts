import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

/// The development server. Localhost only, and deliberately so.
///
/// A hosted build serves payload-derived data to every visitor, which is publication of a
/// Reconstructed Payload by any reading, and that is gated on written qualified-counsel
/// clearance under ADR 0004 (#67). Until then this binds to localhost and there is no build
/// step that produces a deployable bundle.
///
/// It serves two things: the page, and the gitignored `/payload/` from the repository root. The
/// payload is not copied into `web/` — it is game data and belongs in exactly one place.

const findRepositoryRoot = (): string => {
  let directory = import.meta.dir
  for (;;) {
    if (existsSync(join(directory, "trace-scenarios.json"))) return directory
    const parent = dirname(directory)
    if (parent === directory) throw new Error("could not find the repository root")
    directory = parent
  }
}

const root = findRepositoryRoot()
const payload = process.env["MERCENARY_PAYLOAD"] ?? join(root, "payload")

if (!existsSync(join(payload, "manifest.json"))) {
  console.error(
    `No Data Payload at ${payload}.\n` +
      "It is derived from the Reference Build and never tracked; export one with the lab tooling.",
  )
  process.exit(1)
}

const server = Bun.serve({
  port: Number(process.env["PORT"] ?? 5173),
  hostname: "127.0.0.1",
  development: true,
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/payload/")) {
      const name = url.pathname.slice("/payload/".length)
      // Only the documents the loader asks for, by name. A path that could reach outside the
      // payload directory would make a dev server a file server.
      if (!/^[a-z]+\.json$/.test(name)) return new Response("not found", { status: 404 })
      const file = Bun.file(join(payload, name))
      if (!(await file.exists())) return new Response("not found", { status: 404 })
      return new Response(file, { headers: { "content-type": "application/json" } })
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file(join(import.meta.dir, "index.html")), {
        headers: { "content-type": "text/html" },
      })
    }

    // Source is served straight from disk; Bun transpiles the TypeScript on the way out, so the
    // browser runs the same files the tests import.
    const candidate = join(import.meta.dir, url.pathname)
    if (candidate.startsWith(import.meta.dir)) {
      const file = Bun.file(candidate)
      if (await file.exists()) return new Response(file)
    }
    return new Response("not found", { status: 404 })
  },
})

console.log(`Targ on http://127.0.0.1:${server.port}  — payload from ${payload}`)
