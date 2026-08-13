from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.text import (
    EMITTER_CHARACTER_READ,
    EMITTER_MESSAGE_READ,
    INLINE_LITERAL_TOKEN,
    MAX_WORDS,
    MESSAGE_POINTER_HIGH,
    MESSAGE_POINTER_LOW,
    MESSAGE_POINTER_PATCH,
    SUBSTITUTION_TABLE,
    WORD_POINTER_HIGH,
    WORD_POINTER_LOW,
    compose,
    decode_text,
    read_characters,
    render,
)


def _terminated(text: str) -> bytes:
    """Encode a run the way the engine does: bit 7 marks the final character."""
    raw = bytearray(text.encode("ascii"))
    raw[-1] |= 0x80
    return bytes(raw)


class Builder:
    """Assemble a synthetic image with the same table layout as the engine.

    None of this is Reference Build data; the words and messages are invented so
    the decoder's rules can be exercised without any restricted input.
    """

    def __init__(self) -> None:
        self.ram = bytearray(65536)
        self.ram[EMITTER_CHARACTER_READ] = 0xBD
        self.ram[EMITTER_MESSAGE_READ] = 0xBC
        self.ram[EMITTER_MESSAGE_READ + 1] = 0xA5
        self.ram[EMITTER_MESSAGE_READ + 2] = 0x08
        self.ram[MESSAGE_POINTER_PATCH] = 0xBD
        self.cursor = 0x1000
        self.words = 0
        self.messages = 0
        # Every unused word slot points outside the text region.
        for index in range(MAX_WORDS):
            self.ram[WORD_POINTER_LOW + index] = 0x00
            self.ram[WORD_POINTER_HIGH + index] = 0x40

    def _write(self, payload: bytes) -> int:
        # The pointer addresses the byte before the run, because the emitter
        # pre-increments its index.
        pointer = self.cursor - 1
        self.ram[self.cursor:self.cursor + len(payload)] = payload
        self.cursor += len(payload)
        return pointer

    def word(self, text: str, *, at: int | None = None) -> int:
        index = self.words if at is None else at
        self.words = max(self.words, index + 1)
        pointer = self._write(_terminated(text))
        self.ram[WORD_POINTER_LOW + index] = pointer & 0xFF
        self.ram[WORD_POINTER_HIGH + index] = pointer >> 8
        return index

    def message(self, tokens: bytes) -> int:
        index = self.messages
        self.messages += 1
        pointer = self._write(tokens + b"\x00")
        self.ram[MESSAGE_POINTER_LOW + index] = pointer & 0xFF
        self.ram[MESSAGE_POINTER_HIGH + index] = pointer >> 8
        return index

    def build(self) -> bytes:
        return bytes(self.ram)


def _basic() -> Builder:
    """Slots 1-7 are the addressable suffixes; token 0 terminates a message."""
    builder = Builder()
    for index, text in enumerate(("ED", "S", "ING", "D", "X", "Y", "Z"), start=1):
        builder.word(text, at=index)
    builder.word("YOU", at=8)
    builder.word("HAVE", at=9)
    builder.word("CREDITS", at=10)
    builder.word("LOCK", at=11)
    builder.word("GOLD", at=12)
    # Every decode needs at least one message, so message 0 is always present and
    # tests that add their own read from index 1 onward.
    builder.message(bytes([8]))
    return builder


class CharacterRunTests(unittest.TestCase):
    def test_reads_until_the_high_bit_marks_the_last_character(self) -> None:
        ram = bytearray(65536)
        ram[0x1001:0x1005] = _terminated("TARG")

        codes, cursor = read_characters(bytes(ram), 0x1000)

        self.assertEqual(codes, [0x54, 0x41, 0x52, 0x47])
        self.assertEqual(cursor, 0x1005)

    def test_rejects_a_run_with_no_terminator(self) -> None:
        ram = bytearray(65536)
        ram[0x1FF0:0x2000] = b"A" * 16

        with self.assertRaisesRegex(LabError, "Unterminated text run"):
            read_characters(bytes(ram), 0x1FEF)


class RenderTests(unittest.TestCase):
    def test_renders_letters_space_and_known_punctuation(self) -> None:
        self.assertEqual(render([0x41, 0x20, 0x42]), "A B")
        self.assertEqual(render([0x41, 0x0D, 0x42]), "A-B")
        self.assertEqual(render([0x41, 0x6F, 0x53]), "A'S")
        self.assertEqual(render([0x41, 0x6E]), "A,")

    def test_drops_codes_whose_meaning_is_unresolved(self) -> None:
        self.assertEqual(render([0x41, 0x09, 0x0E, 0x6D, 0x42]), "AB")


class WordDecodeTests(unittest.TestCase):
    def test_decodes_words_and_marks_the_low_slots_as_suffixes(self) -> None:
        text = decode_text(_basic().build())
        words = text["words"]

        self.assertEqual(words[8]["text"], "YOU")
        self.assertEqual(words[1]["text"], "ED")
        self.assertTrue(words[1]["suffix"])
        self.assertFalse(words[8]["suffix"])

    def test_marks_unused_slots_without_shifting_indices(self) -> None:
        text = decode_text(_basic().build())
        words = text["words"]

        self.assertTrue(words[20]["unused"])
        self.assertEqual(words[12]["text"], "GOLD")
        self.assertEqual(len(words), MAX_WORDS)

    def test_counts_report_slots_distinct_and_referenced_words(self) -> None:
        builder = _basic()
        builder.word("GOLD", at=13)                      # a duplicate of slot 12
        builder.message(bytes([8, 12]))
        counts = decode_text(builder.build())["counts"]

        self.assertEqual(counts["wordSlots"], MAX_WORDS)
        self.assertEqual(counts["referencedWords"], 2)
        self.assertEqual(counts["distinctWords"], 12)


class MessageDecodeTests(unittest.TestCase):
    def test_joins_words_with_spaces_and_attaches_suffixes(self) -> None:
        builder = _basic()
        builder.message(bytes([11, 1]))                  # LOCK + ED
        builder.message(bytes([8, 9, 10]))               # YOU HAVE CREDITS
        text = decode_text(builder.build())

        self.assertEqual(text["messages"][1]["text"], "LOCKED")
        self.assertEqual(text["messages"][2]["text"], "YOU HAVE CREDITS")

    def test_decodes_an_inline_literal(self) -> None:
        builder = _basic()
        builder.message(bytes([8]) + bytes([INLINE_LITERAL_TOKEN]) + _terminated("TARG"))
        text = decode_text(builder.build())

        self.assertEqual(text["messages"][1]["text"], "YOU TARG")
        self.assertEqual(text["messages"][1]["tokens"][1]["kind"], "literal")

    def test_records_number_slots_as_placeholders(self) -> None:
        builder = _basic()
        builder.message(bytes([8, 9, 0xF8, 10]))
        text = decode_text(builder.build())

        self.assertEqual(text["messages"][1]["text"], "YOU HAVE {number0} CREDITS")

    def test_resolves_a_substitution_through_its_table(self) -> None:
        builder = _basic()
        builder.ram[SUBSTITUTION_TABLE + 0xF0] = 12
        builder.message(bytes([0xF0]))
        text = decode_text(builder.build())

        token = text["messages"][1]["tokens"][0]
        self.assertEqual(token["kind"], "substitution")
        self.assertEqual(token["word"], 12)
        self.assertEqual(text["messages"][1]["text"], "{word0}")

    def test_an_extra_space_token_collapses(self) -> None:
        builder = _basic()
        builder.message(bytes([8, 0xEF, 9]))
        text = decode_text(builder.build())

        self.assertEqual(text["messages"][1]["text"], "YOU HAVE")

    def test_rejects_a_message_referencing_an_unused_word(self) -> None:
        builder = _basic()
        builder.message(bytes([200]))

        with self.assertRaisesRegex(LabError, "references unusable word 200"):
            decode_text(builder.build())

    def test_rejects_a_substitution_resolving_to_an_unused_word(self) -> None:
        builder = _basic()
        builder.ram[SUBSTITUTION_TABLE + 0xF0] = 200
        builder.message(bytes([0xF0]))

        with self.assertRaisesRegex(LabError, "resolves to unusable word 200"):
            decode_text(builder.build())

    def test_reports_the_unresolved_codes_it_encountered(self) -> None:
        builder = _basic()
        builder.word("A\x09B", at=20)
        builder.message(bytes([20]))
        text = decode_text(builder.build())

        self.assertEqual(text["unresolvedCodes"], ["0x09"])


class EngineGuardTests(unittest.TestCase):
    def test_requires_a_full_memory_image(self) -> None:
        with self.assertRaisesRegex(LabError, "64 KiB physical RAM"):
            decode_text(bytes(1024))

    def test_rejects_a_build_whose_emitter_does_not_match(self) -> None:
        builder = _basic()
        builder.ram[EMITTER_CHARACTER_READ] = 0xEA

        with self.assertRaisesRegex(LabError, "character emitter"):
            decode_text(builder.build())

    def test_rejects_a_build_whose_message_reader_does_not_match(self) -> None:
        builder = _basic()
        builder.ram[EMITTER_MESSAGE_READ] = 0xEA

        with self.assertRaisesRegex(LabError, "message reader"):
            decode_text(builder.build())

    def test_rejects_a_build_whose_pointer_patch_does_not_match(self) -> None:
        builder = _basic()
        builder.ram[MESSAGE_POINTER_PATCH] = 0xEA

        with self.assertRaisesRegex(LabError, "message pointer patch"):
            decode_text(builder.build())


class ComposeTests(unittest.TestCase):
    def test_compose_matches_the_emitter_spacing_rule(self) -> None:
        words = [
            {"index": 0, "text": "ED", "suffix": True, "unused": False},
            {"index": 1, "text": "LOCK", "suffix": False, "unused": False},
        ]
        tokens = [{"kind": "word", "word": 1}, {"kind": "word", "word": 0}]

        self.assertEqual(compose(tokens, words), "LOCKED")


if __name__ == "__main__":
    unittest.main()
