# Pivot to a browser-canonical TypeScript implementation

The Faithful Remake's primary platform becomes the browser, and its canonical
codebase becomes a TypeScript implementation under `web/`. This supersedes ADR
0001's platform choice: Swift, Metal, and an AppKit or SwiftUI shell were chosen
at the explicit cost of portability to non-Apple platforms, and that cost is no
longer worth paying. The reason is reach. A remake nobody can start is a claim,
and ADR 0014 already decided that this project trades claims for artifacts; a URL
anyone opens is a stronger artifact than a Mac application that must be
downloaded, trusted, and run on the right hardware. What ADR 0001 wanted besides
nativeness — direct control over the wireframe renderer rather than a
general-purpose engine's idea of one — survives intact, because the browser
renderer is a WebGL2 line list this project owns outright. The provenance rule of
ADR 0002 and ADR 0014 carries over unchanged and now binds twice: TypeScript
engine code is written from understanding of the Reference Build, and it is not a
mechanical translation of the Swift implementation either.

The pivot is affordable now because the port surface is small, and it is small by
accident rather than by foresight. The whole simulation — payload decode, world
build, projection, the Benson interpreter, and the game core — is Foundation-only
pure value code that touches no Apple framework behaviour; the interactive
renderer is one short pass that strokes projected segments; input is already
translated into device-independent intents before the core sees it; and the Data
Payload is language-neutral JSON. The port is therefore a rewrite of a
self-contained core plus a new shell, not an extraction.

The Swift application becomes the Trace Oracle. Until the browser reproduces the
opening loop it remains the reference implementation and the working artifact,
and its existing headless diagnostics — flight traces, Benson execution traces,
frame capture, and inspection renders — emit the deterministic traces the
TypeScript modules must reproduce to be believed. Only selected tests are ported
by hand, for decode and interpreter behaviour a trace cannot pin. Human
side-by-side review against the Reference Build remains the final arbiter, as ADR
0011 already established. The port starts from a stabilised snapshot rather than a
moving target: the authoritative gameplay session and the payload schema that
issue #65 leaves behind. When the browser reaches the opening loop the canonical
status flips and the Swift application is archived rather than wrapped — a native
shell around the web build would be a second surface to maintain for no
additional reach. Underground presentation and everything after it continues on
the browser side.

ADR 0009 is retired. The Host Callout seam it was designed to serve survives
untouched, because that seam is a property of the game logic and not of a
language; the restricted Lua interface, the sandboxed XPC simulation service, and
the host ABI that came with them do not, since in a TypeScript engine the
scripting language at that seam is JavaScript and the isolation primitives are the
browser's own. The Lua fixtures and interface contracts under
`implementation-contracts/` are frozen as history in the same sense as ADR 0014's
verification apparatus: accurate for reading the records they belong to, extended
by nothing. ADR 0012's deterministic CBOR contracts were specified for the
Lua, state, save, and XPC boundaries, two of which no longer exist; their fate is
deliberately left open until saves are actually built, and its integer-preserving
JSON rule for content is unaffected.

Deployment is localhost only until written qualified-counsel clearance is
obtained under ADR 0004. This is the sharpest consequence of the pivot and the one
worth stating plainly: the Mac application kept extracted game data on one
private machine, whereas a hosted browser build serves payload-derived data to
every visitor, which is publication of a Reconstructed Payload by any reading. A
public URL is nonetheless the stated goal, so clearance becomes a real
prerequisite on the critical path rather than a hedge held in reserve. Golden
trace files and any built web bundle are payload-derived and are gitignored
exactly as `/payload/` is.

Two consequences of ADR 0017 are worth making explicit, since this decision puts
the canonical codebase inside a repository that is permanently private. Serving a
built bundle is an application distribution and remains available under the
existing qualified-review gate, so a public URL is not foreclosed; publishing the
engine's _source_ is a different act, and ADR 0017 forecloses it for this history.
The canonical implementation is therefore private source that may yield a public
artifact — the same shape the Mac application already had, and the reason the
provenance rule in the first paragraph is worth keeping even though nothing
compels it today. Should engine source publication ever be wanted, it will need a
deliberate export rather than a repository flip, which is a cost this decision
accepts rather than solves.

The alternatives were a Swift core compiled to WebAssembly, which keeps the
existing code and its whole test suite but leaves a rare toolchain and a permanent
interop tax on what is now the primary platform, in service of a Mac application
that is being retired anyway; a native wrapper around the web build, which keeps a
`.app` on the Dock and adds a shell to maintain for no reach; and a general engine
such as Three.js, whose scene graph is a worldview a pipeline of projected
two-dimensional segments does not need and would have to work around. The accepted
costs are rewriting roughly four thousand lines of core with a hand-ported subset
of its tests, a period in which the canonical codebase is behind the one it
replaces, the loss of the Swift test suite as a live regression net once the
application is archived, and clearance standing as a hard gate on the public
ambition rather than a formality after it.
