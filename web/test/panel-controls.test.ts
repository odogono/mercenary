import { describe, expect, test } from 'bun:test';

import { readDamoclesPanelDocument } from '../src/damocles/panelDocument.ts';
import {
  TARG_PANEL_LAYOUT,
  centreBoxPage,
  recoveredPanelLayout,
  wheelPage
} from '../src/shell/panelControls.ts';
import { dionContent } from './dion-documents.ts';

describe('the shared panel controls’ layout', () => {
  test('lie over the same windows on the Damocles and Mercenary III panels', async () => {
    const damocles = readDamoclesPanelDocument(
      await Bun.file('../payload/damocles/panel.json').json()
    );
    const dion = (await dionContent()).panel;
    const fromDamocles = recoveredPanelLayout({
      centre: damocles.centre.box,
      inventory: damocles.fields.get('inventoryName')!,
      runLamp: {
        rows: damocles.lamps.rows,
        x: damocles.lamps.x[2]!,
        y: damocles.lamps.y
      }
    });
    const fromDion = recoveredPanelLayout({
      centre: dion.centre.box,
      inventory: dion.fields.inventoryName,
      runLamp: {
        rows: dion.fields.lamps.rows,
        x: dion.fields.lamps.x[2]!,
        y: dion.fields.lamps.y
      }
    });
    expect(fromDion).toEqual(fromDamocles);
    // The head's name window with its bevel, the centre box, and the run lamp's box.
    expect(fromDamocles).toEqual({
      centre: { height: 32, width: 64, x: 128, y: 160 },
      head: { height: 9, width: 98, x: 207, y: 159 },
      run: { height: 11, width: 9, x: 225, y: 184 }
    });
  });

  test('gives Targ its run lamp alone', () => {
    expect(TARG_PANEL_LAYOUT).toEqual({
      run: { height: 10, width: 9, x: 197, y: 147 }
    });
  });
});

describe('the pointer’s document paging (#599)', () => {
  test('pages the way the centre box’s − or + stands', () => {
    const size = { height: 32, width: 64 };
    expect(centreBoxPage({ x: 0, y: 12 }, size)).toBe('previous');
    expect(centreBoxPage({ x: 31.9, y: 4 }, size)).toBe('previous');
    expect(centreBoxPage({ x: 32, y: 24 }, size)).toBe('next');
    expect(centreBoxPage({ x: 60, y: 12 }, size)).toBe('next');
  });

  test('reads the item whose name is clicked, as * does', () => {
    // Scaled up, as the panel draws the box.
    const size = { height: 128, width: 256 };
    expect(centreBoxPage({ x: 24, y: 32 }, size)).toBe('read');
    expect(centreBoxPage({ x: 128, y: 48 }, size)).toBe('read');
    expect(centreBoxPage({ x: 227, y: 67 }, size)).toBe('read');
    expect(centreBoxPage({ x: 20, y: 48 }, size)).toBe('previous');
    expect(centreBoxPage({ x: 232, y: 48 }, size)).toBe('next');
    expect(centreBoxPage({ x: 128, y: 70 }, size)).toBe('next');
  });

  test('turns a mouse notch into one page, down on and up back', () => {
    expect(wheelPage(0, 100, 0)).toEqual({ gathered: 0, page: 'next' });
    expect(wheelPage(0, -100, 0)).toEqual({ gathered: 0, page: 'previous' });
    // A line or page delta is a notch however small.
    expect(wheelPage(0, 3, 1)).toEqual({ gathered: 0, page: 'next' });
    expect(wheelPage(0, -1, 2)).toEqual({ gathered: 0, page: 'previous' });
  });

  test('gathers a trackpad’s small deltas to one page at a time', () => {
    let gathered = 0;
    const pages: (string | undefined)[] = [];
    for (let event = 0; event < 12; event += 1) {
      const turned = wheelPage(gathered, 10, 0);
      gathered = turned.gathered;
      pages.push(turned.page);
    }
    expect(pages.filter(page => page === 'next')).toHaveLength(2);
    expect(gathered).toBe(20);
  });

  test('starts afresh when the travel turns, and ignores a sideways scroll', () => {
    expect(wheelPage(40, -10, 0)).toEqual({ gathered: -10, page: undefined });
    expect(wheelPage(40, 0, 0)).toEqual({ gathered: 40, page: undefined });
    // One event turns one page, however hard the flick.
    expect(wheelPage(0, 400, 0)).toEqual({ gathered: 0, page: 'next' });
  });
});
