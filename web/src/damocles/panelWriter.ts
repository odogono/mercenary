import {
  PANEL_ROWS,
  PANEL_TOP,
  PANEL_WIDTH,
  PanelPlanes,
  writePanelCompass,
  writePanelField,
  writePanelPitch,
  type PanelImage,
  type PanelTextField
} from '../shell/panelPixels.ts';
import type { ErisPresentationDocument } from './documents.ts';
import type { DocumentPanel } from './headCommands.ts';
import {
  altitudeWindow,
  bodySteps,
  damoclesPanelViewModel,
  printedAltitude,
  speedField
} from './panel.ts';
import type { DamoclesPanelDocument } from './panelDocument.ts';
import type { DamoclesSnapshot } from './session.ts';

/// Damocles's composer: pristine DAM1 artwork, title-specific fields and centre
/// dispatch. It shares plane/glyph/attitude operations, never the MIII composer.
export interface DamoclesCentrePanel {
  readonly item: string | null;
  readonly kind: DocumentPanel['kind'];
  readonly parameter: number | null;
  readonly slot: number;
}

export interface DamoclesPanelView {
  readonly altitude: string;
  /// Eleven printed BCD digits; punctuation already belongs to the artwork.
  readonly cash: string;
  readonly centre: {
    readonly from: DamoclesCentrePanel | null;
    readonly steps: number;
    readonly to: DamoclesCentrePanel | null;
  };
  readonly clockSeconds: number;
  /// Already displayed gauge levels. The browser adapter's T/P are placeholders;
  /// the writer can also consume the native per-VBL caches for pixel comparisons.
  readonly gauges: {
    readonly inventory: number;
    readonly p: number;
    readonly t: number;
  };
  readonly grid: readonly [number, number];
  readonly heading: number;
  readonly inventory: string;
  readonly lamps: {
    readonly attack: boolean;
    readonly ground: boolean;
    readonly run: boolean;
  };
  readonly location: string;
  readonly mask: number;
  readonly message: DamoclesSnapshot['displayCells'];
  readonly pitch: number;
  readonly position: readonly [number, number];
  readonly speed: readonly string[];
}

/// Inputs at the recovered readout boundary, not CSS-formatted simulation values.
export interface DamoclesPanelWords {
  readonly eyeY: number;
  readonly floor: number;
  readonly panelSpeed: number;
  readonly rangeAltitude: number | null;
  readonly speed: number;
}

export const damoclesReadoutWords = (
  words: DamoclesPanelWords
): Pick<DamoclesPanelView, 'altitude' | 'speed'> => ({
  altitude:
    words.rangeAltitude === null
      ? altitudeWindow(words.eyeY, words.floor)
      : printedAltitude(words.rangeAltitude),
  speed: [...speedField(words.panelSpeed, words.speed).replaceAll(' ', '')].map(
    character =>
      character === '+' ? '11' : character === '-' ? '12' : character
  )
});

/// Keep #715's attitude convention at the adapter seam. Conversion back to ST
/// words changes representation only: compass rises with bearing, nose-up pitch
/// lowers the raw word, including the wrapped half-turn boundaries.
export const damoclesRecoveredPanelView = (
  snapshot: DamoclesSnapshot,
  doc: ErisPresentationDocument,
  running = false
): DamoclesPanelView => {
  const model = damoclesPanelViewModel(snapshot, doc, running);
  const units = doc.orientation.yawUnitsPerTurn;
  const position = bodySteps(snapshot.pose.position);
  return {
    ...damoclesReadoutWords({
      eyeY: snapshot.pose.position.y,
      floor: snapshot.structure?.floor ?? 0,
      panelSpeed: snapshot.craft?.panelSpeed ?? 0,
      rangeAltitude: snapshot.craft?.space?.altitude ?? null,
      speed: snapshot.craft?.speed ?? 0
    }),
    cash: model.cash.replaceAll(/[,.]/g, ''),
    centre: snapshot.centreBox,
    clockSeconds: snapshot.impact.seconds,
    // T/P value semantics remain unsupported (#740). Preserve the previous
    // authored 23/36 levels and label them in the accessible panel description.
    // `$543BE`: the carried count is doubled unless the BRIEFCASE gives capacity 20.
    gauges: {
      inventory: snapshot.carried.length * (snapshot.capacity === 20 ? 1 : 2),
      p: 36,
      t: 23
    },
    grid: [snapshot.islandCell.x, snapshot.islandCell.z],
    heading: Math.round((model.compassDegrees / 360) * units) & (units - 1),
    inventory: model.inventory,
    lamps: {
      attack: model.attackLamp,
      ground: model.groundLamp,
      run: model.runLamp
    },
    location: model.locationName,
    mask: snapshot.panelMask,
    message: snapshot.displayCells,
    pitch:
      Math.round(
        doc.orientation.pitchLevel - (model.elevationDegrees / 360) * units
      ) &
      (units - 1),
    position: [position.x, position.z]
  };
};

const field = (doc: DamoclesPanelDocument, name: string): PanelTextField =>
  doc.fields.get(name)!;
const digitKeys = (text: string): string[] =>
  [...text].map(character => (character === '*' ? '10' : character));

const centreArt = (
  doc: DamoclesPanelDocument,
  panel: DamoclesCentrePanel | null,
  content: boolean
): Uint8Array[] => {
  const definition =
    panel === null ? undefined : doc.centre.definitions.get(panel.slot);
  const category = definition?.category ?? 0;
  const rows = doc.centre.art.get(category)!.map(row => row.slice());
  if (definition !== undefined && (category === 2 || category === 6)) {
    doc.centre.bands.get(category)![definition.band / 2]!.forEach((row, y) => {
      [...row].forEach((bit, x) => {
        rows[y + 1]![x] = bit === '1' ? 14 : 1;
      });
    });
  }
  if (!content || panel?.item == null) {
    return rows;
  }
  if (category === 2) {
    // `$4DBBE`: the eight-character item field, ink clears plane 2.
    const pixels = new Uint8Array(PANEL_WIDTH * PANEL_ROWS);
    rows.forEach((row, y) =>
      pixels.set(row, (160 - PANEL_TOP + y) * PANEL_WIDTH + 128)
    );
    writePanelField(
      new PanelPlanes(pixels),
      doc.fonts,
      field(doc, 'centre2Text'),
      panel.item.padEnd(8).slice(0, 8).split('')
    );
    return rows.map((_, y) =>
      pixels.slice(
        (160 - PANEL_TOP + y) * PANEL_WIDTH + 128,
        (160 - PANEL_TOP + y) * PANEL_WIDTH + 192
      )
    );
  }
  // The dynamic layouts for these categories are still bounded authored
  // presentation (#740's centre gap). Retain their supported values, with the
  // recovered art and fonts. Do not invent behaviour for unimplemented items.
  const ink = (
    text: string,
    x: number,
    y: number,
    fontName: string,
    pitch: number
  ): void => {
    const font = doc.fonts.get(fontName)!;
    [...text].forEach((character, index) => {
      font.glyphs.get(character)?.forEach((row, dy) => {
        [...row].forEach((bit, dx) => {
          if (
            bit === '1' &&
            rows[y + dy]?.[x + index * pitch + dx] !== undefined
          ) {
            rows[y + dy]![x + index * pitch + dx] = 0;
          }
        });
      });
    });
  };
  if (category === 4) {
    ink(String(panel.parameter ?? 0), 56, 11, 'cardDigits', 6);
    ink(panel.item, 35, 23, 'cardDigits', 6);
  } else if (category === 3) {
    const [charge, fuse] = panel.item.split(' ');
    const [minutes, seconds] = (fuse ?? '0.00').split('.');
    ink((minutes ?? '0').padStart(2, '0'), 8, 11, 'cardDigits', 6);
    ink((seconds ?? '00').padStart(2, '0'), 21, 11, 'cardDigits', 6);
    ink(charge ?? '0', 56, 11, 'cardDigits', 6);
  } else if (category === 6) {
    ink(panel.item, panel.item === 'ON' ? 25 : 23, 15, 'panel', 6);
  }
  return rows;
};

/// `$4E246`'s signed grid is retained as authored digit placement because the
/// specialised grid glyph bank is not decoded in #740. Its values and sign planes
/// are recovered; the font choice is explicitly a gap, not a parity claim.
const writeGrid = (
  planes: PanelPlanes,
  doc: DamoclesPanelDocument,
  grid: readonly [number, number]
): void => {
  grid.forEach((value, axis) => {
    const x = axis === 0 ? 68 : 80;
    const glyphs =
      Math.abs(value) >= 100
        ? ['10', '10']
        : [...String(Math.abs(value)).padStart(2, '0')];
    for (let y = 172; y < 177; y += 1) {
      for (let dx = 0; dx < 8; dx += 1) {
        planes.set(x + dx, y, 0, false);
        planes.set(x + dx, y, 1, false);
        planes.set(x + dx, y, 2, false);
        planes.set(x + dx, y, 3, true);
      }
    }
    glyphs.forEach((key, digit) => {
      doc.fonts
        .get('digits')!
        .glyphs.get(key)
        ?.forEach((row, dy) => {
          [...row].forEach((bit, dx) => {
            if (bit === '1') {
              planes.set(
                x + 1 + digit * 4 + dx,
                172 + dy,
                value < 0 ? 0 : 3,
                value < 0
              );
            }
          });
        });
    });
  });
};

export const drawDamoclesPanel = (
  doc: DamoclesPanelDocument,
  view: DamoclesPanelView
): PanelImage => {
  const pixels = new Uint8Array(PANEL_WIDTH * PANEL_ROWS);
  doc.art.forEach((row, y) => pixels.set(row, y * PANEL_WIDTH));
  const planes = new PanelPlanes(pixels);
  const write = (name: string, text: readonly string[]): void =>
    writePanelField(planes, doc.fonts, field(doc, name), text);
  write('location', view.location.padEnd(8).slice(0, 8).split(''));
  write('speed', view.speed);
  write('altitude', digitKeys(view.altitude));
  write('cash', [...view.cash]);
  write('inventoryName', view.inventory.padEnd(16).slice(0, 16).split(''));
  // `$4E2F2` clears the position frame's lower planes, including its dash.
  for (let y = 172; y < 177; y += 1) {
    for (let x = 32; x <= 63; x += 1) {
      for (const plane of [0, 1, 2]) {
        planes.set(x, y, plane, false);
      }
      planes.set(x, y, 3, true);
    }
  }
  for (let x = 46; x <= 49; x += 1) {
    planes.set(x, 174, 3, false);
  }
  write(
    'position',
    view.position.flatMap(word =>
      String(Math.floor(((word & 0xff_ff) * 0xfa_00) / 0x1_00_00))
        .padStart(3, '0')
        .slice(-3)
        .split('')
    )
  );
  writeGrid(planes, doc, view.grid);
  const clock = Math.abs(view.clockSeconds) % 86_400;
  const clockDigits = [
    Math.floor(clock / 3600),
    Math.floor(clock / 60) % 60,
    clock % 60
  ].flatMap(value => [...String(value).padStart(2, '0')]);
  clockDigits.forEach((digit, index) => {
    doc.fonts
      .get('clock')!
      .glyphs.get(digit)!
      .forEach((row, dy) => {
        [...row].forEach((bit, dx) => {
          for (const plane of doc.clock.planes) {
            planes.set(
              doc.clock.cells[index]! + dx,
              doc.clock.y + dy,
              plane,
              bit === '0'
            );
          }
        });
      });
  });
  writePanelCompass(
    planes,
    doc.compass.frames[(-view.heading & 0x3_f0) >> 4]!,
    80,
    182
  );
  writePanelPitch(planes, doc.strip, view.pitch, 16, 171);
  const levels = [
    Math.min(view.gauges.t, 48),
    Math.min(view.gauges.p, 48),
    view.gauges.inventory
  ];
  doc.gauges.forEach((bar, index) => {
    for (let row = 0; row < bar.rows; row += 1) {
      for (const plane of bar.planes) {
        planes.set(
          bar.x,
          bar.top + row,
          plane,
          row < bar.rows - levels[index]!
        );
      }
    }
  });
  doc.lamps.x.forEach(([left, right], index) => {
    for (let y = doc.lamps.y; y < doc.lamps.y + doc.lamps.rows; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (index === 0) {
          planes.set(x, y, 3, !view.lamps.ground);
        } else if (index === 1) {
          planes.set(x, y, 0, view.lamps.attack);
          planes.set(x, y, 1, !view.lamps.attack);
        } else {
          planes.set(x, y, 1, !view.lamps.run);
        }
      }
    }
  });
  // `$52402`: clear both message planes, then insert glyph ink in the
  // selected plane after the native eight-pixel reveal displacement.
  for (let y = 144; y < 150; y += 1) {
    for (let x = 16; x <= 303; x += 1) {
      planes.set(x, y, 0, false);
      planes.set(x, y, 1, false);
    }
  }
  [...view.message.cells].forEach((character, index) => {
    doc.fonts
      .get('message')!
      .glyphs.get(character)
      ?.forEach((row, dy) => {
        [...row].forEach((bit, dx) => {
          const x = 16 + index * 6 + dx - (view.message.scrollPixels % 6);
          if (x >= 16 && x <= 303 && bit === '1') {
            planes.set(x, 144 + dy, view.message.planes[index] ?? 0, true);
          }
        });
      });
  });
  const { centre } = view;
  const incoming = centre.steps <= 32;
  const selected =
    centre.steps === 0 ? centre.from : incoming ? centre.to : centre.from;
  const top =
    centre.steps === 0 ? 0 : incoming ? centre.steps : centre.steps - 64;
  const art = centreArt(doc, selected, centre.steps === 0 || !incoming);
  for (let row = 0; row < 32; row += 1) {
    pixels.set(
      art[row - top] ?? new Uint8Array(64),
      (160 - PANEL_TOP + row) * PANEL_WIDTH + 128
    );
  }
  const upper = [...doc.palette.upper];
  const lower = [...doc.palette.lower];
  const definition =
    selected === null ? undefined : doc.centre.definitions.get(selected.slot);
  upper[4] = lower[4] = definition?.colourB ?? 0;
  lower[1] = definition?.colourA ?? 0;
  // `$4D5E8` XORs all 16 mutable words (indices 1..15 plus lower colour 1),
  // including zero words. Frame colour 0 is not one of those words.
  for (let index = 1; index < 16; index += 1) {
    upper[index] = upper[index]! ^ view.mask;
    lower[index] = lower[index]! ^ view.mask;
  }
  return { palette: { lower, upper }, pixels };
};
