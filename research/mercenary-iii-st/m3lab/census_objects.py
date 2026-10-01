"""Decode initial Mercenary III resident identities and residence metadata.

The MIII readers establish fields, independently of world.py's historical names:
Body byte $681C (+4*slot); association $681D; floor $681E; cell $681F.
$53C7C..$53C90 matches cell/group/floor/association to structure occupants.
$53C2E..$53C44 matches the Body and zero association for the fixed drawn list.
$4E1DA..$4E1DE indexes eight-character Body names with twice the Body offset.
$55418..$55432 sets carried bit 7, clears residence, and names VOID ($78).
$53CC4..$53D30 gives carried items dummy positions in group 49: those positions
are storage, not world placement. $5A09C..$5A0D2 refuses Body 0/$78 as destinations.

Slots 247..255 are cell-bound ground-template working slots (R3's independently
verified $2ECA6..$2ECB8 model-table range); this census retains the preceding
246 slots, including reserved, nameless and initially unplaced ones. It does
not claim a nameless/reserved slot is a visible collectible.

Only decoded facts leave RAM. No original instructions are reproduced here.
"""

from __future__ import annotations

from .geometry import MODEL_TABLE_POINTER, model_name, model_record
from .ram import Ram, hexaddr
from .world import resident

BODY_NAMES = 0x796A
OBJECT_SLOTS = range(1, 247)
TEMPLATE_WORKING_SLOTS = range(247, 256)
CARRIED_COUNT = 0x563C
CARRIED_ITEMS = 0x563E


def body_name(ram: Ram, offset: int) -> str:
    """The panel indexes its eight-character names by the Body's byte offset."""
    if offset % 4 or not 0 <= offset <= 120:
        raise ValueError(f'invalid Body offset {offset}')
    return ram.bytes(BODY_NAMES + 2 * offset, BODY_NAMES + 2 * offset + 8).decode('ascii').strip()


def extract_objects(opening: Ram) -> dict:
    """All initial slots, with explicit absent residence and undecoded names."""
    count = opening.word(CARRIED_COUNT)
    if count > 246:
        raise ValueError(f'invalid Carried Stack length {count}')
    carried = list(opening.bytes(CARRIED_ITEMS, CARRIED_ITEMS + count))
    if len(set(carried)) != count or not set(carried).issubset(OBJECT_SLOTS):
        raise ValueError('invalid Carried Stack identities')
    objects = []
    model_table = opening.long(MODEL_TABLE_POINTER)
    for slot in OBJECT_SLOTS:
        raw = resident(opening, slot)
        body, floor = raw['kind'], raw['body']
        held = bool(raw['state'] & 0x80)
        if held != (slot in carried):
            raise ValueError(f'slot {slot}: held bit and Carried Stack disagree')
        residence = ('carried' if held else 'out-of-world' if body in (0, 120)
                     else 'structure' if raw['association'] else 'surface')
        record = model_record(opening, slot)
        name = model_name(opening, slot)
        no_model = opening.word(model_table + 2 * slot) == opening.word(model_table)
        a = 4 * slot
        objects.append({
            'slot': slot, 'name': name, 'modelRecord': hexaddr(record),
            'hasModel': not no_model, 'residence': residence,
            'bodyOffset': body, 'bodyName': body_name(opening, body),
            'group': raw['group'], 'association': raw['association'],
            'floor': floor, 'cell': raw['cell'],
            'cellCoordinates': [raw['cell'] & 15, raw['cell'] >> 4],
            'position': raw['position'], 'yaw': raw['yaw'],
            'state': raw['state'], 'zone': raw['zone'],
            'provenance': [opening.slice(base + a, base + a + 4)
                           for base in (0x581C, 0x5C1C, 0x601C, 0x641C, 0x681C, 0x6C1C)]
                          + [opening.slice(model_table + 2 * slot, model_table + 2 * slot + 2)]
                          + ([opening.slice(record - 16, record)] if name is not None else []),
        })
    return {
        'openingRamSha256': opening.sha256,
        'objects': objects, 'carriedStack': carried,
        'templateWorkingSlots': list(TEMPLATE_WORKING_SLOTS),
        'provenance': {
            'bodyNames': opening.slice(BODY_NAMES, BODY_NAMES + 31 * 8),
            'carriedStack': opening.slice(CARRIED_COUNT, CARRIED_ITEMS + count),
            'bodyNamesReader': opening.slice(0x4E1AE, 0x4E1FC),
            'surfaceResidenceReader': opening.slice(0x53C2A, 0x53C5E),
            'structureResidenceReader': opening.slice(0x53C5E, 0x53CC4),
            'carriedStorageReader': opening.slice(0x53CC4, 0x53D32),
            'pickupResidenceWriter': opening.slice(0x55418, 0x55438),
            'objectDestinationReader': opening.slice(0x5A09A, 0x5A0F0),
        },
    }
