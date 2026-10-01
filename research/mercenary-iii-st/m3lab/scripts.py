"""Decode Mercenary III's narrative scripts for the two opening taxi journeys.

Facts from Mercenary III's own interpreter (issue #647):

* `$52860` runs once per main-loop frame. It returns at once while the message
  bar is busy (`$723A` nonzero). It continues a multi-part message while
  `$7230` is nonzero (`$55A7E`), and starts a queued script `$711C` (`$55A0E`).
  Otherwise it fetches one byte at the program counter `$6EDA`.
* The low six bits are the opcode. Opcodes above `$2B` take the end handler.
  The rest dispatch through the word table at `$5289E` (44 entries, each
  relative to `$5289E`).
* Conditional opcodes end with a word target, relative to `$6FD44`. The
  condition is evaluated, and then `$52B96`/`$52B9A` apply the opcode byte's
  top bits. The branch is taken when condition XOR bit 7 holds. Bit 6 makes a
  taken branch a call instead of a jump. Otherwise the target word is skipped.
* Call (`$52B54`) pushes the return address on a stack of longs, which grows
  down from `$56D6`. The long at `$56D6` is itself the stack pointer, and
  `$56D8` is its low word. Return (`$52B66`) pops.
* Starting a script n (`$55A1A`) needs availability byte `$7352+n` to be
  negative. If a script is already active (flag 6), a script with
  availability bit 5 set is queued in `$711C`. Otherwise bit 7 is cleared
  unless bit 6 is set. The current PC is pushed, PC becomes `$6FD44` + word
  `$6FDC4+2n`, and flag 6 is set.
* Flags are bits of the long `$7270`, or of `$7274` for n >= 32
  (`$52CCA`/`$52D18`/`$52D32`).

Only opcodes whose handlers were read are tabled here. An opcode met in a
script that has no entry is reported in `unknown_opcodes` and stops that
routine's decode.
"""

from __future__ import annotations

from .ram import Ram, hexaddr
from .text import TABLES, describe, static_strings

BASE = 0x6FD44              # offsets in scripts are relative to this ($52B7C)
ENTRY_TABLE = 0x6FDC4       # script n entry offset at +2n ($55A52)
AVAILABILITY = 0x7352
IDLE = 0x6FF54              # the end handler's PC ($528F6)
SCRIPTS = {0x19: 'opening (prison)', 0x33: 'trip prison to spaceport', 0x34: 'trip prison to solicitor'}

# Pinned slices: documented in the content/presentation and taxi-journey
# reports. The handler block `$528F6..$53002` is pinned in its two stable
# parts, as in m3lab.text.
PINS = [
    (0x52860, 0x528F6, '6da13a9efa19ed8b3d1ed9dfe7f153c8657de7949e2961b212d3de32747137e5', 'fetch and dispatch'),
    (0x6FF57, 0x7014B, '932993c9afa69800f23f001efbb7a76c70f4e361b65c0d7b599129e720250165', 'opening script $19'),
    (0x701E0, 0x7040D, 'a69dd0c3c32ea2803214fe15e4b8d8b6c5fe164fbee0c19e67614eb2707b51f5', 'trip scripts $33/$34'),
    (0x766BF, 0x76721, 'f8f3910c3f570f74030c6da3cf6fd44ab472139e41535c89b4601e7e457a0086', 'shared waits and epilogues'),
    (0x55A0E, 0x55B9E, '1e2943d03ce0c8a95b15fe97aa8f7b46ee3b72d1995f18184c809004b1de584a', 'script start and ID-message helpers'),
    (0x52EF2, 0x52F14, '5c94b152991064df9993b8159d6759d89f8423a52ea424f8c5ca58bb2cdd6b04', 'op $20'),
]
# The idle loop sits between the documented table slice and the opening
# script. Its hash was taken from the same capture as the other derived pins.
IDLE_PIN = (0x6FF54, 0x6FF57, 'ffb8474eaa9f59f3bd6c948bcb15dbe90328882459e0e8d9a8dc1517bdf80a96')

# Operand layouts. 'b' byte, 'w' word, 'o' word offset from $6FD44,
# 'B6' six BCD bytes, 'L' long, 'T' conditional target (an offset word).
# 'packed' and 'asciiz' are inline texts.
OPCODES: dict[int, dict] = {
    0x00: dict(name='end', layout='', handler=0x528F6,
               meaning='PC = $6FF54 (idle loop), clear flag 6, empty the stack'),
    0x01: dict(name='ascii_text', layout='asciiz', handler=0x52B22,
               meaning='message from inline zero-terminated ASCII (not centred); hold = word $6FF46; request bar'),
    0x02: dict(name='reset_wait', layout='', handler=0x52B40, meaning='wait counter $7236 = 0'),
    0x03: dict(name='jump', layout='o', handler=0x52B4C, meaning='PC = $6FD44 + offset'),
    0x04: dict(name='call', layout='o', handler=0x52B54, meaning='push return PC; PC = $6FD44 + offset'),
    0x05: dict(name='return', layout='', handler=0x52B66, meaning='pop PC'),
    0x06: dict(name='if_cell', layout='bbT', handler=0x52B84,
               meaning='condition: bytes $70C3 == x and $70CB == z'),
    0x07: dict(name='if_wait_below', layout='wT', handler=0x52BB0,
               meaning='condition: wait counter $7236 < N (unsigned)'),
    0x08: dict(name='end', layout='', handler=0x528F6, meaning='as $00'),
    0x09: dict(name='end', layout='', handler=0x528F6, meaning='as $00'),
    0x0A: dict(name='if_random_below', layout='bT', handler=0x52BD2,
               meaning='condition: low byte of the next random word < operand; the word at ($75A6) is rotated right one bit and $75A6 advances within $DC00..$DFFE'),
    0x0B: dict(name='if_key', layout='bT', handler=0x52C0E,
               meaning='condition: byte $71FB == operand; a match also clicks ($55B6A)'),
    0x0C: dict(name='if_object_held', layout='bT', handler=0x52C20,
               meaning='condition: bit 7 of object state byte $641E+4*o'),
    0x0D: dict(name='set_account', layout='bB6', handler=0x52C3A,
               meaning='six bytes to account $6B1E+8*n'),
    0x0E: dict(name='add_account', layout='bB6', handler=0x52C80,
               meaning='account $6B1E+8*n += six BCD bytes (n = $F8 is cash $72DE, and also clicks)'),
    0x0F: dict(name='set_variable', layout='bw', handler=0x52CB0, meaning='word $70DE+2*n = value'),
    0x10: dict(name='set_flag', layout='b', handler=0x52CCA,
               meaning='set flag n; for n < 6 also write $B47A to $7556+4n and $B33A to $7582+4n, and start script $10 once flags 0-5 are all set'),
    0x11: dict(name='clear_flag', layout='b', handler=0x52D18, meaning='clear flag n'),
    0x12: dict(name='if_flag', layout='bT', handler=0x52D32, meaning='condition: flag n set'),
    0x13: dict(name='if_72DC_zero', layout='T', handler=0x52D4C, meaning='condition: word $72DC == 0'),
    0x14: dict(name='id_message', layout='b', handler=0x52D58,
               meaning='message n from the ID table without its header (n >= $F0: message number from word $70DE+2n); hold = word $6FF46; request bar'),
    0x15: dict(name='add_accounts', layout='bbb', handler=0x52D98,
               meaning='account a = account b + account c (BCD; a = $F8 clicks)'),
    0x16: dict(name='adjust_6EAA', layout='b', handler=0x52DE8,
               meaning='$6EAA = BCD($6EAA + operand), at most $99 (no bit 7) or at least $01 (bit 7); $6EAB = BCD(100 - $6EAA)'),
    0x17: dict(name='if_below_6EAA', layout='bT', handler=0x52E1E, meaning='condition: operand < byte $6EAA'),
    0x18: dict(name='if_word_equal', layout='owT', handler=0x52E2C,
               meaning='condition: word at $6FD44 + (offset & ~1) == value'),
    0x19: dict(name='store2', layout='obb', handler=0x52E46,
               meaning='two bytes to $6FD44 + offset (script bank: $0202 hold $6FF46, $0206 cabin animation $6FF4A)'),
    0x1A: dict(name='end', layout='', handler=0x528F6, meaning='as $00'),
    0x1B: dict(name='random_message', layout='bb', handler=0x52E6A,
               meaning='message ((next random word & mask) + base) without its header; hold = word $6FF46'),
    0x1C: dict(name='set_71FA', layout='', handler=0x52EB4, meaning='word $71FA = $00FF'),
    0x1D: dict(name='halt', layout='', handler=0x52EC0,
               meaning='returns without advancing PC, so it repeats every frame', advances=False),
    0x1E: dict(name='self_copy', layout='', handler=0x52EC2,
               meaning='copies word $70DE+2n onto itself, n = the next byte, which is not consumed (no effect)'),
    0x1F: dict(name='if_72D8_is_71F4', layout='T', handler=0x52EE2,
               meaning='condition: low byte of word $72D8 == byte $71F4'),
    0x20: dict(name='object_bit', layout='bb', handler=0x52EF2,
               meaning='operand b negative: set bit (b & 7) of $641E+4*o; otherwise clear it'),
    0x21: dict(name='if_object_bit', layout='bT', handler=0x52F14,
               meaning='condition: bit (n & 7) of $641E+4*[word $72DA]'),
    0x22: dict(name='if_7125', layout='bT', handler=0x52F30,
               meaning='condition: operand == word at odd address $7125 (a 68000 address error if reached)'),
    0x23: dict(name='if_account_at_least', layout='bLwT', handler=0x52C5A,
               meaning='condition: 48-bit account $6B1E+8*n >= long:word operand'),
    0x24: dict(name='set_availability', layout='bb', handler=0x52E56, meaning='byte $7352+n = value'),
    0x25: dict(name='packed_text', layout='packed', handler=0x52AC0,
               meaning='decode packed text ($52AC4), centred; hold = word $6FF46; request bar'),
    0x26: dict(name='timed_script', layout='ww', handler=0x52F54,
               meaning='word $727E = countdown, word $7280 = script'),
    0x27: dict(name='model_swap_a', layout='', handler=0x52F6A,
               meaning='model table [$4BD10]: +$C2 = +$278, +$1B4 = +$27A; clear bit 4 of $679E and $65A2; $6E84 = $FFFF'),
    0x28: dict(name='model_swap_b', layout='', handler=0x52FC8,
               meaning='model table [$4BD10]: +$C2 = +$278, +$1B4 = +$0'),
    0x29: dict(name='if_6B84', layout='T', handler=0x52FE0, meaning='condition: long $6B84 == $44010032'),
    0x2A: dict(name='set_6FF48', layout='b', handler=0x52FF2, meaning='word $6FF48 = $FF00 | operand'),
    0x2B: dict(name='if_taxi_passenger', layout='T', handler=0x52F3E,
               meaning='condition: bit 6 of $6EB3 set and word $6CBC negative'),
}
SIZES = {'b': 1, 'w': 2, 'o': 2, 'B6': 6, 'L': 4, 'T': 2}


def _tokens(layout: str) -> list[str]:
    out, i = [], 0
    while i < len(layout):
        if layout.startswith('B6', i):
            out.append('B6')
            i += 2
        else:
            out.append(layout[i])
            i += 1
    return out


def decode_instruction(ram: Ram, address: int, statics: dict) -> dict:
    byte = ram.byte(address)
    op = byte & 0x3F                                   # $52882
    spec = OPCODES.get(op)
    item = {'address': hexaddr(address), 'byte': f'${byte:02X}', 'op': f'${op:02X}'}
    if spec is None or (op > 0x2B):
        item['unknown'] = True
        item['source'] = ram.slice(address, address + 1)
        item['end'] = address + 1
        return item
    item['name'] = spec['name']
    a = address + 1
    if spec['layout'] == 'packed':
        text = describe(ram, a, statics)
        item['text'] = text
        a = int(text['source']['range'][1][1:], 16)
    elif spec['layout'] == 'asciiz':
        end = ram.data.index(0, a)
        item['ascii'] = ram.bytes(a, end).decode('ascii')
        a = end + 1
    else:
        operands = []
        for token in _tokens(spec['layout']):
            size = SIZES[token]
            if token == 'b':
                operands.append(f'${ram.byte(a):02X}')
            elif token == 'w':
                operands.append(f'${ram.word(a):04X}')
            elif token == 'L':
                operands.append(f'${ram.long(a):08X}')
            elif token == 'B6':
                operands.append(ram.bytes(a, a + 6).hex().upper())
            elif token == 'o':
                operands.append({'offset': f'${ram.word(a):04X}', 'address': hexaddr(BASE + ram.word(a))})
            elif token == 'T':
                item['target'] = hexaddr(BASE + ram.word(a))
            a += size
        if operands:
            item['operands'] = operands
        if 'T' in spec['layout']:
            # $52B96/$52B9A
            item['branch'] = {'invert': bool(byte & 0x80), 'call': bool(byte & 0x40)}
    item['source'] = ram.slice(address, a)
    item['end'] = a
    _annotate(item, ram)
    return item


def _annotate(item: dict, ram: Ram) -> None:
    """Plain-language notes for the forms the bounded scripts use."""
    name = item.get('name')
    if name == 'store2':
        dest = int(item['operands'][0]['address'][1:], 16)
        value = int(item['operands'][1][1:] + item['operands'][2][1:], 16)
        item['value'] = f'${value:04X}'
        if dest == 0x6FF46:
            item['note'] = f'message hold = {value} VBL'
        elif dest == 0x6FF4A:
            item['note'] = f'cabin animation sequence at {hexaddr(BASE + value)}'
    elif name == 'if_wait_below':
        n = int(item['operands'][0][1:], 16)
        if item['target'] == item['address'] and not item['branch']['invert'] and not item['branch']['call']:
            item['note'] = f'wait until counter >= {n} VBL'
    elif name == 'object_bit':
        o = int(item['operands'][0][1:], 16)
        b = int(item['operands'][1][1:], 16)
        item['note'] = f'{"set" if b & 0x80 else "clear"} bit {b & 7} of ${0x641E + 4 * o:04X}'
    elif name == 'id_message':
        item['message_id'] = int(item['operands'][0][1:], 16)


def decode_range(ram: Ram, lo: int, hi: int, statics: dict) -> dict:
    """Linear decode of one script region; boundaries must land on `hi`."""
    instructions, unknown = [], []
    a = lo
    while a < hi:
        ins = decode_instruction(ram, a, statics)
        a = ins.pop('end')
        instructions.append(ins)
        if ins.get('unknown'):
            unknown.append(ins['address'])
            break
        if OPCODES[int(ins['op'][1:], 16)].get('advances') is False:
            break
    return {'range': [hexaddr(lo), hexaddr(hi)], 'aligned': a == hi,
            'instructions': instructions, 'unknown_opcodes': unknown}


def _targets(routine: dict) -> set[int]:
    out = set()
    for ins in routine['instructions']:
        if 'target' in ins:
            out.add(int(ins['target'][1:], 16))
        if ins.get('name') in ('jump', 'call'):
            out.add(int(ins['operands'][0]['address'][1:], 16))
    return out


def _summarise(routine: dict) -> dict:
    texts, calls, cabin = [], [], []
    for ins in routine['instructions']:
        if ins.get('name') == 'packed_text':
            texts.append(ins['text']['text'])
        elif ins.get('name') == 'call':
            calls.append(ins['operands'][0]['address'])
        elif ins.get('name') == 'store2' and ins['operands'][0]['address'] == '$6FF4A':
            cabin.append(ins['value'])
    return {'texts': texts, 'calls': calls, 'cabin_animation': cabin}


def extract_scripts(ram: Ram) -> dict:
    sources = [ram.require(lo, hi, sha, role) for lo, hi, sha, role in PINS]
    sources.append(ram.require(*IDLE_PIN, 'idle loop'))
    sources.append(ram.require(*TABLES, 'message and script offset tables'))
    statics = static_strings(ram)

    entries = []
    for n, role in SCRIPTS.items():
        slot = ENTRY_TABLE + 2 * n
        entries.append({
            'script': f'${n:02X}', 'role': role,
            'slot': hexaddr(slot), 'offset': f'${ram.word(slot):04X}',
            'address': hexaddr(BASE + ram.word(slot)),
            'source': ram.slice(slot, slot + 2),
            'availability_captured': f'${ram.byte(AVAILABILITY + n):02X}',
        })

    regions = [
        ('opening script $19', 0x6FF57, 0x7014B),
        ('trip scripts $33 and $34', 0x701E0, 0x7040D),
        ('shared waits and epilogues', 0x766BF, 0x76721),
        ('idle loop', IDLE, IDLE + 3),
    ]
    routines = [dict(name=name, **decode_range(ram, lo, hi, statics)) for name, lo, hi in regions]

    # Every call, jump and branch target reached from these regions must be an
    # instruction boundary inside them.
    boundaries = {int(i['address'][1:], 16) for r in routines for i in r['instructions']}
    targets = set().union(*(_targets(r) for r in routines))
    entry_addresses = {int(e['address'][1:], 16) for e in entries}
    unresolved = sorted(t for t in targets | entry_addresses if t not in boundaries)

    # Split the trip region into its two scripts at $34's entry.
    by_script = {}
    trip = routines[1]['instructions']
    split = next(i for i, ins in enumerate(trip) if ins['address'] == '$703B5')
    by_script['$19'] = _summarise(routines[0])
    by_script['$33'] = _summarise({'instructions': trip[:split]})
    by_script['$34'] = _summarise({'instructions': trip[split:]})

    waits = {}
    for prev, ins in zip(routines[2]['instructions'], routines[2]['instructions'][1:]):
        if prev.get('name') == 'reset_wait' and ins.get('name') == 'if_wait_below':
            waits[prev['address']] = int(ins['operands'][0][1:], 16)

    blank_calls = {'$76710'}
    for key, summary in by_script.items():
        summary['wait_calls'] = [waits[c] for c in summary['calls'] if c in waits]
        summary['blank_calls'] = sum(1 for c in summary['calls'] if c in blank_calls)

    used = sorted({i['op'] for r in routines for i in r['instructions']})
    opcode_table = []
    for op, spec in sorted(OPCODES.items()):
        size = 1 + sum(SIZES[t] for t in _tokens(spec['layout'])) if spec['layout'] not in ('packed', 'asciiz') else None
        opcode_table.append({
            'op': f'${op:02X}', 'name': spec['name'], 'layout': spec['layout'] or '-',
            'length': size if size is not None else spec['layout'],
            'handler': hexaddr(spec['handler']), 'meaning': spec['meaning'],
            'used_by_bounded_scripts': f'${op:02X}' in used,
        })

    return {
        'title': 'Mercenary III',
        'ram_sha256': ram.sha256,
        'sources': sources,
        'machine': {
            'interpreter': '$52860', 'dispatch_table': '$5289E', 'opcode_mask': '$3F', 'max_opcode': '$2B',
            'pc': '$6EDA', 'stack': '$56D6 (long pointer; stack of longs grows down from $56D6)',
            'wait_counter': '$7236 (+1 per unpaused VBL, $5312C)', 'flags': '$7270 (n < 32), $7274 (n >= 32)',
            'availability': '$7352+n', 'entry_table': '$6FDC4+2n, offsets from $6FD44',
            'busy_gate': 'returns while $723A != 0', 'rate': 'one opcode per main-loop frame',
            'branch_rule': 'taken when condition XOR bit 7; bit 6 = call instead of jump; target word relative to $6FD44',
            'idle': '$6FF54 (jump to itself)',
        },
        'opcodes': opcode_table,
        'entries': entries,
        'routines': routines,
        'shared_waits': waits,
        'summary': by_script,
        'unresolved_targets': [hexaddr(t) for t in unresolved],
        'unknown_opcodes': [u for r in routines for u in r['unknown_opcodes']],
    }
