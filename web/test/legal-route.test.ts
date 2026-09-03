import { describe, expect, test } from 'bun:test';

import { LegalRoute } from './legalCheckpoint.ts';

/// Proves the checkpoint runner reaches real places through real play, so the
/// economy tests that lean on it are standing on a route rather than on setup.
describe('a route walked through the real world', () => {
  test('buys the Dart, walks to it and boards it', async () => {
    const route = await LegalRoute.open({ script: 0 });
    route.observe('crash-site');

    // The opening poll wants Y inside its five-second window.
    route.advance(76);
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    route.advance(4);
    route.observe('bought');

    route.run({ action: 'board', kind: 'reach', slot: 1 }, 240);
    route.observe('aboard');

    const start = route.observationAt('crash-site');
    const bought = route.observationAt('bought');
    const aboard = route.observationAt('aboard');

    expect(start['credits']).toBe(9000);
    expect(start['occupancy']).toBe(0x80);
    expect(bought['credits']).toBe(4000);
    expect(aboard['occupancy']).toBe(1);
  }, 60_000);
});
