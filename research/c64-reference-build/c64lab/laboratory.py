from __future__ import annotations

import json
import re
import subprocess
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .core import (
    LabError,
    compare_reproducible_runs,
    file_hash,
    validate_prg,
    validate_run_manifest,
    validate_scenario,
    verify_run_artifacts,
)
from .monitor import MonitorClient, MonitorProtocolError
from .runtime import build_capture_command, parse_register_log, render_capture_script, render_checkpoint_script
from .toolchain import discover_toolchain


LAB_ROOT = Path(__file__).resolve().parents[1]
CONFIG_ROOT = LAB_ROOT / "config"
SCENARIO_ROOT = LAB_ROOT / "scenarios"
MONITOR_ROOT = LAB_ROOT / "monitor"
WORK_ROOT = LAB_ROOT / "work"


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LabError(f"Could not read JSON from {path}: {error}") from error
    if not isinstance(value, dict):
        raise LabError(f"Expected a JSON object in {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_configuration() -> tuple[dict[str, Any], dict[str, Any]]:
    return load_json(CONFIG_ROOT / "reference-build.json"), load_json(CONFIG_ROOT / "lab.json")


def parse_monitor_address(address: str) -> tuple[str, int]:
    match = re.fullmatch(r"ip4://([^:]+):(\d+)", address)
    if match is None:
        raise LabError(f"Unsupported binary monitor address: {address}")
    host, port_text = match.groups()
    if host != "127.0.0.1":
        raise LabError("VICE binary monitor must bind to IPv4 loopback 127.0.0.1")
    port = int(port_text)
    if not 1 <= port <= 65535:
        raise LabError(f"VICE binary monitor port is invalid: {port}")
    return host, port


def doctor(prg: Path) -> dict[str, Any]:
    reference, config = load_configuration()
    build = validate_prg(prg, reference)
    vice_binary, toolchain, features = discover_toolchain(config)
    return {
        "status": "ok",
        "build": {
            "logicalName": reference["logicalName"],
            "size": build["size"],
            "loadAddress": build["loadAddress"],
            "endAddress": build["endAddress"],
            "hashes": build["hashes"],
            "authority": reference["authority"],
        },
        "toolchain": toolchain.as_dict(),
        "viceBinary": str(vice_binary),
        "viceFeatures": features,
        "machine": {"model": config["machineModel"], "seed": config["seed"]},
    }


def _artifact(run_directory: Path, role: str, filename: str) -> dict[str, Any]:
    path = run_directory / filename
    if not path.is_file():
        raise LabError(f"VICE capture did not produce {filename}")
    return {
        "role": role,
        "path": filename,
        "size": path.stat().st_size,
        "sha256": file_hash(path),
    }


def _run_id(checkpoint: str) -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"{checkpoint}-{timestamp}-{uuid.uuid4().hex[:8]}"


def capture(prg: Path, checkpoint: str, *, run_id: str | None = None) -> tuple[Path, dict[str, Any]]:
    reference, config = load_configuration()
    build = validate_prg(prg, reference)
    checkpoint_config = config["checkpoints"].get(checkpoint)
    if checkpoint_config is None:
        raise LabError(f"Unknown checkpoint {checkpoint!r}")
    address = checkpoint_config.get("address")
    if address is None:
        raise LabError(
            f"Checkpoint {checkpoint!r} has not been established; complete and record the startup trace first"
        )

    vice_binary, toolchain, features = discover_toolchain(config)
    run_identifier = run_id or _run_id(checkpoint)
    run_directory = WORK_ROOT / run_identifier
    if run_directory.exists():
        raise LabError(f"Run directory already exists: {run_directory}")
    run_directory.mkdir(parents=True)

    (run_directory / "capture.mon").write_text(render_capture_script(checkpoint), encoding="utf-8")
    checkpoint_script = run_directory / "checkpoint.mon"
    checkpoint_script.write_text(
        render_checkpoint_script(address, prg, condition=checkpoint_config.get("condition")),
        encoding="utf-8",
    )
    (run_directory / "vice-features.txt").write_text(features, encoding="utf-8")

    command = build_capture_command(
        vice_binary=vice_binary,
        prg=prg,
        run_directory=run_directory,
        monitor_script=checkpoint_script,
        machine_model=config["machineModel"],
        seed=config["seed"],
        cycle_limit=config["cycleLimit"],
    )
    vice_log = run_directory / "vice.log"
    try:
        with vice_log.open("w", encoding="utf-8") as log:
            result = subprocess.run(
                command,
                check=False,
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=90,
            )
    except subprocess.TimeoutExpired as error:
        raise LabError(f"VICE exceeded the 90-second host timeout; incomplete run retained at {run_directory}") from error
    if result.returncode != 0:
        output = vice_log.read_text(encoding="utf-8", errors="replace")
        if "cycle limit reached" in output:
            raise LabError(
                f"VICE reached the configured cycle limit before checkpoint ${address:04X}; "
                f"incomplete run retained at {run_directory}"
            )
        raise LabError(f"VICE exited with status {result.returncode}; incomplete run retained at {run_directory}")

    monitor_log = run_directory / "monitor.log"
    registers = parse_register_log(monitor_log.read_text(encoding="utf-8", errors="replace"))
    if registers["PC"] != address:
        raise LabError(f"VICE stopped at ${registers['PC']:04X}, expected ${address:04X}")
    write_json(run_directory / "registers.json", registers)

    scenario_path = SCENARIO_ROOT / ("post-unpack.json" if checkpoint == "post-unpack" else "input-smoke.json")
    artifacts = [
        _artifact(run_directory, "ram", f"{checkpoint}.ram"),
        _artifact(run_directory, "cpu-memory", f"{checkpoint}.cpu"),
        _artifact(run_directory, "display", f"{checkpoint}.png"),
        _artifact(run_directory, "snapshot", f"{checkpoint}.vsf"),
        _artifact(run_directory, "registers", "registers.json"),
        _artifact(run_directory, "monitor-log", "monitor.log"),
        _artifact(run_directory, "vice-log", "vice.log"),
        _artifact(run_directory, "effective-config", "effective.vicerc"),
        _artifact(run_directory, "monitor-script", "checkpoint.mon"),
        _artifact(run_directory, "capture-script", "capture.mon"),
        _artifact(run_directory, "vice-features", "vice-features.txt"),
    ]
    manifest = {
        "schemaVersion": 1,
        "runId": run_identifier,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "build": {
            "logicalName": reference["logicalName"],
            "size": build["size"],
            "loadAddress": build["loadAddress"],
            "endAddress": build["endAddress"],
            "hashes": build["hashes"],
            "authority": reference["authority"],
        },
        "toolchain": toolchain.as_dict(),
        "machine": {
            "model": config["machineModel"],
            "seed": config["seed"],
            "cycleLimit": config["cycleLimit"],
            "configSha256": file_hash(run_directory / "effective.vicerc"),
        },
        "scenario": {
            "name": checkpoint,
            "sha256": file_hash(scenario_path),
        },
        "checkpoint": {
            "name": checkpoint,
            "address": address,
            "registers": registers,
        },
        "artifacts": artifacts,
    }
    validate_run_manifest(manifest)
    write_json(run_directory / "manifest.json", manifest)
    verify_run_artifacts(run_directory, manifest)
    return run_directory, manifest


def verify(run_directory: Path) -> dict[str, Any]:
    manifest = load_json(run_directory / "manifest.json")
    verify_run_artifacts(run_directory, manifest)
    return manifest


def reproduce(prg: Path) -> dict[str, Any]:
    first_directory, first = capture(prg, "post-unpack")
    second_directory, second = capture(prg, "post-unpack")
    compare_reproducible_runs(first, second)
    result = {
        "schemaVersion": 1,
        "status": "reproducible",
        "firstRun": first_directory.name,
        "secondRun": second_directory.name,
        "buildSha256": first["build"]["hashes"]["sha256"],
        "viceVersion": first["toolchain"]["viceVersion"],
        "checkpoint": first["checkpoint"],
        "evidence": {
            artifact["role"]: {"size": artifact["size"], "sha256": artifact["sha256"]}
            for artifact in first["artifacts"]
            if artifact["role"] in {"ram", "cpu-memory", "registers", "display"}
        },
    }
    write_json(WORK_ROOT / "latest-reproduction.json", result)
    return result


def observe(prg: Path, scenario_path: Path) -> tuple[Path, dict[str, Any]]:
    _, config = load_configuration()
    scenario = load_json(scenario_path)
    validate_scenario(scenario, config["cycleLimit"])
    if scenario["checkpoint"] != "interactive":
        raise LabError("Input observations must start from the interactive checkpoint")
    capture_actions = [action for action in scenario["actions"] if action["type"] == "capture"]
    if len(capture_actions) != 1:
        raise LabError("Observation scenarios must contain exactly one capture action")

    run_directory, manifest = capture(prg, "interactive", run_id=_run_id(f"observe-{scenario['name']}"))
    vice_binary, _, _ = discover_toolchain(config)
    snapshot_path = run_directory / "interactive.vsf"
    resume_script = run_directory / "resume.mon"
    resume_script.write_text(f'undump "{snapshot_path.resolve()}"\nx\n', encoding="utf-8")
    observed_config = run_directory / "observed.vicerc"
    observed_screenshot = run_directory / "observed.png"
    monitor_address = config["binaryMonitorAddress"]
    host, port = parse_monitor_address(monitor_address)
    command = [
        str(vice_binary),
        "-default",
        "-model",
        config["machineModel"],
        "-seed",
        str(config["seed"]),
        "+sound",
        "-limitcycles",
        str(config["cycleLimit"]),
        "-chdir",
        str(run_directory.resolve()),
        "-dumpconfig",
        str(observed_config.resolve()),
        "-exitscreenshot",
        str(observed_screenshot.resolve()),
        "-moncommands",
        str(resume_script.resolve()),
        "-binarymonitor",
        "-binarymonitoraddress",
        monitor_address,
    ]
    observe_log = run_directory / "vice-observe.log"
    current_pc: int | None = None
    final_registers: dict[str, int] | None = None
    generated_roles: list[tuple[str, str]] = []
    process: subprocess.Popen[str] | None = None
    try:
        with observe_log.open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                command,
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
            )
            with MonitorClient.connect(host, port, timeout=15) as client:
                for action in scenario["actions"]:
                    action_type = action["type"]
                    if action_type == "wait_pc":
                        client.set_execution_checkpoint(action["address"])
                        current_pc = client.resume_until_checkpoint()
                        if current_pc != action["address"]:
                            raise LabError(
                                f"VICE stopped at ${current_pc:04X}, expected ${action['address']:04X}"
                            )
                    elif action_type == "wait_instructions":
                        current_pc = client.advance_instructions(action["instructions"])
                    elif action_type == "key":
                        client.keyboard_feed(action["petscii"])
                    elif action_type == "joystick":
                        client.joyport_set(action["value"])
                        current_pc = client.advance_instructions(action["durationInstructions"])
                    elif action_type == "capture":
                        banks = client.banks()
                        if "ram" not in banks or "cpu" not in banks:
                            raise LabError("VICE did not expose both ram and cpu memory banks")
                        requested = set(action["artifacts"])
                        if "ram" in requested:
                            (run_directory / "observed.ram").write_bytes(client.memory(banks["ram"]))
                            generated_roles.append(("observed-ram", "observed.ram"))
                        if "cpu-memory" in requested:
                            (run_directory / "observed.cpu").write_bytes(client.memory(banks["cpu"]))
                            generated_roles.append(("observed-cpu-memory", "observed.cpu"))
                        final_registers = client.registers()
                        write_json(run_directory / "observed-registers.json", final_registers)
                        generated_roles.append(("observed-registers", "observed-registers.json"))
                        if "display" in requested:
                            (run_directory / "observed.display").write_bytes(client.display())
                            generated_roles.append(("observed-display", "observed.display"))
                        if "snapshot" in requested:
                            client.dump_snapshot(run_directory / "observed.vsf")
                            generated_roles.append(("observed-snapshot", "observed.vsf"))
                if final_registers is None:
                    final_registers = client.registers()
                    write_json(run_directory / "observed-registers.json", final_registers)
                    generated_roles.append(("observed-registers", "observed-registers.json"))
                client.quit()
            return_code = process.wait(timeout=20)
        if return_code != 0:
            raise LabError(f"VICE observation exited with status {return_code}")
    except (MonitorProtocolError, OSError, subprocess.TimeoutExpired) as error:
        raise LabError(f"VICE observation failed: {error}; incomplete run retained at {run_directory}") from error
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

    generated_roles.extend(
        [
            ("observation-screenshot", "observed.png"),
            ("observation-config", "observed.vicerc"),
            ("observation-monitor-script", "resume.mon"),
            ("observation-vice-log", "vice-observe.log"),
        ]
    )
    manifest["scenario"] = {
        "name": scenario["name"],
        "sha256": file_hash(scenario_path),
    }
    manifest["machine"]["configSha256"] = file_hash(observed_config)
    manifest["checkpoint"] = {
        "name": "interactive-after-input",
        "address": current_pc if current_pc is not None else final_registers.get("PC"),
        "registers": final_registers,
        "startAddress": config["checkpoints"]["interactive"]["address"],
    }
    manifest["artifacts"].extend(
        _artifact(run_directory, role, filename) for role, filename in generated_roles
    )
    validate_run_manifest(manifest)
    write_json(run_directory / "manifest.json", manifest)
    verify_run_artifacts(run_directory, manifest)
    return run_directory, manifest
