"""Decode the Mercenary III PSG programmes heard on the two opening taxi journeys.

Facts from Mercenary III's own sound driver (issue #647):

* The VBL handler calls the channel-B vector `$4BF54` and then the channel-C
  vector `$4BF58` (`$530FC`). Each vector holds the address of a routine. The
  idle routine is `$5317C` (`rts`). Channel A belongs to the message display
  machine `$53420`, which runs later in the same VBL.
* A programme's entry routine writes its fixed registers, initialises its
  stream state and points the vector at its per-VBL routine. Then it falls
  through into that routine, so the first stream step happens on the trigger
  VBL.
* A stream is a list of (count, value) pairs. The state is a count followed by
  a pointer. Each VBL the per-VBL routine decrements the count. When it reaches
  0, the walker fetches the next pair:
  - byte streams: `$4CB6C`; count byte at s, pointer long at s+1, value
    sign-extended
  - word streams: `$4CB54`; count word at s, pointer long at s+2
  A count of 0 ends the stream. A negative count means a long loop target
  follows (in byte streams, at the next even address). So a value holds for
  `count` VBLs, and the initial count of 1 makes the first fetch immediate.
* PSG writes go through `$FF8800` (select) and `$FF8802` (data). The mixer is
  written from, and saved back to, the shadow byte `$72A0`.
* Tone frequency is 125,000 / P Hz (2 MHz / 16).

Where the behaviour is a rule rather than data (engine slew, message tone,
ambient level), the rule's constants and conditions are given as facts.
"""

from __future__ import annotations

from .ram import Ram, hexaddr

# Report slices (content/presentation, "Inspected slices").
PINS = [
    (0x4BF5C, 0x4C480, 'e1c3ddeab11322708bfc79338536acc157a504b607a923948ad7c2421ec31217', 'sound bank before the slew word'),
    (0x4C482, 0x4CB8E, '8937613ec1cc53f6952d83bd0bf23bba29b83436bcedcd3fe4f25a1966ca4d8f', 'sound bank after the slew word'),
    (0x530FC, 0x5310C, '42b0b5b4daa26e2739cc52c76d34ced33c2a5cb3c626544e743b818721f7da32', 'sound dispatch in VBL'),
    (0x55B6A, 0x55B9E, '7488585d7be37c014a195105e073ab3cc36d25ccd0fafc857dbde7ea89e2ee37', 'key click trigger'),
    (0x56E14, 0x56ED0, '34ba4985025e46d428c895e0be009ca55b31cb3e0b2974b1caa0f9df72f02de6', 'cell-crossing cut'),
    (0x533DE, 0x536DA, 'c2cf590d1240f62da220341cc75df4ae1be461065b8472253be8266a285b066e', 'message display machine'),
    (0x5B9C4, 0x5BA24, 'e86d13b42525cec09e0177968172695e6504c6a50b5f9262796ede3b5208a857', 'door edge detector'),
    (0x51E24, 0x51F02, '9e645445261a19b119ade3841621778e5198c94037c0a7c439759a966600b24c', 'height and dwell (arms lift-off/set-down)'),
]
# Reset routine and its register table. Not in the reports' ledger; the hash
# was taken from the loaded-play captures, where it never changes.
RESET_PIN = (0x50E6A, 0x50EAB, 'bcfe3fee1fae6ebe1d616bf3c5169de2ab2d744d2e370de4451aad12968b84ec')

TONE_CLOCK = 125_000
SLEW = 0x4C480


def _hz(period: int) -> float | None:
    return round(TONE_CLOCK / period, 2) if period else None


def walk(ram: Ram, start: int, kind: str) -> dict:
    """Follow one stream from `start` until it ends or loops ($4CB6C/$4CB54)."""
    pairs, seen = [], {}
    a = start
    while True:
        if a in seen:
            return {'pairs': pairs, 'loop_to_index': seen[a], 'end': None}
        seen[a] = len(pairs)
        if kind == 'byte':
            count = ram.sbyte(a)
            if count == 0:
                return {'pairs': pairs, 'loop_to_index': None, 'end': hexaddr(a), 'stop': a + 1}
            if count < 0:
                a = ram.long((a + 2) & ~1)                    # $4CB76..$4CB80
                continue
            pairs.append([count, ram.sbyte(a + 1)])
            a += 2
        else:
            count = ram.sword(a)
            if count == 0:
                return {'pairs': pairs, 'loop_to_index': None, 'end': hexaddr(a), 'stop': a + 2}
            if count < 0:
                a = ram.long(a + 2)                           # $4CB60
                continue
            pairs.append([count, ram.word(a + 2)])
            a += 4


def stream(ram: Ram, start: int, kind: str, registers: str, state: int, hi: int) -> dict:
    walked = walk(ram, start, kind)
    item = {
        'kind': kind,
        'registers': registers,
        'state': hexaddr(state),
        'start': hexaddr(start),
        'pairs': walked['pairs'],
        'source': ram.slice(start, hi),
    }
    if walked['loop_to_index'] is not None:
        item['loops_to_pair'] = walked['loop_to_index']
    else:
        item['ends_at'] = walked['end']
        item['vbl'] = sum(c for c, _ in walked['pairs'])
    if kind == 'word':
        item['hz'] = [_hz(v) for _, v in walked['pairs']]
    return item


def engine_rule(ram: Ram) -> dict:
    """The slewed tone shared by lift-off, engine and leave ($4C682..$4C6E8)."""
    targets = []
    for nibble in range(8):
        target = ((nibble ^ 7) + 4) << 8
        period = (target >> 1) + 0x100
        targets.append({'control_low3': nibble, 'target': f'${target:04X}',
                        'period': period, 'hz': _hz(period), 'noise_period': period >> 8})
    return {
        'address': '$4C682',
        'rule': [
            'target = (((word $6EAE & 7) ^ 7) + 4) << 8',
            'slew word $4C480 moves 8 toward target each VBL (signed compare; equal: unchanged)',
            'tone C period P = (slew >> 1) + $100: R4 = P & $FF, R5 = P >> 8',
            'noise period R6 = P >> 8',
        ],
        'targets': targets,
        'slew_captured': f'${ram.word(SLEW):04X}',
        'slew_source': ram.slice(SLEW, SLEW + 2),
        'source': ram.slice(0x4C682, 0x4C6E8),
    }


def extract_sound(ram: Ram) -> dict:
    sources = [ram.require(lo, hi, sha, role) for lo, hi, sha, role in PINS]
    sources.append(ram.require(*RESET_PIN, 'reset and register table'))

    reset_table = list(ram.bytes(0x50E9E, 0x50EAB))
    programmes = [
        {
            'name': 'key_click', 'channel': 'B', 'entry': '$4C986', 'per_vbl': None,
            'trigger': '$55B6A: if word $70A2 == 0, priority $7110 = 3 and vector B = $4C986; '
                       'if also word $72A8 == 0, R10 (level C) = 0',
            'setup': {
                'priority_7110': 0x0F,
                'registers': {'R11': 0x00, 'R12': 0x1F, 'R2': 0x60, 'R3': 0x00, 'R9': 0x1F, 'R13': 0x09},
                'mixer': 'shadow & $FD | $10 (tone B on, noise B off)',
                'tone_b_period': 0x60, 'tone_b_hz': _hz(0x60),
                'envelope_period': 0x1F00, 'envelope_shape': 9,
            },
            'streams': [],
            'after': 'vector B = $5317C (one shot)',
            'source': ram.slice(0x4C986, 0x4CA40),
        },
        {
            'name': 'door_moving', 'channel': 'C', 'entry': '$4C7AA', 'per_vbl': '$4C81A',
            'trigger': 'rising edge of door flag $5B9C0 ($5B9C4)',
            'setup': {
                'registers': {'R4': 0x00, 'R5': 0x04, 'R10': 0x0F},
                'mixer': 'shadow & $DB (tone C and noise C on)',
                'per_vbl_registers': {'R6': 0x00},
            },
            'streams': [
                stream(ram, 0x4C86C, 'word', 'R4/R5 tone C period', 0x4BF1E, 0x4C87A),
                stream(ram, 0x4C87A, 'byte', 'R10 level C', 0x4BF24 + 1, 0x4C896),
            ],
            'after': 'level stream loops; runs until another programme replaces vector C',
            'source': ram.slice(0x4C7AA, 0x4C86C),
        },
        {
            'name': 'door_stop', 'channel': 'C', 'entry': '$4C6E8', 'per_vbl': '$4C758',
            'trigger': 'falling edge of door flag $5B9C0 ($5B9C4)',
            'setup': {
                'registers': {'R4': 0x00, 'R5': 0x04, 'R6': 0x1F},
                'mixer': 'shadow & $DF | $04 (noise C on, tone C off)',
            },
            'streams': [
                stream(ram, 0x4C86C, 'word', 'R4/R5 tone C period (tone muted)', 0x4BF1E, 0x4C87A),
                stream(ram, 0x4C896, 'byte', 'R10 level C', 0x4BF24 + 1, 0x4C89E),
            ],
            'after': 'level stream end: vector C = $4C1C8 (ambient)',
            'source': ram.slice(0x4C6E8, 0x4C7AA),
        },
        {
            'name': 'taxi_set_down', 'channel': 'C', 'entry': '$4C5A8', 'per_vbl': '$4C5EA',
            'trigger': 'first descent step, $51E84 (priority $7110 = 3)',
            'setup': {'registers': {'R6': 0x07}, 'mixer': 'shadow & $DF | $04 (noise C on, tone C off)'},
            'streams': [stream(ram, 0x4C638, 'byte', 'R10 level C', 0x4BF2B, 0x4C66C)],
            'after': 'stop ($4C606): vector C = $5317C, mixer shadow | $24, R10 = 0',
            'source': ram.slice(0x4C5A8, 0x4C638),
        },
        {
            'name': 'lift_off', 'channel': 'C', 'entry': '$4C516', 'per_vbl': '$4C560',
            'trigger': 'first lift-off step, $51E3E (priority $7110 = 3)',
            'setup': {'registers': {'R6': 0x07}, 'mixer': 'shadow & $DB (tone C and noise C on)',
                      'slew_4C480': 0x0E00},
            'streams': [stream(ram, 0x4C582, 'byte', 'R10 level C', 0x4BF2B, 0x4C5A8)],
            'per_vbl_rule': 'after the level step, the engine rule ($4C682) sets tone and noise',
            'after': 'level stream end ($4C66C): vector C = $4C676 (engine)',
            'source': ram.slice(0x4C516, 0x4C582),
        },
        {
            'name': 'engine', 'channel': 'C', 'entry': '$4C676', 'per_vbl': '$4C676',
            'trigger': 'installed by the end of lift-off ($4C66C)',
            'setup': {'per_vbl_registers': {'R10': 0x0A}},
            'streams': [],
            'per_vbl_rule': 'R10 = 10, then the engine rule ($4C682)',
            'after': 'runs until another programme replaces vector C (the cut leaves it in place)',
            'source': ram.slice(0x4C66C, 0x4C682),
        },
        {
            'name': 'leave', 'channel': 'C', 'entry': '$4C484', 'per_vbl': '$4C4CE',
            'trigger': 'successful L, $55766',
            'setup': {'registers': {'R6': 0x07}, 'mixer': 'shadow & $DB (tone C and noise C on)',
                      'slew_4C480': 0x0E00},
            'streams': [stream(ram, 0x4C4F0, 'byte', 'R10 level C', 0x4BF2B, 0x4C516)],
            'per_vbl_rule': 'after the level step, the engine rule ($4C682) sets tone and noise',
            'after': 'stop ($4C606): vector C = $5317C, mixer shadow | $24, R10 = 0',
            'source': ram.slice(0x4C484, 0x4C4F0),
        },
        {
            'name': 'message_tone', 'channel': 'A', 'entry': '$53420', 'per_vbl': '$53420',
            'trigger': 'every message request ($723A = 1)',
            'rule': [
                'request VBL: counter $7286 = 0, $723A = $FFFF (running)',
                'each later VBL: $7286 += 1, then in order:',
                '  $7286 == hold word $533D6: next character nonzero -> start another scroll segment; else idle ($723A = 0, R8 = 0)',
                '  $7286 == 37: scroll-in complete ($53650)',
                '  $7286 > 37: R8 = 0',
                '  otherwise (1..36): take the next character from $7232 ($53366, one per VBL); '
                'P = character * word $533DC; R0 = P & $FF, R1 = P >> 8; R8 = 12, or 0 for a space',
                'at the terminator the character is a space and the pointer holds; if $533DA is set, the hold becomes 50',
                'characters >= $61 render live digits instead ($5337A); not reached by these texts',
            ],
            'constants': {
                'multiplier_533DC': ram.word(0x533DC), 'level': 12, 'scroll_vbl': 37,
                'id_hold_533D8_captured': ram.word(0x533D8),
                'source': ram.slice(0x533DC, 0x533DE),
            },
            'streams': [],
            'source': ram.slice(0x53366, 0x533D0),
        },
        {
            'name': 'cut', 'channel': 'B,C', 'entry': '$56E86', 'per_vbl': None,
            'trigger': 'each cell crossing aboard ($56E14, from $55EC4)',
            'setup': {'registers': {'R9': 0x00, 'R10': 0x00, 'R6': 0x1F},
                      'mixer': 'R7 = shadow $72A0 (rewritten unchanged)',
                      'note': 'vectors are not changed, so a running programme rewrites its level on its next step'},
            'streams': [],
            'source': ram.slice(0x56E86, 0x56ED0),
        },
        {
            'name': 'reset', 'channel': 'all', 'entry': '$50E6A', 'per_vbl': None,
            'trigger': 'game start',
            'setup': {
                'vectors': {'B': '$5317C', 'C': '$5317C'},
                'registers': {f'R{r}': v for r, v in enumerate(reset_table)},
                'mixer_shadow_72A0': reset_table[7],
            },
            'streams': [],
            'source': ram.slice(0x50E6A, 0x50EAB),
        },
        {
            'name': 'ambient', 'channel': 'C', 'entry': '$4C1C8', 'per_vbl': '$4C1F8',
            'trigger': 'end of door stop; also installed at $5555C',
            'setup': {'registers': {'R6': 0x1F}, 'mixer': 'shadow & $DB (tone C and noise C on)'},
            'rule': [
                'v = long $700A',
                'v >= 0: R10 = min(v >> 16, 15), $72A8 = $FFFF, R4 = $10, R5 = 0, R6 = $1F',
                'v < 0 and $72A8 != 0: R10 = 0, $72A8 = 0',
            ],
            'value_700A_captured': f'${ram.long(0x700A):08X}',
            'streams': [],
            'source': ram.slice(0x4C1C8, 0x4C25A),
        },
    ]
    vectors = {'B': f'${ram.long(0x4BF54):05X}', 'C': f'${ram.long(0x4BF58):05X}'}
    return {
        'title': 'Mercenary III',
        'ram_sha256': ram.sha256,
        'sources': sources,
        'driver': {
            'vbl_dispatch': '$530FC: jsr [$4BF54] (B), jsr [$4BF58] (C)',
            'idle': '$5317C', 'mixer_shadow': '$72A0', 'priority': '$7110',
            'byte_walker': '$4CB6C', 'word_walker': '$4CB54',
            'pair_rule': 'count then value; value holds count VBLs; 0 ends; negative count: loop to the long that follows',
            'tone_clock_hz': TONE_CLOCK,
            'vectors_captured': vectors,
        },
        'engine_rule': engine_rule(ram),
        'programmes': programmes,
    }
