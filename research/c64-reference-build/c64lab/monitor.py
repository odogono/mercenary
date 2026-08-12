from __future__ import annotations

import struct
import socket
import time
from dataclasses import dataclass
from pathlib import Path


class MonitorProtocolError(RuntimeError):
    """Malformed or unsuccessful VICE binary monitor exchange."""


@dataclass(frozen=True)
class Response:
    response_type: int
    error_code: int
    request_id: int
    body: bytes


def command_frame(request_id: int, command_type: int, body: bytes = b"") -> bytes:
    if not 0 <= request_id <= 0xFFFFFFFF:
        raise ValueError("request_id must fit in 32 bits")
    if not 0 <= command_type <= 0xFF:
        raise ValueError("command_type must fit in one byte")
    return struct.pack("<BBIIB", 0x02, 0x02, len(body), request_id, command_type) + body


def memory_get_body(start: int, end: int, bank_id: int, *, side_effects: bool = False) -> bytes:
    if not 0 <= start <= end <= 0xFFFF:
        raise ValueError("memory range must fit in 16 bits and start before end")
    if not 0 <= bank_id <= 0xFFFF:
        raise ValueError("bank_id must fit in 16 bits")
    return struct.pack("<BHHBH", int(side_effects), start, end, 0, bank_id)


def memory_set_body(start: int, data: bytes, bank_id: int, *, side_effects: bool = False) -> bytes:
    if not data:
        raise ValueError("memory write cannot be empty")
    end = start + len(data) - 1
    if not 0 <= start <= end <= 0xFFFF:
        raise ValueError("memory write range must fit in 16 bits")
    if not 0 <= bank_id <= 0xFFFF:
        raise ValueError("bank_id must fit in 16 bits")
    return struct.pack("<BHHBH", int(side_effects), start, end, 0, bank_id) + data


def checkpoint_set_body(
    address: int,
    *,
    end_address: int | None = None,
    operation: str = "execute",
    temporary: bool = True,
) -> bytes:
    end = address if end_address is None else end_address
    if not 0 <= address <= end <= 0xFFFF:
        raise ValueError("checkpoint range must fit in 16 bits and start before end")
    operation_flags = {"load": 1, "store": 2, "execute": 4}
    if operation not in operation_flags:
        raise ValueError("checkpoint operation must be load, store, or execute")
    return struct.pack("<HHBBBBB", address, end, 1, 1, operation_flags[operation], int(temporary), 0)


def keyboard_feed_body(text: str) -> bytes:
    try:
        encoded = text.encode("latin-1")
    except UnicodeEncodeError as error:
        raise ValueError("keyboard input must be representable as PETSCII-compatible bytes") from error
    if len(encoded) > 255:
        raise ValueError("keyboard input cannot exceed 255 bytes")
    return bytes([len(encoded)]) + encoded


def joyport_set_body(port: int, value: int) -> bytes:
    if port != 2:
        raise ValueError("the Reference Build uses joystick port 2")
    if not 0 <= value <= 31:
        raise ValueError("joystick value must be 0..31")
    # The scenario uses the C64's user-facing port number. VICE's binary
    # monitor addresses the two control ports with zero-based indices.
    return struct.pack("<HH", port - 1, value)


def advance_instructions_body(count: int) -> bytes:
    if not 1 <= count <= 0xFFFF:
        raise ValueError("instruction count must be 1..65535")
    return struct.pack("<BH", 0, count)


def resource_set_body(name: str, value: str) -> bytes:
    encoded_name = name.encode("ascii")
    encoded_value = value.encode("utf-8")
    if not encoded_name or len(encoded_name) > 255:
        raise ValueError("resource name must contain 1..255 ASCII bytes")
    if len(encoded_value) > 255:
        raise ValueError("resource value cannot exceed 255 bytes")
    # Send a string resource. VICE documents that string values are interpreted
    # when the destination resource is an integer.
    return b"\x00" + bytes([len(encoded_name)]) + encoded_name + bytes([len(encoded_value)]) + encoded_value


def parse_response(raw: bytes) -> Response:
    if len(raw) < 12:
        raise MonitorProtocolError("truncated VICE monitor response header")
    stx, api_version, body_length, response_type, error_code, request_id = struct.unpack("<BBIBBI", raw[:12])
    if stx != 0x02:
        raise MonitorProtocolError(f"invalid VICE monitor STX 0x{stx:02x}")
    if api_version != 0x02:
        raise MonitorProtocolError(f"unsupported VICE monitor API 0x{api_version:02x}")
    expected_length = 12 + body_length
    if len(raw) < expected_length:
        raise MonitorProtocolError(
            f"truncated VICE monitor response: expected {expected_length} bytes, got {len(raw)}"
        )
    if len(raw) > expected_length:
        raise MonitorProtocolError(
            f"VICE monitor response contains trailing bytes: expected {expected_length}, got {len(raw)}"
        )
    if error_code != 0:
        raise MonitorProtocolError(
            f"VICE monitor returned error 0x{error_code:02x} for response 0x{response_type:02x}"
        )
    return Response(response_type, error_code, request_id, raw[12:])


def _sized_items(body: bytes) -> list[bytes]:
    if len(body) < 2:
        raise MonitorProtocolError("truncated VICE monitor item array")
    count = struct.unpack_from("<H", body, 0)[0]
    position = 2
    items: list[bytes] = []
    for _ in range(count):
        if position >= len(body):
            raise MonitorProtocolError("truncated VICE monitor array item")
        size = body[position]
        end = position + 1 + size
        if end > len(body):
            raise MonitorProtocolError("truncated VICE monitor array item body")
        items.append(body[position + 1 : end])
        position = end
    return items


class MonitorClient:
    """Small synchronous client for VICE binary monitor API v2."""

    def __init__(self, connection: socket.socket):
        self.connection = connection
        self.next_request_id = 1
        self._register_names: dict[int, str] | None = None

    @classmethod
    def connect(cls, host: str, port: int, *, timeout: float = 10.0) -> "MonitorClient":
        deadline = time.monotonic() + timeout
        last_error: OSError | None = None
        while time.monotonic() < deadline:
            try:
                connection = socket.create_connection((host, port), timeout=2)
                connection.settimeout(timeout)
                return cls(connection)
            except OSError as error:
                last_error = error
                time.sleep(0.05)
        raise MonitorProtocolError(f"could not connect to VICE binary monitor at {host}:{port}: {last_error}")

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "MonitorClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _read_exact(self, count: int) -> bytes:
        chunks = bytearray()
        try:
            while len(chunks) < count:
                chunk = self.connection.recv(count - len(chunks))
                if not chunk:
                    raise MonitorProtocolError("VICE binary monitor closed the connection")
                chunks.extend(chunk)
        except socket.timeout as error:
            raise MonitorProtocolError("timed out waiting for VICE binary monitor") from error
        return bytes(chunks)

    def read_response(self) -> Response:
        header = self._read_exact(12)
        body_length = struct.unpack_from("<I", header, 2)[0]
        return parse_response(header + self._read_exact(body_length))

    def request(self, command_type: int, body: bytes = b"") -> tuple[Response, list[Response]]:
        request_id = self.next_request_id
        self.next_request_id += 1
        self.connection.sendall(command_frame(request_id, command_type, body))
        events: list[Response] = []
        while True:
            try:
                response = self.read_response()
            except MonitorProtocolError as error:
                raise MonitorProtocolError(
                    f"command 0x{command_type:02x}, request {request_id}: {error}"
                ) from error
            if response.request_id == request_id:
                return response, events
            events.append(response)

    def wait_for_event(self, response_type: int) -> Response:
        while True:
            response = self.read_response()
            if response.request_id == 0xFFFFFFFF and response.response_type == response_type:
                return response

    def set_checkpoint(
        self,
        address: int,
        *,
        end_address: int | None = None,
        operation: str = "execute",
        temporary: bool = True,
    ) -> int:
        response, _ = self.request(
            0x12,
            checkpoint_set_body(
                address,
                end_address=end_address,
                operation=operation,
                temporary=temporary,
            ),
        )
        if response.response_type != 0x11 or len(response.body) < 4:
            raise MonitorProtocolError("VICE did not return checkpoint information")
        return struct.unpack_from("<I", response.body, 0)[0]

    def set_execution_checkpoint(self, address: int) -> int:
        return self.set_checkpoint(address)

    def clear_checkpoints(self) -> list[int]:
        response, events = self.request(0x14)
        if response.response_type != 0x14 or len(response.body) != 4:
            raise MonitorProtocolError("VICE returned an invalid checkpoint list")
        expected_count = struct.unpack("<I", response.body)[0]
        checkpoint_numbers = [
            struct.unpack_from("<I", event.body, 0)[0]
            for event in events
            if event.response_type == 0x11 and len(event.body) >= 4
        ]
        if len(checkpoint_numbers) != expected_count:
            raise MonitorProtocolError("VICE checkpoint list count did not match its records")
        for checkpoint_number in checkpoint_numbers:
            deleted, _ = self.request(0x13, struct.pack("<I", checkpoint_number))
            if deleted.response_type != 0x13 or deleted.body:
                raise MonitorProtocolError("VICE returned an invalid checkpoint-delete response")
        return checkpoint_numbers

    def resume_until_checkpoint(self, checkpoint_number: int) -> int:
        self.request(0xAA)
        self.wait_for_event(0x63)
        matched_checkpoint = False
        while True:
            event = self.read_response()
            if event.request_id != 0xFFFFFFFF:
                continue
            if event.response_type == 0x11 and len(event.body) >= 5:
                event_checkpoint = struct.unpack_from("<I", event.body, 0)[0]
                matched_checkpoint = event.body[4] != 0 and event_checkpoint == checkpoint_number
            elif matched_checkpoint and event.response_type == 0x62:
                if len(event.body) != 2:
                    raise MonitorProtocolError("VICE stopped event has an invalid PC")
                return struct.unpack("<H", event.body)[0]

    def advance_instructions(self, count: int) -> int:
        _, events = self.request(0x71, advance_instructions_body(count))
        for event in events:
            if event.response_type == 0x62 and len(event.body) == 2:
                return struct.unpack("<H", event.body)[0]
        stopped = self.wait_for_event(0x62)
        return struct.unpack("<H", stopped.body)[0]

    def keyboard_feed(self, text: str) -> None:
        self.request(0x72, keyboard_feed_body(text))

    def configure_joyport_simulation(self) -> None:
        # Binary-monitor joyport writes address VICE's I/O Simulation device,
        # not the ordinary host joystick device. JOYPORT_ID_IO_SIMULATION is
        # 37 in the pinned VICE 3.10 device enumeration.
        self.set_resource("JoyPort2Device", "37")

    def joyport_set(self, value: int) -> None:
        if not 0 <= value <= 0x1F:
            raise ValueError("joystick value must be a five-bit pressed-line mask")
        # Trace values use the familiar pressed-bit convention. The I/O
        # Simulation device exposes the electrical lines directly, which are
        # active-low on a C64 joystick port.
        self.request(0xA2, joyport_set_body(2, value ^ 0x1F))

    def banks(self) -> dict[str, int]:
        response, _ = self.request(0x82)
        banks: dict[str, int] = {}
        for item in _sized_items(response.body):
            if len(item) < 3:
                raise MonitorProtocolError("invalid VICE bank item")
            bank_id = struct.unpack_from("<H", item, 0)[0]
            name_length = item[2]
            name = item[3 : 3 + name_length].decode("ascii")
            banks[name] = bank_id
        return banks

    def _get_register_names(self) -> dict[int, str]:
        if self._register_names is None:
            response, _ = self.request(0x83, b"\x00")
            names: dict[int, str] = {}
            for item in _sized_items(response.body):
                if len(item) < 3:
                    raise MonitorProtocolError("invalid VICE register descriptor")
                name_length = item[2]
                names[item[0]] = item[3 : 3 + name_length].decode("ascii")
            self._register_names = names
        return self._register_names

    def registers(self) -> dict[str, int]:
        names = self._get_register_names()
        response, _ = self.request(0x31, b"\x00")
        registers: dict[str, int] = {}
        for item in _sized_items(response.body):
            if len(item) != 3:
                raise MonitorProtocolError("invalid VICE register value")
            registers[names.get(item[0], f"register-{item[0]}")] = struct.unpack_from("<H", item, 1)[0]
        return registers

    def memory(self, bank_id: int, start: int = 0, end: int = 0xFFFF) -> bytes:
        response, _ = self.request(0x01, memory_get_body(start, end, bank_id))
        if len(response.body) < 2:
            raise MonitorProtocolError("truncated VICE memory response")
        encoded_length = struct.unpack_from("<H", response.body, 0)[0]
        expected_length = end - start + 1
        actual_length = 0x10000 if encoded_length == 0 else encoded_length
        data = response.body[2:]
        if actual_length != expected_length or len(data) != expected_length:
            raise MonitorProtocolError(
                f"VICE returned {len(data)} memory bytes, expected {expected_length}"
            )
        return data

    def set_memory(self, bank_id: int, start: int, data: bytes) -> None:
        response, _ = self.request(0x02, memory_set_body(start, data, bank_id))
        if response.response_type != 0x02 or response.body:
            raise MonitorProtocolError("VICE returned an invalid memory-set response")

    def set_resource(self, name: str, value: str) -> None:
        response, _ = self.request(0x52, resource_set_body(name, value))
        if response.response_type != 0x52 or response.body:
            raise MonitorProtocolError(f"VICE returned an invalid resource-set response for {name}")

    def display(self) -> bytes:
        response, _ = self.request(0x84, b"\x01\x00")
        return response.body

    def dump_snapshot(self, path: Path) -> None:
        encoded = str(path.resolve()).encode("utf-8")
        if len(encoded) > 255:
            raise MonitorProtocolError("snapshot path exceeds the VICE protocol limit")
        self.request(0x41, b"\x00\x00" + bytes([len(encoded)]) + encoded)

    def restore_snapshot(self, path: Path) -> int:
        encoded = str(path.resolve()).encode("utf-8")
        if len(encoded) > 255:
            raise MonitorProtocolError("snapshot path exceeds the VICE protocol limit")
        response, _ = self.request(0x42, bytes([len(encoded)]) + encoded)
        if response.response_type != 0x42 or len(response.body) != 2:
            raise MonitorProtocolError("VICE returned an invalid snapshot-restore response")
        return struct.unpack("<H", response.body)[0]

    def quit(self) -> None:
        self.request(0xBB)
