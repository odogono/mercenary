from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import (  # noqa: E402
    LabError,
    JOYSTICK1_SOFTCOPY,
    compare_reproducible_runs,
    extract_disassembly,
    extract_stable_ram,
    format_hatari_key,
    parse_ram_ranges,
    parse_register_log,
    resolve_stick_bitmask,
    stable_registers,
    validate_image,
    validate_run_manifest,
    validate_scenario,
    verify_run_artifacts,
)
from damocleslab.laboratory import export  # noqa: E402
from damocleslab.script import (  # noqa: E402
    decode_scripts,
    read_script_table,
    read_string_table,
)
from damocleslab.runtime import (  # noqa: E402
    build_hatari_command,
    render_dump_script,
    render_title_capture_script,
    render_vbl_wait_script,
)
from damocleslab.toolchain import parse_hatari_version  # noqa: E402


def _hashes(data: bytes) -> dict[str, str]:
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "sha1": hashlib.sha1(data).hexdigest(),
        "md5": hashlib.md5(data).hexdigest(),
    }


class ImageValidationTests(unittest.TestCase):
    def test_accepts_a_matching_image(self) -> None:
        content = b"STX-FAKE"
        expected = {"size": len(content), "hashes": _hashes(content)}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "disk.stx"
            path.write_bytes(content)
            actual = validate_image(path, expected, label="Working Authority STX")
        self.assertEqual(actual["size"], len(content))
        self.assertEqual(actual["hashes"], expected["hashes"])

    def test_rejects_a_hash_mismatch_before_emulator_launch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "disk.stx"
            path.write_bytes(b"wrong")
            expected = {"size": 5, "hashes": {"sha256": "0" * 64}}
            with self.assertRaisesRegex(LabError, "sha256"):
                validate_image(path, expected, label="Working Authority STX")


class RegisterParseTests(unittest.TestCase):
    def test_parses_hatari_register_block(self) -> None:
        text = (
            "  D0 0000002F   D1 00000001\n"
            "  A5 0003BCD8   A6 00068A82   A7 0006AB60\n"
            "CPU=$68582, VBL=2568\n"
            "00068582 d582                     addx.l d2,d2\n"
        )
        registers = parse_register_log(text)
        self.assertEqual(registers["PC"], 0x68582)
        self.assertEqual(registers["A6"], 0x68A82)
        self.assertEqual(stable_registers({**registers, "D5": 47, "D6": 1, "D7": 1})["A6"], 0x68A82)


class HatariKeyTests(unittest.TestCase):
    def test_pads_a_one_digit_scancode_so_hatari_does_not_read_a_character(self) -> None:
        self.assertEqual(format_hatari_key(0x01), "01")
        self.assertEqual(format_hatari_key(0x05), "05")

    def test_leaves_longer_scancodes_and_key_names_alone(self) -> None:
        self.assertEqual(format_hatari_key(57), "57")
        self.assertEqual(format_hatari_key(0x30), "48")
        self.assertEqual(format_hatari_key("a"), "a")


class ScenarioValidationTests(unittest.TestCase):
    def test_accepts_title_smoke_shape(self) -> None:
        validate_scenario(
            {
                "schemaVersion": 1,
                "name": "title-smoke",
                "checkpoint": "title-screen",
                "actions": [
                    {"type": "keypress", "key": 57},
                    {"type": "wait_vbls", "count": 200},
                    {"type": "capture", "artifacts": ["display"]},
                ],
            }
        )

    def test_accepts_checked_in_first_world_scenario(self) -> None:
        path = Path(__file__).resolve().parents[1] / "scenarios" / "first-world.json"
        validate_scenario(json.loads(path.read_text(encoding="utf-8")))

    def test_accepts_checked_in_script_dispatch_scenario(self) -> None:
        path = Path(__file__).resolve().parents[1] / "scenarios" / "script-dispatch.json"
        validate_scenario(json.loads(path.read_text(encoding="utf-8")))

    def _disassemble_scenario(self, action: dict) -> dict:
        return {
            "schemaVersion": 1,
            "name": "wd",
            "checkpoint": "title-screen",
            "actions": [action, {"type": "capture", "artifacts": ["ram"]}],
        }

    def test_rejects_an_unbounded_disassembly_range(self) -> None:
        # A Working Disassembly is targeted; a whole-program listing is refused.
        with self.assertRaisesRegex(LabError, "at most"):
            validate_scenario(
                self._disassemble_scenario(
                    {"type": "disassemble", "name": "everything", "start": "0x50000", "end": "0x60000"}
                )
            )

    def test_rejects_an_inverted_disassembly_range(self) -> None:
        with self.assertRaisesRegex(LabError, "below end"):
            validate_scenario(
                self._disassemble_scenario(
                    {"type": "disassemble", "name": "backwards", "start": "0x51a80", "end": "0x51880"}
                )
            )

    def test_rejects_a_second_disassembly(self) -> None:
        # Hatari stops reading the FIFO after a listing, so a second one — and
        # any capture behind it — would be silently lost.
        with self.assertRaisesRegex(LabError, "at most one disassemble"):
            validate_scenario(
                {
                    "schemaVersion": 1,
                    "name": "wd",
                    "checkpoint": "title-screen",
                    "actions": [
                        {"type": "capture", "artifacts": ["ram"]},
                        {"type": "disassemble", "name": "first", "start": "0x51880", "end": "0x51900"},
                        {"type": "disassemble", "name": "second", "start": "0x51900", "end": "0x51980"},
                    ],
                }
            )

    def test_rejects_missing_capture(self) -> None:
        with self.assertRaisesRegex(LabError, "one or two capture"):
            validate_scenario(
                {
                    "schemaVersion": 1,
                    "name": "bad",
                    "checkpoint": "title-screen",
                    "actions": [{"type": "keypress", "key": 57}],
                }
            )

    def test_accepts_deadline_clock_two_captures(self) -> None:
        path = Path(__file__).resolve().parents[1] / "scenarios" / "deadline-clock.json"
        validate_scenario(json.loads(path.read_text(encoding="utf-8")))

    def test_accepts_walk_toward_building_stick_hold(self) -> None:
        path = Path(__file__).resolve().parents[1] / "scenarios" / "walk-toward-building.json"
        validate_scenario(json.loads(path.read_text(encoding="utf-8")))

    def test_accepts_approach_spaceport_pad(self) -> None:
        path = Path(__file__).resolve().parents[1] / "scenarios" / "approach-spaceport-pad.json"
        validate_scenario(json.loads(path.read_text(encoding="utf-8")))

    def test_accepts_outdoor_palette(self) -> None:
        path = Path(__file__).resolve().parents[1] / "scenarios" / "outdoor-palette.json"
        validate_scenario(json.loads(path.read_text(encoding="utf-8")))

    def test_accepts_stick_hold_without_joy_keys_port(self) -> None:
        # stick_hold drives locomotion by memwriting the $79C2 joystick-1
        # soft-copy, so it no longer depends on host keyboard-to-joystick mapping.
        validate_scenario(
            {
                "schemaVersion": 1,
                "name": "stick-no-joykeys",
                "checkpoint": "title-screen",
                "actions": [
                    {"type": "stick_hold", "direction": "up", "vbls": 100},
                    {"type": "capture", "artifacts": ["display"]},
                ],
            }
        )

    def test_rejects_reused_capture_prefix(self) -> None:
        with self.assertRaisesRegex(LabError, "prefix"):
            validate_scenario(
                {
                    "schemaVersion": 1,
                    "name": "bad",
                    "checkpoint": "title-screen",
                    "actions": [
                        {"type": "capture", "prefix": "observed-t0", "artifacts": ["ram"]},
                        {"type": "capture", "prefix": "observed-t0", "artifacts": ["ram"]},
                    ],
                }
            )


class ManifestTests(unittest.TestCase):
    def test_verify_and_compare_normalized_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            payload = b"stable-ram"
            (run / "norm.ram").write_bytes(payload)
            (run / "regs.json").write_text('{"A5": 1}\n', encoding="utf-8")
            (run / "screen.png").write_bytes(b"png")
            manifest = {
                "schemaVersion": 1,
                "runId": "r1",
                "createdAt": "2026-08-18T00:00:00Z",
                "authority": {"logicalName": "wa", "programSha256": "a" * 64},
                "toolchain": {"hatariVersion": "2.6.1", "pythonVersion": "3.13.0"},
                "machine": {"model": "st", "memsizeMiB": 1, "tosSha256": "b" * 64},
                "scenario": {"name": "title-screen"},
                "checkpoint": {"name": "title-screen", "pc": 427394},
                "artifacts": [
                    {
                        "role": "normalized-ram",
                        "path": "norm.ram",
                        "size": len(payload),
                        "sha256": hashlib.sha256(payload).hexdigest(),
                    },
                    {
                        "role": "registers-stable",
                        "path": "regs.json",
                        "size": (run / "regs.json").stat().st_size,
                        "sha256": hashlib.sha256((run / "regs.json").read_bytes()).hexdigest(),
                    },
                    {
                        "role": "display",
                        "path": "screen.png",
                        "size": 3,
                        "sha256": hashlib.sha256(b"png").hexdigest(),
                    },
                ],
            }
            validate_run_manifest(manifest)
            verify_run_artifacts(run, manifest)
            compare_reproducible_runs(manifest, json.loads(json.dumps(manifest)))


class StableRamTests(unittest.TestCase):
    def test_extracts_named_ranges(self) -> None:
        data = bytes(range(256)) * (0x100000 // 256)
        ranges = parse_ram_ranges([["0x10", "0x14"], ["0x20", "0x22"]], label="stableRamRanges")
        extracted = extract_stable_ram(data, ranges)
        self.assertEqual(extracted, data[0x10:0x14] + data[0x20:0x22])


class RuntimeScriptTests(unittest.TestCase):
    def test_renders_pc_then_vbl_chain(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            dump = Path(directory) / "dump.txt"
            wait = Path(directory) / "wait.txt"
            dump.write_text("r\n", encoding="utf-8")
            script = render_title_capture_script(next_script=wait, pc=0x68582)
            self.assertIn("pc = $68582", script)
            self.assertIn("c\n", script)
            wait_script = render_vbl_wait_script(dump_script=dump, extra_vbls=1400)
            self.assertIn("VBL+1400", wait_script)
            dump_script = render_dump_script(run_directory=Path(directory), prefix="title-screen")
            self.assertIn("savebin", dump_script)
            self.assertIn("screenshot", dump_script)

    def test_joy1_keys_adds_hatari_flag(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parse = Path(directory) / "parse.txt"
            parse.write_text("c\n", encoding="utf-8")
            tos = Path(directory) / "tos.img"
            disk = Path(directory) / "disk.stx"
            tos.write_bytes(b"tos")
            disk.write_bytes(b"stx")
            command = build_hatari_command(
                hatari_binary=Path("hatari"),
                tos=tos,
                disk_a=disk,
                machine_model="st",
                memsize_mib=1,
                parse_script=parse,
                fast_forward=True,
                statusbar=False,
                joy_keys_port=1,
            )
            self.assertIn("--joy1", command)
            self.assertEqual(command[command.index("--joy1") + 1], "keys")
            without = build_hatari_command(
                hatari_binary=Path("hatari"),
                tos=tos,
                disk_a=disk,
                machine_model="st",
                memsize_mib=1,
                parse_script=parse,
                fast_forward=True,
                statusbar=False,
            )
            self.assertNotIn("--joy0", without)
            self.assertNotIn("--joy1", without)


class StickBitmaskTests(unittest.TestCase):
    def test_maps_directions_to_ikbd_joystick_bits(self) -> None:
        self.assertEqual(resolve_stick_bitmask("up"), 0x01)
        self.assertEqual(resolve_stick_bitmask("down"), 0x02)
        self.assertEqual(resolve_stick_bitmask("left"), 0x04)
        self.assertEqual(resolve_stick_bitmask("right"), 0x08)
        self.assertEqual(resolve_stick_bitmask("fire"), 0x80)

    def test_softcopy_address_is_joystick_one(self) -> None:
        self.assertEqual(JOYSTICK1_SOFTCOPY, 0x79C2)

    def test_rejects_unknown_direction(self) -> None:
        with self.assertRaisesRegex(LabError, "direction"):
            resolve_stick_bitmask("diagonal")


class ScriptDecodeTests(unittest.TestCase):
    """The decode rests on operand widths read from the handler stubs."""

    def _bank(self, ops: bytes, *, at: int = 0x070100) -> bytes:
        data = bytearray(0x100000)
        data[at : at + len(ops)] = ops
        return bytes(data)

    def test_predicate_ops_carry_a_trailing_branch_target(self) -> None:
        # $07 if.wait: 2 operand bytes, then the epilogue's 2-byte target. This
        # is the shape that puts `return` at $072CDE in the delay subroutine.
        bank = self._bank(bytes.fromhex("0007 0032 2cd8 0005".replace(" ", "")))
        decode = decode_scripts(bank, start=0x070100, end=0x072D2E, entries=(0x070100,))
        wait = decode.ops[0x070100]
        self.assertEqual(wait.op.name, "if.wait")
        self.assertEqual(wait.size, 6)
        self.assertEqual(wait.target, 0x072CD8)
        self.assertEqual(decode.ops[0x070106].op.name, "return")

    def test_message_consumes_text_and_word_aligns(self) -> None:
        # "AB" + NUL is 3 bytes, so the op must round up to keep the PC even,
        # putting the next op at $070106 rather than $070105.
        bank = self._bank(b"\x00\x01AB\x00" + b"\x00" + b"\x00\x05")
        decode = decode_scripts(bank, start=0x070100, end=0x072D2E, entries=(0x070100,))
        message = decode.ops[0x070100]
        self.assertEqual(message.text, "AB")
        self.assertEqual(message.size, 6)
        self.assertEqual(decode.ops[0x070106].op.name, "return")

    def test_opcode_is_the_low_six_bits_and_flag_bits_are_kept(self) -> None:
        # The interpreter tests bit 6 and bit 7 of the fetched word (btst #6/#7
        # on d1) — $0040 and $0080, not the word's top bits. $00C3 is slot $03
        # with both set.
        bank = self._bank(bytes.fromhex("00c303fc"))
        decode = decode_scripts(bank, start=0x070100, end=0x072D2E, entries=(0x070100,))
        jump = decode.ops[0x070100]
        self.assertEqual(jump.opcode, 0x03)
        self.assertEqual(jump.word & 0x40, 0x40, "bit 6 selects call over jump")
        self.assertEqual(jump.word & 0x80, 0x80, "bit 7 negates")
        self.assertEqual(jump.target, 0x0703FC)

    def test_walk_stops_at_return_and_follows_calls(self) -> None:
        bank = bytearray(self._bank(bytes.fromhex("00040200 0005")))
        bank[0x070200:0x070202] = bytes.fromhex("0005")  # callee returns
        decode = decode_scripts(bytes(bank), start=0x070100, end=0x072D2E, entries=(0x070100,))
        self.assertIn(0x070200, decode.call_targets)
        self.assertIn(0x070200, decode.ops)

    def test_reads_two_separate_sixty_four_slot_tables(self) -> None:
        data = bytearray(0x100000)
        data[0x070000:0x070002] = bytes.fromhex("2d2e")  # string slot $00
        data[0x070080:0x070082] = bytes.fromhex("0110")  # script slot $00
        data[0x072D2E:0x072D35] = b"LOCKED\x00"
        self.assertEqual(read_script_table(bytes(data))[0], 0x070110)
        address, text = read_string_table(bytes(data))[0]
        self.assertEqual((address, text), (0x072D2E, "LOCKED"))


class DisassemblyExtractionTests(unittest.TestCase):
    LOG = "\n".join(
        [
            "command FIFO read error: Resource temporarily unavailable",
            "> d $51880-$51a80",
            "00051956 2078 781e                movea.l $0000781e.w [000703fc],a0",
            "0005195a 3018                     move.w (a0)+,d0",
            "> quit",
            "trailing noise",
        ]
    )

    def test_extracts_only_the_requested_listing(self) -> None:
        listing = extract_disassembly(self.LOG, start=0x51880, end=0x51A80)
        self.assertIn("movea.l $0000781e.w", listing)
        self.assertNotIn("FIFO", listing)
        self.assertNotIn("trailing noise", listing)

    def test_rejects_a_missing_listing(self) -> None:
        with self.assertRaisesRegex(LabError, "No disassembly"):
            extract_disassembly(self.LOG, start=0x60000, end=0x60010)


class ExportWindowTests(unittest.TestCase):
    """A Working Disassembly needs windows whose addresses and provenance are exact."""

    def _run(self, directory: str) -> Path:
        run = Path(directory)
        ram = bytes(range(256)) * (0x100000 // 256)
        (run / "obs.ram").write_bytes(ram)
        manifest = {
            "schemaVersion": 1,
            "runId": "observe-first-world-r1",
            "createdAt": "2026-08-21T00:00:00Z",
            "authority": {"logicalName": "wa", "programSha256": "a" * 64},
            "toolchain": {"hatariVersion": "2.6.1", "pythonVersion": "3.13.0"},
            "machine": {"model": "st", "memsizeMiB": 1, "tosSha256": "b" * 64},
            "scenario": {"name": "first-world", "sha256": "c" * 64},
            "checkpoint": {"name": "title-screen", "pc": 427394},
            "artifacts": [
                {
                    "role": "ram",
                    "path": "obs.ram",
                    "size": len(ram),
                    "sha256": hashlib.sha256(ram).hexdigest(),
                }
            ],
        }
        (run / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        return run

    def test_exports_a_named_window_at_its_base_address(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = self._run(directory)
            exports = export(run, windows=["script-vars"])
            window = exports["windows"][0]
            self.assertEqual(window["baseAddressHex"], "0x007000")
            self.assertEqual(window["length"], 0x1000)
            payload = (run / window["path"]).read_bytes()
            self.assertEqual(len(payload), 0x1000)
            # File offset must equal ST physical address, or every cited address is wrong.
            self.assertEqual(payload[0x81E], 0x81E % 256)

    def test_records_source_ram_and_scenario_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = self._run(directory)
            exports = export(run, ranges=["0x70000-0x74000"])
            self.assertEqual(exports["sourceRam"]["path"], "obs.ram")
            self.assertEqual(exports["scenario"]["name"], "first-world")
            self.assertEqual(exports["evidenceClass"], "working-authority-evidence")
            self.assertEqual(exports["windows"][0]["name"], "window-070000-074000")

    def test_keeps_the_manifest_self_verifying_across_repeat_exports(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = self._run(directory)
            export(run, windows=["script-bank"])
            export(run, windows=["script-bank"])
            manifest = json.loads((run / "manifest.json").read_text(encoding="utf-8"))
            windows = [a for a in manifest["artifacts"] if a["role"] == "export-window"]
            self.assertEqual(len(windows), 1)
            verify_run_artifacts(run, manifest)

    def test_prefers_the_post_scenario_image_over_the_title_checkpoint(self) -> None:
        # The script bank is zero-filled at title-screen, so defaulting to the
        # checkpoint image would export empty windows that look like evidence.
        with tempfile.TemporaryDirectory() as directory:
            run = self._run(directory)
            observed = bytes(0x100000)
            (run / "observed.ram").write_bytes(observed)
            manifest = json.loads((run / "manifest.json").read_text(encoding="utf-8"))
            manifest["artifacts"].append(
                {
                    "role": "observed-ram",
                    "path": "observed.ram",
                    "size": len(observed),
                    "sha256": hashlib.sha256(observed).hexdigest(),
                }
            )
            (run / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            exports = export(run, windows=["script-bank"])
            self.assertEqual(exports["sourceRam"]["role"], "observed-ram")

            forced = export(run, windows=["script-bank"], source_role="ram")
            self.assertEqual(forced["sourceRam"]["role"], "ram")

    def test_rejects_an_unknown_window_name(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = self._run(directory)
            with self.assertRaisesRegex(LabError, "Unknown export window"):
                export(run, windows=["not-a-window"])

    def test_rejects_an_empty_request(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = self._run(directory)
            with self.assertRaisesRegex(LabError, "at least one"):
                export(run)


class VersionTests(unittest.TestCase):
    def test_parses_hatari_version(self) -> None:
        self.assertEqual(parse_hatari_version("Hatari v2.6.1 - the Atari ST"), (2, 6, 1))


if __name__ == "__main__":
    unittest.main()


class WatchScenarioTests(unittest.TestCase):
    """A watch names the code that writes one word of live memory."""

    @staticmethod
    def _scenario(watch: dict) -> dict:
        return {
            'schemaVersion': 1,
            'name': 'watch',
            'checkpoint': 'title-screen',
            'actions': [
                {'type': 'capture', 'artifacts': ['ram']},
                {'type': 'watch', **watch},
            ],
        }

    def test_accepts_an_even_ram_word_with_a_provoking_walk(self):
        validate_scenario(self._scenario({
            'name': 'horizon-f0', 'address': '0x10b0', 'seconds': 8,
            'provoke': {'direction': 'up', 'vbls': 6000},
        }))

    def test_rejects_an_odd_or_out_of_range_address(self):
        for address in ('0x10b1', '0x100000'):
            with self.assertRaisesRegex(Exception, 'watch address'):
                validate_scenario(self._scenario({'name': 'w', 'address': address}))

    def test_rejects_a_bad_provoke_or_duration(self):
        with self.assertRaisesRegex(Exception, 'provoke direction'):
            validate_scenario(self._scenario({
                'name': 'w', 'address': '0x10b0', 'provoke': {'direction': 'sideways', 'vbls': 1},
            }))
        with self.assertRaisesRegex(Exception, 'watch seconds'):
            validate_scenario(self._scenario({'name': 'w', 'address': '0x10b0', 'seconds': 0}))

    def test_a_watch_must_be_the_last_action(self):
        scenario = self._scenario({'name': 'w', 'address': '0x10b0'})
        scenario['actions'].append({'type': 'wait_vbls', 'count': 10})
        with self.assertRaisesRegex(Exception, 'last action'):
            validate_scenario(scenario)

    def test_only_one_watch_per_scenario(self):
        scenario = self._scenario({'name': 'w', 'address': '0x10b0'})
        scenario['actions'].insert(1, {'type': 'watch', 'name': 'x', 'address': '0x10b4'})
        with self.assertRaisesRegex(Exception, 'at most one watch'):
            validate_scenario(scenario)
