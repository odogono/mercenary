"""The lift probe reads its tagged breakpoint hits back out of Hatari's log (#835)."""
import tempfile
import unittest
from pathlib import Path

from m3lab.lift import parse, summary

HIT = """  $7158 = $3
= %1010000000000001 (bin), #40961 (dec), $a001 (hex)
= %1110001001001 (bin), #7241 (dec), $1c49 (hex)
00006F3A: 00 03 00 19 00 19                                ......
00007158: 00 03                                            ..
0000714A: 00 00 00 3f                                      ...?
0000717E: 02 54                                            .T
000071CC: a0 00                                            ..
00007188: 00 39                                            .9
00007194: 00 01                                            ..
0000406C: 42 00 80 00                                      B...
0000B2D0: 32 00                                            2.
00007038: ff 60 00 00 00 3f 00 00 fa a7                    .`...?....
"""


class LiftProbeTests(unittest.TestCase):
    def test_reads_tag_vbl_and_dumped_words(self):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / 'hatari.log'
            log.write_text('Wrote 2 bytes.\n' + HIT + HIT.replace('$a001', '$a005'))
            rows = parse(log)
        self.assertEqual([(r['tag'], r['vbl']) for r in rows], [('floor', 7241), ('arrive', 7241)])
        self.assertEqual(summary(rows[0]),
                         ' 7241 floor        dest 0003 count 25 floor 3 label 2 y   63 region A000 '
                         '#1 structure 57 door 254 latch 4200/8000 local -160,-1369')


if __name__ == '__main__':
    unittest.main()
