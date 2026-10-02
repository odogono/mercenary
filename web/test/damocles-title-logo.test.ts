import { describe, expect, test } from 'bun:test';

import {
  damoclesLogoRgba,
  parseDamoclesTitle
} from '../src/damocles/titleLogo.ts';

const tracked = async () =>
  (await Bun.file('../payload/damocles/title.json').json()) as Record<
    string,
    unknown
  >;

describe('the Damocles Title Logo', () => {
  test('is the 284 by 43 lettering in the title screen palette', async () => {
    const doc = parseDamoclesTitle(await tracked());
    expect([doc.logo.width, doc.logo.height]).toEqual([284, 43]);
    expect(doc.palette).toHaveLength(16);
    const catalogue = (await Bun.file(
      '../payload/damocles/catalogue.json'
    ).json()) as { source: { programSha256: string } };
    expect(doc.programSha256).toBe(catalogue.source.programSha256);
  });

  test('leaves colour 0 clear and paints the rest opaque in ST colours', () => {
    const doc = parseDamoclesTitle({
      kind: 'title-logo',
      logo: { height: 1, pixels: ['0f5'], width: 3 },
      palette: {
        colours: [0, 0, 0, 0, 0, 0x7_00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x7_77]
      },
      schemaVersion: 1,
      source: { programSha256: 'a'.repeat(64) },
      title: 'Damocles'
    });
    expect([...damoclesLogoRgba(doc).data]).toEqual([
      0, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 255
    ]);
  });

  test('refuses a row that does not fill the logo width', async () => {
    const doc = await tracked();
    const logo = doc['logo'] as { pixels: string[] };
    logo.pixels[0] = logo.pixels[0]!.slice(1);
    expect(() => parseDamoclesTitle(doc)).toThrow('palette indices a row');
  });

  test('refuses a colour an ST cannot show', async () => {
    const doc = await tracked();
    (doc['palette'] as { colours: number[] }).colours[3] = 0x8_88;
    expect(() => parseDamoclesTitle(doc)).toThrow('ST colour word');
  });
});
