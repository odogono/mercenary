import { describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  bodyCoordinateReadout,
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
    // The wide readout beside the cell is the original's body pair, and the original prints
    // `016-283` at this pose (#371).
    expect(model.bodyCoordinates).toBe('016-283');
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

  test('follows the Body Coordinate Readout as the player crosses four cells', async () => {
    const loaded = await content();
    const session = new DamoclesSession(loaded);
    const start = session.snapshot.pose.position;
    // One Body Coordinate step is four Surface Cells, so a position four cells east reads one
    // higher on the first field and leaves the second alone.
    expect(bodyCoordinateReadout({ ...start, x: start.x + 4 * 65_536 })).toBe(
      '017-283'
    );
    expect(bodyCoordinateReadout({ ...start, z: start.z + 4 * 65_536 })).toBe(
      '016-284'
    );
  });

  test('reproduces the readout of every attested arrival Pose', async () => {
    // Each expectation is the pair the Working Authority holds at $7A1E/$7A22 in that Pose's
    // own memstate, scaled to three digits as the original's panel prints it (#371).
    const expected: Record<string, string> = {
      acheron: '834-323',
      atropos: '009-304',
      'bacchus-transporter': '405-638',
      clotho: '590-323',
      cronus: '626-463',
      cyclopes: '851-602',
      damocles: '060-048',
      'dion-2-3': '793-571',
      'dion-transporter': '793-574',
      'eris-spaceport-onfoot': '016-283',
      'eris-transporter-11-8': '017-283',
      'gaea-transporter': '064-439',
      'gaea-ur-city-4-2': '125-687',
      icarus: '152-417',
      'logos-transporter': '316-896',
      lucan: '951-250',
      'mentor-transporter': '689-316',
      'metis-transporter': '616-511',
      midas: '086-102',
      pan: '103-689',
      perseus: '936-450',
      solon: '969-590',
      thalia: '489-044',
      theon: '621-063',
      tolosa: '667-633',
      'vesta-parliament-4-6': '264-326',
      'vesta-transporter': '264-326'
    };
    const poses = await arrivalPoses();
    for (const pose of poses.poses) {
      expect(`${pose.id} ${bodyCoordinateReadout(pose.position)}`).toBe(
        `${pose.id} ${expected[pose.id]!}`
      );
    }
  });

  test('prints cells two digits an axis and stars beyond the readout', () => {
    expect(erisGridReference({ x: 6, z: 8 })).toBe('06-08');
    expect(erisGridReference({ x: 15, z: 0 })).toBe('15-00');
    expect(erisGridReference({ x: -1, z: 100 })).toBe('**-**');
  });
});
