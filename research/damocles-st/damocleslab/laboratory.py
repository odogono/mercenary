from __future__ import annotations

import json
import os
import subprocess
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .core import (
    LabError,
    compare_reproducible_runs,
    file_hash,
    extract_stable_ram,
    parse_ram_ranges,
    parse_register_log,
    stable_registers,
    validate_image,
    validate_run_manifest,
    validate_scenario,
    verify_run_artifacts,
)
from .runtime import (
    build_hatari_command,
    headless_env,
    render_dump_script,
    render_title_capture_script,
    render_vbl_wait_script,
)
from .toolchain import discover_toolchain

LAB_ROOT = Path(__file__).resolve().parents[1]
CONFIG_ROOT = LAB_ROOT / "config"
SCENARIO_ROOT = LAB_ROOT / "scenarios"
WORK_ROOT = LAB_ROOT / "work"
REPO_ROOT = LAB_ROOT.parents[1]


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
    return load_json(CONFIG_ROOT / "working-authority.json"), load_json(CONFIG_ROOT / "lab.json")


def resolve_roms_root(roms_root: Path | None) -> Path:
    root = (roms_root or (REPO_ROOT / "roms")).resolve()
    if not root.exists():
        raise LabError(f"roms root does not exist: {root}")
    return root


def resolve_images(authority: dict[str, Any], roms_root: Path) -> tuple[Path, Path]:
    program = roms_root / authority["programImage"]["relativePath"]
    tos = roms_root / authority["tosImage"]["relativePath"]
    return program, tos


def doctor(*, roms_root: Path | None = None) -> dict[str, Any]:
    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    program = validate_image(program_path, authority["programImage"], label="Working Authority STX")
    tos = validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    return {
        "status": "ok",
        "authority": {
            "logicalName": authority["logicalName"],
            "program": program,
            "tos": tos,
            "authority": authority["authority"],
            "qualification": authority["qualification"],
        },
        "toolchain": toolchain.as_dict(),
        "hatariBinary": str(hatari_binary),
        "machine": {
            "model": config["machineModel"],
            "memsizeMiB": config["memsizeMiB"],
        },
    }


def _artifact(run_directory: Path, role: str, filename: str) -> dict[str, Any]:
    path = run_directory / filename
    if not path.is_file():
        raise LabError(f"Hatari capture did not produce {filename}")
    return {
        "role": role,
        "path": filename,
        "size": path.stat().st_size,
        "sha256": file_hash(path),
    }


def _run_id(checkpoint: str) -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"{checkpoint}-{timestamp}-{uuid.uuid4().hex[:8]}"


def _run_hatari(command: list[str], log_path: Path, timeout: int) -> None:
    env = os.environ.copy()
    env.update(headless_env())
    try:
        with log_path.open("w", encoding="utf-8") as log:
            result = subprocess.run(
                command,
                check=False,
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=timeout,
                env=env,
            )
    except subprocess.TimeoutExpired as error:
        raise LabError(f"Hatari exceeded the {timeout}-second host timeout; see {log_path}") from error
    if result.returncode != 0:
        output = log_path.read_text(encoding="utf-8", errors="replace")
        raise LabError(
            f"Hatari exited with status {result.returncode}; incomplete log retained at {log_path}\n"
            f"{output[-2000:]}"
        )


def capture(
    *,
    checkpoint: str = "title-screen",
    roms_root: Path | None = None,
    run_id: str | None = None,
) -> tuple[Path, dict[str, Any]]:
    authority, config = load_configuration()
    checkpoint_config = config["checkpoints"].get(checkpoint)
    if checkpoint_config is None:
        raise LabError(f"Unknown checkpoint {checkpoint!r}")
    pc = checkpoint_config.get("pc")
    if not isinstance(pc, int):
        raise LabError(f"Checkpoint {checkpoint!r} is missing an integer pc")

    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    program = validate_image(program_path, authority["programImage"], label="Working Authority STX")
    tos = validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)

    run_identifier = run_id or _run_id(checkpoint)
    run_directory = WORK_ROOT / run_identifier
    if run_directory.exists():
        raise LabError(f"Run directory already exists: {run_directory}")
    run_directory.mkdir(parents=True)

    prefix = checkpoint
    dump_script = run_directory / "dump.txt"
    wait_script = run_directory / "wait-vbl.txt"
    parse_script = run_directory / "capture.txt"
    extra_vbls = int(checkpoint_config.get("extraVbls", 1400))
    dump_script.write_text(render_dump_script(run_directory=run_directory, prefix=prefix), encoding="utf-8")
    wait_script.write_text(render_vbl_wait_script(dump_script=dump_script, extra_vbls=extra_vbls), encoding="utf-8")
    parse_script.write_text(render_title_capture_script(next_script=wait_script, pc=pc), encoding="utf-8")

    command = build_hatari_command(
        hatari_binary=hatari_binary,
        tos=tos_path,
        disk_a=program_path,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse_script,
        fast_forward=bool(config.get("fastForward", True)),
        statusbar=bool(config.get("statusbar", False)),
    )
    hatari_log = run_directory / "hatari.log"
    _run_hatari(command, hatari_log, int(config.get("hostTimeoutSeconds", 120)))

    register_log = run_directory / f"{prefix}.registers.log"
    if not register_log.is_file():
        # Hatari may have printed registers only into hatari.log when logfile failed.
        combined = hatari_log.read_text(encoding="utf-8", errors="replace")
        register_log.write_text(combined, encoding="utf-8")
    registers = parse_register_log(register_log.read_text(encoding="utf-8", errors="replace"))
    if (registers["PC"] & ~0x1FF) != (pc & ~0x1FF):
        raise LabError(f"Hatari stopped at ${registers['PC']:06X}, expected title loop near ${pc:06X}")

    ram_path = run_directory / f"{prefix}.ram"
    if not ram_path.is_file():
        raise LabError(f"Missing RAM dump {ram_path.name}")
    stable_ranges = parse_ram_ranges(
        checkpoint_config.get("stableRamRanges", []),
        label="stableRamRanges",
    )
    normalized = extract_stable_ram(ram_path.read_bytes(), stable_ranges)
    normalized_path = run_directory / f"{prefix}.normalized.ram"
    normalized_path.write_bytes(normalized)
    stable = stable_registers(registers)
    write_json(run_directory / "registers.json", registers)
    write_json(run_directory / "registers-stable.json", stable)

    scenario_path = SCENARIO_ROOT / "title-smoke.json"
    artifacts = [
        _artifact(run_directory, "ram", f"{prefix}.ram"),
        _artifact(run_directory, "normalized-ram", f"{prefix}.normalized.ram"),
        _artifact(run_directory, "display", f"{prefix}.png"),
        _artifact(run_directory, "registers", "registers.json"),
        _artifact(run_directory, "registers-stable", "registers-stable.json"),
        _artifact(run_directory, "register-log", f"{prefix}.registers.log"),
        _artifact(run_directory, "hatari-log", "hatari.log"),
        _artifact(run_directory, "parse-script", "capture.txt"),
        _artifact(run_directory, "wait-script", "wait-vbl.txt"),
        _artifact(run_directory, "dump-script", "dump.txt"),
    ]
    manifest = {
        "schemaVersion": 1,
        "runId": run_identifier,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "authority": {
            "logicalName": authority["logicalName"],
            "programSha256": program["hashes"]["sha256"],
            "tosSha256": tos["hashes"]["sha256"],
            "authority": authority["authority"],
        },
        "toolchain": toolchain.as_dict(),
        "machine": {
            "model": config["machineModel"],
            "memsizeMiB": config["memsizeMiB"],
            "tosSha256": tos["hashes"]["sha256"],
            "stableRamRanges": checkpoint_config.get("stableRamRanges", []),
            "extraVbls": extra_vbls,
        },
        "scenario": {
            "name": checkpoint,
            "sha256": file_hash(scenario_path) if scenario_path.is_file() else None,
        },
        "checkpoint": {
            "name": checkpoint,
            "pc": pc,
            "registers": registers,
            "stableRegisters": stable,
        },
        "artifacts": artifacts,
        "evidenceClass": "working-authority-evidence",
    }
    validate_run_manifest(manifest)
    write_json(run_directory / "manifest.json", manifest)
    verify_run_artifacts(run_directory, manifest)
    return run_directory, manifest


def verify(run_directory: Path) -> dict[str, Any]:
    manifest = load_json(run_directory / "manifest.json")
    verify_run_artifacts(run_directory, manifest)
    return manifest


def reproduce(*, roms_root: Path | None = None) -> dict[str, Any]:
    first_directory, first = capture(checkpoint="title-screen", roms_root=roms_root)
    second_directory, second = capture(checkpoint="title-screen", roms_root=roms_root)
    compare_reproducible_runs(first, second)
    result = {
        "schemaVersion": 1,
        "status": "reproducible",
        "firstRun": first_directory.name,
        "secondRun": second_directory.name,
        "programSha256": first["authority"]["programSha256"],
        "hatariVersion": first["toolchain"]["hatariVersion"],
        "checkpoint": {
            "name": first["checkpoint"]["name"],
            "pc": first["checkpoint"]["pc"],
        },
        "evidence": {
            artifact["role"]: {"size": artifact["size"], "sha256": artifact["sha256"]}
            for artifact in first["artifacts"]
            if artifact["role"] in {"normalized-ram", "registers-stable", "display"}
        },
        "evidenceClass": "working-authority-evidence",
    }
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    write_json(WORK_ROOT / "latest-reproduction.json", result)
    return result


def _fifo_send(handle, lines: list[str]) -> None:
    for line in lines:
        handle.write(line + "\n")
        handle.flush()


def observe(
    scenario_path: Path,
    *,
    roms_root: Path | None = None,
) -> tuple[Path, dict[str, Any]]:
    authority, config = load_configuration()
    scenario = load_json(scenario_path)
    validate_scenario(scenario)
    if scenario["checkpoint"] != "title-screen":
        raise LabError("Observations must start from the title-screen checkpoint")

    # Establish the title-screen baseline first (self-verifying capture).
    run_directory, manifest = capture(
        checkpoint="title-screen",
        roms_root=roms_root,
        run_id=_run_id(f"observe-{scenario['name']}"),
    )

    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    hatari_binary, _ = discover_toolchain(config)
    pc = config["checkpoints"]["title-screen"]["pc"]

    fifo = run_directory / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()
    ready_log = run_directory / "observe-title.log"
    if ready_log.exists():
        ready_log.unlink()

    on_title = run_directory / "observe-on-title.txt"
    parse_script = run_directory / "observe-boot.txt"
    on_title.write_text(
        f"logfile {ready_log.resolve()}\nr\nc\n",
        encoding="utf-8",
    )
    extra_vbls = int(config["checkpoints"]["title-screen"].get("extraVbls", 1400))
    wait_script = run_directory / "observe-wait-vbl.txt"
    wait_script.write_text(render_vbl_wait_script(dump_script=on_title, extra_vbls=extra_vbls), encoding="utf-8")
    parse_script.write_text(render_title_capture_script(next_script=wait_script, pc=pc), encoding="utf-8")

    command = build_hatari_command(
        hatari_binary=hatari_binary,
        tos=tos_path,
        disk_a=program_path,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse_script,
        fast_forward=bool(config.get("fastForward", True)),
        statusbar=bool(config.get("statusbar", False)),
        cmd_fifo=fifo,
    )
    env = os.environ.copy()
    env.update(headless_env())
    observe_log = run_directory / "hatari-observe.log"
    process: subprocess.Popen[str] | None = None
    try:
        with observe_log.open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                command,
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
                env=env,
            )
            deadline = time.time() + int(config.get("hostTimeoutSeconds", 120))
            while time.time() < deadline:
                if ready_log.is_file() and ready_log.stat().st_size > 0:
                    break
                if process.poll() is not None:
                    raise LabError(f"Hatari exited before title-screen during observe; see {observe_log}")
                time.sleep(0.05)
            else:
                raise LabError(f"Timed out waiting for title-screen during observe; see {observe_log}")

            for _ in range(50):
                if fifo.exists():
                    break
                time.sleep(0.05)
            if not fifo.exists():
                raise LabError(f"Hatari did not create command FIFO {fifo}")

            observe_dump = run_directory / "observe-dump.txt"
            capture_actions = [action for action in scenario["actions"] if action["type"] == "capture"]
            observe_dump.write_text(
                "\n".join(
                    render_dump_script(
                        run_directory=run_directory,
                        prefix=str(action.get("prefix", "observed")),
                    ).rstrip("\n")
                    for action in capture_actions
                )
                + "\n",
                encoding="utf-8",
            )
            with fifo.open("w", encoding="utf-8") as fifo_handle:
                for action in scenario["actions"]:
                    action_type = action["type"]
                    if action_type == "wait_vbls":
                        time.sleep(max(0.05, action["count"] / 2000.0))
                    elif action_type == "keypress":
                        _fifo_send(fifo_handle, [f"hatari-event keypress {action['key']}"])
                        time.sleep(0.1)
                    elif action_type == "capture":
                        prefix = str(action.get("prefix", "observed"))
                        is_final = action is capture_actions[-1]
                        dump_parent = run_directory.resolve()
                        commands = [
                            "hatari-stop",
                            f"hatari-debug logfile {dump_parent}/{prefix}.registers.log",
                            "hatari-debug r",
                            f"hatari-debug savebin {dump_parent}/{prefix}.ram 0 $100000",
                            f"hatari-debug screenshot {dump_parent}/{prefix}.png",
                        ]
                        commands.append("hatari-debug quit" if is_final else "hatari-cont")
                        _fifo_send(fifo_handle, commands)
                        artifact_deadline = time.time() + 15
                        while time.time() < artifact_deadline:
                            if (run_directory / f"{prefix}.ram").is_file() or (
                                run_directory / f"{prefix}.png"
                            ).is_file():
                                break
                            if process.poll() is not None:
                                break
                            time.sleep(0.05)
                        if not is_final:
                            time.sleep(0.2)

            deadline = time.time() + 15
            final_prefix = str(capture_actions[-1].get("prefix", "observed"))
            while time.time() < deadline:
                if (run_directory / f"{final_prefix}.png").is_file() or (
                    run_directory / f"{final_prefix}.ram"
                ).is_file():
                    break
                if process.poll() is not None:
                    break
                time.sleep(0.05)
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if fifo.exists():
            try:
                fifo.unlink()
            except OSError:
                pass

    generated: list[tuple[str, str]] = []
    capture_prefixes = [
        str(action.get("prefix", "observed"))
        for action in scenario["actions"]
        if action["type"] == "capture"
    ]
    for prefix in capture_prefixes:
        role_prefix = "observed" if prefix == "observed" else prefix
        if (run_directory / f"{prefix}.ram").is_file():
            generated.append((f"{role_prefix}-ram", f"{prefix}.ram"))
        if (run_directory / f"{prefix}.png").is_file():
            generated.append((f"{role_prefix}-display", f"{prefix}.png"))
        if (run_directory / f"{prefix}.registers.log").is_file():
            generated.append((f"{role_prefix}-register-log", f"{prefix}.registers.log"))
            try:
                observed_registers = parse_register_log(
                    (run_directory / f"{prefix}.registers.log").read_text(
                        encoding="utf-8", errors="replace"
                    )
                )
                registers_name = (
                    "observed-registers.json"
                    if prefix == "observed"
                    else f"{prefix}.registers.json"
                )
                write_json(run_directory / registers_name, observed_registers)
                generated.append((f"{role_prefix}-registers", registers_name))
            except LabError:
                pass
    generated.extend(
        [
            ("observation-hatari-log", "hatari-observe.log"),
            ("observation-boot-script", "observe-boot.txt"),
            ("observation-title-script", "observe-on-title.txt"),
            ("observation-dump-script", "observe-dump.txt"),
        ]
    )
    if not any(
        (run_directory / f"{prefix}.ram").is_file() or (run_directory / f"{prefix}.png").is_file()
        for prefix in capture_prefixes
    ):
        raise LabError(f"Observe produced no observed artifacts; see {observe_log}")

    manifest["scenario"] = {
        "name": scenario["name"],
        "sha256": file_hash(scenario_path),
    }
    manifest["artifacts"].extend(_artifact(run_directory, role, filename) for role, filename in generated)
    validate_run_manifest(manifest)
    write_json(run_directory / "manifest.json", manifest)
    verify_run_artifacts(run_directory, manifest)
    return run_directory, manifest
