# Escape from Targ ST tool

Reads the ST release of _Escape from Targ_ for presentation: its Title Logo and Benson Panel (ADR 0072). The C64 Reference Build has no title screen, so the ST mark is Targ's Title Logo ([ADR 0063](../../docs/adr/0063-one-settings-page-across-titles-with-recovered-title-logos.md), [#696](https://github.com/odogono/mercenary/issues/696)). It is not a laboratory. It recovers no Game Semantics, and nothing it reads outranks the Reference Build.

The pinned disk is in [`config/baseline.json`](config/baseline.json). Supply it under a directory named by `TARG_ROM_ROOT`, holding `atarist/Mercenary - Escape From Targ (1986)(Novasoft).stx`. Everything uses only the Python standard library.

```sh
cd research/targ-st
python3 -m targlab files      # the disk's GEMDOS files, read through its FAT
python3 -m targlab export     # writes payload/targ-st/title.png and title.json
python3 -m targlab confirm    # Hatari: the title on screen is E0 (needs EmuTOS 2.06 and Hatari 2.6.1)
PYTHONPATH=. python3 -m unittest discover -s tests
```

`export` reads the STX directly: no emulator, no RAM. It checks the `ESCAPE.PRG` loader steps that show `E0` before it decodes anything. `confirm` keeps its RAM and screenshot under the ignored `restricted/targ-st/`. See [the research note](../../docs/research/targ-st-title-logo.md).

The [ST panel investigation](../../docs/research/targ-st-recovered-panel.md) and
[writer follow-up](../../docs/research/targ-st-panel-writers.md) supply the recovered
Benson Panel presentation under ADR 0072:

```sh
python3 -m targlab export-panel   # deterministic payload/targ-st/panel.json
python3 -m targlab confirm-panel  # natural and controlled native-writer captures
```

The exporter excludes the copy tail beyond the visible 64 rows and extracts fonts,
compass slots/ticks and elevation rows, each with source hashes. Raw confirmation
results remain under `restricted/targ-st-panel-743/` in the main checkout. The
browser retains C64-authoritative Session Snapshot adapters and readout meanings.
