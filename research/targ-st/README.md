# Escape from Targ ST tool

Reads the ST release of _Escape from Targ_ for the one thing the C64 Reference Build lacks: a title screen, whose mark is Targ's Title Logo ([ADR 0063](../../docs/adr/0063-one-settings-page-across-titles-with-recovered-title-logos.md), [#696](https://github.com/odogono/mercenary/issues/696)). It is not a laboratory. It recovers no Game Semantics, and nothing it reads outranks the Reference Build.

The pinned disk is in [`config/baseline.json`](config/baseline.json). Supply it under a directory named by `TARG_ROM_ROOT`, holding `atarist/Mercenary - Escape From Targ (1986)(Novasoft).stx`. Everything uses only the Python standard library.

```sh
cd research/targ-st
python3 -m targlab files      # the disk's GEMDOS files, read through its FAT
python3 -m targlab export     # writes payload/targ-st/title.png and title.json
python3 -m targlab confirm    # Hatari: the title on screen is E0 (needs EmuTOS 2.06 and Hatari 2.6.1)
PYTHONPATH=. python3 -m unittest discover -s tests
```

`export` reads the STX directly: no emulator, no RAM. It checks the `ESCAPE.PRG` loader steps that show `E0` before it decodes anything. `confirm` keeps its RAM and screenshot under the ignored `restricted/targ-st/`. See [the research note](../../docs/research/targ-st-title-logo.md).

The [ST panel investigation](../../docs/research/targ-st-recovered-panel.md) also uses this disk reader to locate panel artwork and inspect its writers. Its probe and captures remain Restricted Material; the commands above still export only the Title Logo. Panel adoption would require a separate presentation decision under ADR 0027.
