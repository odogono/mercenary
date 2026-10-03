import { describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import { damoclesPanelViewModel } from '../src/damocles/panel.ts';
import { DamoclesSession } from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { drawDionPanel } from '../src/dion/panel.ts';
import { DionSession, dionPanelView } from '../src/dion/session.ts';
import { flyoverPanelViewModel } from '../src/flyover/dashboard.ts';
import { playerState } from '../src/gameCore/index.ts';
import { GameplaySession, type SessionSnapshot } from '../src/session/index.ts';
import { arrivalPanelViewModel } from '../src/shell/arrivalPanel.ts';
import { panelAttitude, type PanelAttitude } from '../src/shell/attitude.ts';
import {
  panelViewModel,
  type PanelContext,
  type PanelViewModel
} from '../src/shell/panel.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { dionContent } from './dion-documents.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';
import { emptyContent } from './fixtures/save.ts';

/// The attitude contract every panel adapter keeps (#715): turn the Pose and the compass
/// follows it, round one turn; pitch the nose up and the pitch readout rises, half a turn either
/// side of level. Each adapter is driven through its own Title's state rather than the shared
/// helper, so an adapter that stops reading its Pose fails here.

const CELL = 65_536;
const DEGREE = Math.PI / 180;

/// A panel adapter seen only through its attitude: the readouts it shows for a Pose.
type AttitudeAdapter = (heading: number, pitch: number) => PanelAttitude;

const attitudeOf = (model: PanelViewModel): PanelAttitude => ({
  compassDegrees: model.compassDegrees,
  elevationDegrees: model.elevationDegrees
});

const targSnapshot = (): SessionSnapshot =>
  new GameplaySession(
    emptyContent(),
    playerState({ position: { x: 8.5 * CELL, y: 0, z: 8.5 * CELL } }),
    undefined
  ).snapshot;

const targContext: PanelContext = {
  cellSize: CELL,
  clock: '09-00-00',
  objectNames: new Map()
};

const targ = (): AttitudeAdapter => {
  const snapshot = targSnapshot();
  return (heading, pitch) =>
    attitudeOf(
      panelViewModel(
        { ...snapshot, player: { ...snapshot.player, heading, pitch } },
        targContext
      )
    );
};

const damocles = async (): Promise<AttitudeAdapter> => {
  const [catalogue, presentation, strings] = await Promise.all([
    loadCatalogue(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const doc = readErisPresentation(presentation);
  const snapshot = new DamoclesSession({
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test-presentation',
    strings: parseDamoclesStrings(strings),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  }).snapshot;
  return (heading, pitch) =>
    attitudeOf(
      damoclesPanelViewModel(
        { ...snapshot, pose: { ...snapshot.pose, heading, pitch } },
        doc
      )
    );
};

const arrival = (): AttitudeAdapter => {
  // An attitude of the base model's own, which the Arrival must replace rather than pass on.
  const base: PanelViewModel = {
    ...panelViewModel(targSnapshot(), targContext),
    compassDegrees: 91,
    elevationDegrees: 12
  };
  return (heading, pitch) =>
    attitudeOf(
      arrivalPanelViewModel(
        base,
        {
          narration: undefined,
          pose: { altitude: 1000, heading, pitch, roll: 0 },
          unmeasured: false
        },
        CELL
      )
    );
};

const flyover: AttitudeAdapter = (heading, pitch) =>
  attitudeOf(
    flyoverPanelViewModel({
      camera: {
        pose: { heading, pitch, position: { x: 0, y: 0, z: 0 }, roll: 0 },
        speedNotch: 0
      },
      nearestBody: {
        colour: '#ffffff',
        displayRadiusUnits: 10,
        id: 'dialis',
        position: { x: 0, y: 0, z: 0 },
        provenance: {
          colour: 'authored',
          identity: 'recovered',
          position: 'recovered',
          radius: 'mechanically-derived',
          ranges: 'authored'
        },
        ranges: ['orbital']
      },
      range: 'orbital',
      speedBounds: { maximumUnitsPerSecond: 512, minimumUnitsPerSecond: 1 },
      systemId: 'gamma'
    })
  );

const ADAPTERS: readonly (readonly [
  string,
  () => AttitudeAdapter | Promise<AttitudeAdapter>
])[] = [
  ['Targ panelViewModel', targ],
  ['Damocles damoclesPanelViewModel', damocles],
  ['Arrival arrivalPanelViewModel', arrival],
  ['Flyover flyoverPanelViewModel', () => flyover]
];

/// The signed turn from one compass reading to another, the short way round.
const compassTurn = (from: number, to: number): number =>
  ((((to - from) % 360) + 540) % 360) - 180;

describe('the panel attitude contract (#715)', () => {
  describe.each(ADAPTERS)('%s', (_name, adapterOf) => {
    test('reads level as level', async () => {
      const read = await adapterOf();
      expect(read(0, 0).elevationDegrees).toBeCloseTo(0);
    });

    test('raises the pitch readout as the nose rises', async () => {
      const read = await adapterOf();
      const heading = 40 * DEGREE;
      expect(read(heading, 10 * DEGREE).elevationDegrees).toBeCloseTo(10);
      expect(read(heading, -25 * DEGREE).elevationDegrees).toBeCloseTo(-25);
      expect(read(heading, 89 * DEGREE).elevationDegrees).toBeCloseTo(89);
    });

    test('reads a pitch past the vertical back about level', async () => {
      const read = await adapterOf();
      // A craft looped over the top, and a camera that wraps its pitch into one turn.
      expect(read(0, 270 * DEGREE).elevationDegrees).toBeCloseTo(-90);
      expect(read(0, 350 * DEGREE).elevationDegrees).toBeCloseTo(-10);
      expect(read(0, -200 * DEGREE).elevationDegrees).toBeCloseTo(160);
    });

    test('turns the compass with the heading, round one turn', async () => {
      const read = await adapterOf();
      for (const start of [0, 100, 355, -170, 725]) {
        const before = read(start * DEGREE, 0).compassDegrees;
        const after = read((start + 15) * DEGREE, 0).compassDegrees;
        for (const reading of [before, after]) {
          expect(reading).toBeGreaterThanOrEqual(0);
          expect(reading).toBeLessThan(360);
        }
        expect(compassTurn(before, after)).toBeCloseTo(15);
      }
    });

    test('keeps the compass and the pitch independent', async () => {
      const read = await adapterOf();
      expect(read(30 * DEGREE, 0).compassDegrees).toBeCloseTo(
        read(30 * DEGREE, 20 * DEGREE).compassDegrees
      );
      expect(read(0, 20 * DEGREE).elevationDegrees).toBeCloseTo(
        read(120 * DEGREE, 20 * DEGREE).elevationDegrees
      );
    });
  });
});

describe('the panel attitude conventions', () => {
  test('puts the Targ compass nought half a turn round', () => {
    expect(panelAttitude({ heading: 0, pitch: 0 }, 'targ').compassDegrees).toBe(
      180
    );
    expect(
      panelAttitude({ heading: Math.PI, pitch: 0 }, 'targ').compassDegrees
    ).toBeCloseTo(0);
    expect(
      panelAttitude({ heading: -Math.PI / 2, pitch: 0 }, 'targ').compassDegrees
    ).toBeCloseTo(90);
  });

  test('reads a bearing as it stands', () => {
    expect(
      panelAttitude({ heading: Math.PI / 2, pitch: 0 }, 'bearing')
        .compassDegrees
    ).toBeCloseTo(90);
  });
});

/// The Mercenary III panel draws its compass and pitch strips from the raw words (`$53A2E`,
/// `$53AB2`), so it has no degrees for the contract above. Its own contract is that the view
/// carries the session's words and the drawn strips move with them.
const differs = (a: Uint8Array, b: Uint8Array): boolean =>
  a.some((value, index) => value !== b[index]);

describe('the Mercenary III panel attitude (#715)', () => {
  test('carries the heading and pitch words to the panel', async () => {
    const content = await dionContent();
    const snapshot = new DionSession(content).snapshot;
    const view = dionPanelView(
      { ...snapshot, heading: 0x1_23, pitch: 0x0_45 },
      content
    );
    expect(view.heading).toBe(0x1_23);
    expect(view.pitch).toBe(0x0_45);
  });

  test('moves the compass strip with the heading and the pitch strip with the pitch', async () => {
    const content = await dionContent();
    const snapshot = new DionSession(content).snapshot;
    const drawn = (heading: number, pitch: number): Uint8Array =>
      drawDionPanel(
        content.panel,
        dionPanelView({ ...snapshot, heading, pitch }, content)
      ).pixels;
    const level = drawn(snapshot.heading, snapshot.pitch);
    // One sixteenth of a turn on either word is four strip steps.
    expect(differs(level, drawn(snapshot.heading + 0x40, snapshot.pitch))).toBe(
      true
    );
    expect(differs(level, drawn(snapshot.heading, snapshot.pitch + 0x40))).toBe(
      true
    );
  });
});
