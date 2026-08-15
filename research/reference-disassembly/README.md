# Reference Disassembly

This directory contains a reviewed snapshot of the community-maintained Reference
Disassembly used as private research documentation for the Reference Build. It is
tracked because this repository and its history are permanently private (ADR 0017).

The snapshot is **unlicensed third-party material**. No licence was declared in the
selected upstream tree. It is not covered by this project's licence and must not be
published, redistributed, included in an application or source release, or treated
as a build input, runtime dependency, code-generation source, or Data Payload source.

Application code remains independently authored from understood behaviour. Every
Reference Build datum entering the Data Payload is re-extracted from our own image by
our own tooling; nothing is copied from this snapshot into code or payload data.

## Snapshot

`snapshot/` preserves four upstream directories byte for byte. `snapshot.json`
records the immutable source and selected paths. `SHA256SUMS` inventories the exact
files.

To review an update:

1. Fetch the proposed upstream commit into a separate clean clone.
2. Export exactly the paths listed in `snapshot.json`, preserving their names and
   bytes and excluding upstream Git metadata.
3. Compare every exported file with the clean clone, update the commit and import
   date, and regenerate `SHA256SUMS`.
4. Review the complete snapshot diff before committing it.

Verify the checked-in snapshot from this directory with:

```sh
shasum -a 256 -c SHA256SUMS
```
