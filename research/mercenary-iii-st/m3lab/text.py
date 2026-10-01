"""Decode Mercenary III's packed message text and the 64 ID messages.

Every rule here was read from Mercenary III's own decoder and helpers
(issue #647); nothing is borrowed from the Damocles lab.

Packed text (decoder `$52AC4`, output buffer `$5292C`, 48 bytes):

* Three bytes carry four six-bit codes, most significant bits first.
* A code of 0 ends the text. That can happen at any of the four positions, so
  a text ends after one, two or three bytes of its last group.
* Any other code c is the character c + 31 (so 1 is a space and 63 is `^`).
* `[` (`$529AE`) inserts the two BCD digits of byte `$6EAA`, with a leading
  zero suppressed.
* `\\` (`$52A80`) inserts " THE".
* `]` (`$529CC`) inserts the ten-character player name at `$759A`, with
  leading and trailing spaces removed.
* `^` (`$52AA6`) marks the next character as a token digit (`$529F0`). `^4` to
  `^9` insert fixed words held at `$52A1C..$52A5B`. `^0` (`$529A6`) and `^1`,
  `^2`, `^3` insert live numbers.
* The token `^2` replaces the whole decoder register, so the bits the next
  code carries over from the previous byte are lost. This module reproduces
  that, and marks every text where it happens.
* After decoding, the start pointer `$7232` is moved back by half the shortfall
  from 48 characters, rounded up (`$52B0A`). Shorter texts are centred.

ID messages (`$55B2A`): the offset table at `$6FD44` has 64 words, each
relative to `$6FD44`. A record is a header byte and then packed text. A
nonzero header replaces the terminator with a space and appends spaces (half
the shortfall from 48, rounded up), so the text scrolls itself out of the
bar. Script op `$14` (`$52D58`) reads the same records but skips the header
and never pads.

Representation: each decoded text is given three ways.

* `raw`: the characters as decoded, with every marker character kept.
* `parts`: a list of `{"text": ...}` runs and `{"token": ...}` items. A static
  token carries its `expansion`; a live one carries `live`, which names its
  source.
* `text`: `raw` with the static tokens (`\\`, `^4`–`^9`) expanded and the
  live markers (`[`, `]`, `^0`–`^3`) left in place.
"""

from __future__ import annotations

from .ram import Ram, hexaddr

TABLE = 0x6FD44            # message/script offset base ($55B2E, $52D74)
ID_COUNT = 64
BUFFER = 0x5292C           # decoder output ($52AC4)
BAR_WIDTH = 48             # centring and padding width ($52B12, $55B4C)

# Pinned slices. `$76721..$76BCA` is the report's ID-text slice. The decoder
# lives in `$528F6..$53002`, which the report hashed whole (`7dde6a1e…`) at a
# moment when the 48-byte buffer `$5292C..$5295C` held a particular text. The
# buffer changes at run time, so the two stable sides are pinned instead.
# Their hashes were taken from a capture whose whole slice matches the
# documented hash. The same applies to `$6FD44..$6FF54` (`5e2060c3…`), whose
# tail holds the mutable script bank `$6FF46..$6FF4C`.
ID_TEXTS = (0x76721, 0x76BCA, '8d16c237144f8f98cef86f4cc5a0df5d0aa40724c5e9a9c3ba371ad7dc4cda32')
DECODER_HEAD = (0x528F6, 0x5292C, '5d6d8c63ad4bb627c9b79ed50a92d10be39f59e4e3070d0c6412faffaca60c39')
DECODER_TAIL = (0x5295C, 0x53002, '1b0eaa8b26a3f958abf43303811eb4c212a016ceb03e308685cfda30225e038b')
TABLES = (0x6FD44, 0x6FF46, '8f88c6edf79e5bdd36a20ba038fc43d55ea53a06860b0b912b3434bbe1becb8e')

# Fixed words for tokens ^4..^9 and `\`, located from the branch targets in
# `$529F0..$52A80`. Each is zero-terminated.
STATIC_STRINGS = {'^4': 0x52A1C, '^5': 0x52A29, '^6': 0x52A31, '^7': 0x52A3B,
                  '^8': 0x52A43, '^9': 0x52A4D, '\\': 0x52A56}
LIVE = {
    '[': 'BCD byte $6EAA, two digits, leading zero suppressed ($529AE)',
    ']': 'player name $759A, 10 characters, leading/trailing spaces trimmed ($529CC)',
    '^0': 'BCD byte $6EAB, two digits, leading zero suppressed ($529A6)',
    '^1': 'low nibble of byte $6E91, one digit ($5299E)',
    '^2': 'sum of the 26 bytes $6E50,$6E52,...,$6E82 (mod 256), in decimal ($52964, $52978)',
    '^3': 'low nibble of byte $6ECB, one digit ($52A8C)',
}


def _pin(ram: Ram, pin: tuple[int, int, str], role: str) -> dict:
    return ram.require(pin[0], pin[1], pin[2], role)


def _cstring(ram: Ram, address: int) -> tuple[str, int]:
    end = ram.data.index(0, address)
    return ram.bytes(address, end).decode('ascii'), end + 1


def static_strings(ram: Ram) -> dict:
    """The fixed token words, read from the decoder's own string block."""
    out = {}
    for token, address in STATIC_STRINGS.items():
        text, end = _cstring(ram, address)
        out[token] = {'expansion': text, 'source': ram.slice(address, end)}
    return out


def decode_packed(ram: Ram, address: int) -> dict:
    """Decode one packed text starting at `address`.

    Returns the raw characters, the half-open source range and flags. The
    character stream is produced in decoder order, with `^2`'s loss of carried
    bits applied, so the result is what `$52AC4` would put in its buffer
    before live values are inserted.
    """
    chars: list[str] = []
    pending_token = False      # $6E92
    carry_lost_after = []      # character indexes after which ^2 cleared carry
    a = address
    while True:
        b0, b1, b2 = ram.byte(a), ram.byte(a + 1), ram.byte(a + 2)
        carry0, carry1 = b0 & 3, b1 & 15
        codes_done = 0
        end = None
        for position in range(4):
            if position == 0:
                code = b0 >> 2
            elif position == 1:
                code = (carry0 << 4) | (b1 >> 4)
            elif position == 2:
                code = (carry1 << 2) | (b2 >> 6)
            else:
                code = b2 & 63
            if code == 0:
                end = a + (1, 2, 3, 3)[position]
                break
            ch = chr(code + 31)
            chars.append(ch)
            codes_done += 1
            # Character handling ($52AAE): `[`, `\`, `]`, `^` first, then a
            # pending token digit, then a literal.
            if ch >= '[':
                if ch == '^':
                    pending_token = True
            elif pending_token:
                pending_token = False
                if ch == '2':
                    # $52978 rebuilds d0 from scratch; the high bits that hold
                    # the next code's carry are zero afterwards.
                    if position == 0:
                        carry0 = 0
                    elif position == 1:
                        carry1 = 0
                    if position < 2:
                        carry_lost_after.append(len(chars) - 1)
        if end is not None:
            break
        a += 3
    return {
        'raw': ''.join(chars),
        'end': end,
        'dangling_token': pending_token,
        'carry_lost_after': carry_lost_after,
    }


def parts_of(raw: str, statics: dict) -> list[dict]:
    """Split raw characters into text runs and token items."""
    parts: list[dict] = []
    run = ''
    i = 0

    def flush():
        nonlocal run
        if run:
            parts.append({'text': run})
            run = ''

    while i < len(raw):
        ch = raw[i]
        if ch == '\\':
            flush()
            parts.append({'token': '\\', 'expansion': statics['\\']['expansion']})
        elif ch in '[]':
            flush()
            parts.append({'token': ch, 'live': LIVE[ch]})
        elif ch == '^' and i + 1 < len(raw):
            flush()
            digit = raw[i + 1]
            token = '^' + digit
            i += 1
            if token in statics:
                parts.append({'token': token, 'expansion': statics[token]['expansion']})
            elif token in LIVE:
                parts.append({'token': token, 'live': LIVE[token]})
            else:
                # $529F0: anything above '9' takes the ^9 branch, anything
                # below '0' the ^1 branch. Reported, not interpreted.
                parts.append({'token': token, 'unusual': True})
        elif ch == '^':
            flush()
            parts.append({'token': '^', 'dangling': True})
        else:
            run += ch
        i += 1
    flush()
    return parts


def static_text(parts: list[dict]) -> str:
    out = ''
    for part in parts:
        if 'text' in part:
            out += part['text']
        elif 'expansion' in part:
            out += part['expansion']
        else:
            out += part['token']
    return out


def is_static(parts: list[dict]) -> bool:
    return all('text' in p or 'expansion' in p for p in parts)


def describe(ram: Ram, address: int, statics: dict) -> dict:
    """A packed text as JSON-ready data, with its source range."""
    decoded = decode_packed(ram, address)
    parts = parts_of(decoded['raw'], statics)
    item = {
        'address': hexaddr(address),
        'raw': decoded['raw'],
        'parts': parts,
        'text': static_text(parts),
        'source': ram.slice(address, decoded['end']),
    }
    if is_static(parts):
        length = len(item['text'])
        # $52B0A: start pointer moves back by ceil((48 - length) / 2).
        item['length'] = length
        item['centre_pad'] = (BAR_WIDTH - length + 1) // 2 if length < BAR_WIDTH else 0
    if decoded['dangling_token']:
        item['dangling_token'] = True
    if decoded['carry_lost_after']:
        item['carry_lost_after'] = decoded['carry_lost_after']
    return item


def extract_messages(ram: Ram) -> dict:
    sources = [
        _pin(ram, ID_TEXTS, 'ID message texts'),
        _pin(ram, DECODER_HEAD, 'end handler, before the text buffer'),
        _pin(ram, DECODER_TAIL, 'decoder and token handlers, after the text buffer'),
        _pin(ram, TABLES, 'message and script offset tables'),
    ]
    statics = static_strings(ram)
    messages = []
    for n in range(ID_COUNT):
        slot = TABLE + 2 * n
        record = TABLE + ram.word(slot)            # $55B36
        header = ram.byte(record)                  # $55B3A
        item = describe(ram, record + 1, statics)  # $55B3C
        item.update({
            'id': n,
            'record': hexaddr(record),
            'header': header,
            'scrolls_out': header != 0,            # $55B42
            'table_entry': ram.slice(slot, slot + 2),
            'header_source': ram.slice(record, record + 1),
        })
        messages.append(item)
    return {
        'title': 'Mercenary III',
        'ram_sha256': ram.sha256,
        'sources': sources,
        'encoding': {
            'decoder': '$52AC4',
            'buffer': hexaddr(BUFFER),
            'bar_width': BAR_WIDTH,
            'codes': 'four 6-bit codes per three bytes, high bits first; 0 ends; character = code + 31',
            'centring': 'start pointer $7232 = buffer - ceil((48 - length) / 2) when length < 48 ($52B0A)',
            'id_header': 'nonzero: terminator becomes a space and ceil((48 - length) / 2) spaces follow ($55B42)',
            'carry_quirk': 'after ^2 the next code loses the bits carried from the previous byte ($52978)',
        },
        'static_tokens': statics,
        'live_tokens': LIVE,
        'messages': messages,
    }
