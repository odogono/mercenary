from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.monitor import (  # noqa: E402
    MonitorClient,
    MonitorProtocolError,
    Response,
    advance_instructions_body,
    checkpoint_set_body,
    command_frame,
    cpu_history_body,
    joyport_set_body,
    keyboard_feed_body,
    memory_get_body,
    memory_set_body,
    parse_response,
    resource_set_body,
)


class MonitorProtocolTests(unittest.TestCase):
    def test_resume_ignores_the_pre_ack_stop_and_waits_for_a_post_resume_stop(self) -> None:
        client = MonitorClient(MagicMock())
        client.request = MagicMock(
            return_value=(Response(0xAA, 0, 1, b""), [Response(0x62, 0, 0xFFFFFFFF, b"\x77\x84")])
        )
        client.wait_for_event = MagicMock(return_value=Response(0x63, 0, 0xFFFFFFFF, b"\x77\x84"))
        client.read_response = MagicMock(side_effect=[
            Response(0x11, 0, 0xFFFFFFFF, struct.pack("<IB", 7, 1) + b"checkpoint"),
            Response(0x31, 0, 0xFFFFFFFF, b"registers"),
            Response(0x62, 0, 0xFFFFFFFF, b"\x34\x12"),
        ])

        self.assertEqual(client.resume_until_checkpoint(7), 0x1234)
        client.wait_for_event.assert_called_once_with(0x63)

    def test_builds_an_api_v2_command_frame(self) -> None:
        frame = command_frame(0x1234DEAD, 0x12, b"\xe2\xfc\xe3\xfc\x01\x01\x04\x01")

        self.assertEqual(
            frame,
            bytes.fromhex("02 02 08 00 00 00 ad de 34 12 12 e2 fc e3 fc 01 01 04 01"),
        )

    def test_builds_an_explicit_bank_memory_request(self) -> None:
        self.assertEqual(
            memory_get_body(0x0000, 0xFFFF, bank_id=3),
            struct.pack("<BHHBH", 0, 0, 0xFFFF, 0, 3),
        )

    def test_builds_an_explicit_bank_memory_write(self) -> None:
        self.assertEqual(
            memory_set_body(0x1000, b"\xaa\xbb", bank_id=3),
            struct.pack("<BHHBH", 0, 0x1000, 0x1001, 0, 3) + b"\xaa\xbb",
        )

    def test_decodes_the_absolute_cpu_clock_from_history(self) -> None:
        client = MonitorClient(MagicMock())
        client._register_names = {3: "PC"}
        register_item = b"\x03\x03\x34\x12"
        history_item = struct.pack("<H", 1) + register_item + struct.pack("<Q", 0x0102030405060708) + b"\x02\xa9\x01"
        body = struct.pack("<I", 1) + bytes([len(history_item)]) + history_item
        client.request = MagicMock(return_value=(Response(0x86, 0, 1, body), []))

        self.assertEqual(cpu_history_body(1), struct.pack("<BI", 0, 1))
        self.assertEqual(
            client.cpu_history(1),
            [{"clock": 0x0102030405060708, "registers": {"PC": 0x1234}, "instructionHex": "a901"}],
        )

    def test_builds_a_string_resource_write_that_integer_resources_can_interpret(self) -> None:
        self.assertEqual(resource_set_body("Sound", "1"), b"\x00\x05Sound\x011")

    def test_parses_a_response_and_preserves_request_id(self) -> None:
        raw = bytes.fromhex("02 02 02 00 00 00 62 00 ff ff ff ff cf e5")

        response = parse_response(raw)

        self.assertEqual(response, Response(response_type=0x62, error_code=0, request_id=0xFFFFFFFF, body=b"\xcf\xe5"))

    def test_rejects_a_truncated_response(self) -> None:
        with self.assertRaisesRegex(MonitorProtocolError, "truncated"):
            parse_response(bytes.fromhex("02 02 04 00 00 00 62 00 ff ff ff ff 00"))

    def test_rejects_an_error_response(self) -> None:
        raw = bytes.fromhex("02 02 00 00 00 00 81 81 01 00 00 00")
        with self.assertRaisesRegex(MonitorProtocolError, "0x81"):
            parse_response(raw)

    def test_builds_checkpoint_and_input_command_bodies(self) -> None:
        self.assertEqual(
            checkpoint_set_body(0x8477),
            struct.pack("<HHBBBBB", 0x8477, 0x8477, 1, 1, 4, 1, 0),
        )
        self.assertEqual(keyboard_feed_body("Y\r"), b"\x02Y\r")
        self.assertEqual(joyport_set_body(2, 17), struct.pack("<HH", 1, 17))
        self.assertEqual(advance_instructions_body(20000), struct.pack("<BH", 0, 20000))

    def test_builds_load_store_and_execute_checkpoints(self) -> None:
        self.assertEqual(
            checkpoint_set_body(0x2000, operation="load", temporary=False),
            struct.pack("<HHBBBBB", 0x2000, 0x2000, 1, 1, 1, 0, 0),
        )
        self.assertEqual(
            checkpoint_set_body(0x3000, end_address=0x3001, operation="store"),
            struct.pack("<HHBBBBB", 0x3000, 0x3001, 1, 1, 2, 1, 0),
        )
        with self.assertRaisesRegex(ValueError, "operation"):
            checkpoint_set_body(0x1000, operation="invalid")

    def test_sets_a_generic_checkpoint_and_returns_its_number(self) -> None:
        client = MonitorClient(MagicMock())
        client.request = MagicMock(return_value=(Response(0x11, 0, 1, struct.pack("<I", 7)), []))

        self.assertEqual(client.set_checkpoint(0x2000, operation="load", temporary=False), 7)
        client.request.assert_called_once_with(
            0x12,
            checkpoint_set_body(0x2000, operation="load", temporary=False),
        )

    def test_clears_checkpoints_restored_from_a_snapshot(self) -> None:
        client = MonitorClient(MagicMock())
        client.request = MagicMock(side_effect=[
            (
                Response(0x14, 0, 1, struct.pack("<I", 2)),
                [
                    Response(0x11, 0, 0xFFFFFFFF, struct.pack("<I", 7)),
                    Response(0x11, 0, 0xFFFFFFFF, struct.pack("<I", 9)),
                ],
            ),
            (Response(0x13, 0, 2, b""), []),
            (Response(0x13, 0, 3, b""), []),
        ])

        self.assertEqual(client.clear_checkpoints(), [7, 9])
        self.assertEqual(
            client.request.call_args_list,
            [
                unittest.mock.call(0x14),
                unittest.mock.call(0x13, struct.pack("<I", 7)),
                unittest.mock.call(0x13, struct.pack("<I", 9)),
            ],
        )

    def test_joyport_uses_the_io_simulator_and_translates_pressed_bits(self) -> None:
        client = MonitorClient(MagicMock())
        client.request = MagicMock(return_value=(Response(0x52, 0, 1, b""), []))

        client.configure_joyport_simulation()
        client.joyport_set(0x11)
        client.joyport_set(0)

        self.assertEqual(
            client.request.call_args_list,
            [
                unittest.mock.call(0x52, resource_set_body("JoyPort2Device", "37")),
                unittest.mock.call(0xA2, joyport_set_body(2, 0x0E)),
                unittest.mock.call(0xA2, joyport_set_body(2, 0x1F)),
            ],
        )

    def test_joyport_rejects_bits_outside_the_five_c64_lines(self) -> None:
        client = MonitorClient(MagicMock())
        with self.assertRaisesRegex(ValueError, "five-bit"):
            client.joyport_set(0x20)


if __name__ == "__main__":
    unittest.main()
