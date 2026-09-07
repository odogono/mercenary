"""Capture complete lift journeys from the running Reference Build.

The probe restores a verified interactive snapshot, admits a journey by writing
the state produced by the guarded trigger, and then stops at the real PAL IRQ
boundary once per frame.  It retains the start, scene crossing, and completion
displays plus the per-frame camera, palette, split, and SID pitch state.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import socket
import subprocess
from pathlib import Path

from .core import LabError, require
from .monitor import MonitorClient, MonitorProtocolError

IRQ_LIFT_BOUNDARY = 0xBA54


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _capture_state(client: MonitorClient, ram_bank: int, cpu_bank: int, tick: int) -> dict[str, int]:
    state = client.memory(ram_bank, 0x75, 0xA8)
    sid = client.memory(cpu_bank, 0xD408, 0xD40B)
    return {
        "tick": tick,
        "altitudeLow": state[0],
        "altitudeMiddle": state[1],
        "altitudeHigh": state[2],
        "lineColour": state[0xA3 - 0x75],
        "backgroundColour": state[0xA5 - 0x75],
        "foregroundColour": state[0xA6 - 0x75],
        "underground": state[0xA8 - 0x75],
        "position": client.memory(ram_bank, 0xCB, 0xCB)[0],
        "stage": client.memory(ram_bank, 0xCC, 0xCC)[0],
        "pitchHigh": sid[0],
        "voice2Control": sid[3],
    }


def capture_lift_journeys(run: Path, output: Path) -> dict[str, object]:
    snapshot = run / "interactive.vsf"
    require(snapshot.is_file(), f"Lift probe requires {snapshot}")
    vice = shutil.which("x64sc")
    require(vice is not None, "Lift probe requires x64sc on PATH")
    output.mkdir(parents=True, exist_ok=False)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    command = [
        vice, "-default", "-model", "c64", "-seed", "12648430",
        "-initbreak", "ready", "-binarymonitor",
        "-binarymonitoraddress", f"ip4://127.0.0.1:{port}",
        "+sound", "-warp",
    ]
    process: subprocess.Popen[str] | None = None
    results: list[dict[str, object]] = []
    try:
        with (output / "vice.log").open("w", encoding="utf-8") as log:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, text=True)
            with MonitorClient.connect("127.0.0.1", port, timeout=15) as client:
                client.restore_snapshot(snapshot)
                banks = client.banks()
                ram_bank, cpu_bank = banks["ram"], banks["cpu"]
                routes = tuple((f"ordinary-{room}", room, 0) for room in range(1, 6)) + (
                    ("colony-craft", 8, 0xFF),
                )
                for route, room, colony in routes:
                    client.restore_snapshot(snapshot)
                    checkpoint = client.set_checkpoint(IRQ_LIFT_BOUNDARY, temporary=False)
                    require(
                        client.resume_until_checkpoint(checkpoint) == IRQ_LIFT_BOUNDARY,
                        "Lift probe did not reach its admission boundary",
                    )
                    # CURRENT_ROOM is assigned before the trigger initializes the
                    # down state. $FA distinguishes the Colony Craft return path.
                    client.set_memory(ram_bank, 0xCA, bytes([0x80, 0x83, 0x0D, room]))
                    client.set_memory(ram_bank, 0xA8, bytes([0]))
                    client.set_memory(ram_bank, 0xFA, bytes([colony]))
                    for direction in ("down", "up"):
                        if direction == "up":
                            client.set_memory(ram_bank, 0xCA, bytes([1, 0x42, 0]))
                            client.set_memory(ram_bank, 0xCD, bytes([room]))
                            client.set_memory(ram_bank, 0xFA, bytes([colony]))
                        # Reproduce LB93A's selector-$30 writes for voice 2.
                        client.set_memory(cpu_bank, 0xD40B, bytes([0]))
                        client.set_memory(cpu_bank, 0xD408, bytes([0]))
                        client.set_memory(cpu_bank, 0xD40C, bytes([0, 0x40]))
                        client.set_memory(cpu_bank, 0xD40B, bytes([0x41]))
                        samples: list[dict[str, int]] = [
                            _capture_state(client, ram_bank, cpu_bank, 0)
                        ]
                        displays: list[dict[str, object]] = []
                        display = client.display()
                        name = f"{route}-{direction}-000.display"
                        (output / name).write_bytes(display)
                        displays.append({
                            "path": name,
                            "sha256": hashlib.sha256(display).hexdigest(),
                            "tick": 0,
                        })
                        prior_scene: int | None = samples[0]["underground"]
                        for tick in range(1, 401):
                            stopped = client.resume_until_checkpoint(checkpoint)
                            require(stopped == IRQ_LIFT_BOUNDARY, "Lift probe missed its IRQ boundary")
                            state = _capture_state(client, ram_bank, cpu_bank, tick)
                            samples.append(state)
                            scene = state["underground"]
                            complete = client.memory(ram_bank, 0xCA, 0xCA)[0] == 0
                            if scene != prior_scene or complete:
                                display = client.display()
                                name = f"{route}-{direction}-{tick:03d}.display"
                                (output / name).write_bytes(display)
                                displays.append({
                                    "path": name,
                                    "sha256": hashlib.sha256(display).hexdigest(),
                                    "tick": tick,
                                })
                            prior_scene = scene
                            if complete:
                                break
                        require(samples[-1]["voice2Control"] == 0, "Lift completion did not stop voice 2")
                        results.append({
                            "route": route,
                            "room": room,
                            "direction": direction,
                            "ticks": samples[-1]["tick"],
                            "sceneCrossingTick": next(
                                sample["tick"] for sample in samples
                                if sample["underground"] == (1 if direction == "down" else 0)
                            ),
                            "samples": samples,
                            "displays": displays,
                        })
                    client.delete_checkpoint(checkpoint)
                client.quit()
            returncode = process.wait(timeout=10)
        require(returncode == 0, f"VICE lift probe failed; inspect {output / 'vice.log'}")
    except (OSError, KeyError, StopIteration, subprocess.TimeoutExpired, MonitorProtocolError) as error:
        raise LabError(f"Lift probe failed; incomplete capture retained at {output}: {error}") from error
    manifest = {
        "schemaVersion": 1,
        "mode": "reference-lift-journeys",
        "sourceSnapshot": str(snapshot),
        "sourceSnapshotSha256": hashlib.sha256(snapshot.read_bytes()).hexdigest(),
        "frameBoundary": IRQ_LIFT_BOUNDARY,
        "frameRate": 50,
        "journeys": results,
        "limitations": "State admission reproduces the guarded trigger writes; all subsequent timing, scene, display, palette, camera, and SID observations come from the running Reference main loop and raster IRQ.",
    }
    _write_json(output / "manifest.json", manifest)
    return {"status": "captured", "output": str(output), "journeys": len(results)}


__all__ = ["capture_lift_journeys"]
