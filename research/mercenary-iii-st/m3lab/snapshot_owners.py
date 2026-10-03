"""Read portable-owner research observations from a Mercenary III RAM capture.

The original readers own this field map: $51062..$510EA (pool integration),
$52030..$522BA (passive positions, increments and state), $518AC..$518F0
(pilot), $54F20..$54F96 (sign/faces), $5311E..$53164 (angles/phases),
$530FC..$5310C and $4CB54..$4CB8E (sound dispatch/walkers). This is a
research observer, not a Save codec, runtime model, or original-code export.
Every integer is raw unsigned big-endian; signed interpretation belongs to
its reader. The complete PSG register image is not recoverable from RAM.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .ram import Ram, hexaddr

OPENING_SHA256 = '71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170'
ACTOR_SLOTS = range(50, 64)
ACTOR_FIELDS = {
    'state': (0x5492, 2),
    'incrementX': (0x54CA, 4), 'incrementY': (0x5502, 4), 'incrementZ': (0x553A, 4),
    'x': (0x581C, 4), 'y': (0x5C1C, 4), 'z': (0x601C, 4),
    'flags': (0x641C, 1), 'group': (0x641D, 1), 'objectState': (0x641E, 1), 'zone': (0x641F, 1),
    'bodyOffset': (0x681C, 1), 'association': (0x681D, 1), 'floor': (0x681E, 1), 'cell': (0x681F, 1),
    'yaw': (0x6C1C, 1),
}
FIELDS = {
    'sky': {'substellarLongitude': (0x7052, 2), 'dayBits': (0x70E4, 2),
            'skyColour': (0x7324, 2), 'atmosphereDay': (0x7182, 2),
            'palettePointer': (0x70A4, 4), 'skyDayColour': (0x6FD6, 2),
            'skyNightColour': (0x6FD8, 2), 'bodyAtmosphere': (0x6FDD, 1),
            'landColour': (0x70B0, 2), 'skyHeight': (0x7298, 2), 'clipRows': (0x42C74, 2)},
    'clock': {'rate': (0x6F26, 2), 'period': (0x6F28, 2), 'fractionBits': (0x6F2A, 2),
              'seconds': (0x6FCE, 4), 'day': (0x6FD2, 2), 'rateExponent': (0x72B8, 2),
              'sourcePause': (0x70BC, 2)},
    'craft': {'landBits': (0x6F56, 2), 'occupancyWord': (0x713E, 2), 'selector': (0x7142, 2), 'parameterSlot': (0x7144, 2),
              'x': (0x7146, 4), 'y': (0x714A, 4), 'z': (0x714E, 4),
              'roll': (0x7152, 2), 'pitch': (0x7154, 2), 'yaw': (0x7156, 2),
              'turnRate': (0x7000, 4), 'pitchRate': (0x7004, 4), 'speed': (0x700A, 4),
              'throttle': (0x7248, 4), 'contact': (0x715E, 2), 'eyeHeight': (0x7260, 2),
              'support': (0x719A, 2), 'cosRoll': (0x7162, 4), 'sinRoll': (0x7166, 4),
              'cosPitch': (0x716A, 4), 'sinPitch': (0x716E, 4),
              'cosYaw': (0x7172, 4), 'sinYaw': (0x7176, 4), 'panelSpeed': (0x4E5B0, 4),
              'swing': (0x71A4, 2), 'altitudeMultiplier': (0x59006, 4),
              'priorX': (0x70D2, 4), 'priorY': (0x70D6, 4), 'priorZ': (0x70DA, 4),
              'landingLatch': (0x70B2, 2)},
    'space': {'x': (0x702A, 4), 'y': (0x702E, 4), 'z': (0x7032, 4),
              'drawListPointer': (0x6FAA, 4), 'nearestBody': (0x6FB6, 4), 'range': (0x6FAE, 4), 'arrivalRequest': (0x6FB2, 4),
              'arrivalHold': (0x71A2, 2), 'arrivalFlag': (0x70BE, 2)},
    'playback': {'active': (0x70A2, 2), 'nextActionPointer': (0x709A, 4),
                 'headerPointer': (0x709E, 4), 'heldControl': (0x7057, 1),
                 'armedResidentOffset': (0x5A8F0, 2), 'passenger': (0x6EB0, 4),
                 'descriptor': (0x6ECE, 2), 'price': (0x6EC6, 4)},
    'candidate': {'rangePrefix': (0x71D8, 2), 'range': (0x71DA, 4),
                  'residentOffset': (0x71DE, 4), 'eligibility': (0x71EF, 1),
                  'proximity': (0x71F6, 2), 'regionFlags': (0x71CC, 2)},
    'location': {'bodyOffset': (0x713C, 2), 'surfaceBody': (0x715A, 4),
                 'group': (0x6FDE, 2), 'cell': (0x71F4, 2), 'region': (0x7194, 2),
                 'regionIndex': (0x7196, 2), 'floor': (0x7138, 2),
                 'longitudeSample': (0x42C6C, 2), 'latitudeSample': (0x42C70, 2)},
    'taxi': {'loopControl': (0x6EAE, 2), 'movementCounter': (0x6EB6, 2),
             'destinationPointer': (0x6EB8, 4), 'destination': (0x6EBC, 2),
             'start': (0x6EBE, 2), 'call': (0x6EC0, 2), 'routeControl': (0x6E10, 1),
             'routePointer': (0x6C8C, 4), 'progress': (0x6CBC, 4),
             'incrementXZ': (0x6CF0, 4), 'headingPair': (0x6D20, 4),
             'heightPointer': (0x51CDA, 4)},
    'vm': {'pc': (0x6EDA, 4), 'queue': (0x711C, 2), 'wait': (0x7236, 2),
           'timerBits': (0x727E, 2), 'timedTargetOffset': (0x7280, 2),
           'flagsLow': (0x7270, 4), 'flagsHigh': (0x7274, 4)},
    'message': {'continuationBits': (0x7230, 2), 'scrollPointer': (0x7232, 4),
                'busy': (0x723A, 2), 'selectedGlyph': (0x723C, 1), 'mode': (0x723E, 2),
                'descriptionPointer': (0x722C, 4), 'age': (0x7286, 2),
                'pendingHold': (0x6FF46, 2), 'currentHold': (0x533D6, 2),
                'nextHold': (0x533D8, 2), 'scrollsOut': (0x533DA, 2),
                'column': (0x533D4, 2)},
    'panel': {'descriptor': (0x6F0E, 4), 'reveal': (0x53950, 2),
              'inventory': (0x6F2C, 2), 'temperature': (0x6F2E, 2), 'pressure': (0x6F30, 2)},
    'pilot': {'pendingSelector': (0x6FF4A, 2), 'countWord': (0x6EA2, 2),
              'profile': (0x6EA4, 2), 'nextDurationPointer': (0x6EA6, 4)},
    'animation': {'signOutput': (0xB3F2, 2), 'signIndex': (0xB3F4, 2),
                  'a1Output': (0xB4FA, 2), 'a1Base': (0xB4FC, 2), 'a1Alternate': (0xB51E, 2),
                  'a5Output': (0xB602, 2), 'a5Base': (0xB604, 2), 'a5Alternate': (0xB61C, 2),
                  'tickAngle': (0x6F36, 2), 'sampledAngle': (0x6F38, 2),
                  'angleRate': (0x6FD4, 2), 'wheelAngle': (0x6E96, 2)},
    'encounter': {'request': (0x6FF48, 2), 'timer': (0x6E86, 2),
                  'programmePointer': (0x6E88, 4), 'spawnBudget': (0x6E8C, 2)},
    'sound': {'bVector': (0x4BF54, 4), 'cVector': (0x4BF58, 4),
              'doorToneCount': (0x4BF1E, 2), 'doorTonePointer': (0x4BF20, 4),
              'doorLevelCount': (0x4BF25, 1), 'doorLevelPointer': (0x4BF26, 4),
              'cLevelCount': (0x4BF2B, 1), 'cLevelPointer': (0x4BF2C, 4),
              'collisionTonePointer': (0x7C8C, 4), 'priority': (0x7110, 2),
              'mixer': (0x72A0, 1), 'cLevelLatch': (0x72A8, 2),
              'slew': (0x4C480, 2), 'speedInput': (0x700A, 4)},
    'phase': {'logicalTick': (0x53094, 4), 'frameWord': (0x7180, 2),
              'inputMailbox': (0x56726, 1), 'liveStick': (0x7056, 1),
              'scriptKey0': (0x71F8, 1), 'scriptKey1': (0x71F9, 1),
              'scriptKey2': (0x71FA, 1), 'scriptKey3': (0x71FB, 1),
              'admissionCountdown': (0x6EB4, 2)},
    'view': {'eyeX': (0x7126, 4), 'eyeY': (0x712A, 4), 'eyeZ': (0x712E, 4),
             'roll': (0x7132, 2), 'pitch': (0x7134, 2), 'yaw': (0x7136, 2),
             'longitude': (0x70B4, 2), 'latitude': (0x70B8, 2), 'cabinOffset': (0x717A, 2),
             'relativeX': (0x70C2, 4), 'relativeY': (0x70C6, 4), 'relativeZ': (0x70CA, 4),
             'drawingHeight': (0x704A, 4), 'packedHeight': (0x704E, 4),
             'rollTangent': (0x700E, 4), 'rollCotangent': (0x7012, 4),
             'pitchTangent': (0x7016, 4)},
}
# Extra source ranges for future per-frame/tick observer instrumentation.
TRACE_RANGES = [
    (0x555A, 0x563A), (0x58E4, 0x591C), (0x5CE4, 0x5D1C), (0x60E4, 0x611C),
    (0x64E4, 0x651C), (0x68E4, 0x691C), (0x6CE4, 0x6D1C),
    (0x523A0, 0x523B4), (0x575A, 0x57DA), (0x4BF1E, 0x4BF30),
    (0x4BF54, 0x4BF5C), (0x4C480, 0x4C482), (0x7C8C, 0x7C90),
    (0x7110, 0x7112), (0x72A0, 0x72AA), (0x6F36, 0x6F3A), (0x6FD4, 0x6FD6),
    (0xB3F2, 0xB3F6), (0xB4FA, 0xB4FE), (0xB51E, 0xB520),
    (0xB602, 0xB606), (0xB61C, 0xB61E),
]


def read_value(ram: Ram, address: int, width: int) -> int:
    return {1: ram.byte, 2: ram.word, 4: ram.long}[width](address)


def trajectory_reference(slot: int, pointer: int) -> dict:
    """Name the next unread passive record, including the final loop marker.

    $5227C reads the marker at byte offset 32, follows its immutable loop
    target and consumes the first record. Restoring it as record zero early
    would erase a saved logical position even if the next writer converges.
    """
    if isinstance(slot, bool) or not isinstance(slot, int) or slot not in (56, 57, 58):
        raise ValueError('unsupported passive trajectory slot')
    if isinstance(pointer, bool) or not isinstance(pointer, int):
        raise ValueError('trajectory pointer must be an integer')
    path = slot - 56
    offset = pointer - (0x522BC, 0x522E2, 0x52308)[path]
    if offset not in (0, 8, 16, 24, 32):
        raise ValueError('trajectory pointer is not this slot\'s next record or loop marker')
    return {'slot': slot, 'path': path, 'nextRecord': offset // 8}


def observe(ram: Ram) -> dict:
    """Read complete bounded owner groups without advancing any writer."""
    result = {group: {name: read_value(ram, address, width) for name, (address, width) in fields.items()}
              for group, fields in FIELDS.items()}
    # Stack words are not flag-6-derived: Close clears that flag before return.
    # The research observer caps live returns at eight entries; this is
    # a bounded-slice admission limit, not an original hardware bounds check.
    pointer = ram.long(0x56D6)
    if not 0x56B6 <= pointer <= 0x56D6 or (0x56D6 - pointer) % 4:
        raise ValueError('invalid original return stack pointer')
    result['vm']['returnStack'] = [ram.long(a) for a in range(pointer, 0x56D6, 4)]
    result['vm']['availability'] = {str(i): ram.byte(0x7352 + i) for i in (5, 6, 19, 25, 41, 51, 52, 119)}
    result['cashBytes'] = list(ram.bytes(0x72DE, 0x72E4))
    count = ram.word(0x563C)
    if count > 246:
        raise ValueError('invalid original Carried Stack length')
    result['carriedStack'] = list(ram.bytes(0x563E, 0x563E + count))
    result['actors'] = [{'slot': slot, **{name: read_value(ram, base + 4 * slot, width)
                         for name, (base, width) in ACTOR_FIELDS.items()}}
                        for slot in ACTOR_SLOTS]
    # The list retains each next unread trajectory record independently. These
    # pointers change even though the immutable record lists do not.
    result['trajectories'] = [{'slot': ram.word(address) // 4, 'nextRecordPointer': ram.long(address + 2)}
                              for address in (0x523A0, 0x523A6, 0x523AC)]
    result['bodyPhases'] = [ram.long(0x575A + 4 * i) for i in range(32)]
    result['bodyRates'] = [ram.long(0x7AEA + 4 * i) for i in range(32)]
    result['encounter']['pairBytes'] = [ram.byte(a) for a in range(0x6E50, 0x6E86)]
    table = ram.long(0x4BD10)
    result['actorModelWords'] = [ram.word(table + 2 * slot) for slot in ACTOR_SLOTS]
    return result


def evidence(ram: Ram, opening: bool = False) -> dict:
    if opening and ram.sha256 != OPENING_SHA256:
        raise ValueError('New Game evidence requires the coherent pinned gameplay opening')
    ranges = set(TRACE_RANGES)
    for fields in FIELDS.values():
        ranges.update((a, a + n) for a, n in fields.values())
    for slot in ACTOR_SLOTS:
        ranges.update((base + 4 * slot, base + 4 * slot + n) for base, n in ACTOR_FIELDS.values())
    ranges.update([(0x6E50, 0x6E86), (0x7AEA, 0x7B6A), (0x56B6, 0x56DA),
                   (0x7352, 0x73D2), (0x72DE, 0x72E4), (0x563C, 0x563E + ram.word(0x563C))])
    table = ram.long(0x4BD10)
    ranges.add((table + 100, table + 128))
    return {'kind': 'mercenary-iii-tourcraft-snapshot-owner-observation', 'schemaVersion': 1,
            'ramSha256': ram.sha256, 'coherentNewGame': opening,
            'owners': observe(ram), 'sources': [ram.slice(a, b) for a, b in sorted(ranges)],
            'limits': ['Raw numeric research observations, not a portable Save Snapshot.',
                       'Complete PSG register image, hardware phase and pending event transport are absent from RAM.',
                       'Face selection tag and browser phase/candidate identities require the independent implementation writer.']}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ram', type=Path)
    parser.add_argument('--opening', action='store_true')
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    result = json.dumps(evidence(Ram.load(args.ram), args.opening), indent=2) + '\n'
    if args.out:
        args.out.write_text(result)
    else:
        print(result, end='')


if __name__ == '__main__':
    main()
