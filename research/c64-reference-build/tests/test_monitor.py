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
    joyport_set_body,
    keyboard_feed_body,
    memory_get_body,
    parse_response,
)


class MonitorProtocolTests(unittest.TestCase):
    def test_resume_accepts_a_stopped_event_that_precedes_the_ack(self) -> None:
        client = MonitorClient(MagicMock())
        client.request = MagicMock(
            return_value=(Response(0xAA, 0, 1, b""), [Response(0x62, 0, 0xFFFFFFFF, b"\x77\x84")])
        )
        client.wait_for_event = MagicMock()

        self.assertEqual(client.resume_until_checkpoint(), 0x8477)
        client.wait_for_event.assert_not_called()

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


if __name__ == "__main__":
    unittest.main()
