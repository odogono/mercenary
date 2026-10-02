import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { TaxiHistoryModel } from '../../research/mercenary-iii-st/scripts/taxi-history-model.ts';
import { dionContent } from './dion-documents.ts';

const programmes = JSON.parse(
  readFileSync(
    new URL(
      '../../payload/dion/tourcraft/presentation/programmes.json',
      import.meta.url
    ),
    'utf8'
  )
);
const gameplay = JSON.parse(
  readFileSync(
    new URL(
      '../../payload/dion/tourcraft/presentation/gameplay.json',
      import.meta.url
    ),
    'utf8'
  )
);
const model = async () =>
  new TaxiHistoryModel(await dionContent(), programmes, gameplay.initial);

test('threshold launch precedes a signed due continuation and preserves the return stack', async () => {
  const m = await model();
  m.state.pc = null;
  m.state.flags[6] = false;
  m.state.stack.push(0x7_66_ec);
  m.state.target = 0x5c_d2;
  m.state.timer = 0xff_ff;
  m.beforeInput(32_400);
  expect<number | null>(m.state.pc).toBe(0x7_59_d2);
  expect(m.state.target).toBe(0x5c_d2);
  expect(m.state.flags[6]).toBe(true);
  expect(m.state.stack).toEqual([0x7_66_ec, null]);
});

test('busy threshold attempts queue without consuming availability, and zero timer is not due', async () => {
  const m = await model();
  m.beforeInput(32_400);
  expect(m.state.queue).toBe(0x77);
  expect(m.state.availability[0x77]).toBe(0xa0);
  m.state.flags[6] = false;
  m.state.availability[0x77] = 0;
  m.state.target = 0x5c_d2;
  m.state.timer = 0;
  m.beforeInput(32_400);
  expect(m.state.target).toBe(0x5c_d2);
  m.tick();
  m.beforeInput(32_400);
  expect(m.state.target).toBe(0);
  expect(m.state.pc).toBe(0x7_5a_16);
  expect(m.state.timer).toBe(0xff_ff);
});

test('the decoded default campaign closes, clears cash, and never reaches excluded flags', async () => {
  const m = await model();
  for (let tick = 1; tick <= 30_000; tick++) {
    m.tick();
    if (tick % 11 === 0) {
      m.beforeInput(tick < 20_000 ? 32_400 : 61_200);
      m.frame();
    }
  }
  expect(m.state.cash).toBe('000000000000');
  expect(m.state.flags[9]).toBe(true);
  expect(m.state.flags[23]).toBe(true);
  expect(m.state.flags[10]).toBe(false);
  expect(m.state.flags[22]).toBe(false);
  expect(m.state.pc).toBe(null);
  expect(m.state.target).toBe(0);
  expect(m.state.lastEncounterRequest).toBe(0xff_db);
});

test('independent message timing retains all recovered pilot requests and the frame-139 zero-tick reentry', async () => {
  const m = await model();
  m.state.pc = null;
  m.state.flags[6] = false;
  m.state.messageRemaining = 0;
  m.state.hold = 200; // Naturally reached pre-B state after the prison script.
  m.start(0x29);
  for (let frame = 1; frame <= 745; frame++) {
    for (let tick = 0; tick < 11; tick++) {
      m.tick();
    }
    if (frame === 1) {
      continue;
    } // The armed start's first fetch belongs to frame 2.
    m.beforeInput(0);
    m.frame();
    if (frame === 139) {
      m.beforeInput(0);
      m.frame();
    }
  }
  expect(m.requests).toHaveLength(39);
  expect((m.requests.find(r => r.address === 0x7_05_81)?.tick ?? -1) / 11).toBe(
    16
  );
  expect((m.requests.find(r => r.address === 0x7_06_1e)?.tick ?? -1) / 11).toBe(
    152
  );
  expect((m.requests.find(r => r.address === 0x7_08_97)?.tick ?? -1) / 11).toBe(
    715
  );
  expect(m.state.pc).toBe(null);
});
