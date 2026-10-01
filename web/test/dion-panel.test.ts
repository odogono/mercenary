import { describe, expect, test } from 'bun:test';

import { PANEL_ROWS, PANEL_TOP, drawDionPanel } from '../src/dion/panel.ts';
import { DionSession, dionPanelView } from '../src/dion/session.ts';
import { dionContent } from './dion-documents.ts';

/// The panel is the recovered artwork with each readout written by its plane rule; the
/// values alone come from the session.

const differingRows = (a: Uint8Array, b: Uint8Array): number[] => {
  const rows = new Set<number>();
  a.forEach((value, index) => {
    if (value !== b[index]) {
      rows.add(PANEL_TOP + Math.floor(index / 320));
    }
  });
  return [...rows].sort((x, y) => x - y);
};

describe('the Mercenary III panel', () => {
  test('names METIS, the grid cell and the opening cash', async () => {
    const content = await dionContent();
    const view = dionPanelView(new DionSession(content).snapshot, content);
    expect(view.location).toBe('METIS');
    expect(view.grid).toEqual([2, 6]);
    expect(view.cash).toBe('005100900000');
    expect(view.inventory.trim()).toBe('TAXICARD');
    expect(view.centre).toEqual({ kind: 'logo' });
  });

  test('changes the clock and opening message as game time passes', async () => {
    const content = await dionContent();
    const session = new DionSession(content);
    const before = drawDionPanel(
      content.panel,
      dionPanelView(session.snapshot, content)
    );
    expect(before.pixels).toHaveLength(320 * PANEL_ROWS);
    session.advance(62);
    expect(session.snapshot.clock.seconds).toBe(62);
    const after = drawDionPanel(
      content.panel,
      dionPanelView(session.snapshot, content)
    );
    const rows = differingRows(before.pixels, after.pixels);
    expect(rows.length).toBeGreaterThan(0);
    // Clock at 186 and the tick-paced opening message at 144.
    expect(
      rows.every(row => (row >= 186 && row < 193) || (row >= 144 && row < 150))
    ).toBe(true);
  });

  test('shows the card text over the TAXICARD art when a card is up', async () => {
    const content = await dionContent();
    const view = dionPanelView(new DionSession(content).snapshot, content);
    const logo = drawDionPanel(content.panel, view);
    const card = drawDionPanel(content.panel, {
      ...view,
      centre: {
        kind: 'card',
        lines: content.panel.strings.card.get('pressToCall')!
      }
    });
    const rows = differingRows(logo.pixels, card.pixels);
    expect(rows[0]).toBeGreaterThanOrEqual(160);
    expect(rows.at(-1)).toBeLessThan(192);
    expect(card.palette.upper[4]).toBe(content.panel.centre.taxicard.colour4);
  });
});

test('keeps logo colours during scroll-out, swaps on the black midpoint, then reveals the card', async () => {
  const content = await dionContent();
  const view = dionPanelView(new DionSession(content).snapshot, content);
  const draw = (remaining: number) =>
    drawDionPanel(content.panel, {
      ...view,
      centre: { kind: 'card', lines: ['PRESS *', 'TO CALL'], reveal: remaining }
    });
  expect(draw(64).palette.upper[4]).toBe(content.panel.centre.logo.colour4);
  expect(draw(33).palette.lower[1]).toBe(
    content.panel.centre.logo.colour1From152
  );
  const halfway = draw(32);
  expect(halfway.palette.upper[4]).toBe(content.panel.centre.taxicard.colour4);
  const { box } = content.panel.centre;
  const centre = (image: ReturnType<typeof draw>) =>
    Array.from({ length: box.height }, (_, row) =>
      image.pixels.slice(
        (box.y + row - PANEL_TOP) * 320 + box.x,
        (box.y + row - PANEL_TOP) * 320 + box.x + box.width
      )
    );
  expect(centre(halfway).every(row => row.every(value => value === 0))).toBe(
    true
  );
  expect(centre(draw(16)).some(row => row.some(value => value !== 0))).toBe(
    true
  );
});
