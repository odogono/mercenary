"""The rehosted memstate container must be reproducible (#326, #331).

A rehost is a container conversion, not a recapture, so the same captured
memstate must always produce the same rehosted bytes. It did not: gzip stamps
the current time into its header, so ``payload/damocles/arrival-poses.json``
carried memstate hashes that no later run could re-derive. These tests pin the
two rules that fix it.
"""

import gzip
import importlib.util
import struct
import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

_spec = importlib.util.spec_from_file_location(
    'memstate_rehost', LAB_ROOT / 'scripts' / 'memstate-rehost.py')
memstate_rehost = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(memstate_rehost)

STREAM = b'HATARI-SNAPSHOT' + bytes(range(256)) * 4


class PackSnapshotTests(unittest.TestCase):
    def test_packing_one_stream_twice_gives_identical_bytes(self):
        self.assertEqual(
            memstate_rehost.pack_snapshot(STREAM),
            memstate_rehost.pack_snapshot(STREAM),
        )

    def test_the_gzip_header_carries_no_timestamp(self):
        header_mtime = struct.unpack_from('<I', memstate_rehost.pack_snapshot(STREAM), 4)[0]
        self.assertEqual(header_mtime, 0)

    def test_the_stream_survives_the_round_trip(self):
        self.assertEqual(gzip.decompress(memstate_rehost.pack_snapshot(STREAM)), STREAM)


if __name__ == '__main__':
    unittest.main()
