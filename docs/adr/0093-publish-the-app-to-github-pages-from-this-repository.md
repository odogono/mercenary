# Publish the app to GitHub Pages from this repository

Accepted, 2026-11-06. Amends [ADR 0004](0004-gate-sensitive-publication-on-qualified-review.md), [ADR 0017](0017-keep-the-research-repository-private.md), [ADR 0019](0019-pivot-to-a-browser-canonical-typescript-implementation.md) and [ADR 0029](0029-track-the-data-payload-in-the-private-repository.md).

ADR 0004 required written qualified-counsel clearance before a Reconstructed Payload or a complete release could be published. ADR 0019 named a public URL as the goal and gated it on that clearance. ADR 0017 and ADR 0029 kept this repository permanently private and said a public version would be a separate repository, built from scratch. The maintainer now has that clearance, and the repository is public on purpose. A separate repository would only copy what is already public here.

The other options were a separate public repository that receives built bundles from this one's CI, as `war.in.middle.earth` pulls its archive from a private repository, or publishing only the game page. A separate repository adds a token and a second history for nothing once this one is public. Publishing only the game page leaves out tools that the game's own menus link to: the Catalogue, the Atlas and the Targ Asset Browser.

## Decision

- **The Published Site is this repository's app, served by GitHub Pages at `https://opendoorgonorth.com/mercenary/`.** `.github/workflows/pages.yml` rebuilds it on each push to `main`, or by hand.
- **Every document is published**, the developer tools included. The test-only `/e2e/` and `/test/` paths are not.
- **The site is a static export, not a bundle.** `bun run export:site` strips each source file's types, as `serve.ts` does per request. The site therefore runs the same modules the tests import. Modules are renamed `.js` because a static host types `.ts` as video. Each document is written to its path's `index.html`.
- **One base path, read from the module's own URL.** App code names root-relative paths and passes them through `sitePath`. `src/shell/sitePath.ts` takes the base from where it is served, so no build-time setting exists. The development server stays at `/`.
- **The export is checked before it deploys.** CI serves `dist/` the way Pages does, under `/mercenary/`, and loads every document. A failed request or an uncaught error stops the deploy.

## Consequences

- ADR 0004's clearance gate is met for the app and its Data Payload. Other kinds of publication it lists still go through it.
- ADR 0017's "must not be made public" and ADR 0029's "permanently private, separate repository" no longer hold. The Reference Disassembly snapshot, research notes and Golden Traces in this history are public with it.
- ADR 0019's rule that a built bundle is gitignored still holds for `web/dist/`. That is now because the bundle is a build product, not because it is unpublishable.
- `serve.ts` stays the localhost development server. Anything it answers by code rather than from a file needs a matching step in the export. The Targ assets listing is one example.
