"""Preview certification must cover every exported identity and stored form."""
import copy
import json
import unittest

from m3lab.catalogue_ledger import REPOSITORY, attach_previews, completion, load_ledger


class CataloguePreviewTests(unittest.TestCase):
    def setUp(self):
        self.ledger = load_ledger()
        path = REPOSITORY / 'research/mercenary-iii-st/catalogue-previews.json'
        self.report = json.loads(path.read_text())

    def test_complete_preview_inventory_clears_only_the_static_coverage_gate(self):
        attach_previews(self.ledger, self.report)
        self.assertTrue(completion(self.ledger)['complete'])
        self.assertEqual(len(self.report['records']), 529)
        self.assertEqual(sum(len(r['variants']) for r in self.report['records']), 791)

    def test_missing_corrupt_or_unseen_geometry_cannot_be_certified(self):
        drawn = next(i for i, row in enumerate(self.report['records'])
                     if row['state'] != 'empty')
        mutations = [
            lambda r: r['records'].pop(),
            lambda r: r['records'].append(copy.deepcopy(r['records'][0])),
            lambda r: r['records'][0].update(sha256='0' * 64),
            lambda r: r['records'][drawn].update(state='empty'),
            lambda r: r['records'][0]['variants'].clear(),
            lambda r: r['records'][drawn]['variants'][0].update(primitives=0),
            lambda r: r.update(programSha256='0' * 64),
            lambda r: r.update(openingRamSha256='0' * 64),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                report = copy.deepcopy(self.report)
                mutate(report)
                with self.assertRaises(ValueError):
                    attach_previews(self.ledger, report)


if __name__ == '__main__':
    unittest.main()
