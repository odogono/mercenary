import { describe, expect, test } from 'bun:test';

import {
  readTargTitleLogo,
  targTitleLogoRgba
} from '../src/shell/titleLogo.ts';

const tracked = async (): Promise<Record<string, unknown>> =>
  (await Bun.file(
    new URL('../../payload/targ-st/title.json', import.meta.url)
  ).json()) as Record<string, unknown>;

describe("Targ's Title Logo from the ST title picture", () => {
  test('reads the tracked export as the yellow MERCENARY mark', async () => {
    const logo = readTargTitleLogo(await tracked());

    expect([logo.width, logo.height]).toEqual([304, 116]);
    expect(logo.colour).toBe(0x7_70);
    expect(logo.rows.flat().filter(Boolean).length).toBeGreaterThan(6000);
  });

  test('draws the mark opaque and leaves the rest transparent', () => {
    const rgba = targTitleLogoRgba({
      colour: 0x7_70,
      height: 1,
      rows: [[true, false]],
      width: 2
    });

    expect([...rgba]).toEqual([255, 255, 0, 255, 0, 0, 0, 0]);
  });

  test("refuses another Title's document", async () => {
    const document = await tracked();

    expect(() =>
      readTargTitleLogo({
        ...document,
        source: { ...(document['source'] as object), title: 'dion' }
      })
    ).toThrow("source.title is not 'targ'");
  });

  test('refuses a row that does not fill the box', async () => {
    const document = await tracked();
    const logo = document['logo'] as { pixels: string[] };

    expect(() =>
      readTargTitleLogo({
        ...document,
        logo: {
          ...logo,
          pixels: [logo.pixels[0]!.slice(1), ...logo.pixels.slice(1)]
        }
      })
    ).toThrow('logo.pixels[0]');
  });
});
