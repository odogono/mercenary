import type { PanelViewModel } from './panel.ts';

/// The instruments that are drawn rather than written.
///
/// Ticks, tapes and needles are geometry, so they are drawn on small 2D canvases inside the DOM
/// panel instead of being approximated with elements. Colours are read from the token layer at
/// draw time, so switching Panel Rendition restyles them along with everything else (ADR 0027).
export interface PanelCanvases {
  readonly damoclesCompass: HTMLCanvasElement;
  readonly damoclesElevation: HTMLCanvasElement;
  readonly targCompass: HTMLCanvasElement;
  readonly targElevation: HTMLCanvasElement;
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
const DAMOCLES_PIXELS_PER_DEGREE = 0.28;
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

/// The Damocles mini horizon: the same instrument, with its value boxed on the horizon.
export const drawDamoclesElevation = (
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  pitchDegrees: number
): void => {
  const surface = surfaceOf(canvas);
  if (surface === undefined) {
    return;
  }
  const { context, height, width } = surface;
  const rowOf = (value: number): number =>
    height / 2 - (value - pitchDegrees) * PITCH_PIXELS_PER_DEGREE;
  const horizon = Math.max(0, Math.min(height, rowOf(0)));
  context.fillStyle = tokenOf(root, '--gauge-sky');
  context.fillRect(0, 0, width, horizon);
  context.fillStyle = tokenOf(root, '--gauge-ground');
  context.fillRect(0, horizon, width, height - horizon);
  const ink = tokenOf(root, '--nav-ink');
  context.fillStyle = ink;
  // The graduations scroll with the reading here too, as square dots rather than dashes.
  const span = height / 2 / PITCH_PIXELS_PER_DEGREE;
  const firstMark = Math.ceil((pitchDegrees - span) / 5) * 5;
  for (let mark = firstMark; mark <= pitchDegrees + span; mark += 5) {
    const y = Math.round(rowOf(mark));
    if (y >= 1 && y <= height - 3) {
      context.fillRect(1, y, 2, 2);
      context.fillRect(width - 3, y, 2, 2);
    }
  }
  const boxTop = Math.round(height / 2) - 6;
  context.fillRect(0, boxTop + 5, 5, 2);
  context.fillRect(width - 5, boxTop + 5, 5, 2);
  context.fillStyle = tokenOf(root, '--nav-lcd');
  context.fillRect(5, boxTop, width - 10, 13);
  context.strokeStyle = ink;
  context.lineWidth = 1;
  context.strokeRect(5.5, boxTop + 0.5, width - 11, 12);
  context.fillStyle = ink;
  context.font = '9px "Damocles Interface", monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(Math.round(pitchDegrees)), width / 2, boxTop + 7);
};

/// The Damocles compass strip: bold quarter letters between paired square ticks.
export const drawDamoclesCompass = (
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  headingDegrees: number
): void => {
  const surface = surfaceOf(canvas);
  if (surface === undefined) {
    return;
  }
  const { context, height, width } = surface;
  context.fillStyle = tokenOf(root, '--nav-lcd');
  context.fillRect(0, 0, width, height);
  context.fillStyle = tokenOf(root, '--nav-ink');
  context.font = '10px "Damocles Interface", monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const span = width / 2 / DAMOCLES_PIXELS_PER_DEGREE;
  const first = Math.ceil((headingDegrees - span) / 45) * 45;
  for (let mark = first; mark <= headingDegrees + span; mark += 45) {
    const x = Math.round(
      width / 2 + (mark - headingDegrees) * DAMOCLES_PIXELS_PER_DEGREE
    );
    if (((mark % 90) + 90) % 90 === 0) {
      const letter =
        QUARTER_LETTERS[((((mark / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3]!;
      context.fillText(letter, x, height / 2 + 1);
      // Struck twice, because the panel's own labels are bolder than one pass.
      context.fillText(letter, x + 1, height / 2 + 1);
    } else {
      context.fillRect(x - 1, 2, 2, 2);
      context.fillRect(x - 1, height - 4, 2, 2);
    }
  }
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
      for (const element of elements.fields) {
        const name = element.dataset['field'] as keyof PanelViewModel;
        const value = String(model[name] ?? '');
        writeField(element, name, value);
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
        drawElevation(
          elements.targElevation,
          elements.root,
          model.elevationDegrees
        );
        drawDamoclesElevation(
          elements.damoclesElevation,
          elements.root,
          model.elevationDegrees
        );
      }
      if (restyled || model.compassDegrees !== lastCompass) {
        lastCompass = model.compassDegrees;
        drawCompass(elements.targCompass, elements.root, model.compassDegrees);
        drawDamoclesCompass(
          elements.damoclesCompass,
          elements.root,
          model.compassDegrees
        );
      }
    }
  };
};
