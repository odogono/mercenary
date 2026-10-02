# Targ's Title Logo from the ST release

Recovered 2026-10-02 for [#696](https://github.com/odogono/mercenary/issues/696). The C64 Reference Build boots straight into the star field and has no title screen ([ADR 0032](../adr/0032-play-an-authored-arrival-over-the-opening-script.md)). The ST release has one, and it is a plain picture file on the disk. A RAM capture was not needed, so neither is an ST-Targ laboratory: [`research/targ-st/`](../../research/targ-st/README.md) reads the file off the pinned STX, and a Hatari run only confirms it.

This is presentation only ([ADR 0063](../adr/0063-one-settings-page-across-titles-with-recovered-title-logos.md)). Nothing here is Game Semantics, and nothing from the ST release outranks the Reference Build.

## The disk

`Mercenary - Escape From Targ (1986)(Novasoft).stx`, SHA-256 `4d9e48d7…3cff2cdd`, is a Pasti image of a single-sided GEMDOS floppy: 80 tracks of 9 sectors. Track 79 holds only sectors 1–6, plus three copy-protection sectors with IDs 245–247. It carries both Novagen ST titles:

| File | Size | Attributes | What |
| --- | --- | --- | --- |
| `ESCAPE.PRG` | 652 | — | _Escape from Targ_ loader |
| `E0` | 32,128 | hidden | title picture (NEOchrome) |
| `E1`–`E4`, `M` | 38,272 / 20,480 / 32,256 / 8,192 / 60,544 | hidden | game, loaded to `$40000`, `$60000`, `$58200`, `$70000`, `$49580` |
| `SECOND.PRG`, `S0`–`S4` | 652, … | `S*` hidden | _The Second City_'s loader and files, not read here |
| `XX`, `XY` | 5,119 / 24,576 | hidden | not read here |

The disk does not autoboot: EmuTOS 2.06 reaches the GEM desktop, and the player starts `ESCAPE.PRG`.

## The loader

`ESCAPE.PRG` relocates itself to `$72000` and then, by file offset:

| Offset | Step |
| --- | --- |
| `$7C` | `Fread` of `E0` (name at `$A8`) to `$60000` |
| `$B0` | copies `$60080..$67FFF`, the pixels after the 128-byte header, to `$78000` |
| `$22E` | `$FF8260` ← low resolution |
| `$236` | `$FF8201` ← `$07`; EmuTOS leaves the mid byte at `$80`, so the screen is `$78000` |
| `$23E` | sixteen colours from its table at `$266` to `$FF8240` |

The table at `$266` is word-for-word the palette in `E0`'s header. The title stays up while the loader reads the game files. Then it jumps to `$40000`, and the game draws the star field and the ST Benson panel.

`E0` is therefore a NEOchrome picture: a 128-byte header with the palette at bytes 4–35, then 32,000 bytes of four interleaved low-resolution planes. Its picture is NOVAGEN, MERCENARY over a wire globe, BY PAUL WOAKES, ESCAPE FROM TARG and the copyright line, on green.

Hatari confirms it: started with `--auto A:\ESCAPE.PRG` under the Mercenary III laboratory's machine settings, the 32,000 bytes at `$78000` equal `E0`'s pixels at VBL 750 (`python3 -m targlab confirm`).

## The mark

The Title Logo is every pixel of palette index 3 (`$770`, yellow): the MERCENARY lettering and the globe. They are one mark. The globe's lines join E, N, A, R and Y into one connected shape, so no box separates them, and nothing else in the picture uses index 3. Its bounds are x 6–309, y 21–136: 304 × 116 pixels. Index 0 appears nowhere in `E0`, so the export writes `0` for pixels outside the mark, and the browser draws them transparent. The other lettering is in other colours and is not part of the logo.

`payload/targ-st/title.json` carries the disk, picture and loader hashes, the loader steps it checked, the palette, and the mark as rows of hex nibbles. Each slice has its byte range in `E0` and its SHA-256, as `payload/dion/panel.json` does. The Browser Shell shows it at its own size on every System Menu page in place of the Mercenary Pixel stand-in.

## Not done

- The ST Benson panel is now one `--auto` boot away. ADR 0027 recreated it by eye because no ST-Targ capture existed. Recovering it would be its own ticket.
