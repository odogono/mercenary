"""Synthetic RAM controls for the research owner observer and path adapter."""
import unittest

from m3lab.ram import Ram
from m3lab.snapshot_owners import evidence, observe, trajectory_reference


class SnapshotOwnerTests(unittest.TestCase):
    def ram(self, values):
        raw = bytearray(0x100000)
        raw[0x56D6:0x56DA] = (0x56D6).to_bytes(4, 'big')
        for address, width, value in values:
            raw[address:address + width] = value.to_bytes(width, 'big')
        return Ram(bytes(raw), 'synthetic-owner-control')

    def test_inactive_actor_retains_nonzero_coordinates_and_raw_residence(self):
        ram = self.ram([(0x555A, 2, 0), (0x58E4, 4, 0x80000001),
                        (0x68E4, 4, 0x3C020362), (0x64E4, 4, 0xFF041080)])
        actor = observe(ram)['actors'][0]
        self.assertEqual((actor['slot'], actor['state'], actor['x']), (50, 0, 0x80000001))
        self.assertEqual([actor[k] for k in ('bodyOffset', 'association', 'floor', 'cell')], [60, 2, 3, 98])
        self.assertEqual([actor[k] for k in ('flags', 'group', 'objectState', 'zone')], [255, 4, 16, 128])

    def test_raw_counter_widths_and_last_slot_are_preserved(self):
        ram = self.ram([(0x558E, 2, 0x800E), (0x55C6, 4, 0xFFFFFFFF),
                        (0x4BF25, 1, 255), (0x4BF26, 4, 0x4C890),
                        (0x4BF1E, 2, 65535), (0x6EA2, 2, 0x0703)])
        owners = observe(ram)
        self.assertEqual((owners['actors'][-1]['slot'], owners['actors'][-1]['state'],
                          owners['actors'][-1]['incrementX']), (63, 0x800E, 0xFFFFFFFF))
        self.assertEqual((owners['sound']['doorLevelCount'], owners['sound']['doorLevelPointer'],
                          owners['sound']['doorToneCount']), (255, 0x4C890, 65535))
        self.assertEqual(owners['pilot']['countWord'], 0x0703)

    def test_all_body_entries_include_unnamed_final_entry(self):
        ram = self.ram([(0x57D6, 4, 0xFFFFFFFF), (0x7B66, 4, 7)])
        owners = observe(ram)
        self.assertEqual((len(owners['bodyPhases']), len(owners['bodyRates'])), (32, 32))
        self.assertEqual((owners['bodyPhases'][31], owners['bodyRates'][31]), (0xFFFFFFFF, 7))

    def test_core_words_keep_modular_timer_and_distinct_sampled_pose(self):
        ram = self.ram([(0x727E, 2, 65535), (0x7280, 2, 0x5DE0),
                        (0x6F26, 2, 22192), (0x6F28, 2, 1600),
                        (0x6F2A, 2, 0x8000), (0x7146, 4, 0xFFFFFFFF),
                        (0x7126, 4, 1234), (0x71DE, 4, 52)])
        owners = observe(ram)
        self.assertEqual((owners['vm']['timerBits'], owners['vm']['timedTargetOffset']),
                         (65535, 0x5DE0))
        self.assertEqual((owners['clock']['rate'], owners['clock']['period'],
                          owners['clock']['fractionBits']), (22192, 1600, 0x8000))
        self.assertEqual((owners['craft']['x'], owners['view']['eyeX']), (0xFFFFFFFF, 1234))
        self.assertEqual(owners['candidate']['residentOffset'], 52)

    def test_retained_sky_swing_and_retry_owners_are_read_without_reconstruction(self):
        ram = self.ram([(0x7052, 2, 564), (0x70E4, 2, 65535),
                        (0x7324, 2, 853), (0x7182, 2, 32), (0x70A4, 4, 49102),
                        (0x71A4, 2, 7), (0x59006, 4, 0x80000001),
                        (0x70D2, 4, 123), (0x70DA, 4, 456)])
        owners = observe(ram)
        self.assertEqual([owners['sky'][k] for k in ('substellarLongitude', 'dayBits',
                         'skyColour', 'atmosphereDay', 'palettePointer')], [564, 65535, 853, 32, 49102])
        self.assertEqual((owners['craft']['swing'], owners['craft']['altitudeMultiplier']),
                         (7, 0x80000001))
        self.assertEqual((owners['craft']['priorX'], owners['craft']['priorZ']), (123, 456))

    def test_sky_clip_and_land_occupancy_are_distinct_retained_words(self):
        owners = observe(self.ram([(0x42C74, 2, 136), (0x6F56, 2, 65535), (0x713E, 2, 2)]))
        self.assertEqual(owners['sky']['clipRows'], 136)
        self.assertEqual(owners['craft']['landBits'], 65535)
        self.assertEqual(owners['craft']['occupancyWord'], 2)

    def test_space_scan_has_distinct_draw_list_nearest_hold_and_arrival_flag(self):
        ram = self.ram([(0x6FAA, 4, 0x793A), (0x6FB6, 4, 100),
                        (0x71A2, 2, 50), (0x70BE, 2, 65535),
                        (0x716A, 4, 1), (0x716E, 4, 2)])
        owners = observe(ram)
        self.assertEqual((owners['space']['drawListPointer'], owners['space']['nearestBody'],
                          owners['space']['arrivalHold'], owners['space']['arrivalFlag']),
                         (0x793A, 100, 50, 65535))
        self.assertEqual((owners['craft']['cosPitch'], owners['craft']['sinPitch']), (1, 2))

    def test_return_stack_retains_nested_order_and_does_not_use_active_flag(self):
        ram = self.ram([(0x56D6, 4, 0x56CE), (0x56CE, 4, 0x75A16),
                        (0x56D2, 4, 0x766D5)])
        self.assertEqual(observe(ram)['vm']['returnStack'], [0x75A16, 0x766D5])

    def test_invalid_return_stack_pointer_is_refused_before_reading_ram(self):
        for pointer in (0x56B4, 0x56D8, 0x56D1):
            with self.subTest(pointer=pointer), self.assertRaisesRegex(ValueError, 'return stack'):
                observe(self.ram([(0x56D6, 4, pointer)]))

    def test_seed_admission_refuses_another_capture(self):
        with self.assertRaisesRegex(ValueError, 'coherent pinned gameplay opening'):
            evidence(self.ram([]), opening=True)

    def test_trajectory_adapter_preserves_next_unread_record_and_loop_boundary(self):
        self.assertEqual(trajectory_reference(56, 0x522CC), {'slot': 56, 'path': 0, 'nextRecord': 2})
        self.assertEqual(trajectory_reference(58, 0x52328), {'slot': 58, 'path': 2, 'nextRecord': 4})

    def test_trajectory_adapter_refuses_cross_path_or_misaligned_pointer(self):
        for slot, pointer in [(56, 0x522E2), (57, 0x522E3), (59, 0x52308), (58, 0x52330)]:
            with self.subTest(slot=slot, pointer=pointer), self.assertRaises(ValueError):
                trajectory_reference(slot, pointer)


if __name__ == '__main__':
    unittest.main()
