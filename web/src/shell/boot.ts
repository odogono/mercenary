import { IDLE } from '../gameCore/index.ts';
import { fetchReader, load } from '../payload/load.ts';
import type { PresentationEvent, SessionSnapshot } from '../session/index.ts';
import { arrivalTunables, bensonTunables } from '../settings/index.ts';
import { createTargOrrery, skyStateAt, targOrreryFor } from '../sky/index.ts';
import { TargPresentationClock, formatTargTime } from '../sky/time.ts';
import { SoundPresenter } from '../sound/presenter.ts';
import { AudioWorkletTransport } from '../sound/transport.ts';
import { locationText } from '../world/index.ts';
import { SURFACE_AXIS_MODULUS } from '../world/surfaceCoordinates.ts';
import { ArrivalDirector, type ArrivalEntry } from './arrival.ts';
import { arrivalFramePlan } from './arrivalField.ts';
import { arrivalPanelViewModel, arrivalStripText } from './arrivalPanel.ts';
import {
  resolveScript00Milestones,
  withinOpeningScript
} from './arrivalScript.ts';
import { PANEL_SETTINGS, installShellChrome } from './chrome.ts';
import { FixedStepClock } from './clock.ts';
import { executeConsoleCommand } from './console.ts';
import { installConsole } from './consoleView.ts';

import './damoclesPanelElement.ts';

import { installAudioLifecycle } from './audioLifecycle.ts';
import { renderControlsPage } from './controlsView.ts';
import {
  DESTINATIONS,
  DepartureDirector,
  departureBodiesFrom,
  departureMotionFor,
  type DepartureEntry
} from './departure.ts';
import { installDepartureView } from './departureView.ts';
import { assertBrowserDocument } from './documentPath.ts';
import { Renderer, planFrame } from './frame.ts';
import { connectedPads } from './gamepad.ts';
import { BrowserControlProfile } from './input.ts';
import { browserKeyNames } from './keyNames.ts';
import { createNewGameAction, escapeFrom, installSystemMenu } from './menu.ts';
import { BensonMessageTranscript } from './messageTranscript.ts';
import {
  createSessionOwnership,
  installSessionTakeoverChannel,
  type BrowserLockManager
} from './ownership.ts';
import { objectNamesOf, panelViewModel, type PanelContext } from './panel.ts';
import { installPanel, installPanelScale } from './panelView.ts';
import { canvasPointer, takeTargetAt } from './pointer.ts';
import {
  createPreferences,
  effectivePresentation,
  titlePreferences
} from './preferences.ts';
import {
  createSessionResumePersistence,
  readSessionResume,
  type SessionResumePersistence
} from './resume.ts';
import { createSessionResumeNotices } from './resumeNotices.ts';
import {
  chromeHasKeyboard,
  routeKey,
  routePad,
  type RouterState
} from './router.ts';
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
import { titleStorageKeys } from './title.ts';
import { readTargTitleLogo, targTitleLogoRgba } from './titleLogo.ts';
import {
  applyTypeface,
  loadTypography,
  readTypefacePreference
} from './typography.ts';

const VIEWPORT = { height: 800, width: 1280 } as const;

const surface = document.getElementById('game-surface')!;
const chrome = installShellChrome(surface, {
  catalogueLabel: 'Damocles catalogue',
  logo: { name: 'MERCENARY', typeface: 'mercenary' },
  menuTitle: 'BENSON G9-ST SYSTEM',
  settings: PANEL_SETTINGS
});
const titleKeys = titleStorageKeys('targ');
const canvas = document.getElementById('frame') as HTMLCanvasElement;
const message = document.getElementById('message')!;
const credits = document.getElementById('credits')!;
const status = document.getElementById('status')!;
const failure = document.getElementById('failure')!;
const consoleElements = chrome.console;
const chromePages = chrome.pages;
const panelRoot = document.getElementById('benson-panel')!;
const panelScale = document.getElementById('panel-scale')!;
const departureElements = {
  commit: document.getElementById('departure-commit') as HTMLButtonElement,
  root: document.getElementById('departure')!,
  skip: document.getElementById('departure-skip') as HTMLButtonElement,
  track: document.getElementById('departure-track')!
};

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
  assertBrowserDocument(location.pathname, 'gameplay');
  // Payload, settings and typography are independent localhost reads, so none waits behind
  // another.
  const [bundle, settingsText, , logoText] = await Promise.all([
    load(fetchReader(new URL('/payload/', location.href).href)),
    requiredText(new URL('/settings.json', location.href)),
    loadTypography(),
    requiredText(new URL('/payload/targ-st/title.json', location.href))
  ]);
  // Targ's Title Logo comes from the ST release, since the Reference Build has none (#696).
  const logo = readTargTitleLogo(JSON.parse(logoText));
  chrome.showLogo(
    new ImageData(targTitleLogoRgba(logo), logo.width, logo.height)
  );
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  // The typeface is applied before anything is drawn; the settings page owns changing it.
  applyTypeface(
    document.documentElement,
    readTypefacePreference(storage, titleKeys.typeface)
  );
  const settings = requiredSettings(settingsText);
  // Player presentation choices overlay the tracked tuning document. They never reach the
  // blocks that identify a Save, so changing one cannot make an existing Save unloadable.
  let applyAudioPreferences = (_preferences: {
    readonly audioMuted: boolean;
    readonly audioVolume: number;
  }): void => {};
  // Turning Extended Controls off levels the view Free Look left tilted (ADR 0059).
  let applyControlPreferences = (_preferences: {
    readonly extendedControls: boolean;
  }): void => {};
  const preferences = createPreferences({
    location: titlePreferences('targ'),
    onChange: changed => {
      applyAudioPreferences(changed);
      applyControlPreferences(changed);
    },
    storage,
    surface
  });
  const environment = saveEnvironment(bundle, settings);
  const keyNames = browserKeyNames();
  const notices = createSessionResumeNotices({ keyNames });
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
  const targClock = new TargPresentationClock(
    () => settings.presentation.sky.dayLengthMinutes
  );
  const orrery = targOrreryFor(
    effectivePresentation(settings.presentation, preferences.current())
  );
  const renderer = new Renderer(canvas, orrery);
  const clock = new FixedStepClock();
  let snapshot = session.snapshot;
  const sound = new SoundPresenter(
    bundle.sound,
    new AudioWorkletTransport(bundle.sound, {
      onFailure: () => notices.audioUnavailable()
    })
  );
  applyAudioPreferences = changed => {
    sound.setMuted(changed.audioMuted, snapshot.elapsed);
    sound.setVolume(changed.audioVolume, snapshot.elapsed);
  };
  applyAudioPreferences(preferences.current());
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
  // The Departure precedes the Arrival and touches no session: it has no bridge, gives the
  // session no time and checkpoints nothing, so a reload from deep space returns to deep space.
  // Its flyby roster is read from the Targ Orrery under both Presentation Presets — the bodies
  // are bound to the sky model, not to whether the player has the Enhanced sky on (ADR 0040).
  const departureMotion = departureMotionFor(
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const departureBodies = departureBodiesFrom(
    skyStateAt(createTargOrrery(settings.presentation.sky), 0)
  );
  const makeDeparture = (entry: DepartureEntry): DepartureDirector =>
    new DepartureDirector({
      bodies: departureBodies,
      destinations: DESTINATIONS,
      entry,
      motion: departureMotion,
      settings: settings.departure
    });
  // A game already under way — a Session Resume — has chosen its Destination already.
  let departure = makeDeparture(
    resumeRead.kind === 'restored' ? 'done' : 'carousel'
  );
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

  type PresentedAction =
    | void
    | readonly PresentationEvent[]
    | { readonly events: readonly PresentationEvent[] };
  const eventsFrom = (
    result: PresentedAction
  ): readonly PresentationEvent[] => {
    if (result === undefined) {
      return [];
    }
    if (Array.isArray(result)) {
      return result as readonly PresentationEvent[];
    }
    return (result as { readonly events: readonly PresentationEvent[] }).events;
  };
  const performAndRefresh = (action: () => PresentedAction): void => {
    if (!ownership.mayAdvance()) {
      return;
    }
    const arrivalOwned = arrival.isActive();
    const result = action();
    snapshot = session.snapshot;
    sound.present({
      events: eventsFrom(result),
      snapshot,
      ...(arrivalOwned ? { suppressTransient: true } : {})
    });
    recordBensonMessage();
    checkpointChangedResume();
  };

  const controls = new BrowserControlProfile({
    drop: () => performAndRefresh(() => session.drop()),
    extendedControls: () => preferences.current().extendedControls,
    fire: () => performAndRefresh(() => session.fire()),
    leaveCraft: () => performAndRefresh(() => session.leaveCraft()),
    // Targ has no Damocles Lift: its lift is the Lift Journey, ridden with `rideLift`. The live
    // Benson Script owns the message line, so this scripted shell has no pager either.
    occupancy: () => snapshot.occupancy,
    press: key => performAndRefresh(() => session.press(key)),
    reach: action => performAndRefresh(() => session.reach(action)),
    // Free Look is never saved, so levelling it has nothing to present or checkpoint.
    recentreLook: () => session.recentreLook(),
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
    // Targ's relative keys already step its notch ladder, doubling and halving (ADR 0059).
    throttleNotchStep: direction =>
      performAndRefresh(() => session.throttleStep(direction)),
    throttleNotchValue: notch =>
      performAndRefresh(() => session.throttleNotchValue(notch)),
    throttleStep: delta => performAndRefresh(() => session.throttleStep(delta))
  });

  const release = (): void => {
    controls.releaseAll();
    clock.reset();
    session.intent = IDLE;
  };
  applyControlPreferences = changed => {
    if (!changed.extendedControls) {
      session.recentreLook();
    }
  };
  installSuspensionHandlers(window, document, release);

  const audio = installAudioLifecycle({
    document,
    ownership,
    presenter: sound,
    window
  });
  const menu = installSystemMenu({
    onLayer: layer => {
      audio.layerChanged(layer);
      if (layer === 'controls') {
        renderControlsPage(
          chromePages.controls,
          controls.describe(false, keyNames)
        );
      }
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
    sound.resetFromSnapshot(snapshot);
    sound.suspend();
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
    chromeFocus: chromeFocus(),
    console: shellConsole.isOpen() ? 'open' : 'closed',
    layer: menu.layer(),
    opening: departure.atCarousel()
      ? 'carousel'
      : departure.inJourney()
        ? 'journey'
        : arrival.gatesInput()
          ? 'arrival'
          : 'none'
  });

  const replaceWalkabout = (
    savedSnapshot?: Parameters<typeof createWalkabout>[2]
  ): void => {
    const restored = createWalkabout(bundle, settings, savedSnapshot);
    session = restored.session;
    world = restored.world;
    names = objectNamesOf(world.objects);
    snapshot = session.snapshot;
    targClock.reset();
    sound.resetFromSnapshot(snapshot);
    // A New Game plays the Departure and the Arrival again; a restored Save is a game already
    // under way, so it gets whatever is left of the Arrival, which is normally none of it.
    departure = makeDeparture(
      savedSnapshot === undefined ? 'carousel' : 'done'
    );
    arrival = makeArrival(savedSnapshot === undefined);
  };

  /// Commit the Destination the carousel is on. The journey begins; the Arrival waits at its end.
  /// Published at once so the chrome follows the commit rather than the next frame.
  const commitDestination = (): void => {
    departure.commit();
    publish();
  };
  /// Hurry the committed journey and the Arrival to the join. One control, one outcome: the
  /// game at the status report, identical to the one watching reaches.
  const skipToTarg = (): void =>
    performAndRefresh(() => {
      if (!departure.inJourney()) {
        return;
      }
      departure.skipJourney();
      arrival.skipToJoin();
      // Fast-forwarding is synchronous work, not game time (see the skip key below).
      clock.reset();
    });

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
      objectName: slot => bundle.text?.messages[slot]?.text,
      objectSlots: () => world.objects.length,
      pads: () => navigator.getGamepads?.() ?? [],
      persistence,
      preferences,
      present: events => {
        snapshot = session.snapshot;
        sound.present({ events, snapshot });
      },
      session: () => session,
      setTime: secondsOfDay =>
        targClock.set(session.snapshot.elapsed, secondsOfDay),
      time: () => targClock.secondsOfDay(session.snapshot.elapsed),
      typeface: face => {
        applyTypeface(document.documentElement, face, {
          key: titleKeys.typeface,
          storage
        });
      }
    },
    release,
    { execute: executeConsoleCommand }
  );
  recordBensonMessage = () => {
    shellConsole.write(bensonTranscript.observe(snapshot.bensonMessage));
  };
  installSettingsView({
    page: chromePages.settings,
    preferences,
    root: document.documentElement,
    storage,
    typefaceKey: titleKeys.typeface
  });

  const takeover = installSessionTakeoverChannel({
    mayPersist: () => ownership.mayPersist(),
    name: titleKeys.ownershipChannel,
    onYield: () => {
      flushResume();
      ownership.release();
      handleOwnershipLost();
    }
  });

  const newGameButton = chrome.newGame;
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

  const takeOverButton = chrome.takeOver;
  takeOverButton.addEventListener('click', async () => {
    takeOverButton.disabled = true;
    const yielded = await takeover.requestCooperativeTakeover();
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
  window.addEventListener('pagehide', () => takeover.close());

  const pointerTakeTarget = (event: MouseEvent): number | undefined => {
    const state = routerState();
    const interaction = session.content.interaction;
    const pointer = canvasPointer(canvas, {
      x: event.clientX,
      y: event.clientY
    });
    if (
      state.opening !== 'none' ||
      chromeHasKeyboard(state) ||
      interaction === undefined ||
      pointer === undefined ||
      !ownership.mayAdvance()
    ) {
      return undefined;
    }
    return takeTargetAt(
      world,
      snapshot,
      interaction,
      VIEWPORT,
      pointer.point,
      pointer.hitSlop
    );
  };
  canvas.addEventListener('pointermove', event => {
    const target = pointerTakeTarget(event);
    if (target === undefined) {
      delete canvas.dataset['takeTarget'];
    } else {
      canvas.dataset['takeTarget'] = String(target);
    }
  });
  canvas.addEventListener('pointerleave', () => {
    delete canvas.dataset['takeTarget'];
  });
  canvas.addEventListener('click', event => {
    if (event.button !== 0) {
      return;
    }
    const target = pointerTakeTarget(event);
    if (target === undefined) {
      return;
    }
    performAndRefresh(() => session.reach('take', target));
    delete canvas.dataset['takeTarget'];
    publish();
    event.preventDefault();
  });

  window.addEventListener('keydown', event => {
    switch (routeKey(routerState(), event)) {
      case 'browser':
      case 'chrome':
      case 'opening-held':
        return;
      case 'opening':
        commitDestination();
        event.preventDefault();
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
  const departureView = installDepartureView({
    destinations: DESTINATIONS,
    elements: departureElements,
    onCommit: commitDestination,
    onSkip: skipToTarg
  });
  const panelContext = (): PanelContext => ({
    cellSize: world.cellSize,
    clock: formatTargTime(targClock.secondsOfDay(snapshot.elapsed), '-'),
    // Object names are fixed content, so they are gathered once per world rather than per frame.
    objectNames: names
  });
  const publish = (): void => {
    const departing = departure.isActive();
    const arriving = arrival.isActive();
    const phase = arrival.current().kind;
    // Deep space keeps the message window blank: the Departure has no narration of its own, and
    // the title card is the Arrival's first beat, not the Departure's last.
    const narration = departing
      ? ''
      : arriving
        ? arrival.narrationText()
        : undefined;
    const pose = arrival.pose();
    const presentation = effectivePresentation(
      settings.presentation,
      preferences.current()
    );
    const framePresentation = {
      ...presentation,
      orreryElapsed: targClock.elapsed(snapshot.elapsed)
    };
    const plan = departing
      ? departure.framePlan(VIEWPORT)
      : arriving
        ? arrivalFramePlan(phase, {
            field: arrival.fieldProgress(),
            pose,
            presentation: framePresentation,
            size: VIEWPORT,
            snapshot,
            world,
            ...(renderer.orrery === undefined
              ? {}
              : { orrery: renderer.orrery })
          })
        : planFrame(
            world,
            snapshot,
            VIEWPORT,
            renderer.orrery,
            framePresentation
          );
    const drawn = renderer.render(
      plan,
      // The player's weight and glow choices are presentation, so they are read per frame the
      // same way the sky's preset is.
      presentation.wireframe,
      presentation.roads
    );
    const player = snapshot.player;
    const panelModel = panelViewModel(
      snapshot,
      panelContext(),
      // Read from the Control Profile rather than from the session's intent, which the release
      // path resets to `IDLE` while the toggle itself stays latched.
      controls.intent.running
    );
    panel.draw(
      departing || arriving
        ? arrivalPanelViewModel(
            panelModel,
            {
              narration,
              pose,
              unmeasured: departing || arrival.readsAsterisks()
            },
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
    message.dataset['bensonColour'] =
      publishedMessage.source === 'game' && snapshot.bensonColour !== undefined
        ? String(snapshot.bensonColour)
        : '';
    surface.dataset['arrival'] = phase;
    surface.dataset['departure'] = departure.current().kind;
    surface.dataset['departureMotion'] = departureMotion;
    departureView.update(departure);
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
    // The pads are read before the steps, as a key event arrives before them, and Start is
    // Escape from play.
    if (controls.pollPads(connectedPads(navigator), routePad(routerState()))) {
      menu.show('menu');
    }
    // The System Menu pauses the session rather than hiding it: the frame keeps being drawn, so
    // the player can see what they are about to return to, but no time passes.
    if (menu.layer() === 'none' && ownership.mayAdvance()) {
      clock.frame(timestamp, seconds => {
        // The Departure gives the session nothing at all; the Arrival then advances the session
        // itself while it presents, so that watching the opening and skipping it hand the
        // session the same run of steps.
        if (departure.isActive()) {
          departure.step(seconds);
          return;
        }
        if (arrival.ownsSession()) {
          arrival.step(seconds);
          return;
        }
        const endingBefore = session.scripts?.host.endingPhase ?? 0;
        session.intent = controls.intent;
        const stepped = session.advance(seconds);
        snapshot = stepped.snapshot;
        sound.present(stepped);
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
