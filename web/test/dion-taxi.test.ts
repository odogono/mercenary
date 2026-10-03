import { describe, expect, test } from 'bun:test';

import { createTaxi, stepTaxi, type DionTaxi } from '../src/dion/service.ts';
import { dionContent } from './dion-documents.ts';

// Rule-level acceptance from #642, independent of the implementation's route loop.
describe('METIS taxi service at eleven ticks per frame', () => {
  for (const [destination, frames, endpoint, turns] of [
    [0x60, 112, [0x09_df_80_80, 0, 0x04_30_80_00], [112]],
    [0x02, 507, [0x09_e1_80_00, 0, 0x04_2a_80_80], [112, 218, 370, 419, 507]]
  ] as const) {
    test(`reaches ${destination} after ${frames} frames, then descends for 22`, async () => {
      const content = await dionContent();
      let taxi: DionTaxi = {
        ...createTaxi(content),
        counter: 2,
        destination: Number(destination),
        heading: 0x1_00,
        passenger: true,
        position: [0x09_e1_80_00, 0, 0x04_30_7f_80] as const,
        progress: 0,
        routeIndex: 0,
        start: true
      };
      const observed: number[] = [];
      taxi = stepTaxi(content, taxi, 0x62).taxi;
      for (let frame = 1; frame <= frames; frame += 1) {
        const previous = taxi.heading;
        const result = stepTaxi(content, taxi, frame === 1 ? 0x62 : taxi.cell);
        taxi = result.taxi;
        if (taxi.heading !== previous) {
          observed.push(frame);
        }
        expect(result.arrived).toBe(frame === frames);
      }
      expect(taxi.destination).toBe(0);
      expect(taxi.position[0]).toBe(endpoint[0]);
      expect(taxi.position[2]).toBe(endpoint[2]);
      expect(taxi.counter).toBe(35);
      expect(observed).toEqual([...turns]);
      for (let frame = 1; frame <= 22; frame += 1) {
        taxi = stepTaxi(content, taxi, taxi.cell).taxi;
        expect(taxi.counter === 2).toBe(frame === 22);
      }
      expect(taxi.position).toEqual(endpoint);
    });
    test(`selection ${destination} remains stationary without Start`, async () => {
      const content = await dionContent();
      let taxi: DionTaxi = {
        ...createTaxi(content),
        counter: 2,
        destination: Number(destination),
        passenger: true
      };
      const position = taxi.position;
      for (let frame = 0; frame < 1200; frame += 1) {
        taxi = stepTaxi(content, taxi, taxi.cell).taxi;
      }
      expect(taxi.position).toEqual(position);
      expect(taxi.destination).toBe(destination);
    });
  }
});

test('uses the returning occurrence of a repeated cell and batches empty circulation', async () => {
  const content = await dionContent();
  const [gx, gz] = content.world.opening.groupOrigin;
  const base = createTaxi(content);
  // Returning point 17 has nibble one, although outbound point 11 has zero.
  const returning: DionTaxi = {
    ...base,
    cell: 0x14,
    heading: 512,
    position: [(gx + 4) * 65_536 + 32_768, 25, (gz + 1) * 65_536 + 32_640],
    progress: 0,
    routeIndex: 17
  };
  const advanced = stepTaxi(content, returning, 0x62).taxi;
  expect(advanced.progress).toBe(16_384);
  const outbound: DionTaxi = {
    ...base,
    cell: 0x14,
    heading: 0,
    position: [(gx + 4) * 65_536 + 32_768, 25, (gz + 1) * 65_536 + 32_896],
    progress: 0,
    routeIndex: 11
  };
  expect(stepTaxi(content, outbound, 0x62).taxi.progress).toBe(16_384);
  let taxi = advanced;
  let wrapped = false;
  for (let frame = 0; frame < 1000; frame += 1) {
    const old = taxi.routeIndex;
    taxi = stepTaxi(content, taxi, 0x62).taxi;
    if (old === 25 && taxi.routeIndex === 0) {
      wrapped = true;
      break;
    }
  }
  expect(wrapped).toBe(true);
});

test('negative taxi movement complements the positive word ($51FDC/$5200A)', async () => {
  const content = await dionContent();
  const taxi = {
    ...createTaxi(content),
    heading: 256,
    passenger: true,
    progress: 0
  };
  const next = stepTaxi(content, taxi, taxi.cell).taxi;
  expect(next.position[0] - taxi.position[0]).toBe(-1025);
});
