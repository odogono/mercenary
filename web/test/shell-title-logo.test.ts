import { inflateSync } from 'node:zlib';
import { describe, expect, test } from 'bun:test';

import {
  checkTargTitleLogo,
  checkTargTitleLogoFile,
  readTargTitleLogo
} from '../src/shell/titleLogo.ts';

const payload = new URL('../../payload/targ-st/', import.meta.url);

const tracked = async (): Promise<Record<string, unknown>> =>
  (await Bun.file(new URL('title.json', payload)).json()) as Record<
    string,
    unknown
  >;

/// The tracked PNG as RGBA: it is 1-bit indexed with unfiltered rows, as the exporter writes it.
const decoded = async (): Promise<{
  data: Uint8ClampedArray;
  height: number;
  width: number;
}> => {
  const bytes = new Uint8Array(
    await Bun.file(new URL('title.png', payload)).arrayBuffer()
  );
  const view = new DataView(bytes.buffer);
  const chunks = new Map<string, Uint8Array>();
  const idat: Uint8Array[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at);
    const kind = new TextDecoder().decode(bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (kind === 'IDAT') {
      idat.push(body);
    }
    chunks.set(kind, body);
    at += 12 + length;
  }
  const header = new DataView(chunks.get('IHDR')!.slice().buffer);
  const [width, height] = [header.getUint32(0), header.getUint32(4)];
  const palette = chunks.get('PLTE')!;
  const raw = inflateSync(Buffer.concat(idat));
  const span = Math.ceil(width / 8) + 1;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((raw[y * span + 1 + (x >> 3)]! >> (7 - (x & 7))) & 1) {
        data.set([...palette.subarray(3, 6), 255], (y * width + x) * 4);
      }
    }
  }
  return { data, height, width };
};

describe("Targ's Title Logo from the ST title picture", () => {
  test('validates the downloaded PNG bytes and refuses a changed file', async () => {
    const logo = readTargTitleLogo(await tracked());
    const bytes = await Bun.file(new URL('title.png', payload)).arrayBuffer();
    await expect(checkTargTitleLogoFile(logo, bytes)).resolves.toBeUndefined();

    new Uint8Array(bytes)[bytes.byteLength - 1]! ^= 1;
    await expect(checkTargTitleLogoFile(logo, bytes)).rejects.toThrow(
      'is not the PNG title.json hashes'
    );
  });

  test('reads the tracked document as the yellow MERCENARY mark', async () => {
    const logo = readTargTitleLogo(await tracked());

    expect([logo.width, logo.height]).toEqual([304, 116]);
    expect(logo.colour).toBe(0x7_70);
    expect(logo.file).toBe('title.png');
  });

  test('accepts the tracked PNG as the mark the document hashes', async () => {
    const logo = readTargTitleLogo(await tracked());
    const image = await decoded();

    expect(image.data.filter((_, i) => i % 4 === 3 && _ === 255).length).toBe(
      6389
    );
    await expect(checkTargTitleLogo(logo, image)).resolves.toBeUndefined();
  });

  test('refuses a PNG with a pixel the mark does not have', async () => {
    const logo = readTargTitleLogo(await tracked());
    const image = await decoded();
    image.data.set([255, 255, 0, 255], 0);

    await expect(checkTargTitleLogo(logo, image)).rejects.toThrow(
      'is not the mark title.json hashes'
    );
  });

  test('refuses a PNG in another colour or size', async () => {
    const logo = readTargTitleLogo(await tracked());
    const image = await decoded();

    await expect(
      checkTargTitleLogo({ ...logo, colour: 0x7_77 }, image)
    ).rejects.toThrow('outside the mark');
    await expect(
      checkTargTitleLogo({ ...logo, width: 303 }, image)
    ).rejects.toThrow('is not 303 by 116');
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
});
