import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/// Overhead validation views of Eris's five Damocles Islands (#394).
///
/// Not a check: it produces the frames a reader compares against the Working Authority's own
/// overhead captures on shape, scale, orientation and relative placement
/// (docs/research/damocles-eris-islands.md, "Deterministic overhead views"), and is skipped
/// unless asked for. Regenerate with:
///
///   ISLAND_OVERHEAD_CAPTURE=1 ISLAND_OVERHEAD_OUT=$PWD/island-overhead-frames PORT=5186 \
///     bunx playwright test e2e/island-overhead-capture.e2e.ts
///
/// The camera is placed the way the laboratory's probe placed it: north of the island at three
/// quarters of its span, pitched `$268` — 104 units of the recovered 1024-unit turn below
/// level, nose down. On the Working Authority that view is a pitch poke and nothing else, and
/// here it is the same: `start.pitch` is a document field, and the session reads it through the
/// same `startPose` play does.
///
/// Two departures from the shipped configuration, both stated on the frame rather than hidden.
/// The far plane is pushed out, because the authored 3,000,000 units is 45 Surface Cells and
/// KEY WEST is 108 across — no overhead view of it fits inside the shipped horizon. And the
/// workspace stays the document's, so these frames carry the islands and the sea and not the
/// ground records of a settlement: the recovered draw bound gives a cell's ground records only
/// to an eye standing in that cell (#373), and this eye is a thousand feet above the water.

const DAMOCLES_RESUME_KEY =
  'mercenary.browser-shell.damocles.session-resume.v1';
const PREFERENCES_KEY = 'mercenary.browser-shell.damocles.preferences.v1';

const out = process.env['ISLAND_OVERHEAD_OUT'];
const enabled = process.env['ISLAND_OVERHEAD_CAPTURE'] === '1';

const CELL = 65_536;
/// `$268` on the recovered pitch scale: `$200` is level and it rises putting the nose down.
const PITCH = 0x2_68;
/// The probe's own framing: stand off by three quarters of the island's longer span.
const STANDOFF = 0.75;

interface IslandRecord {
  readonly areaName: string | null;
  readonly body: string;
  readonly coastline: { readonly vertices: readonly [number, number][] };
  readonly origin: readonly [number, number];
}

const slug = (area: string): string =>
  area.toLowerCase().replaceAll(/[^\da-z]+/g, '-');

test.describe('overhead island views', () => {
  test.use({ deviceScaleFactor: 1, viewport: { height: 900, width: 1280 } });
  test.skip(
    !enabled || out === undefined,
    'capture matrix only runs on request'
  );

  test('captures each Eris island from above', async ({
    page
  }: {
    page: Page;
  }) => {
    mkdirSync(out!, { recursive: true });
    const catalogue = (await (
      await page.request.get('/payload/damocles/catalogue.json')
    ).json()) as { islands: IslandRecord[] };
    const islands = catalogue.islands.filter(
      island =>
        island.body === 'body-11' && island.coastline.vertices.length > 0
    );
    expect(islands).toHaveLength(5);

    for (const island of islands) {
      const xs = island.coastline.vertices.map(([x]) => x);
      const zs = island.coastline.vertices.map(([, z]) => z);
      const centre = {
        x: island.origin[0] + (Math.min(...xs) + Math.max(...xs)) / 2,
        z: island.origin[1] + (Math.min(...zs) + Math.max(...zs)) / 2
      };
      const span = Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...zs) - Math.min(...zs)
      );
      const standoff = span * STANDOFF;
      // Level with the island's centre in the middle of the view: the eye is a standoff north
      // of it, and the pitch decides how high it has to be for the centre to be straight
      // ahead. tan of the recovered 104/1024 of a turn.
      const height =
        standoff * Math.tan(((PITCH - 0x2_00) / 1024) * 2 * Math.PI);

      await page.addInitScript(
        ({ preferences, resume }) => {
          localStorage.removeItem(resume);
          localStorage.setItem(
            preferences,
            JSON.stringify({ presentationPreset: 'authentic' })
          );
        },
        { preferences: PREFERENCES_KEY, resume: DAMOCLES_RESUME_KEY }
      );
      await page.route('**/damocles/eris.json', async route => {
        const doc = await (await route.fetch()).json();
        doc.camera.farPlane = Math.max(
          doc.camera.farPlane,
          (standoff + span) * CELL * 4
        );
        doc.start.pitch = PITCH;
        // Facing north, which is where the island is from here.
        doc.start.yaw = doc.orientation.yawNorth;
        doc.start.position = {
          x: centre.x * CELL,
          y: height * CELL,
          z: (centre.z - standoff) * CELL
        };
        await route.fulfill({ json: doc });
      });

      await page.goto('/damocles');
      const frame = page.locator('#frame');
      await expect(frame).toHaveAttribute('data-state', 'ready');
      await frame.screenshot({
        path: join(out!, `overhead-${slug(island.areaName ?? 'unnamed')}.png`)
      });
      await page.unrouteAll();
    }
  });
});
