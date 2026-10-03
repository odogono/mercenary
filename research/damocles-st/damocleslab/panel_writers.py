"""Damocles-specific writer facts, recovered under #740.

Geometry below is derived from Damocles layout tables and screen destinations,
independently decoded in restricted/damocles-740/geometry.py. Every table and
reader carries provenance; glyphs and centre pictures are extracted from disk.
Unsupported category content is named explicitly, never supplied from MIII.
"""
from __future__ import annotations


def nibble_rows(data: bytes, groups: int) -> list[str]:
    """Decode interleaved ST plane words to rows of palette-index nibbles."""
    stride = groups * 8
    if groups <= 0 or len(data) % stride:
        raise ValueError('artwork must contain complete planar rows')
    rows = []
    for line in range(0, len(data), stride):
        row = ''
        for group in range(groups):
            offset = line + group * 8
            planes = [int.from_bytes(data[offset + 2 * p:offset + 2 * p + 2], 'big')
                      for p in range(4)]
            row += ''.join(format(sum(((word >> bit) & 1) << p
                                      for p, word in enumerate(planes)), 'x')
                           for bit in range(15, -1, -1))
        rows.append(row)
    return rows



def fonts(sources) -> dict:
    definitions = {
        'panel': ('DAM1', 0x76100, 32, 95, 5, 5, 6, 1, True, '$4E7C2', 0x4E7C2, 0x4E936),
        'message': ('DAM1', 0x76300, 32, 95, 5, 6, 6, 0, False, '$525D2', 0x525B6, 0x52638),
        'digits': ('DAM0', 0x4C75C, 0, 12, 3, 5, 4, 0, True, '$4E7CA', 0x4E7C2, 0x4E936),
        'cardDigits': ('DAM0', 0x4C7C4, 0, 9, 5, 5, 6, 0, True, '$4DA8E/$4DB52/$4DB7A -> $4E7CE', 0x4DA5A, 0x4DAB6),
        'clock': ('DAM0', 0x5222A, 0, 9, 8, 7, 8, 0, True, '$521EE', 0x521B8, 0x5222A),
    }
    out = {}
    for name, (file, base, first, last, width, height, cell, row_offset, inverted, writer, lo, hi) in definitions.items():
        data, provenance = sources.disk_slice(file, base + 8 * first, base + 8 * (last + 1))
        glyphs = {}
        for code in range(first, last + 1):
            offset = (code - first) * 8 + row_offset
            key = chr(code) if name in ('panel', 'message') else str(code)
            glyphs[key] = [format((~byte if inverted else byte) & ((1 << width) - 1), f'0{width}b')
                           for byte in data[offset:offset + height]]
        out[name] = {
            'address': f'${base + row_offset:05X} + 8*' + ('ASCII' if first == 32 else 'value'),
            'codes': [first, last], 'width': width, 'height': height, 'cell': cell,
            'writer': writer, 'inverted': inverted, 'rowOffset': row_offset, 'glyphs': glyphs,
            'provenance': provenance, 'writerProvenance': sources.ram_slice(lo, hi),
        }
    out['digits']['values'] = {'10': 'overflow/placeholder', '11': '+', '12': '-'}
    return out


def palette(sources) -> dict:
    # Colour 0 is loaded by VBL from the frame-colour pointer, not Timer B.
    frame = int.from_bytes(sources.ram[0x7C14:0x7C18], 'big')
    upper = [sources.word(frame)] + [sources.word(0x6FD02 + 2 * i) for i in range(15)]
    lower = list(upper)
    lower[1] = sources.word(0x6FD20)
    return {
        'rows136to151': upper, 'rows152to199': lower,
        'state': 'pinned first-world capture; mutable palette, not universal colours',
        'rules': [
            {'row': 136, 'indices': [1, 15], 'source': '$6FD02..$6FD20 (end exclusive)', 'writer': '$522DA'},
            {'row': 152, 'indices': [1, 1], 'source': '$6FD20', 'writer': '$52340'},
        ],
        'colour0': {'source': 'word at frame-colour pointer $7C14', 'address': f'${frame:05X}',
                    'provenance': [sources.ram_slice(0x7C14, 0x7C18), sources.ram_slice(frame, frame + 2)]},
        'centreSwap': {'atRevealCount': 32, 'colour4': '$7862 -> $6FD08 ($529A2)',
                       'colour1From152': '$7864 -> $6FD20 ($529AA)',
                       'capturedWords': [sources.word(0x7862), sources.word(0x7864)],
                       'provenance': sources.ram_slice(0x7862, 0x7866)},
        'baseline': {
            'words': [sources.word(0x6FD24 + 2 * i) for i in range(16)],
            'xorWord': '$7A52', 'capturedXor': sources.word(0x7A52),
            'rule': '$4D5E8: 16 active words at $6FD02..$6FD21 = baseline $6FD24..$6FD43 XOR $7A52',
            'capturedDifferences': [
                {'index': i + 1, 'baselineXor': sources.word(0x6FD24 + 2 * i) ^ sources.word(0x7A52),
                 'active': sources.word(0x6FD02 + 2 * i)}
                for i in range(16)
                if sources.word(0x6FD24 + 2 * i) ^ sources.word(0x7A52) != sources.word(0x6FD02 + 2 * i)
            ],
            'provenance': [sources.ram_slice(0x6FD24, 0x6FD44), sources.ram_slice(0x7A52, 0x7A54),
                           sources.ram_slice(0x4D5E8, 0x4D60A)],
        },
        'provenance': [sources.ram_slice(0x6FD02, 0x6FD22),
                       sources.ram_slice(0x522C4, 0x5234C), sources.ram_slice(0x51D9A, 0x51E1E)],
    }


def fields(sources) -> dict:
    # writer, layout range, y, plane, font, cell positions, set-plane boxes, source.
    six = lambda x, n: [x + 6 * i for i in range(n)]
    cash_cells = [208, 212, 216, 224, 228, 232, 240, 244, 248, 256, 260]
    definitions = {
        'location': ('$4DBF2', 0x4DBDA, 0x4DBF0, 161, 3, 'panel', six(17, 8), [[16, 63]],
                     '8 bytes at $81DC + 2*code; Body code $7AA8, space code $7922; '
                     'on a Body, nonzero $7882 overrides code to $78'),
        'inventoryName': ('$4DDE2', 0x4DD90, 0x4DDBC, 161, 1, 'panel', six(208, 16), [[208, 303]],
                          '16-byte name before head item record; long-offset name table pointer $4BD10'),
        'altitude': ('$4DF42/$4DEEE -> $4DF5C', 0x4DECE, 0x4DEE4, 172, 3, 'digits',
                     [94, 98, 102, 106, 110, 114], [[94, 117]],
                     'surface: rounded eye Y $7AB6 / 16 as 16.16; Floor $7AC4=10 forces overflow; '
                     'space: nearest range $791C converted by $4DEEE; two whole and four fractional digits'),
        'speed': ('$4DFF4', 0x4DFC4, 0x4DFE2, 161, 3, 'digits',
                  [72, 78, 82, 86, 92, 96, 100, 106, 110, 114], [[72, 74], [78, 120]],
                  'sign 11/12 from $797C; nine digits from $4DFEC: top nibble, '
                  'then repeatedly mask to 28 bits and multiply by ten; changed-value cache $4DFF0'),
        'cash': ('$4E1B4', 0x4E17E, 0x4E1A2, 172, 1, 'digits', cash_cells,
                 [[x, x + 2] for x in cash_cells], 'BCD $7C42..$7C47, first of twelve digits omitted'),
        'position': ('$4E390', 0x4E2B8, 0x4E2CA, 172, 3, 'digits',
                     [33, 37, 41, 52, 56, 60], [[32, 45], [50, 63]],
                     'unsigned words $7A1E/$7A22, each (value*$FA00)>>16 printed as three digits'),
        'centre2Text': ('$4DBBE', 0x4DB84, 0x4DB9E, 170, 2, 'panel',
                        six(136, 8), [[136, 183]], 'category 2 document page name, one row of 8 characters'),
        'centre5Text': ('$4DA06', 0x4D9D4, 0x4D9F2, [170, 177], 2, 'panel',
                        six(130, 10), [[130, 189]], 'category 5 centre text, two rows of 10 characters'),
    }
    readers = {
        'location': (0x4DBF2, 0x4DC40), 'inventoryName': (0x4DDE2, 0x4DECE),
        'altitude': (0x4DEEE, 0x4DFC4), 'speed': (0x4DFF4, 0x4E058),
        'cash': (0x4E1B4, 0x4E21A), 'position': (0x4E390, 0x4E414),
        'centre2Text': (0x4DBBE, 0x4DBDA), 'centre5Text': (0x4DA06, 0x4DA5A),
    }
    out = {}
    for name, (writer, lo, hi, y, plane, font, cells, boxes, source) in definitions.items():
        data, provenance = sources.disk_slice('DAM0', lo, hi)
        out[name] = {
            'writer': writer, 'layoutTable': f'${lo:05X}',
            'layoutWords': [int.from_bytes(data[i:i + 2], 'big') for i in range(0, len(data), 2)],
            'y': y, 'rows': 5, 'plane': plane, 'font': font, 'cells': cells, 'box': boxes,
            'source': source, 'rule': 'set plane across box; clear plane under glyph ink',
            'provenance': provenance, 'drawerProvenance': sources.ram_slice(0x4E7C2, 0x4E936),
            'writerProvenance': sources.ram_slice(*readers[name]),
        }
    out['messageBar'] = {
        'writer': '$52402', 'x': [16, 303], 'y': 144, 'rows': 6,
        'cells': six(16, 48), 'font': 'message', 'planes': [0, 1],
        'source': 'text pointer $7B98; plane byte offset $7BA2 is 0 or 2',
        'rule': 'scroll eight pixels per VBL for 36 VBLs, copy to other screen on VBL 37',
        'provenance': sources.ram_slice(0x5234C, 0x526C2),
    }
    out['clock'] = {
        'writer': '$521B8/$521EE', 'y': 186, 'rows': 7, 'font': 'clock',
        'planes': [0, 1], 'cells': [240, 248, 264, 272, 288, 296],
        'source': 'absolute seconds $793C; HH-MM-SS, separators remain pristine artwork',
        'rule': 'changed digits only; inverted bytes written to both planes in both screens',
        'provenance': sources.ram_slice(0x52158, 0x5222A),
    }
    out['lamps'] = {
        'y': 186, 'rows': 7,
        'list': [
            {'writer': '$509F6', 'x': [199, 203], 'planes': [3],
             'source': '$7A8E and $7AB6', 'rule': 'plane 3 clear iff aboard ($7A8E=0) and eye Y < $28FA'},
            {'writer': '$50A5C', 'x': [213, 217], 'planes': [0, 1],
             'source': '$70104', 'rule': 'nonzero: plane 0 set, plane 1 clear; zero: plane 0 clear, plane 1 set'},
            {'writer': '$5097C/$5099A', 'x': [227, 231], 'planes': [1],
             'source': '$7B3A', 'rule': 'run=3: plane 1 clear; walk=2: plane 1 set'},
        ],
        'provenance': sources.ram_slice(0x5097C, 0x50ABC),
    }
    out['gauges'] = {
        'writer': '$527CC',
        'bars': [
            {'name': 'T', 'x': 6, 'top': 142, 'rows': 48, 'planes': [1, 2], 'source': '$787E', 'clamp': 48},
            {'name': 'P', 'x': 313, 'top': 142, 'rows': 48, 'planes': [1], 'source': '$7880', 'clamp': 48},
            {'name': 'inventory', 'x': 202, 'top': 159, 'rows': 20, 'planes': [1], 'source': '$787C'},
        ],
        'rule': 'one row towards value per VBL; increase clears plane bits, decrease sets them; '
                'inventory value has no clamp in this reader',
        'provenance': sources.ram_slice(0x527CC, 0x52938),
    }
    return out


def centre(sources) -> dict:
    table, provenance = sources.disk_slice('DAM0', 0x66100, 0x6610E)
    categories = []
    for category in range(7):
        base = 0x66100 + int.from_bytes(table[category * 2:category * 2 + 2], 'big')
        art, art_provenance = sources.disk_slice('DAM0', base, base + 0x400, confirm=False)
        categories.append({'category': category, 'address': f'${base:05X}',
                           'pixels': nibble_rows(art, 4), 'state': 'pristine disk artwork before band stamping',
                           'provenance': art_provenance})
    definitions, definition_provenance = sources.disk_slice('DAM0', 0x4D2C4, 0x4D3AE)
    if definitions[-2:] != bytes(2):
        raise ValueError('the centre definition table lacks its zero-item sentinel')
    records = []
    for offset in range(0, len(definitions) - 2, 8):
        row = definitions[offset:offset + 8]
        records.append({'item': row[0], 'category': row[1], 'band': row[2], 'padding': row[3],
                        'colourA': int.from_bytes(row[4:6], 'big'), 'colourB': int.from_bytes(row[6:8], 'big')})
    bands = []
    for category, base, count in ((2, 0x6690E, 19), (6, 0x67C06, 8)):
        data, band_provenance = sources.disk_slice('DAM0', base, base + count * 40)
        bands.append({'category': category, 'bandValues': [2 * i for i in range(count)],
                      'rows': [[''.join(format(int.from_bytes(data[i * 40 + y * 8 + g * 2:
                                                                  i * 40 + y * 8 + g * 2 + 2], 'big'), '016b')
                                           for g in range(4)) for y in range(5)] for i in range(count)],
                      'ink': 14, 'paper': 1, 'provenance': band_provenance})
    return {
        'box': {'x': 128, 'y': 160, 'width': 64, 'height': 32},
        'table': '$66100', 'categories': categories, 'provenance': provenance,
        'definitions': {'address': '$4D2C4', 'records': records, 'provenance': definition_provenance,
                        'paletteRule': 'colourA -> $7864 and $6FD42; colourB -> $7862 and $6FD2A; '
                                       'active colours XOR $7A52 ($4D288)'},
        'bands': bands,
        'selection': {'writer': '$58EC8', 'category': '$785F', 'band': '$7860',
                      'rule': 'art = $66100 + word[$66100 + 2*category]; '
                      'categories 2 and 6 stamp five rows at line 1 from art+$400+20*band; '
                      'plane 0 = complement of strip word; planes 1..3 = strip word',
                      'provenance': sources.ram_slice(0x58EC8, 0x58F2C)},
        'reveal': {'writer': '$5293E', 'count': 64, 'counter': '$52938', 'pointer': '$5293A',
                   'rule': 'each VBL copy rows 161..191 to 160..190 in both buffers; '
                   'count 64..33 inserts black at row 191; count 32 swaps colours; '
                   'count 32..1 inserts consecutive new artwork rows',
                   'dispatch': {'2': '$4DBBE', '3': '$4DAC6 then $4DB66', '4': '$4D58E',
                                '5': '$4DA06', '6': '$4D992'},
                   'provenance': sources.ram_slice(0x5293E, 0x52A0A)},
        'differences': ['Damocles palette sources are $7862/$7864, not MIII $6F12/$6F14',
                        'category 2/6 band plane 0 is complemented, not MIII constant $FFFF',
                        'Damocles centre category dispatch is not the MIII METIS/TAXICARD composition'],
    }


def writer_data(sources) -> dict:
    pairs, pair_provenance = sources.disk_slice('DAM0', 0x526C2, 0x5278A)
    return {
        'fonts': fonts(sources), 'palette': palette(sources),
        'fields': fields(sources), 'centre': centre(sources),
        'decimalPairs': {'address': '$526C2', 'pairs': [list(pairs[i:i + 2]) for i in range(0, len(pairs), 2)],
                         'provenance': pair_provenance},
        'gaps': [
            'centre: category-specific document, navigation, options and other content writers '
            'are identified but their complete compositions and all live-state parity are not established',
            'fonts: the specialised grid coordinate glyph bank is not decoded',
            'fields: grid, mode-specific navigation alternatives and gauge value semantics are not fully decoded',
            'palette: emitted colour words describe the pinned first-world state; live palette changes must follow the recovered rules',
        ],
    }
