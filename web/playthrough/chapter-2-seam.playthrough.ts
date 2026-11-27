import { expect, test } from '@playwright/test';

import { Chapter } from './ledger.ts';
import { CHAPTER_2_SEAM as STEP } from './route.ts';
import { attribute, expectAt, islandAreas, pressUntil } from './session.ts';
import { MOORBY_START, startFrom } from './starts.ts';
import { structureOrigin, walkTo } from './steering.ts';
import { doorOutside, flyToEntrance } from './travel.ts';

/// The wrap seam: Key West lies the short way from Moorby across the edge of Eris's surface. This
/// one-step chapter flies that way and checks the building is there, so the seam is recorded
/// apart from Chapter 2, which flies the long way to reach what lies beyond it.

const EAGLE = 'object-slot-3';
const NEWTON = 'eris-key-west-surface-77';

test('Chapter 2, seam: Moorby to Key West the short way', async ({
  page
}, testInfo) => {
  await page.goto('/damocles');
  const eagle = await structureOrigin(page, EAGLE);
  const setup = await startFrom(page, {
    ...MOORBY_START,
    at: { x: eagle.x + 150, z: eagle.z }
  });
  const chapter = new Chapter(
    page,
    testInfo,
    'chapter-2-seam',
    'Moorby to Key West the short way',
    setup
  );
  const areas = await islandAreas(page);
  try {
    await chapter.step(STEP.keyWest, async () => {
      await pressUntil(
        page,
        'b',
        async () => (await attribute(page, 'occupancy')) === EAGLE,
        'board the Eagle'
      );
      await flyToEntrance(page, NEWTON);
      await expectAt(page, areas, STEP.keyWest.target);
      // Bound is not drawn: walk to the door, facing the building, and it must be on screen.
      await walkTo(page, NEWTON, await doorOutside(page, NEWTON), 'the door');
      await expect
        .poll(async () => (await attribute(page, 'drawn')).split(' '), {
          timeout: 10_000
        })
        .toContain(NEWTON);
    });
  } finally {
    await chapter.finish();
  }
});
