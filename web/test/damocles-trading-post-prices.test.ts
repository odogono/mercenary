import { beforeAll, describe, expect, test } from 'bun:test';

import {
  parseCatalogue,
  type AssembledCatalogue
} from '../src/catalogue/data.ts';
import { loadCatalogue, readRawCatalogue } from './fixtures/catalogue.ts';

/// What a Trading Post quotes is an object's Base Price times that post's Buy Rate or Sell
/// Rate ($04E05A). The Catalogue publishes the two recovered inputs and leaves the product to
/// the session (#1026): the Base Price on the object Model and its index entry, and the rates
/// on the placement whose ground floor is the trading structure.
const TRADING_STRUCTURE = 'structure-015eea';
const MEGA_TRADING = 'gaea-chaldea-metropolis-surface-65';

let catalogue: AssembledCatalogue;

beforeAll(async () => {
  catalogue = await loadCatalogue();
});

const basePriceOf = (name: string) => {
  const models = catalogue.models.filter(
    model => model.kind === 'object' && model.name === name
  );
  expect(models.length).toBeGreaterThan(0);
  return models[0]!.basePrice;
};

/// The structure a placement's ground floor binds: the Floor table's level 0, or the Model itself.
const groundFloor = (model: string) =>
  catalogue.modelIndex
    .find(entry => entry.id === model)
    ?.floorStructures?.find(floor => floor.level === 0)?.structureId ?? model;

describe('the Damocles Base Prices', () => {
  test("are hundredths of a credit, the balance's own unit", () => {
    expect(basePriceOf('GOLD')).toBe(500_000);
    expect(basePriceOf('HI-FI')).toBe(250_000);
    expect(basePriceOf('FRIDGE')).toBe(3425);
  });

  test('are zero for the craft and DOOR KEY A, which is still a price', () => {
    expect(basePriceOf('DOOR KEY A')).toBe(0);
    expect(basePriceOf('DART II')).toBe(0);
  });

  test('are null on the five resident Models with no name header', () => {
    const resident = new Set(
      catalogue.instances
        .filter(instance => instance.id.startsWith('object-slot-'))
        .map(instance => instance.model)
    );
    const unpriced = catalogue.models
      .filter(model => resident.has(model.id) && model.basePrice === null)
      .map(model => model.slots[0]!)
      .sort((a, b) => a - b);
    expect(unpriced).toEqual([74, 156, 248, 251, 254]);
  });

  test('belong to object Models only, and agree with the model index', () => {
    for (const model of catalogue.models) {
      expect(model.basePrice === undefined).toBe(model.kind !== 'object');
    }
    for (const entry of catalogue.modelIndex) {
      const model = catalogue.models.find(m => m.id === entry.id)!;
      expect(entry.basePrice).toBe(model.basePrice);
    }
  });

  test('refuse a Model whose Base Price the index does not carry', async () => {
    const raw = await readRawCatalogue();
    const models = raw.models.map(model =>
      (model as { name: string }).name === 'GOLD'
        ? { ...(model as object), basePrice: 1 }
        : model
    );
    expect(() => parseCatalogue({ ...raw, models })).toThrow(
      /basePrice disagrees with the model index/
    );
  });
});

describe('the Damocles Trading Post rates', () => {
  test('stand on every placement whose ground floor trades, and nowhere else', () => {
    let posts = 0;
    for (const instance of catalogue.instances) {
      const trades = groundFloor(instance.model) === TRADING_STRUCTURE;
      expect(instance.tradingPost !== null).toBe(trades);
      posts += trades ? 1 : 0;
    }
    expect(posts).toBe(79);
  });

  test('charge more to buy than they pay to sell at every post', () => {
    for (const { tradingPost } of catalogue.instances) {
      if (tradingPost !== null) {
        expect(tradingPost.buyRate).toBeGreaterThan(tradingPost.sellRate);
      }
    }
  });

  test('make MEGA TRADING ask 40,000.00 for the HI-FI it offers', () => {
    const post = catalogue.instances.find(i => i.id === MEGA_TRADING)!;
    expect(post.name).toBe('MEGA TRADING');
    expect(post.tradingPost).toEqual({ buyRate: 16, sellRate: 10 });
    expect(basePriceOf('HI-FI')! * post.tradingPost!.buyRate).toBe(4_000_000);
    expect(basePriceOf('GOLD')! * post.tradingPost!.sellRate).toBe(5_000_000);
  });
});
