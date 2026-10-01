import json
import unittest

from _capture import capture
from m3lab.text import extract_messages


class MessageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = extract_messages(capture())
        cls.by_id = {m['id']: m for m in cls.out['messages']}

    def test_serialisable(self):
        json.dumps(self.out)

    def test_sixty_four_messages_with_provenance(self):
        self.assertEqual(len(self.out['messages']), 64)
        for m in self.out['messages']:
            self.assertEqual(len(m['source']['sha256']), 64)

    def test_known_messages(self):
        self.assertEqual(self.by_id[0x00]['text'], 'LOCKED')
        self.assertEqual(self.by_id[0x25]['text'], "WE'VE ARRIVED")
        self.assertEqual(self.by_id[0x28]['text'], 'WELCOME - PLEASE SELECT YOUR DESTINATION')
        self.assertEqual(self.by_id[0x32]['text'], ' ')
        self.assertTrue(self.by_id[0x28]['scrolls_out'])

    def test_static_tokens(self):
        words = {k: v['expansion'] for k, v in self.out['static_tokens'].items()}
        self.assertEqual(words, {'^4': 'NEWSFLASH - ', '^5': 'P C BIL', '^6': 'MERCENARY',
                                 '^7': 'MILLION', '^8': 'PRESIDENT', '^9': 'ELECTION', '\\': ' THE'})
        self.assertEqual(self.by_id[0x2F]['raw'], 'HERE WE ARE\\N GUV')
        self.assertEqual(self.by_id[0x2F]['text'], 'HERE WE ARE THEN GUV')

    def test_live_tokens_stay_marked(self):
        poll = self.by_id[0x07]
        self.assertEqual(poll['text'], 'POLL UPDATE: P C BIL ^0% - ] [%')
        self.assertIn({'token': '^5', 'expansion': 'P C BIL'}, poll['parts'])
        self.assertTrue(any(p.get('token') == ']' and 'live' in p for p in poll['parts']))


if __name__ == '__main__':
    unittest.main()
