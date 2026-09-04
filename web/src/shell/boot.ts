import { IDLE } from '../gameCore/index.ts';
import { fetchReader, load } from '../payload/load.ts';
import type { SessionSnapshot } from '../session/index.ts';
import { arrivalTunables, bensonTunables } from '../settings/index.ts';
import { targOrreryFor } from '../sky/index.ts';
import { locationText } from '../world/index.ts';
import { SURFACE_AXIS_MODULUS } from '../world/surfaceCoordinates.ts';
import { ArrivalDirector, type ArrivalEntry } from './arrival.ts';
import { arrivalFramePlan } from './arrivalField.ts';
import { arrivalPanelViewModel, arrivalStripText } from './arrivalPanel.ts';
import {
  resolveScript00Milestones,
  withinOpeningScript
} from './arrivalScript.ts';
import { FixedStepClock } from './clock.ts';
import { installConsole } from './consoleView.ts';
import { Renderer, planFrame } from './frame.ts';
import { BrowserControlProfile } from './input.ts';
import { createNewGameAction, escapeFrom, installSystemMenu } from './menu.ts';
import { BensonMessageTranscript } from './messageTranscript.ts';
import {
  createSessionOwnership,
  type BrowserLockManager
} from './ownership.ts';
import { objectNamesOf, panelViewModel, type PanelContext } from './panel.ts';
import { installPanel, installPanelScale } from './panelView.ts';
import { createPreferences, effectivePresentation } from './preferences.ts';
import {
  createSessionResumePersistence,
  readSessionResume,
  type SessionResumePersistence
} from './resume.ts';
import { createSessionResumeNotices } from './resumeNotices.ts';
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
  ownership: document.getElementById('page-ownership')!,
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
  const notices = createSessionResumeNotices();
  let handleOwnershipLost = (): void => {};
  const browserLocks =
    navigator.locks === undefined
      ? undefined
      : (navigator.locks as unknown as BrowserLockManager);
  const ownership = createSessionOwnership({
    locks: browserLocks,
    onLost: () => handleOwnershipLost()
  });
  const ownershipOutcome = await ownership.claim();
  const resumeRead =
    ownershipOutcome.kind === 'owned'
      ? readSessionResume(storage, environment)
      : ({ kind: 'empty' } as const);
  const initial = createWalkabout(
    bundle,
    settings,
    resumeRead.kind === 'restored' ? resumeRead.snapshot : undefined
  );
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
  const bensonTranscript = new BensonMessageTranscript(snapshot.bensonMessage);
  const scriptsOf = (): NonNullable<typeof session.scripts> => {
    const scripts = session.scripts;
    if (scripts === undefined) {
      throw new Error('the browser walkabout has no Benson Scripts to present');
    }
    return scripts;
  };
  // Resolved once from the payload the session is running, so a re-export that renumbers a word
  // still produces the text the interpreter will produce.
  const milestones = resolveScript00Milestones(
    scriptsOf().program,
    scriptsOf().text
  );
  const arrivalPacing = {
    charactersPerSecond:
      settings.arrival.charactersPerSecond * settings.arrival.timeScale,
    holdSeconds: settings.arrival.holdSeconds,
    timeScale: settings.arrival.timeScale,
    titleCardSeconds: settings.arrival.titleCardSeconds
  };
  /// What the Arrival does with a session that already exists.
  ///
  /// Only a session still inside the opening script's own commentary goes back into the
  /// Arrival; everything else is a game already under way.
  const arrivalEntryFor = (fresh: boolean): ArrivalEntry => {
    if (fresh) {
      return { kind: 'fresh' };
    }
    const scripts = scriptsOf();
    return ArrivalDirector.entryFor(
      milestones,
      scripts.activeMessageText,
      withinOpeningScript(scripts.program, scripts.state.pc)
    );
  };
  const makeArrival = (fresh: boolean): ArrivalDirector =>
    new ArrivalDirector({
      bridge: {
        // One fixed step, exactly as the frame loop takes one, so that skipping the Arrival
        // hands the session the same run of steps watching it does.
        advance: seconds => {
          session.intent = IDLE;
          snapshot = session.advance(seconds).snapshot;
          checkpointChangedResume(false);
        },
        playingMessage: () => session.scripts?.activeMessageText,
        setPacing: choice => {
          scriptsOf().tunables =
            choice === 'arrival'
              ? arrivalTunables(settings, scriptsOf().program.framesPerTick)
              : bensonTunables(settings, scriptsOf().program.framesPerTick);
        }
      },
      entry: arrivalEntryFor(fresh),
      milestones,
      pacing: arrivalPacing
    });
  let arrival = makeArrival(resumeRead.kind !== 'restored');
  let recordBensonMessage = (): void => {};
  notices.synchronize(snapshot.bensonMessage);

  switch (ownershipOutcome.kind) {
    case 'blocked':
      notices.ownership('SESSION ACTIVE IN ANOTHER TAB');
      break;
    case 'owned':
      if (resumeRead.kind === 'restored') {
        notices.resumed();
      } else if (resumeRead.kind === 'invalid') {
        notices.couldNotResume(resumeRead.reason);
      } else if (resumeRead.kind === 'unavailable') {
        notices.failed(resumeRead.reason);
      }
      break;
    case 'unsupported':
      notices.ownershipUnavailable();
      break;
  }

  const makeResumePersistence = (): SessionResumePersistence =>
    createSessionResumePersistence({
      capture: () => ({
        location: session.location,
        snapshot: session.captureSaveSnapshot()
      }),
      environment,
      onFailure: notices.failed,
      storage: ownership.mayPersist() ? storage : undefined
    });
  let resumePersistence = makeResumePersistence();
  const checkpointChangedResume = (force = true): void => {
    if (!ownership.mayPersist()) {
      return;
    }
    resumePersistence.dirty();
    resumePersistence.checkpoint(force);
  };
  const flushResume = (): void => {
    if (ownership.mayPersist()) {
      resumePersistence.checkpoint(true);
    }
  };

  const performAndRefresh = (action: () => void): void => {
    if (!ownership.mayAdvance()) {
      return;
    }
    action();
    snapshot = session.snapshot;
    recordBensonMessage();
    checkpointChangedResume();
  };

  const controls = new BrowserControlProfile({
    drop: () => performAndRefresh(() => session.drop()),
    fire: () => performAndRefresh(() => session.fire()),
    leaveCraft: () => performAndRefresh(() => session.leaveCraft()),
    occupancy: () => snapshot.occupancy,
    // The live Benson Script owns the message line. Bracket paging remains a Control Profile
    // action for the scriptless Swift fallback, but this required scripted shell has no pager.
    page: () => {},
    press: key => performAndRefresh(() => session.press(key)),
    reach: action => performAndRefresh(() => session.reach(action)),
    rideLift: () => performAndRefresh(() => session.rideLift()),
    shutThrottle: () => performAndRefresh(() => session.shutThrottle()),
    // One key hurries Benson along, and during the Arrival that means the whole opening: the
    // narration is finished at once and the opening script is run to the join.
    skipMessage: () =>
      performAndRefresh(() => {
        if (arrival.isActive()) {
          arrival.skipToJoin();
          // Fast-forwarding is synchronous work, not game time. Without resetting here, the
          // next animation frame charges that wall-clock pause to Benson and consumes an entire
          // active display burst before the browser can paint its first entering characters.
          clock.reset();
        } else {
          session.skipMessage();
        }
      }),
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
    onLayer: layer => {
      if (layer === 'menu') {
        notices.menuOpened();
        if (ownership.mayPersist()) {
          resumePersistence.checkpoint(true);
        }
      }
    },
    pages: chromePages,
    release,
    surface
  });
  if (ownershipOutcome.kind === 'blocked') {
    menu.show('ownership');
  }
  handleOwnershipLost = () => {
    release();
    shellConsole.close();
    notices.ownership('SESSION OPENED ELSEWHERE');
    chromePages.ownership.querySelector<HTMLElement>(
      '.chrome-title'
    )!.textContent = 'SESSION OPENED ELSEWHERE';
    menu.show('ownership');
  };

  // Chrome roots declare themselves in the markup, so a new surface owns its keys by carrying
  // the attribute rather than by being named here.
  const chromeFocus = (): boolean =>
    document.activeElement?.closest('[data-shell-chrome]') != null;
  const routerState = (): RouterState => ({
    arrival: arrival.gatesInput(),
    chromeFocus: chromeFocus(),
    console: shellConsole.isOpen() ? 'open' : 'closed',
    layer: menu.layer()
  });

  const replaceWalkabout = (
    savedSnapshot?: Parameters<typeof createWalkabout>[2]
  ): void => {
    const restored = createWalkabout(bundle, settings, savedSnapshot);
    session = restored.session;
    world = restored.world;
    names = objectNamesOf(world.objects);
    snapshot = session.snapshot;
    // A New Game plays the Arrival again; a restored Save is a game already under way, so it
    // gets whatever is left of the Arrival, which is normally none of it.
    arrival = makeArrival(savedSnapshot === undefined);
  };

  const persistence = createSavePersistence({
    capture: () => ({
      location: session.location,
      snapshot: session.captureSaveSnapshot()
    }),
    environment,
    release,
    restore: (savedSnapshot, slot) => {
      replaceWalkabout(savedSnapshot);
      bensonTranscript.synchronize(snapshot.bensonMessage);
      shellConsole.write(BensonMessageTranscript.loaded(slot));
      checkpointChangedResume();
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
      cellsPerAxis: () => SURFACE_AXIS_MODULUS / world.cellSize,
      hasRoom: id => world.rooms.has(id),
      objectSlots: () => world.objects.length,
      persistence,
      preferences,
      session: () => session,
      typeface: face => {
        applyTypeface(document.documentElement, face, storage);
      }
    },
    release
  );
  recordBensonMessage = () => {
    shellConsole.write(bensonTranscript.observe(snapshot.bensonMessage));
  };
  installSettingsView({
    page: chromePages.settings,
    preferences,
    root: document.documentElement,
    storage
  });

  type OwnershipMessage =
    | { readonly kind: 'takeover-ready'; readonly request: string }
    | { readonly kind: 'takeover-request'; readonly request: string };
  const ownershipChannel =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(
          'mercenary.browser-shell.session-resume.ownership.v1'
        );
  ownershipChannel?.addEventListener('message', event => {
    const value = event.data as Partial<OwnershipMessage> | undefined;
    if (
      value?.kind !== 'takeover-request' ||
      typeof value.request !== 'string' ||
      !ownership.mayPersist()
    ) {
      return;
    }
    flushResume();
    ownership.release();
    handleOwnershipLost();
    ownershipChannel.postMessage({
      kind: 'takeover-ready',
      request: value.request
    } satisfies OwnershipMessage);
  });

  const requestCooperativeTakeover = async (): Promise<boolean> => {
    if (ownershipChannel === undefined) {
      return false;
    }
    const request = crypto.randomUUID();
    return await new Promise<boolean>(resolve => {
      let settled = false;
      const finish = (ready: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        ownershipChannel.removeEventListener('message', receive);
        resolve(ready);
      };
      const receive = (event: MessageEvent): void => {
        const value = event.data as Partial<OwnershipMessage> | undefined;
        if (value?.kind === 'takeover-ready' && value.request === request) {
          finish(true);
        }
      };
      const timeout = setTimeout(() => finish(false), 1000);
      ownershipChannel.addEventListener('message', receive);
      ownershipChannel.postMessage({
        kind: 'takeover-request',
        request
      } satisfies OwnershipMessage);
    });
  };

  const newGameButton = document.getElementById(
    'new-game'
  ) as HTMLButtonElement;
  const newGame = createNewGameAction(() => {
    release();
    replaceWalkabout();
    bensonTranscript.synchronize(snapshot.bensonMessage);
    shellConsole.write(BensonMessageTranscript.newGame());
    checkpointChangedResume();
    menu.show('none');
  });
  const refreshNewGame = (): void => {
    newGameButton.textContent = newGame.armed()
      ? 'CONFIRM NEW GAME'
      : 'NEW GAME';
    newGameButton.classList.toggle('armed', newGame.armed());
  };
  newGameButton.addEventListener('click', () => {
    newGame.press();
    refreshNewGame();
  });
  newGameButton.addEventListener('blur', () => {
    newGame.disarm();
    refreshNewGame();
  });

  const takeOverButton = document.getElementById(
    'take-over'
  ) as HTMLButtonElement;
  takeOverButton.addEventListener('click', async () => {
    takeOverButton.disabled = true;
    const yielded = await requestCooperativeTakeover();
    let outcome = yielded
      ? await ownership.claim()
      : await ownership.takeOver();
    if (outcome.kind === 'blocked') {
      outcome = await ownership.takeOver();
    }
    if (outcome.kind === 'owned') {
      resumePersistence = makeResumePersistence();
      const recovered = readSessionResume(storage, environment);
      notices.dismiss();
      if (recovered.kind === 'restored') {
        replaceWalkabout(recovered.snapshot);
        bensonTranscript.synchronize(snapshot.bensonMessage);
        notices.synchronize(snapshot.bensonMessage);
        notices.resumed();
      } else {
        replaceWalkabout();
        bensonTranscript.synchronize(snapshot.bensonMessage);
        notices.synchronize(snapshot.bensonMessage);
        if (recovered.kind === 'invalid') {
          notices.couldNotResume(recovered.reason);
        } else if (recovered.kind === 'unavailable') {
          notices.failed(recovered.reason);
        }
      }
      chromePages.ownership.querySelector<HTMLElement>(
        '.chrome-title'
      )!.textContent = 'SESSION ACTIVE IN ANOTHER TAB';
      menu.show('none');
    }
    takeOverButton.disabled = false;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushResume();
    }
  });
  window.addEventListener('pagehide', flushResume);
  window.addEventListener('pagehide', () => ownershipChannel?.close());

  window.addEventListener('keydown', event => {
    switch (routeKey(routerState(), event)) {
      case 'arrival-held':
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
    const arriving = arrival.isActive();
    const phase = arrival.current().kind;
    const narration = arriving ? arrival.narrationText() : undefined;
    const pose = arrival.pose();
    const presentation = effectivePresentation(
      settings.presentation,
      preferences.current()
    );
    const plan = arriving
      ? arrivalFramePlan(phase, {
          field: arrival.fieldProgress(),
          pose,
          presentation,
          size: VIEWPORT,
          snapshot,
          world,
          ...(renderer.orrery === undefined ? {} : { orrery: renderer.orrery })
        })
      : planFrame(world, snapshot, VIEWPORT, renderer.orrery, presentation);
    const drawn = renderer.render(
      plan,
      // The player's weight and glow choices are presentation, so they are read per frame the
      // same way the sky's preset is.
      presentation.wireframe
    );
    const player = snapshot.player;
    const panelModel = panelViewModel(snapshot, panelContext());
    panel.draw(
      arriving
        ? arrivalPanelViewModel(
            panelModel,
            { narration, pose, unmeasured: arrival.readsAsterisks() },
            world.cellSize
          )
        : panelModel
    );

    recordBensonMessage();
    const saveMessage = persistence.message(
      snapshot.bensonMessage?.displayText ?? ''
    );
    // A Save's own notice still comes first; the Arrival's narration then takes the line ahead
    // of a resume notice, which will still be there to show when the opening is over.
    const publishedMessage =
      saveMessage.source === 'shell'
        ? saveMessage
        : (arrivalStripText(narration) ??
          notices.message(snapshot.bensonMessage));
    updateText(message, publishedMessage.text);
    message.dataset['source'] = publishedMessage.source;
    surface.dataset['arrival'] = phase;
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
    if (menu.layer() === 'none' && ownership.mayAdvance()) {
      clock.frame(timestamp, seconds => {
        // The Arrival advances the session itself while it presents, so that watching the
        // opening and skipping it hand the session the same run of steps.
        if (arrival.ownsSession()) {
          arrival.step(seconds);
          return;
        }
        const endingBefore = session.scripts?.host.endingPhase ?? 0;
        session.intent = controls.intent;
        snapshot = session.advance(seconds).snapshot;
        // Any move of the Ending Phase is a boundary, not just the one out of
        // active play: a reload during the mature presentation should come back
        // to it rather than replay the phase it had already left.
        checkpointChangedResume(
          endingBefore !== (session.scripts?.host.endingPhase ?? 0)
        );
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
