# Structure 100 (`structure-01a618`)

Working-Authority Evidence for why Structure 100 decodes to no supported
surface faces, and what geometry (if any) its 19 Eris placements carry.
Research note for
[#207](https://github.com/odogono/mercenary/issues/207).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint Damocles world
terms in `CONTEXT.md`.

## Scope and non-goals

**In scope:** the wall list and linked building-detail record for Structure
slot 100; whether the extractor was rejecting third-height forms or reading a
genuine empty placeholder; accounting that record in the catalogue without
inventing faces.

**Out of scope:** fabricating buildings for `/damocles` walkabout; applying
Structure 74's live third-height at `$7B2A` to other models; `$7000` roads;
sky/horizon; the full [#173](https://github.com/odogono/mercenary/issues/173)
census.

## Working Authority and reproduce path

| Item     | Value                                                                           |
| -------- | ------------------------------------------------------------------------------- |
| Program  | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`                |
| SHA-256  | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`              |
| TOS pin  | EmuTOS 2.06 (`154803e3…8939d5`)                                                 |
| Lab      | `research/damocles-st/` (`damocleslab`)                                         |
| Scenario | `research/damocles-st/scenarios/first-world.json` (SHA-256 `e5383458…8582f96e`) |

Cited RAM:

- `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` SHA-256
  `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`
- `observe-first-world-20260818T101117Z-010b9ad3` (byte-identical at `$01A618`
  and `$02620E`)

Reproduce:

```sh
research/damocles-st/lab doctor
PYTHONPATH=research/damocles-st python3 -m damocleslab.catalogue \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output payload/damocles/catalogue.json
```

Working Disassembly listings stay ignored under `research/damocles-st/work/`.

## Answer

Structure 100 is an **intentional empty placeholder**. It is not a third-height
form the extractor skipped, and it is not a building whose mesh lives only in
the linked detail bank.

The ordinary record at `$01A618` (surface table `$00E900`, slot 100) has
heights 160 and 128, scene colours `$8082` / `$8092`, metadata scale `(1, 1)`,
palette 62 and interior slot 1. After those header words the plan X terminator
is immediate, then the wall list is the zero word with attachment word 0. There
are no form-2 or form-3 primitives to bind.

Linked building detail 1 at `$02620E` (`interior-02620e`) begins with `$8000`,
the interior vertex terminator. It has no vertices and no faces. The catalogue
already treats object `$8000` headers as null models; this detail record is the
same emptiness on the interior bank, which has no `$800x` object header.

Nineteen Eris cells in `$00ABDC` select slot 100, including four southern
neighbours of Capital Spaceport (`07-08`, structure 74): cells `05-09`,
`06-09`, `07-09` and `08-09`. `/damocles` draws nothing for those placements
because the recovered mesh has zero faces (ADR 0043). Their per-cell ground
records at `$01E000` are **not** empty — they carry pad/road vertices — and
must not be merged into the structure mesh. See
[Eris ground findings](damocles-eris-ground.md).

The extractor accounts the pair as unresolved empty records with an explicit
reason, and does not raise `no supported surface faces` for a zero-length wall
list. Types 2 and 3 with no third-height binding still fail closed.

## Hypothesis ledger

| Hypothesis | Status | Evidence |
| --- | --- | --- |
| Walls are only form 2/3 (third height) | **Refuted** | Zero wall records. Live selector at `$7AF0` is 74; `$7B2A` is 48 and is not applied. |
| Geometry lives only in building detail 1 | **Refuted** | `$02620E` is `$8000` then unused zeros; `decode_mesh(..., 'interior')` sees no vertices. |
| Attachments-only after the wall terminator | **Refuted for this record** | Attachment word is 0. Bytes `C000 8000 7FFF…` sit *after* the next-pointer gap toward slot 101 at `$01A636` and match a trailer seen after other empty structures; they are not consumed as this record's wall list. |
| Both records are intentional empties | **Confirmed** | Immediate plan terminator, wall-list zero word, detail `$8000` terminator, identical on both first-world captures. |
| Visible “buildings” are this mesh hidden by the authored ground plane | **Refuted** | There is no structure mesh. Southern cells have ground records with vertices (`$021B8E` / `$021DE0`). |

## Eris cells using slot 100

| Cell | NAV | Instance |
| ---: | --- | --- |
| `$33` | `03-03` | `eris-surface-33` |
| `$54` | `04-05` | `eris-surface-54` |
| `$64` | `04-06` | `eris-surface-64` |
| `$74` | `04-07` | `eris-surface-74` |
| `$84` | `04-08` | `eris-surface-84` |
| `$95`–`$98` | `05-09` … `08-09` | `eris-surface-95` … `98` |
| `$A9` | `09-10` | `eris-surface-a9` |
| `$B9` | `09-11` | `eris-surface-b9` |
| `$C9` | `09-12` | `eris-surface-c9` |
| `$CE` | `14-12` | `eris-surface-ce` |
| `$D9`–`$DE` | `09-13` … `14-13` | `eris-surface-d9` … `de` |

## Catalogue

`structure-01a618` stays **unresolved** with no variants: a decoded empty mesh
cannot pass the catalogue schema (meshes require vertices). The reason names
the empty surface record and the empty linked detail. Building detail 1 uses
the same empty-terminator reason. Census totals are unchanged (613 unique /
166 decoded / 378 partial / 69 unresolved). `/damocles` unresolved placement
count remains 21: these 19 cells still contribute no faces, together with
`object-036324` and `object-03e30e`.

## Unresolved

- What the 16-byte `C000 8000 7FFF…` trailer after empty structure records is
  for; slot 101 begins at `$01A636`.
- Other empty surface identities that share the same grammar (`structure-00ed68`,
  `structure-01a5f2`, …) beyond this Eris-facing record.
- Whether empty slot 100 ever receives a disk-loaded or script-written mesh
  after the first-world capture.
