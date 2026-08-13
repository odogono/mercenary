from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.benson import (
    BENSON_SCHEMA_VERSION,
    DECIMAL_BASE,
    DISPATCH_TABLE,
    ENTRY_TABLE,
    HANDLER_CHECKS,
    OBJECT_ROOM_TABLE,
    SCRIPT_COUNT,
    SCRIPT_REGION,
    SID_BASE,
    STEP_CHECKS,
    decode_benson,
    decode_instruction,
    entry_addresses,
)
from c64lab.core import LabError
from c64lab.text import (
    INLINE_LITERAL_TOKEN,
    MAX_WORDS,
    MESSAGE_POINTER_HIGH,
    MESSAGE_POINTER_LOW,
    WORD_POINTER_HIGH,
    WORD_POINTER_LOW,
)
from test_text import Builder as TextBuilder, _terminated


#: Where the synthetic handlers are placed. Only their opening bytes matter, so
#: they are spread far enough apart for the longest fingerprint.
HANDLER_BASE = 0x9000
HANDLER_STRIDE = 0x10


class BensonBuilder:
    """Assemble a synthetic image with the same interpreter shape as the engine.

    None of this is Reference Build data: the interpreter fingerprints are the
    handful of bytes the decoder asserts, and the scripts are invented so the
    decoding rules can be exercised without any restricted input.
    """

    def __init__(self) -> None:
        text = TextBuilder()
        # Suffix slots plus a few words, so inline message tokens resolve.
        for index, word in enumerate(("ED", "S", "ING"), start=1):
            text.word(word, at=index)
        text.word("CRASH", at=8)
        text.word("LANDED", at=9)
        text.message(bytes([8]))
        self.ram = text.ram

        for address, expected, _ in STEP_CHECKS:
            self.ram[address:address + len(expected)] = bytes(expected)
        for opcode, (fingerprint, _) in HANDLER_CHECKS.items():
            handler = HANDLER_BASE + opcode * HANDLER_STRIDE
            self.ram[DISPATCH_TABLE + opcode * 2] = handler & 0xFF
            self.ram[DISPATCH_TABLE + opcode * 2 + 1] = handler >> 8
            self.ram[handler:handler + len(fingerprint)] = bytes(fingerprint)

        self.cursor = SCRIPT_REGION[0]
        self.entries: list[int] = []

    def script(self, code: bytes) -> int:
        """Add a script body and return the address it starts at."""
        address = self.cursor
        self.ram[address:address + len(code)] = code
        self.cursor += len(code)
        self.entries.append(address)
        return address

    def at(self, offset: int) -> int:
        """The absolute address of a byte offset inside the current script."""
        return self.cursor + offset

    def build(self, *, entries: list[int] | None = None) -> bytes:
        """Fill the entry table, padding unused slots with the first script."""
        table = list(entries if entries is not None else self.entries)
        assert table, "a synthetic image needs at least one script"
        table += [min(table)] * (SCRIPT_COUNT - len(table))
        for index, address in enumerate(table[:SCRIPT_COUNT]):
            self.ram[ENTRY_TABLE + index * 2] = address & 0xFF
            self.ram[ENTRY_TABLE + index * 2 + 1] = address >> 8
        return bytes(self.ram)


RET = bytes([0x05])


def _one(code: bytes) -> dict:
    """Decode a single-script image and return its whole document."""
    builder = BensonBuilder()
    builder.script(code)
    return decode_benson(builder.build())


def _instructions(code: bytes) -> list[dict]:
    return _one(code)["instructions"]


def _addr(address: int) -> bytes:
    return bytes([address & 0xFF, address >> 8])


def _assembled(assemble) -> list[dict]:
    """Decode a script whose branch targets depend on where it lands.

    ``assemble`` receives the script's start address and returns its bytes, so a
    test can point a branch at an instruction it is about to write.
    """
    builder = BensonBuilder()
    builder.script(assemble(builder.at(0)))
    return decode_benson(builder.build())["instructions"]


class EngineGuardTests(unittest.TestCase):
    def test_requires_a_full_memory_image(self) -> None:
        with self.assertRaisesRegex(LabError, "64 KiB physical RAM"):
            decode_benson(bytes(1024))

    def test_rejects_a_build_whose_step_does_not_match(self) -> None:
        builder = BensonBuilder()
        builder.script(RET)
        builder.ram[STEP_CHECKS[0][0]] = 0xEA

        with self.assertRaisesRegex(LabError, "message-busy byte"):
            decode_benson(builder.build())

    def test_rejects_a_build_whose_dispatch_table_moved(self) -> None:
        builder = BensonBuilder()
        builder.script(RET)
        # The step code computes the table address, so a different low byte
        # means the handlers this decoder fingerprints are somewhere else.
        builder.ram[0x8AC1] = 0x00

        with self.assertRaisesRegex(LabError, "dispatch table's low byte"):
            decode_benson(builder.build())

    def test_rejects_a_build_whose_handler_does_not_match(self) -> None:
        builder = BensonBuilder()
        builder.script(RET)
        builder.ram[HANDLER_BASE + 0x13 * HANDLER_STRIDE] = 0xEA

        with self.assertRaisesRegex(LabError, "room test"):
            decode_benson(builder.build())


class EntryTableTests(unittest.TestCase):
    def test_reads_one_entry_per_script(self) -> None:
        builder = BensonBuilder()
        first = builder.script(RET)
        second = builder.script(RET)
        entries = entry_addresses(builder.build())

        self.assertEqual(len(entries), SCRIPT_COUNT)
        self.assertEqual(entries[0], first)
        self.assertEqual(entries[1], second)

    def test_rejects_an_entry_outside_the_script_region(self) -> None:
        builder = BensonBuilder()
        builder.script(RET)
        image = bytearray(builder.build())
        image[ENTRY_TABLE + 2] = 0x00
        image[ENTRY_TABLE + 3] = 0x40

        with self.assertRaisesRegex(LabError, r"Script 1 enters at \$4000"):
            decode_benson(bytes(image))

    def test_rejects_a_table_that_does_not_end_where_the_scripts_start(self) -> None:
        builder = BensonBuilder()
        body = builder.script(RET)
        image = bytearray(builder.build())
        # Move every entry up a byte, leaving a hole the table should have filled.
        for index in range(SCRIPT_COUNT):
            image[ENTRY_TABLE + index * 2] = (body + 1) & 0xFF

        with self.assertRaisesRegex(LabError, "table is not"):
            decode_benson(bytes(image))

    def test_scripts_may_share_an_entry_point(self) -> None:
        builder = BensonBuilder()
        shared = builder.script(RET)
        document = decode_benson(builder.build(entries=[shared, shared]))

        self.assertEqual(document["scripts"][0]["entry"], document["scripts"][1]["entry"])
        self.assertEqual(document["counts"]["instructions"], 1)


class OperandTests(unittest.TestCase):
    def test_decodes_instructions_with_no_operands(self) -> None:
        self.assertEqual(
            [item["op"] for item in _instructions(bytes([0x02, 0x1C]) + RET)],
            ["cfr", "clrk", "ret"],
        )

    def test_decodes_flag_masks(self) -> None:
        instructions = _instructions(bytes([0x10, 0x01, 0x11, 0x40]) + RET)

        self.assertEqual(instructions[0], {"op": "setf", "mask": 0x01})
        self.assertEqual(instructions[1], {"op": "clrf", "mask": 0x40})

    def test_decodes_a_register_load_and_copy(self) -> None:
        instructions = _instructions(bytes([0x0F, 0xFE, 0x2E, 0x1E, 0xD4]) + RET)

        self.assertEqual(instructions[0], {"op": "loadi", "register": 14, "value": 0x2E})
        self.assertEqual(instructions[1], {"op": "load", "from": 4, "to": 13})

    def test_decodes_an_object_flag_change_and_its_direction(self) -> None:
        instructions = _instructions(bytes([0x20, 0x04, 0x20, 0x84]) + RET)

        self.assertEqual(instructions[0], {"op": "modf", "mode": "or", "mask": 0x04})
        self.assertEqual(instructions[1], {"op": "modf", "mode": "and", "mask": 0x84})

    def test_decodes_a_message_by_index_or_by_register(self) -> None:
        instructions = _instructions(bytes([0x14, 0x32, 0x14, 0x8E]) + RET)

        self.assertEqual(instructions[0], {"op": "msgi", "source": "immediate", "index": 0x32})
        self.assertEqual(instructions[1], {"op": "msgi", "source": "register", "register": 14})

    def test_decodes_a_random_message_range(self) -> None:
        self.assertEqual(
            _instructions(bytes([0x1B, 0x03, 0x3C]) + RET)[0],
            {"op": "msgr", "mask": 0x03, "base": 0x3C},
        )

    def test_decodes_a_three_register_decimal_add(self) -> None:
        self.assertEqual(
            _instructions(bytes([0x15, 0x08, 0x09, 0x08]) + RET)[0],
            {"op": "dadd", "a": 8, "b": 9, "into": 8},
        )

    def test_a_wait_keeps_its_operand_in_engine_ticks(self) -> None:
        instruction = _assembled(lambda start: bytes([0x07, 0x05, 0x00]) + _addr(start + 5) + RET)[0]

        self.assertEqual(instruction["ticks"], 5)


class DecimalLiteralTests(unittest.TestCase):
    def test_reads_a_packed_bcd_literal_least_significant_byte_first(self) -> None:
        instruction = _instructions(bytes([0x0D, 0xF8, 0x00, 0x90, 0x00, 0x00]) + RET)[0]

        self.assertEqual(instruction, {"op": "ldr", "decimal": 8, "value": 9000})

    def test_reads_the_full_eight_digit_range(self) -> None:
        instruction = _instructions(bytes([0x0E, 0xF8, 0x01, 0x00, 0x00, 0x99]) + RET)[0]

        self.assertEqual(instruction, {"op": "adr", "decimal": 8, "value": 99000001})

    def test_rejects_a_literal_that_is_not_packed_bcd(self) -> None:
        with self.assertRaisesRegex(LabError, "not packed BCD"):
            _instructions(bytes([0x0D, 0xF8, 0xAA, 0x00, 0x00, 0x00]) + RET)


class SymbolTests(unittest.TestCase):
    def test_names_a_sound_register_and_renames_the_store(self) -> None:
        code = bytes([0x19, (SID_BASE + 0x04) & 0xFF, (SID_BASE + 0x04) >> 8, 0x00]) + RET

        self.assertEqual(
            _instructions(code)[0],
            {"op": "sound", "symbol": "voice1.control", "value": 0},
        )

    def test_names_a_known_engine_write(self) -> None:
        instruction = _instructions(bytes([0x19, 0xE1, 0x00, 0x96]) + RET)[0]

        self.assertEqual(instruction, {"op": "stor", "symbol": "messageInterval", "value": 150})

    def test_names_an_object_row_by_slot(self) -> None:
        address = OBJECT_ROOM_TABLE + 46
        instruction = _instructions(bytes([0x19, address & 0xFF, address >> 8, 0x01]) + RET)[0]

        self.assertEqual(
            instruction,
            {"op": "stor", "symbol": "objectRoom", "slot": 46, "value": 1},
        )

    def test_names_a_decimal_register_byte_by_slot(self) -> None:
        instruction = _assembled(
            lambda start: bytes([0x18]) + _addr(DECIMAL_BASE + 8 * 4) + bytes([0x00]) + _addr(start + 6) + RET
        )[0]

        self.assertEqual(instruction["symbol"], "decimalByte")
        self.assertEqual((instruction["decimal"], instruction["byte"]), (8, 0))

    def test_rejects_a_read_of_an_unnamed_address(self) -> None:
        with self.assertRaisesRegex(LabError, r"reads unnamed address \$1234"):
            _assembled(lambda start: bytes([0x18, 0x34, 0x12, 0x00]) + _addr(start + 6) + RET)

    def test_rejects_a_write_to_an_unnamed_address(self) -> None:
        with self.assertRaisesRegex(LabError, r"writes unnamed address \$1234"):
            _instructions(bytes([0x19, 0x34, 0x12, 0x00]) + RET)

    def test_rejects_a_write_to_an_unnamed_sound_register(self) -> None:
        with self.assertRaisesRegex(LabError, r"writes unnamed address \$d41e"):
            _instructions(bytes([0x19, 0x1E, 0xD4, 0x00]) + RET)

    def test_names_a_tested_key(self) -> None:
        instruction = _assembled(lambda start: bytes([0x0B, 0x19]) + _addr(start + 4) + RET)[0]

        self.assertEqual(instruction["key"], "keyY")

    def test_masks_a_key_code_to_six_bits_before_naming_it(self) -> None:
        instruction = _assembled(lambda start: bytes([0x0B, 0x59]) + _addr(start + 4) + RET)[0]

        self.assertEqual(instruction["key"], "keyY")

    def test_rejects_an_unnamed_key_code(self) -> None:
        with self.assertRaisesRegex(LabError, r"unnamed key code \$3f"):
            _assembled(lambda start: bytes([0x0B, 0x3F]) + _addr(start + 4) + RET)


class BranchTests(unittest.TestCase):
    def test_a_taken_branch_becomes_an_instruction_index(self) -> None:
        builder = BensonBuilder()
        start = builder.at(0)
        # room, branching forward over a clrk to the ret.
        builder.script(bytes([0x13, (start + 4) & 0xFF, (start + 4) >> 8, 0x1C]) + RET)
        instructions = decode_benson(builder.build())["instructions"]

        self.assertEqual(instructions[0]["onTaken"], {"kind": "jmp", "target": 2})
        self.assertEqual(instructions[2]["op"], "ret")

    def test_bit_seven_records_the_outcome_the_branch_fires_on(self) -> None:
        builder = BensonBuilder()
        start = builder.at(0)
        target = (start + 6) & 0xFF, (start + 6) >> 8
        builder.script(bytes([0x13, *target, 0x93, *target]) + RET)
        instructions = decode_benson(builder.build())["instructions"]

        self.assertFalse(instructions[0]["branchOn"])
        self.assertTrue(instructions[1]["branchOn"])

    def test_bit_six_selects_a_call(self) -> None:
        builder = BensonBuilder()
        start = builder.at(0)
        builder.script(bytes([0x53, (start + 3) & 0xFF, (start + 3) >> 8]) + RET)
        instructions = decode_benson(builder.build())["instructions"]

        self.assertEqual(instructions[0]["onTaken"]["kind"], "call")

    def test_rejects_a_called_conditional_that_would_return_into_its_operands(self) -> None:
        builder = BensonBuilder()
        start = builder.at(0)
        # A flag test is four bytes wide, so the interpreter's return address
        # would land on its own branch operand.
        builder.script(bytes([0x52, 0x01, (start + 4) & 0xFF, (start + 4) >> 8]) + RET)

        with self.assertRaisesRegex(LabError, "return into its own operands"):
            decode_benson(builder.build())

    def test_rejects_a_branch_modifier_on_an_unconditional_instruction(self) -> None:
        with self.assertRaisesRegex(LabError, "sets a branch modifier"):
            _instructions(bytes([0x50, 0x01]) + RET)

    def test_a_backward_branch_resolves_to_an_earlier_index(self) -> None:
        builder = BensonBuilder()
        start = builder.at(0)
        builder.script(bytes([0x02, 0x13, start & 0xFF, start >> 8]) + RET)
        instructions = decode_benson(builder.build())["instructions"]

        self.assertEqual(instructions[1]["onTaken"], {"kind": "jmp", "target": 0})

    def test_rejects_a_target_that_splits_an_instruction(self) -> None:
        builder = BensonBuilder()
        start = builder.at(0)
        builder.script(bytes([0x13, (start + 1) & 0xFF, (start + 1) >> 8]) + RET)

        with self.assertRaisesRegex(LabError, "selects opcode"):
            decode_benson(builder.build())


class WalkTests(unittest.TestCase):
    def test_a_jump_ends_the_fall_through(self) -> None:
        builder = BensonBuilder()
        start = builder.at(0)
        # The jump skips a byte that is not a valid instruction, proving the
        # walk stops rather than decoding past an unconditional jump.
        builder.script(bytes([0x03, (start + 4) & 0xFF, (start + 4) >> 8, 0x00]) + RET)
        instructions = decode_benson(builder.build())["instructions"]

        self.assertEqual([item["op"] for item in instructions], ["jmp", "ret"])

    def test_a_shared_subroutine_is_decoded_once(self) -> None:
        builder = BensonBuilder()
        shared = builder.script(RET)
        first = builder.script(bytes([0x04, shared & 0xFF, shared >> 8]) + RET)
        second = builder.script(bytes([0x04, shared & 0xFF, shared >> 8]) + RET)
        document = decode_benson(builder.build(entries=[shared, first, second]))
        instructions = document["instructions"]

        self.assertEqual(sum(item["op"] == "ret" for item in instructions), 3)
        calls = [item for item in instructions if item["op"] == "call"]
        self.assertEqual({item["target"] for item in calls}, {0})

    def test_reports_bytes_no_entry_point_reaches(self) -> None:
        builder = BensonBuilder()
        start = builder.at(0)
        builder.script(bytes([0x03, (start + 5) & 0xFF, (start + 5) >> 8, 0x02, 0x1C]) + RET)
        counts = decode_benson(builder.build())["counts"]

        self.assertEqual(counts["unreachableBytes"], 2)

    def test_rejects_an_opcode_the_interpreter_would_crash_on(self) -> None:
        with self.assertRaisesRegex(LabError, r"selects opcode \$00"):
            _instructions(bytes([0x00]))

    def test_rejects_an_opcode_the_reference_build_never_uses(self) -> None:
        with self.assertRaisesRegex(LabError, r"opcode \$09 \(func\)"):
            _instructions(bytes([0x09, 0x00, 0x90, 0x00, 0x00]) + RET)


class InlineMessageTests(unittest.TestCase):
    def test_decodes_inline_tokens_and_resumes_after_the_terminator(self) -> None:
        code = bytes([0x01, 8, 9, 0x00, 0x1C]) + RET
        instructions = _instructions(code)

        self.assertEqual([item["op"] for item in instructions], ["msg", "clrk", "ret"])
        self.assertEqual(
            instructions[0]["tokens"],
            [{"kind": "word", "word": 8}, {"kind": "word", "word": 9}],
        )

    def test_decodes_an_inline_literal_run(self) -> None:
        code = bytes([0x01, INLINE_LITERAL_TOKEN]) + _terminated("TARG") + bytes([0x00]) + RET
        tokens = _instructions(code)[0]["tokens"]

        self.assertEqual(tokens[0]["kind"], "literal")
        self.assertEqual(tokens[0]["text"], "TARG")

    def test_an_empty_message_is_still_an_instruction(self) -> None:
        instructions = _instructions(bytes([0x01, 0x00]) + RET)

        self.assertEqual(instructions[0], {"op": "msg", "tokens": []})

    def test_rejects_an_inline_message_referencing_an_unused_word(self) -> None:
        with self.assertRaisesRegex(LabError, "references unusable word 200"):
            _instructions(bytes([0x01, 200, 0x00]) + RET)


class DocumentTests(unittest.TestCase):
    def test_reports_the_schema_scripts_and_census(self) -> None:
        builder = BensonBuilder()
        start = builder.at(0)
        builder.script(bytes([0x01, 8, 0x00, 0x0B, 0x19]) + _addr(start + 7) + RET)
        document = decode_benson(builder.build())

        self.assertEqual(document["schemaVersion"], BENSON_SCHEMA_VERSION)
        self.assertEqual(len(document["scripts"]), SCRIPT_COUNT)
        self.assertEqual(document["symbols"]["keys"], ["keyY"])
        self.assertEqual(document["counts"]["inlineMessages"], 1)
        self.assertEqual(document["counts"]["opcodesUsed"], 3)
        self.assertEqual(document["framesPerTick"], 50)

    def test_reads_the_decimal_registers_the_image_starts_with(self) -> None:
        builder = BensonBuilder()
        builder.script(RET)
        builder.ram[DECIMAL_BASE + 8 * 4:DECIMAL_BASE + 8 * 4 + 4] = bytes([0x00, 0x00, 0x90, 0x00])
        builder.ram[DECIMAL_BASE + 9 * 4:DECIMAL_BASE + 9 * 4 + 4] = bytes([0xAA] * 4)
        seeds = decode_benson(builder.build())["decimalSeeds"]

        self.assertEqual(seeds["8"], 9000)
        self.assertNotIn("9", seeds)


class InstructionWidthTests(unittest.TestCase):
    """Every instruction's width, checked one at a time.

    A wrong width silently shifts every instruction after it, so each opcode's
    total size is asserted against the operands its handler is known to read.
    Conditional instructions carry a two-byte branch target on top of their
    operands, which is the easiest part to get wrong.
    """

    #: opcode -> (operands after the opcode, expected total width)
    CASES = {
        0x02: (b"", 1),
        0x03: (_addr(0x0900), 3),
        0x04: (_addr(0x0900), 3),
        0x05: (b"", 1),
        0x07: (bytes([0x05, 0x00]) + _addr(0x0900), 5),
        0x0A: (bytes([0x40]) + _addr(0x0900), 4),
        0x0B: (bytes([0x19]) + _addr(0x0900), 4),
        0x0C: (_addr(0x0900), 3),
        0x0D: (bytes([0xF8, 0x00, 0x00, 0x00, 0x00]), 6),
        0x0E: (bytes([0xF8, 0x00, 0x00, 0x00, 0x00]), 6),
        0x0F: (bytes([0xFE, 0x01]), 3),
        0x10: (bytes([0x01]), 2),
        0x11: (bytes([0x40]), 2),
        0x12: (bytes([0x01]) + _addr(0x0900), 4),
        0x13: (_addr(0x0900), 3),
        0x14: (bytes([0x32]), 2),
        0x15: (bytes([0x08, 0x09, 0x08]), 4),
        0x18: (_addr(DECIMAL_BASE) + bytes([0x00]) + _addr(0x0900), 6),
        0x19: (_addr(DECIMAL_BASE) + bytes([0x01]), 4),
        0x1A: (_addr(0x0900), 3),
        0x1B: (bytes([0x03, 0x3C]), 3),
        0x1C: (b"", 1),
        0x1D: (_addr(0x0900), 3),
        0x1E: (bytes([0xD4]), 2),
        0x20: (bytes([0x04]), 2),
        0x21: (bytes([0x04]) + _addr(0x0900), 4),
        0x22: (bytes([0x01]) + _addr(0x0900), 4),
    }

    def test_each_opcode_consumes_the_operands_the_handler_reads(self) -> None:
        from c64lab.text import decode_words

        for opcode, (operands, width) in sorted(self.CASES.items()):
            with self.subTest(opcode=f"${opcode:02x}"):
                builder = BensonBuilder()
                address = builder.at(0)
                builder.script(bytes([opcode]) + operands)
                image = builder.build()
                decoded = decode_instruction(image, address, decode_words(image))
                self.assertEqual(decoded["length"], width)

    def test_the_case_table_covers_every_opcode_the_reference_build_uses(self) -> None:
        from c64lab.benson import OPCODES, UNUSED_OPCODES

        expected = set(OPCODES) - set(UNUSED_OPCODES) - {0x01}
        self.assertEqual(set(self.CASES), expected)


if __name__ == "__main__":
    unittest.main()
