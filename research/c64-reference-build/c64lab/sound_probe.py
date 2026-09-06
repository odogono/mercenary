"""Isolated native sound auditions. Outputs are restricted probes, not gameplay proof."""
from __future__ import annotations

import struct
import socket
import subprocess
import time
import uuid
import wave
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .core import LabError, file_hash, require
from .geometry import load_geometry_source
from .laboratory import WORK_ROOT, load_configuration, write_json
from .monitor import MonitorClient, MonitorProtocolError
from .sound import decode_sound
from .toolchain import discover_toolchain


PROGRAMS = {
    'action': 0x00, 'site-impact': 0x04, 'projectile': 0x08,
    'player-hit': 0x0C, 'target-hit': 0x10, 'wall': 0x14,
    'crash': 0x18, 'transition-voice1': 0x1C,
    'transition-voice2': 0x20,
}


def probe_names() -> list[str]:
    return [*PROGRAMS, 'lift-af3e', 'lift-af3a', 'retrigger', 'interruption', 'overlap',
            'craft-sweep', 'benson-display']


def build_driver(name: str) -> tuple[bytes, int]:
    """Generate original harness code in disposable RAM $0200..$07ff.

    Only decoded native routines are called. IRQ/NMI sources and sprites are
    disabled; the VIC continues running to provide PAL-frame wait boundaries.
    Probe holds are authored audition windows, never inferred game durations.
    """
    require(name in probe_names(), f'Unknown sound probe: {name}')
    code = bytearray()

    def emit(*values: int) -> None:
        code.extend(values)

    def store(address: int, value: int) -> None:
        emit(0xA9, value, 0x8D, address & 255, address >> 8)

    def call(address: int) -> None:
        emit(0x20, address & 255, address >> 8)

    def wait(frames: int) -> None:
        # Wait for high raster bit, then its falling edge, once per PAL frame.
        emit(0xA2, frames)
        emit(0xAD, 0x11, 0xD0, 0x10, 0xFB)
        emit(0xAD, 0x11, 0xD0, 0x30, 0xFB)
        emit(0xCA, 0xD0, 0xF3)

    def play(selector: int, voice: int = 1) -> None:
        emit(0xA9, selector)
        call(0xB958 if voice == 1 else 0xB93A)

    # Park until the binary monitor verifies the driver and releases this loop.
    emit(0x78, 0xD8, 0x4C, 0x02, 0x02, 0xA2, 0xFF, 0x9A)
    store(0x0000, 0x2F)
    store(0x0001, 0x35)  # RAM under BASIC/KERNAL, SID/VIC I/O visible
    for address in (0xDC0D, 0xDD0D):
        store(address, 0x7F)
        emit(0xAD, address & 255, address >> 8)  # acknowledge pending CIA IRQ/NMI
    for address in (0xD01A, 0xD015):
        store(address, 0)
    store(0xD019, 0xFF)
    store(0xD011, 0x0B)  # blank screen; preserve raster counter
    call(0xB910)
    wait(25)  # allow the recording device to open before the cue
    if name in PROGRAMS:
        play(PROGRAMS[name], 2 if name == 'transition-voice2' else 1)
    elif name.startswith('lift-'):
        call(0xAF3E if name == 'lift-af3e' else 0xAF3A)
    elif name == 'overlap':
        play(0x1C)
        play(0x20, 2)
    elif name == 'craft-sweep':
        store(0x00A8, 0)  # outdoor path
        store(0x00A9, 0)  # exclude walking mover
        # Return immediately after the native sound block, before unrelated
        # graphics work. This deliberate probe-only patch is guarded below.
        store(0xB61D, 0x60)
        for value in [12, 16, 20, 24, 28, 32, 36, 40, 36, 32, 28, 24, 20, 16, 12]:
            store(0x0027, value)
            store(0x0026, (value - 12) * 8)
            call(0xB5D8)
            wait(5)
    elif name == 'benson-display':
        # Native display tick, with a controlled character and active window.
        # Its screen-memory shifts are harmless in this disposable machine.
        store(0x00E6, 0xFF)
        for character in 'MERCENARY SOUND TEST':
            store(0x00E0, 0)
            store(0x00FC, ord(character))
            call(0x8DC3)
            wait(1)
        store(0x00E0, 25)
        store(0x00E1, 255)
        call(0x8DC3)
    else:
        play(0x08)
        wait(5)
        play(0x08 if name == 'retrigger' else 0x04)
    wait(100)
    if name.startswith('lift-'):
        call(0xBB2F)
    else:
        store(0xD404, 0)
        store(0xD40B, 0)
    wait(50)
    stop = 0x0200 + len(code)
    emit(0x4C, stop & 255, stop >> 8)
    require(stop + 3 <= 0x0800, 'Sound probe exceeds its scratch RAM allocation')
    return bytes(code), stop


def parse_sid_dump(body: str) -> list[dict[str, int]]:
    events = []
    clock = 0
    for line in body.splitlines():
        try:
            delta, register, value = map(int, line.split())
        except ValueError as error:
            raise LabError('Malformed SID dump record') from error
        require(delta >= 0 and 0 <= register <= 24 and 0 <= value <= 255,
                'SID dump has an invalid delta, register, or value')
        clock += delta if events else 0
        events.append({'cycle': clock, 'register': register, 'value': value})
    require(bool(events), 'SID dump is empty')
    return events


def validate_wav(path: Path) -> dict[str, Any]:
    try:
        with wave.open(str(path), 'rb') as wav:
            require(wav.getframerate() == 48000 and wav.getsampwidth() == 2
                    and wav.getnchannels() == 1, 'Expected mono 48 kHz PCM16 WAV')
            frames = wav.getnframes()
            require(48000 <= frames <= 48000 * 10, 'WAV duration outside probe bounds')
            data = wav.readframes(frames)
            require(len(data) == frames * 2, 'WAV data is truncated')
            # An initialization click alone must not make a silent cue pass.
            samples = [value[0] for value in struct.iter_unpack('<h', data[19200 * 2:])]
            peak = max(samples) - min(samples)
            require(peak > 100, 'Sound probe produced no meaningful audio signal')
            return {'frames': frames, 'sampleRate': 48000, 'seconds': frames / 48000,
                    'peakToPeak': peak}
    except (OSError, EOFError, wave.Error) as error:
        raise LabError(f'Invalid probe WAV: {error}') from error


def capture_probes(run: Path, names: list[str]) -> dict[str, Any]:
    require(bool(names) and len(names) == len(set(names)), 'Select distinct sound probes')
    drivers = {name: build_driver(name) for name in names}
    reference, config = load_configuration()
    ram, source = load_geometry_source(run, expected_build_sha256=reference['hashes']['sha256'])
    decode_sound(ram)
    # Also guard the dispatch return tail, which isolated JSR calls depend on.
    require(ram[0xB97E:0xB985] == bytes.fromhex('ac86b9ae85b960'),
            'Sound dispatcher return tail changed')
    require(ram[0xB61D:0xB621] == bytes.fromhex('a90085ef'), 'Craft sound exit changed')
    require(ram[0x8DC3:0x8DCB] == bytes.fromhex('e6e0a5e0c91a9013')
            and ram[0x8DCC:0x8DDA] == bytes.fromhex('008e0fd4c5e1904686e0c6e6d002')
            and ram[0x8E1A] == 0x60, 'Benson sound tick boundaries changed')
    vice, toolchain, _ = discover_toolchain(config)
    identifier = f"sound-probe-{datetime.now(UTC):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}"
    root = WORK_ROOT / identifier
    root.mkdir(parents=True)
    write_json(root / 'request.json', {'mode': 'probe', 'source': source, 'probes': names})
    results = []
    for name, (driver, stop) in drivers.items():
        directory = root / name
        directory.mkdir()
        (directory / 'native.bin').write_bytes(ram[0x8000:0xC000])
        (directory / 'driver.bin').write_bytes(driver)
        script = '\n'.join([
            'delete', 'bank ram', 'bload "native.bin" 0 $8000',
            'bload "driver.bin" 0 $0200', 'bank cpu',
            'log off', 'g $0200', '',
        ])
        (directory / 'probe.mon').write_text(script, encoding='utf-8')
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            port = reservation.getsockname()[1]
        command = [str(vice), '-default', '-model', config['machineModel'],
                   '-seed', str(config['seed']), '-initbreak', 'ready',
                   '-binarymonitor', '-binarymonitoraddress', f'ip4://127.0.0.1:{port}',
                   '-chdir', str(directory.resolve()), '-moncommands', str((directory / 'probe.mon').resolve()),
                   '-monlog', '-monlogname', str((directory / 'monitor.log').resolve()),
                   '-sound', '+warp', '-speed', '100', '-soundrate', '48000',
                   '-sidenginemodel', '256', '-sounddev', 'dump', '-soundarg', 'sid.log',
                   '-sidfilters', '-soundvolume', '100',
                   '-dumpconfig', 'effective.vicerc', '-limitcycles', '12000000']
        write_json(directory / 'command.json', command)
        try:
            with (directory / 'vice.log').open('w') as log:
                process = subprocess.Popen(command, cwd=directory, stdout=log, stderr=subprocess.STDOUT)
                try:
                    deadline = time.monotonic() + 15
                    monitor_log = directory / 'monitor.log'
                    while not monitor_log.exists() or monitor_log.stat().st_size == 0:
                        require(process.poll() is None and time.monotonic() < deadline,
                                f'VICE did not prepare the probe; inspect {directory}')
                        time.sleep(0.05)
                    with MonitorClient.connect('127.0.0.1', port, timeout=15) as client:
                        registers = client.registers()
                        require(registers['PC'] == 0x0202,
                                f'Probe did not enter at its driver boundary: {registers}')
                        ram_bank = client.banks()['ram']
                        require(client.memory(ram_bank, 0x0200, 0x0200 + len(driver) - 1) == driver,
                                'Loaded sound driver differs from the generated driver')
                        client.clear_checkpoints()
                        checkpoint = client.set_execution_checkpoint(stop)
                        client.set_resource('SoundRecordDeviceArg', str((directory / 'audio.wav').resolve()))
                        client.set_resource('SoundRecordDeviceName', 'wav')
                        client.set_memory(ram_bank, 0x0202, bytes([0xEA, 0xEA, 0xEA]))
                        require(client.resume_until_checkpoint(checkpoint) == stop,
                                'Probe did not reach its completion boundary')
                        client.quit()
                    returncode = process.wait(timeout=10)
                finally:
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait(timeout=5)
            require(returncode == 0, f'VICE failed; inspect {directory / "vice.log"}')
            events = parse_sid_dump((directory / 'sid.log').read_text())
            audio = validate_wav(directory / 'audio.wav')
            # Retain the exact recording and make a convenient listening copy.
            # Only the first 400 ms (initialization + settling) are removed;
            # samples are neither amplified, resampled, nor otherwise altered.
            with wave.open(str(directory / 'audio.wav'), 'rb') as original:
                original.setpos(19200)
                with wave.open(str(directory / 'audition.wav'), 'wb') as audition:
                    audition.setparams(original.getparams())
                    audition.writeframes(original.readframes(original.getnframes() - 19200))
            require(any(event['register'] in ((18,) if name == 'benson-display' else (4, 11))
                        and event['value'] & 1 for event in events),
                    'Probe never gated an effect voice on')
            write_json(directory / 'sid-events.json', events)
            artifacts = [{ 'path': path.name, 'sha256': file_hash(path), 'size': path.stat().st_size}
                         for path in sorted(directory.iterdir()) if path.is_file()]
            results.append({'name': name, 'audio': audio, 'sidWrites': len(events), 'artifacts': artifacts})
        except (OSError, subprocess.TimeoutExpired, MonitorProtocolError) as error:
            raise LabError(f'Sound probe failed; incomplete capture retained at {directory}: {error}') from error
    manifest = {'schemaVersion': 1, 'mode': 'probe', 'runId': identifier,
                'harnessSha256': file_hash(Path(__file__)),
                'listeningTrimFrames': 19200,
                'recordingSettings': {'sampleRate': 48000, 'sidEngine': 1, 'sidModel': 0,
                                      'filters': True, 'volume': 100, 'warp': False, 'speed': 100},
                'source': source, 'toolchain': toolchain.as_dict(), 'probes': results,
                'limitations': 'Isolated routine calls with authored hold times; not gameplay timing proof.'}
    write_json(root / 'manifest.json', manifest)
    (root / 'LISTEN.md').write_text(
        '# Native C64 sound auditions\n\n'
        'Isolated probes with authored hold times. Each listening clip removes '
        '400 ms of initialization; full recordings and SID logs are alongside it.\n\n'
        + '\n'.join(f'- [{name}]({name}/audition.wav)' for name in names) + '\n',
        encoding='utf-8')
    return {'status': 'captured', 'run': str(root), 'probes': [
        {'name': result['name'], **result['audio'], 'sidWrites': result['sidWrites']} for result in results]}
