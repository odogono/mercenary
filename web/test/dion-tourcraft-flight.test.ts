import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'bun:test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { TourcraftFlight } from '../src/dion/tourcraftFlight.ts';

const root = resolve(import.meta.dir, '../..');
const content = await loadTourcraftContent(async path => {
  const text = readFileSync(resolve(root, `.${path}`), 'utf8');
  return { text, value: JSON.parse(text) };
});

test('replays the supported craft journey without steering or phase deadlines', () => {
  const flight = new TourcraftFlight(content);
  const transitions: [number, string][] = [];
  for (let frame = 0; frame <= 928; frame += 1) {
    const before = flight.state.mode;
    flight.frame(0);
    if (flight.state.mode !== before) {
      transitions.push([frame, flight.state.mode]);
    }
  }
  expect(transitions).toEqual([
    [139, 'space'],
    [462, 'surface'],
    [927, 'foot']
  ]);
  expect(flight.state.craft).toMatchObject({
    x: 0x0a_b2_93_c2,
    y: 63,
    yaw: 0xfd_79,
    z: 0x06_23_8b_ef
  });
  expect(flight.state.nextAction).toBe(134);
  expect(flight.state.body).toBe(100);
});
