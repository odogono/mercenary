import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/// Capture matrix for the Cast Shadow studies (#376, #380).
///
/// Not a check: it produces the frames the research notes judge, at fixed Poses at one fixed
/// Body turn, so DIALIS and its Sunlight stand in the same place in every frame, and is
/// skipped unless asked for. Regenerate with:
///
///   CAST_SHADOW_CAPTURE=1 CAST_SHADOW_OUT=$PWD/cast-shadow-frames PORT=5185 \
///     bunx playwright test e2e/cast-shadow-capture.e2e.ts
///
/// Shadows are switched through the Shell Console's `set shadows` line, exactly as a player at
/// the settings page would switch them, so the frames show the shipped switch and nothing else.

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
/// Shadows off and on (ADR 0069). Choose one with `CAST_SHADOW_EDGES=on`.
const ALL_EDGES = ['off', 'on'] as const;
const EDGES = (
  process.env['CAST_SHADOW_EDGES']?.split(',') ?? ALL_EDGES
).filter(edge => (ALL_EDGES as readonly string[]).includes(edge));
const DPRS = (process.env['CAST_SHADOW_DPRS'] ?? '1,2').split(',').map(Number);
/// The temporal mode (#380): this many back-to-back frames per edge with the player still, so
/// only DIALIS's motion separates them. Zero skips it.
const TEMPORAL_FRAMES = Number(process.env['CAST_SHADOW_TEMPORAL'] ?? '0');
/// Median GPU milliseconds of the Enhanced frame over this many frames per edge, with the
/// GPU's name. Zero skips it; SwiftShader reports no timer, so it wants `CAST_SHADOW_GPU=1`.
const TIMING_FRAMES = Number(process.env['CAST_SHADOW_TIMING'] ?? '0');

/// The median GPU time of the Enhanced frame, from the renderer's timer queries (#380).
const gpuMilliseconds = async (page: Page, frames: number): Promise<number> =>
  page.evaluate(
    count =>
      new Promise<number>(resolve => {
        const sink: number[] = [];
        (globalThis as Record<string, unknown>)['__shadowTiming'] = sink;
        const tick = (): void => {
          if (sink.length >= count) {
            delete (globalThis as Record<string, unknown>)['__shadowTiming'];
            const sorted = [...sink].sort((a, b) => a - b);
            resolve(sorted[Math.floor(sorted.length / 2)]!);
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    frames
  );

/// Pixels that changed by more than 8 levels in any channel between consecutive frames. A
/// shadow edge sliding with the sun changes a pixel once; one resampled on a moving texel grid
/// changes it back and forth. So `flickered` counts pixels changed in two or more pairs and
/// `moved` those changed in exactly one, both as fractions of the frame below the message
/// strip, and the mask paints them magenta and green over the first frame.
const flicker = async (
  page: Page,
  frames: readonly Buffer[]
): Promise<{
  readonly flickered: number;
  readonly mask: string;
  readonly moved: number;
}> =>
  page.evaluate(
    async encoded => {
      const decode = async (base64: string): Promise<ImageData> => {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const bitmap = await createImageBitmap(
          new Blob([bytes], { type: 'image/png' })
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const images = await Promise.all(encoded.map(decode));
      const { height, width } = images[0]!;
      // The message strip along the frame's top edge scrolls whatever the shadows do.
      const top = Math.round(height * 0.04);
      const changes = new Uint8Array(width * height);
      for (let index = 1; index < images.length; index += 1) {
        const a = images[index - 1]!.data;
        const b = images[index]!.data;
        for (let pixel = 0; pixel < width * height; pixel += 1) {
          const o = pixel * 4;
          if (
            Math.abs(a[o]! - b[o]!) > 8 ||
            Math.abs(a[o + 1]! - b[o + 1]!) > 8 ||
            Math.abs(a[o + 2]! - b[o + 2]!) > 8
          ) {
            changes[pixel]! += 1;
          }
        }
      }
      const first = images[0]!;
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d')!;
      const mask = context.createImageData(width, height);
      let flickered = 0;
      let moved = 0;
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        const o = pixel * 4;
        const grey =
          (first.data[o]! + first.data[o + 1]! + first.data[o + 2]!) / 6;
        const count = pixel < top * width ? 0 : changes[pixel]!;
        flickered += count >= 2 ? 1 : 0;
        moved += count === 1 ? 1 : 0;
        mask.data[o] = count >= 2 ? 255 : count === 1 ? 0 : grey;
        mask.data[o + 1] = count >= 2 ? 0 : count === 1 ? 255 : grey;
        mask.data[o + 2] = count >= 2 ? 255 : count === 1 ? 0 : grey;
        mask.data[o + 3] = 255;
      }
      context.putImageData(mask, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      const area = (height - top) * width;
      return {
        flickered: flickered / area,
        mask: btoa(binary),
        moved: moved / area
      };
    },
    frames.map(frame => frame.toString('base64'))
  );

/// DIALIS about 19 degrees up in the west over the spaceport, throwing the west window's beam.
const WEST_SUN_TURN = 0x2_80_00_00;
/// Another Body turn for a stress run, such as a sun a few degrees off the horizon.
const BODY_TURN = Number(process.env['CAST_SHADOW_TURN'] ?? WEST_SUN_TURN);

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
  // The overlay animates away after the attribute flips; let it finish before a capture.
  await page.waitForTimeout(500);
};

// Headless Chromium draws with SwiftShader on the CPU. `CAST_SHADOW_GPU=1` asks ANGLE for the
// machine's GPU instead, so frame times mean something.
if (process.env['CAST_SHADOW_GPU'] === '1') {
  test.use({
    launchOptions: {
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    }
  });
}

for (const dpr of DPRS) {
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
      test(`captures ${pose.name} by edge`, async ({ page }) => {
        test.setTimeout(300_000);
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
          doc.start.bodyTurn = BODY_TURN;
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
        if (TEMPORAL_FRAMES > 1) {
          // The slowest Body turn: DIALIS still moves, but barely between frames.
          await run(page, 'rate 0.0625');
        }
        for (const edge of EDGES) {
          await run(page, `set shadows ${edge}`);
          await frame.screenshot({
            path: join(out!, `${pose.name}-${edge}-dpr${dpr}.png`)
          });
          if (TIMING_FRAMES > 0 && edge !== 'off') {
            const gpu = await page.evaluate(() => {
              const gl = document.createElement('canvas').getContext('webgl2');
              const info = gl?.getExtension('WEBGL_debug_renderer_info');
              return info
                ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)
                : '?';
            });
            const interval = await gpuMilliseconds(page, TIMING_FRAMES);
            appendFileSync(
              join(out!, 'timing.tsv'),
              `${pose.name}\t${edge}\t${dpr}\t${interval.toFixed(2)}\t${gpu}\n`
            );
          }
          if (TEMPORAL_FRAMES > 1) {
            const frames: Buffer[] = [];
            for (let index = 0; index < TEMPORAL_FRAMES; index += 1) {
              frames.push(await frame.screenshot());
            }
            const result = await flicker(page, frames);
            writeFileSync(
              join(out!, `${pose.name}-${edge}-dpr${dpr}-flicker.png`),
              Buffer.from(result.mask, 'base64')
            );
            appendFileSync(
              join(out!, 'flicker.tsv'),
              `${pose.name}\t${edge}\t${dpr}\t${(result.flickered * 100).toFixed(4)}\t${(result.moved * 100).toFixed(4)}\n`
            );
          }
        }
      });
    }
  });
}
