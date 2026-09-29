import { STREET_SPAN } from '../atlas/bodyRange.ts';
import { atlasHref } from '../atlas/state.ts';
import { browserAtlasHandoff } from '../atlas/travel.ts';
import { readGammaSystem } from '../flyover/documents.ts';

import '../shell/damoclesPanelElement.ts';

import { IDLE } from '../gameCore/index.ts';
import { DEFAULT_CAST_SHADOWS } from '../settings/index.ts';
import { installAudioLifecycle } from '../shell/audioLifecycle.ts';
import { installShellChrome } from '../shell/chrome.ts';
import { FixedStepClock } from '../shell/clock.ts';
import type { ConsoleParseContext } from '../shell/console.ts';
import { installConsole } from '../shell/consoleView.ts';
import { renderControlsPage } from '../shell/controlsView.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import { BrowserControlProfile } from '../shell/input.ts';
import {
  createNewGameAction,
  escapeFrom,
  installSystemMenu
} from '../shell/menu.ts';
import {
  createSessionOwnership,
  installSessionTakeoverChannel,
  type BrowserLockManager
} from '../shell/ownership.ts';
import { installPanel, installPanelScale } from '../shell/panelView.ts';
import { canvasPointer } from '../shell/pointer.ts';
import { createPreferences } from '../shell/preferences.ts';
import type { SessionResumePersistence } from '../shell/resume.ts';
import { createSessionResumeNotices } from '../shell/resumeNotices.ts';
import { routeKey, type RouterState } from '../shell/router.ts';
import { installSaveChooser } from '../shell/saveChooser.ts';
import { ALL_SLOTS } from '../shell/saves.ts';
import { installSettingsView } from '../shell/settingsView.ts';
import { installStorageWatch } from '../shell/storage.ts';
import { installSuspensionHandlers } from '../shell/suspension.ts';
import type { PayloadDocument } from '../shell/title.ts';
import {
  applyTypeface,
  loadTypography,
  readTypefacePreference
} from '../shell/typography.ts';
import { AudioWorkletTransport } from '../sound/transport.ts';
import { cometCentre, impactTime } from './comet.ts';
import {
  DAMOCLES_CONSOLE_BANNER,
  executeDamoclesConsoleCommand,
  type DamoclesConsoleHost
} from './console.ts';
import { craftProgram } from './craft.ts';
import { FLOATS_PER_VERTEX, planErisFrame } from './frame.ts';
import { classifyPosition } from './islands.ts';
import { erisLighting } from './lighting.ts';
import { damoclesPanelViewModel } from './panel.ts';
import { damoclesTakeTargetAt } from './pointer.ts';
import { ErisRenderer } from './renderer.ts';
import {
  createDamoclesResumePersistence,
  readDamoclesResume,
  writeDamoclesResume
} from './resume.ts';
import {
  damoclesSaveIdentity,
  damoclesWhere,
  type DamoclesSaveSnapshot
} from './save.ts';
import { createDamoclesSavePersistence } from './saves.ts';
import {
  NOISE_BANDS,
  NOISE_ROWS,
  noiseBands,
  presentScreen
} from './screen.ts';
import { DamoclesSession } from './session.ts';
import { skyPass, spaceSkyPass } from './sky.ts';
import {
  DamoclesSoundPresenter,
  type DamoclesSoundCommand,
  type DamoclesSoundDocument
} from './sound.ts';
import { starViewOf, type StarRoutine } from './stars.ts';
import { damoclesTitle } from './title.ts';

/// The Damocles Gameplay Session's document (ADR 0043, ADR 0044).
///
/// Loads none of Targ's Data Payload. System Menu, Saves, Shell Console and the audio transport
/// are the shared Browser Shell host; Arrival, Departure, Benson and the SID stay in Targ's boot.

/// The Catalogue instance of the DAMOCLES FILE, resident slot 151.
const DAMOCLES_FILE = 'object-slot-151';

const surface = document.getElementById('game-surface')!;
const chrome = installShellChrome(surface, {
  atlasLabel: 'Gamma Atlas',
  catalogueLabel: 'Damocles catalogue',
  menuTitle: 'DAMOCLES'
});
const status = document.getElementById('status')!;
const failure = document.getElementById('failure')!;
const canvas = document.getElementById('frame') as HTMLCanvasElement;
const noiseCanvas = document.getElementById('frame-noise') as HTMLCanvasElement;
const panelSection = document.getElementById('panel')!;
const panelScale = document.getElementById('panel-scale')!;
const panelRoot = document.getElementById('panel-damocles')!;
const panelElements = {
  damoclesCompass: document.getElementById(
    'damocles-compass-canvas'
  ) as HTMLCanvasElement,
  damoclesElevation: document.getElementById(
    'damocles-elevation-canvas'
  ) as HTMLCanvasElement,
  damoclesMessage: document.getElementById(
    'damocles-message-canvas'
  ) as HTMLCanvasElement,
  fields: panelRoot.querySelectorAll<HTMLElement>('[data-field]'),
  lamps: panelRoot.querySelectorAll<HTMLElement>('[data-lamp]'),
  root: panelRoot
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

let animation: number | undefined;
let running = true;
let stopSound = (): void => {};

const fail = (error: unknown): void => {
  if (!running) {
    return;
  }
  running = false;
  if (animation !== undefined) {
    cancelAnimationFrame(animation);
  }
  stopSound();
  canvas.hidden = true;
  panelSection.hidden = true;
  status.hidden = true;
  failure.hidden = false;
  failure.textContent = error instanceof Error ? error.message : String(error);
};

try {
  assertBrowserDocument(location.pathname, 'damocles');
  document.documentElement.dataset['title'] = damoclesTitle.slug;
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  const [loaded, system] = await Promise.all([
    damoclesTitle.load(requiredJson),
    requiredJson('/payload/damocles/system.json').then(document =>
      readGammaSystem(document.value)
    ),
    loadTypography()
  ]);
  // The range scan in space reads the comet where the impact clock has moved it (#558).
  const content = {
    ...loaded,
    cometAt: (elapsed: number) =>
      cometCentre(system.comet, impactTime(elapsed, loaded.doc.time))
  };
  applyTypeface(document.documentElement, readTypefacePreference(storage));
  panelRoot.dataset['rendition'] = 'damocles';
  const identity = damoclesSaveIdentity(
    content.catalogue,
    content.presentationSha256
  );
  const handoff = browserAtlasHandoff();
  try {
    handoff.clearPlayer();
  } catch {
    /* Opening the Atlas will explain unavailable storage. */
  }
  let travelToken = new URL(location.href).searchParams.get('atlasTravel');
  let atlasBusy = travelToken !== null;
  let atlasNotice = '';
  const keys = damoclesTitle.storage;
  const notices = createSessionResumeNotices();
  let handleOwnershipLost = (): void => {};
  const browserLocks =
    navigator.locks === undefined
      ? undefined
      : (navigator.locks as unknown as BrowserLockManager);
  const ownership = createSessionOwnership({
    locks: browserLocks,
    name: keys.lock,
    onLost: () => handleOwnershipLost()
  });
  const ownershipOutcome = await ownership.claim();
  const resumeRead =
    ownershipOutcome.kind === 'owned'
      ? readDamoclesResume(
          storage,
          identity,
          {
            catalogue: content.catalogue,
            poses: content.poses,
            strings: content.strings
          },
          { preserveInvalid: travelToken !== null }
        )
      : ({ kind: 'empty' } as const);

  let protectResume =
    travelToken !== null &&
    (resumeRead.kind === 'invalid' ||
      resumeRead.kind === 'unavailable' ||
      ownershipOutcome.kind === 'unsupported');
  let applyAudioPreferences = (_preferences: {
    readonly audioMuted: boolean;
    readonly audioVolume: number;
  }): void => {};
  const preferences = createPreferences({
    onChange: changed => applyAudioPreferences(changed),
    storage,
    surface
  });
  if (resumeRead.kind === 'restored') {
    await DamoclesSession.prepare(content, resumeRead.snapshot);
  }
  let session = new DamoclesSession(
    content,
    resumeRead.kind === 'restored' ? resumeRead.snapshot : undefined
  );
  const renderer = new ErisRenderer(
    canvas,
    {
      cullBackFaces: content.doc.rendering.cullBackFaces,
      ...(content.doc.lighting.shadows ? { lighting: true } : {})
    },
    () =>
      fail(
        new Error(
          'The graphics context was lost. Reload the page to restore Damocles.'
        )
      )
  );
  canvas.hidden = false;
  panelSection.hidden = false;
  installPanelScale(panelSection, panelScale, (target, onResize) => {
    new ResizeObserver(onResize).observe(target);
  });
  const panel = installPanel(panelElements);
  let commitAction = (_action: () => unknown): void => {};

  // The transport reports a failed audio graph once and carries on in silence.
  let audioUnavailable = false;
  const sound = new DamoclesSoundPresenter(
    new AudioWorkletTransport<DamoclesSoundCommand, DamoclesSoundDocument>(
      { vblHertz: content.doc.time.vblHertz },
      {
        onFailure: () => {
          audioUnavailable = true;
          notices.audioUnavailable();
        },
        processor: 'damocles-ym',
        workletUrl: '/src/damocles/soundWorklet.ts'
      }
    )
  );
  stopSound = () => sound.dispose();
  applyAudioPreferences = changed => {
    sound.setMuted(changed.audioMuted);
    sound.setVolume(changed.audioVolume);
  };
  applyAudioPreferences(preferences.current());

  /// A tally of the Sound Cues the session asked for, as they are drained, and apart from it a
  /// count of the messages whose tone it asked for. They prove requests, not audible output:
  /// #301 reads the tally to see one take ask for exactly one sound, and the presenter's own
  /// state is published beside it.
  const cueTally = new Map<string, number>();
  let messageTones = 0;
  const drainEffects = (): void => {
    const effects = session.drainEffects();
    for (const effect of effects) {
      if (effect.type === 'message') {
        messageTones += 1;
      } else {
        cueTally.set(effect.cue, (cueTally.get(effect.cue) ?? 0) + 1);
      }
    }
    sound.present(effects, snapshot.elapsed);
  };

  // Both take paths, the key and the pointer, come through here. Taking the DAMOCLES FILE shows
  // its recovered keypad instructions (trigger 6); the notice names the keys a laptop has.
  const take = (): void =>
    commitAction(() => {
      if (
        session.take().kind === 'took' &&
        session.snapshot.carried[0] === DAMOCLES_FILE
      ) {
        notices.headCommandKeys();
      }
    });

  // Fire is the held level `firing`, a Damocles Lift is ridden by the Floor keys through
  // `liftKey`, and no script asks for a key or can be hurried, so there is no `fire`,
  // `rideLift`, `press` or `skipMessage`.
  const controls = new BrowserControlProfile({
    drop: () => commitAction(() => session.drop()),
    headCommand: command => commitAction(() => session.headCommand(command)),
    leaveCraft: () => commitAction(() => session.leave()),
    liftKey: floor => {
      if (!session.inLift) {
        return false;
      }
      commitAction(() => session.rideLift(floor));
      return true;
    },
    // The shared profile reads only whether the player is aboard. Its numeric slot is Targ's
    // identity, so the Damocles instance id is only translated here, at the boundary.
    occupancy: () => {
      const occupancy = session.occupancy;
      return occupancy.kind === 'onFoot'
        ? occupancy
        : {
            kind: 'aboard',
            slot: Number(/\d+$/.exec(occupancy.instance)?.[0] ?? 0)
          };
    },
    reach: action => {
      if (action === 'take') {
        take();
      } else if (action === 'board') {
        commitAction(() => session.board());
      }
    },
    // The ST's Esc aboard (`$055822`), which the Browser Shell keeps for the System Menu.
    launch: () => commitAction(() => session.launchCraft()),
    rotateStack: direction =>
      commitAction(() =>
        direction === 'forward'
          ? session.rotateForward()
          : session.rotateBackward()
      ),
    // The throttle keys as the ST scancodes the table at `$0557D6` is indexed by: `1`–`9`
    // are `$02`–`$0A`, `0` is `$0B`, `F1`–`F10` are `$3B`–`$44` and Space is `$39` (#556).
    shutThrottle: () => commitAction(() => session.throttleKey(0x39)),
    throttleNotchValue: notch =>
      commitAction(() => session.throttleKey(notch === 10 ? 0x0b : notch + 1)),
    throttleReverseNotch: notch =>
      commitAction(() => session.throttleKey(0x3a + notch)),
    throttleStep: delta =>
      commitAction(() => session.throttleScale(delta > 0 ? 1 : -1))
  });
  const clock = new FixedStepClock();
  const release = (): void => {
    controls.releaseAll();
    clock.reset();
    session.intent = IDLE;
    session.firing = false;
  };
  installSuspensionHandlers(window, document, release);

  let snapshot = session.snapshot;
  let publish = (): void => {};
  const makeResumePersistence = (): SessionResumePersistence =>
    createDamoclesResumePersistence({
      identity,
      onFailure: notices.failed,
      session: () => session,
      storage: ownership.mayPersist() ? storage : undefined
    });
  let resumePersistence = makeResumePersistence();
  commitAction = (action: () => unknown): void => {
    if (atlasBusy || protectResume || !ownership.mayAdvance()) {
      return;
    }
    action();
    drainEffects();
    snapshot = session.snapshot;
    resumePersistence.dirty();
    resumePersistence.checkpoint(true);
    publish();
  };
  const checkpointChangedResume = (force = true): void => {
    if (protectResume || !ownership.mayPersist()) {
      return;
    }
    resumePersistence.dirty();
    resumePersistence.checkpoint(force);
  };
  const flushResume = (): void => {
    if (!protectResume && ownership.mayPersist()) {
      resumePersistence.checkpoint(true);
    }
  };

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
          chrome.pages.controls,
          controls.describe(session.inLift)
        );
      }
      if (layer === 'menu') {
        notices.menuOpened();
        checkpointChangedResume();
      }
    },
    pages: chrome.pages,
    release,
    surface
  });
  if (ownershipOutcome.kind === 'blocked') {
    menu.show('ownership');
  }

  const replaceSession = (restore?: DamoclesSaveSnapshot): void => {
    if (protectResume) {
      travelToken = null;
      const url = new URL(location.href);
      url.searchParams.delete('atlasTravel');
      history.replaceState(null, '', url.pathname + url.search);
    }
    protectResume = false;
    atlasNotice = '';
    session = new DamoclesSession(content, restore);
    snapshot = session.snapshot;
    // No tone the old session started survives it.
    sound.reset(snapshot.elapsed);
    checkpointChangedResume();
  };

  const persistence = createDamoclesSavePersistence({
    capture: () => ({
      snapshot: session.captureResume(),
      where: damoclesWhere(session.snapshot)
    }),
    catalogue: content.catalogue,
    identity,
    poses: content.poses,
    release,
    restore: saved => {
      const loaded = (): void => {
        replaceSession(saved);
        snapshot = session.snapshot;
        shellConsole.write(['— LOADED SLOT —']);
        menu.show('none');
        publish();
      };
      // A session cannot bind a structure it has no Model for (ADR 0048). Usually everything
      // the Save stands on is in hand and it loads at once, refusing as it always has; a Save on
      // an island not read yet loads once that island has been.
      if (DamoclesSession.missingModels(content, saved).length === 0) {
        loaded();
        return;
      }
      void DamoclesSession.prepare(content, saved).then(() => {
        try {
          loaded();
        } catch (error) {
          shellConsole.write([
            `LOAD REFUSED: ${error instanceof Error ? error.message : String(error)}`
          ]);
        }
      });
    },
    slotKey: keys.save,
    storage,
    strings: content.strings
  });
  installStorageWatch(window, ALL_SLOTS.map(keys.save), persistence.dismiss);
  installSaveChooser({ page: chrome.pages.saves, persistence });

  const openAtlas = async (): Promise<void> => {
    if (atlasBusy || protectResume || !ownership.mayPersist()) {
      atlasNotice =
        'Atlas unavailable: restore or start a game in the owning tab first.';
      return;
    }
    atlasBusy = true;
    release();
    try {
      const current = session.snapshot;
      const body = system.bodies.find(
        item => `body-${item.sourceIndex}` === current.pose.body
      );
      if (!body) {
        throw new Error('The current Body is not in the Atlas.');
      }
      const player = {
        bodyId: body.id,
        heading: current.pose.heading,
        x: current.pose.position.x / current.surface.grid.cellUnits,
        z: current.pose.position.z / current.surface.grid.cellUnits
      };
      if (!ownership.mayPersist()) {
        throw new Error('Session ownership changed.');
      }
      handoff.rememberPlayer(player);
      resumePersistence.dirty();
      const checkpoint = resumePersistence.checkpoint(true);
      if (checkpoint.kind === 'failed' || checkpoint.kind === 'disabled') {
        throw new Error(checkpoint.reason);
      }
      location.assign(
        atlasHref({
          bodyId: body.id,
          instanceId: null,
          islandId: null,
          level: 'body',
          placeId: null,
          view: { span: STREET_SPAN, x: player.x, z: player.z }
        })
      );
    } catch (error) {
      atlasBusy = false;
      atlasNotice = `Atlas could not open: ${error instanceof Error ? error.message : String(error)}`;
      publish();
    }
  };
  document.getElementById('menu-atlas')!.addEventListener('click', event => {
    event.preventDefault();
    void openAtlas();
  });

  const applyAtlasTravel = async (): Promise<void> => {
    if (travelToken === null) {
      atlasBusy = false;
      return;
    }
    if (!ownership.mayPersist() && ownershipOutcome.kind !== 'unsupported') {
      return;
    }
    const token = travelToken;
    release();
    try {
      if (protectResume || !ownership.mayPersist()) {
        throw new Error(
          'Restore a valid Save or explicitly choose New Game before travelling.'
        );
      }
      const target = handoff.peek(token);
      if (!target) {
        throw new Error(
          'This travel request has expired. Return to the Atlas to choose a pin.'
        );
      }
      atlasNotice = 'Preparing Atlas destination…';
      const departingSession = session;
      await DamoclesSession.prepareAtlasTravel(content, target);
      if (session !== departingSession) {
        throw new Error('The Gameplay Session changed while preparing travel.');
      }
      if (!ownership.mayPersist()) {
        return;
      }
      // Stage the authored action before publication. localStorage.setItem is atomic: if it
      // throws, the original session and its durable resume are both still intact.
      const candidate = new DamoclesSession(content, session.captureResume());
      const outcome = candidate.travelToAtlas(target);
      if (outcome.kind === 'declined') {
        throw new Error(outcome.reason);
      }
      // Consume before the durable commit: a reload can never replay a committed request.
      if (!handoff.consume(token)) {
        throw new Error('This travel request has expired.');
      }
      try {
        writeDamoclesResume(storage, identity, candidate);
      } catch (error) {
        // Keep the old record: the ordinary checkpoint helper intentionally removes stale
        // records on failure, which would destroy this transaction's recovery point.
        protectResume = true;
        throw new Error(
          `Arrival could not be saved. Reload to resume your previous game. ${error instanceof Error ? error.message : String(error)}`
        );
      }
      session = candidate;
      snapshot = session.snapshot;
      atlasNotice = 'Arrived at Atlas pin.';
    } catch (error) {
      atlasNotice = `Atlas travel refused: ${error instanceof Error ? error.message : String(error)}`;
      menu.show('menu');
    } finally {
      if (
        ownership.mayPersist() ||
        protectResume ||
        ownershipOutcome.kind === 'unsupported'
      ) {
        // Keep the recovery entry point on an unreadable resume: reloading must not turn an
        // explicit refusal into the ordinary boot path's automatic fresh session.
        if (!protectResume) {
          travelToken = null;
          const url = new URL(location.href);
          url.searchParams.delete('atlasTravel');
          history.replaceState(null, '', url.pathname + url.search);
        }
        atlasBusy = false;
      }
      publish();
    }
  };

  type DamoclesConsoleDeps = ConsoleParseContext & DamoclesConsoleHost;
  const consoleHost: DamoclesConsoleDeps = {
    cellsPerAxis: () => content.doc.grid.cellsPerAxis,
    objectActions: () => 'selected',
    openAtlas: () => {
      void openAtlas();
    },
    // Damocles object slots run 1 through 255, sparsely. Targ's contiguous `objects.length`
    // has no counterpart here, so the bound is the slot byte's range.
    objectSlots: () => 256,
    persistence,
    preferences,
    session: () => session,
    typeface: face => {
      applyTypeface(document.documentElement, face, storage);
    }
  };
  const shellConsole = installConsole(chrome.console, consoleHost, release, {
    banner: DAMOCLES_CONSOLE_BANNER,
    execute: (command, deps) => {
      if (
        atlasBusy ||
        (protectResume && command.kind !== 'load' && command.kind !== 'help')
      ) {
        return ['Restore a Save or choose New Game before continuing.'];
      }
      const lines = executeDamoclesConsoleCommand(command, deps);
      drainEffects();
      snapshot = session.snapshot;
      if (
        command.kind === 'dropObject' ||
        command.kind === 'floor' ||
        command.kind === 'getObject' ||
        command.kind === 'gotoCell' ||
        command.kind === 'load' ||
        command.kind === 'save' ||
        command.kind === 'switchBody'
      ) {
        checkpointChangedResume();
      }
      publish();
      return lines;
    }
  });

  handleOwnershipLost = () => {
    sound.reset(snapshot.elapsed);
    sound.suspend();
    release();
    shellConsole.close();
    notices.ownership('SESSION OPENED ELSEWHERE');
    chrome.pages.ownership.querySelector<HTMLElement>(
      '.chrome-title'
    )!.textContent = 'SESSION OPENED ELSEWHERE';
    menu.show('ownership');
  };

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

  installSettingsView({
    onPresentationChange: () => publish(),
    page: chrome.pages.settings,
    preferences,
    root: document.documentElement,
    storage
  });

  const takeover = installSessionTakeoverChannel({
    mayPersist: () => ownership.mayPersist(),
    name: keys.ownershipChannel,
    onYield: () => {
      flushResume();
      ownership.release();
      handleOwnershipLost();
    }
  });

  const newGame = createNewGameAction(() => {
    release();
    replaceSession();
    snapshot = session.snapshot;
    shellConsole.write(['— NEW GAME —']);
    menu.show('none');
    publish();
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

  chrome.takeOver.addEventListener('click', async () => {
    chrome.takeOver.disabled = true;
    const yielded = await takeover.requestCooperativeTakeover();
    let outcome = yielded
      ? await ownership.claim()
      : await ownership.takeOver();
    if (outcome.kind === 'blocked') {
      outcome = await ownership.takeOver();
    }
    if (outcome.kind === 'owned') {
      resumePersistence = makeResumePersistence();
      const recovered = readDamoclesResume(
        storage,
        identity,
        {
          catalogue: content.catalogue,
          poses: content.poses,
          strings: content.strings
        },
        { preserveInvalid: travelToken !== null }
      );
      protectResume =
        travelToken !== null &&
        (recovered.kind === 'invalid' || recovered.kind === 'unavailable');
      notices.dismiss();
      if (recovered.kind === 'restored') {
        await DamoclesSession.prepare(content, recovered.snapshot);
        replaceSession(recovered.snapshot);
        notices.resumed();
      } else {
        if (!protectResume) {
          replaceSession();
        }
        if (recovered.kind === 'invalid') {
          notices.couldNotResume(recovered.reason);
        } else if (recovered.kind === 'unavailable') {
          notices.failed(recovered.reason);
        }
      }
      chrome.pages.ownership.querySelector<HTMLElement>(
        '.chrome-title'
      )!.textContent = 'SESSION ACTIVE IN ANOTHER TAB';
      menu.show('none');
      await applyAtlasTravel();
    }
    chrome.takeOver.disabled = false;
  });

  const routerState = (): RouterState => ({
    chromeFocus: document.activeElement?.closest('[data-shell-chrome]') != null,
    console: shellConsole.isOpen() ? 'open' : 'closed',
    layer: menu.layer(),
    opening: 'none'
  });

  const pointerTakeTarget = (event: MouseEvent): string | undefined => {
    const state = routerState();
    const pointer = canvasPointer(canvas, {
      x: event.clientX,
      y: event.clientY
    });
    if (
      state.chromeFocus ||
      state.console !== 'closed' ||
      state.layer !== 'none' ||
      pointer === undefined ||
      !ownership.mayAdvance()
    ) {
      return undefined;
    }
    return damoclesTakeTargetAt(
      snapshot,
      content.doc.camera,
      { height: canvas.height, width: canvas.width },
      pointer.point,
      pointer.hitSlop,
      content.doc.orientation.modelZ === 'negate'
    );
  };
  canvas.addEventListener('pointermove', event => {
    const target = pointerTakeTarget(event);
    if (target === undefined) {
      delete canvas.dataset['takeTarget'];
    } else {
      canvas.dataset['takeTarget'] = target;
    }
  });
  canvas.addEventListener('pointerleave', () => {
    delete canvas.dataset['takeTarget'];
  });
  canvas.addEventListener('click', event => {
    if (event.button !== 0 || pointerTakeTarget(event) === undefined) {
      return;
    }
    take();
    delete canvas.dataset['takeTarget'];
    event.preventDefault();
  });

  window.addEventListener('keydown', event => {
    switch (routeKey(routerState(), event)) {
      case 'browser':
      case 'chrome':
      case 'opening-held':
      case 'opening':
        return;
      case 'escape': {
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
    if (!controls.keyUp(event)) {
      return;
    }
    if (routeKey(routerState(), event) === 'game') {
      event.preventDefault();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushResume();
    }
  });
  window.addEventListener('pagehide', () => {
    flushResume();
    takeover.close();
  });

  const paintNotices = (): void => {
    const save = persistence.message('');
    const resume = notices.message();
    const text =
      atlasNotice ||
      (save.source === 'shell'
        ? save.text
        : resume.source === 'shell'
          ? resume.text
          : '');
    if (text === '') {
      status.hidden = true;
      return;
    }
    status.hidden = false;
    status.textContent = text;
  };

  const expose = (
    triangles: number,
    drawnPlacements: readonly string[],
    skyBodies: readonly string[],
    stars: number,
    horizonIslandTriangles: number
  ): void => {
    const root = canvas.dataset;
    root['body'] = snapshot.pose.body;
    root['cell'] = `${snapshot.cell.x}-${snapshot.cell.z}`;
    // Session time, so a browser pass can measure a speed per session second rather than per
    // wall-clock second, which a loaded browser stretches.
    root['elapsed'] = String(snapshot.elapsed);
    root['x'] = String(snapshot.pose.position.x);
    root['y'] = String(snapshot.pose.position.y);
    root['z'] = String(snapshot.pose.position.z);
    root['heading'] = String(snapshot.pose.heading);
    // The view's pitch and bank, which the craft Mover moves aboard (#556).
    root['pitch'] = String(snapshot.pose.pitch);
    root['roll'] = String(snapshot.pose.roll ?? 0);
    // Space (#558): the launch swing, the nearest Body and its range, and the craft's System
    // position, empty on a Body; and why the Mover stands still, if it does.
    const space = snapshot.craft?.space ?? null;
    root['craftSwing'] = String(snapshot.craft?.swing ?? false);
    root['craftHeld'] = snapshot.craft?.held ?? '';
    root['spaceNearest'] = space?.nearest ?? '';
    root['spaceRange'] = space === null ? '' : String(space.range);
    root['spacePosition'] =
      space === null
        ? ''
        : `${space.position.x} ${space.position.y} ${space.position.z}`;
    root['attachmentOpenUnits'] = String(
      snapshot.structure?.attachments[0]?.openUnits ?? 0
    );
    root['structureInstance'] = snapshot.structure?.instanceId ?? '';
    // The Floor the player stands on in that structure, 0 where none is bound.
    root['floor'] = String(snapshot.structure?.floor ?? 0);
    // A Damocles Lift ride: the Floor the label shows, which steps during one, and the Floor
    // asked for, empty when no ride is pending.
    const ride = snapshot.structure?.ride ?? null;
    root['floorLabel'] = String(ride?.label ?? snapshot.structure?.floor ?? 0);
    root['rideDestination'] = ride === null ? '' : String(ride.destination);
    // The instance the player is aboard, empty on foot, so a browser pass can see a board land.
    root['occupancy'] =
      snapshot.occupancy.kind === 'aboard' ? snapshot.occupancy.instance : '';
    // Which region of the bound structure the player stands in. It decides which residents are
    // exposed, so a browser pass cannot judge visibility or a region-bound refusal without it.
    root['region'] = String(snapshot.structure?.regionIndex ?? '');
    // The Damocles Display is painted on the aux canvas, so its row has no text a test or a
    // screen reader could read. Publishing the cells is how the row becomes observable.
    root['damoclesRow'] = snapshot.displayCells.cells.trim();
    // How far a scrolling record has travelled into the row, so a partially revealed message is
    // observable as something other than a shorter string.
    root['damoclesScroll'] = String(snapshot.displayCells.scrollPixels);
    root['damoclesCues'] = [...cueTally]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cue, count]) => `${cue}:${count}`)
      .join(' ');
    root['damoclesMessageTones'] = String(messageTones);
    // Whether the sound presenter is locked, running or suspended, apart from the cue tally.
    root['damoclesAudio'] = audioUnavailable ? 'unavailable' : sound.state;
    root['triangles'] = String(triangles);
    // Every structure and object the frame drew, repeats kept, so a browser pass can tell an
    // occupied craft is not drawn and a left one is drawn once rather than inferring it from a
    // triangle count that also moves with the view.
    root['drawn'] = drawnPlacements.join(' ');
    root['unresolved'] = String(snapshot.surface.unresolvedCount);
    // The terminator's answer, so a browser pass can say which sky and palette half it expects.
    root['daylight'] = String(snapshot.daylight);
    // The TOLOSA encounter's screen (#581): what a browser pass can see of a zap and a death.
    const screen = snapshot.screen;
    root['screen'] = screen.dead
      ? 'dead'
      : screen.noise
        ? 'noise'
        : screen.fade > 0
          ? `fade-${screen.fade}`
          : screen.white
            ? 'white'
            : 'clear';
    // The sky Bodies any of whose disc the frame draws, in draw order (#530).
    root['skyBodies'] = skyBodies.join(' ');
    // The star pixels the frame plots, and the island fill triangles it paints flat over the
    // ground to the horizon, which from high up are all there is of the islands (#578).
    root['skyStars'] = String(stars);
    root['horizonIslandTriangles'] = String(horizonIslandTriangles);
  };
  // The log tables the roll's tangent is divided through, for the flight starfield's shear.
  const starArithmetic =
    content.catalogue.craft === null
      ? null
      : craftProgram(content.catalogue.craft).arithmetic;
  /// The zap's palette-noise loop (#581): bands of the noise table's colours over the view while
  /// it runs, a fresh set every tick.
  const noiseWords = content.catalogue.craft?.noise.words ?? new Uint16Array();
  let noiseTick = 0;
  const paintNoise = (running: boolean): void => {
    noiseCanvas.hidden = !running;
    if (!running) {
      return;
    }
    noiseTick += 1;
    noiseCanvas.width = NOISE_BANDS;
    noiseCanvas.height = NOISE_ROWS;
    const context = noiseCanvas.getContext('2d');
    if (context === null) {
      return;
    }
    noiseBands(noiseWords, noiseTick).forEach((bands, row) =>
      bands.forEach((colour, band) => {
        context.fillStyle = colour;
        context.fillRect(band, row, 1, 1);
      })
    );
  };
  const draw = (): void => {
    const { castShadows, presentationPreset } = preferences.current();
    const enhanced =
      presentationPreset === undefined || presentationPreset === 'enhanced';
    const space = snapshot.craft?.space ?? null;
    // Which starfield the frame loop takes (#578): space's, `$0505B8` on foot on an island's
    // core, where `$78A6` is 0 and `$7AAA` is not, and the flight branch's anywhere else.
    const onFoot = snapshot.occupancy.kind === 'onFoot';
    const routine: StarRoutine =
      space !== null
        ? 'space'
        : onFoot &&
            classifyPosition(snapshot.surface, snapshot.pose.position).kind ===
              'core'
          ? 'onFoot'
          : 'flight';
    const stars =
      starArithmetic === null
        ? null
        : starViewOf(
            snapshot.pose,
            content.doc.orientation,
            routine,
            onFoot,
            starArithmetic
          );
    // The surface comes from the Session Snapshot rather than the presentation document, so a
    // Body switch or a Save restored onto another Body draws that Body's workspace (#379).
    const plan = planErisFrame(
      snapshot.surface,
      snapshot.pose,
      content.doc,
      snapshot.structure,
      snapshot.residents,
      [
        ...snapshot.carried,
        ...snapshot.briefcaseStore,
        ...snapshot.residence.map(item => item.instance)
      ],
      slot => session.carriesSlot(slot),
      snapshot.daylight,
      // The sky Bodies turn with the accumulator the terminator reads, and the comet moves with
      // the impact clock, so a Save restores all three. Enhanced presentation moves the Bodies
      // smoothly between the engine's steps.
      space === null
        ? skyPass(system, {
            body: snapshot.pose.body,
            daylight: snapshot.daylight,
            impact: impactTime(snapshot.elapsed, content.doc.time),
            position: snapshot.pose.position,
            sky: snapshot.surface.sky,
            smooth: enhanced,
            stars,
            turn: snapshot.bodyTurn
          })
        : spaceSkyPass(system, {
            eye: space.position,
            impact: impactTime(snapshot.elapsed, content.doc.time),
            inScene: index =>
              (content.catalogue.craft?.bodies[index]?.y ?? 0) >= 0,
            stars
          }),
      space !== null
    );
    const shadowEdge = castShadows ?? DEFAULT_CAST_SHADOWS;
    // A Cast Shadow is Enhanced presentation only, and the player may turn its edge off.
    const shadows =
      content.doc.lighting.shadows &&
      enhanced &&
      shadowEdge !== 'off' &&
      space === null;
    const screen = snapshot.screen;
    paintNoise(screen.noise);
    renderer.render(
      presentScreen(plan, screen),
      shadows
        ? {
            eyeWorld: snapshot.pose.position,
            heading: snapshot.pose.heading,
            lighting: erisLighting(content.doc, snapshot.pose.heading),
            shadowEdge
          }
        : undefined
    );
    panel.draw(
      damoclesPanelViewModel(snapshot, content.doc, controls.intent.running)
    );
    expose(
      plan.triangleCount,
      plan.drawnPlacements,
      plan.skyBodies.filter(body => body.drawn).map(body => body.id),
      plan.starCount,
      plan.horizonIslandVertices.length / (3 * FLOATS_PER_VERTEX)
    );
    paintNotices();
  };
  publish = draw;
  draw();
  await applyAtlasTravel();
  canvas.dataset['state'] = 'ready';
  const frame = (timestamp: number): void => {
    if (!running) {
      return;
    }
    try {
      const steps = clock.frame(timestamp, seconds => {
        if (
          menu.layer() === 'none' &&
          !atlasBusy &&
          !protectResume &&
          ownership.mayAdvance()
        ) {
          session.intent = controls.intent;
          session.firing = controls.firing;
          snapshot = session.advance(seconds);
          drainEffects();
          resumePersistence.dirty();
        }
      });
      if (steps > 0) {
        draw();
      } else {
        paintNotices();
      }
      if (!protectResume) {
        resumePersistence.checkpoint(false);
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
