import { IDLE } from '../gameCore/index.ts';
import { fetchReader, load } from '../payload/load.ts';
import type { SessionSnapshot } from '../session/index.ts';
import { targOrreryFor } from '../sky/index.ts';
import { locationText } from '../world/index.ts';
import { FixedStepClock } from './clock.ts';
import { installConsole } from './consoleView.ts';
import { Renderer } from './frame.ts';
import { BrowserControlProfile } from './input.ts';
import { escapeFrom, installSystemMenu } from './menu.ts';
import { objectNamesOf, panelViewModel, type PanelContext } from './panel.ts';
import { installPanel, installPanelScale } from './panelView.ts';
import { createPreferences, effectivePresentation } from './preferences.ts';
import { routeKey, type RouterState } from './router.ts';
import { installSaveChooser } from './saveChooser.ts';
import { ALL_SLOTS, createSavePersistence, slotStorageKey } from './saves.ts';
import {
  createWalkabout,
  requiredSettings,
  saveEnvironment
} from './session.ts';
import { installSettingsView } from './settingsView.ts';
import { installStorageWatch } from './storage.ts';
import { installSuspensionHandlers } from './suspension.ts';
import {
  applyTypeface,
  loadTypography,
  readTypefacePreference
} from './typography.ts';

const VIEWPORT = { height: 800, width: 1280 } as const;

const surface = document.getElementById('game-surface')!;
const canvas = document.getElementById('frame') as HTMLCanvasElement;
const message = document.getElementById('message')!;
const credits = document.getElementById('credits')!;
const status = document.getElementById('status')!;
const failure = document.getElementById('failure')!;
const consoleElements = {
  input: document.getElementById('console-input') as HTMLInputElement,
  log: document.getElementById('console-log')!,
  surface: document.getElementById('game-surface')!
};
const chromePages = {
  menu: document.getElementById('page-menu')!,
  saves: document.getElementById('page-saves')!,
  settings: document.getElementById('page-settings')!
};
const panelRoot = document.getElementById('benson-panel')!;
const panelScale = document.getElementById('panel-scale')!;

const panelElements = {
  damoclesCompass: document.getElementById(
    'damocles-compass-canvas'
  ) as HTMLCanvasElement,
  damoclesElevation: document.getElementById(
    'damocles-elevation-canvas'
  ) as HTMLCanvasElement,
  fields: panelRoot.querySelectorAll<HTMLElement>('[data-field]'),
  lamps: panelRoot.querySelectorAll<HTMLElement>('[data-lamp]'),
  root: surface,
  targCompass: document.getElementById(
    'targ-compass-canvas'
  ) as HTMLCanvasElement,
  targElevation: document.getElementById(
    'targ-elevation-canvas'
  ) as HTMLCanvasElement
};

canvas.width = VIEWPORT.width;
canvas.height = VIEWPORT.height;

const requiredText = async (url: URL): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url.pathname} answered HTTP ${response.status}`);
  }
  return await response.text();
};

const updateText = (element: HTMLElement, value: string): void => {
  if (element.textContent !== value) {
    element.textContent = value;
  }
};

const occupation = (snapshot: SessionSnapshot): string =>
  snapshot.occupancy.kind === 'onFoot'
    ? 'ON FOOT'
    : `CRAFT ${String(snapshot.occupancy.slot).padStart(2, '0')}`;

const statusText = (
  snapshot: SessionSnapshot,
  cellSize: number,
  drawn: { readonly lines: number; readonly points: number },
  framesPerSecond: number
): string => {
  const player = snapshot.player;
  const fields = [
    `GRID ${String(Math.trunc(player.position.x / cellSize)).padStart(2, '0')}:${String(Math.trunc(player.position.z / cellSize)).padStart(2, '0')}`,
    `X ${Math.trunc(player.position.x)}  Z ${Math.trunc(player.position.z)}`,
    `HDG ${Math.trunc((player.heading * 180) / Math.PI)}°`,
    occupation(snapshot)
  ];
  if (snapshot.location.kind === 'room') {
    fields.push(locationText(snapshot.location));
  }
  if (snapshot.occupancy.kind === 'aboard') {
    fields.push(
      `ALT ${Math.trunc(player.position.y)}`,
      `THR ${snapshot.throttleNotch}`,
      snapshot.mode === 'flying' ? 'FLYING' : 'GROUNDED'
    );
  }
  fields.push(
    `${drawn.lines} LINES`,
    `${drawn.points} PTS`,
    `${Math.round(framesPerSecond)} FPS`
  );
  return fields.join(' · ');
};

try {
  // Payload, settings and typography are independent localhost reads, so none waits behind
  // another.
  const [bundle, settingsText] = await Promise.all([
    load(fetchReader(new URL('/payload/', location.href).href)),
    requiredText(new URL('/settings.json', location.href)),
    loadTypography()
  ]);
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  // The typeface is applied before anything is drawn; the settings page owns changing it.
  applyTypeface(document.documentElement, readTypefacePreference(storage));
  const settings = requiredSettings(settingsText);
  // Player presentation choices overlay the tracked tuning document. They never reach the
  // blocks that identify a Save, so changing one cannot make an existing Save unloadable.
  const preferences = createPreferences({ storage, surface });
  const environment = saveEnvironment(bundle, settings);
  const initial = createWalkabout(bundle, settings);
  let session = initial.session;
  let world = initial.world;
  let names = objectNamesOf(world.objects);
  const orrery = targOrreryFor(
    effectivePresentation(settings.presentation, preferences.current())
  );
  const renderer = new Renderer(canvas, orrery);
  const clock = new FixedStepClock();
  let snapshot = session.snapshot;
  let framesPerSecond = 0;
  let frameCount = 0;
  let frameSeconds = 0;
  let lastFrame: number | undefined;

  const performAndRefresh = (action: () => void): void => {
    action();
    snapshot = session.snapshot;
  };

  const controls = new BrowserControlProfile({
    drop: () => performAndRefresh(() => session.drop()),
    leaveCraft: () => performAndRefresh(() => session.leaveCraft()),
    occupancy: () => snapshot.occupancy,
    // The live Benson Script owns the message line. Bracket paging remains a Control Profile
    // action for the scriptless Swift fallback, but this required scripted shell has no pager.
    page: () => {},
    press: key => session.press(key),
    reach: action => performAndRefresh(() => session.reach(action)),
    rideLift: () => performAndRefresh(() => session.rideLift()),
    shutThrottle: () => performAndRefresh(() => session.shutThrottle()),
    skipMessage: () => session.skipMessage(),
    throttleNotchValue: notch =>
      performAndRefresh(() => session.throttleNotchValue(notch)),
    throttleStep: delta => performAndRefresh(() => session.throttleStep(delta))
  });

  const release = (): void => {
    controls.releaseAll();
    clock.reset();
    session.intent = IDLE;
  };
  installSuspensionHandlers(window, document, release);

  const menu = installSystemMenu({
    pages: chromePages,
    release,
    surface
  });

  // Chrome roots declare themselves in the markup, so a new surface owns its keys by carrying
  // the attribute rather than by being named here.
  const chromeFocus = (): boolean =>
    document.activeElement?.closest('[data-shell-chrome]') != null;
  const routerState = (): RouterState => ({
    chromeFocus: chromeFocus(),
    console: shellConsole.isOpen() ? 'open' : 'closed',
    layer: menu.layer()
  });

  const persistence = createSavePersistence({
    capture: () => ({
      location: session.location,
      snapshot: session.captureSaveSnapshot()
    }),
    environment,
    release,
    restore: savedSnapshot => {
      const restored = createWalkabout(bundle, settings, savedSnapshot);
      session = restored.session;
      world = restored.world;
      names = objectNamesOf(world.objects);
      snapshot = session.snapshot;
      // A restored Save is a new moment to play, so the menu steps out of the way.
      menu.show('none');
    },
    storage
  });
  installStorageWatch(
    window,
    ALL_SLOTS.map(slotStorageKey),
    persistence.dismiss
  );
  installSaveChooser({ page: chromePages.saves, persistence });
  const shellConsole = installConsole(
    consoleElements,
    {
      cellSize: () => world.cellSize,
      cellsPerAxis: () => world.cellsPerAxis,
      hasRoom: id => world.rooms.has(id),
      persistence,
      preferences,
      session: () => session,
      typeface: face => {
        applyTypeface(document.documentElement, face, storage);
      }
    },
    release
  );
  installSettingsView({
    page: chromePages.settings,
    preferences,
    root: document.documentElement,
    storage
  });

  window.addEventListener('keydown', event => {
    switch (routeKey(routerState(), event)) {
      case 'browser':
      case 'chrome':
        return;
      case 'escape': {
        // Escape both enters and leaves the chrome, and the console sits over whatever else is
        // open, so one function decides which of the two it reaches.
        const outcome = escapeFrom(
          menu.layer(),
          shellConsole.isOpen() ? 'open' : 'closed'
        );
        if (outcome.kind === 'closeConsole') {
          shellConsole.close();
        } else {
          menu.show(outcome.layer);
        }
        event.preventDefault();
        return;
      }
      case 'console-toggle':
        shellConsole.toggle();
        event.preventDefault();
        return;
      case 'game':
        if (controls.keyDown(event)) {
          event.preventDefault();
        }
    }
  });
  window.addEventListener('keyup', event => {
    // Key releases always reach the Control Profile first: a key held when chrome took focus
    // must not stay held forever. Only a release it actually consumed needs routing.
    if (!controls.keyUp(event)) {
      return;
    }
    if (routeKey(routerState(), event) === 'game') {
      event.preventDefault();
    }
  });

  installPanelScale(panelRoot, panelScale, (target, onResize) => {
    new ResizeObserver(onResize).observe(target);
  });
  const panel = installPanel(panelElements);
  const panelContext = (): PanelContext => ({
    cellSize: world.cellSize,
    dayLengthMinutes: settings.presentation.sky.dayLengthMinutes,
    // Object names are fixed content, so they are gathered once per world rather than per frame.
    objectNames: names
  });

  const publish = (): void => {
    const drawn = renderer.draw(world, snapshot, VIEWPORT);
    const player = snapshot.player;
    panel.draw(panelViewModel(snapshot, panelContext()));

    const publishedMessage = persistence.message(snapshot.message);
    updateText(message, publishedMessage.text);
    message.dataset['source'] = publishedMessage.source;
    updateText(credits, `${snapshot.credits} CREDITS`);
    updateText(
      status,
      statusText(snapshot, world.cellSize, drawn, framesPerSecond)
    );
    surface.dataset['state'] = 'ready';
    canvas.dataset['lines'] = String(drawn.lines);
    canvas.dataset['points'] = String(drawn.points);
    canvas.dataset['x'] = String(player.position.x);
    canvas.dataset['z'] = String(player.position.z);
  };

  publish();
  const frame = (timestamp: number): void => {
    // The System Menu pauses the session rather than hiding it: the frame keeps being drawn, so
    // the player can see what they are about to return to, but no time passes.
    if (menu.layer() === 'none') {
      clock.frame(timestamp, seconds => {
        session.intent = controls.intent;
        snapshot = session.advance(seconds).snapshot;
      });
    } else {
      clock.reset();
    }

    if (lastFrame !== undefined) {
      frameCount += 1;
      frameSeconds += Math.max(0, (timestamp - lastFrame) / 1000);
      if (frameSeconds >= 0.5) {
        framesPerSecond = frameCount / frameSeconds;
        frameCount = 0;
        frameSeconds = 0;
      }
    }
    lastFrame = timestamp;
    publish();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} catch (error) {
  surface.dataset['state'] = 'failed';
  message.textContent = 'Could not start the Browser Shell';
  credits.textContent = '';
  status.textContent = 'STARTUP FAILED';
  failure.hidden = false;
  failure.textContent = String(error);
}
