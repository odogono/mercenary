import { deflateSync, inflateSync } from 'node:zlib';

/// Just enough PNG for laboratory screenshots: 8-bit RGB or RGBA, not interlaced.

export interface Rgb {
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly width: number;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const decodePng = (data: Uint8Array): Rgb => {
  if (SIGNATURE.some((byte, index) => data[index] !== byte)) {
    throw new Error('not a PNG');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  for (let at = 8; at < data.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...data.subarray(at + 4, at + 8));
    const body = data.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      channels = colour === 2 ? 3 : colour === 6 ? 4 : 0;
      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error('only 8-bit, non-interlaced RGB or RGBA PNGs are read');
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? rows[y * stride + x - channels]! : 0;
      const up = y > 0 ? rows[(y - 1) * stride + x]! : 0;
      const corner =
        x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels]! : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : paeth(left, up, corner);
      rows[y * stride + x] = (line[x]! + predictor) & 0xff;
    }
  }
  const pixels = new Uint8Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    pixels.set(
      rows.subarray(index * channels, index * channels + 3),
      index * 3
    );
  }
  return { height, pixels, width };
};

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

const crc = (bytes: Uint8Array): number => {
  let c = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xff_ff_ff_ff) >>> 0;
};

export const encodePng = ({ height, pixels, width }: Rgb): Uint8Array => {
  const raw = new Uint8Array(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    raw.set(
      pixels.subarray(y * width * 3, (y + 1) * width * 3),
      y * (width * 3 + 1) + 1
    );
  }
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    out.set(
      [...type].map(c => c.charCodeAt(0)),
      4
    );
    out.set(body, 8);
    view.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)));
    return out;
  };
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array())
  ]);
};
