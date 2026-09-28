import { describe, expect, test } from 'bun:test';

import { craftProgram } from '../src/damocles/craft.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  altitudeWindow,
  bodyCoordinateReadout,
  cellReadout,
  damoclesPanelViewModel,
  impactClock,
  printedAltitude,
  speedField
} from '../src/damocles/panel.ts';
import { DamoclesSession } from '../src/damocles/session.ts';
import { spaceAltitude } from '../src/damocles/space.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { damoclesTitle } from '../src/damocles/title.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { intent } from '../src/gameCore/index.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

const content = async () => {
  const [catalogue, presentation, strings] = await Promise.all([
    loadCatalogue(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const parsed = catalogue;
  const doc = readErisPresentation(presentation);
  return {
    catalogue: parsed,
    doc,
    models: modelsOf(parsed),
    poses: await arrivalPoses(),
    presentationSha256: 'test-presentation',
    strings: parseDamoclesStrings(strings),
    surface: erisSurfaceFrom(parsed, modelsOf(parsed), doc)
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
    // The impact clock starts at the deadline the title screen installs at `$793C` (#368).
    expect(model.clock).toBe('04-19-20');
    // Six digits, which is what the original's altitude window prints and one more than the
    // Targ instrument the view model is shared with (#368).
    expect(model.altitude).toBe('000000');
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

  test('counts the impact clock down in real time, one second a Session second', async () => {
    const loaded = await content();
    const session = new DamoclesSession(loaded);
    // 50 VBLs a displayed second at 50 Hz (#551): ten Session seconds spend ten of the
    // deadline's own seconds, and standing still spends them just as walking does.
    session.advance(10);
    expect(damoclesPanelViewModel(session.snapshot, loaded.doc).clock).toBe(
      '04-19-10'
    );
    session.advance(3590);
    expect(damoclesPanelViewModel(session.snapshot, loaded.doc).clock).toBe(
      '03-19-20'
    );
  });

  test('stops the impact clock at nought rather than running past it', async () => {
    const loaded = await content();
    const { time } = loaded.doc;
    const exhausted =
      (time.impactDeadlineSeconds * time.impactVblsPerSecond) / time.vblHertz;
    expect(impactClock(exhausted - 1, time)).toBe('00-00-01');
    expect(impactClock(exhausted, time)).toBe('00-00-00');
    // A Session that models no impact has nothing to do when the deadline passes, so the
    // readout holds at nought and play goes on.
    expect(impactClock(exhausted * 2, time)).toBe('00-00-00');
  });

  test('prints the Island-Local Cell two digits an axis, signed and unbounded', () => {
    expect(cellReadout({ x: 6, z: 8 })).toBe('06-08');
    expect(cellReadout({ x: 15, z: 0 })).toBe('15-00');
    // A negative axis prints its magnitude and is marked by colour instead of a sign, and the
    // readout runs on past the 16-cell workspace: only a magnitude past 99 stars out. The
    // Working Authority's own Key West overhead reads `08-**` at local z = -103 (#397).
    expect(cellReadout({ x: -1, z: 99 })).toBe('01-99');
    expect(cellReadout({ x: 8, z: -103 })).toBe('08-**');
    expect(cellReadout({ x: -100, z: 100 })).toBe('**-**');
  });

  test('keeps printing the cell once the player walks off the workspace', async () => {
    const loaded = await content();
    const session = new DamoclesSession(loaded);
    // Backwards from the start pose is south, and the workspace's own window runs out eight
    // cells that way: the readout does not blank there, it runs on signed (#397).
    session.intent = intent({ walk: -1 });
    session.advance(1800);
    expect(session.snapshot.island!.areaName).toBe('CAPITAL CITY');
    expect(session.snapshot.islandCell).toEqual({ x: 7, z: -1 });
    const model = damoclesPanelViewModel(session.snapshot, loaded.doc);
    expect(model.locationLabel).toBe('07-01');
    expect(model.locationAxes).toEqual([
      { negative: false, text: '07' },
      { negative: true, text: '01' }
    ]);
  });

  test('marks a negative axis of the Cell Readout and leaves a positive one plain', async () => {
    const loaded = await content();
    const session = new DamoclesSession(loaded);
    // The Working Authority's Capital City reading: body cell (38,136) against that record's
    // origin (64,128) is local (-26,8), printed `26-08` with the 26 red (#397).
    const model = damoclesPanelViewModel(
      { ...session.snapshot, islandCell: { x: -26, z: 8 } },
      loaded.doc
    );
    expect(model.locationLabel).toBe('26-08');
    expect(model.locationAxes).toEqual([
      { negative: true, text: '26' },
      { negative: false, text: '08' }
    ]);
    // At the start pose nothing is negative, so nothing is red.
    expect(
      damoclesPanelViewModel(session.snapshot, loaded.doc).locationAxes
    ).toEqual([
      { negative: false, text: '07' },
      { negative: false, text: '08' }
    ]);
  });
});

describe('the panel aboard (#551, #556)', () => {
  test('prints the speed field from `$4DFEC` as 4.28 digits, signed by the speed float', () => {
    // The traced readings of docs/research/damocles-panel-aboard.md.
    expect(speedField(34, 0x00_05_10_ce)).toBe('+ 000 000 012');
    expect(speedField(555, 0x00_09_11_56)).toBe('+ 000 000 206');
    expect(speedField(107, 0x00_06_1a_c2)).toBe('+ 000 000 039');
    expect(speedField(6396, 0x00_0c_18_fc)).toBe('+ 000 002 382');
    // After a refused move the speed's mantissa is negative and its magnitude near nought.
    expect(speedField(0, 0xff_ee_ef_30)).toBe('- 000 000 000');
  });

  test('prints eye Y ÷ 2²⁰ in the altitude window, starred past 99 and on Floor 10', () => {
    expect(altitudeWindow(63, 0)).toBe('000000');
    expect(altitudeWindow(0x2_bf, 0)).toBe('000006');
    expect(altitudeWindow(70_084, 0)).toBe('000668');
    expect(altitudeWindow(3_043_327, 0)).toBe('029023');
    expect(altitudeWindow(29_031_839, 0)).toBe('276869');
    expect(altitudeWindow(105_000_000, 0)).toBe('******');
    expect(altitudeWindow(3233, 10)).toBe('******');
  });
});

describe('the panel in space (#551, #558)', () => {
  test('prints the relativistic speed the space pass leaves in `$4DFEC`', () => {
    // The first space pass of the traced launch: `$797A` = `$0009E176`, reverse thrust.
    expect(speedField(804_318_406, 0x00_09_e1_76)).toBe('- 299 631 955');
  });

  test('prints the nearest range ÷ 16,384 in the altitude window', async () => {
    const program = craftProgram((await loadCatalogue()).craft!);
    // Stop 600 of the #551 launch trace: `$791C` = `$000B1290` (2,376) shows `001450`.
    expect(printedAltitude(spaceAltitude(program, 0x00_0b_12_90))).toBe(
      '001450'
    );
  });
});
