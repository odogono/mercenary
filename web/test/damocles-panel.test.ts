import { describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  damoclesPanelViewModel,
  erisGridReference
} from '../src/damocles/panel.ts';
import { DamoclesSession } from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { damoclesTitle } from '../src/damocles/title.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { intent } from '../src/gameCore/index.ts';
import { arrivalPoses } from './damocles-pose.ts';

const content = async () => {
  const [catalogue, presentation, strings] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const parsed = parseCatalogue(catalogue);
  const doc = readErisPresentation(presentation);
  return {
    catalogue: parsed,
    doc,
    poses: await arrivalPoses(),
    presentationSha256: 'test-presentation',
    strings: parseDamoclesStrings(strings),
    surface: erisSurfaceFrom(parsed, doc)
  };
};

describe('the Damocles Panel Rendition on Damocles Session State', () => {
  test('reads ERIS, the start cell and an empty inventory on foot', async () => {
    const loaded = await content();
    const session = new DamoclesSession(loaded);
    const model = damoclesPanelViewModel(session.snapshot, loaded.doc);
    expect(model.locationName).toBe('ERIS');
    expect(model.locationLabel).toBe('07-08');
    // The wide readout beside the cell is the original's body pair: bound in RAM and known to
    // track the player (#208, #367), but its three-digit mapping is undecoded (#371).
    expect(model.bodyCoordinates).toBe('000-000');
    expect(model.inventory).toBe('EMPTY');
    expect(model.inventoryFill).toBe(0);
    expect(model.damoclesDisplay).toEqual({
      cells: ' '.repeat(48),
      scrollPixels: 0
    });
    expect(model.speedLabel).toBe('+ 000 000 000');
    expect(model.clock).toBe('');
    expect(model.runLamp).toBe(false);
    expect(damoclesTitle.panelViewModel(session.snapshot, loaded)).toEqual(
      model
    );
  });

  test('follows the cell as the player walks', async () => {
    const loaded = await content();
    const session = new DamoclesSession(loaded);
    session.intent = intent({ walk: 1 });
    session.advance(120);
    const model = damoclesPanelViewModel(session.snapshot, loaded.doc);
    expect(model.locationLabel).toMatch(/^\d{2}-\d{2}$/);
    expect(model.locationLabel).not.toBe('07-08');
    // Walking alone does not light the run lamp; the run toggle does.
    expect(model.runLamp).toBe(false);
    expect(
      damoclesPanelViewModel(session.snapshot, loaded.doc, true).runLamp
    ).toBe(true);
    expect(model.compassDegrees).toBeGreaterThanOrEqual(0);
    expect(model.compassDegrees).toBeLessThan(360);
  });

  test('prints cells two digits an axis and stars beyond the readout', () => {
    expect(erisGridReference({ x: 6, z: 8 })).toBe('06-08');
    expect(erisGridReference({ x: 15, z: 0 })).toBe('15-00');
    expect(erisGridReference({ x: -1, z: 100 })).toBe('**-**');
  });
});
