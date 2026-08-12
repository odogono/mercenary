# Verification Records

This directory is the canonical, public-safe record store for the
[Verification System](../docs/verification-system.md).

- `cases/` contains versioned Behavior Case definitions.
- `schemas/` contains the authoritative JSON Schemas.
- `plans/` contains exact-candidate Verification Plans.
- `runs/` contains sanitized public or restricted Verification Manifests.
- `results/` contains immutable Verification Results.
- `approvals/` contains digest-bound maintainer decisions.
- `departures/` contains public Departure Records.
- `reports/` contains issued JSON Conformance Reports.

Only `cases/` and `schemas/` have records before production verification runs
exist. Create the remaining directories lazily when their first canonical JSON
record is ready. Do not commit generated Markdown or Restricted Material.

Validate the tracked definitions with:

```sh
research/c64-reference-build/lab verification validate --root verification
```
