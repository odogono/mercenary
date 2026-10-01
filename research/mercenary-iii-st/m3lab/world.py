"""Assemble the occupied-cell world of the two opening METIS taxi journeys.

The cells are R1's ordered route prefix, fifteen distinct cells in all
([#643](docs/research/mercenary-iii-taxi-lettering.md#coverage-inventory-corrected-accounting)).
Static records come from a loaded-play image; residents are captured from the
opening image, where they stand before the taxi is called. Every decoded record
carries its source range and SHA-256. Stable slices that the research reports
published are checked before anything is decoded.
"""

from __future__ import annotations

from .geometry import (CELL_WORKSPACE, DRAW_PRIORITY, MODEL_COLOURS, PALETTE_TABLE_POINTER,
                       cell_entry, decode_detail, decode_ground, decode_model, decode_structure,
                       detail_record, ground_transform, resolve_structure)
from .ram import Ram, hexaddr

ROUTE_CELLS = [(2, 6), (1, 6), (0, 6), (0, 5), (0, 4), (0, 3), (0, 2), (0, 1),
               (1, 1), (2, 1), (3, 1), (4, 1), (4, 0), (3, 0), (2, 0)]

# Published in docs/research/mercenary-iii-taxi-content-presentation.md and
# docs/research/mercenary-iii-taxi-lettering.md.
STABLE_SLICES = [
    (0x4BD0C, 0x4BD2A, 'e677fd75aae7d1422bff58ac46abcd35dbd5f6764e2088f186e6c147bfa90667', 'bank pointer table'),
    (0x21410, 0x214D6, 'f1e3a2561a55f1f42b2ecb1f48b33500d1e7f65b4655d547dddd3a72a03dbe64', 'METIS authored stream'),
    (0x214D6, 0x2153F, '885c4a0455d7dd087c87c56c98accbc85ff214594ecd64e5bd333f1a26d5fe59', 'METIS label table'),
    (0x5600C, 0x56204, '794d34a699c7eaab974a71c897233d53e4408d814c5a4d62eb27f0b01bec2f50', 'cell bind'),
    (0x56204, 0x563C4, 'a25c05fcee9344a96659c07b69e89f563bd7bf4b9996d4e00cbc4d0d7bbd0d85', 'ground reader and templates'),
    (0x5AD2C, 0x5AE62, 'dcc49ce5c59bf0b71f3c6929b780cd6d8d689e037a0d0a06024d438c1e1457e9', 'structure assembler'),
    (0x5AE62, 0x5B2D2, '8d77b9000d308896337db12f20092cc58c4d9fd50b63d08109048c778b8049c2', 'attachments and region binder'),
    (0x5B2D2, 0x5B4A2, '67b02ebe608ad6cd5fe6846e20241aaac1b7a4a68cedc2a1ff27b11125097bf8', 'region scanner'),
    (0x54340, 0x5439E, '7604de54e586ab8dfbe2044197bb54e033d184a8cb224769bed8b93fc4d0f243', 'plan/detail dispatch'),
    (0x5A578, 0x5A60E, '29520258939134fb9145273c79b4281a6c9878c84662bcf04d6bc3fb28fe6dad', 'frame colour setup'),
    (0x50B10, 0x50B64, '42c3dd432135c7891fa9067e78f95222b8ee686313b97a10f7026ab3e6f040aa', 'day/night test'),
    (0x18DD2, 0x18F40, 'ccdfbdeebc1f5cc89e370a585333cbfc59b9f7cc56aed1c98d7bc31b298d6cc5', 'structure 132, prison'),
    (0x19D06, 0x19D2C, 'd7508d5188d5dba8576830313c3d995d76b777cfbb34774ace1de5a9e358b15e', 'structure 146, road cell'),
    (0x114FC, 0x116B0, '1b0f7ebfb444ce1d03eb00f7561ebc5e41edc87f29b32970f83c20a8b96d7d36', 'structure 57'),
    (0x11F58, 0x12462, 'b099cb3fbf07029281aa1c330e045059c541b5c5dcbad2de76dbc010e97e33c8', 'structure 65'),
    (0x19D62, 0x19E82, '328917df0b03a881a53282b1a9a5ac056970a52dc72fb882b2190d6687066cc0', 'structure 150, spaceport'),
    (0x28924, 0x28C80, '861a613756314a76e19411f8fc25fcc6dde931b006a3d9784c8a327814cb70d7', 'detail 49, prison'),
    (0x29E60, 0x2A24C, '7607e48515b416b021d5a1864a18538eaf8e5d0292352a9c0cbe5b23cf0b350d', 'detail 56'),
    (0x2A3D0, 0x2A808, 'c03df1bbeb159ff585148896936b7b728672787bf3a541990169a89237981f9b', 'detail 59'),
    (0x272C0, 0x275FE, '939886897a9342e47355de0ef2c6baa3c7fea362e52cf6842c2daa07c9d36bfa', 'detail 36, spaceport'),
    (0x2EAB8, 0x2EDC0, '8aa06a4e99c7cfff54bf43ea7796ed0d98415adbc52a3c01867f308d41e2de4e', 'model table'),
    (0x2EA40, 0x2EAB8, 'b54024d3f8279bc648db0a540befed85cb1abed8c0eaa1895c13296e85679c4f', 'model colour table'),
    (0x2FA60, 0x2FC2C, '352f6299ad7bbb990a8e3c82454a1884ce4e429a1ab393be04a3c8afb225efe1', 'TAXI and passenger form'),
    (0x3772A, 0x378A4, 'cce90002cdc0b4b9a127c86d231cf21917566c0aa1f768e16077bc7910a2c050', 'driver heads'),
    (0x37304, 0x37412, 'b5b69a8ae3a63dbea5612a2e7b93f31f17ac20a454aa72e7bb5265ec733fcf15', 'mailbox and letter'),
    (0x54444, 0x544FC, '95b99478356cc7a941a791b84d72cc5994a5a068d467870f281786ad6ae34a51', 'passenger form and driver select'),
    (0x545AE, 0x546F8, '592ee4aba29f4285dc026793df0466992d57a7e72bd6290bc882ddeefb524e7e', 'model draw entry and header dispatch'),
    (0x546F8, 0x549BA, '28d327e2d07e3f1680ddfc776f3452bd53c9d63874f35a2dd3f1ebe963081186', 'model vertex and primitive loop'),
    (0x54182, 0x5430E, '2f123f168720ded8e38eb47dd524c8bd257508c8574ded28293dfa21da473c46', 'drawn-list builder'),
    (0x54FA0, 0x5502E, 'f1981136ac1e65ce2554fefa956e835d722eac7d0d28f35a25d2b4408722c913', 'detail lettering reader'),
    (0x55188, 0x55204, 'd4a9c6ce4d0fc2aed23ece28d92b2b8ca5dbd01a64d58f08a55279116d5328cc', 'token and glyph lookup'),
    (0x5528A, 0x552E2, '34c3cb8de94f4e68cec2c26cfb740f8743f476e5a5e5294fd2c8fab484b07715', 'glyph primitive dispatch'),
    (0x54F20, 0x54F96, 'e9283e4da249ee8ccf4cdbdac424cda73d8d1cef4f2ed17184a4842df14dbaea', 'text animation reader'),
    (0x7542, 0x759A, '0e22d0b83d80f387e1de0e1e86a7cf307444c3f486f7ca6c738dfc1d99b43399', 'lettering token bindings'),
    (0xB3F6, 0xB40A, 'e4abfe42f87608f222a19d0a2ba5b53a5e71b45fde55dae5342c1b693ae124ae', 'sign animation script'),
    (0x3E000, 0x3E080, '31952a41ca08187f519bc02a7c3f14176e4b0062bb2ef8d7f937de79bf07245c', 'font 0 glyph offsets'),
    (0x3E280, 0x3E300, 'd34830243071aaddfb6dbc8d0347b6fc67fb673ff7ac088664cc2cfbeeaeb61a', 'font 5 glyph offsets'),
    (0x3E400, 0x3E402, '9037f92bc91fdcc764a89d9144c341d887ffc83351cc8cf0530555c89920a47d', 'empty space glyph'),
    (0x3F669, 0x3F7E1, '9e407d03e7835bce965579d52cc23cd2e14eea44e867b44daf5033ae46e0ad9c', 'font 5 glyphs $40..$46'),
]

# $7422: the fixed tail of the drawn list, after the cell's template slots.
FIXED_DRAWN = 0x7422
TEMPLATE_SLOT_TOP = 255
FONT_TABLE = 0x3E000
TOKEN_TABLE = 0xB230
SIGN_SCRIPT = (0xB3F6, 0xB409)
METIS_GROUP = 0x6FDE


def check_slices(ram: Ram) -> list[dict]:
    return [{**ram.require(lo, hi, digest, role), 'role': role}
            for lo, hi, digest, role in STABLE_SLICES]


def glyph(ram: Ram, font: int, code: int) -> dict:
    """`$551C0..$552DE`: one vector glyph, as signed byte points and primitives."""
    index = font * 64 - 32 + code
    start = FONT_TABLE + ram.sword(FONT_TABLE + 2 * index)
    p = start
    points = []
    while ram.byte(p) not in (0x80, 0x81, 0x82):
        points.append([ram.sbyte(p), ram.sbyte(p + 1)])
        p += 2
        if len(points) > 63:
            raise ValueError(f'font {font} glyph {code:#x}: point list unterminated')
    form = ram.byte(p)
    p += 1
    primitives = []
    if form == 0x81:
        while ram.byte(p):
            primitives.append({'kind': 'line', 'refs': [ram.byte(p), ram.byte(p + 1)]})
            p += 2
        p += 1
    elif form == 0x80:
        while ram.byte(p):
            refs = []
            while ram.byte(p):
                refs.append(ram.byte(p))
                p += 1
            p += 1
            primitives.append({'kind': 'polygon', 'refs': refs})
        p += 1
    else:
        while True:
            word = ram.word(p)
            p += 2
            if word == 0:
                break
            if word & 0x4000:
                primitives.append({'kind': 'line', 'colour': word & ~0x4000,
                                   'refs': [ram.byte(p), ram.byte(p + 1)]})
                p += 2
            else:
                refs = []
                while ram.byte(p):
                    refs.append(ram.byte(p))
                    p += 1
                p += 1
                primitives.append({'kind': 'polygon', 'colour': word, 'refs': refs})
    for primitive in primitives:
        for ref in primitive['refs']:
            if ref == 0 or ref % 4 or ref // 4 > len(points):
                raise ValueError(f'font {font} glyph {code:#x}: bad reference {ref}')
    return {'font': font, 'code': code, 'form': form, 'points': points,
            'primitives': primitives, 'provenance': ram.slice(start, p)}


def scene_palette(ram: Ram, index: int, entries: int = 22) -> dict:
    """`$5617E..$56196`: night half at the record, day half `word(record − 2)` on."""
    table = ram.long(PALETTE_TABLE_POINTER)
    base = table + ram.word(table + 2 * index)
    day = base + ram.sword(base - 2)
    lo, hi = min(base, day) - 2, max(base, day) + 2 * entries
    return {'index': index, 'night': [ram.word(base + 2 * i) for i in range(entries)],
            'day': [ram.word(day + 2 * i) for i in range(entries)],
            'address': hexaddr(base), 'provenance': ram.slice(lo, hi)}


def resident(ram: Ram, slot: int) -> dict:
    a = 4 * slot
    return {
        'slot': slot,
        'position': [ram.slong(0x581C + a), ram.slong(0x5C1C + a), ram.slong(0x601C + a)],
        'yaw': ram.byte(0x6C1C + a),
        'flags': ram.byte(0x641C + a), 'group': ram.byte(0x641D + a),
        'state': ram.byte(0x641E + a), 'zone': ram.byte(0x641F + a),
        'kind': ram.byte(0x681C + a), 'association': ram.byte(0x681D + a),
        'body': ram.byte(0x681E + a), 'cell': ram.byte(0x681F + a),
    }


def text_tokens(ram: Ram) -> dict:
    return {f'${0x80 | t:02X}': hexaddr(ram.long(TOKEN_TABLE + 4 * t))
            for t in range(0x28)}


def log_float(value: int) -> float:
    """A log-float long: signed exponent word, signed mantissa word in units of `$1000`."""
    exponent = (value >> 16) - (0x10000 if value & 0x80000000 else 0)
    mantissa = (value & 0xFFFF) - (0x10000 if value & 0x8000 else 0)
    return mantissa / 4096 * 2.0 ** exponent


def road_points(ram: Ram, cell: int, transform: int) -> dict:
    """`$55C58..$55C96`: the cell's run-grid long, turned with the ground transform,
    names the four neighbouring road cells whose centres slots `$F0..$FC` project
    (`$55DA4`). Byte 0 goes to `$FC`, byte 3 to `$F0`."""
    value = ram.long(0x1AAC0 + 4 * cell)
    if not transform & 4:
        value = ((value << 16) | (value >> 16)) & 0xFFFFFFFF
    if transform & 2:
        value = (value & 0xFFFF0000) | ((value & 0xFF) << 8) | ((value >> 8) & 0xFF)
    if transform & 1:
        high = value >> 16
        high = ((high & 0xFF) << 8) | (high >> 8)
        value = (high << 16) | (value & 0xFFFF)
    data = value.to_bytes(4, 'big')
    return {'slots': {'252': data[0], '248': data[1], '244': data[2], '240': data[3]},
            'provenance': ram.slice(0x1AAC0 + 4 * cell, 0x1AAC0 + 4 * cell + 4)}


def extract_world(ram: Ram, opening: Ram, route: list[tuple[int, int]] = ROUTE_CELLS,
                  pinned: bool = True) -> dict:
    """Decode the slice's world from a loaded image and residents from the opening one.

    `route` and `pinned=False` serve scene comparisons away from METIS (#682): there
    the Metis stable slices do not hold, because working slots rebind per cell.
    """
    slices = check_slices(ram) if pinned else []
    group = ram.word(METIS_GROUP)
    cells, structures, details, grounds, palettes = [], {}, {}, {}, {}
    for x, z in route:
        cell = z * 16 + x
        entry = cell_entry(ram, cell)
        resolved = resolve_structure(ram, entry['slot'])
        start, transform, index = ground_transform(ram, cell)
        key_base = entry['key'] // 2 + 0x1D if 0 < entry['key'] <= 0x1E else 0
        cells.append({
            **{k: entry[k] for k in ('cell', 'x', 'z', 'key', 'slot', 'dx', 'dz', 'origin')},
            'structure': resolved['geometrySlot'], 'alias': resolved['alias'],
            'scale': resolved['scale'], 'palette': resolved['palette'],
            'detail': resolved['detail'],
            'ground': {'address': hexaddr(start), 'transform': transform, 'index': index},
            'keyBase': key_base,
            'roadPoints': road_points(ram, cell, transform),
            'tokenSet': (entry['key'] - 0xA0) // 2 if entry['key'] >= 0xA0 else None,
            'orientation': ram.byte(0x4170 + cell),
            'provenance': entry['provenance'],
            **({'aliasProvenance': resolved['aliasProvenance']} if resolved['alias'] is not None else {}),
        })
        slot = str(resolved['geometrySlot'])
        if slot not in structures:
            structures[slot] = {'slot': resolved['geometrySlot'],
                                'record': hexaddr(resolved['record']),
                                'scaled': {}}
        scale_key = f"{resolved['scale'][0]},{resolved['scale'][1]}"
        if scale_key not in structures[slot]['scaled']:
            structures[slot]['scaled'][scale_key] = decode_structure(
                ram, resolved['record'], resolved['scale'])
        if str(resolved['detail']) not in details:
            details[str(resolved['detail'])] = decode_detail(ram, resolved['detail'])
        if hexaddr(start) not in grounds:
            grounds[hexaddr(start)] = decode_ground(ram, start)
        if str(resolved['palette']) not in palettes:
            palettes[str(resolved['palette'])] = scene_palette(ram, resolved['palette'])

    # The residents a frame can draw: the fixed list, each cell's template slots, and
    # occupants the structures' association lists hook into region queues.
    fixed = []
    p = FIXED_DRAWN
    while ram.byte(p) or p == FIXED_DRAWN:
        fixed.append(ram.byte(p))
        p += 1
    occupied = {z * 16 + x for x, z in route}
    residents = []
    for slot in range(1, 248):
        r = resident(opening, slot)
        if slot in fixed or (r['cell'] in occupied and r['group'] == group and r['association']):
            residents.append(r)
    entries = {r['slot'] for r in residents} | {318, 263, 264}
    for g in grounds.values():
        entries |= {p['model'] for p in g['primitives'] if p['kind'] == 'template'}
    models = {}
    table = ram.long(0x4BD10)
    for r in residents:
        r['model'] = r['slot'] if ram.word(table + 2 * r['slot']) != ram.word(table) else None
    for entry in sorted(entries):
        if ram.word(table + 2 * entry) == ram.word(table):
            continue
        models[str(entry)] = decode_model(ram, entry)

    # Every font a slice text record names, whole: a token's live string can name any
    # character, so the fonts are exported rather than the characters seen.
    fonts = set()
    for detail in details.values():
        fonts |= {p['flags'] & 0x0F for p in detail['primitives'] if p['kind'] == 'text'}
    for structure in structures.values():
        for scaled in structure['scaled'].values():
            fonts |= {t['plane'] & 0x0F for t in scaled['wallTexts']}
    for model in models.values():
        for form in [model] + ([model['passenger']] if 'passenger' in model else []):
            faces = form['faces'] + [f for a in form['alternatives'] for f in a['faces']]
            fonts |= {f['flags'] & 0x0F for f in faces if f['kind'] == 'text'}
    if 4 in fonts:
        fonts.add(3)  # `$55116`: font 4 falls back to font 3 on `$65B2`.
    glyphs = {f'{font}:{code:02X}': glyph(ram, font, code)
              for font in sorted(fonts) for code in range(0x20, 0x60)}

    rotation = ram.require(0x7E4A, 0x7FCA,
                           '85d7c648b0d75fcb23ebe88ce759d7221614848f3058a3edd308552fbbaf4bda',
                           'Q15 sine table for model rotation')
    template = ram.slice(0x7CA2, 0x7CC4)
    eye = [opening.slong(0x7146), opening.slong(0x714A), opening.slong(0x714E)]
    cell = opening.word(0x71F4)
    blink = {str(r['slot']): opening.word(0x54400 + 4 * r['slot'])
             for r in residents
             if r['model'] is not None and models.get(str(r['model']), {}).get('header', {}).get('op') == 3}
    return {
        'image': {'ramSha256': ram.sha256, 'openingRamSha256': opening.sha256},
        # #644: the level-path projection, recovered by research rather than read here.
        'projection': {'focal': 256, 'centre': [160, 68], 'width': 320, 'height': 136,
                       'evidence': 'docs/research/mercenary-iii-taxi-projection.md'},
        # The reader indexes up to entry 255 + 64, so the table runs past #644's slice.
        'rotationTable': {'words': [ram.sword(0x7E4A + 2 * i) for i in range(320)],
                          'provenance': ram.slice(0x7E4A, 0x7E4A + 640),
                          'publishedSlice': rotation},
        'framePalette': {
            # $7CA2: the frame palette each frame starts from; $8000 marks a free entry.
            'template': [ram.word(0x7CA2 + 2 * i) for i in range(17)],
            'templateProvenance': template,
            # $5A5BA..$5A5D2: entries the frame colour setup writes outdoors.
            'fixed': {'13': 0x445, '15': 0x655},
            'road': ram.word(0x7186), 'land': ram.word(0x70B0),
            'skyDay': ram.word(0x6FD6), 'skyNight': ram.word(0x6FD8),
            'horizonRow': opening.word(0x7298),
            'provenance': ram.slice(0x5A578, 0x5A60E),
        },
        'structureY': opening.slong(0x5C1C),
        'eyeHeight': opening.word(0x713E),
        'thirdHeight': ram.sword(0x71C2),
        'blinkPhase': blink,
        'opening': {
            'eye': eye, 'heading': opening.word(0x7156),
            'cell': cell, 'region': opening.word(0x7194),
            'groupOrigin': [(eye[0] >> 16) - (cell & 15), (eye[2] >> 16) - (cell >> 4)],
            'frameCounter': opening.word(0x7180),
            'pitch': opening.word(0x7154), 'roll': opening.word(0x7152),
            # Panel state a fresh game shows, read from the same image.
            'location': opening.word(0x713C),
            'position': [opening.word(0x70B4), opening.word(0x70B8)],
            'gauges': {'t': opening.word(0x6F2E), 'p': opening.word(0x6F30),
                       'inventory': opening.word(0x6F2C)},
            # $53164..$531D0: each VBL takes the step from the accumulator; at or
            # below zero a second is counted and the refill added back.
            'clock': {'seconds': opening.long(0x6FCE), 'day': opening.word(0x6FD2),
                      'accumulator': opening.sword(0x6F2A), 'step': opening.sword(0x6F26),
                      'refill': opening.sword(0x6F28)},
            'cash': opening.bytes(0x72DE, 0x72E4).hex(),
            # $59A36: each substep the foot Mover steps by the log-float `$71CE` along the
            # heading's half-step sine and cosine, and turns by `$71D2` heading units.
            'walk': {'step': log_float(opening.long(0x71CE)), 'stepWord': opening.long(0x71CE),
                     'turn': opening.sword(0x71D2),
                     'provenance': [opening.slice(0x71CE, 0x71D4)]},
            'provenance': [opening.slice(0x7146, 0x7158), opening.slice(0x70B4, 0x70BA),
                           opening.slice(0x6F26, 0x6F32), opening.slice(0x6FCE, 0x6FD4), opening.slice(0x72DE, 0x72E4), opening.slice(0x713C, 0x713E),
                           opening.slice(0x7180, 0x7182), opening.slice(0x7194, 0x7196),
                           opening.slice(0x71F4, 0x71F6)],
        },
        'stableSlices': slices,
        'metisGroup': group,
        'cellSpacing': ram.sword(0x4BD14),
        'cells': cells,
        'structures': structures,
        'details': details,
        'grounds': grounds,
        'palettes': palettes,
        'models': models,
        'modelColours': {'words': [ram.word(MODEL_COLOURS[0] + 2 * i)
                                   for i in range((MODEL_COLOURS[1] - MODEL_COLOURS[0]) // 2)],
                         'provenance': ram.slice(*MODEL_COLOURS)},
        'drawPriority': {'bytes': list(ram.bytes(*DRAW_PRIORITY)),
                         'provenance': ram.slice(*DRAW_PRIORITY)},
        'drawList': {'fixed': fixed, 'templateTop': TEMPLATE_SLOT_TOP,
                     'provenance': ram.slice(FIXED_DRAWN - 16, FIXED_DRAWN + len(fixed) + 1)},
        'residents': residents,
        'glyphs': glyphs,
        'lettering': {
            'tokenTable': hexaddr(TOKEN_TABLE),
            'bindings89': [hexaddr(ram.long(0x7542 + 4 * j)) for j in range(11)],
            'bindings9D': [hexaddr(ram.long(0x756E + 4 * j)) for j in range(11)],
            'signScript': list(ram.bytes(*SIGN_SCRIPT)),
            'provenance': ram.slice(0x7542, 0x759A),
        },
    }
