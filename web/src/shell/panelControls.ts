import type { Point, Size } from '../projection/index.ts';
import { PANEL_ROWS, PANEL_TOP, PANEL_WIDTH } from './panelPixels.ts';

/// The Gameplay Panel's pointer and keyboard Accommodations, shared by Damocles, Mercenary III and
/// Targ (#599). Each control is a Semantic Action a key already gives, placed over the panel's own
/// pixels: the head's name opens it (Enter) and its ends rotate the Carried Stack (`[` and `]`),
/// the open centre box pages and reads (`,` `.` and `*`), ✕ closes it (Escape), and the run lamp
/// toggles running (R). A Title supplies where its panel draws each, and what each does.

/// A rectangle in a panel's own pixels: x from 0 to 319, y in screen rows 136 to 199.
export interface PanelRect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/// Where a Title's panel draws the windows its controls lie over. A Title leaves out a window its
/// panel does not have.
export interface PanelControlLayout {
  readonly centre?: PanelRect;
  readonly head?: PanelRect;
  readonly run?: PanelRect;
}

export type CentreCommand = 'next' | 'parameter' | 'previous' | 'read';

/// What each control does. A Title leaves out a control it has no action for.
export interface PanelControlActions {
  /// A press on the open centre box: the command its point stands for. Without this the box
  /// pages by halves around the item's name, as `centreBoxPage` reads it.
  readonly centreAt?: (point: Point, size: Size) => CentreCommand;
  /// Close the open document.
  readonly close?: () => void;
  readonly command?: (command: CentreCommand) => void;
  /// Whether play may take a pointer action now: no menu, console or chrome has it.
  readonly mayAct: () => boolean;
  /// Open the Carried Stack's head.
  readonly open?: () => void;
  readonly rotate?: (direction: 'backward' | 'forward') => void;
  readonly toggleRunning?: () => void;
}

/// What the controls show, read from the Session each frame. A panel without a head or a
/// centre box leaves its part out.
export interface PanelControlState {
  readonly centre?: {
    /// The centre box's accessible name.
    readonly label: string;
    /// A document is open on the centre box, so it pages and ✕ closes it.
    readonly open: boolean;
    /// The open panel has a parameter to step, as the AUTHORS COMPUTER does.
    readonly parameter: boolean;
    /// The centre box shows the Title's logo with no transition running.
    readonly resting: boolean;
  };
  readonly head?: {
    /// The head's name.
    readonly inventory: string;
    /// Open would act on the head: the pointer's hover cue.
    readonly opens: boolean;
  };
  readonly running: boolean;
}

export interface PanelControls {
  /// The centre box's control, which a Title may also label with its own provenance.
  readonly centre: HTMLElement | undefined;
  update(state: PanelControlState): void;
}

/// A recovered panel's window and the bevel round it.
const padded = (rect: PanelRect, x: number, y: number): PanelRect => ({
  height: rect.height + 2 * y,
  width: rect.width + 2 * x,
  x: rect.x - x,
  y: rect.y - y
});

/// The controls of the recovered Damocles and Mercenary III panels, which draw these windows in
/// the same places: the head's name field, the centre box, and the run lamp, each with its bevel.
export const recoveredPanelLayout = (panel: {
  readonly centre: PanelRect;
  readonly inventory: {
    readonly box: readonly (readonly [number, number])[];
    readonly rows: number;
    readonly y: number;
  };
  readonly runLamp: {
    readonly rows: number;
    readonly x: readonly [number, number];
    readonly y: number;
  };
}): PanelControlLayout => {
  const left = panel.inventory.box[0]![0];
  const right = panel.inventory.box.at(-1)![1];
  return {
    centre: panel.centre,
    head: padded(
      {
        height: panel.inventory.rows,
        width: right - left + 1,
        x: left,
        y: panel.inventory.y
      },
      1,
      2
    ),
    run: padded(
      {
        height: panel.runLamp.rows,
        width: panel.runLamp.x[1] - panel.runLamp.x[0] + 1,
        x: panel.runLamp.x[0],
        y: panel.runLamp.y
      },
      2,
      2
    )
  };
};

/// Targ's run lamp, the speed lamp `targPanelWriter` draws at x 199 on rows 149 to 154.
export const TARG_PANEL_LAYOUT: PanelControlLayout = {
  run: padded({ height: 6, width: 5, x: 199, y: 149 }, 2, 2)
};

/// The centre box's item name field, in the 64 by 32 cells both recovered panels letter it on,
/// bevel included.
const CENTRE_BOX_CELLS = { height: 32, width: 64 } as const;
const NAME_FIELD = { bottom: 17, left: 6, right: 57, top: 8 } as const;

/// The pointer's paging of an open document (#599), an Accommodation the originals have no
/// pointer for. A click on the item's name reads it, as `*` does. Anywhere else on the centre
/// box pages the way its `−` or `+` stands: the left half back, the right half on. The point
/// and the size are in any one unit.
export const centreBoxPage = (
  point: Point,
  size: Size
): 'next' | 'previous' | 'read' => {
  const x = (point.x / size.width) * CENTRE_BOX_CELLS.width;
  const y = (point.y / size.height) * CENTRE_BOX_CELLS.height;
  if (
    x >= NAME_FIELD.left &&
    x < NAME_FIELD.right &&
    y >= NAME_FIELD.top &&
    y < NAME_FIELD.bottom
  ) {
    return 'read';
  }
  return x < CENTRE_BOX_CELLS.width / 2 ? 'previous' : 'next';
};

/// Wheel travel, in CSS pixels, to one page. A mouse notch is about 100 and a trackpad sends
/// many small deltas, so the travel is gathered and pages one at a time.
export const WHEEL_PAGE_PIXELS = 50;

/// `WheelEvent.deltaMode`'s line and page units, each of which is a notch on its own.
const DOM_DELTA_PIXEL = 0;

/// One wheel event over an open document: the page it turns, if any, and the travel gathered
/// toward the next. Down pages on and up pages back. Travel the other way starts afresh, and
/// one event turns one page at most, so a hard flick does not skip items unseen.
export const wheelPage = (
  gathered: number,
  deltaY: number,
  deltaMode: number
): {
  readonly gathered: number;
  readonly page: 'next' | 'previous' | undefined;
} => {
  if (deltaY === 0) {
    return { gathered, page: undefined };
  }
  const travel =
    deltaMode === DOM_DELTA_PIXEL
      ? (Math.sign(gathered) === Math.sign(deltaY) ? gathered : 0) + deltaY
      : Math.sign(deltaY) * WHEEL_PAGE_PIXELS;
  if (Math.abs(travel) < WHEEL_PAGE_PIXELS) {
    return { gathered: travel, page: undefined };
  }
  return { gathered: 0, page: travel > 0 ? 'next' : 'previous' };
};

/// A rectangle as percentages of the panel, so the controls follow the panel at any scale.
const place = (element: HTMLElement, rect: PanelRect): void => {
  element.style.left = `${(rect.x / PANEL_WIDTH) * 100}%`;
  element.style.top = `${((rect.y - PANEL_TOP) / PANEL_ROWS) * 100}%`;
  element.style.width = `${(rect.width / PANEL_WIDTH) * 100}%`;
  element.style.height = `${(rect.height / PANEL_ROWS) * 100}%`;
};

const button = (
  control: string,
  label: string,
  title?: string,
  text = ''
): HTMLButtonElement => {
  const element = document.createElement('button');
  element.type = 'button';
  element.dataset['panelControl'] = control;
  element.setAttribute('aria-label', label);
  if (title !== undefined) {
    element.title = title;
  }
  element.textContent = text;
  // A pressed button would keep the focus, and Enter or Space would then press it again.
  element.addEventListener('mousedown', event => event.preventDefault());
  return element;
};

/// Lay the controls over `host`, which covers the panel's 320 by 64 pixels exactly, and listen.
/// `wheel` names further elements, such as the view, whose wheel pages an open document.
export const installPanelControls = (
  host: HTMLElement,
  layout: PanelControlLayout,
  actions: PanelControlActions,
  wheel: readonly HTMLElement[] = []
): PanelControls => {
  const root = document.createElement('div');
  root.className = 'panel-controls';
  host.append(root);
  // Native buttons remain reachable by Tab. Their keys belong to the control rather than also
  // reaching the gameplay dispatcher. Escape keeps its normal document-close/menu routing.
  root.addEventListener('keydown', event => {
    if (
      event.code !== 'Escape' &&
      (event.target as HTMLElement | null)?.closest('[data-panel-control]')
    ) {
      event.stopPropagation();
    }
  });
  // A control's press is the control's alone: it reaches neither the view's pointer Take nor any
  // other listener on the page.
  root.addEventListener('click', event => event.stopPropagation());
  let open = false;
  const act = (action: (() => void) | undefined): void => {
    if (action !== undefined && actions.mayAct()) {
      action();
    }
  };
  const command = (name: CentreCommand): void =>
    act(actions.command && (() => actions.command!(name)));

  let inventory: HTMLButtonElement | undefined;
  if (layout.head !== undefined && actions.open !== undefined) {
    const head = document.createElement('div');
    head.className = 'panel-head';
    place(head, layout.head);
    inventory = button('inventory', 'Open the carried head');
    inventory.addEventListener('click', event => {
      if (event.button === 0) {
        act(actions.open);
      }
    });
    head.append(inventory);
    if (actions.rotate !== undefined) {
      const rotate = actions.rotate;
      for (const [direction, label, key, text] of [
        ['forward', 'Rotate the Carried Stack forward', '[', '‹'],
        ['backward', 'Rotate the Carried Stack backward', ']', '›']
      ] as const) {
        const control = button(
          'rotate',
          label,
          `Rotate ${direction} (${key})`,
          text
        );
        control.dataset['rotate'] = direction;
        control.addEventListener('click', () => act(() => rotate(direction)));
        head.append(control);
      }
    }
    root.append(head);
  }

  let centre: HTMLElement | undefined;
  let close: HTMLButtonElement | undefined;
  let commands: HTMLElement | undefined;
  let parameter: HTMLButtonElement | undefined;
  if (layout.centre !== undefined && actions.command !== undefined) {
    const box = document.createElement('div');
    box.className = 'panel-centre';
    place(box, layout.centre);
    const at = actions.centreAt ?? centreBoxPage;
    const centreControl = document.createElement('div');
    centreControl.dataset['panelControl'] = 'centre';
    centreControl.setAttribute('role', 'button');
    centreControl.tabIndex = 0;
    centreControl.setAttribute('aria-label', 'Read the open document');
    centreControl.hidden = true;
    // As a button's: a press does not take the focus, which would keep play's keys from play.
    centreControl.addEventListener('mousedown', event =>
      event.preventDefault()
    );
    centreControl.addEventListener('click', event => {
      if (event.button !== 0 || !open) {
        return;
      }
      const bounds = centreControl.getBoundingClientRect();
      command(
        at(
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          bounds
        )
      );
    });
    centreControl.addEventListener('keydown', event => {
      if (event.code === 'Escape') {
        return;
      }
      event.stopPropagation();
      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        command('read');
      }
    });
    centre = centreControl;
    box.append(centreControl);
    if (actions.close !== undefined) {
      close = button('close', 'Close the document', 'Close (Escape)', '✕');
      close.hidden = true;
      close.addEventListener('click', () => act(actions.close));
      box.append(close);
    }
    commands = document.createElement('div');
    commands.className = 'panel-centre-actions';
    commands.hidden = true;
    for (const [name, label, text] of [
      ['previous', 'Previous item or decrease value', '−'],
      ['read', 'Read or activate the open item', 'Read'],
      ['next', 'Next item or increase value', '+'],
      ['parameter', 'Next AUTHORS COMPUTER parameter', 'Parameter']
    ] as const) {
      const control = button('command', label, undefined, text);
      control.classList.add('panel-action');
      control.dataset['command'] = name;
      control.addEventListener('click', () => command(name));
      if (name === 'parameter') {
        control.hidden = true;
        parameter = control;
      }
      commands.append(control);
    }
    box.append(commands);
    root.append(box);

    let travel = 0;
    const pageByWheel = (event: WheelEvent): void => {
      if (!open || !actions.mayAct()) {
        travel = 0;
        return;
      }
      event.preventDefault();
      const turned = wheelPage(travel, event.deltaY, event.deltaMode);
      travel = turned.gathered;
      if (turned.page !== undefined) {
        command(turned.page);
      }
    };
    for (const element of [centreControl, ...wheel]) {
      element.addEventListener('wheel', pageByWheel, { passive: false });
    }
  }

  let run: HTMLButtonElement | undefined;
  if (layout.run !== undefined && actions.toggleRunning !== undefined) {
    run = button('run', 'Run', 'Run (R)');
    run.setAttribute('aria-pressed', 'false');
    place(run, layout.run);
    run.addEventListener('click', () => act(actions.toggleRunning));
    root.append(run);
  }

  return {
    centre,
    update(state): void {
      open = state.centre?.open ?? false;
      if (inventory !== undefined && state.head !== undefined) {
        const { inventory: name, opens } = state.head;
        if (inventory.textContent !== name) {
          inventory.textContent = name;
          inventory.setAttribute(
            'aria-label',
            `Open the carried head: ${name}`
          );
        }
        if (inventory.dataset['opens'] !== String(opens)) {
          inventory.dataset['opens'] = String(opens);
        }
      }
      if (centre !== undefined && state.centre !== undefined) {
        const { label, parameter: stepped, resting } = state.centre;
        centre.hidden = resting;
        centre.dataset['open'] = String(open);
        if (centre.getAttribute('aria-label') !== label) {
          centre.setAttribute('aria-label', label);
        }
        if (close !== undefined && close.hidden === open) {
          close.hidden = !open;
        }
        commands!.hidden = resting;
        parameter!.hidden = !stepped;
      }
      if (run !== undefined) {
        run.setAttribute('aria-pressed', String(state.running));
      }
    }
  };
};
