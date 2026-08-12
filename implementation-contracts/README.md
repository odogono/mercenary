# Mercenary Implementation Contracts v1.0

This directory is the machine-checkable companion to
[`docs/implementation-specification.md`](../docs/implementation-specification.md).
Markdown governs semantic policy; the JSON Schemas and CDDL here govern exact
record and wire shape. Golden vectors settle canonical bytes, digests,
signatures, and rejection behavior.

Install the locked CDDL tool once into a task-specific bundle path, then run the
complete validator from the repository root:

```sh
BUNDLE_PATH=/path/to/task-bundle bundle install \
  --gemfile implementation-contracts/Gemfile
BUNDLE_PATH=/path/to/task-bundle ./implementation-contracts/validate
```

The wrapper runs the locked reference CDDL parser followed by the repository
validator. The latter applies an additional dependency-free profile preflight
and an independent strict CBOR decoder to all golden vectors. A quick local run
that assumes the CDDL files were already reference-validated is also available
as `lab implementation validate --root implementation-contracts`.

All fixtures are synthetic and public-safe. The bundle contains no Reference
Build payload, reconstructed value, private path, or restricted digest.

## Layout

- `version-registry.json` closes every v1 schema and protocol family.
- `json-schema/` uses JSON Schema Draft 2020-12 for MCJ-1 package records.
- `cddl/` uses RFC 8610 CDDL for the deterministic-CBOR runtime boundary.
- `vectors/` contains positive and negative canonicalization fixtures.
- `malicious/` contains synthetic Lua and generated hostile seeds with required
  error categories and rollback behavior.
- `fuzz-targets.json` fixes the libFuzzer entry surfaces and PR/nightly/release
  durations; production target names are declarations for the later Swift
  implementation, not scaffolding in this issue.

Production Swift types must pass these vectors but are not generated from
them. This keeps the portable contract independent of a Swift implementation.
