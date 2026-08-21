import { IDLE } from '../gameCore/index.ts';
import { fetchReader, load } from '../payload/load.ts';
import type { SessionSnapshot } from '../session/index.ts';
import { targOrreryFor } from '../sky/index.ts';
import { FixedStepClock } from './clock.ts';
import { Renderer } from './frame.ts';
import { BrowserControlProfile } from './input.ts';
import { createPreferences, effectivePresentation } from './preferences.ts';
import { routeKey, type RouterState } from './router.ts';
import { installSaveControls } from './saves.ts';
import {
  createWalkabout,
  requiredSettings,
  saveEnvironment
} from './session.ts';
import { installSuspensionHandlers } from './suspension.ts';
import { installTypefaceSelector, loadTypography } from './typography.ts';

const VIEWPORT = { height: 800, width: 1280 } as const;

const surface = document.getElementById('game-surface')!;
const canvas = document.getElementById('frame') as HTMLCanvasElement;
const message = document.getElementById('message')!;
const credits = document.getElementById('credits')!;
const status = document.getElementById('status')!;
const typeface = document.getElementById('typeface') as HTMLSelectElement;
const saveSlot = document.getElementById('save-slot') as HTMLSelectElement;
const saveButton = document.getElementById('save-session') as HTMLButtonElement;
const loadButton = document.getElementById('load-session') as HTMLButtonElement;
const deleteButton = document.getElementById(
  'delete-save'
) as HTMLButtonElement;
const failure = document.getElementById('failure')!;

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
    fields.push(`ROOM ${String(snapshot.location.id).padStart(2, '0')}`);
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
  installTypefaceSelector(typeface, document.documentElement, storage);
  const settings = requiredSettings(settingsText);
  // Player presentation choices overlay the tracked tuning document. They never reach the
  // blocks that identify a Save, so changing one cannot make an existing Save unloadable.
  const preferences = createPreferences({ storage, surface });
  const environment = saveEnvironment(bundle, settings);
  const initial = createWalkabout(bundle, settings);
  let session = initial.session;
  let world = initial.world;
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
  typeface.addEventListener('focus', release);
  installSuspensionHandlers(window, document, release);

  // Chrome roots declare themselves in the markup, so a new surface owns its keys by carrying
  // the attribute rather than by being named here.
  const chromeFocus = (): boolean =>
    document.activeElement?.closest('[data-shell-chrome]') != null;
  const routerState = (): RouterState => ({
    chromeFocus: chromeFocus(),
    console: 'closed',
    layer: 'none'
  });

  window.addEventListener('keydown', event => {
    switch (routeKey(routerState(), event)) {
      case 'browser':
      case 'chrome':
      // The System Menu arrives in a later slice, and Escape reaches no Control Profile action
      // today, so there is nothing to hold back.
      // falls through
      case 'escape':
        return;
      case 'console-toggle':
      case 'game':
        // The Shell Console arrives in a later slice. Until it does, its key keeps its existing
        // Control Profile behaviour rather than going dead.
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
    const route = routeKey(routerState(), event);
    if (route === 'game' || route === 'console-toggle') {
      event.preventDefault();
    }
  });

  const persistence = installSaveControls({
    capture: () => ({
      location: session.location,
      snapshot: session.captureSaveSnapshot()
    }),
    elements: {
      deleteButton,
      loadButton,
      saveButton,
      slot: saveSlot
    },
    environment,
    release,
    restore: savedSnapshot => {
      const restored = createWalkabout(bundle, settings, savedSnapshot);
      session = restored.session;
      world = restored.world;
      snapshot = session.snapshot;
    },
    storage,
    storageEvents: window
  });

  const publish = (): void => {
    const drawn = renderer.draw(world, snapshot, VIEWPORT);
    const player = snapshot.player;

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
    clock.frame(timestamp, seconds => {
      session.intent = controls.intent;
      snapshot = session.advance(seconds).snapshot;
    });

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
