"""Decode the Mercenary III instrument panel and centre card for the METIS taxi slice.

`extract_panel(ram, entry=None)` reads a loaded-play RAM image (and, optionally,
the game-entry image described below) and returns plain JSON-serialisable data:

    {
      'screen':   geometry, screen bases, raster palette splits,
      'panelArt': {'width','height','top','pixels','source','provenance'},
      'palette':  panel colour words for rows 136..151 and 152..199,
      'centre':   {'box', 'logo', 'taxicard', 'reveal'},
      'fonts':    {'panel','message','digits','clock'},
      'strings':  card strings, inventory name, location roster,
      'labels':   METIS destination label table,
      'fields':   every panel readout's screen geometry, plane(s) and font,
      'gaps':     what this decoder could not recover,
    }

Conventions. Pixels are rows of hex nibbles (one ST palette index per pixel).
Glyph rows are bit strings, '1' = ink, leftmost pixel first. Colour words are
ST `$0RGB` integers (the ST uses 3 bits per gun; the pinned Hatari renders
level n as 34·n). Coordinates are low-resolution screen pixels (320×200).
Every item carries Research Provenance (`Ram.slice`: source range + SHA-256).

Facts and the Mercenary III readers they come from (disassembled from the
pinned baseline; no code is translated here):

- Screens `$68000`/`$78000`, flipped by `$5A93C` (high byte `$42C01` → `$FF8201`).
  The VBL `$53098` loads the frame colours; Timer B `$53294` loads panel colours
  1..15 from `$6FD02` at row 136 and colour 1 from `$6FD20` at row 152.
- Panel artwork is the head of the program file DAM6, which the loader reads
  straight into `$6D500` (= screen `$68000` row 136) and `$50EDC` copies to the
  other screen. No separate source survives in loaded play: the readouts are
  drawn over it in place. Pass `entry` (RAM saved at the game entry, PC
  `$6AC32`, about VBL 4174) to get the pristine artwork; otherwise the loaded-play
  framebuffer is used with the message bar cleared (see `gaps`).
- Text fields are drawn by `$4ED8E`/`$4ED96`/`$4ED9A` from a per-field layout
  table: one plane is set across the field box and cleared under glyph ink.
- Centre art: table `$3BA00` (`$59C2C`), 32 lines × 64 px, bands stamped from
  `base+$400+band·$14`, revealed by `$53956`.
"""

from __future__ import annotations

from .ram import Ram, hexaddr

# Documented slices (docs/research/mercenary-iii-taxi-content-presentation.md,
# "Inspected slices") and slices this decoder adds. Each is hash-checked.
REQUIRED = {
    'fonts': (0x3B381, 0x3B880, 'cd788e137e5306cd6599627adfb3a4b70a9edd2f857bd702e50c079d4eba0dac'),
    'logo': (0x3BA10, 0x3BE10, '74b7d1e3dc90fde817b537a4fd437c3cb3edbf120df4ef22453858f869efb02e'),
    'cardStrings': (0x4DEB4, 0x4DF04, 'ac153bb9a11b6b3c4f3d1221c3b51d44f8643f8e1f577c6bd62c6d1999bb2d2d'),
    'panelDefinitions': (0x4D6EA, 0x4D80A, '9ce30410810ee51f44eb36be6d515ab26f0c7da066248c73041824d4bde6c70c'),
    'labels': (0x214D6, 0x2153F, '885c4a0455d7dd087c87c56c98accbc85ff214594ecd64e5bd333f1a26d5fe59'),
    'vblPalette': (0x53098, 0x53164, 'd1a1b9060075bf1c012dac568ffd3c9197dea8d0dc244e2ec1b2b5ed522b2a93'),
    'clock': (0x5319C, 0x53294, 'eb4cb41e4de74140c03e70f6d51b6db1e1c062bd546e1350743af437e1e303a8'),
    'artworkSelect': (0x59C2C, 0x59CAC, 'c77da75667de7f0dca2ad8b183eb3a8a3eea5b6e1c1f16a9a93af193ceef96ee'),
    'reveal': (0x53956, 0x53A22, '33dd8687943136d4df46438dc40e2f8a1022e12d94db03fe063245bf962e3591'),
    'messageBar': (0x533DE, 0x536DA, 'c2cf590d1240f62da220341cc75df4ae1be461065b8472253be8266a285b066e'),
    # Added by this decoder (stable across the game-entry image and every
    # spaceport capture 5800..22600).
    'timerB': (0x53294, 0x53366, '86f177eb828e9aa9e5062df60c07c5c643c2cd9979324ed5439d637476a88bcb'),
    'flip': (0x5A93C, 0x5A996, 'ae2300054ff0f99b80d8b31c88525b7a74208999682bd4942b13a09151a51901'),
    'panelCopy': (0x50EDC, 0x50EF4, 'ebfe5c369478216c1bf570eef8b6a5d9fe71b640966ac8f961be5632eeb681ff'),
    'textDrawer': (0x4ED8E, 0x4EF38, '0df9aecdde52b13b0fff28421593daf47bdeaeb80b9aa0bfd1e88e0b4fdda1ed'),
    'activate': (0x4D63C, 0x4D6EA, 'ffd9c9d2603fca36771ff5545732fab032ec2f667b1660c235f57d8217212462'),
    'refresh': (0x4DDD0, 0x4DE2C, 'c276077dff0caddcb2c0fc6a487e309c95b0ca3d48a9d7bee6600e89438592fc'),
    'labelLookup': (0x4DD24, 0x4DD3A, '930b9a27b655f3a4b1980e99242a357a523ee11b359e55c61d3e460ecf492781'),
    'cardTable': (0x4DE96, 0x4DEB4, '79c636c54cdf408ed7c235c0c5bac6a1078feab65e9fc031808a6cd46340edc5'),
    'cardDraw': (0x4DF04, 0x4DF82, '1e63a182c69308997deebbc994fb304b59ba793e42cdbe47637d30d5d127ae35'),
    'locationTable': (0x4E196, 0x4E1AC, '12d97a2904c57a1d01f3a7817c5d29108fd25df39fd4e1500a21df6bd67f0e2f'),
    'locationDraw': (0x4E1AE, 0x4E1FC, '78e9601bae5c6f20b8f808293663933c42b4de384c13fd8b6042357fe3614855'),
    'inventoryTable': (0x4E354, 0x4E380, 'd2394421cb55523761b4e98e7cc0496105ecc65fdd6239d795eec9303e00c035'),
    'inventoryDraw': (0x4E446, 0x4E492, 'd3ec79f3f3d768995fde0924503a473ac8809d5a9530ae2e31a28015b32cfe51'),
    'heightTable': (0x4E492, 0x4E4A8, '300991a86674790fa7188ae677321ac2abe9bcd9fdb16193eb7344f49f60c83c'),
    'heightDraw': (0x4E506, 0x4E588, '30fe0f1aeda9ca96020bff89c0a8dbe8630d3eb459752cb71ca08f01bf05ec6a'),
    'coordinateTable': (0x4E588, 0x4E5A6, '4489fa9b001710b9befaf5c3035de2daf03981f09743c5b47703c0d72c003d61'),
    'coordinateDraw': (0x4E5B8, 0x4E61C, '54e4001874b0eff39810d899044c846dbaf9b6d539838cfcd26f0693dd665101'),
    'cashTable': (0x4E742, 0x4E766, '9c7b450cf09543e0bf582840696431b799aed2af2dc576abc46829d52c980324'),
    'cashDraw': (0x4E778, 0x4E7DE, '252993bf4e32f175b97caafa663f559b4d3d28bba8e7c876838bb7b0a5877ac3'),
    'gridDraw': (0x4E812, 0x4E884, '9b6af51387ed8b8e5068ce8df6ab56a909085f94886ca166e357ac0b504fed30'),
    'gridGlyphs': (0x4EA80, 0x4ED8E, 'be451ec6eb2b24eeeeac0e198d9a38edee63fd1d725ddbb11c44484dfad04131'),
    'positionTable': (0x4E884, 0x4E896, 'c700c11f8a5f4fdbc7122aa908c82990e5dee86eaa4f84d5d1ffb247ec8be458'),
    'positionFrame': (0x4E8A2, 0x4E8AA, 'cc88aa6207230897cd9d7ae74ee3d2a3b7b5a30b52fc6c823dec5934436dc77c'),
    'positionFrameDraw': (0x4E8AC, 0x4E95C, '799d778bb48a5c63968d072a972ceeedf93592eb1dad97ebb40d27bbb8f024e7'),
    'positionDraw': (0x4E95C, 0x4E9DA, 'de229413b0fde83653f3273af5bb7baa8246b20f3f3df265532b06c8478c9af4'),
    'gauges': (0x537E4, 0x53950, '9784cf660148f8f015c327ce191c8d756d174ab7ac295aad80261d576476ca3b'),
    'lamp3': (0x50F22, 0x50F96, '3f44fc63f098ced400d88993c5a74088b5191171f59a77c83cc85e05e20f423c'),
    'lamp1': (0x50F98, 0x51000, '13480081e397bc29be93fbbfeb08a5dd69a92fe2c9c25a20f46914545db2c724'),
    'lamp2': (0x51002, 0x51062, '20f7dd5656c885d567bec14b93ccad71a946b774f1bdd26f650a16b11eb04313'),
    'digitFonts': (0x4CB8E, 0x4CC46, '7747ae77a03869c5e8204d5be282f6dfd541dba7d07c7d180c541f9e0b04a746'),
    'compassStrip': (0x66104, 0x66182, 'fcf0af4fe3d7877f354fb64a7c60553402e9ee6f2287159a23863721a30a90c0'),
    'pitchStrip': (0x3B880, 0x3BA00, '2aacd1a822751d6c3de63d073c1a3109d46a3d5f62887e9cc41f4ec2ae032a3f'),
    'artworkTable': (0x3BA00, 0x3BA10, '7b8f783d8a204399ef1671e408f31d220e1290632e21a63eaf81fe6081a89023'),
    'roster': (0x796A, 0x7A5A, 'b0152f3bf9664e7a10307d18e54b6418a0f1e40227b3bb0bf37aeddcaf6a3e6a'),
    'decimalPairs': (0x536DA, 0x537A2, 'ad78fdedc3155a53ea070ac18b3fa5954fbee980501a4a0172ea404de2af9d70'),
}
# Category 5 artwork: `$59C2C` stamps the title/footer bands into lines 1..5
# and 26..30 at activation, so the range has a documented pre-activation hash
# and a stamped one. The strips themselves are not written.
CATEGORY5 = (0x3CE48, 0x3D338)
CATEGORY5_STATES = {
    '8efc78cfe042286f5b9bf1c92a671c6d94c56cf3ebdbc1ba31e196876c16b8fd': 'pre-activation',
    '09b816cdb15edbb9f26a3413ba642c348b5184914b22da64b8850d0c9dcbac0c': 'bands stamped (TAXICARD)',
}
# DAM6 head as loaded, in the game-entry image ($6D500..$6FD00).
PANEL_ART = (0x6D500, 0x6FD00, 'c30b3940e8822a11e86fd3dfacc8af5a2d55611ecfc5141372cac24cced49874')

SCREEN_BASES = (0x68000, 0x78000)
LINE = 160          # bytes per low-resolution line
PANEL_TOP = 136     # Timer B: first panel row (VBL count $88)
COLOUR1_SPLIT = 152  # Timer B: 16 lines later colour 1 = $6FD20


def _nibble_rows(data: bytes, groups: int) -> list[str]:
    """ST interleaved bitplanes: per 16 px, four plane words (plane 0 first)."""
    rows = []
    for line in range(len(data) // (8 * groups)):
        out = []
        for g in range(groups):
            o = line * 8 * groups + 8 * g
            planes = [(data[o + 2 * p] << 8) | data[o + 2 * p + 1] for p in range(4)]
            for bit in range(15, -1, -1):
                out.append('%x' % sum(((planes[p] >> bit) & 1) << p for p in range(4)))
        rows.append(''.join(out))
    return rows


def _bits(byte: int, hi: int, width: int, invert: bool) -> str:
    """Glyph row: `width` bits from bit `hi` downwards, '1' = ink."""
    s = ''.join('1' if ((byte >> (hi - k)) & 1) != invert else '0' for k in range(width))
    return s


def _require_all(ram: Ram) -> dict:
    return {name: ram.require(lo, hi, digest, name) for name, (lo, hi, digest) in REQUIRED.items()}


def _screen(ram: Ram, prov: dict) -> dict:
    back = ram.long(0x42C00)
    return {
        'width': 320, 'height': 200, 'planes': 4, 'bytesPerLine': LINE,
        'bases': [hexaddr(b) for b in SCREEN_BASES],
        'backBuffer': hexaddr(back),
        'flip': '$5A93C: byte $42C01 -> $FF8201, then toggled; screens differ by $10000',
        'viewRows': [0, PANEL_TOP - 1],
        'panelRows': [PANEL_TOP, 199],
        'rasterSplits': [
            {'row': 68, 'what': 'colour 8 = $7328 (land below the horizon), Timer B $53294'},
            {'row': PANEL_TOP, 'what': 'colours 1..15 = $6FD02..$6FD1F, Timer B $53294'},
            {'row': COLOUR1_SPLIT, 'what': 'colour 1 = $6FD20, Timer B $53294'},
        ],
        'provenance': [prov['timerB'], prov['vblPalette'], prov['flip'], ram.slice(0x42C00, 0x42C04)],
    }


def _palette(ram: Ram) -> dict:
    frame = ram.long(0x72B0)          # colour 0 is never reloaded by Timer B
    colour0 = ram.word(frame)
    upper = [colour0] + [ram.word(0x6FD02 + 2 * i) for i in range(15)]
    lower = list(upper)
    lower[1] = ram.word(0x6FD20)
    return {
        'rows136to151': upper, 'rows152to199': lower,
        'note': 'colour 0 from the frame table ($72B0); colours 4 and 1(>=152) '
                'are the active card colours ($4D63C -> $6F12/$6F14 -> $539BA)',
        'provenance': [ram.slice(frame, frame + 2), ram.slice(0x6FD02, 0x6FD22)],
    }


def _panel_art(ram: Ram, entry: Ram | None, gaps: list) -> dict:
    lo, hi, digest = PANEL_ART
    if entry is not None:
        prov = entry.require(lo, hi, digest, 'DAM6 panel artwork')
        data = entry.bytes(lo, hi)
        source = 'DAM6 file head as loaded at $6D500 (game-entry image, PC $6AC32)'
    else:
        data = bytearray(ram.bytes(lo, hi))
        # The message bar machine ($533DE..$536DA) rewrites planes 0 and 1 of
        # rows 144..149 across groups 1..18; clear them to the empty bar.
        for row in range(144, 150):
            for g in range(1, 19):
                o = (row - PANEL_TOP) * LINE + 8 * g
                data[o:o + 4] = b'\0\0\0\0'
        data = bytes(data)
        prov = ram.slice(lo, hi)
        source = 'loaded-play framebuffer $68000 rows 136..199 (fields already drawn)'
        gaps.append('panelArt: no game-entry image given, so the artwork is the loaded-play '
                    'framebuffer (readouts, card and gauges as drawn at capture; message bar '
                    'cleared). The pristine source is the DAM6 head, only present at game entry.')
    return {'width': 320, 'height': 64, 'top': PANEL_TOP, 'pixels': _nibble_rows(data, 20),
            'source': source, 'provenance': prov}


def _art(ram: Ram, category: int) -> int:
    return 0x3BA00 + ram.word(0x3BA00 + 2 * category)   # $59C2C


def _centre(ram: Ram, prov: dict, entry: Ram | None, gaps: list) -> dict:
    box = {'x': 128, 'y': 160, 'width': 64, 'height': 32}   # $53956: $7E440 = row 160, group 8
    logo_base = _art(ram, 0)
    logo = {
        'categories': [0, 1], 'address': hexaddr(logo_base),
        'pixels': _nibble_rows(ram.bytes(logo_base, logo_base + 0x400), 4),
        'provenance': prov['logo'],
    }
    initial = entry if entry is not None else (ram if ram.byte(0x6F0F) in (0, 1) else None)
    if initial is not None:
        logo['colours'] = {'colour4': initial.word(0x6FD08), 'colour1From152': initial.word(0x6FD20),
                           'provenance': initial.slice(0x6FD02, 0x6FD22)}
    else:
        gaps.append('centre.logo.colours: initial colours 4 and 1(>=152) need the game-entry '
                    'image or a pre-activation capture')

    # TAXICARD definition: 36 records of (item, category, band, 0, colourA, colourB).
    record = None
    for i in range(36):
        a = 0x4D6EA + 8 * i
        if ram.byte(a) == 0x68:
            record = a
    assert record is not None, 'TAXICARD definition record not found'
    category, band = ram.byte(record + 1), ram.byte(record + 2)
    colour_a, colour_b = ram.word(record + 4), ram.word(record + 6)
    base = _art(ram, category)
    lo, hi = CATEGORY5
    found = ram.digest(lo, hi)
    if base != lo or found not in CATEGORY5_STATES:
        raise ValueError(f'{ram.label}: category {category} art ${base:05X} {found} is undocumented')
    art = bytearray(ram.bytes(base, base + 0x400))
    strips = base + 0x400 + band * 0x14
    bands = {}
    # $59C2C: 20 words per band (5 lines × 4 groups); per group plane 0 = $FFFF,
    # planes 1..3 = the strip word. Title at line 1; category 5 adds the footer at line 26.
    for name, first, offset in (('title', 1, 0), ('footer', 26, 40)):
        words = [ram.word(strips + offset + 2 * i) for i in range(20)]
        for i, w in enumerate(words):
            o = 32 * first + 8 * i
            art[o:o + 8] = bytes([0xFF, 0xFF, w >> 8, w & 0xFF, w >> 8, w & 0xFF, w >> 8, w & 0xFF])
        bands[name] = {
            'lines': [first, first + 4],
            'rows': [''.join(format(words[4 * r + g], '016b') for g in range(4)) for r in range(5)],
            'ink': 15, 'paper': 1,
            'provenance': ram.slice(strips + offset, strips + offset + 40),
        }
    taxicard = {
        'item': 0x68, 'category': category, 'band': band, 'address': hexaddr(base),
        'state': CATEGORY5_STATES[found],
        'colours': {'colour4': colour_b, 'colour1From152': colour_a,
                    'note': '$4D63C: first word -> $6F14 -> colour 1 from row 152 ($6FD20); '
                            'second word -> $6F12 -> colour 4 ($6FD08); both XOR $70E8'},
        'pixels': _nibble_rows(bytes(art), 4),
        'bands': bands,
        'definition': ram.slice(record, record + 8),
        'provenance': [ram.slice(lo, hi), prov['panelDefinitions'], prov['artworkSelect']],
    }
    reveal = {
        'reader': '$53956 (per VBL)', 'count': 64,
        'steps': [
            'each VBL rows 160..190 of the box take rows 161..191 (scroll up one line)',
            'count 64..33: row 191 becomes black (index 0)',
            'count 32: colour 4 = $6F12 and colour 1(>=152) = $6F14 (palette swap)',
            'count 32..1: row 191 takes the next new art line (line 0 first)',
            'count 0: category 5 draws the card text ($4DF34)',
        ],
        'refusesPanelInput': 'while the count is nonzero ($4D848, R1)',
        'provenance': [prov['reveal'], prov['artworkSelect']],
    }
    return {'box': box, 'logo': logo, 'taxicard': taxicard, 'reveal': reveal}


def _fonts(ram: Ram, prov: dict) -> dict:
    chars = range(0x20, 0x60)
    panel = {chr(c): [_bits(ram.byte(0x3B381 + 8 * c + r), 4, 5, True) for r in range(5)] for c in chars}
    message = {chr(c): [_bits(ram.byte(0x3B580 + 8 * c + r), 4, 5, False) for r in range(6)] for c in chars}
    digits = {str(v): [_bits(ram.byte(0x4CB8E + 8 * v + r), 2, 3, True) for r in range(5)] for v in range(13)}
    clock = {str(v): [_bits(ram.byte(0x53244 + 8 * v + r), 7, 8, True) for r in range(7)] for v in range(10)}
    return {
        'panel': {'address': '$3B381 + 8*ASCII', 'chars': [0x20, 0x5F], 'width': 5, 'height': 5,
                  'cell': 6, 'drawer': '$4ED8E: inverted glyph bytes, bits 4..0, ANDed as masks',
                  'note': '[ \\ ] ^ hold A/O/U umlauts and sharp s', 'glyphs': panel,
                  'provenance': prov['fonts']},
        'message': {'address': '$3B580 + 8*ASCII', 'chars': [0x20, 0x5F], 'width': 5, 'height': 6,
                    'cell': 6, 'drawer': '$53420/$535CA: bits 4..0 at cell x+1..x+5; row 0 is the accent row',
                    'note': 'O and 0 share one glyph', 'glyphs': message,
                    'provenance': prov['fonts']},
        'digits': {'address': '$4CB8E + 8*value', 'width': 3, 'height': 5, 'cell': 4,
                   'drawer': '$4ED96 (value-indexed, inverted, bits 2..0)',
                   'values': {'10': 'placeholder x', '11': '+', '12': '-'}, 'glyphs': digits,
                   'provenance': prov['digitFonts']},
        'clock': {'address': '$53244 + 8*digit', 'width': 8, 'height': 7, 'cell': 8,
                  'drawer': '$531D2 (inverted bytes written to planes 0 and 1)', 'glyphs': clock,
                  'provenance': prov['clock']},
    }


def _text(ram: Ram, lo: int, n: int) -> str:
    return ram.bytes(lo, lo + n).decode('latin-1')


def _strings(ram: Ram, prov: dict) -> dict:
    card = {}
    for key, lo in (('outOfRange', 0x4DEB4), ('pressToCall', 0x4DEC8),
                    ('selectToStart', 0x4DEDC), ('busPass', 0x4DEF0)):
        card[key] = {'address': hexaddr(lo), 'lines': [_text(ram, lo, 10), _text(ram, lo + 10, 10)]}
    roster = [_text(ram, 0x796A + 8 * i, 8).rstrip() for i in range(30)]
    code = ram.word(0x713C)
    names = ram.long(0x4BD10)                 # $4E45E: item -> name at record-16
    item = ram.byte(0x563E)
    record = names + ram.word(names + 2 * item)
    return {
        'card': {**card, 'pointer': '$7104 (zero byte shows OUT OF RANGE)',
                 'provenance': prov['cardStrings']},
        'inventory': {'item': item, 'name': _text(ram, record - 16, 16).strip(),
                      'text': _text(ram, record - 16, 16), 'address': hexaddr(record - 16),
                      'provenance': [ram.slice(record - 16, record), ram.slice(0x563C, 0x5640),
                                     ram.slice(0x4BD10, 0x4BD14)]},
        'location': {'code': code, 'name': _text(ram, 0x796A + 2 * code, 8).rstrip(),
                     'address': hexaddr(0x796A + 2 * code),
                     'rule': '$4E1AE: name = 8 bytes at $796A + 2*$713C',
                     'provenance': [ram.slice(0x713C, 0x713E), prov['roster']]},
        'roster': {'names': roster, 'provenance': prov['roster']},
    }


def _labels(ram: Ram, prov: dict) -> dict:
    lo = 0x214D6
    records, a = [], lo + 20
    while ram.byte(a):                         # $4DD24: [code][20 chars] until code 0
        text = _text(ram, a + 1, 20)
        records.append({'code': ram.byte(a), 'text': text, 'lines': [text[:10], text[10:]],
                        'address': hexaddr(a + 1)})
        a += 21
    header = _text(ram, lo, 20)
    return {'table': hexaddr(lo), 'header': header, 'headerLines': [header[:10], header[10:]],
            'records': records, 'pointer': '$7100 (table), $7104 (shown)',
            'provenance': prov['labels']}


def _fields(ram: Ram, prov: dict) -> dict:
    # Cells are the x of each glyph's leftmost pixel; boxes are the inclusive x
    # ranges whose plane bit is set before ink is cleared (store words cover
    # all 16 px, OR words their OR bits). Derived from the layout tables
    # interpreted by $4ED9A and checked against framebuffers.
    def text_field(writer, table, rows, plane, font, cells, box, source, **extra):
        return {'writer': writer, 'layoutTable': table, 'y': rows, 'rows': 5, 'plane': plane,
                'font': font, 'cells': cells, 'box': box, 'source': source,
                'rule': 'set plane across box; clear plane under glyph ink', **extra}
    six = lambda x0, n: [x0 + 6 * i for i in range(n)]
    f = {
        'messageBar': {
            'writer': '$53420 (per VBL) via $533DE..$536DA', 'y': 144, 'rows': 6,
            'x': [16, 303], 'cells': six(16, 48), 'font': 'message', 'ink': 1, 'paper': 0,
            'planes': 'ink in plane 0; planes 0 and 1 scroll',
            'motion': 'scrolls left 8 px per VBL, new byte at x 296..303; 4 characters per '
                      '3 VBL; 36 bytes per 48-character message; at count 37 the bar is '
                      'copied to the other screen', 'source': 'text pointer $7232',
            'provenance': prov['messageBar']},
        'location': text_field('$4E1AE', '$4E196', 161, 3, 'panel', six(17, 8), [[16, 63]],
                               '$796A + 2*$713C (8 chars); $7122=2 uses $6FB4, $6F32 uses $78',
                               provenance=[prov['locationDraw'], prov['locationTable'], prov['textDrawer']]),
        'coordinate': text_field('$4E5B8', '$4E588', 161, 3, 'digits',
                                 [72, 78, 82, 86, 92, 96, 100, 106, 110, 114], [[72, 74], [78, 120]],
                                 'sign 11/12 by $700C, 9 decimal digits of $4E5B0',
                                 note='redrawn only when $4E5B0 changes; unchanged (0) in the slice, '
                                      'so the artwork placeholder +XXX XXX XXX stays',
                                 provenance=[prov['coordinateDraw'], prov['coordinateTable']]),
        'inventoryName': text_field('$4E446', '$4E354', 161, 1, 'panel', six(208, 16), [[208, 303]],
                                    '16-byte name of head item $563E', note='the artwork already shows TAXICARD',
                                    provenance=[prov['inventoryDraw'], prov['inventoryTable']]),
        'position': text_field('$4E95C', '$4E884', 172, 3, 'digits', [33, 37, 41, 52, 56, 60],
                               [[32, 45], [50, 63]],
                               '$70B4 and $70B8, each (v*$FA00)>>16 as 3 decimal digits',
                               frame={'writer': '$4E8BE (when $7122 changes)', 'x': [32, 63], 'y': [172, 176],
                                      'rule': 'planes 0..2 clear, plane 3 set; row 174 plane 3 = '
                                              '$FFFC,$3FFF (dash, x 46..49 clear)'},
                               provenance=[prov['positionDraw'], prov['positionTable'],
                                           prov['positionFrameDraw'], prov['positionFrame']]),
        'grid': {'writer': '$4E812 (glyphs $4EA80, X $4ECDA, Z $4EAD2)', 'y': 172, 'rows': 5,
                 'font': 'digits', 'source': 'X $70C2, Z $70CA; |v| clamped to 100; pair from $536DA',
                 'numbers': [{'box': [68, 75], 'tens': 69, 'units': 73},
                             {'box': [80, 87], 'tens': 81, 'units': 85}],
                 'rule': 'in box plane 0 clear, plane 3 set; v>=0 ink clears plane 3, v<0 ink sets plane 0',
                 'provenance': [prov['gridDraw'], prov['gridGlyphs'], prov['decimalPairs']]},
        'height': text_field('$4E506', '$4E492', 172, 3, 'digits', [94, 98, 102, 106, 110, 114],
                             [[94, 117]],
                             'v = round($714A/16) as 16.16: 2 digits of int(v/65536), then the '
                             'fraction times 100 twice; int >= 100 shows placeholder 10s; '
                             '$7158 = $A forces that', provenance=[prov['heightDraw'], prov['heightTable']]),
        'cash': text_field('$4E778', '$4E742', 172, 1, 'digits',
                           [208, 212, 216, 224, 228, 232, 240, 244, 248, 256, 260],
                           [[x, x + 2] for x in (208, 212, 216, 224, 228, 232, 240, 244, 248, 256, 260)],
                           'BCD $72DE..$72E4 (12 digits), first digit not shown',
                           note='commas and point are artwork', provenance=[prov['cashDraw'], prov['cashTable']]),
        'cardText': text_field('$4DF34/$4DF46', '$4DE96', [170, 177], 2, 'panel', six(130, 10),
                               [[130, 189]], '20 chars at $7104 (two lines of 10)',
                               provenance=[prov['cardDraw'], prov['cardTable']]),
        'clock': {'writer': '$531D2 (per VBL, changed digits only)', 'y': 186, 'rows': 7,
                  'planes': [0, 1], 'font': 'clock', 'cells': [240, 248, 264, 272, 288, 296],
                  'width': 8, 'source': 'seconds $6FCE (wraps at 86400); HH-MM-SS, dashes are artwork',
                  'rule': 'planes 0 and 1 set across each cell, cleared under ink',
                  'provenance': prov['clock']},
        'compass': {'writer': '$53A2E', 'y': 182, 'rows': 9, 'plane': 3, 'x': [86, 117],
                    'forcedSet': [[80, 85], [118, 119]],
                    'strip': {'address': '$66104', 'width': 112, 'rows': [
                        format(int.from_bytes(ram.bytes(0x66104 + 14 * r, 0x66104 + 14 * r + 14), 'big'), '0112b')
                        for r in range(9)], 'provenance': prov['compassStrip']},
                    'source': 'heading $7156: n = ((-(h + $70)) & $3F0) >> 4 (64 steps)',
                    'rule': 'plane 3 at x = strip bit n + 1 + (x - 80)',
                    'provenance': ram.slice(0x53A2E, 0x53AAE)},
        'pitch': {'writer': '$53AB2', 'y': 171, 'rows': 20, 'planes': [1, 3], 'x': [16, 31],
                  'strip': {'address': '$3B880', 'rows': [
                      [format(ram.word(0x3B880 + 4 * r), '016b'), format(ram.word(0x3B882 + 4 * r), '016b')]
                      for r in range(83)], 'provenance': prov['pitchStrip']},
                  'source': '$7154: s = ($7154 & $3F0) >> 4; rows s..s+19 of the strip',
                  'rule': 'planes 1 and 3 replaced by the strip words ($7EAEA, +4)',
                  'provenance': ram.slice(0x53AB2, 0x53C2A)},
        'gauges': {'writer': '$537E4 (per VBL, one row toward the value)', 'provenance': prov['gauges'],
                   'bars': [
                       {'name': 'T', 'x': 6, 'top': 142, 'rows': 48, 'planes': [1, 2], 'source': '$6F2E, clamp 48'},
                       {'name': 'P', 'x': 313, 'top': 142, 'rows': 48, 'planes': [1], 'source': '$6F30, clamp 48'},
                       {'name': 'inventory', 'x': 202, 'top': 159, 'rows': 20, 'planes': [1], 'source': '$6F2C'}],
                   'rule': 'a level L clears the planes in the bottom L rows'},
        'lamps': {'y': 186, 'rows': 7, 'provenance': [prov['lamp1'], prov['lamp2'], prov['lamp3']], 'list': [
            {'writer': '$50F9C', 'x': [199, 203], 'planes': [3],
             'rule': 'plane 3 clear while $714A < $28FA on foot, else set'},
            {'writer': '$51002', 'x': [213, 217], 'planes': [0, 1],
             'rule': '$6FF49 >= 0: plane 0 clear, plane 1 set; else swapped'},
            {'writer': '$50F22 (key)', 'x': [227, 231], 'planes': [1],
             'rule': '$71D2 = 2: plane 1 set; 3: clear'}],
            'note': 'unchanged from the artwork in every slice capture'},
        'refresh': {'writer': '$4DDD0', 'order': 'location, grid, position, height, cash, coordinate, '
                    'pitch, compass, lamp 2, lamp 1 (when $7122 != 2)', 'provenance': prov['refresh']},
    }
    return f


def extract_panel(ram: Ram, entry: Ram | None = None) -> dict:
    """Decode the panel for the METIS taxi slice from a loaded-play image.

    `entry` is optional RAM saved at the game entry (PC `$6AC32`, after the DAM6
    load); with it, `panelArt` is the pristine artwork.
    """
    prov = _require_all(ram)
    gaps: list[str] = []
    out = {
        'screen': _screen(ram, prov),
        'panelArt': _panel_art(ram, entry, gaps),
        'palette': _palette(ram),
        'centre': _centre(ram, prov, entry, gaps),
        'fonts': _fonts(ram, prov),
        'strings': _strings(ram, prov),
        'labels': _labels(ram, prov),
        'fields': _fields(ram, prov),
    }
    gaps += [
        'fonts: the 5-px card digit font at $4CBF6 (used by other card categories) is not decoded',
        'fields.coordinate: the meaning of $4E5B0 is unknown; it is never drawn in the slice',
        'fields.messageBar: text decoding ($53366 tokens) belongs to the message report, not here',
        'fields: $7122 = 2 alternatives ($4E9E0 three-number readout, $4E4B2 height) are not decoded',
    ]
    out['gaps'] = gaps
    return out
