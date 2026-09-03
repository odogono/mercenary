import { describe, expect, test } from 'bun:test';

import { arrivalCruisePose, arrivalPose } from '../src/shell/arrivalCamera.ts';
import {
  arrivalPanelViewModel,
  arrivalStripText
} from '../src/shell/arrivalPanel.ts';
import type { PanelViewModel } from '../src/shell/panel.ts';

const CELL_SIZE = 65_536;

const base: PanelViewModel = {
  altitude: '00128',
  attackLamp: false,
  cash: '000009000',
  clock: '00-00-00',
  compassDegrees: 91,
  elevationDegrees: 12,
  groundLamp: false,
  heading: '091°',
  inventory: 'EMPTY',
  inventoryFill: 0,
  locationLabel: '08-08',
  locationName: 'TARG',
  message: 'CRASH LANDED ON TARG',
  runLamp: false,
  speed: '+0000',
  speedLabel: '+ 000 000 000'
};

describe('the panel during the Arrival', () => {
  test('asterisks the readouts while the ship is still in space', () => {
    const shown = arrivalPanelViewModel(
      base,
      {
        narration: 'NOVADRIVE COUNTDOWN',
        pose: arrivalPose(82_000, 0),
        unmeasured: true
      },
      CELL_SIZE
    );

    expect(shown.locationLabel).toBe('**-**');
    expect(shown.altitude).toBe('*****');
    expect(shown.speed).toBe('*****');
    expect(shown.message).toBe('NOVADRIVE COUNTDOWN');
  });

  test('keeps the gauges live, and level, while the ship is still under way', () => {
    const shown = arrivalPanelViewModel(
      base,
      { narration: '0', pose: arrivalCruisePose(82_000), unmeasured: true },
      CELL_SIZE
    );

    expect(shown.compassDegrees).toBe(0);
    expect(shown.elevationDegrees).toBe(0);
  });

  test('shows the dive on the elevation gauge once the fall has begun', () => {
    const shown = arrivalPanelViewModel(
      base,
      { narration: undefined, pose: arrivalPose(50_000, 1), unmeasured: false },
      CELL_SIZE
    );

    expect(shown.elevationDegrees).toBeLessThan(-20);
  });

  test('counts the fall down once the view is Targ’s surface', () => {
    const high = arrivalPanelViewModel(
      base,
      { narration: undefined, pose: arrivalPose(82_000, 1), unmeasured: false },
      CELL_SIZE
    );
    const low = arrivalPanelViewModel(
      base,
      { narration: undefined, pose: arrivalPose(1500, 1), unmeasured: false },
      CELL_SIZE
    );

    expect(high.altitude).toBe('82000');
    expect(low.altitude).toBe('01500');
    expect(high.locationLabel).toBe('08-08');
    expect(high.speed).toBe('+0000');
  });

  test('hands the message window back once the script owns it', () => {
    const shown = arrivalPanelViewModel(
      base,
      { narration: undefined, pose: arrivalPose(0, 1), unmeasured: false },
      CELL_SIZE
    );

    expect(shown.message).toBe('CRASH LANDED ON TARG');
  });

  test('leaves everything it has no business changing alone', () => {
    const shown = arrivalPanelViewModel(
      base,
      { narration: 'CHECKING', pose: arrivalPose(50_000, 2), unmeasured: true },
      CELL_SIZE
    );

    expect(shown.cash).toBe(base.cash);
    expect(shown.inventory).toBe(base.inventory);
    expect(shown.locationName).toBe('TARG');
    expect(shown.speedLabel).toBe(base.speedLabel);
  });

  test('claims the comms strip only while it has something to say', () => {
    expect(arrivalStripText('EMERGENCY!')).toEqual({
      source: 'arrival',
      text: 'EMERGENCY!'
    });
    expect(arrivalStripText(undefined)).toBeUndefined();
  });
});
