"""Decode the Reference Build's dictionary-compressed text.

The text engine stores a word dictionary and a set of messages built from word
indices, so a phrase costs one byte per word. Both are recovered here from our own
Reference Build; the community Reference Disassembly was read only to locate the
tables (ADR 0014).

Engine shape, as disassembled:

* A word pointer table split into low and high byte arrays. Each entry addresses
  the byte *before* its word, because the emitter pre-increments its index.
* Word characters run until a byte with bit 7 set, which is the final character
  rather than a separate terminator.
* A message pointer table with the same pre-increment convention. A message is a
  token stream ending at zero.
* The emitter writes one character per call into a single output byte. It stores a
  space when no word is in progress, so a normal word gains a leading space —
  while the low-numbered suffix words overwrite that space in the same call and
  therefore join the previous word directly.
"""

from __future__ import annotations

from typing import Any

from .core import LabError


TEXT_SCHEMA_VERSION = 1

WORD_POINTER_LOW = 0x2120
WORD_POINTER_HIGH = 0x2210
MESSAGE_POINTER_LOW = 0x20A0
MESSAGE_POINTER_HIGH = 0x20E0
SUBSTITUTION_TABLE = 0x56E8
TEXT_REGION = (0x0800, 0x2000)

#: Emitter sites asserted before decoding, so a Reference Build that does not
#: match this engine fails loudly instead of yielding plausible nonsense.
EMITTER_CHARACTER_READ = 0x8E09
EMITTER_MESSAGE_READ = 0x8E26
MESSAGE_POINTER_PATCH = 0x8DAE

MESSAGE_END = 0x00
FIRST_WORD_TOKEN = 0x08
EXTRA_SPACE_TOKEN = 0xEF
FIRST_SUBSTITUTION_TOKEN = 0xF0
FIRST_NUMBER_TOKEN = 0xF8
INLINE_LITERAL_TOKEN = 0xFF

#: Tokens below ``EXTRA_SPACE_TOKEN`` are word indices, so that bounds the table.
MAX_WORDS = EXTRA_SPACE_TOKEN
MAX_MESSAGES = 0x40

#: Character codes whose meaning is established. Letters and the space are literal;
#: the punctuation codes were read off words and the load/save prompt that fix them unambiguously —
#: BROTHER-IN-LAW for the hyphen, COMMANDER'S for the apostrophe, and the
#: single-character suffix used by "AH, YOU ARE BACK" for the comma. The digits
#: come from the engine rather than from a word: the numeric-field emitter writes
#: unpacked BCD nibbles straight into the character stream, so codes zero through
#: nine are the ten digit glyphs.
CHARACTER_MAP = {code: str(code) for code in range(10)} | {
    0x20: " ",
    0x0D: "-",
    0x0E: ".",
    0x6D: "?",
    0x6E: ",",
    0x6F: "'",
}

#: Every code found in the current tables is now established by project-owned evidence.
UNRESOLVED_CODES: tuple[int, ...] = ()


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def _require_engine(ram: bytes) -> None:
    """Confirm the text engine is the one these table addresses belong to."""
    _require(len(ram) == 65536, "Text decode requires a 64 KiB physical RAM image")
    checks = (
        (EMITTER_CHARACTER_READ, 0xBD, "character emitter does not index a patched word base"),
        (EMITTER_MESSAGE_READ, 0xBC, "message reader does not index the message stream"),
        (MESSAGE_POINTER_PATCH, 0xBD, "message pointer patch does not index a pointer table"),
    )
    for address, opcode, complaint in checks:
        _require(ram[address] == opcode, f"Reference Build {complaint}")
    _require(
        ram[EMITTER_MESSAGE_READ + 1] | (ram[EMITTER_MESSAGE_READ + 2] << 8) >= TEXT_REGION[0],
        "Message stream base is outside the text region",
    )


def _pointer(ram: bytes, low: int, high: int, index: int) -> int:
    return ram[low + index] | (ram[high + index] << 8)


def _in_text_region(address: int) -> bool:
    return TEXT_REGION[0] <= address < TEXT_REGION[1]


def _table_length(ram: bytes, low: int, high: int, limit: int) -> int:
    length = 0
    while length < limit and _in_text_region(_pointer(ram, low, high, length)):
        length += 1
    return length


def read_characters(ram: bytes, pointer: int) -> tuple[list[int], int]:
    """Read one bit-7-terminated run starting after ``pointer``."""
    codes: list[int] = []
    cursor = pointer + 1
    while cursor < TEXT_REGION[1]:
        byte = ram[cursor]
        codes.append(byte & 0x7F)
        cursor += 1
        if byte & 0x80:
            return codes, cursor
    raise LabError(f"Unterminated text run starting at ${pointer + 1:04x}")


def render(codes: list[int]) -> str:
    """Render character codes, dropping codes whose meaning is unresolved."""
    out: list[str] = []
    for code in codes:
        if 0x41 <= code <= 0x5A:
            out.append(chr(code))
        elif code in CHARACTER_MAP:
            out.append(CHARACTER_MAP[code])
    return "".join(out)


def decode_words(ram: bytes) -> list[dict[str, Any]]:
    """Decode every addressable dictionary slot.

    The table contains the occasional unused slot whose pointer falls outside the
    text region. Those are kept in place so indices stay aligned with the tokens
    that reference them, and marked rather than dropped.
    """
    words: list[dict[str, Any]] = []
    for index in range(MAX_WORDS):
        pointer = _pointer(ram, WORD_POINTER_LOW, WORD_POINTER_HIGH, index)
        if not _in_text_region(pointer):
            words.append({"index": index, "text": "", "codes": [], "suffix": False, "unused": True})
            continue
        codes, _ = read_characters(ram, pointer)
        words.append(
            {
                "index": index,
                "text": render(codes),
                "codes": codes,
                "suffix": index < FIRST_WORD_TOKEN,
                "unused": False,
            }
        )
    _require(any(not word["unused"] for word in words), "Word pointer table addresses nothing in the text region")
    return words


def decode_token_stream(
    ram: bytes, pointer: int, words: list[dict[str, Any]], *, context: str
) -> tuple[list[dict[str, Any]], int]:
    """Decode one zero-terminated token stream starting after ``pointer``.

    Both the message table and the Benson Scripts' inline messages are the same
    token vocabulary read by the same emitter, so they share this walker and
    produce identical token shapes. Returns the tokens and the cursor resting on
    the terminator.
    """
    tokens: list[dict[str, Any]] = []
    cursor = pointer + 1
    while cursor < TEXT_REGION[1]:
        token = ram[cursor]
        if token == MESSAGE_END:
            return tokens, cursor
        if token == INLINE_LITERAL_TOKEN:
            codes, cursor = read_characters(ram, cursor)
            tokens.append({"kind": "literal", "text": render(codes), "codes": codes})
            continue
        if token == EXTRA_SPACE_TOKEN:
            tokens.append({"kind": "space"})
        elif token >= FIRST_NUMBER_TOKEN:
            tokens.append({"kind": "number", "slot": token - FIRST_NUMBER_TOKEN})
        elif token >= FIRST_SUBSTITUTION_TOKEN:
            resolved = ram[SUBSTITUTION_TABLE + token]
            _require(
                resolved < len(words) and not words[resolved]["unused"],
                f"{context} substitution resolves to unusable word {resolved}",
            )
            tokens.append({"kind": "substitution", "slot": token - FIRST_SUBSTITUTION_TOKEN, "word": resolved})
        else:
            _require(
                token < len(words) and not words[token]["unused"],
                f"{context} references unusable word {token}",
            )
            tokens.append({"kind": "word", "word": token})
        cursor += 1
    raise LabError(f"Unterminated {context} starting at ${pointer + 1:04x}")


def decode_messages(ram: bytes, words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    count = _table_length(ram, MESSAGE_POINTER_LOW, MESSAGE_POINTER_HIGH, MAX_MESSAGES)
    _require(count > 0, "Message pointer table addresses nothing in the text region")
    messages: list[dict[str, Any]] = []
    for index in range(count):
        pointer = _pointer(ram, MESSAGE_POINTER_LOW, MESSAGE_POINTER_HIGH, index)
        tokens, _ = decode_token_stream(ram, pointer, words, context=f"message {index}")
        messages.append({"index": index, "tokens": tokens, "text": compose(tokens, words)})
    return messages


def compose(tokens: list[dict[str, Any]], words: list[dict[str, Any]]) -> str:
    """Join tokens the way the emitter does, and mark runtime substitutions."""
    out: list[str] = []
    for token in tokens:
        kind = token["kind"]
        if kind == "word":
            word = words[token["word"]]
            out.append(word["text"] if word["suffix"] else " " + word["text"])
        elif kind == "literal":
            out.append(" " + token["text"])
        elif kind == "space":
            out.append(" ")
        elif kind == "substitution":
            out.append(" {word" + str(token["slot"]) + "}")
        else:
            out.append(" {number" + str(token["slot"]) + "}")
    return " ".join("".join(out).split())


def decode_text(ram: bytes) -> dict[str, Any]:
    """Decode the word dictionary and the addressable messages."""
    _require_engine(ram)
    words = decode_words(ram)
    messages = decode_messages(ram, words)
    unresolved = sorted(
        {code for word in words for code in word["codes"] if code in UNRESOLVED_CODES}
        | {code for message in messages for token in message["tokens"] for code in token.get("codes", []) if code in UNRESOLVED_CODES}
    )
    return {
        "schemaVersion": TEXT_SCHEMA_VERSION,
        "words": words,
        "messages": messages,
        "characterMap": {f"{code:#04x}": text for code, text in sorted(CHARACTER_MAP.items())},
        "unresolvedCodes": [f"{code:#04x}" for code in unresolved],
        "counts": {
            "wordSlots": len(words),
            "distinctWords": len({word["text"] for word in words if not word["unused"] and word["text"]}),
            "referencedWords": len(
                {token["word"] for message in messages for token in message["tokens"] if "word" in token}
            ),
            "messages": len(messages),
        },
    }
