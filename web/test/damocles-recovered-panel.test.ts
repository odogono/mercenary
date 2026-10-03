import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { readDamoclesPanelDocument } from '../src/damocles/panelDocument.ts';
import {
  damoclesReadoutWords,
  drawDamoclesPanel,
  type DamoclesPanelView
} from '../src/damocles/panelWriter.ts';
import { slidingCompassFrame } from '../src/shell/panelPixels.ts';

const raw = await Bun.file('../payload/damocles/panel.json').json();
const doc = readDamoclesPanelDocument(raw);
const view: DamoclesPanelView = {
  altitude: '000000',
  cash: '00000900000',
  centre: { from: null, steps: 0, to: null },
  clockSeconds: -8583,
  gauges: { inventory: 2, p: 36, t: 23 },
  grid: [7, 8],
  heading: 0x6_00,
  inventory: 'EMPTY',
  lamps: { attack: false, ground: false, run: false },
  location: 'ERIS',
  mask: 0,
  message: {
    cells: ' '.repeat(48),
    planes: Array(48).fill(0),
    scrollPixels: 0
  },
  pitch: 0x1_ff,
  position: [17, 290],
  speed: ['11', ...Array<string>(9).fill('0')]
};

describe('the recovered Damocles panel (#741)', () => {
  test('loads pristine artwork, complete fonts and Damocles centre definitions', () => {
    expect(doc.art).toHaveLength(64);
    expect(doc.art[0]).toHaveLength(320);
    expect(doc.fonts.get('panel')?.glyphs.size).toBe(64);
    expect(doc.compass.frames).toHaveLength(64);
    expect(doc.centre.definitions.get(151)).toEqual({
      band: 14,
      category: 2,
      colourA: 0x36,
      colourB: 0x2_57
    });
    expect(doc.gaps).toHaveLength(4);
  });

  test('all 64 Damocles frames equal the shared compass output under the documented phase', async () => {
    const dion = await Bun.file('../payload/dion/panel.json').json();
    expect(raw.compass.provenance.sha256).toBe(
      'd8af9950d7fedda5030ec8752192bd167c47a51c5d65053f0e7ad122ac319e54'
    );
    for (let step = 0; step < 64; step += 1) {
      const heading = (-step * 16) & 0x3_ff;
      expect(doc.compass.frames[step]).toEqual(
        slidingCompassFrame(dion.fields.compass.strip.rows, heading, [86, 117])
      );
    }
  });

  test('readout adapters preserve reverse speed, overflow, Floor 10 and space range', () => {
    const words = {
      eyeY: 70_084,
      floor: 0,
      panelSpeed: 107,
      rangeAltitude: null,
      speed: 0x6_1a_c2
    };
    expect(damoclesReadoutWords(words)).toEqual({
      altitude: '000668',
      speed: ['11', ...'000000039']
    });
    expect(damoclesReadoutWords({ ...words, eyeY: 105_000_000 }).altitude).toBe(
      '******'
    );
    expect(damoclesReadoutWords({ ...words, floor: 10 }).altitude).toBe(
      '******'
    );
    expect(
      damoclesReadoutWords({ ...words, rangeAltitude: 0x1_00_00 }).altitude
    ).toBe('010000');
    expect(
      damoclesReadoutWords({ ...words, panelSpeed: 0, speed: 0xff_ee_ef_30 })
        .speed
    ).toEqual(['12', ...'000000000']);
  });

  test('rejects truncated artwork, malformed fonts and out-of-bounds fields', () => {
    for (const alter of [
      (copy: typeof raw) => copy.panelArt.pixels.pop(),
      (copy: typeof raw) => {
        copy.fonts.clock.glyphs['0'][0] = 'x';
      },
      (copy: typeof raw) => {
        copy.fonts.clock.glyphs['missing'] = copy.fonts.clock.glyphs['0'];
        delete copy.fonts.clock.glyphs['0'];
      },
      (copy: typeof raw) => {
        copy.fields.speed.cells[0] = 320;
      },
      (copy: typeof raw) => copy.compass.frames.pop()
    ]) {
      const copy = structuredClone(raw);
      alter(copy);
      expect(() => readDamoclesPanelDocument(copy)).toThrow();
    }
  });

  test('changes only recovered speed and altitude windows when readouts change', () => {
    const before = drawDamoclesPanel(doc, view);
    const after = drawDamoclesPanel(doc, {
      ...view,
      altitude: '******',
      speed: ['12', ...Array<string>(9).fill('9')]
    });
    const changes = Array.from(before.pixels.keys()).filter(
      at => before.pixels[at] !== after.pixels[at]
    );
    expect(changes.length).toBeGreaterThan(0);
    expect(
      changes.every(at => {
        const x = at % 320;
        const y = 136 + Math.floor(at / 320);
        return (
          (y >= 161 && y <= 165 && x >= 72 && x <= 120) ||
          (y >= 172 && y <= 176 && x >= 94 && x <= 117)
        );
      })
    ).toBe(true);
    expect(before.pixels).not.toEqual(
      Uint8Array.from(doc.art.flatMap(row => Array.from(row)))
    );
  });

  test('swaps centre colours at the black midpoint and stamps the native title with ink 14', () => {
    const file = {
      item: 'PROBLEM',
      kind: 'document' as const,
      parameter: null,
      slot: 151
    };
    const draw = (steps: number) =>
      drawDamoclesPanel(doc, {
        ...view,
        centre: { from: steps === 0 ? file : null, steps, to: file }
      });
    expect(draw(33).palette.lower[1]).toBe(0);
    expect(draw(32).palette.lower[1]).toBe(0x36);
    expect(draw(32).palette.upper[4]).toBe(0x2_57);
    const centre = (image: ReturnType<typeof draw>) =>
      Array.from({ length: 32 }, (_, row) =>
        image.pixels.slice((24 + row) * 320 + 128, (24 + row) * 320 + 192)
      );
    expect(centre(draw(32)).every(row => row.every(value => value === 0))).toBe(
      true
    );
    expect(
      centre(draw(0))[1]!.every(value => value === 1 || value === 14)
    ).toBe(true);
    const masked = drawDamoclesPanel(doc, {
      ...view,
      centre: { from: file, steps: 0, to: file },
      mask: 0x33
    });
    expect(masked.palette.lower[1]).toBe(0x36 ^ 0x33);
    expect(masked.palette.upper[4]).toBe(0x2_57 ^ 0x33);
    expect(masked.palette.upper[0]).toBe(0);
    expect(masked.pixels).toEqual(draw(0).pixels);
  });
});

/// Restricted captures stay in the laboratory, never copied into tracked fixtures.
/// The existing independent memstate decoder supplies the RAM boundary only;
/// browser writer output is compared directly with both framebuffer bit planes.
for (const [capture, digest] of [
  [
    'eris-spaceport-onfoot',
    '1366881c62ab9e80a5fe8b1dcbb5dfa2ccc0142e4a921cd029f9dfc8f6b16465'
  ],
  [
    'boarded-limo',
    '2e1218cfcd7554520de5f0f56588a9920d976d8efa4b4c97508058e76759b224'
  ],
  [
    'dion-north-airborne',
    'faf7a4acb3c7d4bec435bea716ba5626389338b0522bf399e20d11896a8197cc'
  ]
] as const) {
  const path = `../research/damocles-st/snapshots/${capture}.sav`;
  test.skipIf(!existsSync(path))(
    `matches recovered windows in both ${capture} buffers`,
    () => {
      const process = Bun.spawnSync([
        'python3',
        '-c',
        'import sys; sys.path.insert(0,"../research/damocles-st"); from damocleslab.catalogue import hatari_memstate_ram; sys.stdout.buffer.write(hatari_memstate_ram(open(sys.argv[1],"rb").read()))',
        path
      ]);
      expect(process.exitCode).toBe(0);
      const ram = process.stdout;
      expect(new Bun.CryptoHasher('sha256').update(ram).digest('hex')).toBe(
        digest
      );
      const word = (at: number) => ram.readUInt16BE(at);
      const long = (at: number) => ram.readUInt32BE(at);
      const image = drawDamoclesPanel(doc, {
        ...view,
        ...damoclesReadoutWords({
          eyeY: ram.readInt32BE(0x7a_b6),
          floor: 0,
          panelSpeed: long(0x4_df_ec),
          rangeAltitude: null,
          speed: long(0x79_7a)
        }),
        clockSeconds: ram.readInt32BE(0x79_3c),
        heading: word(0x7a_c2),
        lamps: {
          attack: long(0x7_01_04) !== 0,
          ground: word(0x7a_8e) === 0 && long(0x7a_b6) < 0x28_fa,
          run: word(0x7b_3a) === 3
        },
        pitch: word(0x7a_c0)
      });
      const windows = [
        { cells: [16], planes: [1, 3], rows: 20, width: 16, y: 171 },
        { cells: [80], planes: [3], rows: 9, width: 40, y: 182 },
        { ...doc.fields.get('speed')!, planes: [3], width: 3 },
        { ...doc.fields.get('altitude')!, planes: [3], width: 3 },
        { ...doc.clock, width: 8 },
        ...doc.lamps.x.map(([x]) => ({
          cells: [x],
          planes: x === 199 ? [3] : x === 213 ? [0, 1] : [1],
          rows: 7,
          width: 5,
          y: 186
        }))
      ];
      for (const base of [0x6_80_00, 0x7_80_00]) {
        for (const window of windows) {
          const mismatches: string[] = [];
          for (const x0 of window.cells) {
            for (let y = window.y; y < window.y + window.rows; y += 1) {
              for (let x = x0; x < x0 + window.width; x += 1) {
                for (const plane of window.planes) {
                  const at =
                    base + y * 160 + Math.floor(x / 16) * 8 + plane * 2;
                  const expected = (word(at) >> (15 - (x % 16))) & 1;
                  const actual =
                    (image.pixels[(y - 136) * 320 + x]! >> plane) & 1;
                  if (expected !== actual) {
                    mismatches.push(`${base.toString(16)}:${x},${y},p${plane}`);
                  }
                }
              }
            }
          }
          expect(mismatches).toEqual([]);
        }
      }
    }
  );
}
