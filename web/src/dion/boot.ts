import { IDLE } from '../gameCore/index.ts';
import { installShellChrome } from '../shell/chrome.ts';
import { FixedStepClock } from '../shell/clock.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import { BrowserControlProfile } from '../shell/input.ts';
import {
  createNewGameAction,
  escapeFrom,
  installSystemMenu
} from '../shell/menu.ts';
import { routeKey, type RouterState } from '../shell/router.ts';
import { installSaveChooser } from '../shell/saveChooser.ts';
import { installSuspensionHandlers } from '../shell/suspension.ts';
import type { PayloadDocument } from '../shell/title.ts';
import { frameRgba, planDionFrame } from './frame.ts';
import { PANEL_TOP, drawDionPanel, panelRgba } from './panel.ts';
import { createDionSavePersistence, dionRecordIdentity } from './save.ts';
import { dionFrameState, type DionSession } from './session.ts';
import { dionTitle } from './title.ts';

/// The Mercenary III Gameplay Session's document, `/dion` (#647).
///
/// Loads only Mercenary III's Data Payload and its authored document. The System Menu,
/// the save chooser and the key router are the shared Browser Shell host; the view and
/// the panel are drawn into one 320 by 200 indexed screen, as the ST draws them, and
/// shown at whole-pixel scale.

const surface = document.getElementById('game-surface')!;
const status = document.getElementById('status')!;
const failure = document.getElementById('failure')!;
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const chrome = installShellChrome(surface, { menuTitle: 'MERCENARY III' });

let animation: number | undefined;
let running = true;

const fail = (error: unknown): void => {
  if (!running) {
    return;
  }
  running = false;
  if (animation !== undefined) {
    cancelAnimationFrame(animation);
  }
  canvas.hidden = true;
  status.hidden = true;
  failure.hidden = false;
  failure.textContent = error instanceof Error ? error.message : String(error);
};

const requiredJson = async (pathname: string): Promise<PayloadDocument> => {
  const response = await fetch(pathname);
  if (!response.ok) {
    throw new Error(`${pathname} answered HTTP ${response.status}`);
  }
  const text = await response.text();
  try {
    return { text, value: JSON.parse(text) };
  } catch (error) {
    throw new Error(
      `${pathname} is not JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/// The pages whose Mercenary III content arrives with play (#648) say so, rather than
/// showing another Title's settings or bindings.
const reservedPage = (page: HTMLElement, text: string): void => {
  const note = document.createElement('p');
  note.className = 'chrome-label';
  note.textContent = text;
  page.querySelector('.chrome-title')?.after(note);
};

try {
  assertBrowserDocument(location.pathname, 'dion');
  document.documentElement.dataset['title'] = dionTitle.slug;
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  const content = await dionTitle.load(requiredJson);
  let session = dionTitle.create(content) as DionSession;
  let snapshot = session.snapshot;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error(
      'The browser gave no 2D canvas for the Mercenary III screen.'
    );
  }
  const image = context.createImageData(320, 200);
  canvas.hidden = false;
  status.hidden = true;

  // Held keys reach the Movement Intent through the shared Control Profile. The
  // session accepts it and, until the on-foot Mover arrives (#648), does not move.
  const controls = new BrowserControlProfile({
    drop: () => {},
    leaveCraft: () => {},
    occupancy: () => ({ kind: 'onFoot' }),
    reach: () => {},
    shutThrottle: () => {},
    throttleNotchStep: () => {},
    throttleNotchValue: () => {},
    throttleStep: () => {}
  });
  const clock = new FixedStepClock();
  const release = (): void => {
    controls.releaseAll();
    clock.reset();
    session.intent = IDLE;
  };
  installSuspensionHandlers(window, document, release);

  const menu = installSystemMenu({ pages: chrome.pages, release, surface });
  reservedPage(
    chrome.pages.settings,
    'Mercenary III settings arrive with play (#648).'
  );
  reservedPage(
    chrome.pages.controls,
    'Mercenary III controls arrive with play (#648).'
  );
  const persistence = createDionSavePersistence({
    identity: dionRecordIdentity(content),
    storage
  });
  installSaveChooser({ page: chrome.pages.saves, persistence });

  const draw = (): void => {
    const planned = planDionFrame(content.world, dionFrameState(snapshot));
    frameRgba(planned, image.data);
    const panel = drawDionPanel(
      content.panel,
      dionTitle.panelViewModel(snapshot, content)
    );
    panelRgba(panel, image.data.subarray(PANEL_TOP * 320 * 4));
    context.putImageData(image, 0, 0);
    const root = canvas.dataset;
    root['cell'] = String(snapshot.cell);
    root['region'] = String(snapshot.region);
    root['tick'] = String(snapshot.tick);
    root['frame'] = String(snapshot.frame);
    root['clock'] = String(snapshot.clock.seconds);
    root['polygons'] = String(planned.stats.polygons);
    root['lines'] = String(planned.stats.lines);
    root['models'] = planned.stats.models.join(' ');
    root['gaps'] = planned.stats.gaps.join('; ');
    root['content'] = content.contentSha256;
  };

  const newGame = createNewGameAction(() => {
    release();
    session = dionTitle.create(content) as DionSession;
    snapshot = session.snapshot;
    menu.show('none');
    draw();
  });
  const refreshNewGame = (): void => {
    chrome.newGame.textContent = newGame.armed()
      ? 'CONFIRM NEW GAME'
      : 'NEW GAME';
    chrome.newGame.classList.toggle('armed', newGame.armed());
  };
  chrome.newGame.addEventListener('click', () => {
    newGame.press();
    refreshNewGame();
  });
  chrome.newGame.addEventListener('blur', () => {
    newGame.disarm();
    refreshNewGame();
  });

  const routerState = (): RouterState => ({
    chromeFocus: document.activeElement?.closest('[data-shell-chrome]') != null,
    console: 'closed',
    layer: menu.layer(),
    opening: 'none'
  });
  window.addEventListener('keydown', event => {
    switch (routeKey(routerState(), event)) {
      case 'escape': {
        // Mercenary III has no Shell Console yet, so Escape only steps the menu.
        const outcome = escapeFrom(menu.layer(), 'closed');
        if (outcome.kind === 'layer') {
          menu.show(outcome.layer);
        }
        event.preventDefault();
        return;
      }
      case 'game':
        if (controls.keyDown(event)) {
          event.preventDefault();
        }
        return;
      default:
        return;
    }
  });
  window.addEventListener('keyup', event => {
    if (controls.keyUp(event) && routeKey(routerState(), event) === 'game') {
      event.preventDefault();
    }
  });

  draw();
  canvas.dataset['state'] = 'ready';
  const frame = (timestamp: number): void => {
    if (!running) {
      return;
    }
    try {
      const steps = clock.frame(timestamp, seconds => {
        if (menu.layer() === 'none') {
          session.intent = controls.intent;
          snapshot = session.advance(seconds);
        }
      });
      if (steps > 0) {
        draw();
      }
      animation = requestAnimationFrame(frame);
    } catch (error) {
      fail(error);
    }
  };
  animation = requestAnimationFrame(frame);
} catch (error) {
  fail(error);
}
