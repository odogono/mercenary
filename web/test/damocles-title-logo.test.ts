import { inflateSync } from 'node:zlib';
import { describe, expect, test } from 'bun:test';

import { parseDamoclesTitle } from '../src/damocles/titleLogo.ts';
import { checkTitleLogoFile } from '../src/shell/titleLogo.ts';

const payload = new URL('../../payload/damocles/', import.meta.url);

const tracked = async (): Promise<Record<string, unknown>> =>
  (await Bun.file(new URL('title.json', payload)).json()) as Record<
    string,
    unknown
  >;

const png = async (): Promise<ArrayBuffer> =>
  Bun.file(new URL('title.png', payload)).arrayBuffer();

/// The tracked PNG's IHDR, palette, transparency and inflated rows, as the exporter writes them.
const chunks = (bytes: Uint8Array): Map<string, Uint8Array> => {
  const view = new DataView(bytes.buffer);
  const found = new Map<string, Uint8Array>();
  const idat: Uint8Array[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at);
    const kind = new TextDecoder().decode(bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (kind === 'IDAT') {
      idat.push(body);
    } else {
      found.set(kind, body);
    }
    at += 12 + length;
  }
  found.set('rows', inflateSync(Buffer.concat(idat)));
  return found;
};

describe('the Damocles Title Logo', () => {
  test('is the 284 by 43 lettering of the Catalogue program', async () => {
    const logo = parseDamoclesTitle(await tracked());
    expect([logo.width, logo.height]).toEqual([284, 43]);
    expect(logo.file).toBe('title.png');
    const catalogue = (await Bun.file(
      '../payload/damocles/catalogue.json'
    ).json()) as { source: { programSha256: string } };
    expect(logo.programSha256).toBe(catalogue.source.programSha256);
  });

  test('ships a 4-bit PNG in the title palette whose indices the document hashes', async () => {
    const doc = await tracked();
    const logo = parseDamoclesTitle(doc);
    const parts = chunks(new Uint8Array(await png()));
    const header = new DataView(parts.get('IHDR')!.slice().buffer);
    expect([header.getUint32(0), header.getUint32(4)]).toEqual([284, 43]);
    expect([header.getUint8(8), header.getUint8(9)]).toEqual([4, 3]);
    expect([...parts.get('tRNS')!]).toEqual([0]);

    // Each PNG palette entry is the ST colour word at the same index, three bits a gun.
    const gun = (word: number, shift: number) =>
      Math.round((((word >> shift) & 7) * 255) / 7);
    const colours = (doc['palette'] as { colours: number[] }).colours;
    expect([...parts.get('PLTE')!]).toEqual(
      colours.flatMap(c => [gun(c, 8), gun(c, 4), gun(c, 0)])
    );

    const rows = parts.get('rows')!;
    const span = Math.ceil(logo.width / 2);
    const nibbles = new Uint8Array(span * logo.height);
    for (let y = 0; y < logo.height; y++) {
      expect(rows[y * (span + 1)]).toBe(0);
      nibbles.set(
        rows.subarray(y * (span + 1) + 1, (y + 1) * (span + 1)),
        y * span
      );
    }
    const digest = new Bun.CryptoHasher('sha256').update(nibbles).digest('hex');
    expect(digest).toBe(logo.markSha256);
  });

  test('validates the PNG bytes and refuses a changed file', async () => {
    const logo = parseDamoclesTitle(await tracked());
    const bytes = await png();
    await expect(
      checkTitleLogoFile(logo, bytes, 'title.png')
    ).resolves.toBeUndefined();
    new Uint8Array(bytes)[bytes.byteLength - 1]! ^= 1;
    await expect(checkTitleLogoFile(logo, bytes, 'title.png')).rejects.toThrow(
      'is not the PNG title.json hashes'
    );
  });

  test('refuses a document that names another image', async () => {
    const doc = await tracked();
    (doc['logo'] as { image: { file: string } }).image.file = 'other.png';
    expect(() => parseDamoclesTitle(doc)).toThrow('expected title.png');
  });
});
