import { createHash } from 'node:crypto';
import { expect, it } from 'bun:test';

import { CRAFT_CONSTANTS, parseCatalogue } from '../src/catalogue/data.ts';
import { craftLog } from '../src/damocles/craftTables.ts';
import { loadCatalogue, readRawCatalogue } from './fixtures/catalogue.ts';

const digest = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const bigEndian = (values: ArrayLike<number>, width: 2 | 4): Uint8Array => {
  const bytes = new Uint8Array(values.length * width);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i += 1) {
    if (width === 2) {
      view.setUint16(i * 2, values[i]!);
    } else {
      view.setUint32(i * 4, values[i]!);
    }
  }
  return bytes;
};

it('publishes a Craft Parameter Block for every slot, by the routine each branches to', async () => {
  const craft = (await loadCatalogue()).craft!;
  expect(craft.slots.map(slot => slot.class)).toEqual([
    'space',
    'flying',
    'wheeled',
    'flying',
    'flying',
    'wheeled',
    'wheeled',
    'flying',
    'flying',
    'fall',
    'flying',
    'flying',
    'flying',
    'wheeled',
    'flying',
    'flying'
  ]);
  // V.I.P. LIMO: damping 2^-16, acceleration 6.0, no pitch step, lag 0.5, gain 0.525390625.
  expect(craft.slots[5]!.parameters).toEqual({
    ceiling: 90,
    pitchStep: 0,
    rollExponent: -32,
    speedLag: 0xff_ff_10_00,
    thrustGain: 0xff_ff_10_d0,
    turnAcceleration: 0x00_02_18_00,
    turnDamping: 0xff_f0_10_00
  });
  expect(craft.slots[9]!.fall).toEqual({
    pitchStep: 25,
    tumbleStep: 13,
    yawStep: 19,
    yStep: 37
  });
  expect(Object.keys(craft.constants).sort()).toEqual([...CRAFT_CONSTANTS]);
  expect(craft.constants.landingStep).toEqual({
    address: 0x05_82_d8,
    operand: -100
  });
});

it('carries the exponent and sine tables the image holds', async () => {
  const { arithmetic } = (await loadCatalogue()).craft!;
  expect(digest(bigEndian(arithmetic.exp.words, 2))).toBe(
    arithmetic.exp.sha256
  );
  expect(digest(bigEndian(arithmetic.sine.longs, 4))).toBe(
    arithmetic.sine.sha256
  );
  // Entry i is sin(2π(i + ½)/1024): the first is a small positive float, entry 256 is 1.0.
  expect(arithmetic.sine.longs[256]).toBe(0x00_00_10_00);
});

it('regenerates the log table the image holds, word for word', async () => {
  const { log } = (await loadCatalogue()).craft!.arithmetic;
  const words = log.ranges.flatMap(([start, end]) =>
    Array.from({ length: (end - start) / 2 }, (_, i) =>
      craftLog(start + i * 2 - 0x6_40_00)
    )
  );
  expect(digest(bigEndian(words, 2))).toBe(log.sha256);
  expect(() => craftLog(0x08_00)).toThrow(RangeError);
});

it('refuses a craft block that leaves out a constant', async () => {
  const raw = await readRawCatalogue();
  const craft = raw['craft'] as Record<string, unknown>;
  const { zero: _, ...constants } = craft['constants'] as Record<
    string,
    unknown
  >;
  expect(() =>
    parseCatalogue({ ...raw, craft: { ...craft, constants } })
  ).toThrow('the craft block does not carry every craft constant');
});

it('publishes what the launch, the space pass and the range scan read (#558)', async () => {
  const craft = (await loadCatalogue()).craft!;
  expect(craft.constants.launchGate).toEqual({
    address: 0x05_58_3c,
    operand: 100
  });
  expect(craft.constants.launchThrottle.operand).toBe(0x00_0e_f0_00);
  expect(craft.constants.spaceRangeScale.operand).toBe(0x00_10_10_00);
  expect(craft.constants.arrivalGap.operand).toBe(-7);
  expect(craft.arithmetic.octants).toEqual([
    0x00_00, 0x81_00, 0x84_00, 0x03_00, 0x82_00, 0x01_00, 0x02_00, 0x83_00
  ]);
  expect(digest(craft.arithmetic.arctan.bytes)).toBe(
    craft.arithmetic.arctan.sha256
  );
  // DIALIS to DAMOCLES, the scan's offsets `$74` down to 0, ERIS at 11.
  expect(craft.bodies).toHaveLength(30);
  expect(craft.bodies[11]).toEqual({
    extent: 0x00_12_12_c0,
    turn: 0x01_0e_1f_ad,
    x: -630_000,
    y: 0,
    z: 390_000
  });
  expect(craft.constants.landingY.operand).toBe(0x01_80_00_00);
  expect(craft.boot.range.value).toBe(0x00_0a_13_7a);
  expect(craft.boot.nearest.value).toBe(11 * 4);
  // The unnormalised `$2000` a range sum can leave reads `$FFF0`, the word past the table.
  expect(craftLog(0x20_00)).toBe(0xff_f0);
});

it('publishes the noise table the landing scripts draw from (#576)', async () => {
  const noise = (await loadCatalogue()).craft!.noise;
  expect(noise.words).toHaveLength(0x8_00);
  expect(digest(bigEndian(noise.words, 2))).toBe(noise.sha256);
  expect(noise.sha256).toBe(
    '7b5e79b4b9981da8357abca3c911d2bcf22a27700c5dafd25348beffe5f15770'
  );
  // 754 words let a gazetteer through, and the traced cross landing drew `$C887` at `$077A42`.
  expect(noise.words.filter(word => word >= 0xa0_00)).toHaveLength(754);
  expect(noise.words[0xa_42 / 2]).toBe(0xc8_87);
});
