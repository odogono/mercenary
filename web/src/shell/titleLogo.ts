/// `payload/targ-st/title.json` and `title.png`: Targ's Title Logo, recovered from the ST
/// release (#696).
///
/// The C64 Reference Build has no title screen (ADR 0032). The ST release's `ESCAPE.PRG`
/// shows the NEOchrome picture `E0` while it loads, and `research/targ-st/` reads that file
/// straight off the pinned disk. The logo is every pixel of palette index 3 there: the
/// MERCENARY lettering and the globe it overlaps. The PNG carries the mark; the document
/// carries its provenance and hashes of the PNG and the mark. It
/// is presentation only (ADR 0063).

export interface TargTitleLogo {
  /// The ST colour word of the mark.
  readonly colour: number;
  readonly file: string;
  readonly height: number;
  /// SHA-256 of the mark, one bit per pixel, most significant first, rows padded to a byte.
  readonly markSha256: string;
  /// SHA-256 of the downloaded PNG, before browser decoding or canvas readback.
  readonly pngSha256: string;
  readonly width: number;
}

interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly height: number;
  readonly width: number;
}

const refuse = (message: string): never => {
  throw new Error(`payload/targ-st/title.json: ${message}`);
};

const record = (value: unknown, path: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : refuse(`${path} is not a record`);

const size = (value: unknown, path: string, max: number): number =>
  Number.isInteger(value) && (value as number) > 0 && (value as number) <= max
    ? (value as number)
    : refuse(`${path} is not a size from 1 to ${max}`);

/// Read the document, refusing anything but this export of the Targ title picture.
export const readTargTitleLogo = (value: unknown): TargTitleLogo => {
  const raw = record(value, 'document');
  if (raw['schemaVersion'] !== 1 || raw['kind'] !== 'titleLogo') {
    refuse('is not a schema 1 titleLogo document');
  }
  if (record(raw['source'], 'source')['title'] !== 'targ') {
    refuse("source.title is not 'targ'");
  }
  const logo = record(raw['logo'], 'logo');
  const index = logo['index'];
  if (
    !Number.isInteger(index) ||
    (index as number) < 1 ||
    (index as number) > 15
  ) {
    refuse('logo.index is not a palette index from 1 to 15');
  }
  const colours = record(raw['palette'], 'palette')['colours'];
  if (
    !Array.isArray(colours) ||
    colours.length !== 16 ||
    !colours.every(c => Number.isInteger(c) && c >= 0 && c <= 0xf_ff)
  ) {
    refuse('palette.colours is not sixteen ST colour words');
  }
  const image = record(logo['image'], 'logo.image');
  const file = image['file'];
  const markSha256 = image['markSha256'];
  const pngSha256 = image['sha256'];
  if (file !== 'title.png') {
    refuse("logo.image.file is not 'title.png'");
  }
  if (typeof markSha256 !== 'string' || !/^[\da-f]{64}$/.test(markSha256)) {
    refuse('logo.image.markSha256 is not a SHA-256');
  }
  if (typeof pngSha256 !== 'string' || !/^[\da-f]{64}$/.test(pngSha256)) {
    refuse('logo.image.sha256 is not a SHA-256');
  }
  return {
    colour: (colours as number[])[index as number]!,
    file: file as string,
    height: size(logo['height'], 'logo.height', 200),
    markSha256: markSha256 as string,
    pngSha256: pngSha256 as string,
    width: size(logo['width'], 'logo.width', 320)
  };
};

const hexDigest = async (bytes: ArrayBuffer): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

/// An ST shows three bits a gun.
const gun = (word: number, shift: number): number =>
  Math.round((((word >> shift) & 7) * 255) / 7);

/// Refuse a decoded image that is not the mark the document describes: the declared size,
/// the mark's colour where drawn, transparent elsewhere, and the mark's hash.
export const checkTargTitleLogo = async (
  logo: TargTitleLogo,
  image: Pixels
): Promise<void> => {
  const where = `payload/targ-st/${logo.file}`;
  if (image.width !== logo.width || image.height !== logo.height) {
    throw new Error(`${where} is not ${logo.width} by ${logo.height}`);
  }
  const ink = [gun(logo.colour, 8), gun(logo.colour, 4), gun(logo.colour, 0)];
  const span = Math.ceil(logo.width / 8);
  const bits = new Uint8Array(span * logo.height);
  for (let y = 0; y < logo.height; y++) {
    for (let x = 0; x < logo.width; x++) {
      const at = (y * logo.width + x) * 4;
      const alpha = image.data[at + 3];
      if (alpha === 255 && ink.every((v, i) => image.data[at + i] === v)) {
        bits[y * span + (x >> 3)]! |= 0x80 >> (x & 7);
      } else if (alpha !== 0) {
        throw new Error(`${where} has a pixel at ${x},${y} outside the mark`);
      }
    }
  }
  if ((await hexDigest(bits.buffer)) !== logo.markSha256) {
    throw new Error(`${where} is not the mark title.json hashes`);
  }
};

const fetched = async (url: URL): Promise<Response> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url.pathname} answered HTTP ${response.status}`);
  }
  return response;
};

/// What a Title's document says its logo PNG is, for any Title (ADR 0063).
export interface TitleLogoPng {
  readonly height: number;
  /// SHA-256 of the PNG as served, before browser decoding or canvas readback.
  readonly pngSha256: string;
  readonly width: number;
}

/// Refuse a PNG whose bytes are not the file the document hashes.
export const checkTitleLogoFile = async (
  logo: TitleLogoPng,
  bytes: ArrayBuffer,
  where: string
): Promise<void> => {
  if ((await hexDigest(bytes)) !== logo.pngSha256) {
    throw new Error(`${where} is not the PNG title.json hashes`);
  }
};

/// Fetch a Title Logo PNG, check its bytes against the document, then decode it for
/// presentation. The bytes are checked before decoding, not the decoded pixels: privacy
/// browsers can alter canvas readback.
export const loadTitleLogoPng = async (
  logo: TitleLogoPng,
  url: URL
): Promise<ImageData> => {
  const where = url.pathname;
  const bytes = await (await fetched(url)).arrayBuffer();
  await checkTitleLogoFile(logo, bytes, where);
  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: 'image/png' }),
    { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }
  );
  if (bitmap.width !== logo.width || bitmap.height !== logo.height) {
    bitmap.close();
    throw new Error(`${where} is not ${logo.width} by ${logo.height}`);
  }
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext(
    '2d'
  )!;
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return image;
};

/// Check Targ's PNG bytes before decoding.
export const checkTargTitleLogoFile = (
  logo: TargTitleLogo,
  bytes: ArrayBuffer
): Promise<void> =>
  checkTitleLogoFile(logo, bytes, `payload/targ-st/${logo.file}`);

/// Fetch and validate Targ's PNG, then decode it for presentation.
export const loadTargTitleLogo = async (payload: URL): Promise<ImageData> => {
  const logo = readTargTitleLogo(
    await (await fetched(new URL('targ-st/title.json', payload))).json()
  );
  return loadTitleLogoPng(logo, new URL(`targ-st/${logo.file}`, payload));
};
