# Store each Damocles Model as its own Catalogue file

Accepted, 2026-09-23, for [#435](https://github.com/odogono/mercenary/issues/435). The Damocles
Catalogue is stored as one shared document, `payload/damocles/catalogue.json`, and one file per
Damocles Model, `payload/damocles/models/<id>.json`. The extractor writes both in one run. The
schema version becomes 16. Both stay indented, key-sorted JSON.

The single file had grown to 42 MB, 91% of it Models. Two things followed from that. A regenerated
Catalogue could not be reviewed Model by Model: this project trusts an extraction only after
regenerating it and reading the diff, and one Model's change was lost in a single 40 MiB file.
And every consumer parsed all 1,241 Models, when the Atlas draws the few on one Body and the
inspector list reads none of their geometry. Serving the file gzipped, which #435 did first, fixed
the bytes on the wire but neither of these.

## What the shared document carries

Everything that is not a Model record: Instances, islands, places, Bodies, road networks, tables,
coverage and source. It adds two things so that a consumer can decide what to read before reading
any Model.

- **A model index**, in extraction order, giving each Model's id, name, kind, status, record class
  and slots. That is exactly what the inspector's list and filter read, and it is enough to run the
  slot-accounting and census checks against the tables without a Model file. Where a Model records
  them, the index also carries its storey height and support top: the two facts a game rule reads
  without drawing. A structure residence is admitted by the one and a Drop decided by the other, so
  a Save can be validated, and play can go on, before any Model file has been read.
- **Each Body's Model list**: every Model its Instances name, a placed resident reaching its Body
  through its parent; every ground Model its road networks lay; and the interior each of those
  structures selects its detail from. The extractor derives it, so it is diffable and testable, and
  a consumer never chases a structure to its interior as a second round of reads.

## What a Model file carries

The Model record exactly as the single file held it, and the source run and program hash it was
extracted from. A reader refuses a file whose source is not the shared document's own. That is the
pattern `strings.json` and `arrival-poses.json` already follow, and it catches a Model file left
behind from another run, which an index without per-file hashes would not.

A Model file is checked on arrival against the index: it must be listed, and its name, kind,
status, record class and slots must agree with its entry. Every Model and Instance it names must
exist. The one check that needs two Model records, that a structure's detail binding names a real
variant of its interior, runs when a set of Models is assembled.

## Considered Options

- Keep one file, served compressed and minified.
- One file per Model, storage only, with the server reassembling one document per request.
- One file per Model, sharded into directories by family or by Body.
- Per-Body files, each carrying its Models.
- Binary geometry, on disk or derived at serve time.
- Per-file content hashes in the index.
- One flat file per Model, JSON, with an index and per-Body lists in the shared document.

The last is taken. Compression alone leaves the review problem untouched. Reassembly on the server
keeps every consumer parsing everything. Sharding adds a path rule to compute for no gain, since
ids are already unique and name their family. Per-Body files duplicate every Model that two Bodies
share. Binary breaks the regenerate-and-diff step, the tests' JSON loaders and the hand-written
parser, for a saving gzip mostly delivers already; if parse time is ever measured as the
bottleneck, a binary form belongs at serve time, derived from these files, never checked in.
Per-file hashes duplicate what the source block already refuses, and turn every regeneration into
an index diff as wide as the Model diff.

## Consequences

- The Catalogue's data contract is a directory. A consumer that reads Models reads them by id.
- The dev server's payload route admits digits and two directory levels, still lowercase and
  hyphenated, still `.json` only.
- `schemaVersion` is 16 in the shared document and in every Model file. Payload fields added later
  still do not move it; a layout change does. _(Amended 2026-09-23 by
  [#408](https://github.com/odogono/mercenary/issues/408): a field a Save depends on moves it too,
  so a Damocles Save is never written against a Catalogue that lacks it. The per-instance boarding
  block made it 17.)_
- The browser never reads every Model. The game reads a Body's Models island by island, the one
  the player stands on first, and draws each island whole once it has landed; an Instance whose
  Model has not landed is neither drawn nor collided with. A restore first reads its island and
  the structure it saved as bound. The inspector reads the one Model it shows, and the Atlas the
  structures of the Body in view. Files are read a few dozen at a time, because Chrome refuses
  fetches outright once too many are outstanding.
- A Model file that cannot be read leaves its Instances undrawn and says so; it does not stop play.
- Tests and whole-Catalogue checks still read every file, through the same reader.
