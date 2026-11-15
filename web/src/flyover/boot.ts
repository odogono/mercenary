import type { Atmosphere } from '../enhanced/atmosphere.ts';
import { fetchAssets, fetchReader, load } from '../payload/load.ts';
import { FrameRenderer } from '../rendering/renderer.ts';
import { loadSettings } from '../settings/index.ts';
import { sitePath } from '../shell/sitePath.ts';
import { fetchTargSystem } from '../sky/system.ts';
import { World } from '../world/index.ts';

import '../shell/damoclesPanelElement.ts';

import { installConsole } from '../shell/consoleView.ts';
import { assertBrowserDocument, type SystemId } from '../shell/documentPath.ts';
import { installPanel, installPanelScale } from '../shell/panelView.ts';
import { readTargPanelDocument } from '../shell/targPanelDocument.ts';
import { installTargPanel } from '../shell/targPanelView.ts';
import {
  advanceFlyoverCamera,
  bodyEntryPose,
  cappedFrameSeconds,
  nearestFlyoverBody,
  parseBodyQuery,
  type FlyoverCameraState,
  type NearestFlyoverBody
} from './camera.ts';
import {
  FLYOVER_CONSOLE_BANNER,
  executeFlyoverConsoleCommand,
  parseFlyoverConsoleCommand,
  type FlyoverConsoleCommand,
  type FlyoverConsoleHost
} from './console.ts';
import {
  flyoverInspectionLine,
  flyoverPanelViewModel,
  targFlyoverPanelViewModel
} from './dashboard.ts';
import {
  readFlyoverPresentation,
  readGammaSystem,
  type TargPresentationDocument
} from './documents.ts';
import { globeIslandsOf } from './globe.ts';
import { FlyoverKeyboard } from './input.ts';
import {
  flyoverStrokesOf,
  installFlyoverMenu,
  targFlyoverMenuRows,
  type FlyoverStrokeChoices
} from './menu.ts';
import { flyoverRangeReading, type FlyoverRangeReading } from './reading.ts';
import { FlyoverRenderer } from './renderer.ts';
import { resetFlyover } from './runtime.ts';
import { planFlyoverSurfaceFrame, targSurfaceView } from './surfacePass.ts';
import {
  composeGammaSystem,
  composeTargSystem,
  type FlyoverSystem
} from './system.ts';

const TARG_BODY_IDS = ['targ', 'sun', 'inner-moon', 'outer-moon'] as const;

const title = document.getElementById('title')!;
const status = document.getElementById('status')!;
const notice = document.getElementById('notice')!;
const failure = document.getElementById('failure')!;
const canvas = document.getElementById('flyover') as HTMLCanvasElement;
const surfaceCanvas = document.getElementById(
  'flyover-surface'
) as HTMLCanvasElement;
const dashboard = document.getElementById('flyover-dashboard')!;
const panelRoot = document.getElementById('panel-damocles')!;
const panelScale = document.getElementById('flyover-panel-scale')!;
const inspection = document.getElementById('flyover-inspection')!;
const targPanelRoot = document.getElementById('flyover-targ-panel')!;
const menuElements = {
  leave: document.getElementById('menu-leave') as HTMLButtonElement,
  resume: document.getElementById('menu-resume') as HTMLButtonElement,
  root: document.getElementById('flyover-menu')!,
  rows: document.getElementById('menu-rows')!
};
const consoleElements = {
  input: document.getElementById('console-input') as HTMLInputElement,
  log: document.getElementById('console-log')!,
  surface: document.querySelector('main')!
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
  root: panelRoot
};

const requiredText = async (pathname: string): Promise<string> => {
  const response = await fetch(pathname);
  if (!response.ok) {
    throw new Error(`${pathname} answered HTTP ${response.status}`);
  }
  return await response.text();
};

const requiredJson = async (pathname: string): Promise<unknown> => {
  const response = await fetch(pathname);
  if (!response.ok) {
    throw new Error(`${pathname} answered HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(
      `${pathname} is not JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/// What the Targ surface frame is drawn from: the city as the Data Payload places it, TARG's
/// Atmosphere; its sky is the Targ System's own Orrery (ADR 0094).
let targSurface:
  | {
      readonly atmosphere: Atmosphere | null;
      readonly world: World;
    }
  | undefined;

const systemFor = async (systemId: SystemId): Promise<FlyoverSystem> => {
  const presentationPath = sitePath(`/flyover/${systemId}.json`);
  if (systemId === 'targ') {
    const [rawPresentation, settingsText, targSystem, bundle] =
      await Promise.all([
        requiredJson(presentationPath),
        requiredText(sitePath('/settings.json')),
        fetchTargSystem(),
        load(
          fetchReader(new URL(sitePath('/payload/'), location.href).href),
          fetchAssets(
            new URL(sitePath('/assets/targ.json'), location.href).href
          )
        )
      ]);
    let presentation: TargPresentationDocument;
    try {
      presentation = readFlyoverPresentation(
        rawPresentation,
        'targ',
        TARG_BODY_IDS
      );
    } catch (error) {
      throw new Error(
        `${presentationPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const sky = loadSettings(settingsText).presentation.sky;
    targSurface = {
      atmosphere:
        targSystem.bodies.find(body => body.id === targSystem.rotatingBodyId)
          ?.atmosphere ?? null,
      world: new World(bundle)
    };
    return composeTargSystem(targSystem, presentation, sky);
  }
  const authorityPath = sitePath('/payload/damocles/system.json');
  const rawAuthority = await requiredJson(authorityPath);
  let authority: ReturnType<typeof readGammaSystem>;
  try {
    authority = readGammaSystem(rawAuthority);
  } catch (error) {
    throw new Error(
      `${authorityPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const rawPresentation = await requiredJson(presentationPath);
  try {
    const presentation = readFlyoverPresentation(
      rawPresentation,
      'gamma',
      authority.bodies
        .filter(body => body.positionKind === undefined)
        .map(body => body.id)
    );
    return composeGammaSystem(authority, presentation);
  } catch (error) {
    throw new Error(
      `${presentationPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/// The System Menu's stroke choices, kept until reload and never stored.
let strokeChoices: FlyoverStrokeChoices = {};
let animation: number | undefined;
let keyboard: FlyoverKeyboard | undefined;
let running = true;

const fail = (error: unknown): void => {
  if (!running) {
    return;
  }
  running = false;
  if (animation !== undefined) {
    cancelAnimationFrame(animation);
  }
  keyboard?.dispose();
  canvas.hidden = true;
  dashboard.hidden = true;
  status.hidden = true;
  notice.hidden = true;
  failure.hidden = false;
  failure.textContent = error instanceof Error ? error.message : String(error);
};

try {
  const route = assertBrowserDocument(location.pathname, 'flyover');
  const system = await systemFor(route.systemId);
  // Reveal before measuring and drawing. This all happens in one task, so a failed
  // constructor is hidden again before the browser can paint a partial Flyover.
  canvas.hidden = false;
  const viewport = () => ({
    height: Math.max(1, canvas.clientHeight),
    width: Math.max(1, canvas.clientWidth)
  });
  const reset = resetFlyover(system, viewport());
  const initialBodies = reset.bodies;
  document.documentElement.dataset['bodyCount'] = String(initialBodies.length);
  title.textContent = `${system.systemId.toUpperCase()} Flyover`;
  document.documentElement.dataset['system'] = system.systemId;
  const query = parseBodyQuery(location.search, initialBodies);
  if ('notice' in query) {
    notice.textContent = query.notice;
    notice.hidden = false;
  }
  let camera: FlyoverCameraState = {
    ...reset.camera,
    ...('body' in query ? { pose: bodyEntryPose(query.body) } : {})
  };
  let outwardDirections = {};
  const renderer = new FlyoverRenderer(
    canvas,
    system.systemId === 'targ'
      ? { ...system, globe: globeIslandsOf(system) }
      : system,
    () =>
      fail(
        new Error(
          'The graphics context was lost. Reload the page to restore the Flyover.'
        )
      )
  );
  dashboard.hidden = false;
  installPanelScale(dashboard, panelScale, (target, onResize) => {
    new ResizeObserver(onResize).observe(target);
  });
  // Targ is drawn on the game's own Targ panel, Gamma on the Damocles panel (ADR 0094).
  const targPanel =
    system.systemId === 'targ'
      ? installTargPanel(
          document.getElementById(
            'flyover-targ-panel-canvas'
          ) as HTMLCanvasElement,
          readTargPanelDocument(
            JSON.parse(
              await requiredText(sitePath('/payload/targ-st/panel.json'))
            )
          )
        )
      : undefined;
  panelRoot.hidden = targPanel !== undefined;
  targPanelRoot.hidden = targPanel === undefined;
  inspection.hidden = targPanel === undefined;
  const targFields =
    targPanelRoot.querySelectorAll<HTMLElement>('[data-field]');
  const panel = installPanel(panelElements);
  const elapsedNow = (): number =>
    system.systemId === 'targ' ? system.clock.elapsedSeconds() : 0;
  // The Shell Console (#188). It does not pause: the Flyover clock runs while it is open, and
  // opening it lets go of any Camera control held as it opened.
  const shellConsole = installConsole<
    FlyoverConsoleHost,
    FlyoverConsoleCommand
  >(
    consoleElements,
    {
      bodies: () => system.bodiesAt(elapsedNow()),
      camera: () => camera,
      reset: () => {
        camera = resetFlyover(system, viewport()).camera;
        outwardDirections = {};
      },
      setCamera: next => {
        camera = next;
        outwardDirections = {};
      },
      system
    },
    () => keyboard?.clear(),
    {
      banner: FLYOVER_CONSOLE_BANNER,
      execute: executeFlyoverConsoleCommand,
      parse: parseFlyoverConsoleCommand
    }
  );
  // The System Menu (#188) pauses the Camera and the Targ clock while it is open.
  const menu = installFlyoverMenu(
    menuElements,
    system.systemId === 'targ'
      ? targFlyoverMenuRows(system.clock, {
          current: () => strokeChoices,
          set: choices => {
            strokeChoices = choices;
          }
        })
      : [],
    {
      onClose: () => {
        if (system.systemId === 'targ') {
          system.clock.resume();
        }
      },
      // Leaving replaces this history entry, so Back does not return to the Flyover.
      onLeave: () => {
        location.replace(sitePath('/'));
      },
      onOpen: () => {
        keyboard?.clear();
        if (system.systemId === 'targ') {
          system.clock.pause();
        }
      }
    }
  );
  window.addEventListener(
    'keydown',
    event => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.code === 'Backquote') {
        event.preventDefault();
        if (!event.repeat) {
          shellConsole.toggle();
        }
      } else if (event.key === 'Escape' && !event.repeat) {
        // Escape closes what is open, the console first, and otherwise opens the menu.
        event.preventDefault();
        if (shellConsole.isOpen()) {
          shellConsole.close();
        } else if (menu.isOpen()) {
          menu.close();
        } else {
          menu.open();
        }
      }
    },
    { capture: true }
  );
  keyboard = new FlyoverKeyboard(
    () => camera.speedNotch,
    speedNotch => {
      camera = { ...camera, speedNotch };
    },
    () => shellConsole.isOpen() || menu.isOpen()
  );
  const expose = (
    bodies: ReturnType<typeof system.bodiesAt>
  ): { nearest: NearestFlyoverBody; reading: FlyoverRangeReading } => {
    const nearest = nearestFlyoverBody(
      camera.pose.position,
      bodies,
      outwardDirections
    );
    outwardDirections = nearest.outwardDirections;
    const reading = flyoverRangeReading(system, nearest);
    const values = {
      camera,
      nearestBody: nearest.body,
      reading,
      speedBounds: system.cameraSpeed
    };
    if (targPanel === undefined) {
      panel.draw(
        flyoverPanelViewModel({ ...values, systemId: system.systemId })
      );
    } else {
      const model = targFlyoverPanelViewModel(values);
      targPanel.draw(model);
      for (const field of targFields) {
        const text = String(model[field.dataset['field'] as 'message']);
        if (field.textContent !== text) {
          field.textContent = text;
        }
      }
      const line = flyoverInspectionLine(values);
      if (inspection.textContent !== line) {
        inspection.textContent = line;
      }
    }
    document.documentElement.dataset['nearestBody'] = nearest.body.id;
    document.documentElement.dataset['range'] = reading.handoff.range;
    document.documentElement.dataset['surfaceWeight'] = String(
      reading.handoff.surfaceWeight
    );
    document.documentElement.dataset['speedNotch'] = String(camera.speedNotch);
    document.documentElement.dataset['cameraX'] = String(
      camera.pose.position.x
    );
    document.documentElement.dataset['cameraY'] = String(
      camera.pose.position.y
    );
    document.documentElement.dataset['cameraZ'] = String(
      camera.pose.position.z
    );
    document.documentElement.dataset['heading'] = String(camera.pose.heading);
    document.documentElement.dataset['pitch'] = String(camera.pose.pitch);
    return { nearest, reading };
  };
  // The Range Handoff (ADR 0094): the surface frame is drawn over the Globe at its weight, so
  // the two always sum to one, and the Globe is not drawn once the surface covers it.
  let surfaceRenderer: FrameRenderer | undefined;
  const draw = (bodies: ReturnType<typeof system.bodiesAt>): void => {
    const { nearest, reading } = expose(bodies);
    const weight = reading.handoff.surfaceWeight;
    if (weight < 1) {
      renderer.draw(bodies, camera.pose);
    }
    if (
      weight === 0 ||
      system.systemId !== 'targ' ||
      targSurface === undefined
    ) {
      surfaceCanvas.hidden = true;
      return;
    }
    surfaceCanvas.hidden = false;
    surfaceCanvas.style.opacity = String(weight);
    surfaceRenderer ??= new FrameRenderer(
      surfaceCanvas,
      { cullBackFaces: true },
      () =>
        fail(
          new Error(
            'The graphics context was lost. Reload the page to restore the Flyover.'
          )
        )
    );
    surfaceRenderer.resize();
    surfaceRenderer.render(
      planFlyoverSurfaceFrame({
        ...targSurface,
        elapsed: system.clock.elapsedSeconds(),
        orrery: system.orrery(),
        outputHeight: surfaceRenderer.outputHeight,
        size: { height: surfaceCanvas.height, width: surfaceCanvas.width },
        strokes: flyoverStrokesOf(strokeChoices),
        system,
        view: targSurfaceView(system, camera.pose, nearest)
      })
    );
  };
  draw(initialBodies);
  status.hidden = true;
  document.documentElement.dataset['flyoverReady'] = 'true';
  let previousTimestamp: number | undefined;
  const frame = (timestamp: number): void => {
    if (!running) {
      return;
    }
    try {
      const seconds =
        previousTimestamp === undefined
          ? 0
          : cappedFrameSeconds((timestamp - previousTimestamp) / 1000);
      previousTimestamp = timestamp;
      if (!menu.isOpen()) {
        camera = advanceFlyoverCamera(
          camera,
          keyboard!.controls(),
          seconds,
          system.cameraSpeed
        );
      }
      const bodies = system.bodiesAt(elapsedNow());
      draw(bodies);
      animation = requestAnimationFrame(frame);
    } catch (error) {
      fail(error);
    }
  };
  animation = requestAnimationFrame(frame);
} catch (error) {
  fail(error);
}
