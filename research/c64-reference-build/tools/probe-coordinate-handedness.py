#!/usr/bin/env python3
"""Exercise coordinate routines in an independently captured, unpacked RAM image.

Research only. Requires the optional py65==1.2.0 package. No machine code is
embedded here, and no reference routine is translated into implementation code.
"""

import argparse
import hashlib
import json
from pathlib import Path

from py65.devices.mpu6502 import MPU


def call(cpu, address):
    # An isolated subroutine invocation, returning to a sentinel outside the game.
    cpu.sp = 0xFD
    cpu.memory[0x1FE] = 0xFF
    cpu.memory[0x1FF] = 0x02
    cpu.pc = address
    for _ in range(100_000):
        cpu.step()
        if cpu.pc == 0x0300:
            return
    raise RuntimeError(f"Subroutine {address:04x} did not return; PC={cpu.pc:04x}")


def project(ram, heading, point, pitch=512, roll=0, yaw_only=False):
    cpu = MPU(memory=list(ram))
    for angle, base in [(heading, 0x3C), (pitch, 0x36), (roll, 0x2E)]:
        for address, destination in [(0x841F, base), (0x841E, base + 2)]:
            cpu.x, cpu.y = angle & 255, (angle >> 8) & 3
            call(cpu, address)
            cpu.memory[destination:destination + 2] = [cpu.x, cpu.y]
    # Select a craft for matrix setup; disable Flipped World and centre offset.
    for address in [0xA9, 0xF1, 0x8C, 0x8D]:
        cpu.memory[address] = 0
    call(cpu, 0xA320)
    for value, destination in zip(point, [0x52, 0x54, 0x56]):
        value &= 0xFFFFFF
        cpu.a, cpu.x = value >> 16, (value >> 8) & 255
        cpu.memory[7] = value & 255
        call(cpu, 0x8510)
        cpu.memory[destination:destination + 2] = [cpu.a, cpu.x]
    for address, value in [(0x19, 0), (0x21, 0x18), (0x8E, 80), (0x8F, 68)]:
        cpu.memory[address] = value
    call(cpu, 0xA979 if yaw_only else 0xA767)
    classification = cpu.memory[0x6E]
    return {
        "heading": heading,
        "pitch": pitch,
        "roll": roll,
        "point": point,
        "pipeline": "yawOnly" if yaw_only else "fullMatrix",
        "classification": classification,
        # Screen bytes can be stale for rejected points; do not report them.
        "screen": list(cpu.memory[0x6A:0x6C]) if classification == 0 else None,
        "rotatedFloatBytes": list(cpu.memory[0x58:0x5E]),
    }


def compass(ram, heading):
    cpu = MPU(memory=list(ram))
    cpu.memory[0x2C:0x2E] = [heading & 255, heading >> 8]
    for _ in range(600):
        call(cpu, 0xB809)
    pixels = [
        "".join(
            "#" if cpu.memory[0x7ED8 + column * 8 + row] & (128 >> bit) else " "
            for column in range(6)
            for bit in range(8)
        )
        for row in range(8)
    ]
    return {"heading": heading, "tapeState": list(cpu.memory[0xBE:0xC1]), "pixels": pixels}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ram", type=Path, required=True, help="64 KiB unpacked RAM capture")
    args = parser.parse_args()
    ram = args.ram.read_bytes()
    if len(ram) != 65536:
        parser.error("--ram must contain exactly 65536 bytes")
    cardinal_rays = [
        (0, (1000, 1000, -10000)),
        (256, (-10000, 1000, -1000)),
        (512, (-1000, 1000, 10000)),
        (768, (10000, 1000, 1000)),
    ]
    samples = []
    for heading, point in cardinal_rays:
        for yaw_only in [False, True]:
            samples.append(project(ram, heading, point, yaw_only=yaw_only))
            behind = (-point[0], point[1], -point[2])
            samples.append(project(ram, heading, behind, yaw_only=yaw_only))
    samples += [project(ram, 0, (1000, 0, -10000), roll=r) for r in [0, 64, 960]]
    samples += [project(ram, 0, (1000, 0, 10000), pitch=p) for p in [0, 512]]
    samples.append(project(ram, 0, (0, 10000, 1000), pitch=256))
    print(json.dumps({
        "ram": str(args.ram),
        "sha256": hashlib.sha256(ram).hexdigest(),
        "samples": samples,
        "compass": [compass(ram, h) for h in [0, 256, 512, 768]],
    }, indent=2))


if __name__ == "__main__":
    main()
