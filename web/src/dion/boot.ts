import { ViewInterpolator } from '../enhanced/interpolation.ts';
import { IDLE } from '../gameCore/index.ts';
import { installShellChrome } from '../shell/chrome.ts';
import { FixedStepClock } from '../shell/clock.ts';
import { installConsole } from '../shell/consoleView.ts';
import { renderControlsPage } from '../shell/controlsView.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import { connectedPads } from '../shell/gamepad.ts';
import { BrowserControlProfile } from '../shell/input.ts';
import { browserKeyNames } from '../shell/keyNames.ts';
import {
  createNewGameAction,
  escapeFrom,
  installSystemMenu
} from '../shell/menu.ts';
import {
  createSessionOwnership,
  installSessionTakeoverChannel
} from '../shell/ownership.ts';
import {
  installPanelControls,
  recoveredPanelLayout
} from '../shell/panelControls.ts';
import { canvasPointer } from '../shell/pointer.ts';
import { createPreferences, titlePreferences } from '../shell/preferences.ts';
import { routeKey, routePad, type RouterState } from '../shell/router.ts';
import { installSaveChooser } from '../shell/saveChooser.ts';
import { installSettingsView } from '../shell/settingsView.ts';
import { installSuspensionHandlers } from '../shell/suspension.ts';
import type { PayloadDocument } from '../shell/title.ts';
import { applyTypeface } from '../shell/typography.ts';
import { SoundLifecycle } from '../sound/lifecycle.ts';
import { AudioWorkletTransport } from '../sound/transport.ts';
import {
  DION_CONSOLE_BANNER,
  dionMessageTranscript,
  executeDionConsoleCommand,
  parseDionConsoleCommand,
  type DionConsoleCommand,
  type DionConsoleHost
} from './console.ts';
import { CARD_ACTIONS, dionControlActions } from './controls.ts';
import {
  dionDoorsBetween,
  dionViewContinues,
  type DionEnhancedScene
} from './enhancedScene.ts';
import { installDionPresentation } from './framePresentation.ts';
import { PANEL_TOP, dionLogoRgba } from './panel.ts';
import { dionTakeTargetAt } from './pointer.ts';
import { DION_STORAGE } from './save.ts';
import type { DionAction } from './session.ts';
import type { DionSoundCommand } from './soundChip.ts';
import { dionTitle } from './title.ts';
import { prepareTourcraftFrame } from './tourcraftPresentation.ts';
import {
  createTourcraftResumePersistence,
  createTourcraftSavePersistence,
  readTourcraftSession,
  tourcraftWhere
} from './tourcraftSave.ts';
import { TourcraftSession } from './tourcraftSession.ts';

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
const chrome = installShellChrome(surface, {
  catalogueLabel: 'CATALOGUE',
  cataloguePath: '/dion/catalogue',
  logo: { name: 'MERCENARY III', typeface: 'damocles' },
  menuTitle: 'MERCENARY III',
  settings: [
    'presentation',
    'shadows',
    'shadow-depth',
    'ambient',
    'extended',
    'audio'
  ]
});

/// The pointer's slack around the candidate in the Enhanced view, in CSS pixels, as Damocles's.
const ENHANCED_HIT_SLOP = 12;

let animation: number | undefined;
let running = true;
let viewPresentation: ReturnType<typeof installDionPresentation> | undefined;

const fail = (error: unknown): void => {
  if (!running) {
    return;
  }
  running = false;
  if (animation !== undefined) {
    cancelAnimationFrame(animation);
  }
  viewPresentation?.dispose();
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

try {
  assertBrowserDocument(location.pathname, 'dion');
  document.documentElement.dataset['title'] = dionTitle.slug;
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  const promoted = await dionTitle.load(requiredJson);
  const content = promoted.legacy;
  const logo = dionLogoRgba(content.panel);
  chrome.showLogo(new ImageData(logo.data, logo.width, logo.height));
  const notice = (text: string): void => {
    status.hidden = false;
    status.textContent = text;
  };
  const audio = new SoundLifecycle<DionSoundCommand>(
    new AudioWorkletTransport(
      {},
      {
        onFailure: reason => notice(`Sound unavailable: ${reason}`),
        processor: 'dion-ym',
        workletUrl: '/src/dion/soundWorklet.ts'
      }
    )
  );
  // Mercenary III's own preferences (ADR 0063): its presentation, its audio and Extended
  // Controls, kept apart from Targ's and Damocles's.
  let applyControlPreferences = (_changed: {
    readonly extendedControls: boolean;
  }): void => {};
  const preferences = createPreferences({
    location: titlePreferences(dionTitle.slug),
    onChange: changed => {
      audio.setMuted(changed.audioMuted);
      audio.setVolume(changed.audioVolume);
      applyControlPreferences(changed);
    },
    storage,
    surface
  });
  audio.setMuted(preferences.current().audioMuted);
  audio.setVolume(preferences.current().audioVolume);
  let handleOwnershipLost = (): void => {};
  const ownership = createSessionOwnership({
    locks: navigator.locks,
    name: DION_STORAGE.lock,
    onLost: () => handleOwnershipLost()
  });
  await ownership.claim();
  const opened = readTourcraftSession(storage, promoted);
  let protectResume = opened.reason !== null;
  let session = opened.session;
  applyControlPreferences = changed => {
    if (!changed.extendedControls) {
      session.recentreLook();
    }
  };
  let snapshot = session.snapshot;
  const initialFrame = prepareTourcraftFrame(session);

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error(
      'The browser gave no 2D canvas for the Mercenary III screen.'
    );
  }
  const image = context.createImageData(320, 200);
  canvas.hidden = false;
  status.hidden = true;

  const act = (action: DionAction): void => {
    session.press(action);
    checkpoint();
  };
  // Damocles's Control Profile, whole (ADR 0064). Held keys reach the Movement Intent, and the
  // session walks it on the shared foot step and region clamp.
  const controls = new BrowserControlProfile(
    dionControlActions({
      act,
      extendedControls: () => preferences.current().extendedControls,
      launch: () => {
        session.launchCraft();
        checkpoint();
      },
      passenger: () => session.aboard,
      recentreLook: () => session.recentreLook(),
      throttleKey: key => {
        session.throttleKey(key);
        checkpoint();
      },
      throttleNotchStep: direction => {
        session.throttleNotchStep(direction);
        checkpoint();
      },
      throttleScale: direction => {
        session.throttleScale(direction);
        checkpoint();
      }
    }),
    // The run mode is Session State, as Damocles's is, so a Save and a reload keep it.
    {
      running: () => session.running,
      toggleRunning: () => {
        session.toggleRunning();
        checkpoint();
      }
    }
  );
  const keyNames = browserKeyNames();
  const clock = new FixedStepClock();
  // The Enhanced view, drawn between frames (ADR 0078).
  const views = new ViewInterpolator<DionEnhancedScene>(
    dionViewContinues,
    // A door the frame moved is drawn part way, as the view's eye is.
    (from, to, t) => {
      const doors = dionDoorsBetween(from, to, t);
      return doors === null ? to : session.enhancedScene(doors);
    }
  );
  const release = (): void => {
    controls.releaseAll();
    clock.reset();
    session.intent = IDLE;
  };
  installSuspensionHandlers(window, document, release);

  const menu = installSystemMenu({
    onLayer: layer => {
      if (layer === 'controls') {
        renderControlsPage(
          chrome.pages.controls,
          controls.describe(false, keyNames)
        );
      }
    },
    pages: chrome.pages,
    release,
    surface
  });
  handleOwnershipLost = () => {
    release();
    audio.suspend();
    shellConsole.close();
    chrome.takeOver.hidden = false;
    menu.show('ownership');
    notice('This Mercenary III session is active in another tab.');
  };
  viewPresentation = installDionPresentation({
    light: () => preferences.current(),
    notice,
    onRecovered: () => {
      if (status.textContent?.startsWith('Enhanced unavailable.')) {
        status.hidden = true;
      }
    },
    onShownChange: () => settingsView.refresh(),
    redraw: () => draw(),
    screen: canvas,
    stored: () => preferences.current().presentationPreset ?? 'enhanced'
  });
  const presentation = viewPresentation;
  const settingsView = installSettingsView({
    onPresentationChange: () => presentation.changed(),
    page: chrome.pages.settings,
    preferences,
    presentationShown: () => presentation.shown(),
    root: document.documentElement,
    storage,
    typefaceKey: DION_STORAGE.typeface
  });
  const resume = createTourcraftResumePersistence({
    content: promoted,
    onFailure: reason => notice(`Session Resume unavailable: ${reason}`),
    session: () => session,
    storage
  });
  const flush = (): void => {
    if (!protectResume && ownership.mayPersist()) {
      resume.checkpoint(true);
    }
  };
  const checkpoint = (): void => {
    if (!protectResume && ownership.mayPersist()) {
      resume.dirty();
      resume.checkpoint(true);
    }
  };
  const persistence = createTourcraftSavePersistence({
    capture: () => {
      if (!ownership.mayPersist()) {
        throw new Error('This session is active in another tab');
      }
      return {
        snapshot: session.captureResume(),
        where: tourcraftWhere(session)
      };
    },
    content: promoted,
    release,
    restore: record => {
      if (!ownership.mayPersist()) {
        throw new Error('This session is active in another tab');
      }
      const candidate = new TourcraftSession(promoted, record);
      const prepared = prepareTourcraftFrame(candidate);
      session = candidate;
      snapshot = session.snapshot;
      protectResume = false;
      audio.send({
        at: snapshot.tick / 50,
        commands: [
          {
            kind: 'reset',
            state: {
              ...snapshot.sound,
              registers: session.snapshot.tourcraft!.events.deliveredRegisters
            }
          }
        ]
      });
      checkpoint();
      menu.show('none');
      views.reset();
      draw(prepared);
    },
    storage
  });
  installSaveChooser({ page: chrome.pages.saves, persistence });

  const shellConsole = installConsole<DionConsoleHost, DionConsoleCommand>(
    chrome.console,
    {
      pads: () => navigator.getGamepads?.() ?? [],
      persistence,
      preferences,
      session: () => session,
      typeface: face => {
        applyTypeface(document.documentElement, face, {
          key: DION_STORAGE.typeface,
          storage
        });
      }
    },
    release,
    {
      banner: DION_CONSOLE_BANNER,
      execute: (command, host) => {
        if (!ownership.mayAdvance()) {
          return ['This session is active in another tab.'];
        }
        if (
          protectResume &&
          command.kind !== 'help' &&
          command.kind !== 'load' &&
          command.kind !== 'pads'
        ) {
          return ['Restore a Save or choose New Game before continuing.'];
        }
        const lines = executeDionConsoleCommand(command, host);
        snapshot = session.snapshot;
        if (command.kind === 'setTime' || command.kind === 'setClock') {
          checkpoint();
        }
        views.reset();
        draw();
        return lines;
      },
      parse: parseDionConsoleCommand,
      persistence: { key: DION_STORAGE.consoleHistory, storage }
    }
  );

  let panelPixels: Uint8ClampedArray<ArrayBuffer> | undefined;
  // The panel's controls, laid once the session's actions exist.
  let drawPanelControls = (): void => {};
  // The scene last drawn, kept for the frames between the session's steps.
  let built: DionEnhancedScene | undefined;
  const currentScene = (): DionEnhancedScene =>
    (built ??= session.enhancedScene());
  /// The Enhanced view alone, between the frames the session runs (ADR 0078).
  const drawView = (): void => {
    if (panelPixels !== undefined) {
      viewPresentation?.render(
        () => views.view(currentScene(), session.passPhase(clock.leftover)),
        panelPixels
      );
    }
  };
  const draw = (prepared = prepareTourcraftFrame(session)): void => {
    const { planned } = prepared;
    image.data.set(prepared.rgba);
    context.putImageData(image, 0, 0);
    panelPixels = prepared.rgba.subarray(PANEL_TOP * 320 * 4);
    built = undefined;
    drawView();
    const root = canvas.dataset;
    root['cell'] = String(snapshot.cell);
    root['region'] = String(snapshot.region);
    root['x'] = String(snapshot.eye[0]);
    root['z'] = String(snapshot.eye[2]);
    root['heading'] = String(snapshot.heading);
    root['pitch'] = String(snapshot.pitch);
    root['tick'] = String(snapshot.tick);
    root['frame'] = String(snapshot.frame);
    root['clock'] = String(snapshot.clock.seconds);
    root['polygons'] = String(planned.stats.polygons);
    root['lines'] = String(planned.stats.lines);
    root['models'] = planned.stats.models.join(' ');
    root['gaps'] = planned.stats.gaps.join('; ');
    root['content'] = promoted.contentSha256;
    root['location'] = String(snapshot.location);
    root['playback'] = String(snapshot.tourcraft!.flight?.mode ?? 'inactive');
    root['playbackFrame'] = String(snapshot.tourcraft!.flight?.frameWord ?? 0);
    root['passenger'] = String(snapshot.taxi.passenger);
    root['counter'] = String(snapshot.taxi.counter);
    root['destination'] = String(snapshot.taxi.destination);
    root['start'] = String(snapshot.taxi.start);
    root['call'] = String(snapshot.taxi.call);
    root['reveal'] = String(snapshot.reveal);
    root['day'] = String(snapshot.day);
    root['message'] = snapshot.narrative.message.text;
    root['scriptActive'] = String(snapshot.narrative.flags[6]);
    drawPanelControls();
  };

  const newGame = createNewGameAction(() => {
    release();
    if (!ownership.mayAdvance()) {
      notice('This session is active in another tab.');
      return;
    }
    const candidate = new TourcraftSession(promoted);
    const prepared = prepareTourcraftFrame(candidate);
    protectResume = false;
    resume.clear();
    session = candidate;
    snapshot = session.snapshot;
    audio.send({
      at: 0,
      commands: [
        {
          kind: 'reset',
          state: {
            ...snapshot.sound,
            registers: session.snapshot.tourcraft!.events.deliveredRegisters
          }
        }
      ]
    });
    checkpoint();
    menu.show('none');
    status.hidden = true;
    views.reset();
    draw(prepared);
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
    console: shellConsole.isOpen() ? 'open' : 'closed',
    layer: menu.layer(),
    opening: 'none'
  });
  const unlock = (): void => {
    if (audio.phase === 'locked') {
      void audio.unlock();
      audio.send({
        at: session.snapshot.tick / 50,
        commands: [
          {
            kind: 'reset',
            state: {
              ...session.snapshot.sound,
              registers: session.snapshot.tourcraft!.events.deliveredRegisters
            }
          }
        ]
      });
    }
  };
  window.addEventListener('pointerdown', unlock);
  const pointerMayAct = (): boolean => {
    const state = routerState();
    return (
      !state.chromeFocus &&
      state.console === 'closed' &&
      state.layer === 'none' &&
      ownership.mayAdvance()
    );
  };
  // The pointer Accommodation for the Carried Stack, its panels and the run mode (#599), shared
  // with Damocles's panel. Each is a Semantic Action a key already gives.
  const panel = content.panel;
  const panelControls = installPanelControls(
    document.getElementById('dion-panel-controls')!,
    recoveredPanelLayout({
      centre: panel.centre.box,
      inventory: panel.fields.inventoryName,
      runLamp: {
        rows: panel.fields.lamps.rows,
        x: panel.fields.lamps.x[2]!,
        y: panel.fields.lamps.y
      }
    }),
    {
      command: command => {
        if (command !== 'parameter') {
          act(CARD_ACTIONS[command]);
        }
      },
      mayAct: pointerMayAct,
      open: () => act(CARD_ACTIONS.open),
      rotate: direction => act(direction),
      toggleRunning: () => controls.toggleRunning()
    },
    [canvas.parentElement!]
  );
  drawPanelControls = (): void => {
    const { box } = snapshot.tourcraft!.head;
    const name = session.openItemName;
    panelControls.update({
      centre: {
        label: session.documentOpen
          ? `${name ?? 'Open panel'}. Read or activate item`
          : 'Mercenary III logo',
        open: session.documentOpen,
        parameter: false,
        resting: box.steps === 0 && box.from === null
      },
      head: {
        inventory: snapshot.tourcraft!.carry.label.trim(),
        opens: session.headOpens
      },
      running: session.running
    });
  };
  drawPanelControls();
  // A press on the drawn take candidate takes it, as `T` does (#756).
  canvas.parentElement!.addEventListener('click', event => {
    const state = routerState();
    const slot = session.snapshot.candidate?.slot;
    const target = (): boolean => {
      // The Enhanced view hits the candidate where it draws it, as Damocles's pointer does.
      const enhanced = viewPresentation?.targetAt(
        { x: event.clientX, y: event.clientY },
        slot,
        ENHANCED_HIT_SLOP
      );
      if (enhanced !== undefined) {
        return enhanced;
      }
      const pointer = canvasPointer(canvas, {
        x: event.clientX,
        y: event.clientY
      });
      return (
        pointer !== undefined &&
        dionTakeTargetAt(
          session.planFrame().description,
          slot,
          pointer.point,
          pointer.hitSlop
        )
      );
    };
    if (
      event.button !== 0 ||
      state.chromeFocus ||
      state.console !== 'closed' ||
      state.layer !== 'none' ||
      !ownership.mayAdvance() ||
      !target()
    ) {
      return;
    }
    act('take');
    event.preventDefault();
  });
  window.addEventListener('keydown', event => {
    unlock();
    switch (routeKey(routerState(), event)) {
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
        if (!ownership.mayAdvance()) {
          return;
        }
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

  const takeover = installSessionTakeoverChannel({
    mayPersist: ownership.mayPersist,
    name: DION_STORAGE.lock,
    onYield: () => {
      flush();
      ownership.release();
      handleOwnershipLost();
    }
  });
  chrome.takeOver.hidden = ownership.mayAdvance();
  chrome.takeOver.addEventListener('click', async () => {
    chrome.takeOver.disabled = true;
    const cooperative = await takeover.requestCooperativeTakeover();
    let outcome = cooperative
      ? await ownership.claim()
      : await ownership.takeOver();
    if (outcome.kind === 'blocked') {
      outcome = await ownership.takeOver();
    }
    if (outcome.kind === 'owned') {
      release();
      const read = readTourcraftSession(storage, promoted);
      if (read.reason !== null) {
        notice(`Could not resume: ${read.reason}`);
        chrome.takeOver.disabled = false;
        return;
      }
      const prepared = prepareTourcraftFrame(read.session);
      session = read.session;
      snapshot = session.snapshot;
      protectResume = read.reason !== null;
      chrome.takeOver.hidden = true;
      status.hidden = true;
      menu.show(protectResume ? 'menu' : 'none');
      audio.send({
        at: snapshot.tick / 50,
        commands: [
          {
            kind: 'reset',
            state: {
              ...snapshot.sound,
              registers: session.snapshot.tourcraft!.events.deliveredRegisters
            }
          }
        ]
      });
      views.reset();
      draw(prepared);
    }
    chrome.takeOver.disabled = false;
  });
  window.addEventListener('pagehide', () => {
    flush();
    ownership.release();
    audio.suspend();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      location.reload();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flush();
      audio.suspend();
    }
  });
  draw(initialFrame);
  if (opened.reason !== null) {
    notice(
      `Could not resume: ${opened.reason}. New Game or Load starts a session.`
    );
  } else if (!ownership.mayAdvance()) {
    menu.show('ownership');
    notice('This Mercenary III session is active in another tab.');
  }
  checkpoint();
  canvas.dataset['state'] = 'ready';
  const frame = (timestamp: number): void => {
    if (!running) {
      return;
    }
    try {
      // The pads are read before the steps, as a key event arrives before them, and Start is
      // Escape from play, as it is in Damocles: the pad has no other way to the System Menu.
      // A pad acts in play only while a key would.
      if (
        controls.pollPads(
          connectedPads(navigator),
          ownership.mayAdvance() ? routePad(routerState()) : 'held'
        )
      ) {
        menu.show('menu');
      }
      const steps = clock.frame(timestamp, seconds => {
        if (
          menu.layer() === 'none' &&
          ownership.mayAdvance() &&
          !protectResume &&
          !document.hidden
        ) {
          if (audio.suspended) {
            audio.resume();
            audio.send({
              at: session.snapshot.tick / 50,
              commands: [
                {
                  kind: 'reset',
                  state: {
                    ...session.snapshot.sound,
                    registers:
                      session.snapshot.tourcraft!.events.deliveredRegisters
                  }
                }
              ]
            });
          }
          session.intent = shellConsole.isOpen() ? IDLE : controls.intent;
          session.fire(!shellConsole.isOpen() && controls.firing);
          const message = session.snapshot.narrative.message.serial;
          snapshot = session.advance(seconds);
          // Every message the bar starts to show is logged to the Shell Console, as Damocles's are.
          if (snapshot.narrative.message.serial !== message) {
            shellConsole.write(
              dionMessageTranscript(snapshot.narrative.message.text)
            );
          }
          const notes = session.drainNotes();
          if (notes.length > 0) {
            // Unported effects take their input and do nothing (ADR 0064); say which.
            shellConsole.write(notes.map(note => `not ported yet: ${note}`));
          }
          session.deliverEvents(event => {
            if (audio.phase !== 'unlocked') {
              // Locked/failed output accepts silence. Unlock resets from this
              // delivered image; it must not replay minutes of old PSG writes.
              return true;
            }
            audio.send({
              at: event.tick / 50,
              commands: [
                {
                  kind: 'registers',
                  registers: event.writes.map(
                    w => [w.register, w.value] as const
                  )
                }
              ]
            });
            return true;
          });
          snapshot = session.snapshot;
          if (ownership.mayPersist()) {
            resume.dirty();
            resume.checkpoint();
          }
        }
      });
      if (menu.layer() !== 'none') {
        flush();
        audio.suspend();
      }
      if (steps > 0) {
        draw();
      } else if (views.blending) {
        drawView();
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
