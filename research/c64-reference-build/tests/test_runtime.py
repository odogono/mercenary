from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.runtime import (  # noqa: E402
    build_capture_command,
    build_event_history_replay_command,
    parse_register_log,
    render_capture_script,
    render_checkpoint_script,
    render_event_history_prepare_script,
)


class RuntimeTests(unittest.TestCase):
    def test_builds_a_cold_event_history_replay_command(self) -> None:
        run = Path("/restricted/replay-1")
        command = build_event_history_replay_command(
            vice_binary=Path("/opt/homebrew/bin/x64sc"),
            run_directory=run,
            monitor_address="ip4://127.0.0.1:6516",
            start_snapshot=Path("/restricted/history/start.vsf"),
            end_snapshot=Path("/restricted/history/end.vsf"),
            prepare_script=run / "prepare.mon",
            machine_model="c64",
            seed=0xC0FFEE,
        )

        self.assertEqual(command[0], "/opt/homebrew/bin/x64sc")
        self.assertEqual(command[command.index("-eventsnapshotdir") + 1], "/restricted/history")
        self.assertEqual(command[command.index("-eventstartsnapshot") + 1], "start.vsf")
        self.assertEqual(command[command.index("-eventendsnapshot") + 1], "end.vsf")
        self.assertEqual(command[command.index("-binarymonitoraddress") + 1], "ip4://127.0.0.1:6516")
        self.assertEqual(command[command.index("-dumpconfig") + 1], "/restricted/replay-1/effective.vicerc")
        self.assertEqual(command[command.index("-logfile") + 1], "/restricted/replay-1/vice.log")
        self.assertEqual(command[command.index("-initbreak") + 1], "ready")
        self.assertNotIn("-playback", command)

    def test_rejects_event_history_snapshots_from_different_directories(self) -> None:
        with self.assertRaisesRegex(Exception, "same restricted directory"):
            build_event_history_replay_command(
                vice_binary=Path("/opt/homebrew/bin/x64sc"),
                run_directory=Path("/restricted/replay"),
                monitor_address="ip4://127.0.0.1:6516",
                start_snapshot=Path("/restricted/a/start.vsf"),
                end_snapshot=Path("/restricted/b/end.vsf"),
                prepare_script=Path("/restricted/replay/prepare.mon"),
                machine_model="c64",
                seed=1,
            )

    def test_builds_a_bounded_deterministic_capture_command(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            command = build_capture_command(
                vice_binary=Path("/opt/homebrew/bin/x64sc"),
                prg=Path("/input/MERCENARY.PRG"),
                run_directory=run,
                monitor_script=run / "checkpoint.mon",
                machine_model="c64",
                seed=0xC0FFEE,
                cycle_limit=120_000_000,
            )

        self.assertEqual(command[0], "/opt/homebrew/bin/x64sc")
        self.assertIn("-default", command)
        self.assertEqual(command[command.index("-model") + 1], "c64")
        self.assertEqual(command[command.index("-seed") + 1], str(0xC0FFEE))
        self.assertEqual(command[command.index("-limitcycles") + 1], "120000000")
        self.assertEqual(command[command.index("-initbreak") + 1], "ready")
        self.assertNotIn("-autostart", command)

    def test_renders_a_checkpoint_script_without_untrusted_paths(self) -> None:
        script = render_checkpoint_script(0x01E6, Path("/input/MERCENARY.PRG"))

        self.assertEqual(
            script,
            '; Load the exact PRG after a clean KERNAL/BASIC boot.\nloadbasic "/input/MERCENARY.PRG" 0\nbreak exec $01e6\ncommand 1 "playback \\"capture.mon\\""\ng $0820\n',
        )

    def test_renders_a_conditioned_interactive_checkpoint(self) -> None:
        script = render_checkpoint_script(
            0x8477,
            Path("/input/MERCENARY.PRG"),
            condition="@ram:$007f == $3f",
        )

        self.assertIn("break exec $8477 if @ram:$007f == $3f", script)

    def test_rejects_a_prg_path_that_cannot_be_safely_quoted(self) -> None:
        with self.assertRaisesRegex(Exception, "quote"):
            render_checkpoint_script(0x01E6, Path('/input/bad"name.prg'))

    def test_renders_checkpoint_specific_artifact_names(self) -> None:
        script = render_capture_script("interactive")

        self.assertIn('bsave "interactive.ram"', script)
        self.assertIn('screenshot "interactive.png"', script)
        self.assertIn('dump "interactive.vsf"', script)

    def test_detaches_loadbasic_virtual_tape_before_snapshot(self) -> None:
        script = render_capture_script("interactive")

        self.assertLess(script.index("detach 1"), script.index('dump "interactive.vsf"'))

    def test_prepares_event_playback_after_the_startup_reset(self) -> None:
        script = render_event_history_prepare_script(Path("/restricted/history.vhk"))

        self.assertEqual(
            script,
            'resset "HotkeyFile" "/restricted/history.vhk"\n'
            'resset "EventStartMode" "0"\n'
            'resset "EventImageInclude" "0"\n'
            "x\n",
        )

    def test_parses_registers_and_stopwatch_from_monitor_log(self) -> None:
        log = """#1 (Stop on exec 01e6)\n  ADDR A  X  Y  SP 00 01 NV-BDIZC LIN CYC  STOPWATCH\n.;01e6 00 fa e5 fa 2f 37 00110011 114 050   11152184\n"""

        result = parse_register_log(log)

        self.assertEqual(result["PC"], 0x01E6)
        self.assertEqual(result["A"], 0)
        self.assertEqual(result["X"], 0xFA)
        self.assertEqual(result["Y"], 0xE5)
        self.assertEqual(result["SP"], 0xFA)
        self.assertEqual(result["port00"], 0x2F)
        self.assertEqual(result["port01"], 0x37)
        self.assertEqual(result["flags"], "00110011")
        self.assertEqual(result["rasterLine"], 114)
        self.assertEqual(result["rasterCycle"], 50)
        self.assertEqual(result["stopwatch"], 11152184)


if __name__ == "__main__":
    unittest.main()
