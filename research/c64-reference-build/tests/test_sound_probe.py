from __future__ import annotations

import sys
import tempfile
import unittest
import wave
import struct
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from c64lab.core import LabError
from c64lab.sound_probe import build_driver, parse_sid_dump, probe_names, validate_wav


class SoundProbeTests(unittest.TestCase):
    def test_driver_is_bounded_and_calls_native_projectile_dispatch(self):
        driver, stop = build_driver('projectile')
        self.assertIn(bytes.fromhex('a9082058b9'), driver)
        self.assertIn(bytes.fromhex('2010b9'), driver)
        self.assertEqual(stop, 0x0200 + len(driver) - 3)
        self.assertLess(stop, 0x0800)
        self.assertEqual(driver[:2], bytes.fromhex('78d8'))

    def test_unknown_program_is_rejected(self):
        with self.assertRaises(LabError):
            build_driver('invented')
        self.assertIn('lift-af3a', probe_names())
        self.assertIn('overlap', probe_names())

    def test_every_audition_fits_the_reserved_scratch_region(self):
        for name in probe_names():
            with self.subTest(name=name):
                driver, stop = build_driver(name)
                self.assertLess(stop + 3, 0x0800)
                self.assertEqual(driver[2:5], bytes.fromhex('4c0202'))
                self.assertEqual(driver[-3:], bytes([0x4c, stop & 255, stop >> 8]))

    def test_continuous_probes_call_original_routines(self):
        craft, _ = build_driver('craft-sweep')
        self.assertIn(bytes.fromhex('20d8b5'), craft)
        self.assertIn(bytes.fromhex('a9608d1db6'), craft)
        display, _ = build_driver('benson-display')
        self.assertIn(bytes.fromhex('20c38d'), display)

    def test_pcm_signal_passes_but_silence_and_truncation_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'audio.wav'
            for amplitude in (0, 1000):
                with wave.open(str(path), 'wb') as wav:
                    wav.setparams((1, 2, 48000, 0, 'NONE', 'not compressed'))
                    wav.writeframes(struct.pack('<hh', amplitude, -amplitude) * 24000)
                if amplitude:
                    self.assertEqual(validate_wav(path)['peakToPeak'], 2000)
                else:
                    with self.assertRaises(LabError):
                        validate_wav(path)
            path.write_bytes(path.read_bytes()[:-2])
            with self.assertRaises(LabError):
                validate_wav(path)

    def test_initialization_click_does_not_pass_as_an_audible_cue(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'audio.wav'
            with wave.open(str(path), 'wb') as wav:
                wav.setparams((1, 2, 48000, 0, 'NONE', 'not compressed'))
                wav.writeframes(struct.pack('<h', 20000) + bytes(48000 * 2 - 2))
            with self.assertRaises(LabError):
                validate_wav(path)

    def test_sid_dump_preserves_same_cycle_writes_and_normalizes_clock(self):
        self.assertEqual(parse_sid_dump('100 4 0\n7 1 18\n0 4 129\n'), [
            {'cycle': 0, 'register': 4, 'value': 0},
            {'cycle': 7, 'register': 1, 'value': 18},
            {'cycle': 7, 'register': 4, 'value': 129},
        ])
        for invalid in ('', '0 25 0', '-1 4 0', '0 4 256', 'garbage'):
            with self.assertRaises(LabError):
                parse_sid_dump(invalid)

    def test_empty_or_header_only_audio_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'audio.wav'
            path.write_bytes(b'RIFF')
            with self.assertRaises(LabError):
                validate_wav(path)


if __name__ == '__main__':
    unittest.main()
