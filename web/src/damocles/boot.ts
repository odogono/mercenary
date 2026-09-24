import '../shell/damoclesPanelElement.ts';

import { IDLE } from '../gameCore/index.ts';
import { DEFAULT_CAST_SHADOWS } from '../settings/index.ts';
import { installShellChrome } from '../shell/chrome.ts';
import { FixedStepClock } from '../shell/clock.ts';
import type { ConsoleParseContext } from '../shell/console.ts';
import { installConsole } from '../shell/consoleView.ts';
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
import {
  DAMOCLES_CONSOLE_BANNER,
  executeDamoclesConsoleCommand,
  type DamoclesConsoleHost
} from './console.ts';
import { planErisFrame } from './frame.ts';
import { erisLighting } from './lighting.ts';
import { damoclesPanelViewModel } from './panel.ts';
import { damoclesTakeTargetAt } from './pointer.ts';
import { ErisRenderer } from './renderer.ts';
import {
  createDamoclesResumePersistence,
  readDamoclesResume
} from './resume.ts';
import {
  damoclesSaveIdentity,
  damoclesWhere,
  type DamoclesSaveSnapshot
} from './save.ts';
import { createDamoclesSavePersistence } from './saves.ts';
import { DamoclesSession } from './session.ts';
import { damoclesTitle } from './title.ts';

/// The Damocles Gameplay Session's document (ADR 0043, ADR 0044).
///
/// Loads none of Targ's Data Payload. System Menu, Saves and Shell Console are the shared
/// Browser Shell host; Arrival, Departure, Benson and sound stay in Targ's boot.

const surface = document.getElementById('game-surface')!;
const chrome = installShellChrome(surface, {
  atlasLabel: 'Gamma Atlas',
  catalogueLabel: 'Damocles catalogue',
  menuTitle: 'DAMOCLES'
});
const status = document.getElementById('status')!;
const failure = document.getElementById('failure')!;
const canvas = document.getElementById('frame') as HTMLCanvasElement;
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

const fail = (error: unknown): void => {
  if (!running) {
    return;
  }
  running = false;
  if (animation !== undefined) {
    cancelAnimationFrame(animation);
  }
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
  const [content] = await Promise.all([
    damoclesTitle.load(requiredJson),
    loadTypography()
  ]);
  applyTypeface(document.documentElement, readTypefacePreference(storage));
  panelRoot.dataset['rendition'] = 'damocles';
  const identity = damoclesSaveIdentity(
    content.catalogue,
    content.presentationSha256
  );
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
      ? readDamoclesResume(storage, identity, {
          catalogue: content.catalogue,
          poses: content.poses,
          strings: content.strings
        })
      : ({ kind: 'empty' } as const);

  const preferences = createPreferences({
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

  /// Damocles has no sound presenter in this slice, so a drained Sound Cue request leaves no
  /// trace a browser pass could read. Tallying the cues as they are drained is how #301 can
  /// verify from outside the session that one successful take asks for exactly one sound.
  const cueTally = new Map<string, number>();
  const drainEffects = (): void => {
    for (const effect of session.drainEffects()) {
      if (effect.type === 'sound-request') {
        cueTally.set(effect.cue, (cueTally.get(effect.cue) ?? 0) + 1);
      }
    }
  };

  const controls = new BrowserControlProfile({
    drop: () => commitAction(() => session.drop()),
    fire: () => undefined,
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
    page: () => undefined,
    press: () => undefined,
    reach: action => {
      if (action === 'take') {
        commitAction(() => session.take());
      } else if (action === 'board') {
        commitAction(() => session.board());
      }
    },
    // Targ's single lift key. A Damocles Lift is ridden by the Floor keys, through `liftKey`.
    rideLift: () => undefined,
    shutThrottle: () => undefined,
    skipMessage: () => undefined,
    throttleNotchValue: () => undefined,
    throttleStep: () => undefined
  });
  const clock = new FixedStepClock();
  const release = (): void => {
    controls.releaseAll();
    clock.reset();
    session.intent = IDLE;
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
    action();
    drainEffects();
    snapshot = session.snapshot;
    resumePersistence.dirty();
    resumePersistence.checkpoint(true);
    publish();
  };
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

  const menu = installSystemMenu({
    onLayer: layer => {
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
    session = new DamoclesSession(content, restore);
    snapshot = session.snapshot;
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

  type DamoclesConsoleDeps = ConsoleParseContext & DamoclesConsoleHost;
  const consoleHost: DamoclesConsoleDeps = {
    cellsPerAxis: () => content.doc.grid.cellsPerAxis,
    objectActions: () => 'selected',
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
      const recovered = readDamoclesResume(storage, identity, {
        catalogue: content.catalogue,
        poses: content.poses,
        strings: content.strings
      });
      notices.dismiss();
      if (recovered.kind === 'restored') {
        await DamoclesSession.prepare(content, recovered.snapshot);
        replaceSession(recovered.snapshot);
        notices.resumed();
      } else {
        replaceSession();
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
    commitAction(() => session.take());
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
      save.source === 'shell'
        ? save.text
        : resume.source === 'shell'
          ? resume.text
          : '';
    if (text === '') {
      status.hidden = true;
      return;
    }
    status.hidden = false;
    status.textContent = text;
  };

  const expose = (
    triangles: number,
    drawnPlacements: readonly string[]
  ): void => {
    const root = canvas.dataset;
    root['cell'] = `${snapshot.cell.x}-${snapshot.cell.z}`;
    // Session time, so a browser pass can measure a speed per session second rather than per
    // wall-clock second, which a loaded browser stretches.
    root['elapsed'] = String(snapshot.elapsed);
    root['x'] = String(snapshot.pose.position.x);
    root['y'] = String(snapshot.pose.position.y);
    root['z'] = String(snapshot.pose.position.z);
    root['heading'] = String(snapshot.pose.heading);
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
    root['triangles'] = String(triangles);
    // Every structure and object the frame drew, repeats kept, so a browser pass can tell an
    // occupied craft is not drawn and a left one is drawn once rather than inferring it from a
    // triangle count that also moves with the view.
    root['drawn'] = drawnPlacements.join(' ');
    root['unresolved'] = String(snapshot.surface.unresolvedCount);
  };
  const draw = (): void => {
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
      slot => session.carriesSlot(slot)
    );
    const { castShadows, presentationPreset } = preferences.current();
    const shadowEdge = castShadows ?? DEFAULT_CAST_SHADOWS;
    // A Cast Shadow is Enhanced presentation only, and the player may turn its edge off.
    const shadows =
      content.doc.lighting.shadows &&
      (presentationPreset === undefined || presentationPreset === 'enhanced') &&
      shadowEdge !== 'off';
    renderer.render(
      plan,
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
    expose(plan.triangleCount, plan.drawnPlacements);
    paintNotices();
  };
  publish = draw;
  draw();
  canvas.dataset['state'] = 'ready';
  const frame = (timestamp: number): void => {
    if (!running) {
      return;
    }
    try {
      const steps = clock.frame(timestamp, seconds => {
        if (menu.layer() === 'none' && ownership.mayAdvance()) {
          session.intent = controls.intent;
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
      resumePersistence.checkpoint(false);
      animation = requestAnimationFrame(frame);
    } catch (error) {
      fail(error);
    }
  };
  animation = requestAnimationFrame(frame);
} catch (error) {
  fail(error);
}
