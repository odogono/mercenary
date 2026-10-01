"""MIII sky data for I2, decoded from #646's pinned ranges (no program code)."""
from .ram import Ram

RANGES = [
    (0x5D8C0, 0x5FDF0, 'e4b802d6035968f5665010fecf40b1c1a3a55a60fcee3d18e39eee5af6da5377'),
    (0x50D26, 0x50D66, '627e3d0951c7494791038ded098c5ad3150d0c3e6a08fc0038253331b26f42ad'),
    (0x631C8, 0x631D4, '90f48465ed74853e964fb7bf0688de84fde37807d702d949846656612d302ea2'),
    (0x632F4, 0x63310, '2bf88175379adab249434a31988c65941498a660eab525b204f7a0641ddbb9b8'),
]

def extract_sky(loaded: Ram, opening: Ram) -> dict:
    sources = [loaded.require(a, b, pin, 'MIII sky') for a, b, pin in RANGES]
    stars = [[loaded.word(a), loaded.word(a + 2)] for a in range(0x5E0C0, 0x5FDF0, 4)]
    if len(stars) != 1868 or stars[1600:] != [[x + 1800, y] for x, y in stars[:268]]:
        raise ValueError('MIII star wrap mismatch')
    return {'capture': {'loadedRamSha256': loaded.sha256, 'openingRamSha256': opening.sha256},
            'sources': sources, 'stars': stars,
            'colours': [loaded.word(0x50D28 + 4 * i) for i in range(16)],
            'phase': opening.long(0x5796), 'rate': loaded.long(0x7B26),
            'stepX': opening.word(0x70B4), 'latitude': opening.word(0x70B8),
            'sunAngle': opening.word(0x7052), 'clipRow': 68,
            'horizon': {'vertices': 0, 'primitives': 0},
            'openingProvenance': [opening.slice(0x5796, 0x579A), opening.slice(0x70B4, 0x70BA),
                                  opening.slice(0x7052, 0x7054)],
            'rateProvenance': loaded.slice(0x7B26, 0x7B2A)}
