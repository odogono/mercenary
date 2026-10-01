# Mercenary III ST laboratory

The reproducible Hatari harness and MIII-only decoders behind `payload/dion/` (#647). Facts from it belong to the **Mercenary III research baseline** pinned in [`config/baseline.json`](config/baseline.json). They are neither Damocles Working-Authority Evidence nor Authoritative Evidence.

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

## Modules

| Module | Exports | Readers |
|---|---|---|
| `boot.py` | Cold-boot plans and captures | Integration recipe |
| `ram.py` | Provenance-carrying reads | — |
| `geometry.py` | Cells, structures, regions, details, ground, models | `$5600C`, `$5AD2C..$5B2D2`, `$54AEE..$54D20`, `$56204`, `$545AE..$549BA` |
| `world.py` | `world.json`: the fifteen occupied cells, residents, palettes, glyphs, frame facts | Above, plus `$55C58`, `$5A578`, `$7CA2`, `$3E000` |
| `panel.py` | `panel.json`: artwork, centre box, fonts, strings, readout fields | `$59C2C`, `$4ED8E`, `$53294`, per-field writers |
| `text.py`, `scripts.py` | `messages.json`, `scripts.json` | `$52AC4`, `$52860..$53002` |
| `sound.py` | `sound.json` | `$530FC`, `$4CB54`/`$4CB6C` |
| `service.py` | `service.json` | `$41F18`, `$51CA2`, `$518AC` |

The findings and their comparisons are reported in [the I1 content-boundary report](../../docs/research/mercenary-iii-i1-content-boundary.md).
