import { existsSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { readTargPanelDocument } from '../src/shell/targPanelDocument.ts';
import {
  drawTargPanel,
  targPanelReadouts,
  targPanelRgba
} from '../src/shell/targPanelWriter.ts';

const hash = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

const raw = await Bun.file('../payload/targ-st/panel.json').json();
const doc = readTargPanelDocument(raw);
test('validates the full recovered art, fonts and independent Targ tapes', () => {
  expect(doc.art).toHaveLength(20_480);
  expect(doc.compass.frames).toHaveLength(576);
  expect(doc.pitch).toHaveLength(608);
  for (const mutate of [
    (copy: typeof raw) => copy.art.rows.pop(),
    (copy: typeof raw) => {
      copy.fonts.number.glyphs['0'][0] = 'no';
    },
    (copy: typeof raw) => copy.compass.frames.pop(),
    (copy: typeof raw) => {
      copy.palette.colours[0] = 0x8_88;
    },
    (copy: typeof raw) => {
      delete copy.fonts.message.glyphs['A'];
    }
  ]) {
    const copy = structuredClone(raw);
    mutate(copy);
    expect(() => readTargPanelDocument(copy)).toThrow();
  }
});

test('adapters preserve the shared attitude values and bound native readout widths', () => {
  expect(
    targPanelReadouts({
      altitude: '100000',
      altitudeLamp: true,
      compassDegrees: 90,
      elevationDegrees: 30,
      groundLamp: true,
      locationLabel: 'RM 09',
      message: 'A'.repeat(24),
      runLamp: false,
      speed: '-10000'
    })
  ).toEqual({
    altitude: '*****',
    headingWord: 768,
    lamps: { altitude: 5, location: 5, speed: 15 },
    location: '09-**',
    message: 'A'.repeat(23),
    pitchWord: 427,
    speed: '-****'
  });
});

/// Tracked native-output hashes run without Restricted Material; when RAM is
/// available, verify its provenance and decode it independently as well.
const proofs = await Bun.file(
  'test/fixtures/targ-st-panel-writers.json'
).json();
for (const sample of proofs.samples) {
  test(`matches bounded native writer proof ${sample.capture}`, async () => {
    const image = drawTargPanel(doc, sample.view);
    const path = `../restricted/targ-st-panel-743/${sample.capture}`;
    const ram = existsSync(path)
      ? Buffer.from(await Bun.file(path).arrayBuffer())
      : undefined;
    if (ram !== undefined) {
      expect(hash(ram)).toBe(sample.captureSha256);
    }
    for (const region of sample.regions) {
      const [left, top, right, bottom] = region.box as number[];
      const expected: number[] = [];
      const actual: number[] = [];
      for (let y = top!; y < bottom!; y++) {
        for (let x = left!; x < right!; x++) {
          actual.push(image.pixels[y * 320 + x]! & region.mask);
          if (ram !== undefined) {
            const base = ram.readUInt32BE(0x6_23_40) ^ 0x1_00_00;
            const at = base + (136 + y) * 160 + Math.floor(x / 16) * 8;
            let bits = 0;
            for (let p = 0; p < 4; p++) {
              bits |=
                ((ram.readUInt16BE(at + p * 2) >> (15 - (x % 16))) & 1) << p;
            }
            expected.push(bits & region.mask);
          }
        }
      }
      expect(hash(Uint8Array.from(actual))).toBe(region.sha256);
      if (ram !== undefined) {
        expect(hash(Uint8Array.from(expected))).toBe(region.sha256);
      }
    }
  });
}

test('maps displayed bearings to the descending native compass tape at all quarters', () => {
  for (const [degrees, word] of [
    [0, 0],
    [90, 768],
    [180, 512],
    [270, 256],
    [360, 0],
    [-90, 256]
  ]) {
    expect(
      targPanelReadouts({
        altitude: '00000',
        altitudeLamp: false,
        compassDegrees: degrees!,
        elevationDegrees: 0,
        groundLamp: false,
        locationLabel: '08-08',
        message: '',
        runLamp: false,
        speed: '+0000'
      }).headingWord
    ).toBe(word!);
  }
});

test('writes stay in Targ owned fields and preserve every other artwork bit', () => {
  const image = drawTargPanel(doc, proofs.samples[0].view);
  const windows = [
    [72, 13, 88, 18, 5],
    [96, 13, 112, 18, 5],
    [144, 13, 184, 18, 4],
    [216, 13, 256, 18, 4],
    [16, 13, 32, 45, 12],
    [272, 29, 304, 45, 8],
    [64, 39, 248, 46, 1],
    [55, 13, 60, 19, 15],
    [127, 13, 132, 19, 15],
    [199, 13, 204, 19, 15]
  ] as const;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 320; x++) {
      const mask = windows.reduce(
        (mask, [left, top, right, bottom, planes]) =>
          mask |
          (x >= left && x < right && y >= top && y < bottom ? planes : 0),
        0
      );
      expect((image.pixels[y * 320 + x]! ^ doc.art[y * 320 + x]!) & ~mask).toBe(
        0
      );
    }
  }
});

test('retains Arrival placeholders and clips unsupported message text to the aperture', () => {
  const view = targPanelReadouts({
    altitude: '*****',
    altitudeLamp: false,
    compassDegrees: 360,
    elevationDegrees: -180,
    groundLamp: false,
    locationLabel: '**-**',
    message: '\u2603'.repeat(24),
    runLamp: true,
    speed: '*****'
  });
  expect(view.speed).toBe('*****');
  expect(view.location).toBe('**-**');
  expect(view.altitude).toBe('*****');
  expect(view.message).toHaveLength(23);
  expect(view.pitchWord).toBe(0);
  expect(drawTargPanel(doc, view).pixels).toHaveLength(20_480);
});

test('preserves Metal Detector colours in message ink while retaining all recovered pixels and other colours', () => {
  const image = drawTargPanel(doc, proofs.samples[0].view);
  const plain = new Uint8ClampedArray(320 * 64 * 4);
  targPanelRgba(image, plain);
  for (const [colour, ink] of [
    [2, [171, 60, 101]],
    [5, [94, 214, 56]],
    [6, [58, 49, 255]]
  ] as const) {
    const rgba = new Uint8ClampedArray(plain.length);
    targPanelRgba(image, rgba, colour);
    let changed = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 320; x++) {
        const at = y * 320 + x;
        const messageInk =
          y >= 39 &&
          y < 46 &&
          x >= 64 &&
          x < 248 &&
          (image.pixels[at]! & 1) === 0;
        expect(Array.from(rgba.slice(at * 4, at * 4 + 3))).toEqual(
          messageInk ? [...ink] : Array.from(plain.slice(at * 4, at * 4 + 3))
        );
        if (messageInk) {
          changed++;
        }
      }
    }
    expect(changed).toBeGreaterThan(0);
  }
});

test('bounds every room number including the world-flip and random rooms', () => {
  for (const label of ['RM 100', 'RM 114', 'RM 127', 'RM 191']) {
    expect(
      targPanelReadouts({
        altitude: '00000',
        altitudeLamp: false,
        compassDegrees: 0,
        elevationDegrees: 0,
        groundLamp: false,
        locationLabel: label,
        message: '',
        runLamp: false,
        speed: '+0000'
      }).location
    ).toBe('**-**');
  }
});
