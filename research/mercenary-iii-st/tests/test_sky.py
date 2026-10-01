"""Pinned star data and observer caches for the bounded METIS night sky."""
import os
import unittest
from _capture import capture
from m3lab.ram import Ram
from m3lab.sky import extract_sky

class SkyTests(unittest.TestCase):
    def test_pinned_star_wrap_colours_and_empty_horizon(self):
        ram = capture()
        opening = Ram.load(os.environ['M3_OPENING']) if os.environ.get('M3_OPENING') else ram
        sky = extract_sky(ram, opening)
        self.assertEqual(len(sky['stars']), 1868)
        self.assertEqual(sky['stars'][1600:], [[x + 1800, y] for x, y in sky['stars'][:268]])
        self.assertEqual(len(sky['colours']), 16)
        self.assertEqual(sky['rate'], 0x3B0)
        self.assertEqual(sky['horizon'], {'vertices': 0, 'primitives': 0})
        self.assertEqual(sky['clipRow'], 68)
        self.assertEqual(sky['phase'], opening.long(0x5796))
