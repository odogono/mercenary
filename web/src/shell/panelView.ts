import type { CentreBoxPanel, CentreBoxView, PanelViewModel } from './panel.ts';

/// The instruments that are drawn rather than written.
///
/// Ticks, tapes and needles are geometry, so they are drawn on small 2D canvases inside the DOM
/// panel instead of being approximated with elements. Colours are read from the token layer at
/// draw time, so switching Panel Rendition restyles them along with everything else (ADR 0027).
export interface PanelCanvases {
  /// The Damocles centre box's 64-by-32 window, drawn over the logo while it shows a document or
  /// scrolls (#598).
  readonly damoclesCentreBox?: HTMLCanvasElement;
  readonly damoclesCompass: HTMLCanvasElement;
  readonly damoclesElevation: HTMLCanvasElement;
  readonly damoclesMessage?: HTMLCanvasElement;
  readonly targCompass?: HTMLCanvasElement;
  readonly targElevation?: HTMLCanvasElement;
}

export interface PanelElements extends PanelCanvases {
  /// Every element carrying `data-field`, in document order.
  ///
  /// A list rather than a map by name: both renditions show the message and the location, so a
  /// name identifies a role that several elements fill rather than one element.
  readonly fields: Iterable<HTMLElement>;
  readonly lamps: Iterable<HTMLElement>;
  readonly root: HTMLElement;
}

/// The gauge shows roughly fifteen degrees either side of the reading, so its window holds the
/// ten, nought and minus-ten graduations the original does rather than a whole quadrant.
const PITCH_PIXELS_PER_DEGREE = 4;
/// Ten degrees is a readable step wide, so the window holds about three graduations as the
/// original's does rather than a crowd of them.
const COMPASS_PIXELS_PER_DEGREE = 4;
/// The Damocles compass shows a half turn across its thirty-two columns: a quarter letter every
/// sixteen, a long tick between each pair, and a short tick every four.
const DAMOCLES_COMPASS_PIXELS_PER_DEGREE = 16 / 90;
/// The Damocles horizon graduates every four rows for ten degrees, longer at every twenty.
const DAMOCLES_PITCH_PIXELS_PER_DEGREE = 0.4;
/// The row the Damocles horizon's reading sits on, a little below the middle of its twenty.
const DAMOCLES_READING_ROW = 11;
/// At eight pixels the extracted face's grid is the canvas grid, so glyphs land whole.
const DAMOCLES_GLYPH_FONT = '8px "Damocles Interface", monospace';
const DAMOCLES_GLYPH_HEIGHT = 5;
const QUARTER_LETTERS = ['N', 'E', 'S', 'W'] as const;

/// A graduation as the panel prints it: wrapped into one turn, never signed, two digits least.
///
/// Both gauges are circular scales, so ten degrees below nought is three hundred and fifty
/// rather than minus ten.
const graduation = (degrees: number): string => {
  const wrapped = ((Math.round(degrees) % 360) + 360) % 360;
  return String(wrapped).padStart(2, '0');
};

interface Surface {
  readonly context: CanvasRenderingContext2D;
  readonly height: number;
  readonly width: number;
}

const surfaceOf = (canvas: HTMLCanvasElement): Surface | undefined => {
  const context = canvas.getContext('2d');
  if (context === null) {
    return undefined;
  }
  context.imageSmoothingEnabled = false;
  return { context, height: canvas.height, width: canvas.width };
};

const tokenOf = (root: HTMLElement, name: string): string =>
  getComputedStyle(root).getPropertyValue(name).trim() || '#000';

export const drawDamoclesMessage = (
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  display: NonNullable<PanelViewModel['damoclesDisplay']>
): void => {
  const context = canvas.getContext('2d');
  if (context === null) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  // Plane 0 is the ordinary green and plane 1 the light blue a Read draws in (`$7BA2`).
  const inks = [tokenOf(root, '--msg-ink'), tokenOf(root, '--msg-ink-read')];
  context.font = DAMOCLES_GLYPH_FONT;
  context.textBaseline = 'bottom';
  for (let index = 0; index < display.cells.length; index += 1) {
    context.fillStyle = inks[display.planes[index] ?? 0]!;
    context.fillText(
      display.cells[index]!,
      index * 6 - (display.scrollPixels % 6),
      DAMOCLES_GLYPH_HEIGHT
    );
  }
};

const CENTRE_BOX_WIDTH = 64;
const CENTRE_BOX_HEIGHT = 32;
/// Device pixels to an ST pixel in the centre box's canvas. Narrowed lettering is rasterised at
/// this resolution, as the panel's `.compact` labels are at the display's, rather than at one
/// sample an ST pixel.
const CENTRE_BOX_RESOLUTION = 4;
/// The centre box's lettering and the name field's bevel, as the Hatari captures show them.
const CENTRE_BOX_TEXT = '#cccccc';
const CENTRE_BOX_FIELD_DARK = '#444444';
const CENTRE_BOX_FIELD_LIGHT = '#eeeeee';
const CENTRE_BOX_NAME = '#000000';

/// A `#rrggbb` colour XORed with an ST `0RGB` mask, three bits a channel as the panel draws
/// them. Black is left as it is: the Damocles AUTHORS COMPUTER's option 1 rewrites every panel
/// colour but it, and its digits stay black in the #626 captures (#628).
export const maskedColour = (colour: string, mask: number): string => {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(colour);
  if (mask === 0 || match === null) {
    return colour;
  }
  const word = [1, 2, 3].reduce(
    (total, group) =>
      (total << 4) | Math.round(Number.parseInt(match[group]!, 16) / 34),
    0
  );
  if (word === 0) {
    return colour;
  }
  const masked = word ^ mask;
  return `#${[8, 4, 0]
    .map(shift => (((masked >> shift) & 7) * 34).toString(16).padStart(2, '0'))
    .join('')}`;
};

/// A `#rgb` or `#rrggbb` colour as `#rrggbb`, or undefined for anything else.
const longHex = (colour: string): string | undefined => {
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(colour);
  if (short !== null) {
    return `#${short[1]!.repeat(2)}${short[2]!.repeat(2)}${short[3]!.repeat(2)}`;
  }
  return /^#[\da-f]{6}$/i.test(colour) ? colour : undefined;
};

/// The Damocles Panel Rendition's custom properties that hold its palette, which the panel
/// mask rewrites. The message bar's are left out: it keeps its own colours in the captures.
const MASKED_PANEL_PROPERTIES = [
  '--st-4',
  '--st-6',
  '--st-8',
  '--st-a',
  '--st-c',
  '--st-e',
  '--nav-face',
  '--nav-lcd',
  '--nav-ink-negative',
  '--nav-label',
  '--gauge-sky',
  '--gauge-ground',
  '--inv-face',
  '--inv-lcd',
  '--inv-label',
  '--clock-bg',
  '--lamp-on',
  '--ground-lamp-on',
  '--temperature-fill',
  '--power-fill',
  '--capacity-fill'
] as const;

/// Rewrite the panel's palette through `mask`, or restore the authored one at 0.
const maskPanel = (panel: HTMLElement, mask: number): void => {
  for (const property of MASKED_PANEL_PROPERTIES) {
    panel.style.removeProperty(property);
  }
  if (mask === 0) {
    return;
  }
  const authored = getComputedStyle(panel);
  for (const property of MASKED_PANEL_PROPERTIES) {
    const colour = longHex(authored.getPropertyValue(property).trim());
    if (colour !== undefined) {
      panel.style.setProperty(property, maskedColour(colour, mask));
    }
  }
};

/// The colours the centre box draws in, under the panel mask.
interface CentreBoxInk {
  readonly dark: string;
  readonly field: string;
  readonly ground: string;
  readonly light: string;
  readonly logo: readonly [string, string];
  readonly name: string;
  readonly text: string;
}

const inkOf = (panel: CentreBoxPanel | null, mask: number): CentreBoxInk => {
  const ink = (colour: string) => maskedColour(colour, mask);
  return {
    dark: ink(CENTRE_BOX_FIELD_DARK),
    field: ink(panel?.field ?? CENTRE_BOX_NAME),
    ground: ink(panel?.ground ?? CENTRE_BOX_NAME),
    light: ink(CENTRE_BOX_FIELD_LIGHT),
    logo: [ink('#444444'), ink('#666666')],
    name: CENTRE_BOX_NAME,
    text: ink(CENTRE_BOX_TEXT)
  };
};

/// Letter `text` from `x` a glyph every `pitch` columns, each narrowed to `width` columns. The
/// original's condensed faces are not extracted, so the interface face stands in for them,
/// narrowed as the panel's `.compact` labels are (ADR 0027).
const letter = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  pitch: number,
  width: number,
  colour: string
): void => {
  context.save();
  context.font = DAMOCLES_GLYPH_FONT;
  context.textBaseline = 'bottom';
  context.fillStyle = colour;
  // Composed onto the caller's transform, which carries the transition's row offset.
  const base = context.getTransform();
  for (let index = 0; index < text.length; index += 1) {
    context.setTransform(base);
    context.translate(x + index * pitch, y);
    context.scale(width / 5, 1);
    context.fillText(text[index]!, 0, DAMOCLES_GLYPH_HEIGHT);
  }
  context.restore();
};

/// `text` lettered centred across the window.
const centred = (
  context: CanvasRenderingContext2D,
  text: string,
  y: number,
  pitch: number,
  width: number,
  colour: string
): void =>
  letter(
    context,
    text,
    Math.max(1, (CENTRE_BOX_WIDTH - (text.length * pitch - 1)) / 2),
    y,
    pitch,
    width,
    colour
  );

/// A field with the name field's bevel: dark along its top and right, light along its left and
/// bottom, `fill` inside. `x`, `y`, `width` and `height` are the fill's.
const bevelled = (
  context: CanvasRenderingContext2D,
  ink: CentreBoxInk,
  fill: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }
): void => {
  const { height, width, x, y } = fill;
  context.fillStyle = ink.field;
  context.fillRect(x, y, width, height);
  context.fillStyle = ink.dark;
  context.fillRect(x - 1, y - 1, width + 2, 1);
  context.fillRect(x + width, y - 1, 1, height + 2);
  context.fillStyle = ink.light;
  context.fillRect(x - 1, y, 1, height + 1);
  context.fillRect(x - 1, y + height, width + 1, 1);
};

/// The Damocles centre box (#598): a document's panel, or the logo while it scrolls.
///
/// The original draws a document's title from a strip in the graphic table at `$066100`, which
/// is not decoded, so the lettering, the `−` and `+` and the name field are authored to match the
/// Hatari captures of the DAMOCLES FILE (ADR 0043). The colours are recovered: the Open table's
/// colour 15 is the ground and colour 3 the name field. Every colour but black goes through the
/// panel mask `mask` (#628).
export const drawCentreBox = (
  canvas: HTMLCanvasElement,
  view: CentreBoxView,
  mask = 0
): void => {
  const surface = surfaceOf(canvas);
  if (surface === undefined) {
    return;
  }
  const { context } = surface;
  context.setTransform(
    CENTRE_BOX_RESOLUTION,
    0,
    0,
    CENTRE_BOX_RESOLUTION,
    0,
    0
  );
  context.fillStyle = '#000000';
  context.fillRect(0, 0, CENTRE_BOX_WIDTH, CENTRE_BOX_HEIGHT);
  context.save();
  context.translate(0, view.top);
  const panel = view.panel;
  const ink = inkOf(panel, mask);
  if (panel === null) {
    // The logo, as the resting badge letters it.
    context.font = DAMOCLES_GLYPH_FONT;
    context.textBaseline = 'bottom';
    const x = (CENTRE_BOX_WIDTH - 8 * 6) / 2;
    for (const [dx, colour] of [
      [2, ink.logo[0]],
      [1, ink.logo[1]],
      [0, ink.text]
    ] as const) {
      context.fillStyle = colour;
      context.fillText('DAMOCLES', x + dx, 18 + dx);
    }
  } else {
    context.fillStyle = ink.ground;
    context.fillRect(0, 0, CENTRE_BOX_WIDTH, CENTRE_BOX_HEIGHT);
    // The title's face is four columns on a pitch of five. The original keeps a column of
    // ground between the bevel and the DAMOCLES FILE's first letter, so a title as long as that
    // is narrowed a little to leave it, and a longer one further.
    const pitch = Math.min(5, CENTRE_BOX_WIDTH / panel.title.length);
    centred(
      context,
      panel.title,
      1,
      pitch,
      pitch - 1,
      panel.kind === 'computer' ? ink.dark : ink.text
    );
    if (panel.kind === 'switch') {
      drawSwitchLamp(context, panel, ink);
    } else if (panel.kind === 'computer') {
      drawComputer(context, panel, ink);
    } else {
      context.fillStyle = ink.text;
      context.fillRect(1, 12, 4, 1);
      context.fillRect(58, 12, 5, 1);
      context.fillRect(60, 10, 1, 5);
      bevelled(context, ink, { height: 7, width: 49, x: 7, y: 9 });
      if (panel.item !== null) {
        letter(context, panel.item, 8, 10, 6, 5, ink.name);
      }
      centred(context, 'INDEX', 19, 4, 3, ink.text);
      centred(context, 'PRESS * TO VIEW', 26, 4, 3, ink.text);
    }
  }
  context.restore();
  clearTransitionRows(context, view.top);
};

/// The rows the transition has cleared, below the panel rising out or above the one rising in.
const clearTransitionRows = (
  context: CanvasRenderingContext2D,
  top: number
): void => {
  if (top === 0) {
    return;
  }
  context.fillStyle = '#000000';
  if (top < 0) {
    context.fillRect(0, CENTRE_BOX_HEIGHT + top, CENTRE_BOX_WIDTH, -top);
  } else {
    context.fillRect(0, 0, CENTRE_BOX_WIDTH, top);
  }
};

/// A `−` and a `+` either side of a field, on row `y`: the `+` is `plus` columns in.
const minusPlus = (
  context: CanvasRenderingContext2D,
  colour: string,
  minus: number,
  plus: number,
  y: number
): void => {
  context.fillStyle = colour;
  context.fillRect(minus, y, 4, 1);
  context.fillRect(plus, y, 5, 1);
  context.fillRect(plus + 2, y - 2, 1, 5);
};

/// A switch's `−` lamp `+` (#627), placed from the #626 captures of NOVA TRIGGER 1: the field
/// in colour 3 on rows 14 to 20 with the name field's bevel, and ON or OFF lettered in it once
/// the panel has arrived.
const drawSwitchLamp = (
  context: CanvasRenderingContext2D,
  panel: CentreBoxPanel,
  ink: CentreBoxInk
): void => {
  minusPlus(context, ink.text, 15, 45, 17);
  bevelled(context, ink, { height: 7, width: 23, x: 21, y: 14 });
  if (panel.item !== null) {
    // ON is lettered on a pitch of eight and OFF of seven and a half, both centred in the field.
    const pitch = panel.item.length > 2 ? 7.5 : 8;
    const x = 32.5 - (panel.item.length * pitch - (pitch - 6)) / 2;
    letter(context, panel.item, x, 15, pitch, 6, ink.name);
  }
};

/// The AUTHORS COMPUTER's panel (#628, `$04DA5A`), placed from the #626 captures: PARAMETER No
/// and the option in a small field, then VALUE `−` and the value's three digits `+`, all in the
/// dark ink on colour 15, the fields in colour 3.
const drawComputer = (
  context: CanvasRenderingContext2D,
  panel: CentreBoxPanel,
  ink: CentreBoxInk
): void => {
  letter(context, 'PARAMETER', 1, 11, 4.3, 3.3, ink.dark);
  letter(context, 'No', 44, 11, 5, 4, ink.dark);
  bevelled(context, ink, { height: 7, width: 8, x: 55, y: 10 });
  letter(context, 'VALUE', 6, 23, 4, 3, ink.dark);
  minusPlus(context, ink.dark, 28, 55, 25);
  bevelled(context, ink, { height: 7, width: 20, x: 34, y: 22 });
  if (panel.parameter !== null) {
    letter(context, String(panel.parameter), 56, 11, 5, 5, ink.name);
  }
  if (panel.item !== null) {
    letter(context, panel.item, 35, 23, 6, 5, ink.name);
  }
};

/// The artificial horizon: a tape that scrolls, like the compass laid on its side.
///
/// The graduations ride with the reading rather than standing still, so climbing scrolls the
/// numbers down through the window exactly as turning scrolls the compass across it. The
/// sky-over-ground boundary is the nought on that tape, which is why it moves too.
export const drawElevation = (
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  pitchDegrees: number
): void => {
  const surface = surfaceOf(canvas);
  if (surface === undefined) {
    return;
  }
  const { context, height, width } = surface;
  // Where a given elevation sits in the window: the current reading is at the centre.
  const rowOf = (value: number): number =>
    height / 2 - (value - pitchDegrees) * PITCH_PIXELS_PER_DEGREE;
  const horizon = Math.max(0, Math.min(height, rowOf(0)));
  context.fillStyle = tokenOf(root, '--gauge-sky');
  context.fillRect(0, 0, width, horizon);
  context.fillStyle = tokenOf(root, '--gauge-ground');
  context.fillRect(0, horizon, width, height - horizon);
  context.fillStyle = tokenOf(root, '--gauge-ink');
  context.font = '8px "Mercenary Pixel", monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const span = height / 2 / PITCH_PIXELS_PER_DEGREE;
  const first = Math.ceil((pitchDegrees - span) / 5) * 5;
  for (let mark = first; mark <= pitchDegrees + span; mark += 5) {
    const y = Math.round(rowOf(mark));
    if (y < 1 || y > height - 1) {
      continue;
    }
    const labelled = ((mark % 10) + 10) % 10 === 0;
    const tick = labelled ? 5 : 3;
    context.fillRect(1, y, tick, 1);
    context.fillRect(width - 1 - tick, y, tick, 1);
    if (labelled) {
      context.fillText(graduation(mark), width / 2, y);
    }
  }
};

/// The compass tape: ticks along both edges, degrees down the middle.
export const drawCompass = (
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  headingDegrees: number
): void => {
  const surface = surfaceOf(canvas);
  if (surface === undefined) {
    return;
  }
  const { context, height, width } = surface;
  context.fillStyle = tokenOf(root, '--gauge-face');
  context.fillRect(0, 0, width, height);
  context.fillStyle = tokenOf(root, '--gauge-ink');
  context.font = '9px "Mercenary Pixel", monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // The scale falls to the right: ten sits left of the current heading and three hundred and
  // fifty sits right of it.
  const span = width / 2 / COMPASS_PIXELS_PER_DEGREE;
  const first = Math.ceil((headingDegrees - span) / 2) * 2;
  for (let mark = first; mark <= headingDegrees + span; mark += 2) {
    const x = Math.round(
      width / 2 - (mark - headingDegrees) * COMPASS_PIXELS_PER_DEGREE
    );
    const labelled = ((mark % 10) + 10) % 10 === 0;
    const length = labelled ? 7 : 4;
    context.fillRect(x, 0, 1, length);
    context.fillRect(x, height - length, 1, length);
    if (labelled) {
      context.fillText(graduation(mark), x, height / 2);
    }
  }
  // The original marks the centre faintly rather than with a needle over the numbers.
  context.fillStyle = tokenOf(root, '--panel-face-dark');
  context.fillRect(Math.round(width / 2), 0, 1, height);
};

/// Letter the Damocles instruments on their own pixel grid.
///
/// The face is drawn at the size where one of its pixels is one canvas pixel and placed by the
/// left edge of its ink, so a glyph lands whole rather than straddling two columns. Returns the
/// width of the ink written.
const damoclesGlyphs = (
  context: CanvasRenderingContext2D,
  text: string,
  left: number,
  top: number,
  spacing = 0
): number => {
  context.font = DAMOCLES_GLYPH_FONT;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.letterSpacing = `${spacing}px`;
  const metrics = context.measureText(text);
  const inkLeft = Math.round(metrics.actualBoundingBoxLeft);
  context.fillText(text, left + inkLeft, top + DAMOCLES_GLYPH_HEIGHT);
  return Math.round(metrics.actualBoundingBoxRight + inkLeft);
};

const damoclesInkWidth = (
  context: CanvasRenderingContext2D,
  text: string,
  spacing = 0
): number => {
  context.font = DAMOCLES_GLYPH_FONT;
  context.letterSpacing = `${spacing}px`;
  const metrics = context.measureText(text);
  return Math.round(
    metrics.actualBoundingBoxRight + metrics.actualBoundingBoxLeft
  );
};

/// The Damocles mini horizon: a tape of sky over ground that scrolls with the nose, read
/// against a fixed line carrying the pitch in degrees.
///
/// Graduations ride the tape every ten degrees, longer at twenty, as dots at both edges. The
/// reading stays put a little below the middle, black on the tape with dashes out to the edges,
/// so at level flight the line and the horizon coincide.
export const drawDamoclesElevation = (
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  pitchDegrees: number
): void => {
  void root;
  const surface = surfaceOf(canvas);
  if (surface === undefined) {
    return;
  }
  const { context, height, width } = surface;
  const rowOf = (value: number): number =>
    DAMOCLES_READING_ROW -
    (value - pitchDegrees) * DAMOCLES_PITCH_PIXELS_PER_DEGREE;
  const horizon = Math.max(0, Math.min(height, Math.round(rowOf(0))));
  const ground = tokenOf(canvas, '--gauge-ground');
  const ink = tokenOf(canvas, '--nav-ink');
  context.fillStyle = tokenOf(canvas, '--gauge-sky');
  context.fillRect(0, 0, width, horizon);
  context.fillStyle = ground;
  context.fillRect(0, horizon, width, height - horizon);
  context.fillStyle = ink;
  const span = height / 2 / DAMOCLES_PITCH_PIXELS_PER_DEGREE;
  const firstMark = Math.ceil((pitchDegrees - span) / 10) * 10;
  for (let mark = firstMark; mark <= pitchDegrees + span; mark += 10) {
    const y = Math.round(rowOf(mark));
    const depth = mark % 20 === 0 ? 2 : 1;
    if (y >= 0 && y < height) {
      context.fillRect(0, y, depth, 1);
      context.fillRect(width - depth, y, depth, 1);
    }
  }
  const reading = String(Math.round(pitchDegrees));
  const spacing = -2;
  const inkWidth = damoclesInkWidth(context, reading, spacing);
  const left = Math.max(0, Math.floor((width - inkWidth) / 2));
  const top = DAMOCLES_READING_ROW - 2;
  context.fillRect(0, DAMOCLES_READING_ROW, width, 1);
  context.fillStyle = ground;
  context.fillRect(left - 1, top, inkWidth + 2, DAMOCLES_GLYPH_HEIGHT);
  context.fillStyle = ink;
  damoclesGlyphs(context, reading, left, top, spacing);
};

/// The Damocles compass strip: a tick every twenty-two and a half degrees along both edges,
/// longer between the quarters, with the quarter letters between the long ticks and a single
/// index pixel at the centre. The scale falls to the right, as the Targ compass does.
export const drawDamoclesCompass = (
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  headingDegrees: number
): void => {
  void root;
  const surface = surfaceOf(canvas);
  if (surface === undefined) {
    return;
  }
  const { context, height, width } = surface;
  const ink = tokenOf(canvas, '--nav-ink');
  context.fillStyle = tokenOf(canvas, '--nav-lcd');
  context.fillRect(0, 0, width, height);
  context.fillStyle = ink;
  const centre = width / 2;
  const span = centre / DAMOCLES_COMPASS_PIXELS_PER_DEGREE;
  const first = Math.ceil((headingDegrees - span) / 22.5) * 22.5;
  for (let mark = first; mark <= headingDegrees + span; mark += 22.5) {
    const x = Math.round(
      centre - (mark - headingDegrees) * DAMOCLES_COMPASS_PIXELS_PER_DEGREE
    );
    if (x < 0 || x >= width) {
      continue;
    }
    const quarter = mark % 90 === 0;
    const depth = mark % 45 === 0 && !quarter ? 2 : 1;
    context.fillRect(x, 0, 1, depth);
    context.fillRect(x, height - depth, 1, depth);
    if (quarter) {
      const letter =
        QUARTER_LETTERS[((((mark / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3]!;
      const inkWidth = damoclesInkWidth(context, letter);
      damoclesGlyphs(context, letter, x - Math.floor(inkWidth / 2), 2);
    }
  }
  context.fillRect(Math.floor(centre), Math.floor(height / 2), 1, 1);
};

/// The width the panel is authored at, and the scale everything inside it is drawn to.
const PANEL_WIDTH = 1280;
const BENSON_CELL_COUNT = 23;

const writeField = (
  element: HTMLElement,
  name: keyof PanelViewModel,
  value: string
): void => {
  const points = [...value];
  if (name !== 'message' || points.length !== BENSON_CELL_COUNT) {
    element.classList.remove('benson-cells');
    if (element.textContent !== value) {
      element.textContent = value;
    }
    return;
  }
  if (
    element.classList.contains('benson-cells') &&
    element.children.length === BENSON_CELL_COUNT
  ) {
    points.forEach((point, index) => {
      const cell = element.children.item(index);
      if (cell !== null && cell.textContent !== point) {
        cell.textContent = point;
      }
    });
    return;
  }
  element.classList.add('benson-cells');
  element.replaceChildren(
    ...points.map(point => {
      const cell = document.createElement('span');
      cell.className = 'benson-cell';
      cell.textContent = point;
      return cell;
    })
  );
};

const LOCATION_AXES = 'location-axes';

/// The location readout's axes, written one element each so a negative axis can be drawn red.
///
/// Only the Damocles Cell Readout carries a sign; a rendition that carries none keeps the one
/// plain text node it always had, so nothing about Targ's or the Flyover's readout changes. The
/// split is made once and then only the digits are rewritten, in the churn discipline the rest
/// of the panel keeps (#397).
const writeLocationLabel = (
  element: HTMLElement,
  value: string,
  axes: PanelViewModel['locationAxes']
): void => {
  if (axes === undefined) {
    element.classList.remove(LOCATION_AXES);
    writeField(element, 'locationLabel', value);
    return;
  }
  if (
    !element.classList.contains(LOCATION_AXES) ||
    element.children.length !== axes.length
  ) {
    element.classList.add(LOCATION_AXES);
    const children: Node[] = [];
    for (const [index] of axes.entries()) {
      if (index > 0) {
        children.push(document.createTextNode('-'));
      }
      const span = document.createElement('span');
      span.className = 'location-axis';
      children.push(span);
    }
    element.replaceChildren(...children);
  }
  axes.forEach((axis, index) => {
    const span = element.children.item(index) as HTMLElement | null;
    if (span === null) {
      return;
    }
    if (span.textContent !== axis.text) {
      span.textContent = axis.text;
    }
    const negative = axis.negative ? 'true' : 'false';
    if (span.dataset['negative'] !== negative) {
      span.dataset['negative'] = negative;
    }
  });
};

/// Keep the authored panel filling the width it is given.
///
/// The panel is one fixed composition rather than a fluid layout, so it is scaled whole: at any
/// width the instruments keep the proportions they were drawn with. CSS cannot divide two
/// lengths to reach the required number, so the shell measures and sets it.
export const installPanelScale = (
  panel: HTMLElement,
  scaled: HTMLElement,
  observe: (target: Element, onResize: () => void) => void
): void => {
  const apply = (): void => {
    const width = panel.clientWidth;
    if (width > 0) {
      scaled.style.setProperty('--panel-scale', String(width / PANEL_WIDTH));
    }
  };
  observe(panel, apply);
  apply();
};

/// Draw one moment of the Benson Panel.
///
/// Text is written only where it changed, in the same discipline the status strip uses: this runs
/// on every frame, and a panel that rewrote every readout would churn the whole subtree.
export const installPanel = (
  elements: PanelElements
): { readonly draw: (model: PanelViewModel) => void } => {
  let lastCompass: number | undefined;
  let lastCentreBox: string | undefined;
  let lastPanelMask = 0;
  let lastElevation: number | undefined;
  let lastRendition: string | undefined;
  return {
    draw: model => {
      const messageCanvas = elements.damoclesMessage;
      for (const element of elements.fields) {
        const name = element.dataset['field'] as keyof PanelViewModel;
        if (name === 'message' && messageCanvas !== undefined) {
          const hasDamoclesDisplay = model.damoclesDisplay !== undefined;
          element.hidden = hasDamoclesDisplay;
          messageCanvas.hidden = !hasDamoclesDisplay;
          if (hasDamoclesDisplay) {
            drawDamoclesMessage(
              messageCanvas,
              elements.root,
              model.damoclesDisplay!
            );
            continue;
          }
        }
        const value = String(model[name] ?? '');
        if (name === 'locationLabel') {
          writeLocationLabel(element, value, model.locationAxes);
          continue;
        }
        writeField(element, name, value);
        if (name === 'message') {
          element.dataset['bensonColour'] =
            model.messageColour === undefined
              ? ''
              : String(model.messageColour);
        }
      }
      const panelMask = model.panelMask ?? 0;
      if (panelMask !== lastPanelMask) {
        lastPanelMask = panelMask;
        maskPanel(elements.root, panelMask);
      }
      const centreCanvas = elements.damoclesCentreBox;
      if (centreCanvas !== undefined && model.centreBox !== undefined) {
        // At rest on the logo the badge shows as it always has; the canvas covers it otherwise.
        const box = model.centreBox;
        const mask = model.panelMask ?? 0;
        // A masked logo is drawn rather than left to the badge, which keeps its own colours.
        const resting = box.panel === null && box.top === 0 && mask === 0;
        const key = JSON.stringify({ box, mask });
        if (key !== lastCentreBox) {
          lastCentreBox = key;
          centreCanvas.hidden = resting;
          centreCanvas.dataset['panel'] = box.panel?.title ?? '';
          centreCanvas.dataset['item'] = box.panel?.item ?? '';
          if (!resting) {
            drawCentreBox(centreCanvas, box, mask);
          }
        }
      }
      for (const element of elements.lamps) {
        const name = element.dataset['lamp'] as keyof PanelViewModel;
        const lit = model[name] === true;
        if (element.classList.contains('on') !== lit) {
          element.classList.toggle('on', lit);
        }
      }
      // A rendition change restyles the canvases, so they are redrawn even when the needle has
      // not moved.
      const rendition = elements.root.dataset['rendition'] ?? '';
      const restyled = rendition !== lastRendition;
      lastRendition = rendition;
      if (restyled || model.elevationDegrees !== lastElevation) {
        lastElevation = model.elevationDegrees;
        if (elements.targElevation !== undefined) {
          drawElevation(
            elements.targElevation,
            elements.root,
            model.elevationDegrees
          );
        }
        drawDamoclesElevation(
          elements.damoclesElevation,
          elements.root,
          model.elevationDegrees
        );
      }
      if (restyled || model.compassDegrees !== lastCompass) {
        lastCompass = model.compassDegrees;
        if (elements.targCompass !== undefined) {
          drawCompass(
            elements.targCompass,
            elements.root,
            model.compassDegrees
          );
        }
        drawDamoclesCompass(
          elements.damoclesCompass,
          elements.root,
          model.compassDegrees
        );
      }
    }
  };
};
