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
import {
  createSessionOwnership,
  installSessionTakeoverChannel
} from '../shell/ownership.ts';
import { routeKey, type RouterState } from '../shell/router.ts';
import { installSaveChooser } from '../shell/saveChooser.ts';
import { installSuspensionHandlers } from '../shell/suspension.ts';
import type { PayloadDocument } from '../shell/title.ts';
import { SoundLifecycle } from '../sound/lifecycle.ts';
import { AudioWorkletTransport } from '../sound/transport.ts';
import { frameRgba, planDionFrame } from './frame.ts';
import { installDionPresentation } from './framePresentation.ts';
import { PANEL_TOP, drawDionPanel, panelRgba } from './panel.ts';
import {
  createDionResumePersistence,
  dionWhere,
  readDionResume
} from './resume.ts';
import {
  DION_STORAGE,
  createDionSavePersistence,
  dionRecordIdentity
} from './save.ts';
import { DionSession, dionFrameState, type DionAction } from './session.ts';
import type { DionSoundCommand } from './soundChip.ts';
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

/// A title-local note within the shared Browser Shell page.
const pageNote = (page: HTMLElement, text: string): void => {
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
  let handleOwnershipLost = (): void => {};
  const ownership = createSessionOwnership({
    locks: navigator.locks,
    name: DION_STORAGE.lock,
    onLost: () => handleOwnershipLost()
  });
  await ownership.claim();
  const opened = readDionResume(storage, content);
  let protectResume = opened.reason !== null;
  let session = opened.session;
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

  // Held keys reach the Movement Intent through the shared Control Profile, and the session
  // walks it on the shared foot step and region clamp.
  const controls = new BrowserControlProfile({
    drop: () => {},
    leaveCraft: () => session.press('leave'),
    occupancy: () => ({ kind: 'onFoot' }),
    reach: command => {
      if (command === 'board') {
        session.press('board');
      }
    },
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
  handleOwnershipLost = () => {
    release();
    audio.suspend();
    chrome.takeOver.hidden = false;
    menu.show('ownership');
    notice('This Mercenary III session is active in another tab.');
  };
  // This rendition has its recovered presentation; hide unsupported style choices.
  for (const row of chrome.pages.settings.querySelectorAll('.setting-row')) {
    if (!row.querySelector('#audio-volume, [data-setting="sky"]')) {
      row.remove();
    }
  }
  viewPresentation = installDionPresentation({
    notice,
    onRecovered: () => {
      if (status.textContent?.startsWith('Enhanced unavailable.')) {
        status.hidden = true;
      }
    },
    page: chrome.pages.settings,
    redraw: () => draw(),
    screen: canvas,
    storage
  });
  const mute =
    chrome.pages.settings.querySelector<HTMLButtonElement>('#audio-mute')!;
  mute.addEventListener('click', () => {
    const muted = mute.getAttribute('aria-pressed') !== 'true';
    mute.setAttribute('aria-pressed', String(muted));
    mute.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    audio.setMuted(muted);
  });
  const volume =
    chrome.pages.settings.querySelector<HTMLInputElement>('#audio-volume')!;
  volume.addEventListener('input', () => {
    audio.setVolume(Number(volume.value));
    chrome.pages.settings.querySelector<HTMLOutputElement>(
      '#audio-volume-value'
    )!.value = volume.value;
  });
  pageNote(
    chrome.pages.controls,
    'ARROWS: walk / turn · ENTER: activate TAXICARD · *: call / Start · + / −: destination · B: board · L: leave at dwell'
  );
  const resume = createDionResumePersistence({
    content,
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
  const persistence = createDionSavePersistence({
    capture: () => {
      if (!ownership.mayPersist()) {
        throw new Error('This session is active in another tab');
      }
      return { snapshot: session.captureResume(), where: dionWhere(session) };
    },
    content,
    identity: dionRecordIdentity(content),
    release,
    restore: record => {
      if (!ownership.mayPersist()) {
        throw new Error('This session is active in another tab');
      }
      const candidate = new DionSession(content, record);
      session = candidate;
      snapshot = session.snapshot;
      protectResume = false;
      audio.send({
        at: snapshot.tick / 50,
        commands: [{ kind: 'reset', state: snapshot.sound }]
      });
      checkpoint();
      menu.show('none');
      draw();
    },
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
    viewPresentation?.render(planned.description);
    const root = canvas.dataset;
    root['cell'] = String(snapshot.cell);
    root['region'] = String(snapshot.region);
    root['x'] = String(snapshot.eye[0]);
    root['z'] = String(snapshot.eye[2]);
    root['heading'] = String(snapshot.heading);
    root['tick'] = String(snapshot.tick);
    root['frame'] = String(snapshot.frame);
    root['clock'] = String(snapshot.clock.seconds);
    root['polygons'] = String(planned.stats.polygons);
    root['lines'] = String(planned.stats.lines);
    root['models'] = planned.stats.models.join(' ');
    root['gaps'] = planned.stats.gaps.join('; ');
    root['content'] = content.contentSha256;
    root['passenger'] = String(snapshot.taxi.passenger);
    root['counter'] = String(snapshot.taxi.counter);
    root['destination'] = String(snapshot.taxi.destination);
    root['start'] = String(snapshot.taxi.start);
    root['call'] = String(snapshot.taxi.call);
    root['reveal'] = String(snapshot.reveal);
    root['day'] = String(snapshot.day);
    root['message'] = snapshot.narrative.message.text;
    root['scriptActive'] = String(snapshot.narrative.flags[6]);
  };

  const newGame = createNewGameAction(() => {
    release();
    if (!ownership.mayAdvance()) {
      notice('This session is active in another tab.');
      return;
    }
    protectResume = false;
    resume.clear();
    session = dionTitle.create(content) as DionSession;
    snapshot = session.snapshot;
    audio.send({ at: 0, commands: [{ kind: 'reset', state: snapshot.sound }] });
    checkpoint();
    menu.show('none');
    status.hidden = true;
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
  const actionFor = (event: KeyboardEvent): DionAction | undefined => {
    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      return 'activate';
    }
    if (event.code === 'NumpadMultiply' || event.key === '*') {
      return 'star';
    }
    if (event.code === 'NumpadAdd' || event.key === '+') {
      return 'plus';
    }
    if (event.code === 'NumpadSubtract' || event.key === '-') {
      return 'minus';
    }
    if (event.code === 'KeyB') {
      return 'board';
    }
    if (event.code === 'KeyL') {
      return 'leave';
    }
    return undefined;
  };
  const unlock = (): void => {
    if (audio.phase === 'locked') {
      void audio.unlock();
      audio.send({
        at: session.snapshot.tick / 50,
        commands: [{ kind: 'reset', state: session.snapshot.sound }]
      });
    }
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', event => {
    unlock();
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
        if (!ownership.mayAdvance()) {
          return;
        }
        if (!event.repeat) {
          const action = actionFor(event);
          if (action !== undefined) {
            session.press(action);
            checkpoint();
            event.preventDefault();
            return;
          }
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
      const read = readDionResume(storage, content);
      session = read.session;
      snapshot = session.snapshot;
      protectResume = read.reason !== null;
      chrome.takeOver.hidden = true;
      status.hidden = true;
      menu.show(protectResume ? 'menu' : 'none');
      audio.send({
        at: snapshot.tick / 50,
        commands: [{ kind: 'reset', state: snapshot.sound }]
      });
      draw();
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
  draw();
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
              commands: [{ kind: 'reset', state: session.snapshot.sound }]
            });
          }
          session.intent = controls.intent;
          snapshot = session.advance(seconds);
          for (const event of session.drainSound()) {
            audio.send({
              at: event.at,
              commands: [{ kind: 'registers', registers: event.registers }]
            });
          }
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
