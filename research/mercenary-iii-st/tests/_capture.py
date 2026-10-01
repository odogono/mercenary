"""Load the capture named by M3_RAM, or skip. Captures are Restricted Material."""

import os
import unittest
from functools import lru_cache

from m3lab.ram import Ram


@lru_cache(maxsize=1)
def capture() -> Ram:
    path = os.environ.get('M3_RAM')
    if not path:
        raise unittest.SkipTest('set M3_RAM to a loaded-play Mercenary III RAM capture')
    return Ram.load(path)
