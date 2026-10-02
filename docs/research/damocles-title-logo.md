# The Damocles Title Logo, from `ETITLE.NEO`

Working-Authority Evidence for [#695](https://github.com/odogono/mercenary/issues/695),
under [ADR 0063](../adr/0063-one-settings-page-across-titles-with-recovered-title-logos.md).
The STX (SHA-256 `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`) is
the only input. `damocleslab.title` reads it the way the game's own loader does, and
writes `payload/damocles/title.json`:

```sh
cd research/damocles-st
.venv/bin/python -m damocleslab.title \
  --stx "../../roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx" \
  --output ../../payload/damocles/title.json \
  --confirm-run work/<title-screen run>
```

`--confirm-run` is optional. It checks the extracted picture against a `title-screen`
capture (`title-screen-20260818T100238Z-ba3cfe1d`, RAM SHA-256
`171f4d383bab5175fd69b48a46a4aa8a72ce3f5771fd3b5475a6fbf4c44b8889`). The picture is at
`$60000` and on screen at `$78000`, byte for byte. `tests/test_title.py` regenerates the
document from the STX and compares it with the tracked file.

## The title screen

The screen base is `$78000`, in low resolution. Matching every 256-byte base in the
title-screen RAM against the capture's display gives one exact match over all 64,000
pixels. The palette is the sixteen words at `$60004`:
`000 234 456 567 677 700 774 775 776 111 222 333 444 555 666 777`.

`$60000` holds a whole NEOchrome picture, 32,128 bytes. It has a zero flag and resolution
word, the palette at +4, a blank filename at +36, 320 and 200 at +58 and +60, and the
pixels from +128. BOOT shows it:

| Address | What it does |
| --- | --- |
| `$6801C` | loads `ETITLE.NEO` to `$60000` through the loader |
| `$680AC` | waits for vsync, sets low resolution, sets the screen base to `$78000`, copies the palette from `$60004` to `$FF8240` |
| `$68042` | copies the pixels from `$60080` to `$78000`–`$7FD00` |

BOOT then loads `DAM0` to `$140` and `DAM1` to `$6D500`, and jumps to `$6ABA6`.

## The disk file and the loader

The STX has no filesystem that TOS can read (#280). The loader BOOT carries at
`$68200`–`$68A1A` has its own directory, its own track format and its own packing.

**Directory.** `$68704` restores to track 0 and reads sectors 2 and 3 of side 0. `$6891E`
decrypts those 1,024 bytes with a word keystream (seeds `$2367`, `$ED5F`) into `$68AA4`.
An entry is sixteen bytes: an eleven-character name, then five bytes that `$68300` rotates
out a bit at a time into a 6-bit offset (with the first byte as its high bits), a 7-bit
track and a 19-bit length plus 4. The directory holds four files:

| Name | Track | Offset | Length |
| --- | ---: | ---: | ---: |
| `BOOT` | 2 | 0 | 9,952 |
| `ETITLE  NEO` | 3 | 4,141 | 13,500 |
| `DAM0` | 5 | 5,786 | 244,632 |
| `DAM1` | 47 | 329 | 24,308 |

**Tracks.** File tracks are side 0 only, and have no sectors. `$68364` reads a whole track.
It finds the `$A1` sync, then checks `$0F`, the track number, `$0F` and the side identity
`$44`, and skips one byte. Then it walks 6,144 data bytes. A `$0F` escapes the next byte,
which is stored inverted, so `$0F $0A` is `$F5` and `$0F $F0` is `$0F`. The escapes keep
the FDC's mark bytes (`$A1`, `$C2`, `$F5`–`$F7`) out of the data. The first track is entered
at the entry's offset, counted in raw bytes, and the escape state carries from one track to
the next. `ETITLE.NEO` runs over tracks 3, 4 and 5. A word checksum after the data
(`$68610`) is checked by the loader but not by the extractor. The extractor checks the
result whole instead.

**Decryption and packing.** `$68432` XORs the whole file with a long keystream (seeds
`$F4BD128C`, `$5716923A`). A file that then starts with `OTNM` is unpacked in place by
`$68530`. The header is the tag, the unpacked length and the packed length. The bit stream
is read backwards from the end of the file in longwords, with a sentinel bit, and the output
is written backwards from its end. The codes are:

- `00` + 3 bits: 1–8 literals.
- `01`: a 2-byte match with an 8-bit distance.
- `1` + 2 bits:
  - 0 or 1: a 3- or 4-byte match with an 8- or 9-bit distance;
  - 2: an 8-bit length and an 8-bit distance;
  - 3: 9–264 literals.

`ETITLE.NEO` is 13,500 bytes on disk and 32,128 unpacked.

The extractor reproduces every stage against the running machine:

- the decrypted directory equals the RAM at `$68AA4`–`$68EA4`;
- the bytes off the tracks equal the loader's buffer at its decrypt entry, `$68432`;
- the unpacked picture equals `$60000`–`$67D80`, SHA-256
  `d90ac8d14280ba7eadd5c533b20341f64d887db7af4b15a07c48f6cf62626406`.

The same chain unpacks BOOT, 18,412 bytes. Its loader body, `$68230`–`$68AA4`, is stored
under one more word keystream (seeds `$FE23`, `$3F89`), which `$681FC` applies before and
after every loader call. With that undone, BOOT equals the RAM at `$68000` except where the
machine has written since: the register save area at `$681BC`, the loader's variables at
`$68A7A`–`$68AA3`, the directory and the track buffer at `$692A4`.

## The `title-screen` checkpoint, corrected

The `title-screen` checkpoint breaks at `$68582` (`addx.l d2,d2`), and
`BOOT-AND-UNPACKING.md` called that PC the title-loop entry. It is inside the `OTNM`
unpacker's bit reader. The first hit is the unpacking of `ETITLE.NEO`. By the time the
checkpoint's 1,400 further VBLs have passed, D7 holds 244,632, which is `DAM0`'s length: the
title screen stays up while the world is unpacked. The checkpoint is still a reproducible
point with the title painted. It is not a loop waiting for input.

## The mark

The Title Logo is the DAMOCLES lettering, at x 16, y 0, 284 × 43 pixels. It is the
8-connected run of non-zero pixels in rows 0–42 that can be reached from a pixel of the D.
Rows 0–42 are the lettering's rows: from row 43 down there is only the glow and the sword
blade. The run takes in the sword hilt, which forms the D's upright, and the glow behind
MOC, because both touch the letters. Everything else is left clear. That is colour 0 and
21 single-pixel stars, each with no non-zero neighbour. The rule is code (`lettering` in
`damocleslab/title.py`), not drawing, so it is part of the extraction. The document's
`logo.provenance` covers the picture rows it is cut from, `$60080`–`$61B60`.

`web/src/damocles/titleLogo.ts` reads the document, and the Damocles boot shows the mark
through `InstalledShellChrome.showLogo` in the picture's own colours. It refuses a document
whose program identity is not the Catalogue's.
