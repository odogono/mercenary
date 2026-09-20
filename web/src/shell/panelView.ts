import type { PanelViewModel } from './panel.ts';

/// The instruments that are drawn rather than written.
///
/// Ticks, tapes and needles are geometry, so they are drawn on small 2D canvases inside the DOM
/// panel instead of being approximated with elements. Colours are read from the token layer at
/// draw time, so switching Panel Rendition restyles them along with everything else (ADR 0027).
export interface PanelCanvases {
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

const drawDamoclesMessage = (
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  display: NonNullable<PanelViewModel['damoclesDisplay']>
): void => {
  const context = canvas.getContext('2d');
  if (context === null) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = tokenOf(root, '--msg-ink');
  context.font = DAMOCLES_GLYPH_FONT;
  context.textBaseline = 'bottom';
  for (let index = 0; index < display.cells.length; index += 1) {
    context.fillText(
      display.cells[index]!,
      index * 6 - (display.scrollPixels % 6),
      6
    );
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
