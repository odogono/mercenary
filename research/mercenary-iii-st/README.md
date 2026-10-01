# Mercenary III ST laboratory

The reproducible Hatari harness and MIII-only decoders behind `payload/dion/` (#647, #648). Facts from it belong to the **Mercenary III research baseline** pinned in [`config/baseline.json`](config/baseline.json). They are neither Damocles Working-Authority Evidence nor Authoritative Evidence.

Nothing here borrows the Damocles laboratory's code, catalogue or assets. Each format is read from Mercenary III's own reader, and that reader's address is cited in the decoder. Under [ADR 0002](../../docs/adr/0002-separate-rom-research-from-implementation.md), the decoders emit data with Research Provenance and translate no code. RAM, screenshots, logs and disassembly are Restricted Material, kept under the ignored `restricted/` root.

## Quick start

Supply the pinned media under a directory named by `M3_ROM_ROOT`, containing `atarist/Mercenary III.STX` and `atarist/tos/emutos206.img`. The pinned Hatari 2.6.1 binary is checked by hash. Every module uses only the Python standard library.

```sh
cd research/mercenary-iii-st
python3 -m m3lab capture --name export      # cold boot; prints the run directory
python3 -m m3lab export --run <run directory>   # writes payload/dion/*.json
R=<run directory>
M3_RAM=$R/v6000.ram M3_OPENING=$R/start.ram M3_ENTRY_RAM=$R/entry.ram \
  PYTHONPATH=.:tests python3 -m unittest discover -s tests
```

`capture` replays R1's spaceport schedule. It saves RAM at the game entry (`entry.ram`, PC `$6AC32`, where the panel artwork DAM6 has just loaded) and at a fresh game's first main-loop top (`start.ram`). It also saves at the loaded-play and journey checkpoints (`v<VBL>.ram`, with screenshots). A run takes about twenty seconds. Pass `loop_top=True` to `boot.Plan` to capture at the main-loop top instead. There, the buffer that `$42C01` names holds the frame drawn from the pose in RAM. The displayed buffer, which a screenshot shows, is the frame before it.

`export` checks every stable slice the research reports published before it decodes anything. Documents from one run share one `source` block. The browser refuses a document from another run, another Title or another program image.

## Full original-game location census

```sh
python3 -m m3lab.census_capture   # prints an ignored full-location-census-* directory
```

This cold-boots the pinned inputs, saves fresh `start.ram`, and executes the
original workspace builder for all 57 groups. Results are saved as
`all-groups/group-00.ram` through `group-56.ram`; the separate
`midas/group-56-uniform.ram` captures MIDAS's 256-cell repetition. Each result
must match its claimed group and authored label pointer. `manifest.json` records
RAM and workspace hashes, source pins and the validated 794 initial group cells
(1,049 with MIDAS repetition, including VOID). All debugger scripts, commands
and captures stay under `restricted/`; this command does not update the Data
Payload. See [the recovery note](../../docs/research/dion-full-location-recovery.md).

Generate the two navigation documents from that capture, from the repository root:

```sh
PYTHONPATH=research/mercenary-iii-st python3 research/mercenary-iii-st/scripts/write-location-docs.py --run <run directory>
```

This writes `docs/dion-object-locations.md` and `docs/dion-structure-locations.md`.
It accounts for all persistent slots, authored groups and named places, including
MIDAS's repeat and the initially absent LOGOS construction. The exact initial
position of a circulating service can differ between fresh boots.

## Modules

| Module | Exports | Readers |
|---|---|---|
| `census_capture.py` | Full original-builder census captures | `$4F0F2..$4F304` |
| `census_locations.py`, `census_objects.py` | All groups, Body placements, residents and names | Full location recovery note |
| `boot.py` | Cold-boot plans and captures | Integration recipe |
| `ram.py` | Provenance-carrying reads | — |
| `geometry.py` | Cells, structures, regions, details, ground, models | `$5600C`, `$5AD2C..$5B2D2`, `$54AEE..$54D20`, `$56204`, `$545AE..$549BA` |
| `world.py` | `world.json`: the fifteen occupied cells, residents, palettes, glyphs, frame facts | Above, plus `$55C58`, `$5A578`, `$7CA2`, `$3E000` |
| `sky.py` | `world.json`: METIS observer/phase, 1,868 star records, colours and empty horizon | #646, `$50B10`, `$50B66`, `$571A8` |
| `panel.py` | `panel.json`: artwork, centre box, fonts, strings, readout fields | `$59C2C`, `$4ED8E`, `$53294`, per-field writers |
| `text.py`, `scripts.py` | `messages.json`, `scripts.json` | `$52AC4`, `$52860..$53002` |
| `sound.py` | `sound.json` | `$530FC`, `$4CB54`/`$4CB6C` |
| `service.py` | `service.json` | `$41F18`, `$51CA2`, `$518AC` |

The findings and their comparisons are reported in [the I1 content-boundary report](../../docs/research/mercenary-iii-i1-content-boundary.md) and [the I2 implementation report](../../docs/research/mercenary-iii-i2-taxi-implementation.md).
