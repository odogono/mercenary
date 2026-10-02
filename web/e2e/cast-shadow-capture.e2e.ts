import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/// Capture matrix for the Cast Shadow edge study (#376).
///
/// Not a check: it produces the soft-against-hard frames the research note judges, at fixed
/// Poses at one fixed Body turn, so DIALIS and its Sunlight stand in the same place in every
/// frame, and is skipped unless asked for. Regenerate with:
///
///   CAST_SHADOW_CAPTURE=1 CAST_SHADOW_OUT=$PWD/cast-shadow-frames PORT=5185 \
///     bunx playwright test e2e/cast-shadow-capture.e2e.ts
///
/// The edge is chosen through the Shell Console's `set shadows` line, exactly as a player at
/// the settings page would choose it, so the frames show the shipped switch and nothing else.

const DAMOCLES_RESUME_KEY =
  'mercenary.browser-shell.damocles.session-resume.v1';
const PREFERENCES_KEY = 'mercenary.browser-shell.damocles.preferences.v1';

const out = process.env['CAST_SHADOW_OUT'];
const enabled = process.env['CAST_SHADOW_CAPTURE'] === '1';

/// The prototype study's poses: offsets from the `eris-surface-87` spaceport origin and a yaw
/// on the recovered 1024-unit clockwise-from-north scale. `start` is the document's own pose.
const POSES = [
  { name: 'start' },
  { name: 'window-outside', x: 700, yaw: 768, z: 0 },
  { name: 'inside-west', x: 1300, yaw: 256, z: 0 },
  { name: 'inside-north', x: 1200, yaw: 0, z: 0 }
] as const;
const EDGES = ['soft', 'hard'] as const;

/// DIALIS about 19 degrees up in the west over the spaceport, throwing the west window's beam.
const WEST_SUN_TURN = 0x2_80_00_00;

const run = async (page: Page, line: string): Promise<void> => {
  const input = page.locator('#console-input');
  if (!(await input.evaluate(node => node === document.activeElement))) {
    await page.keyboard.press('`');
    await expect(input).toBeFocused();
  }
  await input.fill(line);
  await input.press('Enter');
  await expect(page.locator('#console-log')).toContainText(line.slice(4));
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-console',
    'closed'
  );
};

for (const dpr of [1, 2]) {
  test.describe(`at device pixel ratio ${dpr}`, () => {
    test.use({
      deviceScaleFactor: dpr,
      viewport: { height: 900, width: 1280 }
    });
    test.skip(
      !enabled || out === undefined,
      'capture matrix only runs on request'
    );

    for (const pose of POSES) {
      test(`captures ${pose.name} soft and hard`, async ({ page }) => {
        mkdirSync(out!, { recursive: true });
        await page.addInitScript(
          ({ preferences, resume }) => {
            localStorage.removeItem(resume);
            localStorage.setItem(
              preferences,
              JSON.stringify({ presentationPreset: 'enhanced' })
            );
          },
          { preferences: PREFERENCES_KEY, resume: DAMOCLES_RESUME_KEY }
        );
        const catalogue = (await (
          await page.request.get('/payload/damocles/catalogue.json')
        ).json()) as {
          instances: {
            id: string;
            location: { position: number[] } | null;
          }[];
        };
        const origin = catalogue.instances.find(
          item => item.id === 'eris-surface-87'
        )!.location!.position;
        await page.route('**/damocles/eris.json', async route => {
          const doc = await (await route.fetch()).json();
          doc.start.bodyTurn = WEST_SUN_TURN;
          if ('x' in pose) {
            doc.start.yaw = pose.yaw;
            doc.start.position = {
              x: origin[0]! * 65_536 + pose.x,
              y: 63,
              z: origin[2]! * 65_536 + pose.z
            };
          }
          await route.fulfill({ json: doc });
        });
        await page.goto('/damocles');
        const frame = page.locator('#frame');
        await expect(frame).toHaveAttribute('data-state', 'ready');
        for (const edge of EDGES) {
          await run(page, `set shadows ${edge}`);
          await frame.screenshot({
            path: join(out!, `${pose.name}-${edge}-dpr${dpr}.png`)
          });
        }
      });
    }
  });
}
